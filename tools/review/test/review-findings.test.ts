import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { JSDOM } from "jsdom";
import { build } from "esbuild";
import { compileProblemMarkdown } from "translation-core/problem-markdown";
import { validateProblem } from "../src/problem-validation.ts";
import { katexStylePlugin } from "../src/katex-style-plugin.ts";

const original =
  '<div class="block"><div class="sample"><h6>Input</h6><pre>1</pre><h6>Output</h6><pre>2</pre><p>Explanation</p><pre>source trace</pre></div></div>';
const translation = compileProblemMarkdown(`---
schemaVersion: 1
locale: ko
problemNo: 1
problemId: 11
sourceTitle: Original
sourceHtmlSha256: ${createHash("sha256").update(original).digest("hex")}
reviewStatus: approved
title: Fixture
---

## Statement

Fixture
`);

test("review validation uses the same IO-only invariant as the extension", () => {
  const dom = new JSDOM(translation);
  try {
    dom.window.document.querySelector(".problem-statement")!.innerHTML =
      original.replace("source trace", "translated trace");
    const validate = () =>
      validateProblem(
        1,
        original,
        dom.serialize(),
        { No: 1, ProblemId: 11, Title: "Original" },
        "html",
      );
    assert.deepEqual(validate(), []);
    dom.window.document.querySelector("pre")!.textContent = "changed input";
    assert.equal(validate().length, 1);
  } finally {
    dom.window.close();
  }
});

test("translation preview shares extension sanitization while original preview preserves source markup and SVG images", async () => {
  const bundle = await build({
    plugins: [katexStylePlugin],
    stdin: {
      resolveDir: process.cwd() + "/tools/review",
      contents:
        'export { previewDocument } from "./public/app/preview-document.ts"; export { sanitizeTranslatedBlocks } from "translation-core/problem-rendering";',
    },
    bundle: true,
    write: false,
    format: "iife",
    globalName: "parity",
    platform: "browser",
  });
  const dom = new JSDOM("<!doctype html><body></body>", {
    url: "http://localhost/",
    runScripts: "outside-only",
  });
  const svg =
    "data:image/svg+xml;base64," +
    Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><rect width="20" height="20" fill="red"/></svg>',
    ).toString("base64");
  const block = `<div class="block"><p style="color:red" onclick="alert(1)">Label</p><svg xmlns="http://www.w3.org/2000/svg"><text>Diagram</text></svg><img src="${svg}" onerror="alert(1)"><a href="javascript:alert(1)">Unsafe</a></div>`;
  try {
    dom.window.eval(bundle.outputFiles[0].text + "\nwindow.parity = parity;");
    const api = (
      dom.window as unknown as {
        parity: {
          previewDocument(html: string, inert: boolean): Promise<string>;
          sanitizeTranslatedBlocks(blocks: Element[]): HTMLElement[];
        };
      }
    ).parity;
    const input = new JSDOM(translation);
    input.window.document.querySelector(".problem-statement")!.innerHTML =
      block;
    const expected = api.sanitizeTranslatedBlocks([
      ...input.window.document.querySelector(".problem-statement")!.children,
    ]);
    const preview = new JSDOM(
      await api.previewDocument(input.serialize(), false),
    );
    try {
      assert.equal(
        preview.window.document.querySelector(".block")!.outerHTML,
        expected[0].outerHTML,
      );
      assert.equal(preview.window.document.querySelector("svg"), null);
      assert.equal(preview.window.document.querySelector("p[style]"), null);
      assert.equal(
        preview.window.document.querySelector("img")!.getAttribute("src"),
        svg,
      );
      assert.equal(
        preview.window.document.querySelector("[onclick],[onerror],a[href]"),
        null,
      );
    } finally {
      preview.window.close();
      input.window.close();
    }
    const source = new JSDOM(await api.previewDocument(block, false));
    try {
      assert.ok(source.window.document.querySelector("svg text"));
      assert.equal(
        source.window.document.querySelector("p")!.getAttribute("style"),
        "color:red",
      );
      assert.equal(
        source.window.document.querySelector("img")!.getAttribute("src"),
        svg,
      );
    } finally {
      source.window.close();
    }
  } finally {
    dom.window.close();
  }
});
