import { readdir, readFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { optionalFile } from "translation-audit/operations/source-store";
import { pLimit } from "translation-core/concurrency";
import { sha256 } from "translation-core/node-hash";
import { parseProblemMarkdown } from "translation-core/problem-frontmatter";
import {
  effectiveProblemStatus,
  metadataReviewStatus,
} from "translation-core/problem-review-status";
import { compileProblemMarkdown } from "translation-core/problem-markdown";
import { parseReviewState, ReviewError } from "translation-core/review-state";
import { z } from "translation-core/validation";
import type { ProblemReview, ProblemSummary } from "./problem-review.ts";
import { validateProblem } from "./problem-validation.ts";
const metadataSchema = z.looseObject({
  No: z.number().int().positive(),
  ProblemId: z.number().int().positive(),
  Title: z.string(),
});
const indexSchema = z
  .looseObject({ problems: z.array(metadataSchema) })
  .refine(
    ({ problems }) =>
      new Set(problems.map((p) => p.No)).size === problems.length &&
      new Set(problems.map((p) => p.ProblemId)).size === problems.length,
    "Source index contains duplicate public problem numbers or internal IDs",
  );
type ProblemMetadata = z.infer<typeof metadataSchema>;
export class ProblemRepository {
  constructor(
    readonly sourceDirectory: string,
    readonly translationDirectory: string,
    readonly indexPath: string,
    private recoveryErrors: Map<number, string>,
  ) {}
  async metadata(): Promise<Map<number, ProblemMetadata>> {
    try {
      const index = indexSchema.parse(
        JSON.parse(await readFile(this.indexPath, "utf8")),
      );
      return new Map(index.problems.map((problem) => [problem.No, problem]));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      return new Map();
    }
  }

  paths(problemNo: number): {
    japanese: string;
    koreanHtml: string;
    koreanMdx: string;
  } {
    if (!Number.isSafeInteger(problemNo) || problemNo < 1) {
      throw new ReviewError("Problem number must be a positive integer");
    }
    return {
      japanese: join(this.sourceDirectory, `${problemNo}.html`),
      koreanHtml: join(this.translationDirectory, `${problemNo}.html`),
      koreanMdx: join(this.translationDirectory, `${problemNo}.mdx`),
    };
  }

  async translationPath(problemNo: number): Promise<string> {
    const paths = this.paths(problemNo);
    const [mdx, html] = await Promise.all([
      optionalFile(paths.koreanMdx),
      optionalFile(paths.koreanHtml),
    ]);
    if (mdx && html)
      throw new ReviewError(
        `Problem ${problemNo} has both HTML and MDX sources; inspect both files before editing`,
        409,
      );
    if (this.recoveryErrors.has(problemNo))
      throw new ReviewError(this.recoveryErrors.get(problemNo)!, 409);
    return mdx ? paths.koreanMdx : paths.koreanHtml;
  }

  compile(path: string, source: string): string {
    return extname(path) === ".mdx" ? compileProblemMarkdown(source) : source;
  }

  async list(): Promise<ProblemSummary[]> {
    const metadata = await this.metadata();
    const available = new Map<number, string>();
    const duplicates = new Set<number>();
    for (const filename of await readdir(this.translationDirectory)) {
      const match = filename.match(/^(\d+)\.(html|mdx)$/u);
      if (!match) continue;
      const problemNo = Number(match[1]);
      if (available.has(problemNo)) {
        duplicates.add(problemNo);
      }
      available.set(problemNo, filename);
    }
    const filenames = [...available.values()].sort(
      (left, right) => Number.parseInt(left) - Number.parseInt(right),
    );
    const readSummary = pLimit(8);
    return Promise.all(
      filenames.map((filename) =>
        readSummary(async () => {
          const problemNo = Number.parseInt(filename, 10);
          const problem = metadata.get(problemNo);
          const path = join(this.translationDirectory, filename);
          const source = await readFile(path, "utf8");
          let state: ReturnType<typeof parseReviewState>;
          let validationErrors: string[] = [];
          if (duplicates.has(problemNo))
            validationErrors.push(
              `Problem ${problemNo} has both HTML and MDX sources; inspect both files before editing`,
            );
          if (this.recoveryErrors.has(problemNo))
            validationErrors.push(this.recoveryErrors.get(problemNo)!);
          try {
            // A list needs metadata only; get() and the audit validate the body.
            if (extname(path) === ".mdx") {
              const { metadata } = parseProblemMarkdown(source);
              const status = metadataReviewStatus(metadata);
              state = {
                koreanTitle: metadata.title.trim(),
                machineTranslated: status === "machine",
                reviewStatus: effectiveProblemStatus(status),
                ...(typeof status === "object" ? { reviews: status } : {}),
              };
            } else {
              state = parseReviewState(source);
            }
          } catch (error) {
            state = {
              koreanTitle: `No.${problemNo}`,
              reviewStatus: "unreviewed",
              machineTranslated: false,
            };
            validationErrors.push(String(error));
          }
          return {
            problemNo,
            japaneseTitle:
              problem?.Title ??
              "Original unavailable — download from Tools and settings",
            ...state,
            ...(validationErrors.length ? { validationErrors } : {}),
          };
        }),
      ),
    );
  }

  async get(problemNo: number): Promise<ProblemReview> {
    const paths = this.paths(problemNo);
    const koreanPath = await this.translationPath(problemNo);
    let japaneseHtml: string;
    let koreanSource: string;
    let koreanHtml = "";
    const validationErrors: string[] = [];
    try {
      japaneseHtml = await readFile(paths.japanese, "utf8");
    } catch {
      throw new ReviewError(
        `Problem ${problemNo} original is unavailable. Use Refresh original or Tools and settings to download it.`,
        404,
      );
    }
    try {
      koreanSource = await readFile(koreanPath, "utf8");
    } catch {
      throw new ReviewError(`Problem ${problemNo} translation is missing`, 404);
    }
    try {
      koreanHtml = this.compile(koreanPath, koreanSource);
    } catch (error) {
      validationErrors.push(
        `Problem ${problemNo} translation is invalid: ${String(error)}`,
      );
    }
    const metadata = (await this.metadata()).get(problemNo);
    if (!metadata) {
      throw new ReviewError(
        `Problem ${problemNo} is absent from the saved index`,
        404,
      );
    }
    let validationWarnings: string[] = [];
    let state: ReturnType<typeof parseReviewState> = {
      koreanTitle: `No.${problemNo}`,
      reviewStatus: "unreviewed",
      machineTranslated: false,
    };
    if (koreanHtml) {
      try {
        state = parseReviewState(koreanHtml);
        validationWarnings = validateProblem(
          problemNo,
          japaneseHtml,
          koreanHtml,
          metadata,
          extname(koreanPath) === ".mdx" ? "mdx" : "html",
        );
      } catch (error) {
        validationErrors.push(String(error));
      }
    }
    return {
      problemNo,
      japaneseTitle: metadata.Title,
      japaneseHtml,
      koreanSource,
      koreanHtml,
      sourceFormat: extname(koreanPath) === ".mdx" ? "mdx" : "html",
      revision: sha256(koreanSource),
      validationWarnings,
      ...state,
      ...(validationErrors.length ? { validationErrors } : {}),
    };
  }
}
