import { readCatalog } from "translation-core/catalog-files";
import { resolveDictionary } from "translation-core/translation-catalog";

import { JSDOM } from "jsdom";
import {
  applyTranslationEntry,
  normalizeTranslationText,
  type TranslationDictionary,
} from "translation-core/fixed-translations";
import type { OperationContext, OperationResult } from "./types.ts";

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
}

export async function auditTranslations(
  context: OperationContext,
  html: string,
  dictionaries: unknown[],
): Promise<OperationResult> {
  const dom = new JSDOM(html);
  try {
    const { document, Node } = dom.window;

    for (const value of dictionaries) {
      context.signal?.throwIfAborted();
      const dictionary = value as TranslationDictionary;
      resolveDictionary(
        dictionary,
        await readCatalog(context.repositoryRoot),
        document,
      ).translations.forEach((entry) => applyTranslationEntry(document, entry));
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

    return {
      operation: "audit-translations",
      items: [...seen].map((line, index) => ({
        id: String(index),
        status: "review-required",
        message: line,
      })),
    };
  } finally {
    dom.window.close();
  }
}
