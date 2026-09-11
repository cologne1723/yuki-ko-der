import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { atomicFile } from "translation-core/atomic-file";
import {
  problemPublicSourceUrl,
  problemRenderProfileDirectory,
  readProblemRenderProfileRecord,
  writeProblemRenderProfile,
} from "translation-core/problem-render-profile-files";
import { expectedProblems } from "./setup.ts";
import { readSourceIndex } from "./source-store.ts";
import { pacedDownload, type CollectionOptions } from "./paced-download.ts";
import type {
  OperationContext,
  OperationItem,
  OperationResult,
} from "./types.ts";
export { retryAfterMilliseconds } from "./paced-download.ts";

/** One request at a time, including retries. Successful records are the resume cursor. */
export async function collectProblemRenderProfiles(
  context: OperationContext,
  options: CollectionOptions & { fullCorpus?: boolean } = {},
): Promise<OperationResult> {
  const now = options.now ?? Date.now;
  const directory = problemRenderProfileDirectory(context.dataRoot);
  await mkdir(directory, { recursive: true });
  const { DatabaseSync } = await import("node:sqlite");
  const lock = new DatabaseSync(join(directory, ".collection-lock.sqlite"));
  try {
    try {
      lock.exec("BEGIN IMMEDIATE");
    } catch (error) {
      throw new Error(
        "Another ground-truth collector owns this data directory",
        { cause: error },
      );
    }
    const download = await pacedDownload(
      context,
      join(directory, ".request-state.json"),
      options,
    );
    const translated = await expectedProblems(context);
    const numbers = new Set(translated.map((problem) => problem.metadata.No));
    if (options.fullCorpus)
      for (const problem of (
        await readSourceIndex(join(context.dataRoot, "problems-source"))
      ).problems)
        if (!context.problems || context.problems.includes(problem.No))
          numbers.add(problem.No);
    const problems = [...numbers].sort((a, b) => a - b);
    const items: OperationItem[] = [];
    const report = join(
      context.dataRoot,
      "reports",
      "problem-render-profiles.json",
    );
    await mkdir(join(context.dataRoot, "reports"), { recursive: true });
    const saveReport = async () =>
      atomicFile(
        report,
        JSON.stringify(
          {
            generatedAt: new Date(now()).toISOString(),
            source:
              "full public page script src; canonical source HTML and translation review state are unchanged",
            total: problems.length,
            completed: items.length,
            items,
          },
          null,
          2,
        ) + "\n",
      );
    await saveReport();
    for (const problemNo of problems) {
      context.signal?.throwIfAborted();
      let item: OperationItem;
      try {
        const cached = context.refresh
          ? undefined
          : await readProblemRenderProfileRecord(context.dataRoot, problemNo);
        if (cached) {
          item = {
            id: String(problemNo),
            status: "skipped",
            message: `Saved public page confirms ${cached.profile.engine} ${cached.profile.version}`,
          };
        } else {
          const html = new TextDecoder().decode(
            await download(problemPublicSourceUrl(problemNo), "text/html"),
          );
          const record = await writeProblemRenderProfile(
            context.dataRoot,
            problemNo,
            html,
            new Date(now()).toISOString(),
          );
          item = {
            id: String(problemNo),
            status: "saved",
            message: `Detected ${record.profile.engine} ${record.profile.version} from public page scripts`,
            details: record,
          };
        }
      } catch (error) {
        context.signal?.throwIfAborted();
        item = {
          id: String(problemNo),
          status: "failed",
          message: String(error),
        };
      }
      items.push(item);
      await saveReport();
      context.progress?.(item);
    }
    return { operation: "collect-problem-render-profiles", items, report };
  } finally {
    lock.close();
  }
}
