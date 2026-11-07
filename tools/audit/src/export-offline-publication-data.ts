import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { readFile } from "node:fs/promises";
import { compileProblemMarkdown } from "translation-core/problem-markdown";
import { dataDirectory, repositoryRoot } from "translation-core/paths";
import { atomicFile } from "translation-core/atomic-file";
import { readProblemRenderProfileRecord } from "translation-core/problem-render-profile-files";
import { expectedProblems } from "./operations/setup.ts";
import {
  sourceSamplesFingerprint,
  validatedTranslationSamples,
} from "./problem-publication-data.ts";
import { offlinePublicationSchema } from "./offline-publication-data.ts";
import { readProblemTitleCatalog } from "translation-core/problem-title-catalog";

// Local files only. Never fetch upstream during export or publication.
export async function exportOfflinePublicationData(options: {
  repositoryRoot: string;
  dataRoot: string;
  outputPath?: string;
}): Promise<number> {
  const { repositoryRoot, dataRoot } = options;
  const visible = new Set(
    (
      await readProblemTitleCatalog(
        join(repositoryRoot, "problem-translations/ko/problems"),
        join(dataRoot, "problems-source/index.json"),
      )
    ).map((problem) => problem.problemNo),
  );
  const entries = [];
  const errors: string[] = [];
  for (const problem of await expectedProblems({ repositoryRoot, dataRoot })) {
    const problemNo = problem.metadata.No;
    // Match publication visibility before requiring a profile or validating a
    // draft's samples. Hidden drafts must not block updates to public evidence.
    if (!visible.has(problemNo)) continue;
    try {
      const record = await readProblemRenderProfileRecord(dataRoot, problemNo);
      const sourceRevision = {
        problemNo,
        problemId: problem.metadata.ProblemId,
        sourceTitle: problem.metadata.Title,
        sourceHtmlSha256: problem.hash,
      };
      const sourceSamplesSha256 = await sourceSamplesFingerprint(
        dataRoot,
        sourceRevision,
      );
      const raw = await readFile(problem.file, "utf8");
      const evidence = await validatedTranslationSamples(
        dataRoot,
        sourceRevision,
        problem.file.endsWith(".mdx") ? compileProblemMarkdown(raw) : raw,
      );
      if (!record || !sourceSamplesSha256)
        throw new Error(
          "Verified local profile or matching original revision unavailable",
        );
      entries.push({
        problemNo,
        sourceHtmlSha256: problem.hash,
        sourceSamplesSha256,
        translationSamplesSha256: evidence?.sha256,
        sourceSampleIndices: evidence?.sourceSampleIndices,
        pageHtmlSha256: record.pageHtmlSha256,
        profile: record.profile,
      });
    } catch (error) {
      errors.push(`${problemNo}: ${String(error)}`);
    }
  }
  if (errors.length) throw new Error(errors.join("\n"));
  await atomicFile(
    options.outputPath ??
      join(repositoryRoot, "problem-translations/publication-data.json"),
    JSON.stringify(
      offlinePublicationSchema.parse({ schemaVersion: 1, entries }),
      null,
      2,
    ) + "\n",
  );
  return entries.length;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const count = await exportOfflinePublicationData({
    repositoryRoot,
    dataRoot: dataDirectory(),
  });
  console.log(
    `Exported ${count} verified offline publication entries; no network requests`,
  );
}
