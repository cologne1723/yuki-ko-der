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
