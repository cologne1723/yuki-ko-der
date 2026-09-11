import { execFile } from "node:child_process";
import { resolve } from "node:path";
import { setTimeout } from "node:timers/promises";
import { pathToFileURL } from "node:url";
import { parseArgs, promisify } from "node:util";
import { defaultDataDirectory, repositoryRoot } from "translation-core/paths";
import { collectProblemRenderProfiles } from "./operations/problem-render-profiles.ts";
import { problemSelection } from "./operations/types.ts";

/** Read-only process inspection; an inspection failure must never permit a crawl. */
export async function activeCorpusDownloaders(): Promise<number[]> {
  const { stdout } = await promisify(execFile)("ps", ["-axo", "pid=,command="]);
  return stdout.split("\n").flatMap((line) => {
    const match = line.trim().match(/^(\d+)\s+(.+)$/u);
    if (
      !match ||
      Number(match[1]) === process.pid ||
      !/^(?:\S*\/)?node\s/u.test(match[2]) ||
      !/(?:download-problem-corpus\.(?:ts|js)|download-remaining-originals\.(?:ts|js)|collect-problem-ground-truth\.(?:ts|js)|setup\.ts.*--problems-only)/u.test(
        match[2],
      )
    )
      return [];
    return [Number(match[1])];
  });
}

export async function waitForCorpusDownloader(
  afterPid?: number,
  signal?: AbortSignal,
): Promise<void> {
  if (
    afterPid !== undefined &&
    (!Number.isSafeInteger(afterPid) ||
      afterPid < 1 ||
      afterPid === process.pid)
  )
    throw new Error("--after-pid requires the existing downloader process ID");
  let previous = "";
  for (;;) {
    signal?.throwIfAborted();
    const active = new Set(await activeCorpusDownloaders());
    if (afterPid !== undefined) {
      try {
        process.kill(afterPid, 0);
        active.add(afterPid);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
      }
    }
    if (!active.size) return;
    const message = `Waiting for existing corpus downloader PID(s) ${[...active].join(", ")}; no profile requests have started.`;
    if (message !== previous) {
      console.log(message);
      previous = message;
    }
    await setTimeout(30000, undefined, { signal });
  }
}

export async function runProfileCollector(args = process.argv.slice(2)) {
  const { values } = parseArgs({
    args,
    options: {
      "data-dir": { type: "string" },
      problems: { type: "string" },
      refresh: { type: "boolean" },
      "after-pid": { type: "string" },
      "interval-ms": { type: "string" },
      attempts: { type: "string" },
      help: { type: "boolean" },
    },
  });
  if (values.help) {
    console.log(
      "node --import tsx tools/audit/src/collect-problem-render-profiles.ts [--problems 204,2025-2026] [--data-dir data] [--after-pid PID] [--interval-ms 3000] [--attempts 5] [--refresh]\nWaits for active corpus downloaders, then collects full public pages sequentially. Saved verified profiles resume automatically; --refresh replaces profile evidence only.",
    );
    return;
  }
  const problems = problemSelection(values.problems);
  const intervalMs =
    values["interval-ms"] === undefined ? 3000 : Number(values["interval-ms"]);
  const attempts = values.attempts === undefined ? 5 : Number(values.attempts);
  if (
    !Number.isSafeInteger(intervalMs) ||
    intervalMs < 1000 ||
    !Number.isSafeInteger(attempts) ||
    attempts < 1 ||
    attempts > 10
  )
    throw new Error(
      "Use --interval-ms >= 1000 and --attempts between 1 and 10",
    );
  const controller = new AbortController();
  const abort = () =>
    controller.abort(
      new Error("Profile collection interrupted; completed profiles retained"),
    );
  process.once("SIGINT", abort);
  process.once("SIGTERM", abort);
  try {
    await waitForCorpusDownloader(
      values["after-pid"] === undefined
        ? undefined
        : Number(values["after-pid"]),
      controller.signal,
    );
    const result = await collectProblemRenderProfiles(
      {
        repositoryRoot,
        dataRoot:
          values["data-dir"] === undefined
            ? defaultDataDirectory()
            : resolve(repositoryRoot, values["data-dir"]),
        problems,
        refresh: values.refresh,
        signal: controller.signal,
        progress: (item) =>
          console.log(`${item.id}: ${item.status}: ${item.message}`),
      },
      { intervalMs, attempts },
    );
    const failures = result.items.filter((item) => item.status === "failed");
    console.log(
      `Profile collection: ${result.items.length} problems; ${failures.length} failures. Report: ${result.report}`,
    );
    if (failures.length) process.exitCode = 1;
  } finally {
    process.removeListener("SIGINT", abort);
    process.removeListener("SIGTERM", abort);
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
)
  await runProfileCollector();
