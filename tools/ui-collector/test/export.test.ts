import assert from "node:assert/strict";
import test from "node:test";
import { unzipSync, strFromU8 } from "fflate";
import { createZip } from "../src/export.ts";
import type { ExportBundle } from "../src/types.ts";

test("ZIP export contains references and deduplicated HTML", () => {
  const bundle = {
    session: {
      sessionId: "s",
      startedAt: 1,
      collectorVersion: "t",
      dictionary: { hash: "h", scopes: [] },
      settings: { maxHtmlBytes: 1, maxTotalBytes: 2, includeEvents: true },
      status: "complete",
      counts: {},
      captureFailures: [],
      totalBytes: 1,
    },
    findings: [],
    occurrences: [],
    events: [],
    captures: [],
    html: [{ hash: "abc", html: "<main>日本語</main>", bytes: 20 }],
  } as unknown as ExportBundle;
  const files = unzipSync(createZip(bundle));
  const names = Object.keys(files);
  assert.ok(names.some((name) => name.endsWith("manifest.json")));
  assert.ok(names.some((name) => name.endsWith("html/abc.html")));
  assert.match(
    strFromU8(files[names.find((name) => name.endsWith("report.md"))!]),
    /Dictionary hash/u,
  );
});

test("export retains the originating session filename after navigation", async (context) => {
  const { JSDOM } = await import("jsdom");
  const { RemoteStore } = await import("../src/remote-store.ts");
  const dom = new JSDOM(
    '<select id="session"></select><main id="report"></main><iframe id="preview"></iframe><p id="message"></p><button id="export"></button><button id="delete"></button>',
  );
  const sessions = ["A", "B"].map((sessionId) => ({
    sessionId,
    startedAt: 1,
    counts: {},
  }));
  context.mock.method(
    RemoteStore.prototype,
    "listSessions",
    async () => sessions,
  );
  context.mock.method(RemoteStore.prototype, "bundle", async (id: string) => ({
    session: sessions.find((session) => session.sessionId === id),
    occurrences: [],
  }));
  let worker!: DeferredWorker;
  class DeferredWorker {
    onmessage!: (event: { data: Uint8Array }) => void;
    bundle?: ExportBundle;
    constructor() {
      worker = this;
    }
    terminate() {}
    postMessage(bundle: ExportBundle) {
      this.bundle = bundle;
    }
  }
  Object.assign(globalThis, {
    document: dom.window.document,
    Worker: DeferredWorker,
    chrome: { runtime: { getURL: (path: string) => path } },
  });
  let filename = "";
  context.mock.method(
    dom.window.HTMLAnchorElement.prototype,
    "click",
    function (this: HTMLAnchorElement) {
      filename = this.download;
    },
  );
  try {
    await import("../src/report.ts");
    await new Promise<void>((resolve) => setImmediate(resolve));
    dom.window.document.getElementById("export")!.click();
    await new Promise<void>((resolve) => setImmediate(resolve));
    const select = dom.window.document.getElementById(
      "session",
    ) as HTMLSelectElement;
    select.value = "B";
    select.dispatchEvent(new dom.window.Event("change"));
    worker.onmessage({ data: new Uint8Array([1]) });
    await new Promise<void>((resolve) => setImmediate(resolve));
    assert.equal(worker.bundle?.session.sessionId, "A");
    assert.equal(filename, "collection-A.zip");
  } finally {
    dom.window.close();
  }
});
