import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import "fake-indexeddb/auto";
import { IndexedDbStore } from "../src/storage.ts";
import { RemoteStore } from "../src/remote-store.ts";
import {
  BUNDLE_CHUNK_LENGTH,
  receiveBundle,
  serveBundle,
} from "../src/bundle-channel.ts";
import { portPair } from "./port-fixture.ts";
import type { PendingBatch, Session } from "../src/types.ts";

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
function capture(index: number, padding = ""): PendingBatch[] {
  const html = `<p>${index} 日本語 🙂 ${padding}</p>`;
  const bytes = new TextEncoder().encode(html).length;
  const hash = createHash("sha256").update(html).digest("hex");
  return [
    {
      key: `s:d:${index}`,
      sessionId: "s",
      documentId: "d",
      sequence: index,
      createdAt: index,
      html: { html, bytes, hash },
      capture: {
        captureId: `c${index}`,
        sessionId: "s",
        documentId: "d",
        url: "https://yukicoder.me/",
        title: "test",
        timestamp: index,
        reason: "manual",
        viewport: { width: 1, height: 1, devicePixelRatio: 1 },
        scroll: { x: 0, y: 0 },
        htmlHash: hash,
        htmlBytes: bytes,
        redaction: {
          removedElements: 0,
          removedAttributes: 0,
          redactedFields: 0,
          removedExternalLoads: 0,
        },
        findingIds: [],
        occurrenceIds: [],
      },
    },
  ];
}

test("Chrome transport preserves default/explicit cutoffs and transfers collections above 64 MiB", async (t) => {
  const store = new IndexedDbStore(`transport-${crypto.randomUUID()}`);
  t.after(() => store.close());
  await store.createSession(session);
  await store.commitBatch("s", capture(0), 0);
  let maxMessage = 0;
  let reads = 0;
  let afterRead: (() => Promise<void>) | undefined;
  const runtime = {
    connect: () => {
      const pair = portPair((_message, bytes) => {
        maxMessage = Math.max(maxMessage, bytes);
      });
      pair.server.sender = {
        id: "collector",
        url: "chrome-extension://collector/report.html",
      };
      serveBundle(pair.server, {
        extensionId: "collector",
        extensionUrl: "chrome-extension://collector/",
        ready: Promise.resolve(),
        read: async (id, cutoff) => {
          reads++;
          const bundle = await store.bundle(id, cutoff);
          await afterRead?.();
          return bundle;
        },
      });
      return pair.client;
    },
  };
  const beforeChrome = globalThis.chrome;
  const beforeBrowser = globalThis.browser;
  globalThis.chrome = { runtime } as unknown as typeof chrome;
  globalThis.browser = undefined;
  t.after(() => {
    globalThis.chrome = beforeChrome;
    globalThis.browser = beforeBrowser;
  });
  const remote = new RemoteStore();
  const first = await remote.bundle("s");
  assert.equal(first.captures.length, 1);
  assert.equal((await remote.bundle("s", 0)).captures.length, 0);
  await assert.rejects(
    receiveBundle(runtime, "s", null as unknown as number),
    /Invalid bundle request/,
  );
  const padding = "x".repeat(4 * 1024 * 1024);
  for (let index = 1; index <= 17; index++) {
    const batches = capture(index, padding);
    await store.stageCapture("s", batches);
    await store.commitBatch("s", batches, 0);
  }
  const before = reads;
  afterRead = async () => {
    afterRead = undefined;
    await store.commitBatch("s", capture(18), 0);
  };
  const bundle = await remote.bundle("s");
  assert.equal(
    reads,
    before + 1,
    "one consistent storage snapshot per transfer",
  );
  assert.ok(Buffer.byteLength(JSON.stringify(bundle)) > 64 * 1024 * 1024);
  assert.ok(maxMessage < BUNDLE_CHUNK_LENGTH * 6 + 1024);
  assert.equal(bundle.captures.length, 18);
  assert.equal(
    (await store.counts("s")).saved,
    19,
    "a later commit does not leak into the transferred snapshot",
  );
  for (const snapshot of bundle.html)
    assert.equal(
      createHash("sha256").update(snapshot.html).digest("hex"),
      snapshot.hash,
    );
  assert.deepEqual(
    (await remote.bundle("s", first.cutoff)).captures.map(
      (row) => row.captureId,
    ),
    ["c0"],
  );
});

test("bundle ports reject foreign/content senders and interrupted transfers", async () => {
  for (const sender of [
    { id: "other", url: "chrome-extension://collector/report.html" },
    { id: "collector", url: "https://yukicoder.me/" },
  ]) {
    const pair = portPair();
    pair.server.sender = sender;
    serveBundle(pair.server, {
      extensionId: "collector",
      extensionUrl: "chrome-extension://collector/",
      ready: Promise.resolve(),
      read: async () => {
        throw new Error("Must not read storage");
      },
    });
    await assert.rejects(
      receiveBundle({ connect: () => pair.client }, "s"),
      /extension page/,
    );
  }
  const pair = portPair();
  const pending = receiveBundle({ connect: () => pair.client }, "s");
  pair.server.disconnect();
  await assert.rejects(pending, /disconnected/);
});
