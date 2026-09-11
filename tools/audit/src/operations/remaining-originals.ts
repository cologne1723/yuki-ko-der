import { JSDOM } from "jsdom";
import { mkdir, readFile, readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { problemRenderProfileDirectory } from "translation-core/problem-render-profile-files";
import { sourceStatementBlocks } from "translation-core/problem-document";
import { expectedProblems } from "./setup.ts";
import {
  activateSource,
  atomicFile,
  preserveSource,
  readSourceIndex,
  sha256,
  type SourceMetadata,
} from "./source-store.ts";
import { pacedDownload, type CollectionOptions } from "./paced-download.ts";
import type {
  OperationContext,
  OperationItem,
  OperationResult,
} from "./types.ts";

/** A verified revision written during the preceding refresh proves this original was collected. */
async function refreshedRevision(
  root: string,
  metadata: SourceMetadata,
  since: number,
) {
  const directory = join(root, "revisions", String(metadata.No));
  let files: string[];
  try {
    files = await readdir(directory);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
  const recent: { path: string; modified: number }[] = [];
  for (const file of files) {
    if (!/^[a-f0-9]{64}\.json$/u.test(file)) continue;
    const path = join(directory, file),
      modified = (await stat(path)).mtimeMs;
    if (modified >= since) recent.push({ path, modified });
  }
  for (const { path } of recent.sort((a, b) => b.modified - a.modified)) {
    const revision = JSON.parse(await readFile(path, "utf8"));
    if (
      revision.metadata?.No !== metadata.No ||
      revision.metadata?.ProblemId !== metadata.ProblemId ||
      typeof revision.html !== "string"
    )
      continue;
    if (sha256(Buffer.from(revision.html, "base64")) !== revision.htmlSha256)
      throw new Error(`Refreshed original evidence hash mismatch: ${path}`);
    return {
      path,
      hash: revision.htmlSha256 as string,
      title: revision.metadata.Title as string,
    };
  }
  return undefined;
}

/** Refresh the full saved corpus plus translations added since the previous job started. */
export async function collectRemainingOriginals(
  context: OperationContext,
  options: CollectionOptions & { refreshedSince: string },
): Promise<OperationResult> {
  const since = Date.parse(options.refreshedSince);
  if (!Number.isFinite(since))
    throw new Error("A valid original refresh start time is required");
  const sourceRoot = join(context.dataRoot, "problems-source");
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
    const expected = new Map(
      (await expectedProblems(context)).map((p) => [p.metadata.No, p]),
    );
    const targets = new Map(
      (await readSourceIndex(sourceRoot)).problems.map((p) => [p.No, p]),
    );
    for (const [no, problem] of expected)
      if (!targets.has(no)) targets.set(no, problem.metadata);
    const items: OperationItem[] = [];
    const report = join(
      context.dataRoot,
      "reports",
      "remaining-originals-refresh.json",
    );
    await mkdir(join(context.dataRoot, "reports"), { recursive: true });
    const saveReport = () =>
      atomicFile(
        report,
        JSON.stringify(
          {
            refreshedSince: options.refreshedSince,
            updatedAt: new Date().toISOString(),
            total: targets.size,
            completed: items.length,
            items,
          },
          null,
          2,
        ) + "\n",
      );
    await saveReport();
    for (const [no, previous] of [...targets].sort(([a], [b]) => a - b)) {
      if (context.problems && !context.problems.includes(no)) continue;
      context.signal?.throwIfAborted();
      let item: OperationItem;
      try {
        const translated = expected.get(no);
        if (translated && previous.ProblemId !== translated.metadata.ProblemId)
          throw new Error(
            "Saved corpus and translation disagree on problem identity",
          );
        const fresh = await refreshedRevision(sourceRoot, previous, since);
        if (fresh) {
          const changed =
            translated &&
            (fresh.hash !== translated.hash ||
              fresh.title !== translated.metadata.Title);
          item = {
            id: String(no),
            status: changed ? "review-required" : "skipped",
            message: changed
              ? "Collected original differs from translation; preserved revision requires review"
              : "Verified original revision was already collected during this refresh",
            details: fresh,
          };
        } else {
          const url = `https://yukicoder.me/api/v1/problems/${previous.ProblemId}`;
          const metadata = JSON.parse(
            new TextDecoder().decode(await download(url, "application/json")),
          ) as SourceMetadata;
          if (
            metadata.No !== no ||
            metadata.ProblemId !== previous.ProblemId ||
            typeof metadata.Title !== "string"
          )
            throw new Error("Canonical metadata identity mismatch");
          const bytes = await download(`${url}/html`);
          const dom = new JSDOM(new TextDecoder().decode(bytes));
          try {
            if (
              !sourceStatementBlocks(dom.window.document.body).some((block) =>
                block.matches(".block"),
              )
            )
              throw new Error("Empty or unexpected canonical statement HTML");
          } finally {
            dom.window.close();
          }
          const revisionPath = await preserveSource(
            sourceRoot,
            metadata,
            bytes,
          );
          const hash = sha256(bytes);
          if (
            translated &&
            (hash !== translated.hash ||
              metadata.Title !== translated.metadata.Title)
          ) {
            item = {
              id: String(no),
              status: "review-required",
              message:
                "Upstream differs from translation; retained revision without replacing its active original",
              details: {
                revisionPath,
                sourceHash: hash,
                expectedHash: translated.hash,
              },
            };
          } else {
            if (
              translated &&
              sha256(await readFile(translated.file)) !== translated.revision
            )
              throw new Error(
                "Translation changed during refresh; downloaded revision retained, retry with current metadata",
              );
            await activateSource(sourceRoot, metadata, bytes, context.signal);
            item = {
              id: String(no),
              status: "saved",
              message: "Saved original with previous revisions retained",
              details: { revisionPath, sourceHash: hash },
            };
          }
        }
      } catch (error) {
        context.signal?.throwIfAborted();
        item = { id: String(no), status: "failed", message: String(error) };
      }
      items.push(item);
      await saveReport();
      context.progress?.(item);
    }
    return { operation: "collect-remaining-originals", items, report };
  } finally {
    lock.close();
  }
}
