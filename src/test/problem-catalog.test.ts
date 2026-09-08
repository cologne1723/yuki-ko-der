import assert from "node:assert/strict";
import test from "node:test";
import { createProblemCatalogLoader } from "../problem-catalog.ts";
import { parseProblemCatalog } from "translation-core/problem-catalog";

const entry = {
  problemNo: 1,
  problemId: 18,
  source: "題名",
  target: "제목",
  htmlSha256: "a".repeat(64),
};
const catalog = {
  schemaVersion: 1 as const,
  revision: "b".repeat(64),
  entries: [entry],
};
test("published catalogs reject unsupported schemas, duplicates and malformed identities", () => {
  assert.deepEqual(parseProblemCatalog(catalog), catalog);
  for (const value of [
    null,
    { ...catalog, schemaVersion: 2 },
    { ...catalog, entries: [entry, entry] },
    { ...catalog, entries: [{ ...entry, problemId: 0 }] },
    { ...catalog, entries: [{ ...entry, htmlSha256: "bad" }] },
  ])
    assert.throws(() => parseProblemCatalog(value));
  assert.deepEqual(
    parseProblemCatalog({ ...catalog, entries: [] }).entries,
    [],
  );
});

test("each page load revalidates, concurrent requests share a fetch, and deletions survive offline fallback", async () => {
  let saved: Record<string, unknown> = {};
  let remote = catalog;
  let fail = false;
  let calls = 0;
  const storage = {
    get: async () => saved,
    set: async (value: Record<string, unknown>) => {
      saved = value;
    },
  };
  const fetcher: typeof fetch = async (_url, options) => {
    calls++;
    assert.equal(options?.cache, "no-cache");
    if (fail) throw new Error("offline");
    return Response.json(remote);
  };
  const load = createProblemCatalogLoader(
    "https://translations.test/",
    storage,
    fetcher,
  );
  const [first, duplicate] = await Promise.all([load(), load()]);
  assert.equal(calls, 1);
  assert.deepEqual(first, duplicate);
  remote = {
    ...catalog,
    revision: "c".repeat(64),
    entries: [{ ...entry, target: "새 제목" }],
  };
  assert.equal((await load()).catalog?.entries[0].target, "새 제목");
  remote = { ...catalog, entries: [] };
  assert.deepEqual((await load()).catalog?.entries, []);
  fail = true;
  const restarted = createProblemCatalogLoader(
    "https://translations.test/",
    storage,
    fetcher,
  );
  const fallback = await restarted();
  assert.equal(fallback.source, "cache");
  assert.deepEqual(fallback.catalog?.entries, []);
});

test("bad remote catalogs cannot replace valid cache and broken storage cannot block a fresh catalog", async () => {
  let saved: Record<string, unknown> = {};
  let response: unknown = catalog;
  const storage = {
    get: async () => saved,
    set: async (value: Record<string, unknown>) => {
      saved = value;
    },
  };
  const load = createProblemCatalogLoader(
    "https://translations.test/",
    storage,
    async () => Response.json(response),
  );
  await load();
  response = { schemaVersion: 9 };
  assert.deepEqual((await load()).catalog, catalog);
  const broken = {
    get: async () => {
      throw new Error("read failed");
    },
    set: async () => {
      throw new Error("write failed");
    },
  };
  assert.equal(
    (
      await createProblemCatalogLoader(
        "https://translations.test/",
        broken,
        async () => Response.json(catalog),
      )()
    ).source,
    "remote",
  );
  assert.equal(
    (
      await createProblemCatalogLoader(
        "https://translations.test/",
        broken,
        async () => {
          throw new Error("offline");
        },
      )()
    ).source,
    "bundled",
  );
});
