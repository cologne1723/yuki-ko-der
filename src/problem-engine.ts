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

  type Translation = Awaited<ReturnType<typeof loadTranslationDocument>>;
  type CanonicalResult = SourceVerification & { semantic?: string };
  let session:
    | {
        key: string;
        translation: Promise<Translation>;
        verification?: Promise<CanonicalResult>;
      }
    | undefined;
  let applicationRevision = 0;
  let activeOutcome: ProblemOutcome | undefined;
  let activeReplacement: ReturnType<typeof prepareReplacement> | undefined;
  function restoreProblem() {
    applicationRevision++;
    activeOutcome = undefined;
    activeReplacement?.restore();
    activeReplacement = undefined;
  }

  async function translateProblem(
    shouldApply = () => true,
    catalog?: ProblemCatalog,
    options: { refresh?: boolean } = {},
  ): Promise<ProblemOutcome> {
    let current = ++applicationRevision;
    const live = () => current === applicationRevision && shouldApply();
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
        session = undefined;
        restoreProblem();
        current = applicationRevision;
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
      const pageProblemId = content?.dataset.problemId;
      const key = JSON.stringify([baseUrl, problemNo, pageProblemId, expected]);
      if (options.refresh || session?.key !== key) {
        session = undefined;
        restoreProblem();
        current = applicationRevision;
      }
      if (!live()) return { status: "cancelled" };
      if (activeReplacement && activeOutcome) return activeOutcome;
      if (!pageProblemId) {
        throw new ProblemVerificationError(
          "Problem page structure is unavailable",
        );
      }

      if (!session) {
        const created = {
          key,
          translation: loadTranslationDocument(
            baseUrl,
            problemNo,
            pageProblemId,
            expected,
          ),
        };
        session = created;
        void created.translation.catch(() => {
          if (session === created) session = undefined;
        });
      }
      const resource = session;
      const translation = await resource.translation;
      if (!live() || session !== resource) return { status: "cancelled" };
      if (!translation) return { status: "unavailable" };
      // The site can rebuild the statement while the download is in flight.
      // Re-read the live nodes and identity instead of modifying detached ones.
      const currentContent = document.querySelector<HTMLElement>(
        "#content[data-problem-id]",
      );
      if (
        location.pathname !== pathMatch[0] ||
        currentContent?.dataset.problemId !== pageProblemId ||
        host.YUKICODER_KO_CONFIG?.problemTranslationBaseUrl?.trim() !== baseUrl
      )
        return { status: "cancelled" };
      const liveTitle = currentContent.querySelector(":scope > h3");
      const liveBlocks = sourceStatementBlocks(currentContent);
      if (!liveTitle || liveBlocks.length === 0)
        throw new ProblemVerificationError(
          "Problem page structure is unavailable",
        );
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
      if (!live() || activeReplacement) return { status: "cancelled" };
      try {
        apply();
      } catch (error) {
        throw new ProblemVerificationError(String(error));
      }
      activeReplacement = apply;
      // Verification belongs to the page resource, not to a particular view.
      // Switching to Japanese must not cancel a request another view can reuse.
      resource.verification ??= (async (): Promise<CanonicalResult> => {
        try {
          const canonicalHtml = await verifyCanonicalSource(translation);
          return {
            status: "verified",
            semantic: semanticStatement(
              sourceStatementBlocks(parseHtml(canonicalHtml).body),
            ),
          };
        } catch (error) {
          return {
            status:
              error instanceof ProblemVerificationError
                ? "changed"
                : "unavailable",
            detail: String(error),
          };
        }
      })();
      const verification = resource.verification.then(
        (result): SourceVerification => {
          if (
            !shouldApply() ||
            session !== resource ||
            activeReplacement !== apply
          )
            return { status: "cancelled" };
          if (result.status !== "verified") return result;
          return {
            status:
              result.semantic === displayedSource ? "verified" : "changed",
          };
        },
      );
      activeOutcome = { status: "applied", verification };
      return activeOutcome;
    } catch (error) {
      if (!live()) return { status: "cancelled" };
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
