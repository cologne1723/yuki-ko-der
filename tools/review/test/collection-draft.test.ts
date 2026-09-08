import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { UiReviewStore } from "../src/ui-review.ts";
import { assertCatalogShapes } from "translation-core/catalog-schema";
import { validateCatalog } from "translation-core/translation-catalog";
import { JSDOM } from "jsdom";

test("collected text saves as a canonical unreviewed draft and scoped usage, then opens for review", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "collection-draft-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, "translations/ko"), { recursive: true });
  const catalogPath = join(root, "translations/ko.messages.json"),
    pagePath = join(root, "translations/ko/main.json");
  await writeFile(catalogPath, JSON.stringify({ messages: [] }));
  await writeFile(pagePath, JSON.stringify({ translations: [] }));
  const store = new UiReviewStore(root);
  const options = await store.draftOptions("名前", "/");
  const body = {
    file: "main.json",
    revision: options.files[0].revision,
    selector: ".account label",
    reviewStatus: "approved" as const,
    target: "이름",
  };
  for (const invalid of [
    { ...body, selector: "[" },
    { ...body, selector: '[data-collector-node="1"]' },
    { ...body, target: "" },
    { ...body, target: "{unknown}" },
    { ...body, file: "../../outside.json" },
    { ...body, attribute: "onclick" },
  ]) {
    await assert.rejects(store.createDraft("名前", "/", invalid));
    assert.deepEqual(JSON.parse(await readFile(catalogPath, "utf8")), {
      messages: [],
    });
    assert.deepEqual(JSON.parse(await readFile(pagePath, "utf8")), {
      translations: [],
    });
  }
  const results = await Promise.allSettled([
    store.createDraft("名前", "/", body),
    store.createDraft("名前", "/", body),
  ]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  const result = (
    results.find((r) => r.status === "fulfilled") as PromiseFulfilledResult<
      Awaited<ReturnType<typeof store.createDraft>>
    >
  ).value;
  assert.equal(result.target, "이름");
  assert.equal(result.file, "main.json");
  const catalog = JSON.parse(await readFile(catalogPath, "utf8")),
    page = JSON.parse(await readFile(pagePath, "utf8"));
  assert.equal(catalog.messages.length, 1);
  assert.equal(catalog.messages[0].source, "名前");
  assert.equal(catalog.messages[0].reviewStatus, "unreviewed");
  assert.deepEqual(page.translations, [
    { ref: result.messageId, selector: ".account label" },
  ]);
  const dom = new JSDOM("");
  try {
    assertCatalogShapes(catalog, { "main.json": page });
    validateCatalog(catalog, { "main.json": page }, dom.window.document);
  } finally {
    dom.window.close();
  }
  const dictionary = (await store.list()).dictionaries[0];
  assert.equal(dictionary.entries[result.index].target, "이름");
  await store.save(result.file, result.index, {
    target: "이름",
    action: "approve",
    revision: dictionary.revision,
  });
  const reviewed = await readFile(catalogPath, "utf8");
  const fresh = await store.draftOptions("名前", "/");
  assert.equal(fresh.matches[0].target, "이름");
  await assert.rejects(
    store.createDraft("名前", "/", {
      ...body,
      revision: fresh.files[0].revision,
    }),
    /이미 있습니다/u,
  );
  const reused = await store.createDraft("名前", "/", {
    ...body,
    revision: fresh.files[0].revision,
    selector: ".profile label",
    reuseId: result.messageId,
    target: "must not overwrite",
  });
  assert.equal(reused.reused, true);
  assert.equal(await readFile(catalogPath, "utf8"), reviewed);
  assert.equal(
    JSON.parse(await readFile(pagePath, "utf8")).translations.length,
    2,
  );
  const next = await store.draftOptions("名前", "/");
  await store.createDraft("名前", "/", {
    ...body,
    revision: next.files[0].revision,
    meaning: "file name",
    target: "파일명",
    selector: ".file label",
  });
  assert.equal(
    JSON.parse(await readFile(catalogPath, "utf8")).messages.length,
    2,
  );
});
