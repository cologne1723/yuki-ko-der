import { mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { atomicFile } from "translation-core/atomic-file";
import { defaultDataDirectory, repositoryRoot } from "translation-core/paths";
import { waitForCorpusDownloader } from "./collect-problem-render-profiles.ts";
import { runGroundTruthPipeline } from "./operations/ground-truth-pipeline.ts";

/** Background chain: existing downloader -> originals -> profiles -> local build -> audit. */
export async function runGroundTruthCollection(args = process.argv.slice(2)) {
  const { values } = parseArgs({
    args,
    options: {
      "after-pid": { type: "string" },
      "refreshed-since": { type: "string" },
      "data-dir": { type: "string" },
      "interval-ms": { type: "string" },
    },
  });
  const afterPid = Number(values["after-pid"]);
  const refreshedSince = values["refreshed-since"];
  const intervalMs = Number(values["interval-ms"] ?? 3000);
  if (
    !Number.isSafeInteger(afterPid) ||
    afterPid < 1 ||
    !refreshedSince ||
    !Number.isFinite(Date.parse(refreshedSince)) ||
    !Number.isSafeInteger(intervalMs) ||
    intervalMs < 1000
  )
    throw new Error(
      "Use --after-pid PID --refreshed-since ISO_DATE [--interval-ms 3000] [--data-dir data]",
    );
  const dataRoot = values["data-dir"]
    ? resolve(repositoryRoot, values["data-dir"])
    : defaultDataDirectory();
  const reports = join(dataRoot, "reports");
  await mkdir(reports, { recursive: true });
  const { DatabaseSync } = await import("node:sqlite");
  const queueLock = new DatabaseSync(
    join(reports, ".ground-truth-queue.sqlite"),
  );
  const controller = new AbortController();
  const abort = () =>
    controller.abort(
      new Error(
        "Ground-truth collection interrupted; saved revisions and profiles retained",
      ),
    );
  let ownsLock = false;
  let phase = "starting";
  let details: Record<string, unknown> = {};
  const status = async (next: string, update: Record<string, unknown> = {}) => {
    phase = next;
    details = { ...details, ...update };
    await atomicFile(
      join(reports, "ground-truth-queue.json"),
      JSON.stringify(
        {
          pid: process.pid,
          afterPid,
          refreshedSince,
          phase,
          plannedStages: [
            "remaining-originals",
            "public-page-profiles",
            "local-publication-build",
            "publication-audit",
          ],
          updatedAt: new Date().toISOString(),
          ...details,
        },
        null,
        2,
      ) + "\n",
    );
  };
  try {
    queueLock.exec("BEGIN IMMEDIATE");
    ownsLock = true;
    process.once("SIGINT", abort);
    process.once("SIGTERM", abort);
    await status("waiting-for-existing-downloader");
    await waitForCorpusDownloader(afterPid, controller.signal);
    const context = {
      repositoryRoot,
      dataRoot,
      signal: controller.signal,
      progress: (item: { id: string; status: string; message: string }) =>
        console.log(`${item.id}: ${item.status}: ${item.message}`),
    };
    const result = await runGroundTruthPipeline(
      context,
      { refreshedSince, intervalMs },
      async (state, pipelineReport) =>
        status(state.phase, {
          pipelineReport,
          errors: state.errors,
          reviewRequired: state.reviewRequired,
          stageResults: state.stages,
        }),
    );
    console.log(
      `Ground-truth pipeline ${result.phase}: ${result.errors.length} failures; ${result.reviewRequired} original revisions require review. Report: ${result.report}`,
    );
    if (result.phase === "error") process.exitCode = 1;
  } catch (error) {
    // A competing queue must not overwrite the active owner's status.
    if (!ownsLock) throw error;
    await status("error", { failedPhase: phase, error: String(error) });
    console.error(error);
    process.exitCode = 1;
  } finally {
    process.removeListener("SIGINT", abort);
    process.removeListener("SIGTERM", abort);
    queueLock.close();
  }
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
)
  await runGroundTruthCollection();
