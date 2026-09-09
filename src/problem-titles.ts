import {
  normalizeTranslationText,
  type TranslationHistory,
} from "translation-core/fixed-translations";

import type { ProblemTitleTranslation } from "translation-core/problem-catalog";
export type { ProblemTitleTranslation } from "translation-core/problem-catalog";

import { message } from "./extension-messages";

const PROTECTED =
  'pre, code, script, style, textarea, input, select, .sample, [contenteditable]:not([contenteditable="false"])';
const LABELS =
  "title, h1, h2, h3, h4, h5, h6, p, span, div, td, th, li, dt, dd, strong, b, em, label";
const PREFIX = /^\s*No\.(?<problemNo>\d+)\s*/u;

function replaceTextRange(
  element: Element,
  start: number,
  end: number,
  target: string,
  history: TranslationHistory,
): void {
  const walker = element.ownerDocument.createTreeWalker(element, 4);
  let offset = 0;
  let inserted = false;
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const before = node.nodeValue ?? "";
    const left = Math.max(0, start - offset);
    const right = Math.min(before.length, end - offset);
    offset += before.length;
    if (left >= right) continue;
    const after =
      before.slice(0, left) + (inserted ? "" : target) + before.slice(right);
    inserted = true;
    history.record(node, "", before, after);
    node.nodeValue = after;
  }
}

export class ProblemTitleTranslator {
  private byNumber: Map<number, ProblemTitleTranslation>;
  private byId: Map<number, ProblemTitleTranslation>;

  constructor(titles: ProblemTitleTranslation[]) {
    this.byNumber = new Map(titles.map((title) => [title.problemNo, title]));
    this.byId = new Map(titles.map((title) => [title.problemId, title]));
  }

  private translate(
    element: Element,
    entry: ProblemTitleTranslation,
    history: TranslationHistory,
    allowPlain: boolean,
  ): void {
    if (element.closest(PROTECTED) || element.querySelector(PROTECTED)) return;
    const raw = element.textContent ?? "";
    const source = normalizeTranslationText(entry.source);
    const target = entry.target;
    if (!source || source === normalizeTranslationText(target)) return;
    let start = raw.match(/^\s*/u)![0].length;
    let end = raw.length - raw.match(/\s*$/u)![0].length;
    if (!(allowPlain && normalizeTranslationText(raw) === source)) {
      const prefix = raw.match(PREFIX);
      if (!prefix || Number(prefix.groups?.problemNo) !== entry.problemNo)
        return;
      start = prefix[0].length;
      // 브라우저 탭 제목의 사이트 이름은 유지합니다.
      if (element.tagName === "TITLE") {
        const suffix = raw.slice(start, end).match(/\s+- yukicoder$/u);
        if (suffix) end -= suffix[0].length;
      }
      if (normalizeTranslationText(raw.slice(start, end)) !== source) return;
    }
    replaceTextRange(element, start, end, target, history);
  }

  apply(document: Document, history: TranslationHistory): void {
    const editorial = new URL(document.URL).pathname.match(
      /^\/problems\/no\/(\d+)\/editorial\/?$/u,
    );
    const editorialEntry = editorial && this.byNumber.get(Number(editorial[1]));
    if (editorialEntry) {
      const source = normalizeTranslationText(editorialEntry.source);
      for (const element of document.querySelectorAll("title, #content > h3")) {
        if (element.querySelector("a") || element.querySelector(PROTECTED))
          continue;
        const raw = element.textContent ?? "";
        const normalized = normalizeTranslationText(raw);
        const base = `No.${editorialEntry.problemNo} ${source}`;
        const translated = `No.${editorialEntry.problemNo} ${editorialEntry.target}`;
        let replacement: string | undefined;
        if (element.tagName === "TITLE") {
          for (const suffix of ["", " - yukicoder"]) {
            if (normalized === `解説 ${base}${suffix}`)
              replacement = `${message("editorial")} ${translated}${suffix}`;
          }
        } else if (normalized === `${base} 解説`)
          replacement = `${translated} ${message("editorial")}`;
        if (replacement)
          replaceTextRange(
            element,
            raw.match(/^\s*/u)![0].length,
            raw.length - raw.match(/\s*$/u)![0].length,
            replacement,
            history,
          );
      }
    }

    for (const link of document.querySelectorAll<HTMLAnchorElement>(
      "a[href]",
    )) {
      let url: URL;
      try {
        url = new URL(link.getAttribute("href")!, document.baseURI);
      } catch {
        continue;
      }
      if (!["https://yukicoder.me", "http://yukicoder.me"].includes(url.origin))
        continue;
      const match = url.pathname.match(
        /^\/problems\/(?:no\/(?<problemNo>\d+)|(?<problemId>\d+))(?:\/|$)/u,
      );
      if (!match) continue;
      const entry = match.groups?.problemNo
        ? this.byNumber.get(Number(match.groups.problemNo))
        : this.byId.get(Number(match.groups?.problemId));
      if (entry) this.translate(link, entry, history, true);
    }
    for (const element of document.querySelectorAll(LABELS)) {
      // 링크의 문제 번호와 표시 이름이 다른 경우, 상위 요소를 통해 우회하지 않습니다.
      if (element.closest("a") || element.querySelector("a")) continue;
      const prefix = element.textContent?.match(PREFIX);
      const entry =
        prefix && this.byNumber.get(Number(prefix.groups?.problemNo));
      if (entry) this.translate(element, entry, history, false);
    }
  }
}
