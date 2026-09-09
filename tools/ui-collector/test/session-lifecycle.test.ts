import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";
import { JSDOM } from "jsdom";
import * as fake from "fake-indexeddb";
import { receiveBundle, type BundlePort } from "../src/bundle-channel.ts";
import { portPair } from "./port-fixture.ts";

for (const rotate of [false, true]) {
  test(`deleting a ${rotate ? "rotating" : "new"} session permits recording again`, async () => {
    const [background, content] = await Promise.all(
      ["background", "content"].map((name) =>
        build({
          entryPoints: [
            fileURLToPath(new URL(`../src/${name}.ts`, import.meta.url)),
          ],
          bundle: true,
          write: false,
          format: "iife",
        }),
      ),
    );
    type Listener = (
      message: any,
      sender: any,
      reply: (value: any) => void,
    ) => void;
    let backgroundListener!: Listener;
    let contentListener!: Listener;
    let connection!: (port: BundlePort) => void;
    const tab = { id: 1, url: "https://yukicoder.me/" };
    const report = {
      id: "collector",
      url: "chrome-extension://collector/report.html",
    };
    const sender = { id: "collector", tab, url: tab.url };
    const wire = (value: any) =>
      value === undefined ? undefined : JSON.parse(JSON.stringify(value));
    const dispatch = (listener: Listener, message: any, from: any) =>
      new Promise<any>((resolve) =>
        listener(wire(message), from, (value) => resolve(wire(value))),
      );
    const runtime = {
      id: "collector",
      getURL: (path: string) => `chrome-extension://collector/${path}`,
      onMessage: {
        addListener: (listener: Listener) => {
          backgroundListener = listener;
        },
      },
      onConnect: {
        addListener: (listener: typeof connection) => {
          connection = listener;
        },
      },
      connect: () => {
        const pair = portPair();
        pair.server.sender = report;
        connection(pair.server);
        return pair.client;
      },
    };
    const chrome = {
      runtime,
      storage: {
        local: {
          get: async () =>
            rotate
              ? { sessionsByTab: { 1: "old-session" }, recordingTabs: [] }
              : {},
          set: async () => {},
        },
      },
      tabs: {
        query: async () => [tab],
        sendMessage: (_tab: number, message: any) =>
          dispatch(contentListener, message, report),
        onUpdated: { addListener: () => {} },
        onRemoved: { addListener: () => {} },
      },
    };
    const entered = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    const discarded = Promise.withResolvers<void>();
    let hold = true;
    chrome.storage.local.set = async () => {
      if (!hold) return;
      hold = false;
      entered.resolve();
      await release.promise;
    };
    const send = chrome.tabs.sendMessage;
    chrome.tabs.sendMessage = (tabId, message) => {
      if (message.type === "collector:discard-session") discarded.resolve();
      return send(tabId, message);
    };
    runInNewContext(background.outputFiles[0].text, {
      ...fake,
      indexedDB: new fake.IDBFactory(),
      chrome,
      crypto,
      URL,
      TextEncoder,
      structuredClone,
      DOMException,
    });
    const dom = new JSDOM("<button>日本語</button>", {
      url: tab.url,
      runScripts: "outside-only",
    });
    Object.defineProperty(dom.window, "crypto", { value: crypto });
    Object.assign(dom.window, {
      TextEncoder,
      chrome: {
        runtime: {
          ...runtime,
          onMessage: {
            addListener: (listener: Listener) => {
              contentListener = listener;
            },
          },
          sendMessage: (message: any) =>
            dispatch(backgroundListener, message, sender),
        },
      },
    });
    dom.window.eval(content.outputFiles[0].text);
    const popup = (type: string) =>
      dispatch(backgroundListener, { type }, report);
    try {
      if (rotate) {
        const seeded = await dispatch(
          backgroundListener,
          {
            type: "storage:request",
            operation: "createSession",
            args: [
              {
                sessionId: "old-session",
                startedAt: 1,
                collectorVersion: "old",
                dictionary: { hash: "old-dictionary", scopes: [] },
                settings: {
                  maxHtmlBytes: 5 * 1024 * 1024,
                  maxTotalBytes: 100 * 1024 * 1024,
                  includeEvents: true,
                },
                status: "paused",
                counts: { saved: 0, pending: 0, failed: 0 },
                captureFailures: [],
                totalBytes: 0,
              },
            ],
          },
          report,
        );
        assert.equal(seeded.ok, true);
      }
      const pending = popup("popup:start");
      await entered.promise;
      const listed = await dispatch(
        backgroundListener,
        {
          type: "storage:request",
          operation: "listSessions",
          args: [],
        },
        report,
      );
      const pendingId = listed.value[0].sessionId;
      const deletion = dispatch(
        backgroundListener,
        {
          type: "storage:request",
          operation: "deleteSession",
          args: [pendingId],
        },
        report,
      );
      await discarded.promise;
      release.resolve();
      assert.equal((await deletion).ok, true);
      const stopped = await pending;
      assert.equal(stopped.recording, false);
      assert.equal((await popup("popup:status")).recording, false);
      await assert.rejects(
        receiveBundle(runtime, pendingId),
        /Unknown collection session/,
      );
      const first = await popup("popup:start");
      assert.equal(first.recording, true);
      if (rotate) assert.equal(first.sessionId, stopped.sessionId);
      assert.equal(
        (await receiveBundle(runtime, first.sessionId)).captures.length,
        1,
      );
      const deleted = await dispatch(
        backgroundListener,
        {
          type: "storage:request",
          operation: "deleteSession",
          args: [first.sessionId],
        },
        report,
      );
      assert.equal(deleted.ok, true);
      assert.equal((await popup("popup:status")).recording, false);
      await assert.rejects(
        receiveBundle(runtime, first.sessionId),
        /Unknown collection session/,
      );
      const second = await popup("popup:start");
      assert.equal(second.recording, true);
      assert.notEqual(second.sessionId, first.sessionId);
      assert.equal(
        (await receiveBundle(runtime, second.sessionId)).captures.length,
        1,
      );
      await popup("popup:pause");
      assert.equal((await popup("popup:status")).recording, false);
    } finally {
      release.resolve();
      dom.window.close();
    }
  });
}
