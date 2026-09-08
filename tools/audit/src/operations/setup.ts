import { JSDOM } from "jsdom";
import { mkdir, readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
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
  for (const file of (await readdir(root)).sort(
    (a, b) => parseInt(a) - parseInt(b),
  )) {
    if (
      !/^\d+\.(mdx|html)$/.test(file) ||
      (context.problems && !context.problems.includes(parseInt(file)))
    )
      continue;
    const path = join(root, file),
      raw = await readFile(path, "utf8");
    if (file.endsWith(".mdx")) {
      const m = parseProblemMarkdown(raw).metadata;
      results.push({
        metadata: {
          No: m.problemNo,
          ProblemId: m.problemId,
          Title: m.sourceTitle,
        },
        reviewStatus: m.reviewStatus,
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
  }
  if (context.problems)
    for (const no of context.problems)
      if (!results.some((e) => e.metadata.No === no))
        throw new Error(`Problem ${no} has no translation`);
  return results;
}
async function download(context: OperationContext, url: string) {
  let failure: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    context.signal?.throwIfAborted();
    try {
      const signal = context.signal
        ? AbortSignal.any([context.signal, AbortSignal.timeout(20000)])
        : AbortSignal.timeout(20000);
      const response = await (context.request ?? fetch)(url, {
        signal,
        headers: { "User-Agent": "yukicoder-ko-setup" },
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}: ${url}`);
      return {
        bytes: new Uint8Array(await response.arrayBuffer()),
        url: response.url || url,
      };
    } catch (error) {
      context.signal?.throwIfAborted();
      failure = error;
    }
  }
  throw failure;
}
const same = (a: SourceMetadata | undefined, b: SourceMetadata) =>
  a?.No === b.No && a.ProblemId === b.ProblemId && a.Title === b.Title;
export async function setupData(
  context: OperationContext,
  selection: "problems" | "pages" | "both" = "both",
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
