import { JSDOM } from "jsdom";
import { sha256 } from "translation-audit/operations/source-store";
import {
  parseTranslationDocument,
  sourceStatementBlocks,
} from "translation-core/problem-document";
import { sampleWarnings } from "translation-core/problem-samples";
import { parseReviewState, ReviewError } from "translation-core/review-state";
export interface ProblemMetadata {
  No: number;
  ProblemId: number;
  Title: string;
}

export function validateProblem(
  problemNo: number,
  japaneseHtml: string,
  koreanHtml: string,
  metadata: ProblemMetadata,
  sourceFormat: "mdx" | "html",
): string[] {
  const koreanDom = new JSDOM(koreanHtml);
  const japaneseDom = new JSDOM(japaneseHtml);
  try {
    const parsed = koreanDom.window.document;
    const root = parsed.querySelector<HTMLElement>(
      "main[data-yukicoder-ko-problem]",
    );
    const problemId = root?.dataset.problemId;
    if (!problemId) throw new ReviewError("Problem ID metadata is missing");
    const translation = parseTranslationDocument(
      koreanHtml,
      problemNo,
      problemId,
      () => parsed,
    );
    if (
      Number(problemId) !== metadata.ProblemId ||
      translation.root.dataset.sourceTitle !== metadata.Title
    ) {
      throw new ReviewError(
        "Problem number, ID, or Japanese title metadata changed",
      );
    }
    const sourceHash = sha256(japaneseHtml);
    if (translation.root.dataset.sourceHtmlSha256 !== sourceHash) {
      throw new ReviewError(
        `Saved Japanese source hash differs from translation metadata (${sourceHash})`,
      );
    }
    const source = japaneseDom.window.document;
    const sourceBlocks = sourceStatementBlocks(source.body);
    const warnings = sampleWarnings(
      sourceBlocks,
      translation.blocks,
      sourceFormat,
    );
    parseReviewState(koreanHtml);
    return warnings;
  } finally {
    koreanDom.window.close();
    japaneseDom.window.close();
  }
}
