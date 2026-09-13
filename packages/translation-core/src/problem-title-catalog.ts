import { JSDOM } from "jsdom";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import type { ProblemTitleTranslation } from "./problem-catalog.ts";
import { parseProblemMarkdown } from "./problem-markdown.ts";
import { z } from "./validation.ts";
export type { ProblemTitleTranslation } from "./problem-catalog.ts";

export async function readProblemTitleCatalog(
  directory: string,
  sourceIndexPath?: string,
): Promise<ProblemTitleTranslation[]> {
  const titles: ProblemTitleTranslation[] = [];
  const errors: string[] = [];
  const numbers = new Map<number, string>();
  const ids = new Map<number, string>();
  const originals = new Map<
    number,
    { No: number; ProblemId: number; Title: string }
  >();
  if (sourceIndexPath) {
    try {
      const index = z
        .object({
          problems: z.array(
            z.object({
              No: z.number().int().positive(),
              ProblemId: z.number().int().positive(),
              Title: z.string().min(1),
            }),
          ),
        })
        .parse(JSON.parse(await readFile(sourceIndexPath, "utf8")));
      const originalIds = new Set<number>();
      for (const p of index.problems) {
        if (originals.has(p.No) || originalIds.has(p.ProblemId))
          errors.push(
            `${sourceIndexPath}: duplicate No ${p.No} or ProblemId ${p.ProblemId}`,
          );
        originals.set(p.No, p);
        originalIds.add(p.ProblemId);
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT")
        errors.push(`${sourceIndexPath}: ${String(error)}`);
    }
  }
  for (const filename of (await readdir(directory)).sort(
    (a, b) => parseInt(a) - parseInt(b),
  )) {
    const match = filename.match(/^(?<problemNo>\d+)\.(?<format>mdx|html)$/u);
    if (!match) continue;
    try {
      const source = await readFile(join(directory, filename), "utf8");
      let metadata: {
        problemNo: number;
        problemId: number;
        sourceTitle: string;
        title: string;
        reviewStatus?: unknown;
        visibility?: boolean;
      };
      if (match.groups?.format === "mdx") {
        metadata = parseProblemMarkdown(source).metadata;
      } else {
        const dom = new JSDOM(source);
        const document = dom.window.document;
        const root = document.querySelector<HTMLElement>(
          "main[data-yukicoder-ko-problem]",
        );
        const heading =
          root?.querySelector(":scope > h3")?.textContent?.trim() ?? "";
        metadata = {
          problemNo: Number(root?.dataset.problemNo),
          problemId: Number(root?.dataset.problemId),
          sourceTitle: root?.dataset.sourceTitle ?? "",
          visibility: root?.dataset.visibility !== "false",
          title: heading
            .replace(/^\[기계 번역\]\s*/u, "")
            .replace(/^No\.\d+\s*/u, ""),
          reviewStatus: heading.startsWith("[기계 번역]")
            ? "machine"
            : (root?.dataset.reviewStatus ?? "unreviewed"),
        };
        dom.window.close();
      }
      if (
        metadata.problemNo !== Number(match.groups?.problemNo) ||
        !Number.isSafeInteger(metadata.problemId) ||
        metadata.problemNo < 1 ||
        metadata.problemId < 1 ||
        !metadata.sourceTitle ||
        !metadata.title ||
        numbers.has(metadata.problemNo) ||
        ids.has(metadata.problemId)
      ) {
        errors.push(
          `${filename}: invalid identity/title metadata (problemNo=${metadata.problemNo}, problemId=${metadata.problemId})${numbers.has(metadata.problemNo) ? `; problemNo duplicates ${numbers.get(metadata.problemNo)}` : ""}${ids.has(metadata.problemId) ? `; problemId duplicates ${ids.get(metadata.problemId)}` : ""}`,
        );
      }
      if (!numbers.has(metadata.problemNo))
        numbers.set(metadata.problemNo, filename);
      if (!ids.has(metadata.problemId)) ids.set(metadata.problemId, filename);
      const original = originals.get(Number(match.groups?.problemNo));
      if (
        original &&
        (metadata.problemNo !== original.No ||
          metadata.problemId !== original.ProblemId ||
          metadata.sourceTitle !== original.Title)
      )
        errors.push(
          `${filename}: source index expects problemNo=${original.No}, problemId=${original.ProblemId}, sourceTitle=${JSON.stringify(original.Title)}; received problemNo=${metadata.problemNo}, problemId=${metadata.problemId}, sourceTitle=${JSON.stringify(metadata.sourceTitle)}`,
        );
      if (metadata.visibility === false) continue;
      titles.push({
        problemNo: metadata.problemNo,
        problemId: metadata.problemId,
        source: metadata.sourceTitle,
        target: metadata.title,
      });
    } catch (error) {
      errors.push(`${filename}: ${String(error)}`);
    }
  }
  if (errors.length)
    throw new Error(
      `Problem title catalog validation failed:\n${errors.join("\n")}`,
    );
  return titles;
}
