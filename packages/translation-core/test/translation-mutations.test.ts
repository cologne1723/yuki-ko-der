import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import { applyTranslations } from "../src/fixed-translations.ts";
import { TranslationMutations } from "../src/translation-mutations.ts";

test("excluded editor mutations do not create pending translation work", () => {
  const dom = new JSDOM(
    '<main><div class="ace_editor"><span>code</span></div><button>outside</button></main>',
  );
  const doc = dom.window.document;
  const mutations = new TranslationMutations(doc, ".ace_editor");
  mutations.watch(["div", "span", "button"]);
  const observer = new dom.window.MutationObserver(() => {});
  observer.observe(doc, mutations.options);
  try {
    const editor = doc.querySelector(".ace_editor")!;
    editor.firstChild!.textContent = "changed code";
    editor.classList.add("ace_focus");
    editor.innerHTML = "<div><span>new code</span></div>";
    assert.equal(mutations.add(observer.takeRecords()), false);
    assert.equal(mutations.take().changed, false);
    editor.firstChild!.textContent = "another code change";
    doc.querySelector("button")!.textContent = "new UI";
    assert.equal(mutations.add(observer.takeRecords()), true);
    const pending = mutations.take();
    assert.equal(pending.changed, true);
    assert.deepEqual(
      [...pending.scope.querySelectorAll("button")],
      [doc.querySelector("button")],
    );
  } finally {
    observer.disconnect();
    dom.window.close();
  }
});

test("unrelated attributes do not schedule work and text updates stay subtree-scoped", () => {
  const dom = new JSDOM("<main><p>old</p></main><aside><p>source</p></aside>");
  const doc = dom.window.document;
  const mutations = new TranslationMutations(doc);
  mutations.watch(["p"], ["title"]);
  const observer = new dom.window.MutationObserver(() => {});
  observer.observe(doc, mutations.options);
  const p = doc.querySelector("p")!;
  p.setAttribute("style", "opacity:0.5");
  assert.equal(observer.takeRecords().length, 0);
  p.firstChild!.nodeValue = "source";
  mutations.add(observer.takeRecords());
  const pending = mutations.take();
  let globalQueries = 0;
  const query = doc.querySelectorAll.bind(doc);
  doc.querySelectorAll = ((selector: string) => {
    globalQueries++;
    return query(selector);
  }) as typeof doc.querySelectorAll;
  applyTranslations(
    doc,
    [{ selector: "p", source: "source", target: "target" }],
    undefined,
    pending.scope,
  );
  assert.equal(globalQueries, 0);
  assert.equal(p.textContent, "target");
  assert.equal(doc.querySelector("aside p")!.textContent, "source");
  observer.disconnect();
  dom.window.close();
});

test("ancestor attributes, added subtrees, and relational selector changes remain translatable", () => {
  const dom = new JSDOM(
    "<main><section><p>source</p></section><aside><b>source</b></aside></main>",
  );
  const doc = dom.window.document;
  const entries = [
    { selector: ".enabled p", source: "source", target: "target" },
    {
      selector: "main:has(.flag) aside b",
      source: "source",
      target: "related",
    },
    {
      selector: "section + aside > i:nth-child(2)",
      source: "source",
      target: "sibling",
    },
    {
      selector: "p[title]",
      attribute: "title",
      source: "source",
      target: "attribute",
    },
  ];
  const mutations = new TranslationMutations(doc);
  mutations.watch(
    entries.map((entry) => entry.selector),
    ["title"],
  );
  const observer = new dom.window.MutationObserver(() => {});
  observer.observe(doc, mutations.options);
  doc.querySelector("section")!.className = "enabled flag";
  doc.querySelector("aside")!.insertAdjacentHTML("beforeend", "<i>source</i>");
  doc.querySelector("p")!.setAttribute("title", "source");
  mutations.add(observer.takeRecords());
  applyTranslations(doc, entries, undefined, mutations.take().scope);
  assert.equal(doc.querySelector("p")!.textContent, "target");
  assert.equal(doc.querySelector("p")!.getAttribute("title"), "attribute");
  assert.equal(doc.querySelector("b")!.textContent, "related");
  assert.equal(doc.querySelector("i")!.textContent, "sibling");
  observer.takeRecords();
  doc.querySelector("b")!.textContent = "source";
  doc.querySelector("section")!.className = "enabled";
  mutations.add(observer.takeRecords());
  applyTranslations(doc, entries, undefined, mutations.take().scope);
  assert.equal(doc.querySelector("b")!.textContent, "source");
  observer.disconnect();
  dom.window.close();
});
