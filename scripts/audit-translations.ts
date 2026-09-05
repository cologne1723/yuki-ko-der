#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { JSDOM } from "jsdom";
import {
  applyTranslationEntry,
  normalizeTranslationText,
  type TranslationDictionary,
} from "../src/fixed-translations";

const JAPANESE_TEXT = /[ぁ-んァ-ヶ一-龠]/u;
const IGNORED_ELEMENTS = new Set(["NOSCRIPT", "SCRIPT", "STYLE"]);
const AUDITED_ATTRIBUTES = [
  "alt",
  "aria-label",
  "data-suffix",
  "placeholder",
  "title",
];

function elementHint(element: Element): string {
  let ancestor: Element | null = element;
  while (ancestor && !ancestor.id) ancestor = ancestor.parentElement;
  const scope = ancestor?.id ? `#${ancestor.id} ` : "";
  const classes = [...element.classList].map((name) => `.${name}`).join("");
  return `${scope}${element.tagName.toLowerCase()}${classes}`;
}

function report(seen: Set<string>, selector: string, rawText: string): void {
  const text = normalizeTranslationText(rawText);
  if (!text || !JAPANESE_TEXT.test(text)) return;
  const key = `${selector}\t${text}`;
  if (seen.has(key)) return;
  seen.add(key);
  process.stdout.write(`${key}\n`);
}

if (process.argv.length < 4) {
  console.error(
    `Usage: ${basename(process.argv[1])} PAGE.html DICTIONARY.json [DICTIONARY.json ...]`,
  );
  process.exit(2);
}

const [htmlPath, ...dictionaryPaths] = process.argv.slice(2);
const dom = new JSDOM(await readFile(htmlPath, "utf8"));
const { document, Node } = dom.window;

for (const dictionaryPath of dictionaryPaths) {
  const dictionary = JSON.parse(
    await readFile(dictionaryPath, "utf8"),
  ) as TranslationDictionary;
  dictionary.translations.forEach((entry) =>
    applyTranslationEntry(document, entry),
  );
}

const seen = new Set<string>();
const walker = document.createTreeWalker(
  document.body,
  dom.window.NodeFilter.SHOW_TEXT,
);
for (let node = walker.nextNode(); node; node = walker.nextNode()) {
  const parent = node.parentElement;
  if (
    !parent ||
    parent.closest("noscript, script, style") !== null ||
    IGNORED_ELEMENTS.has(parent.tagName)
  ) {
    continue;
  }
  report(seen, elementHint(parent), node.nodeValue ?? "");
}

for (const element of document.querySelectorAll("*")) {
  const attributes = [...AUDITED_ATTRIBUTES];
  if (element.matches("input, button")) attributes.push("value");
  for (const attribute of attributes) {
    report(
      seen,
      `${elementHint(element)}[@${attribute}]`,
      element.getAttribute(attribute) ?? "",
    );
  }
}
