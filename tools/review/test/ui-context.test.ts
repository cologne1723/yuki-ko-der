import { readResolved } from "translation-core/catalog-files";
import { strict as assert } from "node:assert";
import test from "node:test";
import { readFile, writeFile, mkdir, mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { JSDOM } from "jsdom";
import {
  applyTranslations,
  TranslationHistory,
} from "translation-core/fixed-translations";
import { UiReviewStore } from "../src/ui-review.ts";
import { commonReviewMembers } from "translation-core/ui-review-groups";

test("common approval shares identical meanings while preserving selectors and rejecting stale groups", async () => {
  const root = await mkdtemp(join(tmpdir(), "ui-sharing-"));
  try {
    await mkdir(join(root, "translations/ko"), { recursive: true });
    const a = {
      translations: [
        {
          selector: "nav a",
          source: "質問一覧",
          reviewStatus: "unreviewed" as const,
          target: "질문 목록",
        },
        {
          selector: "p",
          source: "は",
          reviewStatus: "unreviewed" as const,
          target: "는",
        },
      ],
    };
    const b = {
      translations: [
        {
          selector: "h4",
          source: "質問一覧",
          reviewStatus: "approved" as const,
          target: "질문 목록",
        },
        {
          selector: "footer",
          source: "は",
          reviewStatus: "unreviewed" as const,
          target: "는",
        },
        {
          selector: "h5",
          source: "質問一覧",
          reviewStatus: "approved" as const,
          target: "검수된 다른 표현",
        },
      ],
    };
    await writeFile(join(root, "translations/ko/a.json"), JSON.stringify(a));
    await writeFile(join(root, "translations/ko/b.json"), JSON.stringify(b));
    const store = new UiReviewStore(root);
    const { dictionaries } = await store.list();
    let members = commonReviewMembers(dictionaries, "a.json", 0).map((m) => ({
      file: m.dictionary.file,
      index: m.index,
      revision: m.dictionary.revision,
    }));
    assert.equal(members.length, 3);
    await store.saveShared("a.json", 0, {
      target: "질문 통합",
      action: "save",
      members,
    });
    const savedGroup = (await store.list()).dictionaries;
    assert.equal(savedGroup[0].entries[0].target, "질문 통합");
    assert.equal(savedGroup[1].entries[0].target, "질문 통합");
    assert.equal(savedGroup[1].entries[2].target, "질문 통합");
    members = commonReviewMembers(savedGroup, "a.json", 0).map((m) => ({
      file: m.dictionary.file,
      index: m.index,
      revision: m.dictionary.revision,
    }));
    const result = await store.saveShared("a.json", 0, {
      target: "질문 모음",
      members,
    });
    assert.equal(result.count, 3);
    const current = (await store.list()).dictionaries;
    assert.equal(current[0].entries[0].selector, "nav a");
    assert.equal(current[1].entries[0].selector, "h4");
    assert.equal(current[0].entries[0].target, "질문 모음");
    assert.equal(current[1].entries[0].target, "질문 모음");
    assert.equal(current[1].entries[2].target, "질문 모음");
    await assert.rejects(
      store.saveShared("a.json", 0, { target: "stale", members }),
      /변경/,
    );
    assert.equal(commonReviewMembers(current, "a.json", 1).length, 0);
    await assert.rejects(
      store.saveShared("a.json", 1, { target: "은", members: [] }),
      /문맥/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("the same Japanese suffix is isolated by sentence, without changing an approved translation", async () => {
  const { translations } = await readResolved("help_team_contest.json");
  const suffixes = translations.filter((e) => e.source === "されます。");
  const dom = new JSDOM(
    '<div id="content"><h4 id="rules"></h4><table class="tg-rules"><tr><td>1</td></tr><tr><td>2</td></tr><tr><td><b>メンバー全員分が合算</b>されます。</td></tr><tr><td>4</td></tr><tr><td>5</td></tr><tr><td>自分がメンバーなら、そのチームの行が<b>自分の行として強調</b>されます。</td></tr></table><table><tr><td>されます。</td></tr></table></div>',
  );
  applyTranslations(dom.window.document, suffixes);
  const cells = dom.window.document.querySelectorAll("td");
  assert.ok(cells[2].textContent?.endsWith("합니다."));
  assert.ok(cells[5].textContent?.endsWith("됩니다."));
  assert.equal(cells[6].textContent, "されます。");
  assert.equal(
    suffixes
      .find((e) => e.selector.includes("nth-child(6)"))
      ?.target.replace(/^/u, ""),
    "됩니다.",
  );
});

test("difficulty descriptions preserve each source line and translation toggling restores them", async () => {
  const { translations } = await readResolved("help.json");
  const entry = translations.find(
    (e) => e.selector === "#content pre" && e.source.startsWith("★ "),
  )!;
  const source = entry.source.replace(/ (?=★+[☆]? )/gu, "\n");
  const dom = new JSDOM('<div id="content"><pre></pre></div>');
  const pre = dom.window.document.querySelector("pre")!;
  pre.textContent = source;
  const history = new TranslationHistory();
  applyTranslations(dom.window.document, [entry], history);
  assert.equal(pre.textContent.trim().split("\n").length, 11);
  assert.match(pre.textContent, /\n★★☆ /);
  history.restore();
  assert.equal(pre.textContent, source);
});
