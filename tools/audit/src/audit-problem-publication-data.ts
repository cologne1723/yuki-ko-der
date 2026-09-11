import { mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { atomicFile } from "translation-core/atomic-file";
import { readProblemRenderProfile } from "translation-core/problem-render-profile-files";
import { sourceSamplesFingerprint } from "./problem-publication-data.ts";
import { expectedProblems } from "./operations/setup.ts";
import { cliContext } from "./operations/cli.ts";
import type { OperationContext } from "./operations/types.ts";

/** Offline audit only: no requests and no changes to originals or translations. */
export async function auditProblemPublicationData(context: OperationContext) {
  const report = join(
    context.dataRoot,
    "reports",
    "problem-publication-data.json",
  );
  await mkdir(join(context.dataRoot, "reports"), { recursive: true });
  let problems: Awaited<ReturnType<typeof expectedProblems>>;
  try {
    problems = await expectedProblems(context);
  } catch (error) {
    // Record all metadata errors returned by expectedProblems instead of leaving
    // a stale successful report when concurrent/new translation input is invalid.
    await atomicFile(
      report,
      JSON.stringify(
        {
          schemaVersion: 1,
          generatedAt: new Date().toISOString(),
          phase: "error",
          processed: 0,
          publicationBlockingErrors: [
            { stage: "translation-metadata", error: String(error) },
          ],
        },
        null,
        2,
      ) + "\n",
    );
    throw error;
  }
  const unavailableProfiles: number[] = [];
  const invalidProfiles: { problemNo: number; error: string }[] = [];
  const unavailableSourceRevisions: {
    problemNo: number;
    sourceHtmlSha256: string;
  }[] = [];
  const sourceErrors: { problemNo: number; error: string }[] = [];
  const profiles: Record<string, number> = {};
  let processed = 0,
    sampleDigests = 0;
  const save = (phase: "running" | "complete") =>
    atomicFile(
      report,
      JSON.stringify(
        {
          schemaVersion: 1,
          generatedAt: new Date().toISOString(),
          phase,
          totalTranslations: problems.length,
          processed,
          publicationPolicy: {
            unavailableProfile:
              "Keep translation and catalog entry; standalone page shows explicit unavailable notice and does not select a default renderer. The extension detects the actual public page profile.",
            unavailableSourceRevision:
              "Keep translation and catalog entry; omit optional sourceSamplesSha256. Never substitute a newer original or update approval metadata.",
          },
          profileCounts: profiles,
          profilesAvailable: Object.values(profiles).reduce(
            (sum, count) => sum + count,
            0,
          ),
          sourceSamplesDigestsAvailable: sampleDigests,
          unavailableProfiles,
          invalidProfiles,
          unavailableSourceRevisions,
          publicationBlockingErrors: sourceErrors,
        },
        null,
        2,
      ) + "\n",
    );
  await save("running");
  for (const problem of problems) {
    context.signal?.throwIfAborted();
    const problemNo = problem.metadata.No;
    const [profileResult, sampleResult] = await Promise.allSettled([
      readProblemRenderProfile(context.dataRoot, problemNo),
      sourceSamplesFingerprint(context.dataRoot, {
        problemNo,
        problemId: problem.metadata.ProblemId,
        sourceTitle: problem.metadata.Title,
        sourceHtmlSha256: problem.hash,
      }),
    ]);
    if (profileResult.status === "rejected")
      invalidProfiles.push({ problemNo, error: String(profileResult.reason) });
    else if (!profileResult.value) unavailableProfiles.push(problemNo);
    else {
      const key = `${profileResult.value.engine}@${profileResult.value.version}`;
      profiles[key] = (profiles[key] ?? 0) + 1;
    }
    if (sampleResult.status === "rejected")
      sourceErrors.push({ problemNo, error: String(sampleResult.reason) });
    else if (!sampleResult.value)
      unavailableSourceRevisions.push({
        problemNo,
        sourceHtmlSha256: problem.hash,
      });
    else sampleDigests++;
    processed++;
    if (processed % 100 === 0) await save("running");
  }
  await save("complete");
  return {
    report,
    total: problems.length,
    sampleDigests,
    profiles,
    unavailableProfiles: unavailableProfiles.length,
    invalidProfiles: invalidProfiles.length,
    unavailableSourceRevisions: unavailableSourceRevisions.length,
    blockingErrors: sourceErrors.length,
  };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const result = await auditProblemPublicationData(cliContext());
  console.log(JSON.stringify(result));
  if (result.blockingErrors) process.exitCode = 1;
}
