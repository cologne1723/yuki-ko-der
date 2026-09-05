#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";
import { parseReviewState, structuralWarnings } from "./problem-review.ts";
import { compileProblemMarkdown } from "../src/problem-markdown.ts";

const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = resolve(SCRIPT_DIRECTORY, "..");
const PROBLEM_DIRECTORY = join(
  REPOSITORY_ROOT,
  "problem-translations",
  "ko",
  "problems",
);
const verifySource = process.argv.includes("--verify-source");
const dom = new JSDOM("<!doctype html><html><body></body></html>");
global.document = dom.window.document;
global.Node = dom.window.Node;
global.NodeFilter = dom.window.NodeFilter;
global.DOMParser = dom.window.DOMParser;
await import("../src/problem-translations.ts");
const engine = globalThis.yukicoderProblemTranslations.testApi;

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function normalized(value) {
  return value.replace(/\s+/gu, " ").trim();
}

function messageRuns(element) {
  const runs = [];
  let value = "";
  for (const node of element.childNodes) {
    if (node.nodeType === Node.ELEMENT_NODE && node.tagName === "BR") {
      if (normalized(value)) {
        runs.push(normalized(value));
      }
      value = "";
    } else {
      value += node.textContent;
    }
  }
  if (normalized(value)) {
    runs.push(normalized(value));
  }
  return runs;
}

function validateReviewMarkers(html, translation, label) {
  try {
    parseReviewState(html);
  } catch (error) {
    throw new Error(`${label}: ${error.message}`);
  }
  const messages = [];
  for (const block of translation.blocks) {
    messages.push(...block.querySelectorAll("h4, h5, h6, p, li, td, th"));
  }
  for (const element of messages) {
    for (const message of messageRuns(element)) {
      assert(
        !message.startsWith("📝 "),
        `${label} may not use the fixed-UI draft marker: ${message}`,
      );
      assert(
        !message.startsWith("[기계 번역]"),
        `${label} may use [기계 번역] only in the problem title: ${message}`,
      );
    }
  }
}

async function verifyTranslation(translation, label) {
  const { problemId, problemNo, sourceTitle, sourceHtmlSha256 } =
    translation.root.dataset;
  const metadataUrl = `https://yukicoder.me/api/v1/problems/${problemId}`;
  const options = {
    cache: "no-store",
    headers: { "User-Agent": "yukicoder-ko-source-verifier" },
  };
  const [metadataResponse, htmlResponse] = await Promise.all([
    fetch(metadataUrl, options),
    fetch(`${metadataUrl}/html`, options),
  ]);
  assert(
    metadataResponse.ok,
    `${label} metadata returned ${metadataResponse.status}`,
  );
  assert(htmlResponse.ok, `${label} HTML returned ${htmlResponse.status}`);
  const [metadata, htmlBytes] = await Promise.all([
    metadataResponse.json(),
    htmlResponse.arrayBuffer(),
  ]);
  assert(metadata.No === Number(problemNo), `${label} problem number changed`);
  assert(
    metadata.ProblemId === Number(problemId),
    `${label} problem ID changed`,
  );
  assert(metadata.Title === sourceTitle, `${label} title changed`);
  const hash = createHash("sha256")
    .update(Buffer.from(htmlBytes))
    .digest("hex");
  assert(
    hash === sourceHtmlSha256,
    `${label} source changed: expected ${sourceHtmlSha256}, received ${hash}`,
  );

  const source = engine.parseHtml(new TextDecoder().decode(htmlBytes));
  const sourceBlocks = [...source.body.querySelectorAll(":scope > .block")];
  for (const warning of structuralWarnings(sourceBlocks, translation.blocks)) {
    console.warn(`${label}: warning: ${warning}`);
  }
}

async function main() {
  const available = new Map();
  for (const name of await readdir(PROBLEM_DIRECTORY)) {
    const match = name.match(/^(\d+)\.(html|mdx)$/u);
    if (!match) continue;
    const problemNo = Number(match[1]);
    assert(
      !available.has(problemNo),
      `Problem ${problemNo} has both HTML and MDX sources`,
    );
    available.set(problemNo, name);
  }
  const filenames = [...available.values()].sort((left, right) =>
    left.localeCompare(right, "en", { numeric: true }),
  );
  assert(filenames.length > 0, "No translated problem HTML files found");
  const failures = [];

  async function validateFile(filename: string) {
    try {
      const path = join(PROBLEM_DIRECTORY, filename);
      const label = relative(REPOSITORY_ROOT, path);
      const source = await readFile(path, "utf8");
      const html = filename.endsWith(".mdx")
        ? compileProblemMarkdown(source)
        : source;
      const problemNo = Number(filename.replace(/\.(?:html|mdx)$/u, ""));
      assert(
        Number.isInteger(problemNo),
        `${label} filename must be a problem number`,
      );
      const parsed = engine.parseHtml(html);
      const root = parsed.querySelector("main[data-yukicoder-ko-problem]");
      const problemId = root?.dataset.problemId;
      const translation = engine.parseTranslationDocument(
        html,
        problemNo,
        problemId,
      );
      validateReviewMarkers(html, translation, label);
      if (verifySource) {
        await verifyTranslation(translation, label);
      }
      console.log(`${label}: valid${verifySource ? " and current" : ""}`);
    } catch (error) {
      const label = `problem-translations/ko/problems/${filename}`;
      failures.push(`${label}: ${error.message}`);
      console.error(`${label}: ${error.message}`);
    }
  }
  // Bound live requests so publishing a large corpus does not require one
  // network round trip per problem in sequence. Each worker requests two URLs.
  const pending = filenames.values();
  async function worker() {
    for (const filename of pending) await validateFile(filename);
  }
  await Promise.all(Array.from({ length: verifySource ? 4 : 1 }, worker));
  if (failures.length > 0) {
    throw new Error(`Validation failed for ${failures.length} file(s)`);
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
