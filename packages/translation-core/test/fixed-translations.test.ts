import { strict as assert } from "node:assert";
import test from "node:test";
import { JSDOM } from "jsdom";
import {
  applyTranslations,
  TranslationHistory,
  translateTemplate,
} from "../src/fixed-translations.ts";
import { readResolved } from "../src/catalog-files.ts";
import { assertCatalogShapes } from "../src/catalog-schema.ts";

test("homepage timer keeps site data Japanese and restores both contest states", async () => {
  const dom = new JSDOM(
    '<div class="next-event-card"><div class="nec-type" data-suffix="通常コンテスト"></div></div>',
  );
  const doc = dom.window.document;
  const heading = doc.querySelector(".nec-type")!;
  const entries = (await readResolved("main.json")).translations;
  const history = new TranslationHistory();
  for (const ongoing of [false, false, true, true, false]) {
    const source =
      (ongoing ? "開催中の" : "次回の") + heading.getAttribute("data-suffix");
    heading.textContent = source;
    applyTranslations(doc, entries, history);
    assert.equal(
      heading.textContent,
      ongoing ? "진행 중인 정규 대회" : "다음 정규 대회",
    );
    assert.equal(heading.getAttribute("data-suffix"), "通常コンテスト");
    history.restore();
    assert.equal(heading.textContent, source);
  }
  dom.window.close();
});

test("catalog validation rejects translation of site-owned data attributes", () => {
  assert.throws(
    () =>
      assertCatalogShapes(
        { messages: [] },
        {
          "main.json": {
            translations: [
              {
                ref: "heading",
                selector: ".nec-type",
                attribute: "data-suffix",
              },
            ],
          },
        },
      ),
    /Invalid usage dictionary/,
  );
});

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

test("variable mappings never read inherited prototype properties", () => {
  assert.equal(
    translateTemplate("toString", "{value}", "{value}", {
      value: { pattern: "[A-Za-z]+", values: { known: "알려짐" } },
    }),
    "toString",
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
