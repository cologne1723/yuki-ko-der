import { JSDOM } from "jsdom";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import type { ProblemTitleTranslation } from "./problem-catalog.ts";
import { parseProblemMarkdown } from "./problem-markdown.ts";
export type { ProblemTitleTranslation } from "./problem-catalog.ts";

export async function readProblemTitleCatalog(
  directory: string,
): Promise<ProblemTitleTranslation[]> {
  const titles: ProblemTitleTranslation[] = [];
  const numbers = new Set<number>();
  const ids = new Set<number>();
  for (const filename of (await readdir(directory)).sort(
    (a, b) => parseInt(a) - parseInt(b),
  )) {
    const match = filename.match(/^(?<problemNo>\d+)\.(?<format>mdx|html)$/u);
    if (!match) continue;
    const source = await readFile(join(directory, filename), "utf8");
    let metadata: {
      problemNo: number;
      problemId: number;
      sourceTitle: string;
      title: string;
      reviewStatus: string;
    };
    if (match.groups?.format === "mdx") {
      metadata = parseProblemMarkdown(source).metadata;
    } else {
      const document = new JSDOM(source).window.document;
      const root = document.querySelector<HTMLElement>(
        "main[data-yukicoder-ko-problem]",
      );
      const heading =
        root?.querySelector(":scope > h3")?.textContent?.trim() ?? "";
      metadata = {
        problemNo: Number(root?.dataset.problemNo),
        problemId: Number(root?.dataset.problemId),
        sourceTitle: root?.dataset.sourceTitle ?? "",
        title: heading
          .replace(/^\[기계 번역\]\s*/u, "")
          .replace(/^No\.\d+\s*/u, ""),
        reviewStatus: heading.startsWith("[기계 번역]")
          ? "machine"
          : (root?.dataset.reviewStatus ?? "unreviewed"),
      };
    }
    if (
      metadata.problemNo !== Number(match.groups?.problemNo) ||
      !Number.isSafeInteger(metadata.problemId) ||
      !metadata.sourceTitle ||
      !metadata.title ||
      numbers.has(metadata.problemNo) ||
      ids.has(metadata.problemId)
    ) {
      throw new Error(
        `${filename}: 문제 제목 메타데이터가 잘못되었거나 중복되었습니다.`,
      );
    }
    numbers.add(metadata.problemNo);
    ids.add(metadata.problemId);
    titles.push({
      problemNo: metadata.problemNo,
      problemId: metadata.problemId,
      source: metadata.sourceTitle,
      target: metadata.title,
    });
  }
  return titles;
}
