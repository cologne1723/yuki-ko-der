import { createHash } from "node:crypto";
import "fake-indexeddb/auto";
import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { IndexedDbStore, StorageLimitError } from "../src/storage.ts";
import { createZip } from "../src/export.ts";
import { unzipSync } from "fflate";
import { openDB } from "idb";
import type { PendingBatch, Session } from "../src/types.ts";
const hash = createHash("sha256").update("<p>日本語</p>").digest("hex");
const finding = createHash("sha256")
  .update("text\u0000日本語")
  .digest("hex")
  .slice(0, 32);
const session: Session = {
  sessionId: "s",
  startedAt: 1,
  collectorVersion: "test",
  dictionary: { hash: "h", scopes: [] },
  settings: {
    maxHtmlBytes: 5 * 1024 * 1024,
    maxTotalBytes: 100 * 1024 * 1024,
    includeEvents: true,
  },
  status: "recording",
  counts: {},
  captureFailures: [],
  totalBytes: 0,
};
function capture(id: string, at = 1): PendingBatch[] {
  const html = "<p>日本語</p>";
  return [
    {
      key: `s:d:${id}`,
      sessionId: "s",
      documentId: "d",
      sequence: at,
      createdAt: at,
      html: {
        hash,
        html,
        bytes: new TextEncoder().encode(html).byteLength,
      },
      finding: {
        findingId: finding,
        normalizedText: "日本語",
        kind: "text",
        firstSeenAt: at,
        lastSeenAt: at,
        occurrenceCount: 1,
      },
      occurrence: {
        occurrenceId: `o${id}`,
        findingId: finding,
        sessionId: "s",
        captureId: id,
        documentId: "d",
        exactText: "日本語",
        kind: "text",
        category: "interface",
        classificationRule: "test",
        dictionaryMessageIds: [],
        snapshotNodeLocator: "/html/body/p/text()[1]",
        precedingEventIds: [],
        temporalContext: "preceding-observations",
        at,
      },
      capture: {
        captureId: id,
        sessionId: "s",
        documentId: "d",
        url: "https://yukicoder.me/",
        title: "test",
        timestamp: at,
        reason: "manual",
        viewport: { width: 1, height: 1, devicePixelRatio: 1 },
        scroll: { x: 0, y: 0 },
        htmlHash: hash,
        htmlBytes: new TextEncoder().encode(html).byteLength,
        redaction: {
          removedElements: 0,
          removedAttributes: 0,
          redactedFields: 0,
          removedExternalLoads: 0,
        },
        findingIds: [finding],
        occurrenceIds: [`o${id}`],
      },
    },
  ];
}
async function storeFor(t: TestContext, max = session.settings.maxTotalBytes) {
  const store = new IndexedDbStore(`test-${crypto.randomUUID()}`);
  t.after(() => store.close());
  await store.createSession({
    ...session,
    settings: { ...session.settings, maxTotalBytes: max },
  });
  return store;
}
test("complete staging survives reopen and lost acknowledgement never duplicates accounting", async (t) => {
  const store = await storeFor(t);
  const batch = capture("a");
  await store.stageCapture("s", batch);
  assert.equal((await store.counts("s")).pending, 1);
  await store.close();
  await store.retryPending("s");
  const before = await store.getSession("s");
  await store.commitBatch("s", batch, 0);
  await store.retryPending("s");
  assert.deepEqual(await store.getSession("s"), before);
  assert.equal((await store.bundle("s")).captures.length, 1);
  assert.deepEqual(await store.counts("s"), {
    saved: 1,
    pending: 0,
    failed: 0,
  });
});
test("concurrent captures share finding and HTML without losing counters", async (t) => {
  const store = await storeFor(t);
  await Promise.all([
    store.commitBatch("s", capture("a", 1), 0),
    store.commitBatch("s", capture("b", 2), 0),
  ]);
  await store.updateSession({ ...session, status: "paused" });
  const bundle = await store.bundle("s");
  assert.equal(bundle.captures.length, 2);
  assert.equal(bundle.findings[0].occurrenceCount, 2);
  assert.equal(bundle.html.length, 1);
  assert.equal(bundle.session.counts.saved, 2);
});
test("transaction abort rolls back every record and rejects incomplete staging", async (t) => {
  const store = await storeFor(t, 1000);
  await assert.rejects(
    store.commitBatch("s", capture("a"), 0),
    StorageLimitError,
  );
  assert.equal((await store.bundle("s")).captures.length, 0);
  assert.equal((await store.counts("s")).saved, 0);
  const incomplete = capture("b");
  delete incomplete[0].html;
  await assert.rejects(store.stageCapture("s", incomplete), /HTML/);
  assert.equal((await store.counts("s")).pending, 0);
});
test("session metadata updates enforce storage limits without losing committed state", async (t) => {
  const store = await storeFor(t, 10_000);
  await store.commitBatch("s", capture("a"), 0);
  const before = (await store.getSession("s"))!;
  await assert.rejects(
    store.updateSession({
      ...before,
      status: "paused",
      captureFailures: [
        {
          at: 2,
          documentId: "d",
          reason: "storage-limit",
          detail: "x".repeat(10_000),
        },
      ],
    }),
    StorageLimitError,
  );
  assert.deepEqual(await store.getSession("s"), before);
  assert.equal((await store.bundle("s")).captures.length, 1);
  await store.updateSession({ ...before, status: "paused" });
  assert.equal((await store.getSession("s"))!.status, "paused");
});
test("populated exports retain complete references and historical finding counts at a committed cutoff", async (t) => {
  const store = await storeFor(t);
  await store.commitBatch("s", capture("a", 10), 0);
  const cutoff = (await store.bundle("s")).cutoff;
  await store.commitBatch("s", capture("b", 20), 0);
  const bundle = await store.bundle("s", cutoff);
  assert.equal(bundle.findings[0].occurrenceCount, 1);
  assert.equal(bundle.findings[0].lastSeenAt, 10);
  assert.deepEqual(
    bundle.occurrences.map((o) => o.captureId),
    ["a"],
  );
  const files = unzipSync(createZip(bundle));
  const reportPath = Object.keys(files).find((p) => p.endsWith("/report.md"))!;
  const root = reportPath.slice(0, -"report.md".length);
  const report = new TextDecoder().decode(files[reportPath]);
  for (const match of report.matchAll(/\]\(([^)]+)\)/gu))
    assert.ok(files[root + match[1]], match[1]);
  await store.deleteSession("s");
  assert.equal(await store.getSession("s"), undefined);
});

test("reused occurrence identities cannot corrupt an earlier committed export", async (t) => {
  const store = await storeFor(t);
  await store.commitBatch("s", capture("a"), 0);
  const second = capture("b", 2);
  second[0].occurrence!.occurrenceId = "oa";
  second[0].capture!.occurrenceIds = ["oa"];
  await assert.rejects(
    store.commitBatch("s", second, 0),
    /identity was reused/,
  );
  const bundle = await store.bundle("s");
  assert.deepEqual(
    bundle.captures.map((c) => c.captureId),
    ["a"],
  );
  assert.equal(bundle.occurrences[0].captureId, "a");
  assert.equal(bundle.findings[0].occurrenceCount, 1);
});

test("duplicate findings and forged snapshot bytes are rejected before staging", async (t) => {
  const store = await storeFor(t);
  const duplicate = capture("a");
  duplicate.push({
    ...duplicate[0],
    key: "duplicate",
    capture: undefined,
    occurrence: undefined,
    html: undefined,
  });
  await assert.rejects(store.stageCapture("s", duplicate), /Duplicate finding/);
  const forged = capture("b");
  forged[0].capture!.htmlBytes = 0;
  await assert.rejects(store.stageCapture("s", forged), /size does not match/);
  assert.deepEqual(await store.counts("s"), {
    saved: 0,
    pending: 0,
    failed: 0,
  });
});

test("pending records in another session consume the same logical budget", async (t) => {
  const store = await storeFor(t, 6000);
  await store.createSession({ ...session, sessionId: "other" });
  const other = capture("other");
  for (const batch of other) {
    batch.sessionId = "other";
    batch.key = "other:" + batch.key;
    if (batch.capture) batch.capture.sessionId = "other";
    if (batch.occurrence) batch.occurrence.sessionId = "other";
  }
  other[0].occurrence!.nearbyContext = "x".repeat(4000);
  await store.stageCapture("other", other);
  await assert.rejects(
    store.commitBatch("s", capture("a"), 0),
    StorageLimitError,
  );
  assert.equal((await store.counts("s")).saved, 0);
  assert.equal((await store.counts("other")).pending, 1);
  await store.deleteSession("other");
  await store.commitBatch("s", capture("a"), 0);
  assert.equal((await store.counts("s")).saved, 1);
});

test("legacy records survive upgrade without being reported as verified captures", async (t) => {
  const name = `legacy-${crypto.randomUUID()}`;
  const legacy = await openDB(name, 1, {
    upgrade(db) {
      for (const name of ["sessions", "captures", "pending"])
        db.createObjectStore(name, { keyPath: "key" });
    },
  });
  await legacy.put("sessions", { ...session, key: "s", counts: { saved: 1 } });
  await legacy.put("captures", {
    key: "legacy-capture",
    sessionId: "s",
    captureId: "legacy",
  });
  await legacy.put("pending", {
    key: "legacy-pending",
    sessionId: "s",
    occurrence: { occurrenceId: "incomplete" },
  });
  legacy.close();
  const store = new IndexedDbStore(name);
  t.after(() => store.close());
  await store.retryPending("s");
  const bundle = await store.bundle("s");
  assert.equal(bundle.session.legacyUnverifiedRecords, 2);
  assert.equal(bundle.captures.length, 0);
  assert.equal(bundle.session.counts.saved, 0);
  assert.equal((await store.counts("s")).saved, 0);
  const inspect = await openDB(name, 2);
  assert.ok(await inspect.get("captures", "legacy-capture"));
  assert.ok(await inspect.get("pending", "legacy-pending"));
  inspect.close();
});

test("storage-limit failure and pause fit reserved metadata space without evicting captures", async (t) => {
  const store = await storeFor(t, 5000);
  let limited = false;
  for (let i = 0; i < 20; i++) {
    try {
      await store.commitBatch("s", capture(`limit-${i}`, i + 1), 0);
    } catch (error) {
      assert.ok(error instanceof StorageLimitError);
      limited = true;
      break;
    }
  }
  assert.equal(limited, true);
  const before = (await store.getSession("s"))!;
  await store.updateSession({
    ...before,
    status: "paused",
    captureFailures: [
      {
        at: 30,
        documentId: "d",
        reason: "storage-limit",
        detail: "Capacity exhausted",
      },
    ],
  });
  const bundle = await store.bundle("s");
  assert.equal(bundle.session.status, "paused");
  assert.equal(bundle.session.counts.failed, 1);
  assert.equal(bundle.captures.length, before.counts.saved);
  assert.ok(!("_failureReserve" in bundle.session));
});

test("dictionary rotation is atomic, waits for pending captures and returns one successor across retries", async () => {
  const store = new IndexedDbStore(`rotation-${crypto.randomUUID()}`);
  try {
    await store.createSession({ ...session, status: "paused" });
    await store.stageCapture("s", capture("rotation-pending"));
    const successor = {
      ...session,
      sessionId: "successor",
      startedAt: 10,
      dictionary: { hash: "new", scopes: [] },
      collectorVersion: "2.3.4",
    };
    await assert.rejects(
      store.rotateSession("s", successor),
      /pending captures/,
    );
    assert.equal((await store.getSession("s"))?.successorSessionId, undefined);
    await store.retryPending("s");
    const [first, duplicate] = await Promise.all([
      store.rotateSession("s", successor),
      store.rotateSession("s", { ...successor, sessionId: "retry-candidate" }),
    ]);
    assert.equal(first.sessionId, duplicate.sessionId);
    const old = await store.getSession("s");
    assert.equal(old?.status, "complete");
    assert.equal(old?.successorSessionId, first.sessionId);
    assert.equal(first.predecessorSessionId, "s");
    assert.equal(first.collectorVersion, "2.3.4");
    await store.updateSession({ ...old!, status: "recording" });
    assert.equal((await store.getSession("s"))?.status, "complete");
    assert.equal((await store.bundle("s")).captures.length, 1);
    assert.equal((await store.bundle(first.sessionId)).captures.length, 0);
    await store.close();
    assert.equal(
      (
        await store.rotateSession("s", {
          ...successor,
          sessionId: "after-restart",
        })
      ).sessionId,
      first.sessionId,
    );
  } finally {
    await store.close();
  }
});

test("validated wire requests replay captures committed before schema parsing without changing hashes", async (t) => {
  const { parseStorageRequest } = await import("../src/storage-contracts.ts");
  const store = await storeFor(t);
  const batches = capture("replay");
  await store.commitBatch("s", batches, 0);
  const request = parseStorageRequest({
    operation: "commitBatch",
    args: ["s", batches, 0],
  });
  assert.equal(request.operation, "commitBatch");
  if (request.operation !== "commitBatch")
    throw new Error("Unexpected operation");
  assert.equal(JSON.stringify(request.args[1]), JSON.stringify(batches));
  await store.commitBatch(...request.args);
  assert.equal((await store.bundle("s")).captures.length, 1);
});
