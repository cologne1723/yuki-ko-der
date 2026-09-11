#!/usr/bin/env node
import { parseReviewState } from "translation-core/review-state";
import { cliOptions } from "translation-core/cli-options";

import { atomicNewFile } from "./operations/source-store.ts";

import { JSDOM } from "jsdom";
import { readFile, unlink } from "node:fs/promises";
import { basename, dirname, extname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { compileProblemMarkdown } from "translation-core/problem-markdown";
import { verifyProblemRenderMarkup } from "translation-core/problem-render-markup";
import { sampleWarnings } from "translation-core/problem-samples";
import {
  conversionSemantics,
  renderContent,
  sampleMarkdown,
} from "./problem-conversion-rules.ts";

export function convertProblemHtmlToMarkdown(html: string): string {
  const dom = new JSDOM(html);
  try {
    const document = dom.window.document;
    const root = document.querySelector<HTMLElement>(
      "main[data-yukicoder-ko-problem]",
    );
    const heading = root?.querySelector(":scope > h3");
    const blocks = root?.querySelectorAll(
      ":scope > .problem-statement > .block",
    );
    if (!root || !heading || !blocks?.length) {
      throw new Error("Problem translation HTML structure is invalid");
    }
    verifyProblemRenderMarkup(root);
    const title = (heading.textContent ?? "")
      .replace(/^\[기계 번역\]\s*/u, "")
      .replace(/^No\.\d+\s*/u, "")
      .trim();
    const reviews = parseReviewState(html).reviews;
    const metadata = [
      "---",
      `schemaVersion: ${root.dataset.schemaVersion}`,
      `locale: ${root.dataset.locale}`,
      `problemNo: ${root.dataset.problemNo}`,
      `problemId: ${root.dataset.problemId}`,
      `sourceTitle: ${JSON.stringify(root.dataset.sourceTitle)}`,
      `sourceHtmlSha256: ${root.dataset.sourceHtmlSha256}`,
      ...(reviews
        ? [
            `humanReview: ${reviews.human ?? "null"}`,
            `machineReview: ${reviews.machine}`,
          ]
        : [
            `reviewStatus: ${heading.textContent?.trim().startsWith("[기계 번역]") ? "machine" : root.dataset.reviewStatus}`,
          ]),
      `title: ${JSON.stringify(title)}`,
      "---",
    ];
    const sections = [...blocks].map((block) => {
      if (
        [...block.childNodes].some(
          (node) => node.nodeType === 3 && node.textContent?.trim(),
        )
      )
        throw new Error("Unsupported unwrapped section prose");
      const sectionTitle = block
        .querySelector(":scope > h4")
        ?.textContent?.trim();
      if (!sectionTitle) throw new Error("Problem section title is missing");
      const body = [...block.children]
        .filter((child) => child.tagName !== "H4")
        .map((child) =>
          child.matches(".sample")
            ? sampleMarkdown(child)
            : renderContent(child),
        )
        .join("\n\n");
      return `## ${sectionTitle}\n\n${body}`;
    });
    const output = `${metadata.join("\n")}\n\n${sections.join("\n\n")}\n`;
    try {
      const compiled = compileProblemMarkdown(output);
      const compiledDom = new JSDOM(compiled);
      try {
        const compiledDocument = compiledDom.window.document;
        const sourceBlocks = [
          ...root.querySelectorAll(":scope > .problem-statement > .block"),
        ];
        const compiledBlocks = [
          ...compiledDocument.querySelectorAll(
            "main > .problem-statement > .block",
          ),
        ];
        const warnings = sampleWarnings(sourceBlocks, compiledBlocks, "mdx");
        if (warnings.length)
          throw new Error(
            `Sample round-trip failed:\n${warnings.join("\n\n")}`,
          );
        if (
          JSON.stringify(conversionSemantics(root)) !==
          JSON.stringify(
            conversionSemantics(compiledDocument.querySelector("main")!),
          )
        )
          throw new Error(
            "PRE/CODE text or TeX ignore/process scope round-trip failed",
          );
      } finally {
        compiledDom.window.close();
      }
    } catch (error) {
      throw new Error(
        `Converted problem Markdown is rejected by the compiler: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    return output;
  } finally {
    dom.window.close();
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const [input] = cliOptions().positionals;
  if (input) {
    const inputPath = resolve(input);
    if (extname(inputPath) !== ".html") {
      throw new Error("Input must be a problem .html file");
    }
    const outputPath = resolve(
      dirname(inputPath),
      `${basename(inputPath, ".html")}.mdx`,
    );
    const output = convertProblemHtmlToMarkdown(
      await readFile(inputPath, "utf8"),
    );
    await atomicNewFile(outputPath, output);
    try {
      await unlink(inputPath);
    } catch (error) {
      await unlink(outputPath);
      throw error;
    }
    console.log(outputPath);
  }
}
