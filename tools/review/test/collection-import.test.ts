import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import {
  mkdtemp,
  readFile,
  readdir,
  rm,
  mkdir,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { zipSync, unzipSync, strToU8, strFromU8 } from "fflate";
import { createZip } from "../../ui-collector/src/export.ts";
import {
  readCollectionArchive,
  archiveHash,
  MAX_ARCHIVE_BYTES,
  MAX_EXPANDED_BYTES,
} from "../src/collection-archive.ts";
import { CollectionReviewStore } from "../src/collection-review.ts";
import { createReviewApp } from "../src/review-server.ts";

import { fixture } from "./collection-fixture.ts";

function modified(
  change: (files: Record<string, Uint8Array>, root: string) => void,
) {
  const files = unzipSync(createZip(fixture()));
  const root = Object.keys(files)[0].split("/")[0] + "/";
  change(files, root);
  return zipSync(files);
}
function mutateJson(
  files: Record<string, Uint8Array>,
  path: string,
  change: (value: any) => void,
) {
  const value = JSON.parse(strFromU8(files[path]));
  change(value);
  files[path] = strToU8(JSON.stringify(value));
}
async function temporary(t: TestContext) {
  const root = await mkdtemp(join(tmpdir(), "collection-review-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}

test("current exports import atomically, survive restart, deduplicate, and remain separate across cutoffs", async (t) => {
  const root = await temporary(t),
    data = join(root, "custom-data"),
    store = new CollectionReviewStore(root, data);
  assert.deepEqual(await store.list(), []);
  const zip = createZip(fixture());
  const [first, repeated] = await Promise.all([
    store.import(zip),
    store.import(zip),
  ]);
  assert.equal(first.duplicate, false);
  assert.equal(repeated.duplicate, true);
  assert.deepEqual(
    await readFile(join(data, "collections", first.id, "archive.zip")),
    Buffer.from(zip),
  );
  const restarted = new CollectionReviewStore(root, data);
  const detail = await restarted.get(first.id);
  assert.equal(detail.occurrences[0].exactText, "日本語");
  assert.equal(detail.captures.length, 1);
  assert.deepEqual(detail.manifest.counts, {
    findings: 1,
    occurrences: 1,
    events: 1,
    captures: 1,
    html: 1,
  });
  const other = fixture();
  other.cutoff = 2;
  const second = await restarted.import(createZip(other));
  assert.notEqual(first.id, second.id);
  assert.equal((await store.list()).length, 2);
  await restarted.delete(first.id);
  assert.equal((await store.list()).length, 1);
  await assert.rejects(store.get(first.id), /not found/u);
  await assert.rejects(
    store.snapshot("../outside", "a".repeat(64)),
    /identity/u,
  );
  assert.equal((await store.get(second.id)).id, second.id);
});

test("invalid archives and incomplete references leave no published import", async (t) => {
  const root = await temporary(t),
    store = new CollectionReviewStore(root);
  const cases: Array<[string, Uint8Array]> = [
    ["not ZIP", new Uint8Array([1, 2, 3])],
    [
      "schema",
      modified((f, r) =>
        mutateJson(f, r + "manifest.json", (m) => (m.schemaVersion = 2)),
      ),
    ],
    [
      "count",
      modified((f, r) =>
        mutateJson(f, r + "manifest.json", (m) => (m.counts.captures = 2)),
      ),
    ],
    ["missing file", modified((f, r) => delete f[r + "events.jsonl"])],
    [
      "shape",
      modified((f, r) => (f[r + "findings.jsonl"] = strToU8("null\n"))),
    ],
    [
      "missing capture",
      modified((f, r) => delete f[r + "captures/capture-test.json"]),
    ],
    [
      "unknown finding",
      modified((f, r) =>
        mutateJson(
          f,
          r + "occurrences.jsonl",
          (o) => (o.findingId = "unknown"),
        ),
      ),
    ],
    [
      "foreign event",
      modified((f, r) =>
        mutateJson(f, r + "events.jsonl", (e) => (e.documentId = "foreign")),
      ),
    ],
    [
      "hash",
      modified((f, r) => {
        const name = Object.keys(f).find((n) => n.startsWith(r + "html/"))!;
        f[name] = strToU8("tampered");
      }),
    ],
    [
      "duplicate ID",
      modified(
        (f, r) =>
          (f[r + "occurrences.jsonl"] = strToU8(
            strFromU8(f[r + "occurrences.jsonl"]).repeat(2),
          )),
      ),
    ],
    ["traversal", modified((f) => (f["../outside"] = strToU8("bad")))],
    ["absolute", modified((f) => (f["/outside"] = strToU8("bad")))],
    ["snapshot limit", createZip(fixture("x".repeat(5 * 1024 * 1024 + 1)))],
  ];
  for (const [name, zip] of cases)
    await assert.rejects(store.import(zip), /./u, name);
  assert.deepEqual(await store.list(), []);
});

test("ZIP metadata, encryption, duplicate paths, CRC and expanded limits are checked", async () => {
  const original = createZip(fixture());
  const change = (
    fn: (bytes: Uint8Array, view: DataView, central: number) => void,
  ) => {
    const bytes = original.slice(),
      view = new DataView(bytes.buffer);
    let central = 0;
    while (view.getUint32(central, true) !== 0x02014b50) central++;
    fn(bytes, view, central);
    return bytes;
  };
  await assert.rejects(
    readCollectionArchive(
      change((_b, v, c) => {
        v.setUint16(c + 8, v.getUint16(c + 8, true) | 1, true);
        v.setUint16(6, v.getUint16(6, true) | 1, true);
      }),
    ),
    /encrypted/u,
  );
  await assert.rejects(
    readCollectionArchive(change((_b, v, c) => v.setUint32(c + 16, 0, true))),
    /Corrupt/u,
  );
  await assert.rejects(
    readCollectionArchive(
      change((_b, v, c) => v.setUint32(c + 24, MAX_EXPANDED_BYTES + 1, true)),
    ),
    /limit/u,
  );
  await assert.rejects(readCollectionArchive(original.subarray(0, -4)), /ZIP/u);
  // Two same-length filenames made identical in both directories.
  const duplicate = zipSync({ "a.txt": strToU8("a"), "b.txt": strToU8("b") });
  for (let i = 0; i < duplicate.length - 5; i++)
    if (strFromU8(duplicate.subarray(i, i + 5)) === "b.txt")
      duplicate.set(strToU8("a.txt"), i);
  await assert.rejects(readCollectionArchive(duplicate), /duplicate/u);
});

test("failed publication cleans staging and permits a later retry", async (t) => {
  const root = await temporary(t),
    store = new CollectionReviewStore(root),
    zip = createZip(fixture()),
    id = archiveHash(zip);
  // A conflicting non-empty destination makes the final atomic rename fail.
  await mkdir(join(root, "data/collections", id), { recursive: true });
  await writeFile(
    join(root, "data/collections", id, "obstruction"),
    "preserve",
  );
  await assert.rejects(store.import(zip));
  assert.deepEqual(await store.list(), []);
  assert.deepEqual(await readdir(join(root, "data/collections")), [id]);
  await rm(join(root, "data/collections", id), { recursive: true });
  assert.equal((await store.import(zip)).duplicate, false);
});

test("HTTP imports retain request guards and serve only isolated, sanitized snapshots", async (t) => {
  const root = await temporary(t),
    app = createReviewApp({ repositoryRoot: root, assetRoot: root });
  const headers = {
    host: "127.0.0.1",
    origin: "http://127.0.0.1",
    "content-type": "application/zip",
  };
  const bundle = fixture(
    '<html><head><meta http-equiv="refresh" content="0;url=https://example.org"><style>body{background:url(https://example.org/a)}</style></head><body onload="alert(1)"><script>alert(1)</script><iframe src="https://example.org"></iframe><img src="https://example.org/a" srcset="https://example.org/b 2x"><a href="https://example.org">link</a><form action="https://example.org"><button>日本語</button></form></body></html>',
  );
  const zip = createZip(bundle);
  const request = (path: string, init: RequestInit = {}) =>
    app.request("http://127.0.0.1" + path, {
      ...init,
      headers: { ...headers, ...init.headers },
    });
  assert.equal(
    (
      await request("/api/collections", {
        method: "POST",
        body: new Uint8Array(zip),
        headers: { origin: "https://foreign.example" },
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await request("/api/collections", {
        method: "POST",
        body: new Uint8Array(zip),
        headers: { "content-type": "text/plain" },
      })
    ).status,
    415,
  );
  assert.equal(
    (
      await request("/api/collections", {
        method: "POST",
        body: new Uint8Array(0),
        headers: { "content-length": String(MAX_ARCHIVE_BYTES + 1) },
      })
    ).status,
    413,
  );
  assert.equal(
    (
      await request("/api/problems/1", {
        method: "PUT",
        body: new Uint8Array(0),
        headers: { "content-length": String(8 * 1024 * 1024 + 1) },
      })
    ).status,
    413,
  );
  const uploaded = await request("/api/collections", {
    method: "POST",
    body: new Uint8Array(zip),
  });
  assert.equal(uploaded.status, 201);
  const { id } = await uploaded.json();
  assert.equal(
    (
      await request("/api/collections", {
        method: "POST",
        body: new Uint8Array(zip),
      })
    ).status,
    200,
  );
  await mkdir(join(root, "translations/ko"), { recursive: true });
  await writeFile(
    join(root, "translations/ko.messages.json"),
    JSON.stringify({ messages: [] }),
  );
  await writeFile(
    join(root, "translations/ko/main.json"),
    JSON.stringify({ translations: [] }),
  );
  const draftPath = `/api/collections/${id}/observations/occurrence-test/draft`;
  const optionsResponse = await request(draftPath);
  assert.equal(optionsResponse.status, 200);
  const options = await optionsResponse.json();
  assert.equal(options.source, "日本語");
  const saved = await request(draftPath, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      file: "main.json",
      revision: options.files[0].revision,
      selector: "button",
      reviewStatus: "approved" as const,
      target: "일본어",
      source: "forged source",
    }),
  });
  assert.equal(saved.status, 201);
  const draft = await saved.json();
  assert.equal(draft.target, "일본어");
  const catalog = JSON.parse(
    await readFile(join(root, "translations/ko.messages.json"), "utf8"),
  );
  assert.equal(catalog.messages[0].source, "日本語");
  assert.equal((await request(draftPath)).status, 200);
  const snapshot = await request(
    `/api/collections/${id}/snapshots/${bundle.html[0].hash}`,
  );
  assert.equal(snapshot.status, 200);
  assert.match(
    snapshot.headers.get("content-security-policy")!,
    /default-src 'none'/u,
  );
  assert.match(snapshot.headers.get("content-security-policy")!, /sandbox/u);
  assert.equal(snapshot.headers.get("referrer-policy"), "no-referrer");
  const html = await snapshot.text();
  assert.doesNotMatch(
    html,
    /<script|<iframe|http-equiv|onload=|src=|srcset=|href=|action=/u,
  );
  assert.match(html, /日本語/u);
  assert.equal(
    (await request(`/api/collections/${id}/archive.zip`)).status,
    404,
  );
  assert.equal(
    (await request(`/api/collections/${id}`, { method: "DELETE" })).status,
    200,
  );
  assert.equal((await request(`/api/collections/${id}`)).status, 404);
});
