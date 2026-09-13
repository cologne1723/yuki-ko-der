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

test("homepage problem-page arrow translates without changing destination and restores", async () => {
  const dom = new JSDOM(
    '<main id="content"><div class="next-event-card"><div class="nec-link"><a href="/problems/14023">問題ページ →</a></div></div><pre>問題ページ →</pre></main>',
  );
  try {
    const history = new TranslationHistory(),
      doc = dom.window.document;
    await translate(doc, "/", history);
    assert.equal(doc.querySelector("a")!.textContent, "문제 페이지 →");
    assert.equal(
      doc.querySelector("a")!.getAttribute("href"),
      "/problems/14023",
    );
    assert.equal(doc.querySelector("pre")!.textContent, "問題ページ →");
    history.restore();
    assert.equal(doc.querySelector("a")!.textContent, "問題ページ →");
  } finally {
    dom.window.close();
  }
});

test("reported release and submission links translate across IDs without changing destinations or code", async () => {
  for (const id of [1185715, 42]) {
    const dom = new JSDOM(
      `<main id="content"><div class="next-event-card" data-open="2026-09-14T16:00:00+09:00"><div class="nec-type">次の単発公開</div><div class="nec-countdown">5:00</div></div><div style="margin-top: 30px"><a href="/challenge/new/${id}">このコードへのチャレンジ（β）</a></div><a href="/submissions/${id}/print/out/challenge01.txt" class="stdout-hover-tooltip">標準出力</a><a href="/problems/no/${id}/testcase.zip">テストケース一括ダウンロード</a><pre>次の単発公開 標準出力 テストケース一括ダウンロード</pre></main>`,
    );
    try {
      const doc = dom.window.document,
        history = new TranslationHistory();
      const original = doc.querySelector("main")!.innerHTML;
      const links = [...doc.querySelectorAll("a")];
      const hrefs = links.map((a) => a.getAttribute("href"));
      await translate(doc, "/", history);
      await translate(doc, `/submissions/${id}`, history);
      await translate(doc, `/problems/no/${id}`, history);
      assert.equal(
        doc.querySelector(".nec-type")!.textContent,
        "다음 개별 문제 공개",
      );
      assert.deepEqual(
        links.map((a) => a.textContent),
        [
          "이 코드에 대한 챌린지(β)",
          "표준 출력",
          "테스트 케이스 일괄 다운로드",
        ],
      );
      assert.deepEqual(
        links.map((a) => a.getAttribute("href")),
        hrefs,
      );
      assert.equal(doc.querySelector(".nec-countdown")!.textContent, "5:00");
      assert.equal(
        doc.querySelector(".next-event-card")!.getAttribute("data-open"),
        "2026-09-14T16:00:00+09:00",
      );
      assert.equal(
        doc.querySelector("pre")!.textContent,
        "次の単発公開 標準出力 テストケース一括ダウンロード",
      );
      history.restore();
      assert.equal(doc.querySelector("main")!.innerHTML, original);
    } finally {
      dom.window.close();
    }
  }
});
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
