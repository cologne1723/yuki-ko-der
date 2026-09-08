import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { readFile } from "node:fs/promises";
import { JSDOM } from "jsdom";
import { RemoteStore } from "../src/remote-store.ts";
import type { ExportBundle, Session } from "../src/types.ts";
const settle = async () => {
  for (let i = 0; i < 4; i++) await new Promise<void>((r) => setImmediate(r));
};

async function fixture(context: TestContext) {
  const dom = new JSDOM(
    await readFile(new URL("../public/report.html", import.meta.url), "utf8"),
  );
  let sessions: Session[] = [
    {
      sessionId: "A",
      startedAt: 1,
      counts: { saved: 1 },
      collectorVersion: "test",
      dictionary: { hash: "test", scopes: [] },
      settings: {
        maxHtmlBytes: 1024,
        maxTotalBytes: 4096,
        includeEvents: false,
      },
      status: "paused",
      captureFailures: [],
      totalBytes: 0,
    },
  ];
  let failure = "";
  let worker!: FakeWorker;
  class FakeWorker {
    onerror?: (event: { message: string; preventDefault(): void }) => void;
    onmessage?: (event: { data: unknown }) => void;
    onmessageerror?: () => void;
    terminated = false;
    constructor() {
      worker = this;
    }
    postMessage() {}
    terminate() {
      this.terminated = true;
    }
  }
  context.mock.method(RemoteStore.prototype, "listSessions", async () => {
    if (failure === "list") throw new Error("List failed");
    return sessions;
  });
  context.mock.method(RemoteStore.prototype, "bundle", async (id: string) => {
    if (failure === "bundle") throw new Error("Bundle failed");
    return {
      session: sessions.find((s) => s.sessionId === id),
      occurrences: [],
      captures: [],
      findings: [],
      html: [],
      events: [],
    } as unknown as ExportBundle;
  });
  context.mock.method(RemoteStore.prototype, "deleteSession", async () => {
    if (failure === "delete") throw new Error("Deletion failed");
    sessions = [];
  });
  Object.assign(globalThis, {
    document: dom.window.document,
    Worker: FakeWorker,
    confirm: () => true,
    chrome: { runtime: { getURL: (p: string) => p } },
  });
  await import(`../src/report.ts?test=${crypto.randomUUID()}`);
  await settle();
  return {
    dom,
    worker: () => worker,
    fail: (value: string) => {
      failure = value;
    },
    button: (id: string) =>
      dom.window.document.getElementById(id) as HTMLButtonElement,
    text: (id: string) => dom.window.document.getElementById(id)!.textContent,
  };
}

test("report failures are visible, retryable and do not leave actions locked", async (context) => {
  const f = await fixture(context);
  try {
    for (const kind of ["bundle", "delete"]) {
      f.fail(kind);
      f.button(kind === "bundle" ? "export" : "delete").click();
      await settle();
      assert.match(f.text("error")!, /failed/i);
      assert.equal(f.button("delete").disabled, false);
      assert.equal(f.button("export").disabled, false);
    }
    f.fail("list");
    f.button("refresh").click();
    await settle();
    assert.match(f.text("error")!, /List failed/);
    f.fail("");
    f.button("refresh").click();
    await settle();
    assert.equal(f.text("error"), "");
    f.button("export").click();
    await settle();
    f.worker().onerror!({ message: "Worker crashed", preventDefault() {} });
    await settle();
    assert.match(f.text("error")!, /Worker crashed/);
    assert.equal(f.worker().terminated, true);
    assert.equal(f.button("export").disabled, false);
    f.button("export").click();
    await settle();
    f.worker().onmessage!({ data: { error: "ZIP failed" } });
    await settle();
    assert.match(f.text("error")!, /ZIP failed/);
    assert.equal(f.worker().terminated, true);
  } finally {
    f.dom.window.close();
  }
});

test("deleting the last session clears its snapshot and counts and disables export", async (context) => {
  const f = await fixture(context);
  try {
    const preview = f.dom.window.document.getElementById(
      "preview",
    ) as HTMLIFrameElement;
    preview.srcdoc = "<p>Old evidence</p>";
    assert.match(f.text("message")!, /Saved 1/);
    f.button("delete").click();
    await settle();
    assert.equal(preview.srcdoc, "");
    assert.equal(f.text("message"), "");
    assert.equal(f.text("report"), "No recorded sessions.");
    assert.equal(f.button("export").disabled, true);
    assert.equal(f.button("delete").disabled, true);
  } finally {
    f.dom.window.close();
  }
});
