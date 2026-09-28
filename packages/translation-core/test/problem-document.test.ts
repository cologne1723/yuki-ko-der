import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import {
  sourceStatementBlocks,
  sourceStatementNodes,
} from "../src/problem-document.ts";
import { sampleDataValues } from "../src/problem-samples.ts";

test("plain statement wrappers retain Note and samples while ignoring controls and staging", () => {
  const dom = new JSDOM(`<main>
    <form><div class="block">control</div></form>
    <div data-yukicoder-ko-render-staging><div class="block">staging</div></div>
    <div><div><h4 class="shadow">Note</h4><p>intro</p><div class="block">statement</div><div class="sample">sample</div></div></div>
  </main>`);
  try {
    const root = dom.window.document.querySelector("main")!;
    assert.deepEqual(
      sourceStatementBlocks(root).map((e) => e.textContent),
      ["Note", "intro", "statement", "sample"],
    );
    root.insertAdjacentHTML(
      "beforeend",
      '<div><div class="block">ambiguous</div></div>',
    );
    assert.deepEqual(
      sourceStatementBlocks(root).map((e) => e.textContent),
      ["Noteintrostatementsample", "ambiguous"],
    );
  } finally {
    dom.window.close();
  }
});

test("live statement boundaries include loose text and mixed wrappers but preserve site UI", () => {
  const dom = new JSDOM(`<main id="content"><h3>title</h3>
    <div class="problem-header-cols">metadata</div>
    <div><button id="copy-problem-html-btn">copy</button></div>
    <div><span id="contest-problem-selector-wrapper">navigation</span></div>
    notice<p>intro</p><div><div class="block">body</div></div>
    <h4>constraints</h4><ul><li>limit</li></ul><div class="sample">sample</div>trailing
    <form action="/problems/123/submit"><input></form><p>sign in</p>
  </main>`);
  try {
    const nodes = sourceStatementNodes(
      dom.window.document.querySelector("main")!,
    );
    assert.equal(
      nodes
        .map((n) => n.textContent)
        .join("")
        .replace(/\s/g, ""),
      "noticeintrobodyconstraintslimitsampletrailing",
    );
    assert.ok(nodes.every((n) => n.parentElement?.id === "content"));
  } finally {
    dom.window.close();
  }
});

test("sample fingerprints include samples inside unclosed lists and alongside nested sections", () => {
  for (const source of [
    '<div class="block">body</div><h4>constraints</h4><ul><li>limit</li><div class="block"><div class="sample"><h6>入力</h6><pre>1  2</pre><h6>出力</h6><pre>3</pre></div></div>',
    '<div><div class="block">body</div></div><div class="sample"><h6>入力</h6><pre>1  2</pre><h6>出力</h6><pre>3</pre></div>',
  ]) {
    const dom = new JSDOM(source);
    try {
      assert.deepEqual(
        sampleDataValues(sourceStatementBlocks(dom.window.document.body)),
        ["1  2", "3"],
      );
    } finally {
      dom.window.close();
    }
  }
});

test("minimal pages include authored titles, ignored math, disclosures and trailing alerts", () => {
  const dom = new JSDOM(
    '<main><h3>site title</h3><h3 class="shadow">article title</h3><p>intro</p><div class="tex2jax_ignore">code</div><div class="block">body</div><details><summary>definition</summary>details</details><div class="sample">sample</div><div class="alert alert-danger">warning</div></main>',
  );
  try {
    assert.equal(
      sourceStatementNodes(dom.window.document.querySelector("main")!)
        .map((n) => n.textContent)
        .join(""),
      "article titleintrocodebodydefinitiondetailssamplewarning",
    );
  } finally {
    dom.window.close();
  }
});
