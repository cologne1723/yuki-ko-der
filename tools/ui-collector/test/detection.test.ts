import cssEscape from "css.escape";
import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import { pageDictionaryNames } from "translation-core/page-dictionaries";
import { sanitizeClone } from "../src/sanitize.ts";
import {
  collectCandidates,
  classifyCandidates,
  findingId,
  toOccurrences,
} from "../src/detection.ts";

function page(html: string): Document {
  const dom = new JSDOM(html);
  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    NodeFilter: dom.window.NodeFilter,
    CSS: { escape: cssEscape },
    Document: dom.window.Document,
    Element: dom.window.Element,
    HTMLButtonElement: dom.window.HTMLButtonElement,
  });
  return dom.window.document;
}

test("dictionary scopes use original attributes while locators refer to redacted snapshots", () => {
  const doc = page(
    '<div id="sidelinks"><a href="/problems">問題一覧</a></div>',
  );
  const { clone, originals } = sanitizeClone(doc);
  const observations = classifyCandidates(
    collectCandidates(clone, originals),
    [
      {
        messageId: "problems",
        selector: "#sidelinks > a[href='/problems']",
        path: "common.json",
      },
      {
        messageId: "wrong-page",
        selector: "a[href='/problems']",
        path: "contest.json",
      },
    ],
    ["common"],
    originals,
  );
  assert.equal(observations[0].category, "interface");
  assert.deepEqual(observations[0].dictionaryMessageIds, ["problems"]);
  assert.equal(clone.querySelector("a")!.hasAttribute("href"), false);
  assert.equal(
    clone.evaluate(observations[0].locator, clone, null, 2, null).stringValue,
    "問題一覧",
  );
  assert.equal(doc.querySelector("a")!.getAttribute("href"), "/problems");
});

test("collects rendered text and interface attributes", async () => {
  const doc = page(
    `<main><article class="problem-statement">日本語の説明</article><button aria-label="実行">実行</button><input placeholder="名前を入力"><input type="submit" value="送信"></main>`,
  );
  const candidates = collectCandidates(doc);
  assert.ok(candidates.some((candidate) => candidate.text === "日本語の説明"));
  assert.ok(candidates.some((candidate) => candidate.kind === "aria-label"));
  assert.ok(candidates.some((candidate) => candidate.kind === "placeholder"));
  assert.ok(
    candidates.some(
      (candidate) =>
        candidate.kind === "button-label" && candidate.text === "送信",
    ),
  );
  const classified = await classifyCandidates(candidates, [
    { messageId: "m", selector: "#content", path: "main" },
  ]);
  assert.equal(
    classified.find((item) => item.text === "日本語の説明")?.category,
    "content",
  );
  assert.equal(
    classified.find((item) => item.text === "実行")?.category,
    "interface",
  );
});

test("Han-only text is explicitly ambiguous", async () => {
  const doc = page(`<button>漢字</button>`);
  const classified = await classifyCandidates(collectCandidates(doc), []);
  assert.equal(classified[0]?.rule, "han-only-ambiguous");
});

test("nearby context uses a preceding visible heading in the same section without field contents", async () => {
  const doc = page(
    '<main><h2>操作 <span>メニュー</span></h2><h3 style="display:none">非表示の秘密</h3><h3 contenteditable>編集中の秘密</h3><section><h2>別の節</h2></section><form><input value="入力した秘密"><button>実行する</button></form><h2>後の見出し</h2></main><aside><button>確認する</button></aside>',
  );
  try {
    const { clone, originals } = sanitizeClone(doc);
    const classified = classifyCandidates(
      collectCandidates(clone, originals),
      [],
      [],
      originals,
    );
    const button = classified.find(
      (item) => item.text === "実行する" && item.kind === "button-label",
    )!;
    assert.equal(button.context, "操作 メニュー");
    assert.equal(
      classified.find((item) => item.text === "確認する")!.context,
      undefined,
    );
    const occurrences = await toOccurrences(
      [button],
      "capture",
      "session",
      "document",
      [],
      100,
    );
    assert.equal(occurrences[0].nearbyContext, "操作 メニュー");
    assert.doesNotMatch(JSON.stringify(occurrences), /秘密|別の節|後の見出し/);
  } finally {
    doc.defaultView?.close();
  }
});

test("actual problem containers and page/attribute scopes retain uncertain observations", () => {
  const doc = page(
    '<main id="content" data-problem-id="17"><div class="block"><p>問題の説明</p><button>実行</button></div></main><span class="scoped" title="説明です">名前</span>',
  );
  const classified = classifyCandidates(
    collectCandidates(doc),
    [
      {
        messageId: "wrong-page",
        selector: ".scoped",
        attribute: "title",
        path: "main.json",
      },
      {
        messageId: "right-page",
        selector: ".scoped",
        attribute: "title",
        path: "problem.json",
      },
    ],
    pageDictionaryNames("/problems/no/1"),
  );
  assert.equal(
    classified.find((row) => row.text === "問題の説明")!.category,
    "content",
  );
  assert.equal(
    classified.find((row) => row.text === "実行")!.category,
    "interface",
  );
  assert.deepEqual(
    classified.find((row) => row.kind === "title")!.dictionaryMessageIds,
    ["right-page"],
  );
  const uncertain = classified.find((row) => row.text === "名前")!;
  assert.equal(uncertain.category, "uncertain");
  assert.equal(uncertain.ambiguous, true);
  assert.deepEqual(uncertain.dictionaryMessageIds, []);
});

test("finding IDs group normalized text and occurrences retain exact text", async () => {
  const doc = page(`<p>日本語</p>`);
  const candidate = (await classifyCandidates(collectCandidates(doc), []))[0]!;
  const id = await findingId(" 日本語 ", "text");
  const observedAt = 123456;
  const occurrences = await toOccurrences(
    [candidate],
    "capture-1",
    "session-1",
    "document-1",
    ["event-1"],
    observedAt,
  );
  assert.equal(occurrences[0]?.findingId, id);
  assert.deepEqual(occurrences[0]?.precedingEventIds, ["event-1"]);
  assert.equal(occurrences[0]?.exactText, "日本語");
  assert.equal(occurrences[0]?.at, observedAt);
});

test("button aggregates never expose hidden descendant text", () => {
  const doc = page(
    "<button><span hidden>非表示の値</span><span>実行する</span></button>",
  );
  try {
    const probes = new Map<Element, boolean>();
    const candidates = collectCandidates(doc, undefined, probes);
    assert.deepEqual(
      candidates.map((item) => item.text),
      ["実行する"],
    );
    assert.equal(probes.get(doc.querySelector("[hidden]")!), false);
    assert.equal(probes.get(doc.querySelectorAll("span")[1]), true);
    doc.querySelector("[hidden]")!.removeAttribute("hidden");
    assert.ok(
      collectCandidates(doc).some(
        (item) =>
          item.kind === "button-label" && item.text === "非表示の値実行する",
      ),
    );
  } finally {
    doc.defaultView?.close();
  }
});
