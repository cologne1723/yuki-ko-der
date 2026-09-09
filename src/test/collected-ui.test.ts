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
}
for (const tag of ["div", "span"]) {
  test(`contest navigation translates split link/text in ${tag} without changing problem options`, async () => {
    const dom = new JSDOM(
      `<main id="content"><${tag}><a href="/contests/94">コンテスト</a>の他の問題:<span id="contest-problem-selector-wrapper"><select><option>✅ A. No.172 UFOを捕まえろ</option></select></span></${tag}></main>`,
    );
    try {
      const d = dom.window.document;
      const link = d.querySelector("a")!;
      const option = d.querySelector("option")!;
      const history = new TranslationHistory();
      await translate(
        d,
        tag === "div" ? "/problems/no/173" : "/problems/no/173/submissions",
        history,
      );
      assert.equal(link.textContent, "대회");
      assert.equal(link.nextSibling?.textContent, "의 다른 문제:");
      assert.equal(link.getAttribute("href"), "/contests/94");
      assert.equal(d.querySelector("option"), option);
      assert.equal(option.textContent, "✅ A. No.172 UFOを捕まえろ");
      history.restore();
      assert.equal(link.textContent, "コンテスト");
      assert.equal(link.nextSibling?.textContent, "の他の問題:");
    } finally {
      dom.window.close();
    }
  });
}
test("challenge detail route loads its dictionary and preserves timestamp values", async () => {
  const dom = new JSDOM(
    '<main id="content"><p>提出日時 2026-02-05 18:04:05</p><button class="btn btn-danger">チャレンジをキャンセル</button></main>',
  );
  try {
    await translate(
      dom.window.document,
      "/challenge/792",
      new TranslationHistory(),
    );
    assert.equal(
      dom.window.document.querySelector("p")!.textContent,
      "제출 일시 2026-02-05 18:04:05",
    );
    assert.equal(
      dom.window.document.querySelector("button")!.textContent,
      "챌린지 취소",
    );
  } finally {
    dom.window.close();
  }
});

for (const crown of ["", " 👑", " <i>👑</i>"]) {
  test(`challenge user label preserves optional crown ${JSON.stringify(crown)}`, async () => {
    const dom = new JSDOM(
      `<main id="content"><form id="submit_form">チャレンジしたユーザー${crown}</form></main>`,
    );
    try {
      const form = dom.window.document.querySelector("form")!;
      const icon = form.querySelector("i");
      const history = new TranslationHistory();
      await translate(dom.window.document, "/challenge/792", history);
      assert.equal(form.textContent, `챌린지한 사용자${crown ? " 👑" : ""}`);
      assert.equal(form.querySelector("i"), icon);
      history.restore();
      assert.equal(
        form.textContent,
        `チャレンジしたユーザー${crown ? " 👑" : ""}`,
      );
    } finally {
      dom.window.close();
    }
  });
}

test("editorial section heading uses the approved UI translation", async () => {
  const dom = new JSDOM(
    '<main id="content"><div><div class="block"><h4 class="shadow">解説</h4><p>解説の本文</p></div></div></main>',
  );
  try {
    await translate(
      dom.window.document,
      "/problems/no/1/editorial",
      new TranslationHistory(),
    );
    assert.equal(dom.window.document.querySelector("h4")!.textContent, "해설");
    assert.equal(
      dom.window.document.querySelector("p")!.textContent,
      "解説の本文",
    );
  } finally {
    dom.window.close();
  }
});
