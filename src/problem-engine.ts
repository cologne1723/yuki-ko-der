import type { ProblemCatalog } from "translation-core/problem-catalog";
import { sourceStatementBlocks } from "translation-core/problem-document";
import {
  createProblemLoader,
  ProblemVerificationError,
} from "./problem-loader.ts";
import { createProblemReplacement } from "./problem-replacement.ts";
import { createProblemSemantics } from "./problem-semantics.ts";
export type SourceVerification = {
  status: "verified" | "changed" | "unavailable" | "cancelled";
  detail?: string;
};
export type ProblemOutcome =
  | { status: "applied"; verification?: Promise<SourceVerification> }
  | { status: "unavailable" | "cancelled" }
  | { status: "failed"; reason: "network" | "verification"; detail: string };
export function createProblemEngine(host: Window & typeof globalThis) {
  const { document, Node, location } = host;
  const PROBLEM_PATH_PATTERN = /^\/problems\/no\/(\d+)\/?$/u;
  const { semanticStatement, canonicalFormula } = createProblemSemantics(Node);
  const {
    parseHtml,
    parseTranslationDocument,
    sha256Hex,
    cacheRequest,
    loadTranslationDocument,
    verifyCanonicalSource,
  } = createProblemLoader(host);
  const prepareReplacement = createProblemReplacement(
    document,
    semanticStatement,
  );

  let activeReplacement: ReturnType<typeof prepareReplacement> | undefined;
  function restoreProblem() {
    activeReplacement?.restore();
    activeReplacement = undefined;
  }

  async function translateProblem(
    shouldApply = () => true,
    catalog?: ProblemCatalog,
  ): Promise<ProblemOutcome> {
    if (activeReplacement) return { status: "applied" };
    try {
      const pathMatch = location.pathname.match(PROBLEM_PATH_PATTERN);
      const baseUrl =
        host.YUKICODER_KO_CONFIG?.problemTranslationBaseUrl?.trim();
      if (!pathMatch || !baseUrl) {
        return { status: "unavailable" };
      }

      const problemNo = Number(pathMatch[1]);
      const expected = catalog?.entries.find(
        (entry) => entry.problemNo === problemNo,
      );
      if (catalog && !expected) {
        try {
          await cacheRequest(
            "remove",
            `problem-translation-html:ko:${problemNo}`,
          );
        } catch (error) {
          console.warn(
            "[yukicoder-ko] Could not clear removed translation",
            error,
          );
        }
        return { status: "unavailable" };
      }
      const content = document.querySelector<HTMLElement>(
        "#content[data-problem-id]",
      );
      const liveTitle = content?.querySelector(":scope > h3");
      const pageProblemId = content?.dataset.problemId;
      const liveBlocks = content ? sourceStatementBlocks(content) : [];
      if (!pageProblemId || !liveTitle || liveBlocks.length === 0) {
        throw new ProblemVerificationError(
          "Problem page structure is unavailable",
        );
      }

      const translation = await loadTranslationDocument(
        baseUrl,
        problemNo,
        pageProblemId,
        expected,
      );
      if (!translation) return { status: "unavailable" };
      const displayedSource = semanticStatement(liveBlocks);
      let apply: ReturnType<typeof prepareReplacement>;
      try {
        apply = prepareReplacement(
          translation,
          liveTitle,
          liveBlocks,
          liveBlocks,
        );
      } catch (error) {
        throw new ProblemVerificationError(String(error));
      }
      if (!shouldApply() || activeReplacement) return { status: "cancelled" };
      try {
        apply();
      } catch (error) {
        throw new ProblemVerificationError(String(error));
      }
      activeReplacement = apply;
      const verification = (async (): Promise<SourceVerification> => {
        try {
          const canonicalHtml = await verifyCanonicalSource(translation);
          if (!shouldApply() || activeReplacement !== apply)
            return { status: "cancelled" };
          const canonicalBlocks = sourceStatementBlocks(
            parseHtml(canonicalHtml).body,
          );
          return {
            status:
              semanticStatement(canonicalBlocks) === displayedSource
                ? "verified"
                : "changed",
          };
        } catch (error) {
          if (!shouldApply() || activeReplacement !== apply)
            return { status: "cancelled" };
          return {
            status:
              error instanceof ProblemVerificationError
                ? "changed"
                : "unavailable",
            detail: String(error),
          };
        }
      })();
      return { status: "applied", verification };
    } catch (error) {
      if (!shouldApply()) return { status: "cancelled" };
      return {
        status: "failed",
        reason:
          error instanceof ProblemVerificationError
            ? "verification"
            : "network",
        detail: String(error),
      };
    }
  }

  return {
    canonicalFormula,
    loadTranslationDocument,
    parseHtml,
    parseTranslationDocument,
    prepareReplacement,
    semanticStatement,
    sha256Hex,
    translateProblem,
    restoreProblem,
  };
}
