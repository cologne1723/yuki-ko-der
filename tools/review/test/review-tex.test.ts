import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import { renderPreviewMath } from "../public/tex.ts";

test("review previews render supported TeX delimiters, including input formats", () => {
  const dom = new JSDOM(`
    <main>
      <p>$x + 1$ \\(y - 1\\) $$z^2$$ \\[w^2\\]</p>
      <pre>$sample_input$</pre>
      <code>$literal_code$</code>
    </main>
  `);
  const previousDocument = globalThis.document;
  const previousNode = globalThis.Node;
  globalThis.document = dom.window.document;
  globalThis.Node = dom.window.Node;
  try {
    renderPreviewMath(dom.window.document.querySelector("main")!);
  } finally {
    globalThis.document = previousDocument;
    globalThis.Node = previousNode;
  }

  assert.equal(dom.window.document.querySelectorAll("main .katex").length, 5);
  assert.ok(dom.window.document.querySelector("pre .katex"));
  assert.equal(
    dom.window.document.querySelector("code")?.textContent,
    "$literal_code$",
  );
});

test("Markdown input formulas render while sample data and program code remain literal", () => {
  const dom = new JSDOM(`<main>
    <div class="block"><h4>입력</h4><pre><code>$N$\n$S_1$</code></pre>
      <div class="sample"><pre><code>$sample$</code></pre></div>
      <pre><code>echo $HOME</code></pre></div>
    <div class="block"><h4>설명</h4><pre><code>$literal$</code></pre></div>
  </main>`);
  const previousDocument = globalThis.document;
  const previousNode = globalThis.Node;
  globalThis.document = dom.window.document;
  globalThis.Node = dom.window.Node;
  try {
    renderPreviewMath(dom.window.document.querySelector("main")!);
    assert.equal(dom.window.document.querySelectorAll(".katex").length, 2);
    assert.equal(
      dom.window.document.querySelector(".sample code")?.textContent,
      "$sample$",
    );
    assert.ok(dom.window.document.body.textContent?.includes("echo $HOME"));
    assert.ok(dom.window.document.body.textContent?.includes("$literal$"));
  } finally {
    globalThis.document = previousDocument;
    globalThis.Node = previousNode;
    dom.window.close();
  }
});
