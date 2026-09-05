import { strict as assert } from "node:assert";
import test from "node:test";
import { JSDOM } from "jsdom";
import {
  applyTranslations,
  translateTemplate,
} from "../src/fixed-translations.ts";

test("named placeholders can be reordered by the Korean target", () => {
  assert.equal(
    translateTemplate(
      "14人/84問",
      "{people}人/{problems}問",
      "{problems}문제 중 {people}명",
      {
        people: "\\d+",
        problems: "\\d+",
      },
    ),
    "84문제 중 14명",
  );
});

test("fixed replacements stay selector-scoped and exact", () => {
  const dom = new JSDOM(`
    <nav><a id="menu">トップページ</a></nav>
    <main><h1>トップページ</h1></main>
  `);

  applyTranslations(dom.window.document, [
    {
      selector: "nav #menu",
      source: "トップページ",
      target: "메인 페이지",
    },
  ]);

  assert.equal(
    dom.window.document.querySelector("#menu")?.textContent,
    "메인 페이지",
  );
  assert.equal(
    dom.window.document.querySelector("h1")?.textContent,
    "トップページ",
  );
});
