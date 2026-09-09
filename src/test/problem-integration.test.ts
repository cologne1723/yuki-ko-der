import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { compileProblemMarkdown } from "translation-core/problem-markdown";
import { bundle, page, settle } from "./extension-fixture.ts";

const engineCode = await bundle("src/problem-translations.ts");
const contentCode = await bundle("src/content.ts", [
  { problemNo: 1, problemId: 18, source: "題名", target: "제목" },
  { problemNo: 2, problemId: 19, source: "参照問題", target: "참조 문제" },
]);

test("full content integration preserves introductory prose and verifies original reference titles across toggles", async () => {
  const source =
    '<div class="block"><h4>問題文</h4><p>Execution warning</p><p><a href="/problems/no/2">No.2 参照問題</a></p></div>';
  const digest = createHash("sha256").update(source).digest("hex");
  const translated = compileProblemMarkdown(`---
schemaVersion: 1
locale: ko
problemNo: 1
problemId: 18
sourceTitle: 題名
sourceHtmlSha256: ${digest}
reviewStatus: unreviewed
title: 제목
---

Execution warning

## Statement

Translated statement
`);
  const { dom, close } = page(
    `<main id="content" data-problem-id="18"><h3>No.1 題名</h3><nav><a href="/problems/no/2">No.2 参照問題</a></nav>${source}</main>`,
  );
  const calls: string[] = [];
  Object.assign(dom.window, {
    YUKICODER_KO_CONFIG: {
      problemTranslationBaseUrl: "https://translations.test/",
    },
    chrome: {
      runtime: { getURL: (p: string) => p },
      storage: { local: { get: async () => ({}) } },
    },
    fetch: async (url: string | URL) => {
      const path = String(url);
      calls.push(path);
      if (path.startsWith("translations/"))
        return Response.json({ translations: [] });
      if (path.startsWith("https://translations.test/"))
        return new Response(translated);
      if (path.endsWith("/html")) return new Response(source);
      return Response.json({ No: 1, ProblemId: 18, Title: "題名" });
    },
  });
  try {
    dom.window.eval(engineCode);
    dom.window.eval(contentCode);
    for (let i = 0; i < 5; i++) await settle();
    const doc = dom.window.document;
    const notice = () => doc.querySelector("#yukicoder-ko-status")!;
    assert.equal(notice().firstChild!.textContent, "한국어 번역본 입니다.");
    assert.equal(
      doc.querySelector("#content > p:not([role])")!.textContent,
      "Execution warning",
    );
    const requests = calls.length;
    for (let i = 0; i < 2; i++) {
      notice().querySelector<HTMLButtonElement>("button")!.click();
      await settle();
      assert.equal(doc.querySelector("#content > .block")!.outerHTML, source);
      assert.equal(doc.querySelector("nav a")!.textContent, "No.2 참조 문제");
      notice().querySelector<HTMLButtonElement>("button")!.click();
      for (let j = 0; j < 5; j++) await settle();
      assert.equal(notice().firstChild!.textContent, "한국어 번역본 입니다.");
      assert.equal(
        doc.querySelector("#content > p:not([role])")!.textContent,
        "Execution warning",
      );
    }
    assert.equal(
      calls.length,
      requests,
      "toggles reuse translations and source verification",
    );
  } finally {
    close();
  }
});
