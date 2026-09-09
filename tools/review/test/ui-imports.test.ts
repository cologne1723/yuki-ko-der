import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { UiReviewStore } from "../src/ui-review.ts";
import { ImportProgress } from "../src/import-progress.ts";
import { UiImportStore } from "../src/ui-imports.ts";
import { CollectionReviewStore } from "../src/collection-review.ts";
import { createZip } from "../../ui-collector/src/export.ts";
import { fixture } from "./collection-fixture.ts";

test("aggregate button labels that runtime cannot translate remain unverified", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "ui-import-aggregate-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, "translations/ko"), { recursive: true });
  await writeFile(
    join(root, "translations/ko.messages.json"),
    JSON.stringify({ messages: [] }),
  );
  await writeFile(
    join(root, "translations/ko/main.json"),
    JSON.stringify({ translations: [] }),
  );
  const collections = new CollectionReviewStore(root);
  const bundle = fixture(
    '<html><head></head><body><button data-collector-node="1"><span>日本</span><span>語</span></button></body></html>',
  );
  bundle.findings[0].kind = "button-label";
  Object.assign(bundle.occurrences[0], {
    kind: "button-label",
    category: "interface",
    liveCssSelectorHint: "button",
  });
  await collections.import(createZip(bundle));
  const store = new UiImportStore(new UiReviewStore(root), collections, root);
  const task = (await store.list()).tasks[0];
  assert.equal(task.status, "needs-check");
  assert.equal(task.locations[0].verified, false);
  await assert.rejects(
    store.save(task.id, {
      revision: task.revision,
      target: "한국어",
      action: "approve",
    }),
    /확인/,
  );
});

for (const [action, legacy] of (["defer", "exclude"] as const).flatMap(
  (action) => [false, true].map((legacy) => [action, legacy] as const),
)) {
  test(`${legacy ? "legacy" : "current"} ${action} cannot hide a committed approval after progress write failure`, async (t) => {
    const root = await mkdtemp(join(tmpdir(), "ui-import-progress-basis-"));
    t.after(() => rm(root, { recursive: true, force: true }));
    await mkdir(join(root, "translations/ko"), { recursive: true });
    await writeFile(
      join(root, "translations/ko.messages.json"),
      JSON.stringify({ messages: [] }),
    );
    await writeFile(
      join(root, "translations/ko/main.json"),
      JSON.stringify({ translations: [] }),
    );
    const collections = new CollectionReviewStore(root);
    const bundle = fixture();
    Object.assign(bundle.occurrences[0], {
      category: "interface",
      liveCssSelectorHint: "button",
    });
    await collections.import(createZip(bundle));
    const store = new UiImportStore(new UiReviewStore(root), collections, root);
    let task = (await store.list()).tasks[0];
    task = (await store.save(task.id, { revision: task.revision, action }))
      .tasks[0];
    if (legacy) {
      await writeFile(
        join(root, "data/collections/ui-progress.json"),
        JSON.stringify({
          tasks: { [task.id]: action === "defer" ? "deferred" : "excluded" },
        }),
      );
    }
    const write = ImportProgress.prototype.write;
    let writes = 0;
    const failure = t.mock.method(
      ImportProgress.prototype,
      "write",
      async function (
        this: ImportProgress,
        value: Parameters<typeof write>[0],
      ) {
        if (legacy && writes++ === 0) return write.call(this, value);
        throw new Error("Progress unavailable");
      },
    );
    await assert.rejects(
      store.save(task.id, {
        revision: task.revision,
        action: "approve",
        target: "한국어",
      }),
      /Progress unavailable/,
    );
    failure.mock.restore();
    const restarted = new UiImportStore(
      new UiReviewStore(root),
      collections,
      root,
    );
    task = (await restarted.list()).tasks[0];
    assert.equal(task.status, "approved");
    assert.equal(task.target, "한국어");
    task = (await restarted.save(task.id, { revision: task.revision, action }))
      .tasks[0];
    assert.equal(
      (await restarted.list()).tasks[0].status,
      action === "defer" ? "deferred" : "excluded",
    );
  });
}

test("independent import reviewers cannot overwrite progress using the same revision", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "ui-import-concurrent-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, "translations/ko"), { recursive: true });
  await writeFile(
    join(root, "translations/ko.messages.json"),
    JSON.stringify({ messages: [] }),
  );
  await writeFile(
    join(root, "translations/ko/main.json"),
    JSON.stringify({ translations: [] }),
  );
  const collections = new CollectionReviewStore(root);
  const bundle = fixture();
  bundle.occurrences[0].category = "interface";
  bundle.occurrences[0].liveCssSelectorHint = "button";
  await collections.import(createZip(bundle));
  const first = new UiImportStore(new UiReviewStore(root), collections, root);
  const second = new UiImportStore(new UiReviewStore(root), collections, root);
  const task = (await first.list()).tasks[0];
  const results = await Promise.allSettled([
    first.save(task.id, { revision: task.revision, action: "defer" }),
    second.save(task.id, { revision: task.revision, action: "exclude" }),
  ]);
  const successes = results.filter((result) => result.status === "fulfilled");
  const failures = results.filter((result) => result.status === "rejected");
  assert.equal(successes.length, 1);
  assert.equal(failures.length, 1);
  assert.equal(failures[0].reason.statusCode, 409);
  const current = (await second.list()).tasks[0];
  assert.equal(current.status, successes[0].value.tasks[0].status);
  await first.save(task.id, { revision: current.revision, action: "restore" });
  assert.equal((await second.list()).tasks[0].status, "new");
});

test("imported work saves through the catalog, preserves explicit review and survives duplicate evidence and restart", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "ui-imports-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, "translations/ko"), { recursive: true });
  const path = join(root, "translations/ko.messages.json");
  await writeFile(path, JSON.stringify({ messages: [] }));
  await writeFile(
    join(root, "translations/ko/main.json"),
    JSON.stringify({ translations: [] }),
  );
  const collections = new CollectionReviewStore(root);
  const ui = new UiReviewStore(root);
  let store = new UiImportStore(ui, collections, root);
  const bundle = fixture();
  bundle.occurrences[0].category = "interface";
  bundle.occurrences[0].liveCssSelectorHint = "button";
  const first = await collections.import(createZip(bundle));
  let item = (await store.list()).tasks[0];
  assert.equal(item.status, "new");
  assert.equal(JSON.parse(await readFile(path, "utf8")).messages.length, 0);
  await store.select(item.id, first.id);
  const draft = await store.save(item.id, {
    revision: item.revision,
    action: "save-draft",
    target: "한국어",
  });
  assert.equal(draft.tasks[0].status, "draft");
  await assert.rejects(
    store.save(item.id, {
      revision: item.revision,
      action: "approve",
      target: "한국어",
    }),
    /변경/,
  );
  item = draft.tasks[0];
  const approval = await store.save(item.id, {
    revision: item.revision,
    action: "approve",
    target: "한국어",
  });
  assert.equal(approval.tasks[0].status, "approved");
  const approved = await readFile(path, "utf8");
  bundle.cutoff = 2;
  await collections.import(createZip(bundle));
  store = new UiImportStore(
    new UiReviewStore(root),
    new CollectionReviewStore(root),
    root,
  );
  let result = await store.list();
  assert.equal(result.tasks.length, 1);
  assert.equal(result.tasks[0].locations.length, 2);
  assert.equal(result.tasks[0].status, "approved");
  assert.equal(result.selected, item.id);
  assert.equal(await readFile(path, "utf8"), approved);
  result = await store.save(item.id, {
    revision: result.tasks[0].revision,
    action: "defer",
  });
  assert.equal(result.tasks[0].status, "deferred");
  result = await store.save(item.id, {
    revision: result.tasks[0].revision,
    action: "restore",
  });
  assert.equal(result.tasks[0].status, "approved");
  result = await store.save(item.id, {
    revision: result.tasks[0].revision,
    action: "save-draft",
    target: "수정한 한국어",
  });
  assert.equal(result.tasks[0].status, "draft");
  await collections.delete(first.id);
  assert.equal((await store.list()).tasks[0].locations.length, 1);
  assert.equal(
    JSON.parse(await readFile(path, "utf8")).messages[0].target,
    "수정한 한국어",
  );
});

test("stale message IDs, ambiguous meanings, content, unresolved locations and failed writes cannot create approved work", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "ui-imports-invalid-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, "translations/ko"), { recursive: true });
  const path = join(root, "translations/ko.messages.json");
  const original = JSON.stringify({
    messages: [
      { id: "known", source: "違う", target: "다름", reviewStatus: "approved" },
    ],
  });
  await writeFile(path, original);
  await writeFile(
    join(root, "translations/ko/main.json"),
    JSON.stringify({ translations: [{ ref: "known", selector: "button" }] }),
  );
  const collections = new CollectionReviewStore(root);
  const ui = new UiReviewStore(root);
  const store = new UiImportStore(ui, collections, root);
  const bundle = fixture();
  bundle.occurrences[0].category = "interface";
  bundle.occurrences[0].liveCssSelectorHint = "button";
  const imported = await collections.import(createZip(bundle));
  let item = (await store.list()).tasks[0];
  assert.equal(item.messageId, undefined);
  assert.equal(item.status, "new");
  for (const target of ["", "日本語", "{unbound}"])
    await assert.rejects(
      store.save(item.id, {
        revision: item.revision,
        target,
        action: "approve",
      }),
    );
  assert.equal(await readFile(path, "utf8"), original);
  const snapshot = await store.snapshot(
    item.id,
    imported.id,
    bundle.occurrences[0].occurrenceId,
  );
  assert.equal(snapshot.located, true);
  assert.match(snapshot.html, /Content-Security-Policy/);
  await collections.delete(imported.id);
  bundle.occurrences[0].snapshotNodeLocator = "//missing";
  await collections.import(createZip(bundle));
  item = (await store.list()).tasks[0];
  assert.equal(item.status, "needs-check");
  await assert.rejects(
    store.save(item.id, {
      revision: item.revision,
      target: "한국어",
      action: "approve",
    }),
    /확인/,
  );
  assert.equal(await readFile(path, "utf8"), original);
});

test("progress write failure recovers from the catalog, while concurrent saves cannot approve a stale revision", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "ui-import-progress-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, "translations/ko"), { recursive: true });
  await writeFile(
    join(root, "translations/ko.messages.json"),
    JSON.stringify({ messages: [] }),
  );
  await writeFile(
    join(root, "translations/ko/main.json"),
    JSON.stringify({ translations: [] }),
  );
  const collections = new CollectionReviewStore(root);
  const ui = new UiReviewStore(root);
  const store = new UiImportStore(ui, collections, root);
  const bundle = fixture();
  bundle.occurrences[0].category = "interface";
  bundle.occurrences[0].liveCssSelectorHint = "button";
  await collections.import(createZip(bundle));
  let task = (await store.list()).tasks[0];
  const failure = t.mock.method(ImportProgress.prototype, "write", async () => {
    throw new Error("Progress unavailable");
  });
  await assert.rejects(
    store.save(task.id, {
      revision: task.revision,
      target: "한국어",
      action: "save-draft",
    }),
    /Progress unavailable/,
  );
  failure.mock.restore();
  task = (
    await new UiImportStore(new UiReviewStore(root), collections, root).list()
  ).tasks[0];
  assert.equal(task.status, "draft");
  assert.equal(task.target, "한국어");
  const results = await Promise.allSettled([
    store.save(task.id, {
      revision: task.revision,
      target: "다른 한국어",
      action: "save-draft",
    }),
    store.save(task.id, {
      revision: task.revision,
      target: "한국어",
      action: "approve",
    }),
  ]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal((await store.list()).tasks[0].status, "draft");
});

test("saving verified locations does not mark unresolved observations as reviewed", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "ui-import-partial-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, "translations/ko"), { recursive: true });
  await writeFile(
    join(root, "translations/ko.messages.json"),
    JSON.stringify({ messages: [] }),
  );
  await writeFile(
    join(root, "translations/ko/main.json"),
    JSON.stringify({ translations: [] }),
  );
  const collections = new CollectionReviewStore(root);
  const store = new UiImportStore(new UiReviewStore(root), collections, root);
  const bundle = fixture();
  bundle.occurrences[0].category = "interface";
  bundle.occurrences[0].liveCssSelectorHint = "button";
  bundle.occurrences.push({
    ...bundle.occurrences[0],
    occurrenceId: "uncertain",
    category: "uncertain",
  });
  bundle.captures[0].occurrenceIds.push("uncertain");
  bundle.findings[0].occurrenceCount = 2;
  await collections.import(createZip(bundle));
  const item = (await store.list()).tasks[0];
  assert.equal(item.locations.length, 2);
  assert.equal(item.status, "needs-check");
  const result = await store.save(item.id, {
    revision: item.revision,
    action: "approve",
    target: "한국어",
  });
  assert.equal(result.tasks[0].status, "needs-check");
  assert.equal(result.tasks[0].locations.filter((l) => l.verified).length, 1);
});

test("current link scopes are checked against inert source while previews remove destinations and forged highlights", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "ui-import-links-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, "translations/ko"), { recursive: true });
  await writeFile(
    join(root, "translations/ko.messages.json"),
    JSON.stringify({
      messages: [
        {
          id: "help",
          source: "日本語",
          target: "도움말",
          reviewStatus: "approved",
        },
      ],
    }),
  );
  await writeFile(
    join(root, "translations/ko/main.json"),
    JSON.stringify({
      translations: [{ ref: "help", selector: 'a[href="/help"]' }],
    }),
  );
  const collections = new CollectionReviewStore(root);
  const store = new UiImportStore(new UiReviewStore(root), collections, root);
  const bundle = fixture(
    '<html><body><nav><a href="/help" data-collector-node="1">日本語</a></nav><p data-review-match="true">wrong</p><script>throw new Error("must not run")</script></body></html>',
  );
  bundle.occurrences[0].category = "interface";
  const imported = await collections.import(createZip(bundle));
  const item = (await store.list()).tasks[0];
  assert.equal(item.messageId, "help");
  assert.equal(item.status, "approved");
  const preview = await store.snapshot(
    item.id,
    imported.id,
    bundle.occurrences[0].occurrenceId,
  );
  assert.equal(preview.located, true);
  assert.doesNotMatch(preview.html, /href=|<script/);
  const { JSDOM } = await import("jsdom");
  const dom = new JSDOM(preview.html);
  try {
    assert.equal(
      dom.window.document.querySelectorAll("[data-review-match]").length,
      1,
    );
    assert.equal(
      dom.window.document.querySelector("[data-review-match]")!.textContent,
      "日本語",
    );
  } finally {
    dom.window.close();
  }
});

test("external source changes invalidate an imported definition even when its generated ID remains", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "ui-import-external-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, "translations/ko"), { recursive: true });
  const path = join(root, "translations/ko.messages.json");
  await writeFile(path, JSON.stringify({ messages: [] }));
  await writeFile(
    join(root, "translations/ko/main.json"),
    JSON.stringify({ translations: [] }),
  );
  const collections = new CollectionReviewStore(root);
  const store = new UiImportStore(new UiReviewStore(root), collections, root);
  const bundle = fixture();
  bundle.occurrences[0].category = "interface";
  bundle.occurrences[0].liveCssSelectorHint = "button";
  await collections.import(createZip(bundle));
  const task = (await store.list()).tasks[0];
  await store.save(task.id, {
    revision: task.revision,
    action: "save-draft",
    target: "한국어",
  });
  const catalog = JSON.parse(await readFile(path, "utf8"));
  catalog.messages[0].source = "別の意味";
  catalog.messages[0].target = "다른 뜻";
  catalog.messages[0].reviewStatus = "approved";
  const edited = JSON.stringify(catalog);
  await writeFile(path, edited);
  const refreshed = (await store.list()).tasks[0];
  assert.equal(refreshed.source, "日本語");
  assert.equal(refreshed.target, "");
  assert.equal(refreshed.status, "needs-check");
  await assert.rejects(
    store.save(refreshed.id, {
      revision: refreshed.revision,
      action: "approve",
      target: "한국어",
    }),
    /확인/,
  );
  assert.equal(await readFile(path, "utf8"), edited);
});
