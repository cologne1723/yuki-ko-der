import type { ProblemCatalog } from "translation-core/problem-catalog";
import { sourceStatementBlocks } from "translation-core/problem-document";
import { detectProblemRenderProfile } from "translation-core/problem-render-profile";
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
  | {
      status: "applied";
      verification?: Promise<SourceVerification>;
      isApplied?: () => boolean;
    }
  | { status: "unavailable" | "cancelled" }
  | { status: "failed"; reason: "network" | "verification"; detail: string };
export function createProblemEngine(host: Window & typeof globalThis) {
  const { document, Node, location } = host;
  const PROBLEM_PATH_PATTERN =
    /^\/problems\/(?:(?:no\/(?<problemNo>\d+))|(?<problemId>\d+))\/?$/u;
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
  type CanonicalResult = SourceVerification & { sourceHtml?: string };
  type Session = {
    key: string;
    isCurrent: () => boolean;
    translation: Promise<Translation>;
    verification?: Promise<CanonicalResult>;
  };
  type Replacement = Awaited<ReturnType<typeof prepareReplacement>>;
  let session: Session | undefined;
  let applicationRevision = 0;
  let activeReplacement: Replacement | undefined;
  function restoreProblem() {
    applicationRevision++;
    const previous = activeReplacement;
    activeReplacement = undefined;
    previous?.restore();
  }

  function verifySource(
    resource: Session,
    translation: NonNullable<Translation>,
  ) {
    if (resource.verification) return resource.verification;
    const request = (async (): Promise<CanonicalResult> => {
      try {
        // Only validated API identity and raw bytes establish source changes.
        const sourceHtml = await verifyCanonicalSource(translation);
        return { status: "verified", sourceHtml };
      } catch (error) {
        return {
          status:
            error instanceof ProblemVerificationError
              ? "changed"
              : "unavailable",
          detail: String(error),
          sourceHtml:
            error instanceof ProblemVerificationError
              ? error.sourceHtml
              : undefined,
        };
      }
    })();
    resource.verification = request;
    void request.then((result) => {
      if (result.status === "unavailable" && resource.verification === request)
        resource.verification = undefined;
    });
    return request;
  }

  function appliedOutcome(
    resource: Session,
    translation: NonNullable<Translation>,
    apply: Replacement,
    shouldApply: () => boolean,
  ): ProblemOutcome {
    const isApplied = () =>
      session === resource &&
      resource.isCurrent() &&
      activeReplacement === apply &&
      apply.isActive();
    return {
      status: "applied",
      isApplied,
      verification: verifySource(resource, translation).then(
        (result): SourceVerification => {
          if (!shouldApply() || !isApplied()) return { status: "cancelled" };
          return { status: result.status, detail: result.detail };
        },
      ),
    };
  }

  async function translateProblem(
    shouldApply = () => true,
    catalog?: ProblemCatalog,
    options: { refresh?: boolean; retryVerification?: boolean } = {},
  ): Promise<ProblemOutcome> {
    // Source-only retries never change the current view or cancel preparation.
    if (options.retryVerification) {
      const resource = session;
      const apply = activeReplacement;
      if (
        !resource ||
        !apply ||
        !apply.isActive() ||
        !resource.isCurrent() ||
        !shouldApply()
      )
        return { status: "cancelled" };
      const translation = await resource.translation;
      if (
        !translation ||
        session !== resource ||
        activeReplacement !== apply ||
        !apply.isActive() ||
        !resource.isCurrent() ||
        !shouldApply()
      )
        return { status: "cancelled" };
      return appliedOutcome(resource, translation, apply, shouldApply);
    }
    let current = ++applicationRevision;
    const live = () => current === applicationRevision && shouldApply();
    try {
      const pathMatch = location.pathname.match(PROBLEM_PATH_PATTERN);
      const baseUrl =
        host.YUKICODER_KO_CONFIG?.problemTranslationBaseUrl?.trim();
      if (!pathMatch || !baseUrl) {
        return { status: "unavailable" };
      }

      const content = document.querySelector<HTMLElement>(
        "#content[data-problem-id]",
      );
      const pageProblemId = content?.dataset.problemId;
      const routeProblemId = pathMatch.groups?.problemId;
      if (routeProblemId && Number(routeProblemId) !== Number(pageProblemId)) {
        throw new ProblemVerificationError(
          "Problem URL identity differs from the page",
        );
      }
      const expected = catalog?.entries.find((entry) =>
        routeProblemId
          ? entry.problemId === Number(routeProblemId)
          : entry.problemNo === Number(pathMatch.groups?.problemNo),
      );
      const problemNo = Number(
        pathMatch.groups?.problemNo ??
          expected?.problemNo ??
          content
            ?.querySelector(":scope > h3")
            ?.textContent?.match(/^\s*No\.(\d+)\s/u)?.[1],
      );
      if (!Number.isSafeInteger(problemNo) || problemNo < 1)
        return { status: "unavailable" };
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
      const key = JSON.stringify([baseUrl, problemNo, pageProblemId, expected]);
      if (options.refresh || session?.key !== key) {
        session = undefined;
        restoreProblem();
        current = applicationRevision;
      }
      if (!live()) return { status: "cancelled" };
      if (activeReplacement && !activeReplacement.isActive()) {
        restoreProblem();
        current = applicationRevision;
      }
      if (!pageProblemId) {
        throw new ProblemVerificationError(
          "Problem page structure is unavailable",
        );
      }

      if (!session) {
        const created: Session = {
          key,
          isCurrent: () =>
            location.pathname === pathMatch[0] &&
            document.querySelector<HTMLElement>("#content[data-problem-id]")
              ?.dataset.problemId === pageProblemId &&
            host.YUKICODER_KO_CONFIG?.problemTranslationBaseUrl?.trim() ===
              baseUrl,
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
      if (!live() || session !== resource || !resource.isCurrent())
        return { status: "cancelled" };
      if (!translation) return { status: "unavailable" };
      if (activeReplacement?.isActive())
        return appliedOutcome(
          resource,
          translation,
          activeReplacement,
          shouldApply,
        );
      const profile = detectProblemRenderProfile(document);
      if (!profile) throw new Error("Problem render settings are unavailable");
      const sourceSamplesSha256 = expected?.sourceSamplesSha256;
      const hasSamples = (blocks: Element[]) =>
        blocks.some(
          (block) => block.matches(".sample") || block.querySelector(".sample"),
        );
      let canonicalBlocks: Element[] | undefined;
      const pageBlocks = sourceStatementBlocks(
        document.querySelector("#content[data-problem-id]")!,
      );
      if (
        !sourceSamplesSha256 &&
        (hasSamples(translation.blocks) || hasSamples(pageBlocks))
      ) {
        const result = await verifySource(resource, translation);
        if (!live() || session !== resource || !resource.isCurrent())
          return { status: "cancelled" };
        if (!result.sourceHtml)
          throw new Error(
            result.detail ?? "Canonical sample source is unavailable",
          );
        canonicalBlocks = sourceStatementBlocks(
          parseHtml(result.sourceHtml).body,
        );
      }
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
      let apply: Replacement;
      try {
        apply = await prepareReplacement(
          translation,
          liveTitle,
          liveBlocks,
          canonicalBlocks ?? liveBlocks,
          {
            profile,
            sourceUrl: new URL(`/problems/no/${problemNo}`, location.origin)
              .href,
            fontUrl: (host.browser ?? host.chrome)?.runtime?.getURL?.(
              "mathjax/fonts/woff-v2",
            ),
            sourceSamplesSha256,
          },
        );
      } catch (error) {
        throw new ProblemVerificationError(String(error));
      }
      if (
        !live() ||
        session !== resource ||
        !resource.isCurrent() ||
        activeReplacement
      )
        return { status: "cancelled" };
      try {
        apply();
      } catch (error) {
        throw new ProblemVerificationError(String(error));
      }
      activeReplacement = apply;
      return appliedOutcome(resource, translation, apply, shouldApply);
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
