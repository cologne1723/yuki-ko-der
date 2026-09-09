import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { CollectionReviewStore } from "../src/collection-review.ts";
import { UiReviewStore } from "../src/ui-review.ts";
import { fixture } from "./collection-fixture.ts";
import { createZip } from "../../ui-collector/src/export.ts";
import { JSDOM } from "jsdom";

test("glossary discovers imported snapshots without downloaded pages and serves only inert HTML", async () => {
  const root = await mkdtemp(join(tmpdir(), "glossary-collected-"));
  try {
    await mkdir(join(root, "translations/ko"), { recursive: true });
    await writeFile(
      join(root, "translations/ko.messages.json"),
      JSON.stringify({
        messages: [
          {
            id: "ui_1234567890abcdef",
            source: "日本語",
            target: "한국어",
            reviewStatus: "unreviewed",
          },
        ],
      }),
    );
    await writeFile(
      join(root, "translations/ko/main.json"),
      JSON.stringify({
        translations: [{ selector: "button", ref: "ui_1234567890abcdef" }],
      }),
    );
    const collections = new CollectionReviewStore(root);
    const archive = fixture(
      '<html><head><script>alert(1)</script></head><body><button data-collector-node="1" onclick="alert(1)">日本語</button><img src="https://example.com/pixel"></body></html>',
    );
    const imported = await collections.import(createZip(archive));
    const store = new UiReviewStore(root);
    const result = await store.list();
    assert.equal(result.pages.length, 1);
    assert.match(result.pageLabels[result.pages[0]], /수집 ZIP/);
    assert.deepEqual(result.coverage[0], {
      file: "main.json",
      index: 0,
      source: "日本語",
      pages: result.pages,
    });
    const html = await store.page(result.pages[0]);
    const dom = new JSDOM(html);
    try {
      assert.equal(
        dom.window.document.querySelector("button")?.textContent,
        "日本語",
      );
      assert.equal(
        dom.window.document.querySelector("script, [onclick], [src]"),
        null,
      );
    } finally {
      dom.window.close();
    }
    await collections.delete(imported.id);
    assert.equal((await store.list()).pages.length, 0);
    await assert.rejects(() => store.page(result.pages[0]));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
