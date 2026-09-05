#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import { basename, dirname, extname, resolve } from "node:path";
import { JSDOM } from "jsdom";
import { pathToFileURL } from "node:url";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function normalizedInline(node: Node): string {
  if (node.nodeType === node.TEXT_NODE) {
    return (node.nodeValue ?? "").replace(/\s+/gu, " ");
  }
  if (node.nodeType !== node.ELEMENT_NODE) return "";
  return (node as Element).outerHTML.replace(/\s+/gu, " ");
}

function paragraphMarkdown(paragraph: Element): string {
  const segments = [""];
  for (const node of paragraph.childNodes) {
    if (
      node.nodeType === node.ELEMENT_NODE &&
      (node as Element).tagName === "BR"
    ) {
      segments.push("");
    } else {
      segments[segments.length - 1] += normalizedInline(node);
    }
  }
  const normalized = segments.map((segment) => segment.trim());
  if (normalized.every((segment) => !segment)) return "";
  let result = normalized[0];
  for (let index = 1; index < normalized.length;) {
    let nextIndex = index;
    while (nextIndex < normalized.length && !normalized[nextIndex]) {
      nextIndex += 1;
    }
    const hasNext = nextIndex < normalized.length;
    const breakCount = hasNext ? nextIndex - index + 1 : 0;
    const next = hasNext ? normalized[nextIndex] : "";
    if (breakCount === 1 && hasNext) {
      result += `\n${next}`;
    } else if (hasNext) {
      result += `\n\n${next}`;
    }
    index = hasNext ? nextIndex + 1 : normalized.length;
  }
  return result.trim();
}

function preformatted(element: Element): string {
  const content = (element.textContent ?? "").replace(/\n$/u, "");
  const fence = content.includes("```") ? "````" : "```";
  return `${fence}text\n${content}\n${fence}`;
}

function renderContent(element: Element): string {
  if (element.tagName === "P") return paragraphMarkdown(element);
  if (element.tagName === "PRE") return preformatted(element);
  return element.outerHTML;
}

function sampleMarkdown(sample: Element): string {
  const heading = sample.querySelector(":scope > h5")?.textContent?.trim();
  const paragraph = sample.querySelector(":scope > .paragraph");
  if (!heading || !paragraph) throw new Error("Sample structure is invalid");
  const content: string[] = [];
  for (const child of paragraph.children) {
    if (/^H6$/u.test(child.tagName)) {
      content.push(`#### ${child.textContent?.trim() ?? ""}`);
    } else {
      content.push(renderContent(child));
    }
  }
  const dataFile = sample.getAttribute("data-file");
  if (!dataFile) throw new Error("Sample data-file is missing");
  return `### ${heading} {file=${JSON.stringify(dataFile)}}

${content.join("\n\n")}`;
}

export function convertProblemHtmlToMarkdown(html: string): string {
  const document = new JSDOM(html).window.document;
  const root = document.querySelector<HTMLElement>(
    "main[data-yukicoder-ko-problem]",
  );
  const heading = root?.querySelector(":scope > h3");
  const blocks = root?.querySelectorAll(":scope > .problem-statement > .block");
  if (!root || !heading || !blocks?.length) {
    throw new Error("Problem translation HTML structure is invalid");
  }
  const title = (heading.textContent ?? "")
    .replace(/^\[기계 번역\]\s*/u, "")
    .replace(/^No\.\d+\s*/u, "")
    .trim();
  const metadata = [
    "---",
    `schemaVersion: ${root.dataset.schemaVersion}`,
    `locale: ${root.dataset.locale}`,
    `problemNo: ${root.dataset.problemNo}`,
    `problemId: ${root.dataset.problemId}`,
    `sourceTitle: ${JSON.stringify(root.dataset.sourceTitle)}`,
    `sourceHtmlSha256: ${root.dataset.sourceHtmlSha256}`,
    `reviewStatus: ${heading.textContent?.trim().startsWith("[기계 번역]") ? "machine" : root.dataset.reviewStatus}`,
    `title: ${JSON.stringify(title)}`,
    "---",
  ];
  const sections = [...blocks].map((block) => {
    const sectionTitle = block
      .querySelector(":scope > h4")
      ?.textContent?.trim();
    if (!sectionTitle) throw new Error("Problem section title is missing");
    const body = [...block.children]
      .filter((child) => child.tagName !== "H4")
      .map((child) =>
        child.matches(".sample") ? sampleMarkdown(child) : renderContent(child),
      )
      .join("\n\n");
    return `## ${sectionTitle}\n\n${body}`;
  });
  return `${metadata.join("\n")}\n\n${sections.join("\n\n")}\n`;
}

const input = process.argv[2];
if (input && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const inputPath = resolve(input);
  if (extname(inputPath) !== ".html") {
    throw new Error("Input must be a problem .html file");
  }
  const outputPath = resolve(
    dirname(inputPath),
    `${basename(inputPath, ".html")}.mdx`,
  );
  await writeFile(
    outputPath,
    convertProblemHtmlToMarkdown(await readFile(inputPath, "utf8")),
    "utf8",
  );
  console.log(outputPath);
}
