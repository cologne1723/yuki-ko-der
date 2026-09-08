import test from "node:test";
import { strict as assert } from "node:assert";
import { JSDOM } from "jsdom";
import { captureBindings, updateBindings } from "../public/live-preview.ts";
import { applyTranslations } from "translation-core/fixed-translations";

test("repeated option edits retain a large ranking table and unrelated nodes", () => {
  const dom = new JSDOM(
    `<main id="content"><select><option>純主流のみ (cLay/kuin以外)</option><option>変更しない</option></select><table>${"<tr><td>ranking row</td></tr>".repeat(5000)}</table></main>`,
  );
  try {
    const doc = dom.window.document;
    const entry = {
      selector: "#content option",
      source: "純主流のみ (cLay/kuin以外)",
      target: "주류 언어만(cLay/kuin 제외)",
    };
    const bindings = captureBindings(doc, [entry]);
    assert.equal(bindings.length, 1);
    const table = doc.querySelector("table");
    const row = doc.querySelector("tr");
    const option = doc.querySelector("option");
    applyTranslations(doc, [entry]);
    for (const target of [
      "주",
      "주류",
      "주류 언어",
      "주류 언어만 (cLay/kuin 제외)",
    ])
      updateBindings(doc, bindings, target);
    assert.equal(doc.querySelector("option"), option);
    assert.equal(option!.textContent, "주류 언어만 (cLay/kuin 제외)");
    assert.equal(doc.querySelector("table"), table);
    assert.equal(doc.querySelector("tr"), row);
    assert.equal(doc.querySelectorAll("tr").length, 5000);
    assert.equal(doc.querySelectorAll("option")[1].textContent, "変更しない");
  } finally {
    dom.window.close();
  }
});

test("incremental edits preserve original template values, attributes and boundary whitespace", () => {
  const dom = new JSDOM(
    '<p>  残り12分  </p><input placeholder="残り12分"><pre>原文</pre>',
  );
  try {
    const doc = dom.window.document;
    const entries = [
      {
        selector: "p",
        source: "残り{minutes}分",
        target: "{minutes}분 남음",
        variables: { minutes: "\\d+" },
      },
      {
        selector: "input",
        attribute: "placeholder",
        source: "残り{minutes}分",
        target: "{minutes}분 남음",
        variables: { minutes: "\\d+" },
      },
    ];
    const bindings = captureBindings(doc, entries);
    applyTranslations(doc, entries);
    updateBindings(doc, bindings, "남은 시간: {minutes}분");
    updateBindings(doc, bindings, "{minutes}분 후");
    assert.equal(doc.querySelector("p")!.textContent, "  12분 후  ");
    assert.equal(
      doc.querySelector("input")!.getAttribute("placeholder"),
      "12분 후",
    );
    const pre = [
      {
        selector: "pre",
        source: "原文",
        target: "첫 줄\n둘째 줄",
        preserveBoundaryWhitespace: false,
      },
    ];
    const preBindings = captureBindings(doc, pre);
    applyTranslations(doc, pre);
    updateBindings(doc, preBindings, "첫 줄\n수정한 줄");
    assert.equal(doc.querySelector("pre")!.textContent, "첫 줄\n수정한 줄");
  } finally {
    dom.window.close();
  }
});
