import { JSDOM } from "jsdom";
import { mkdir, readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { readResolved } from "translation-core/catalog-files";
import { translatedValue } from "translation-core/fixed-translations";
import { atomicFile } from "./source-store.ts";
import type { OperationContext, OperationResult } from "./types.ts";

export async function auditUiPages(
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
        .map(async (file) => {
          const dictionary = await readResolved(file, repositoryRoot);
          return dictionary.translations.map((entry, index) => ({
            file,
            index,
            ...entry,
            pages: [] as string[],
          }));
        }),
    )
  ).flat();
  const pages = (await readdir(join(dataRoot, "pages")))
    .filter((f) => f.endsWith(".html"))
    .sort();
  for (const page of pages) {
    context.signal?.throwIfAborted();
    context.progress?.({
      id: page,
      status: "passed",
      message: `Checking ${page}`,
    });
    const html = await readFile(join(dataRoot, "pages", page), "utf8");
    const dom = new JSDOM(html);
    const doc = dom.window.document;
    for (const entry of entries) {
      if (entry.pages.length) continue;
      const keyword = [...entry.source.matchAll(/[ぁ-んァ-ヶ一-龠ー]{2,}/gu)]
        .map((m) => m[0])
        .sort((a, b) => b.length - a.length)[0];
      if (keyword && !html.includes(keyword)) continue;
      const matched = [...doc.querySelectorAll(entry.selector)].some((el) => {
        if (el.closest("[hidden], script, style, template")) return false;
        const values = entry.attribute
          ? [el.getAttribute(entry.attribute)]
          : [...el.childNodes]
              .filter((n) => n.nodeType === 3)
              .map((n) => n.nodeValue);
        return values.some(
          (value) =>
            value !== null && translatedValue(value, entry) !== undefined,
        );
      });
      if (matched) entry.pages.push(page);
    }
    dom.window.close();
  }
  const missing = entries.filter((e) => !e.pages.length);
  await atomicFile(
    join(reportRoot, "ui-page-coverage.json"),
    JSON.stringify(
      {
        total: entries.length,
        matched: entries.length - missing.length,
        pages: pages.length,
        entries,
      },
      null,
      2,
    ),
  );
  log(
    JSON.stringify(
      {
        total: entries.length,
        matched: entries.length - missing.length,
        missing: missing.length,
        pages: pages.length,
        missingByDictionary: Object.fromEntries(
          [...new Set(missing.map((e) => e.file))].map((file) => [
            file,
            missing.filter((e) => e.file === file).length,
          ]),
        ),
      },
      null,
      2,
    ),
  );

  let sourceContexts: {
    file: string;
    source: string;
    selector: string;
    kind: string;
    url: string;
    state: string;
  }[] = [];
  try {
    sourceContexts = JSON.parse(
      await readFile(
        join(repositoryRoot, "tools/review/public/ui-contexts.json"),
        "utf8",
      ),
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const cell = (value: string) =>
    value.replace(/\|/gu, "\\|").replace(/\s+/gu, " ");
  const lines = [
    "# UI 원문 페이지 확인 결과",
    "",
    `확인 시각: ${new Date().toISOString()}`,
    "",
    `전체 ${entries.length}개 중 ${entries.length - missing.length}개는 ${pages.length}개 저장 페이지에서 선택자와 원문이 정확히 일치합니다.`,
    "",
    "날짜 조건 재현 화면은 원본 사이트 JavaScript를 격리된 브라우저에서 실행해 생성했으며, 미리보기에 재현 날짜를 표시합니다. 현재 시각의 실제 화면으로 표시하지 않습니다.",
    "",
    "## 정확한 표시 화면이 아직 없는 항목",
    "",
    "| 사전 · 항목 | 원문 | 확인 상태 | 원본 위치 / 표시 조건 |",
    "| --- | --- | --- | --- |",
    ...missing.map((entry) => {
      const context = sourceContexts.find(
        (item) =>
          item.file === entry.file &&
          item.source === entry.source &&
          item.selector === entry.selector,
      );
      return `| ${entry.file} · ${entry.index + 1} | ${cell(entry.source)} | ${context?.kind === "dynamic" ? "원본 코드 확인 · 상태 발생 화면 미확보" : "정확한 결과 URL 미확보"} | ${context ? `[원본 위치](${context.url}) · ${cell(context.state)}` : "추가 확인 필요"} |`;
    }),
    "",
    "전체 항목별 일치 파일은 [ui-page-coverage.json](ui-page-coverage.json)에 기록되어 있습니다.",
    "",
    "번역 내용과 검수 상태는 변경하지 않았습니다.",
    "",
  ];
  await atomicFile(join(reportRoot, "ui-page-coverage.md"), lines.join("\n"));

  const report = join(reportRoot, "ui-page-coverage.json");
  return {
    operation: "audit-ui-pages",
    report,
    items: [
      {
        id: "summary",
        status: "passed",
        message: logs.join("\n"),
        details: JSON.parse(await readFile(report, "utf8")),
      },
      ...missing.map((entry) => ({
        id: entry.file,
        status: "review-required" as const,
        message: `No saved page matches: ${entry.source}`,
        location: { dictionary: entry.file, index: entry.index },
      })),
    ],
  };
}
