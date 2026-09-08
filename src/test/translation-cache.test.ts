import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { createTranslationCache } from "../translation-cache.ts";
const body = (no: number) => `problem-translation-html:ko:${no}`;
const catalogKey =
  "problem-catalog:ko:https://translations.test/ko/problem-catalog.json";
const hash = (s: string) => createHash("sha256").update(s).digest("hex");
const catalog = (entries: [number, string][]) => ({
  schemaVersion: 1,
  revision: "a".repeat(64),
  entries: entries.map(([no, html]) => ({
    problemNo: no,
    problemId: no,
    source: "元",
    target: "번역",
    htmlSha256: hash(html),
  })),
});
function fixture(budget = 1500) {
  const saved: Record<string, unknown> = { translationEnabled: false };
  let quota = Infinity;
  let writes = 0;
  const storage = {
    get: async (key: string | null) =>
      structuredClone(key === null ? saved : { [key]: saved[key] }),
    set: async (values: Record<string, unknown>) => {
      writes++;
      if (Buffer.byteLength(JSON.stringify({ ...saved, ...values })) > quota)
        throw new Error("QUOTA_BYTES exceeded");
      Object.assign(saved, structuredClone(values));
    },
    remove: async (keys: string | string[]) => {
      for (const key of Array.isArray(keys) ? keys : [keys]) delete saved[key];
    },
  };
  return {
    saved,
    storage,
    cache: createTranslationCache(storage, budget),
    quota: (n: number) => {
      quota = n;
    },
    writes: () => writes,
  };
}

test("legacy migration rebuilds accounting, trims excess and retains settings and catalog", async () => {
  const f = fixture();
  f.saved[catalogKey] = catalog([]);
  f.saved[body(1)] = "x".repeat(900);
  f.saved[body(2)] = "y".repeat(900);
  await f.cache.get(catalogKey);
  assert.equal(f.saved.translationEnabled, false);
  assert.ok(f.saved[catalogKey]);
  assert.ok(f.saved["translation-cache:metadata:v1"]);
  assert.equal(
    Object.keys(f.saved).filter((k) =>
      k.startsWith("problem-translation-html:"),
    ).length,
    1,
  );
});

test("serialized LRU eviction accounts for replacement growth and concurrent tabs", async () => {
  const f = fixture(1800);
  await f.cache.set({ [body(1)]: "a".repeat(400) });
  await f.cache.set({ [body(2)]: "b".repeat(400) });
  await f.cache.get(body(1));
  await Promise.all([
    f.cache.set({ [body(3)]: "c".repeat(400) }),
    f.cache.set({ [body(1)]: "a".repeat(800) }),
  ]);
  assert.equal(f.saved[body(2)], undefined);
  assert.equal(f.saved[body(1)], "a".repeat(800));
  assert.equal(f.saved[body(3)], "c".repeat(400));
});

test("catalog takes priority over bodies, oversized responses are not retained", async () => {
  const f = fixture(1200);
  const html = "x".repeat(900);
  await f.cache.set({ [catalogKey]: catalog([[1, html]]) });
  await f.cache.set({ [body(1)]: html });
  assert.ok(f.saved[catalogKey]);
  assert.equal(f.saved[body(1)], undefined);
  await f.cache.set({ [body(2)]: "x".repeat(3000) });
  assert.ok(f.saved[catalogKey]);
  assert.equal(f.saved[body(2)], undefined);
});

test("quota failures evict bodies and retry; unrelated storage failures remain retryable", async () => {
  const f = fixture(5000);
  await f.cache.set({ [body(1)]: "a".repeat(700) });
  f.quota(1400);
  await f.cache.set({ [body(2)]: "b".repeat(700) });
  assert.equal(f.saved[body(1)], undefined);
  assert.ok(f.saved[body(2)]);
  assert.ok(f.writes() >= 4);
  f.quota(Infinity);
  await f.cache.set({ [body(3)]: "c" });
  assert.equal(f.saved.translationEnabled, false);
});

test("removal state survives restarts and stale-body writes cannot defeat authoritative catalogs", async () => {
  const f = fixture();
  await f.cache.set({ [body(1)]: "old" });
  await f.cache.remove(body(1));
  f.saved[body(1)] = "old"; // Simulate an interrupted physical removal.
  const restarted = createTranslationCache(f.storage);
  assert.equal((await restarted.get(body(1)))[body(1)], undefined);
  await restarted.set({ [catalogKey]: catalog([]) });
  await restarted.set({ [body(1)]: "old" });
  assert.equal((await restarted.get(body(1)))[body(1)], undefined);
  await restarted.set({ [catalogKey]: catalog([[1, "new"]]) });
  await restarted.set({ [body(1)]: "old" });
  assert.equal((await restarted.get(body(1)))[body(1)], undefined);
  await restarted.set({ [body(1)]: "new" });
  assert.equal((await restarted.get(body(1)))[body(1)], "new");
});

test("failed catalog replacement cannot revive old authority after restart, and retry recovers", async () => {
  const f = fixture(5000);
  await f.cache.set({ [catalogKey]: catalog([[1, "old"]]) });
  await f.cache.set({ [body(1)]: "old" });
  let fail = true;
  const storage = {
    ...f.storage,
    set: async (values: Record<string, unknown>) => {
      if (fail && catalogKey in values)
        throw new Error("Storage temporarily unavailable");
      await f.storage.set(values);
    },
  };
  const cache = createTranslationCache(storage);
  await assert.rejects(
    cache.set({ [catalogKey]: catalog([]) }),
    /temporarily unavailable/,
  );
  const restarted = createTranslationCache(storage);
  assert.equal((await restarted.get(catalogKey))[catalogKey], undefined);
  assert.equal((await restarted.get(body(1)))[body(1)], undefined);
  fail = false;
  await restarted.set({ [catalogKey]: catalog([[1, "new"]]) });
  await restarted.set({ [body(1)]: "new" });
  assert.equal((await restarted.get(body(1)))[body(1)], "new");
});

test("an in-flight body cannot erase a 404 tombstone and authority accounting stays within budget", async () => {
  const f = fixture(1600);
  const html = "x".repeat(750);
  await f.cache.set({ [catalogKey]: catalog([[1, html]]) });
  await f.cache.set({ [body(1)]: html });
  await f.cache.remove(body(1));
  await f.cache.set({ [body(1)]: html });
  assert.equal((await f.cache.get(body(1)))[body(1)], undefined);
  await f.cache.set({ [catalogKey]: catalog([[1, html]]) });
  await f.cache.set({ [body(1)]: html });
  assert.equal((await f.cache.get(body(1)))[body(1)], html);
  const retained = Object.fromEntries(
    Object.entries(f.saved).filter(([key]) => key !== "translationEnabled"),
  );
  assert.ok(Buffer.byteLength(JSON.stringify(retained)) <= 1600);
});
