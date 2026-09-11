import { join } from "node:path";
import { dataDirectory, repositoryRoot } from "translation-core/paths";
import { atomicFile } from "translation-core/atomic-file";
import { readProblemRenderProfileRecord } from "translation-core/problem-render-profile-files";
import { expectedProblems } from "./operations/setup.ts";
import { sourceSamplesFingerprint } from "./problem-publication-data.ts";
import { offlinePublicationSchema } from "./offline-publication-data.ts";

// Local files only. Never fetch upstream during export or publication.
const dataRoot = dataDirectory();
const entries = [];
const errors: string[] = [];
for (const problem of await expectedProblems({ repositoryRoot, dataRoot })) {
  const problemNo = problem.metadata.No;
  try {
    const record = await readProblemRenderProfileRecord(dataRoot, problemNo);
    const sourceSamplesSha256 = await sourceSamplesFingerprint(dataRoot, {
      problemNo,
      problemId: problem.metadata.ProblemId,
      sourceTitle: problem.metadata.Title,
      sourceHtmlSha256: problem.hash,
    });
    if (!record || !sourceSamplesSha256)
      throw new Error(
        "Verified local profile or matching original revision unavailable",
      );
    entries.push({
      problemNo,
      sourceHtmlSha256: problem.hash,
      sourceSamplesSha256,
      pageHtmlSha256: record.pageHtmlSha256,
      profile: record.profile,
    });
  } catch (error) {
    errors.push(`${problemNo}: ${String(error)}`);
  }
}
if (errors.length) throw new Error(errors.join("\n"));
await atomicFile(
  join(repositoryRoot, "problem-translations/publication-data.json"),
  JSON.stringify(
    offlinePublicationSchema.parse({ schemaVersion: 1, entries }),
    null,
    2,
  ) + "\n",
);
console.log(
  `Exported ${entries.length} verified offline publication entries; no network requests`,
);
