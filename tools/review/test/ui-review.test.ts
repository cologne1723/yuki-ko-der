import { strict as assert } from "node:assert";
import test from "node:test";
import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  rm,
  symlink,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { UiReviewStore } from "../src/ui-review.ts";
import { applyTranslations } from "translation-core/fixed-translations";
import { JSDOM } from "jsdom";

test("review metadata stays separate from rendered text and attributes", () => {
  const entries = [
    {
      selector: "a",
      source: "名前",
      reviewStatus: "unreviewed" as const,
      target: "이름",
    },
    {
      selector: "input",
      attribute: "placeholder",
      source: "{count}人",
      reviewStatus: "unreviewed" as const,
      target: "{count}명",
      variables: { count: "\\d+" },
    },
  ];
  const dom = new JSDOM('<a> 名前 </a><p>名前</p><input placeholder="12人">');
  applyTranslations(dom.window.document, entries);
  assert.equal(dom.window.document.querySelector("a")?.textContent, " 이름 ");
  assert.equal(
    dom.window.document.querySelector("input")?.getAttribute("placeholder"),
    "12명",
  );
  assert.equal(dom.window.document.querySelector("p")?.textContent, "名前");
  assert.equal(entries[0].target, "이름");
  assert.equal(entries[0].reviewStatus, "unreviewed");
});

test("UI review persists review actions, protects concurrent edits and named placeholders", async () => {
  const root = await mkdtemp(join(tmpdir(), "ui-review-"));
  try {
    await mkdir(join(root, "translations/ko"), { recursive: true });
    const path = join(root, "translations/ko/common.json");
    await writeFile(
      path,
      JSON.stringify({
        locale: "ko",
        translations: [
          {
            selector: "a",
            source: "{count}人",
            reviewStatus: "unreviewed" as const,
            target: "{count}명",
            variables: { count: "\\d+" },
          },
        ],
      }),
    );
    const store = new UiReviewStore(root);
    let revision = (await store.list()).dictionaries[0].revision;
    await assert.rejects(
      store.save("common.json", 0, { target: "명", revision, action: "save" }),
      /변수/,
    );
    const results = await Promise.allSettled([
      store.save("common.json", 0, {
        target: "인원 {count}",
        revision,
        action: "save",
      }),
      store.save("common.json", 0, {
        target: "{count}명",
        revision,
        action: "approve",
      }),
    ]);
    assert.equal(results[0].status, "fulfilled");
    assert.equal(results[1].status, "rejected");
    let dictionary = (await store.list()).dictionaries[0];
    assert.equal(dictionary.entries[0].target, "인원 {count}");
    assert.equal(dictionary.entries[0].reviewStatus, "unreviewed");
    let result = await store.save("common.json", 0, {
      target: "인원 {count}",
      revision: dictionary.revision,
      action: "approve",
    });
    assert.equal(result.entry.target, "인원 {count}");
    assert.equal(result.entry.reviewStatus, "approved");
    result = await store.save("common.json", 0, {
      target: "{count}명",
      revision: result.revision,
      action: "save",
    });
    assert.equal(result.entry.target, "{count}명");
    assert.equal(result.entry.reviewStatus, "unreviewed");
    result = await store.save("common.json", 0, {
      target: "{count}명",
      revision: result.revision,
      action: "unapprove",
    });
    assert.equal(result.entry.target, "{count}명");
    assert.equal(JSON.parse(await readFile(path, "utf8")).locale, "ko");
    await assert.rejects(
      store.save("../common.json", 0, {
        target: "x",
        revision,
        action: "save",
      }),
      /올바르지/,
    );
    assert.deepEqual((await store.list()).pages, []);
    await mkdir(join(root, "data/pages"), { recursive: true });
    await writeFile(
      join(root, "data/pages/main.html"),
      '<script>alert(1)</script><a onclick="alert(1)" href="javascript:alert(1)">名前</a><iframe src="https://example.com"></iframe>',
    );
    const html = await store.page("main.html");
    assert.doesNotMatch(html, /<script|onclick|javascript:|<iframe/);
    assert.match(html, /名前/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("UI review loads saved coverage and previews from the selected data directory", async () => {
  const root = await mkdtemp(join(tmpdir(), "ui-review-data-"));
  try {
    await mkdir(join(root, "translations/ko"), { recursive: true });
    for (const name of ["data", "custom-data"]) {
      const directory = join(root, name);
      await mkdir(join(directory, "reports"), { recursive: true });
      await mkdir(join(directory, "pages"), { recursive: true });
      await writeFile(
        join(directory, "pages", `${name}.html`),
        "<p>Preview</p>",
      );
      await symlink(`${name}.html`, join(directory, "pages/preview.html"));
      const entries = [{ file: "main.json", pages: ["preview.html"] }];
      await writeFile(
        join(directory, "reports/ui-page-coverage.json"),
        JSON.stringify({ entries }),
      );
      const store =
        name === "data"
          ? new UiReviewStore(root)
          : new UiReviewStore(root, directory);
      const result = await store.list();
      assert.deepEqual(result.coverage, entries);
      assert.deepEqual(
        result.pages.sort(),
        [`${name}.html`, "preview.html"].sort(),
      );
      assert.match(await store.page("preview.html"), /Preview/);
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
