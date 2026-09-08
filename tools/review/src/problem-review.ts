import { mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { convertProblemHtmlToMarkdown } from "translation-audit/convert-problem-html-to-mdx";
import {
  atomicFile,
  atomicNewFile,
  optionalFile,
} from "translation-audit/operations/source-store";
import { pLimit } from "translation-core/concurrency";
import { sha256 } from "translation-core/node-hash";
import { defaultDataDirectory } from "translation-core/paths";
import {
  compileProblemMarkdown,
  removeProblemMarkdownMachineLabel,
  setProblemMarkdownReviewStatus,
} from "translation-core/problem-markdown";
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
  validationErrors?: string[];
}

export interface ProblemReview extends ProblemSummary {
  japaneseHtml: string;
  koreanSource: string;
  koreanHtml: string;
  sourceFormat: "html" | "mdx";
  revision: string;
  validationWarnings: string[];
}

export interface SaveResult extends ProblemReview {}

import {
  removeMachineLabel,
  ReviewError,
  setReviewStatus,
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
  private recovery: Promise<void>;
  private conversions: ProblemConversionRecovery;
  private repository: ProblemRepository;
  private recoveryErrors = new Map<number, string>();
  private saveQueues = new Map<number, ReturnType<typeof pLimit>>();

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
      () => this.recovery,
    );
    this.conversions = new ProblemConversionRecovery(
      this.conversionDirectory,
      (no) => this.paths(no),
      this.recoveryErrors,
    );
    this.recovery = this.conversions.recoverAll();
  }

  private metadata() {
    return this.repository.metadata();
  }
  private paths(no: number) {
    return this.repository.paths(no);
  }
  private translationPath(no: number) {
    return this.repository.translationPath(no);
  }
  private compile(path: string, source: string) {
    return this.repository.compile(path, source);
  }
  list() {
    return this.repository.list();
  }
  get(no: number) {
    return this.repository.get(no);
  }

  async save(
    problemNo: number,
    submittedSource: string,
    expectedRevision: string,
    action: "save" | "approve" | "unapprove",
  ): Promise<ProblemReview> {
    return this.withSaveLock(problemNo, () =>
      this.saveOnce(problemNo, submittedSource, expectedRevision, action),
    );
  }

  private async withSaveLock<T>(
    problemNo: number,
    work: () => Promise<T>,
  ): Promise<T> {
    const limit = this.saveQueues.get(problemNo) ?? pLimit(1);
    this.saveQueues.set(problemNo, limit);
    try {
      return await limit(work);
    } finally {
      if (!limit.activeCount && !limit.pendingCount)
        this.saveQueues.delete(problemNo);
    }
  }

  async convert(problemNo: number, expectedRevision: string) {
    await this.recovery;
    return this.withSaveLock(problemNo, async () => {
      const paths = this.paths(problemNo);
      const original = await readFile(paths.koreanHtml, "utf8");
      if (sha256(original) !== expectedRevision)
        throw new ReviewError(
          "The translation changed on disk; preview conversion again",
          409,
        );
      const mdx = convertProblemHtmlToMarkdown(original);
      if (await optionalFile(paths.koreanMdx))
        throw new ReviewError(
          "An MDX source already exists; inspect both files",
          409,
        );
      if (this.recoveryErrors.has(problemNo))
        throw new ReviewError(this.recoveryErrors.get(problemNo)!, 409);
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
  ): Promise<ProblemReview> {
    const current = await this.get(problemNo);
    if (current.revision !== expectedRevision) {
      throw new ReviewError(
        "The translation changed on disk; reload before saving",
        409,
      );
    }
    const metadata = (await this.metadata()).get(problemNo)!;
    const savedReviewStatus =
      submittedSource === current.koreanSource
        ? current.reviewStatus
        : "unreviewed";
    let nextSource = submittedSource;
    if (current.sourceFormat === "mdx") {
      if (action === "save") {
        nextSource = setProblemMarkdownReviewStatus(
          removeProblemMarkdownMachineLabel(nextSource),
          savedReviewStatus,
        );
      } else if (action === "approve") {
        nextSource = setProblemMarkdownReviewStatus(
          removeProblemMarkdownMachineLabel(nextSource),
          "approved",
        );
      } else {
        if (submittedSource !== current.koreanSource) {
          throw new ReviewError("Save editor changes before unapproving");
        }
        nextSource = setProblemMarkdownReviewStatus(
          current.koreanSource,
          "unreviewed",
        );
      }
    } else if (action === "save") {
      nextSource = setReviewStatus(
        removeMachineLabel(nextSource),
        savedReviewStatus,
      );
    } else if (action === "approve") {
      nextSource = setReviewStatus(removeMachineLabel(nextSource), "approved");
    } else {
      if (submittedSource !== current.koreanSource) {
        throw new ReviewError("Save editor changes before unapproving");
      }
      nextSource = setReviewStatus(current.koreanSource, "unreviewed");
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
    const path = await this.translationPath(problemNo);
    await atomicFile(path, nextSource);
    return this.get(problemNo);
  }
}
