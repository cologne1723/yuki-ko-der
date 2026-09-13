import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import { statementEmphasis } from "../src/problem-emphasis.ts";
test("emphasis inventory keeps repeated body occurrences and nested styles only once", () => {
  const dom = new JSDOM(
    "<p><b>A <u>B</u></b> <strong>A B</strong> <u>C</u><b> </b></p>",
  );
  try {
    assert.deepEqual(statementEmphasis(dom.window.document), [
      "A B",
      "A B",
      "C",
    ]);
  } finally {
    dom.window.close();
  }
});
test("emphasis inventory retains headings for classification and skips code and navigation", () => {
  const dom = new JSDOM(
    '<nav><b>menu</b></nav><div class="problem-statement"><h4><b>title</b></h4><pre><b>data</b></pre><code><u>code</u></code><p><b>notice</b></p><table><tr><td><u>condition</u></td></tr></table><div class="sample"><h5><strong>sample</strong></h5><p><strong>explanation</strong></p></div></div><b>outside</b>',
  );
  try {
    assert.deepEqual(statementEmphasis(dom.window.document), [
      "title",
      "notice",
      "condition",
      "sample",
      "explanation",
    ]);
  } finally {
    dom.window.close();
  }
});

test("condition emphasis inside a heading wrapper is not discarded", () => {
  const dom = new JSDOM(
    "<blockquote><h5><p>Count <b>移動経路の個数</b> among all grids.</p></h5></blockquote>",
  );
  try {
    assert.deepEqual(statementEmphasis(dom.window.document), [
      "移動経路の個数",
    ]);
  } finally {
    dom.window.close();
  }
});
