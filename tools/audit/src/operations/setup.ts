import {
  legacyProblemStatus,
  metadataReviewStatus,
} from "translation-core/problem-review-status";
import { JSDOM } from "jsdom";
import { mkdir, readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { problemRenderProfileDirectory } from "translation-core/problem-render-profile-files";
import { pacedDownload, type CollectionOptions } from "./paced-download.ts";
import { parseProblemMarkdown } from "translation-core/problem-markdown";
import { parseReviewState } from "translation-core/review-state";
import {
  activateSource,
  atomicFile,
  optionalFile,
  preserveSource,
  readSourceIndex,
  recoverSourceStore,
  sha256,
  type SourceMetadata,
} from "./source-store.ts";
import type {
  OperationContext,
  OperationItem,
  OperationResult,
} from "./types.ts";
interface Expected {
  reviewStatus: NonNullable<OperationItem["reviewStatus"]>;
  metadata: SourceMetadata;
  hash: string;
  file: string;
  revision: string;
}
export async function expectedProblems(
  context: OperationContext,
): Promise<Expected[]> {
  const root = join(context.repositoryRoot, "problem-translations/ko/problems");
  const results: Expected[] = [];
  const errors: string[] = [];
  for (const file of (await readdir(root)).sort(
    (a, b) => parseInt(a) - parseInt(b),
  )) {
    if (
      !/^\d+\.(mdx|html)$/.test(file) ||
      (context.problems && !context.problems.includes(parseInt(file)))
    )
      continue;
    try {
      const path = join(root, file),
        raw = await readFile(path, "utf8");
      if (file.endsWith(".mdx")) {
        const m = parseProblemMarkdown(raw).metadata;
        if (m.problemNo !== parseInt(file))
          throw new Error(
            `filename No ${parseInt(file)} differs from problemNo ${m.problemNo}`,
          );
        results.push({
          metadata: {
            No: m.problemNo,
            ProblemId: m.problemId,
            Title: m.sourceTitle,
          },
          reviewStatus: legacyProblemStatus(metadataReviewStatus(m)),
          hash: m.sourceHtmlSha256,
          file: path,
          revision: sha256(raw),
        });
      } else {
        const dom = new JSDOM(raw);
        try {
          const m = dom.window.document.querySelector<HTMLElement>(
            "main[data-yukicoder-ko-problem]",
          )?.dataset;
          if (!m?.sourceHtmlSha256)
            throw new Error(`${file}: missing source metadata`);
          if (
            Number(m.problemNo) !== parseInt(file) ||
            !Number.isSafeInteger(Number(m.problemId)) ||
            Number(m.problemId) < 1
          )
            throw new Error(
              `invalid public number or internal ID (problemNo=${m.problemNo}, problemId=${m.problemId})`,
            );
          const state = parseReviewState(raw);
          results.push({
            reviewStatus: state.machineTranslated
              ? "machine"
              : state.reviewStatus,
            metadata: {
              No: Number(m.problemNo),
              ProblemId: Number(m.problemId),
              Title: m.sourceTitle!,
            },
            hash: m.sourceHtmlSha256,
            file: path,
            revision: sha256(raw),
          });
        } finally {
          dom.window.close();
        }
      }
    } catch (error) {
      errors.push(`${file}: ${String(error)}`);
    }
  }
  if (context.problems)
    for (const no of context.problems)
      if (!results.some((e) => e.metadata.No === no))
        errors.push(`Problem ${no} has no valid translation`);
  if (errors.length) throw new Error(errors.join("\n"));
  return results;
}
const same = (a: SourceMetadata | undefined, b: SourceMetadata) =>
  a?.No === b.No && a.ProblemId === b.ProblemId && a.Title === b.Title;
export async function setupData(
  context: OperationContext,
  selection: "problems" | "pages" | "both" = "both",
  options: CollectionOptions = {},
): Promise<OperationResult> {
  // Share ownership and persisted cooldown with the profile/original collectors.
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
    const request = await pacedDownload(
      context,
      join(directory, ".request-state.json"),
      { attempts: 3, ...options },
    );
    return await setupDataWithDownload(
      context,
      selection,
      async (_context, url) => ({ bytes: await request(url), url }),
    );
  } finally {
    lock.close();
  }
}

async function setupDataWithDownload(
  context: OperationContext,
  selection: "problems" | "pages" | "both",
  download: (
    context: OperationContext,
    url: string,
  ) => Promise<{ bytes: Uint8Array; url: string }>,
): Promise<OperationResult> {
  const problemsRoot = join(context.dataRoot, "problems-source"),
    pagesRoot = join(context.dataRoot, "pages");
  const items: OperationItem[] = [];
  const reviewStatuses = new Map<string, OperationItem["reviewStatus"]>();
  const report = (item: OperationItem) => {
    if (reviewStatuses.has(item.id))
      item.reviewStatus = reviewStatuses.get(item.id);
    items.push(item);
    context.progress?.(item);
  };
  if (selection !== "pages") {
    await recoverSourceStore(problemsRoot, context.signal);
    const expected = await expectedProblems(context);
    for (const problem of expected) {
      reviewStatuses.set(String(problem.metadata.No), problem.reviewStatus);
      context.signal?.throwIfAborted();
      const id = String(problem.metadata.No);
      try {
        const index = await readSourceIndex(problemsRoot);
        const cached = await optionalFile(join(problemsRoot, `${id}.html`));
        if (
          !context.refresh &&
          same(
            index.problems.find((e) => e.No === problem.metadata.No),
            problem.metadata,
          ) &&
          cached &&
          sha256(cached) === problem.hash
        ) {
          report({
            id,
            status: "skipped",
            message:
              "Saved original matches translation identity, title and hash",
          });
          continue;
        }
        const url = `https://yukicoder.me/api/v1/problems/${problem.metadata.ProblemId}`;
        const metadata = JSON.parse(
          new TextDecoder().decode((await download(context, url)).bytes),
        ) as SourceMetadata;
        if (
          metadata.No !== problem.metadata.No ||
          metadata.ProblemId !== problem.metadata.ProblemId ||
          typeof metadata.Title !== "string"
        )
          throw new Error("Canonical metadata identity mismatch");
        const html = (await download(context, `${url}/html`)).bytes;
        const revisionPath = await preserveSource(problemsRoot, metadata, html);
        if (
          !same(metadata, problem.metadata) ||
          sha256(html) !== problem.hash
        ) {
          report({
            id,
            status: "review-required",
            message:
              "Upstream original differs from translation metadata; retained separately without replacing active data",
            details: {
              revisionPath,
              sourceHash: sha256(html),
              expectedHash: problem.hash,
              metadata,
            },
          });
          continue;
        }
        if (sha256(await readFile(problem.file)) !== problem.revision)
          throw new Error(
            "Translation changed during refresh; retry with its current metadata",
          );
        await activateSource(problemsRoot, metadata, html, context.signal);
        report({
          id,
          status: "saved",
          message:
            "Saved matching canonical bytes and index; previous revision retained",
        });
      } catch (error) {
        context.signal?.throwIfAborted();
        report({ id, status: "failed", message: String(error) });
      }
    }
  }
  if (selection !== "problems") {
    await mkdir(pagesRoot, { recursive: true });
    const tasks = JSON.parse(
      await readFile(
        join(context.repositoryRoot, "tools/audit/src/ui-page-sources.json"),
        "utf8",
      ),
    ) as Record<string, string>;
    const saved = await optionalFile(join(pagesRoot, "index.json"));
    const index = saved
      ? (JSON.parse(saved.toString()) as Record<string, unknown>)
      : {};
    for (const [id, path] of Object.entries(tasks)) {
      context.signal?.throwIfAborted();
      if (!/^[a-zA-Z0-9_-]+$/.test(id)) throw new Error("Invalid preview name");
      const destination = join(pagesRoot, `${id}.html`),
        url = new URL(path, "https://yukicoder.me");
      if (url.origin !== "https://yukicoder.me")
        throw new Error("Invalid preview origin");
      if (!context.refresh && (await optionalFile(destination))) {
        report({ id, status: "skipped", message: "Saved UI preview exists" });
        continue;
      }
      try {
        const response = await download(context, url.href);
        if (/\/(login|signin)([/?]|$)/.test(response.url))
          throw new Error("Authentication required");
        await atomicFile(destination, response.bytes);
        index[id] = { url: url.href, finalUrl: response.url, available: true };
        report({ id, status: "saved", message: "Saved UI preview" });
      } catch (error) {
        context.signal?.throwIfAborted();
        index[id] = {
          url: url.href,
          available: Boolean(await optionalFile(destination)),
          error: String(error),
        };
        report({
          id,
          status: "failed",
          message: `Optional preview unavailable: ${String(error)}`,
        });
      }
      await atomicFile(
        join(pagesRoot, "index.json"),
        JSON.stringify(index, null, 2) + "\n",
      );
    }
  }
  return { operation: "setup", items };
}
