import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { JSDOM } from "jsdom";
import {
  applyTranslations,
  TranslationHistory,
} from "translation-core/fixed-translations";
import { resolveDictionary } from "translation-core/translation-catalog";
import { pageDictionaryNames } from "translation-core/page-dictionaries";
import { TagTranslator, tagTranslationsSchema } from "../tag-translations.ts";
const tags = tagTranslationsSchema.parse(
  JSON.parse(await readFile("translations/tags/ko.json", "utf8")),
).tags;
const tagTranslator = new TagTranslator(tags);

const catalog = JSON.parse(
  await readFile("translations/ko.messages.json", "utf8"),
);
async function translate(
  document: Document,
  path: string,
  history: TranslationHistory,
) {
  for (const name of pageDictionaryNames(path)) {
    const dictionary = JSON.parse(
      await readFile(`translations/ko/${name}.json`, "utf8"),
    );
    applyTranslations(
      document,
      resolveDictionary(dictionary, catalog, document).translations,
      history,
    );
  }
  tagTranslator.apply(document, history);
}

test("memory statistics route translates split explanation and preserves values and elements", async () => {
  const dom =
    new JSDOM(`<nav id="toplinks"><a href="/statistics/language_memory">言語別メモリ</a></nav>
    <main id="content"><h4>言語別メモリ</h4>
    <p class="description">各言語の<b>参考提出</b>（<a href="/problems/no/9000">No.9000 Hello World!（テスト用）</a>を解いた最小限の提出）を
    本番と同じジャッジサーバで実行し、その使用メモリから
    「この言語が通るために最低限必要なメモリ制限」を出しています。<br>
    いちばん要るのは <b>300 MB</b> です。全言語を通したいなら、メモリ制限はこれに解法が使う分を足した値にしてください。
    メモリ制限の上限は 2048 MB です。<br></p>
    <table id="languageMemoryTable"><thead><tr><th>言語</th><th>言語ID</th><th>最低メモリ制限</th><th>計測値</th><th>参考提出</th></tr></thead>
    <tbody><tr><td>C++23</td><td>cpp23</td><td>44 MB</td><td>43104 KB</td><td><a href="/submissions/123">123</a></td></tr></tbody></table>
    <ul><li>判定に使うのは提出プロセスの使用メモリ（Maxrss）です。ジャッジは
    <code>使用メモリ(KB) &gt;= 1000 × メモリ制限(MB)</code> で MLE にするので、
    「最低メモリ制限」は計測値を 1000 で割って切り上げた値ではなく、
    <b>それを超える最小の整数</b>です。
    例えば 43104 KB の言語は 43 MB では <code>43104 &gt;= 43000</code> で MLE になるため、44 MB が要ります。</li></ul></main>`);
  try {
    const d = dom.window.document,
      history = new TranslationHistory();
    const before = d.body.innerHTML,
      link = d.querySelector(".description a"),
      code = d.querySelector("code");
    const data = d.querySelector("tbody")!.innerHTML;
    await translate(d, "/statistics/language_memory", history);
    assert.equal(d.querySelector("h4")!.textContent, "언어별 메모리");
    assert.equal(d.querySelector("#toplinks a")!.textContent, "언어별 메모리");
    assert.match(
      d.querySelector(".description")!.textContent!,
      /300 MB를 사용합니다/,
    );
    assert.match(
      d.querySelector(".description")!.textContent!,
      /2048 MB입니다/,
    );
    assert.match(
      d.querySelector("li")!.textContent!,
      /그 몫보다 큰 가장 작은 정수/,
    );
    assert.doesNotMatch(
      d
        .querySelector("#content")!
        .textContent!.replace("No.9000 Hello World!（テスト用）", ""),
      /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]/u,
    );
    assert.equal(d.querySelector(".description a"), link);
    assert.equal(link!.textContent, "No.9000 Hello World!（テスト用）");
    assert.equal(d.querySelector("code"), code);
    assert.equal(d.querySelector("tbody")!.innerHTML, data);
    history.restore();
    assert.equal(d.body.innerHTML, before);
  } finally {
    dom.window.close();
  }
});

test("tag labels preserve counts, search inputs, links and unrelated titles through rebuilding and restoration", async () => {
  const dom =
    new JSDOM(`<main id="content"><table><tbody id="tags_tbody"><tr><td><a href="/problems?tags=動的計画法">動的計画法 (313) </a></td><td><a href="/wiki/動的計画法">Wiki</a></td></tr></tbody></table>
    <a id="detail" href="/problems?tags=動的計画法">動的計画法</a>
    <a id="rare" href="/problems?tags=フェルマーの小定理">フェルマーの小定理</a>
    <a id="skip" href="/problems?tags=YSFBC">YSFBC</a>
    <a id="title" href="/problems/no/1">動的計画法</a><input name="tags" value="動的計画法"><pre>動的計画法</pre></main>`);
  try {
    const d = dom.window.document,
      history = new TranslationHistory();
    const hrefs = [...d.querySelectorAll("a")].map((a) =>
      a.getAttribute("href"),
    );
    await translate(d, "/statistics/tags", history);
    assert.equal(
      d.querySelector("#tags_tbody a")!.textContent,
      "다이나믹 프로그래밍 (313) ",
    );
    assert.equal(
      d.querySelector("#detail")!.textContent,
      "다이나믹 프로그래밍",
    );
    assert.equal(d.querySelector("#rare")!.textContent, "페르마의 소정리");
    assert.equal(d.querySelector("#skip")!.textContent, "YSFBC");
    assert.equal(d.querySelector("#title")!.textContent, "動的計画法");
    assert.equal(d.querySelector("input")!.value, "動的計画法");
    assert.equal(d.querySelector("pre")!.textContent, "動的計画法");
    assert.deepEqual(
      [...d.querySelectorAll("a")].map((a) => a.getAttribute("href")),
      hrefs,
    );
    d.querySelector("#tags_tbody")!.innerHTML =
      '<tr><td><a href="/problems?tags=動的計画法">動的計画法 (314) </a></td></tr>';
    await translate(d, "/statistics/tags", history);
    assert.equal(
      d.querySelector("#tags_tbody a")!.textContent,
      "다이나믹 프로그래밍 (314) ",
    );
    history.restore();
    assert.equal(
      d.querySelector("#tags_tbody a")!.textContent,
      "動的計画法 (314) ",
    );
    assert.equal(d.querySelector("#detail")!.textContent, "動的計画法");
    await translate(d, "/problems/no/1", history);
    assert.equal(
      d.querySelector("#detail")!.textContent,
      "다이나믹 프로그래밍",
    );
  } finally {
    dom.window.close();
  }
});

test("tag catalog stays separate from UI and validates source identities", async () => {
  assert(!pageDictionaryNames("/statistics/tags").includes("tags"));
  const ui = JSON.parse(
    await readFile("translations/ko/statistics_tags.json", "utf8"),
  );
  assert(
    !ui.translations.some((entry: { selector: string }) =>
      entry.selector.includes("#tags_tbody"),
    ),
  );
  assert.throws(
    () =>
      tagTranslationsSchema.parse({ locale: "ko", tags: [tags[0], tags[0]] }),
    /Duplicate source tag/,
  );
  const d = new JSDOM(
    '<main id="content"><a href="https://example.com/problems?tags=動的計画法">動的計画法</a><a href="/problems?tags=数学">動的計画法</a><a href="/problems?tags=%ZZ">数学</a><a href="/problems?page=2&amp;tags=動的計画法">動的計画法</a></main>',
  );
  try {
    tagTranslator.apply(d.window.document, new TranslationHistory());
    assert.deepEqual(
      [...d.window.document.querySelectorAll("a")].map((a) => a.textContent),
      ["動的計画法", "動的計画法", "数学", "다이나믹 프로그래밍"],
    );
  } finally {
    d.window.close();
  }
});

test("bundled tag translations follow dynamic updates and the extension toggle", async () => {
  const { bundle, page, settle } = await import("./extension-fixture.ts");
  const code = await bundle("src/content.ts");
  const { dom, close } = page(
    '<main id="content"><table><tbody id="tags_tbody"></tbody></table></main>',
    "https://yukicoder.me/statistics/tags",
  );
  let changed!: (
    changes: Record<string, { newValue: unknown }>,
    area: string,
  ) => void;
  Object.assign(dom.window, {
    chrome: {
      runtime: {
        getURL: (p: string) => p,
        sendMessage: async () => ({ ok: true, source: "bundled" }),
      },
      storage: {
        local: { get: async () => ({}) },
        onChanged: {
          addListener: (fn: typeof changed) => {
            changed = fn;
          },
        },
      },
    },
    fetch: async () => new Response(JSON.stringify({ translations: [] })),
  });
  try {
    dom.window.eval(code);
    await settle();
    const body = dom.window.document.querySelector("tbody")!;
    body.innerHTML =
      '<tr><td><a href="/problems?tags=動的計画法">動的計画法 (314) </a></td></tr>';
    await settle();
    assert.equal(body.textContent, "다이나믹 프로그래밍 (314) ");
    changed({ translationEnabled: { newValue: false } }, "local");
    await settle();
    assert.equal(body.textContent, "動的計画法 (314) ");
    changed({ translationEnabled: { newValue: true } }, "local");
    await settle();
    assert.equal(body.textContent, "다이나믹 프로그래밍 (314) ");
  } finally {
    close();
  }
});
