import { mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { problemRenderProfileDirectory } from "translation-core/problem-render-profile-files";
import { expectedProblems } from "./setup.ts";
import {
  activateSource,
  atomicFile,
  readSourceIndex,
  recoverSourceStore,
  optionalFile,
  sha256,
  type SourceMetadata,
} from "./source-store.ts";
import { pacedDownload, type CollectionOptions } from "./paced-download.ts";
import {
  recordSourceDownload,
  readSourceDownload,
  finishSourceDownload,
  sourceDownloadNeedsReview,
} from "./source-downloads.ts";
import type {
  OperationContext,
  OperationItem,
  OperationResult,
} from "./types.ts";

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
    await recoverSourceStore(sourceRoot, context.signal);
    const expected = new Map(
      (await expectedProblems(context)).map((p) => [p.metadata.No, p]),
    );
    const savedTargets = new Map(
      (await readSourceIndex(sourceRoot)).problems.map((p) => [p.No, p]),
    );
    const targets = new Map(savedTargets);
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
        const active = await optionalFile(join(sourceRoot, `${no}.html`));
        const knownHashes = [
          ...(translated ? [translated.hash] : []),
          ...(active ? [sha256(active)] : []),
        ];
        const fresh = await readSourceDownload(
          sourceRoot,
          previous,
          since,
          knownHashes,
        );
        if (fresh) {
          const changed =
            fresh.requiresReview ||
            (translated &&
              (fresh.hash !== translated.hash ||
                fresh.title !== translated.metadata.Title));
          const needsActivation =
            !changed &&
            (!savedTargets.has(no) ||
              !active ||
              sha256(active) !== fresh.hash ||
              previous.Title !== fresh.title);
          if (needsActivation) {
            if (
              translated &&
              sha256(await readFile(translated.file)) !== translated.revision
            )
              throw new Error(
                "Translation changed during refresh; retry with current metadata",
              );
            await activateSource(
              sourceRoot,
              fresh.metadata,
              fresh.bytes,
              context.signal,
            );
          }
          await finishSourceDownload(
            sourceRoot,
            no,
            fresh.hash,
            changed ? "review-required" : "applied",
          );
          item = {
            id: String(no),
            status: changed
              ? "review-required"
              : needsActivation
                ? "saved"
                : "skipped",
            message: changed
              ? "Collected original requires review; preserved separately without replacing active data"
              : needsActivation
                ? "Activated previously collected original revision"
                : "Verified original revision was already collected during this refresh",
            details: { path: fresh.path, hash: fresh.hash, title: fresh.title },
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
          const hash = sha256(bytes);
          const revisionPath = await recordSourceDownload(
            sourceRoot,
            metadata,
            bytes,
            knownHashes,
          );
          if (
            sourceDownloadNeedsReview(bytes, knownHashes) ||
            (translated &&
              (hash !== translated.hash ||
                metadata.Title !== translated.metadata.Title))
          ) {
            await finishSourceDownload(sourceRoot, no, hash, "review-required");
            item = {
              id: String(no),
              status: "review-required",
              message:
                "Downloaded original requires review; retained revision without replacing its active original",
              details: {
                revisionPath,
                sourceHash: hash,
                expectedHash: translated?.hash,
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
            await finishSourceDownload(sourceRoot, no, hash, "applied");
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
