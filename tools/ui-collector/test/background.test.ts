import assert from "node:assert/strict";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { build } from "esbuild";
import { fileURLToPath } from "node:url";
import * as fake from "fake-indexeddb";

test("background owns persistence and rejects cross-tab, foreign-frame and report-only requests", async () => {
  const bundle = await build({
    entryPoints: [
      fileURLToPath(new URL("../src/background.ts", import.meta.url)),
    ],
    bundle: true,
    write: false,
    format: "iife",
  });
  let listener: (
    message: unknown,
    sender: unknown,
    reply: (value: any) => void,
  ) => boolean;
  let saved: Record<string, unknown> = {};
  let restoreGate: Promise<void> = Promise.resolve();
  let updated: (
    tabId: number,
    change: { status: string },
    tab: { url: string },
  ) => Promise<void>;
  const navigationMessages: Array<{
    tabId: number;
    message: { type: string; sessionId?: string };
  }> = [];
  const chrome = {
    runtime: {
      id: "collector",
      getURL: (path: string) => `chrome-extension://collector/${path}`,
      onMessage: {
        addListener: (fn: typeof listener) => {
          listener = fn;
        },
      },
    },
    storage: {
      local: {
        get: async () => {
          await restoreGate;
          return structuredClone(saved);
        },
        set: async (value: Record<string, unknown>) => {
          saved = structuredClone(value);
        },
      },
    },
    tabs: {
      onUpdated: {
        addListener: (fn: typeof updated) => {
          updated = fn;
        },
      },
      sendMessage: async (
        tabId: number,
        message: { type: string; sessionId?: string },
      ) => {
        navigationMessages.push({ tabId, message });
        return { ok: true, recording: true };
      },
    },
  };
  const environment = {
    ...fake,
    indexedDB: new fake.IDBFactory(),
    chrome,
    crypto,
    URL,
    TextEncoder,
    structuredClone,
    DOMException,
  };
  runInNewContext(bundle.outputFiles[0].text, environment);
  const sender = (tab: number, url = "https://yukicoder.me/") => ({
    id: "collector",
    tab: { id: tab, url: "https://yukicoder.me/" },
    url,
  });
  const call = (operation: string, args: unknown[], from: unknown) =>
    new Promise<any>((resolve) =>
      listener({ type: "storage:request", operation, args }, from, resolve),
    );
  const session = {
    sessionId: "session-a",
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
  assert.equal(
    (
      await call(
        "createSession",
        [{ ...session, sessionId: "bad:id" }],
        sender(1),
      )
    ).ok,
    false,
  );
  assert.equal(
    (await call("createSession", [{ sessionId: session.sessionId }], sender(1)))
      .ok,
    false,
  );
  assert.equal(
    (await call("commitBatch", [session.sessionId, "invalid", 0], sender(1)))
      .ok,
    false,
  );
  assert.equal((await call("createSession", [session], sender(1))).ok, true);
  assert.equal(
    (await call("getSession", [session.sessionId], sender(1))).value.sessionId,
    session.sessionId,
  );
  assert.equal(
    (await call("getSession", [session.sessionId], sender(2))).ok,
    false,
  );
  assert.equal((await call("createSession", [session], sender(2))).ok, false);
  assert.equal(
    (
      await call(
        "updateSession",
        [session],
        sender(1, "https://external.test/frame"),
      )
    ).ok,
    false,
  );
  assert.equal(
    (await call("deleteSession", [session.sessionId], sender(1))).ok,
    false,
  );
  const report = {
    id: "collector",
    url: "chrome-extension://collector/report.html",
  };
  assert.equal((await call("listSessions", [], report)).ok, true);
  assert.equal((await call("bundle", [session.sessionId], report)).ok, false);
  assert.equal(
    (await call("listSessions", [], { ...report, id: "other" })).ok,
    false,
  );
  // Recreate the worker's module state while preserving only its actual durable
  // IndexedDB and storage.local state. Hold restoration to exercise startup races.
  saved = { ...saved, recordingTabs: [1] };
  let release!: () => void;
  restoreGate = new Promise<void>((resolve) => {
    release = resolve;
  });
  runInNewContext(bundle.outputFiles[0].text, { ...environment });
  const recovered = call("getSession", [session.sessionId], sender(1));
  const navigation = updated!(
    1,
    { status: "complete" },
    { url: "https://yukicoder.me/problems/no/1" },
  );
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(navigationMessages.length, 0);
  release();
  assert.equal((await recovered).value.sessionId, session.sessionId);
  await navigation;
  assert.equal(navigationMessages.length, 1);
  assert.equal(navigationMessages[0].message.sessionId, session.sessionId);
  assert.equal(navigationMessages[0].message.type, "collector:start");
  await updated!(1, { status: "loading" }, { url: "https://external.test/" });
  await updated!(1, { status: "complete" }, { url: "https://yukicoder.me/" });
  assert.equal(navigationMessages.length, 1);
});

test("popup messages pin the active tab, reject missing receivers and retry failed recording-state persistence", async () => {
  const bundle = await build({
    entryPoints: [
      fileURLToPath(new URL("../src/background.ts", import.meta.url)),
    ],
    bundle: true,
    write: false,
    format: "iife",
  });
  let listener!: (
    message: unknown,
    sender: unknown,
    reply: (value: any) => void,
  ) => void;
  let active = 7,
    recording = false,
    fail = false,
    missing = false;
  let saved: any = {};
  const chrome = {
    runtime: {
      id: "collector",
      getURL: (p: string) => `chrome-extension://collector/${p}`,
      onMessage: {
        addListener: (fn: typeof listener) => {
          listener = fn;
        },
      },
    },
    storage: {
      local: {
        get: async () => saved,
        set: async (value: any) => {
          if (fail) throw new Error("State write failed");
          saved = structuredClone(value);
        },
      },
    },
    tabs: {
      query: async () => [{ id: active, url: "https://yukicoder.me/" }],
      sendMessage: async (_tab: number, message: { type: string }) => {
        if (missing) return undefined;
        if (message.type === "collector:start") recording = true;
        if (message.type === "collector:pause") {
          recording = false;
          return {
            ok: false,
            recording: false,
            error: "Pause metadata failed",
          };
        }
        return { ok: true, recording };
      },
    },
  };
  runInNewContext(bundle.outputFiles[0].text, {
    ...fake,
    indexedDB: new fake.IDBFactory(),
    chrome,
    crypto,
    URL,
    TextEncoder,
    structuredClone,
    DOMException,
  });
  const request = (type: string, tabId = 7) =>
    new Promise<any>((resolve) =>
      listener({ type, tabId }, { id: "collector" }, resolve),
    );
  active = 8;
  assert.match((await request("popup:start")).error, /tab changed/);
  assert.equal(recording, false);
  active = 7;
  missing = true;
  assert.equal((await request("popup:status")).ok, false);
  missing = false;
  fail = true;
  assert.match((await request("popup:start")).error, /State write failed/);
  assert.equal(recording, true);
  fail = false;
  assert.equal((await request("popup:status")).recording, true);
  assert.deepEqual(saved.recordingTabs, [7]);
  assert.match((await request("popup:pause")).error, /Pause metadata failed/);
  assert.deepEqual(saved.recordingTabs, []);
  assert.equal((await request("popup:status")).recording, false);
});

test("dictionary rotation recovers one authenticated successor after ownership write failure and background restart", async () => {
  const bundle = await build({
    entryPoints: [
      fileURLToPath(new URL("../src/background.ts", import.meta.url)),
    ],
    bundle: true,
    write: false,
    format: "iife",
    define: { __UI_COLLECTOR_VERSION__: '"9.8.7"' },
  });
  let listener!: (
    message: unknown,
    sender: unknown,
    reply: (value: any) => void,
  ) => void;
  let saved: any = {},
    writes = 0,
    failAt = -1;
  let updated!: (tab: number, change: any, value: any) => Promise<void>;
  const sent: any[] = [];
  const chrome = {
    runtime: {
      id: "collector",
      getURL: (p: string) => `chrome-extension://collector/${p}`,
      onMessage: {
        addListener: (fn: typeof listener) => {
          listener = fn;
        },
      },
    },
    storage: {
      local: {
        get: async () => structuredClone(saved),
        set: async (value: any) => {
          if (++writes === failAt) throw new Error("ownership unavailable");
          saved = structuredClone(value);
        },
      },
    },
    tabs: {
      onUpdated: {
        addListener: (fn: typeof updated) => {
          updated = fn;
        },
      },
      query: async () => [{ id: 1, url: "https://yukicoder.me/" }],
      sendMessage: async (_tab: number, message: any) => {
        sent.push(message);
        return { ok: true, recording: true, sessionId: message.sessionId };
      },
    },
  };
  const environment = {
    ...fake,
    indexedDB: new fake.IDBFactory(),
    chrome,
    crypto,
    URL,
    TextEncoder,
    structuredClone,
    DOMException,
  };
  const sender = (id = 1) => ({
    id: "collector",
    tab: { id, url: "https://yukicoder.me/" },
    url: "https://yukicoder.me/",
  });
  const call = (operation: string, args: unknown[], from = sender()) =>
    new Promise<any>((resolve) =>
      listener({ type: "storage:request", operation, args }, from, resolve),
    );
  runInNewContext(bundle.outputFiles[0].text, environment);
  const original = {
    sessionId: "before",
    startedAt: 1,
    collectorVersion: "old",
    dictionary: { hash: "old-dictionary", scopes: [] },
    settings: {
      maxHtmlBytes: 5000000,
      maxTotalBytes: 100000000,
      includeEvents: true,
    },
    status: "paused",
    counts: {},
    captureFailures: [],
    totalBytes: 0,
  };
  assert.equal((await call("createSession", [original])).ok, true);
  assert.equal(
    (
      await call(
        "rotateSession",
        ["before", { ...original, sessionId: "unauthorized" }],
        sender(2),
      )
    ).ok,
    false,
  );
  failAt = writes + 2; // Paused ownership persists; the atomic IDB rotation then wins before its acknowledgment fails.
  const lost = await call("rotateSession", [
    "before",
    { ...original, sessionId: "after", startedAt: 2 },
  ]);
  assert.equal(lost.ok, false);
  assert.match(lost.error, /ownership unavailable/);
  failAt = -1;
  runInNewContext(bundle.outputFiles[0].text, { ...environment });
  const retry = await call("rotateSession", [
    "before",
    { ...original, sessionId: "duplicate", startedAt: 3 },
  ]);
  assert.equal(retry.ok, true, retry.error);
  assert.equal(retry.value.sessionId, "after");
  assert.equal(retry.value.collectorVersion, "9.8.7");
  assert.notEqual(retry.value.dictionary.hash, "old-dictionary");
  assert.equal(retry.value.predecessorSessionId, "before");
  assert.equal(saved.sessionsByTab[1], "after");
  assert.equal(
    (await call("getSession", ["before"])).value.successorSessionId,
    "after",
  );
  assert.equal((await call("getSession", ["after"], sender(2))).ok, false);
  const popup = await new Promise<any>((resolve) =>
    listener({ type: "popup:start", tabId: 1 }, { id: "collector" }, resolve),
  );
  assert.equal(popup.ok, true);
  await updated(
    1,
    { status: "complete" },
    { url: "https://yukicoder.me/problems/no/1" },
  );
  assert.equal(sent.at(-1).sessionId, "after");
  assert.equal(sent.at(-1).type, "collector:start");
});
