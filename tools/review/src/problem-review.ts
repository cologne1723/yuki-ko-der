import {
  setProblemMarkdownReviews,
  setProblemMarkdownVisibility,
  sameProblemReviewContent,
} from "translation-core/problem-frontmatter";
import {
  problemReviews,
  type ProblemReviews,
  reviewerIdSchema,
} from "translation-core/problem-review-status";
import { mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { setTimeout } from "node:timers/promises";
import { convertProblemHtmlToMarkdown } from "translation-audit/convert-problem-html-to-mdx";
import {
  atomicFile,
  atomicNewFile,
  optionalFile,
} from "translation-audit/operations/source-store";
import { pLimit } from "translation-core/concurrency";
import { sha256 } from "translation-core/node-hash";
import { defaultDataDirectory } from "translation-core/paths";
import { compileProblemMarkdown } from "translation-core/problem-markdown";
import type { ProblemRenderProfile } from "translation-core/problem-render-profile";
import { sampleWarnings } from "translation-core/problem-samples";
import { ProblemConversionRecovery } from "./problem-conversion-recovery.ts";
import { ProblemRepository } from "./problem-repository.ts";
import { validateProblem } from "./problem-validation.ts";

export type ReviewStatus = "unreviewed" | "approved";

export interface ProblemSummary {
  problemNo: number;
  japaneseTitle: string;
  koreanTitle: string;
  reviewStatus: ReviewStatus;
  machineTranslated: boolean;
  visibility?: boolean;
  reviews?: ProblemReviews;
  validationErrors?: string[];
}

export interface ProblemReview extends ProblemSummary {
  japaneseHtml: string;
  koreanSource: string;
  koreanHtml: string;
  sourceFormat: "html" | "mdx";
  revision: string;
  validationWarnings: string[];
  renderProfile?: ProblemRenderProfile;
  renderProfileError?: string;
  sourceUrl?: string;
}

export interface SaveResult extends ProblemReview {}

import {
  removeMachineLabel,
  ReviewError,
  setProblemHtmlReviews,
} from "translation-core/review-state";
export { sha256 } from "translation-core/node-hash";
export {
  parseReviewState,
  removeMachineLabel,
  ReviewError,
  setReviewStatus,
} from "translation-core/review-state";
export { sampleWarnings as structuralWarnings };

export class ProblemReviewStore {
  readonly sourceDirectory: string;
  readonly translationDirectory: string;
  readonly indexPath: string;
  private conversionDirectory: string;
  private conversions: ProblemConversionRecovery;
  private repository: ProblemRepository;
  private recoveryErrors = new Map<number, string>();
  private queue = pLimit(1);

  constructor(
    readonly repositoryRoot: string,
    dataRoot = defaultDataDirectory(repositoryRoot),
  ) {
    this.sourceDirectory = join(dataRoot, "problems-source");
    this.translationDirectory = join(
      repositoryRoot,
      "problem-translations",
      "ko",
      "problems",
    );
    this.indexPath = join(this.sourceDirectory, "index.json");
    this.conversionDirectory = join(
      repositoryRoot,
      "data/reports/problem-conversions",
    );
    this.repository = new ProblemRepository(
      this.sourceDirectory,
      this.translationDirectory,
      this.indexPath,
      this.recoveryErrors,
    );
    this.conversions = new ProblemConversionRecovery(
      this.conversionDirectory,
      (no) => this.paths(no),
      this.recoveryErrors,
    );
  }

  private metadata() {
    return this.repository.metadata();
  }
  private paths(no: number) {
    return this.repository.paths(no);
  }
  list() {
    return this.withStoreLock(() => this.repository.list());
  }
  get(no: number) {
    return this.withStoreLock(() => this.repository.get(no));
  }

  setVisibility(problemNo: number, visibility: boolean, revision: string) {
    return this.withStoreLock(async () => {
      const current = await this.repository.get(problemNo);
      if (current.revision !== revision)
        throw new ReviewError(
          "The translation changed on disk; reload before saving",
          409,
        );
      if (current.sourceFormat !== "mdx")
        throw new ReviewError(
          "Convert the translation to MDX before changing visibility",
        );
      const next = setProblemMarkdownVisibility(
        current.koreanSource,
        visibility,
      );
      const paths = this.paths(problemNo);
      const [latest, alternate] = await Promise.all([
        optionalFile(paths.koreanMdx),
        optionalFile(paths.koreanHtml),
      ]);
      if (
        latest?.toString() !== current.koreanSource ||
        alternate !== undefined
      )
        throw new ReviewError(
          "The translation changed on disk; reload before saving",
          409,
        );
      await atomicFile(paths.koreanMdx, next);
      return this.repository.get(problemNo);
    });
  }

  async save(
    problemNo: number,
    submittedSource: string,
    expectedRevision: string,
    action: "save" | "approve" | "unapprove",
    reviewer: "human" | "machine" = "human",
    reviewerId?: string,
  ): Promise<ProblemReview> {
    return this.withStoreLock(() =>
      this.saveOnce(
        problemNo,
        submittedSource,
        expectedRevision,
        action,
        reviewer,
        reviewerId,
      ),
    );
  }

  private withStoreLock<T>(work: () => Promise<T>): Promise<T> {
    return this.queue(async () => {
      await mkdir(this.conversionDirectory, { recursive: true });
      // The server, machine-review CLI and conversion recovery share this lock.
      // SQLite releases it even when a process exits during a write.
      const { DatabaseSync } = await import("node:sqlite");
      const lock = new DatabaseSync(
        join(this.conversionDirectory, "lock.sqlite"),
      );
      try {
        for (;;) {
          try {
            lock.exec("BEGIN IMMEDIATE");
            break;
          } catch (error) {
            if (![5, 6].includes((error as { errcode?: number }).errcode ?? -1))
              throw error;
            await setTimeout(25);
          }
        }
        await this.conversions.recoverAll();
        return await work();
      } finally {
        lock.close();
      }
    });
  }

  async convert(problemNo: number, expectedRevision: string) {
    return this.withStoreLock(async () => {
      const paths = this.paths(problemNo);
      if (this.recoveryErrors.has(problemNo))
        throw new ReviewError(this.recoveryErrors.get(problemNo)!, 409);
      if (await optionalFile(paths.koreanMdx))
        throw new ReviewError(
          "An MDX source already exists; inspect both files",
          409,
        );
      const original = await readFile(paths.koreanHtml, "utf8");
      if (sha256(original) !== expectedRevision)
        throw new ReviewError(
          "The translation changed on disk; preview conversion again",
          409,
        );
      const mdx = convertProblemHtmlToMarkdown(original);
      await mkdir(this.conversionDirectory, { recursive: true });
      const journal = join(this.conversionDirectory, `${problemNo}.json`);
      await atomicFile(
        journal,
        JSON.stringify({
          version: 1,
          problemNo,
          originalHash: expectedRevision,
          generatedHash: sha256(mdx),
        }),
      );
      await atomicNewFile(paths.koreanMdx, mdx);
      try {
        await this.conversions.recoverOne(problemNo);
      } catch (error) {
        this.recoveryErrors.set(
          problemNo,
          `Problem ${problemNo} conversion needs inspection: ${String(error)}`,
        );
        throw error;
      }
      return { problemNo, revision: sha256(mdx), sourceFormat: "mdx" };
    });
  }

  private async saveOnce(
    problemNo: number,
    submittedSource: string,
    expectedRevision: string,
    action: "save" | "approve" | "unapprove",
    reviewer: "human" | "machine" = "human",
    reviewerId?: string,
  ): Promise<ProblemReview> {
    const identity =
      reviewer === "human" && action !== "save"
        ? reviewerIdSchema.safeParse(reviewerId)
        : undefined;
    if (identity && !identity.success)
      throw new ReviewError(
        "A non-empty reviewerId is required for human review",
      );
    const id = identity?.success ? identity.data : undefined;
    const metadata = (await this.metadata()).get(problemNo);
    const current = await this.repository.get(problemNo);
    if (current.revision !== expectedRevision) {
      throw new ReviewError(
        "The translation changed on disk; reload before saving",
        409,
      );
    }
    if (!metadata)
      throw new ReviewError(
        "The saved problem index changed; reload before saving",
        409,
      );
    const unchanged =
      current.sourceFormat === "mdx"
        ? sameProblemReviewContent(submittedSource, current.koreanSource)
        : submittedSource.replace(/(?:\r?\n)+$/u, "") ===
          current.koreanSource.replace(/(?:\r?\n)+$/u, "");
    const reviews =
      current.reviews ??
      problemReviews(
        current.machineTranslated ? "machine" : current.reviewStatus,
      );
    const humanReviews = (): ProblemReviews => {
      if (action === "unapprove" && !unchanged)
        throw new ReviewError("Save editor changes before unapproving");
      const next: ProblemReviews = unchanged
        ? { human: [...reviews.human], machine: reviews.machine }
        : { human: [], machine: "unreviewed" };
      if (action === "approve") next.human = [...new Set([...next.human, id!])];
      else if (action === "unapprove")
        next.human = next.human.filter((value) => value !== id);
      return next;
    };
    let nextSource = submittedSource;
    if (current.sourceFormat === "mdx") {
      if (reviewer === "machine") {
        if (action === "save" || submittedSource !== current.koreanSource)
          throw new ReviewError(
            "Machine review must target the saved translation",
          );
        nextSource = setProblemMarkdownReviews(current.koreanSource, {
          ...reviews,
          machine: action === "approve" ? "approved" : "unreviewed",
        });
      } else {
        nextSource = setProblemMarkdownReviews(nextSource, humanReviews());
      }
    } else if (reviewer === "machine") {
      throw new ReviewError(
        "Convert the translation to MDX before machine review",
      );
    } else {
      nextSource = setProblemHtmlReviews(
        removeMachineLabel(nextSource),
        humanReviews(),
      );
    }
    const nextHtml =
      current.sourceFormat === "mdx"
        ? compileProblemMarkdown(nextSource)
        : nextSource;
    validateProblem(
      problemNo,
      current.japaneseHtml,
      nextHtml,
      metadata,
      current.sourceFormat,
    );
    const paths = this.paths(problemNo);
    const path =
      current.sourceFormat === "mdx" ? paths.koreanMdx : paths.koreanHtml;
    // External editors do not participate in the SQLite lock. Recheck the raw
    // inputs after validation, including the format, without compiling a newer
    // (possibly unfinished) edit. This is optimistic validation, not filesystem CAS.
    const [mdx, html, japanese, latestMetadata] = await Promise.all([
      optionalFile(paths.koreanMdx),
      optionalFile(paths.koreanHtml),
      optionalFile(paths.japanese),
      this.metadata(),
    ]);
    const [latest, alternate] =
      current.sourceFormat === "mdx" ? [mdx, html] : [html, mdx];
    if (latest?.toString() !== current.koreanSource || alternate !== undefined)
      throw new ReviewError(
        "The translation changed on disk; reload before saving",
        409,
      );
    const latestProblem = latestMetadata.get(problemNo);
    if (
      japanese?.toString() !== current.japaneseHtml ||
      latestProblem?.No !== metadata.No ||
      latestProblem?.ProblemId !== metadata.ProblemId ||
      latestProblem?.Title !== metadata.Title
    )
      throw new ReviewError(
        "The saved original or problem index changed; reload before saving",
        409,
      );
    await atomicFile(path, nextSource);
    return this.repository.get(problemNo);
  }
}
