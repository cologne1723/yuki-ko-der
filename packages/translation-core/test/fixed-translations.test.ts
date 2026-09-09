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

test("detached history restores originals and releases replaced nodes without losing moved nodes", () => {
  const dom = new JSDOM(
    '<main><p title="source">source</p></main><aside></aside>',
  );
  const doc = dom.window.document;
  const history = new TranslationHistory();
  const entries = [
    { selector: "p", source: "source", target: "target" },
    { selector: "p", attribute: "title", source: "source", target: "target" },
  ];
  const first = doc.querySelector("p")!;
  applyTranslations(doc, entries, history);
  doc.querySelector("aside")!.append(first);
  history.restoreDetached();
  assert.equal(
    first.textContent,
    "target",
    "moves within the document retain translations",
  );
  first.remove();
  history.restoreDetached();
  assert.equal(first.textContent, "source");
  assert.equal(first.getAttribute("title"), "source");
  const main = doc.querySelector("main")!;
  for (let i = 0; i < 100; i++) {
    main.innerHTML = '<p title="source">source</p>';
    applyTranslations(doc, entries, history);
    history.restoreDetached();
  }
  // This assertion checks retained DOM references, the resource leak under test.
  const changes = (history as unknown as { changes: Map<Node, unknown> })
    .changes;
  assert.equal(changes.size, 2);
  assert.ok([...changes.keys()].every((node) => node.isConnected));
  main.querySelector("p")!.setAttribute("title", "site edit");
  history.restore();
  assert.equal(main.textContent, "source");
  assert.equal(main.querySelector("p")!.getAttribute("title"), "site edit");
  assert.equal(changes.size, 0);
  dom.window.close();
});
