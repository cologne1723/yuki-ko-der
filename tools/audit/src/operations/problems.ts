import { htmlLanguage } from "@codemirror/lang-html";
import { JSDOM } from "jsdom";
import { mkdir, readFile, readdir } from "node:fs/promises";
import { join, relative } from "node:path";
import { pLimit } from "translation-core/concurrency";
import {
  parseTranslationDocument,
  sourceStatementBlocks,
} from "translation-core/problem-document";
import { compileProblemMarkdown } from "translation-core/problem-markdown";
import { sampleWarnings } from "translation-core/problem-samples";
import { parseReviewState } from "translation-core/review-state";
import { atomicFile, readSourceIndex, sha256 } from "./source-store.ts";
import type {
  OperationContext,
  OperationItem,
  OperationResult,
} from "./types.ts";

export async function problemFiles(context: OperationContext) {
  const root = join(context.repositoryRoot, "problem-translations/ko/problems");
  const numbers = new Set<number>();
  const files = (await readdir(root))
    .filter((name) => /^\d+\.(mdx|html)$/.test(name))
    .sort((a, b) => parseInt(a) - parseInt(b));
  for (const file of files) {
    const no = parseInt(file);
    if (numbers.has(no))
      throw new Error(`Problem ${no} has both HTML and MDX sources`);
    numbers.add(no);
  }
  if (!files.length) throw new Error("No translated problem files found");
  if (context.problems)
    for (const no of context.problems)
      if (!numbers.has(no)) throw new Error(`Problem ${no} has no translation`);
  return files
    .filter(
      (file) => !context.problems || context.problems.includes(parseInt(file)),
    )
    .map((file) => ({ no: parseInt(file), file, path: join(root, file) }));
}
function reviewMarkers(blocks: Element[]) {
  for (const block of blocks)
    for (const element of block.querySelectorAll("h4,h5,h6,p,li,td,th")) {
      let text = "";
      const runs: string[] = [];
      for (const node of element.childNodes) {
        if (node.nodeType === 1 && (node as Element).tagName === "BR") {
          runs.push(text);
          text = "";
        } else text += node.textContent;
      }
      runs.push(text);
      for (const run of runs) {
        const normalized = run.replace(/\s+/g, " ").trim();
        if (
          normalized.startsWith("📝 ") ||
          normalized.startsWith("[기계 번역]")
        )
          throw new Error("Review labels may only occur in the problem title");
      }
    }
}
export async function checkProblems(
  context: OperationContext,
  mode: "validate" | "live" | "lint" | "audit",
): Promise<OperationResult> {
  const files = await problemFiles(context),
    items: OperationItem[] = [],
    audit: Record<string, unknown>[] = [];
  const index =
    mode === "audit"
      ? await readSourceIndex(join(context.dataRoot, "problems-source"))
      : undefined;
  const emit = (item: OperationItem) => {
    items.push(item);
    context.progress?.(item);
  };
  async function checkFile({ no, file, path }: (typeof files)[number]) {
    context.signal?.throwIfAborted();
    const doms: JSDOM[] = [];
    const parse = (html: string) => {
      const dom = new JSDOM(html);
      doms.push(dom);
      return dom.window.document;
    };
    let reviewStatus: OperationItem["reviewStatus"];
    try {
      const raw = await readFile(path, "utf8"),
        html = file.endsWith(".mdx") ? compileProblemMarkdown(raw) : raw;
      const review = parseReviewState(html);
      reviewStatus = review.machineTranslated ? "machine" : review.reviewStatus;
      if (mode === "lint") {
        const errors: { from: number; to: number }[] = [];
        htmlLanguage.parser.parse(html).iterate({
          enter(node) {
            if (node.type.isError || node.name.includes("⚠"))
              errors.push({ from: node.from, to: node.to });
          },
        });
        if (errors.length)
          throw new Error(
            `${errors.length} HTML syntax error(s): ${JSON.stringify(errors)}`,
          );
        emit({
          id: String(no),
          status: "passed",
          message: `${file}: valid HTML`,
          reviewStatus,
        });
        return;
      }
      const document = parse(html),
        id =
          document.querySelector<HTMLElement>("main[data-yukicoder-ko-problem]")
            ?.dataset.problemId ?? "";
      const translated = parseTranslationDocument(html, no, id, parse);
      reviewMarkers(translated.blocks);
      let warnings: string[] = [];
      let record: Record<string, unknown> | undefined;
      if (mode === "live" || mode === "audit") {
        let canonical: Uint8Array;
        let metadata:
          { No: number; ProblemId: number; Title: string } | undefined;
        if (mode === "live") {
          const url = `https://yukicoder.me/api/v1/problems/${id}`;
          const signal = context.signal
            ? AbortSignal.any([context.signal, AbortSignal.timeout(20000)])
            : AbortSignal.timeout(20000);
          const options = {
            signal,
            cache: "no-store" as const,
            headers: { "User-Agent": "yukicoder-ko-source-verifier" },
          };
          const [metaResponse, htmlResponse] = await Promise.all([
            (context.request ?? fetch)(url, options),
            (context.request ?? fetch)(`${url}/html`, options),
          ]);
          if (!metaResponse.ok || !htmlResponse.ok)
            throw new Error(
              `Source HTTP failure: metadata ${metaResponse.status}; HTML ${htmlResponse.status}`,
            );
          metadata = await metaResponse.json();
          canonical = new Uint8Array(await htmlResponse.arrayBuffer());
        } else {
          canonical = await readFile(
            join(context.dataRoot, "problems-source", `${no}.html`),
          );
          metadata = index!.problems.find((p) => p.No === no);
        }
        if (!metadata)
          throw new Error("Original is absent from the saved index");
        const hash = sha256(canonical),
          source = parse(new TextDecoder().decode(canonical));
        warnings = sampleWarnings(
          sourceStatementBlocks(source.body),
          translated.blocks,
          file.endsWith(".mdx") ? "mdx" : "html",
        );
        const resources = (doc: Document) =>
          [...doc.querySelectorAll("img[src],a[href]")].map((el) => ({
            tag: el.tagName.toLowerCase(),
            url: el.getAttribute(el.tagName === "IMG" ? "src" : "href"),
            label: el.getAttribute("alt") ?? el.textContent,
          }));
        record = {
          problemNo: no,
          problemId: Number(id),
          filename: file,
          identityMatches:
            metadata.No === no && metadata.ProblemId === Number(id),
          sourceTitleMatches:
            metadata.Title === translated.root.dataset.sourceTitle,
          canonicalHash: hash,
          recordedHash: translated.root.dataset.sourceHtmlSha256,
          hashMatches: hash === translated.root.dataset.sourceHtmlSha256,
          sampleWarnings: warnings,
          originalResources: resources(source),
          translatedResources: resources(translated.root.ownerDocument),
        };
        if (mode === "live") {
          if (metadata.No !== no || metadata.ProblemId !== Number(id))
            throw new Error("Canonical problem identity changed");
          if (metadata.Title !== translated.root.dataset.sourceTitle)
            throw new Error("Canonical source title changed");
          if (hash !== translated.root.dataset.sourceHtmlSha256)
            throw new Error(
              `Source changed: expected ${translated.root.dataset.sourceHtmlSha256}, received ${hash}`,
            );
        }
      }
      if (record) audit.push(record);
      emit({
        id: String(no),
        status:
          record &&
          (record.identityMatches === false ||
            record.sourceTitleMatches === false ||
            record.hashMatches === false ||
            warnings.length)
            ? "review-required"
            : "passed",
        message: `${relative(context.repositoryRoot, path)}: valid${mode === "live" ? " and current" : ""}`,
        details: record ?? { warnings },
        reviewStatus,
      });
    } catch (error) {
      context.signal?.throwIfAborted();
      const message = String(error);
      audit.push({ problemNo: no, filename: file, error: message });
      emit({ id: String(no), status: "failed", message, reviewStatus });
    } finally {
      doms.forEach((dom) => dom.window.close());
    }
  }
  const limit = pLimit(mode === "live" ? 4 : 1);
  await Promise.all(files.map((file) => limit(() => checkFile(file))));
  let report: string | undefined;
  if (mode === "audit") {
    const directory = join(context.dataRoot, "reports");
    await mkdir(directory, { recursive: true });
    report = join(directory, "problem-audit.json");
    await atomicFile(
      report,
      JSON.stringify(
        {
          source:
            "saved canonical corpus; run verify:problems for live comparison",
          generatedAt: new Date().toISOString(),
          descriptionReview: "not established by automated checks",
          results: audit.sort(
            (a, b) => Number(a.problemNo) - Number(b.problemNo),
          ),
        },
        null,
        2,
      ) + "\n",
    );
  }
  return { operation: mode, items, report };
}
