import { JSDOM } from "jsdom";
import { mkdir, readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { readResolved } from "translation-core/catalog-files";
import { translatedValue } from "translation-core/fixed-translations";
import { pageDictionaryNames } from "translation-core/page-dictionaries";
import { isContextFragment } from "translation-core/ui-review-groups";
import { atomicFile } from "./source-store.ts";
import type { OperationContext, OperationResult } from "./types.ts";

export async function auditUiContexts(
  context: OperationContext,
): Promise<OperationResult> {
  const { dataRoot, repositoryRoot } = context;
  const logs: string[] = [];
  const log = (message: string) => {
    logs.push(message);
    context.progress?.({ id: "summary", status: "passed", message });
  };
  const reportRoot = join(dataRoot, "reports");
  await mkdir(reportRoot, { recursive: true });
  const entries = (
    await Promise.all(
      (await readdir(join(repositoryRoot, "translations/ko")))
        .filter((f) => f.endsWith(".json"))
        .sort()
        .map(async (file) =>
          (await readResolved(file, repositoryRoot)).translations.map(
            (entry: any, index: number) => ({
              ...entry,
              file,
              index,
              contexts: [] as { text: string; page: string }[],
            }),
          ),
        ),
    )
  ).flat();
  const groups = new Map<string, typeof entries>();
  for (const entry of entries)
    groups.set(entry.source, [...(groups.get(entry.source) ?? []), entry]);
  const fragments = entries.filter((e) => isContextFragment(e.source));

  for (const page of (await readdir(join(dataRoot, "pages"))).filter((f) =>
    f.endsWith(".html"),
  )) {
    context.signal?.throwIfAborted();
    context.progress?.({
      id: page,
      status: "passed",
      message: `Checking ${page}`,
    });
    const html = await readFile(join(dataRoot, "pages", page), "utf8");
    if (!fragments.some((e) => html.includes(e.source))) continue;
    const dom = new JSDOM(html);
    const canonical = dom.window.document
      .querySelector('meta[property="og:url"]')
      ?.getAttribute("content");
    const active = canonical
      ? pageDictionaryNames(new URL(canonical).pathname).map(
          (name) => `${name}.json`,
        )
      : undefined;
    for (const entry of fragments.filter(
      (e) => !active || active.includes(e.file),
    ))
      for (const el of dom.window.document.querySelectorAll(entry.selector)) {
        if (entry.attribute) continue;
        for (const node of el.childNodes) {
          if (
            node.nodeType !== 3 ||
            translatedValue(node.nodeValue ?? "", entry) === undefined
          )
            continue;
          const text = (el.textContent ?? "").replace(/\s+/gu, " ").trim();
          if (!entry.contexts.some((c: any) => c.text === text))
            entry.contexts.push({ text, page });
        }
      }
    dom.window.close();
  }
  const duplicates = [...groups]
    .filter(([, items]) => items.length > 1)
    .map(([source, items]) => ({
      source,
      items,
      conflictingTargets: new Set(items.map((e) => e.target)).size > 1,
      contextSensitive: fragments.some((e) => e.source === source),
    }));
  await atomicFile(
    join(reportRoot, "ui-context-audit.json"),
    JSON.stringify({ total: entries.length, duplicates, fragments }, null, 2),
  );
  const cell = (s: string) => s.replace(/\|/gu, "\\|").replace(/\s+/gu, " ");
  const lines = [
    "# UI 공통 문구 사용처·문맥 점검",
    "",
    `전체 ${entries.length}개 · 여러 사용처의 원문 ${duplicates.length}종 · 문맥 의존 후보 ${fragments.length}개`,
    "",
    "## 문맥 의존 조각",
    "",
    "문맥 의존 조각은 사용 문장을 함께 점검합니다. 같은 의미는 하나의 문구 정의를 참조하며, 다른 의미만 별도 정의를 사용합니다.",
    "",
  ];
  for (const e of fragments) {
    lines.push(
      `### ${e.file} · ${e.index + 1}: ${e.source}`,
      "",
      `현재 번역: ${e.target}`,
      "",
      ...e.contexts.map((c: any) => `- ${c.page}: ${c.text}`),
      "",
    );
  }
  lines.push(
    "## 여러 사용처에서 참조하는 원문",
    "",
    "| 원문 | 현재 번역 및 위치 | 구분 |",
    "| --- | --- | --- |",
  );
  for (const g of duplicates)
    lines.push(
      `| ${cell(g.source)} | ${g.items.map((e) => `${e.file}:${e.index + 1} → ${cell(e.target)}`).join(" / ")} | ${g.contextSensitive ? "문맥별 분리 필요" : g.conflictingTargets ? "보존된 후보 검수 필요" : "단일 정의 참조"} |`,
    );
  await atomicFile(
    join(reportRoot, "ui-context-audit.md"),
    lines.join("\n") + "\n",
  );
  log(
    JSON.stringify({
      total: entries.length,
      duplicateSources: duplicates.length,
      conflicts: duplicates.filter((g) => g.conflictingTargets).length,
      fragments: fragments.length,
    }),
  );

  const report = join(reportRoot, "ui-context-audit.json");
  return {
    operation: "audit-ui-contexts",
    report,
    items: [
      {
        id: "summary",
        status: "passed",
        message: logs.join("\n"),
        details: JSON.parse(await readFile(report, "utf8")),
      },
      ...fragments.map((entry) => ({
        id: entry.file,
        status: "review-required" as const,
        message: `Inspect phrase in context: ${entry.source}`,
        location: { dictionary: entry.file, index: entry.index },
        details: entry.contexts,
      })),
    ],
  };
}
