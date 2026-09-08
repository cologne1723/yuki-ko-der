import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { JSDOM } from "jsdom";

const bundle = await build({
  entryPoints: [fileURLToPath(new URL("../src/popup.ts", import.meta.url))],
  bundle: true,
  write: false,
  format: "iife",
});
const html = await readFile(
  new URL("../public/popup.html", import.meta.url),
  "utf8",
);
const settle = async () => {
  for (let i = 0; i < 4; i++) await new Promise<void>((r) => setImmediate(r));
};
const status = (recording = false) => ({
  ok: true,
  allowed: true,
  tabId: 7,
  recording,
  counts: { saved: 2, pending: 0, failed: 0 },
});

async function popup(
  send: (message: { type: string; tabId?: number }) => Promise<unknown>,
) {
  const dom = new JSDOM(html, { runScripts: "outside-only" });
  let poll!: () => void;
  dom.window.setInterval = ((fn: () => void) => {
    poll = fn;
    return 1;
  }) as typeof dom.window.setInterval;
  Object.assign(dom.window, { chrome: { runtime: { sendMessage: send } } });
  dom.window.eval(bundle.outputFiles[0].text);
  await settle();
  const button = (id: string) =>
    dom.window.document.getElementById(id) as HTMLButtonElement;
  return {
    dom,
    button,
    poll: () => poll(),
    text: (id: string) => dom.window.document.getElementById(id)!.textContent,
  };
}

test("every popup action displays explicit failures and preserves them across polling", async () => {
  for (const id of ["start", "pause", "capture", "report"]) {
    const calls: Array<{ type: string; tabId?: number }> = [];
    const page = await popup(async (request) => {
      calls.push(request);
      return request.type === "popup:status"
        ? status(id !== "start")
        : { ok: false, error: "Storage quota exceeded" };
    });
    try {
      page.button(id).click();
      await settle();
      assert.match(page.text("message")!, /Storage quota exceeded/);
      page.poll();
      await settle();
      assert.match(page.text("message")!, /Storage quota exceeded/);
      assert.equal(
        calls.find((call) => call.type !== "popup:status")?.tabId,
        7,
      );
    } finally {
      page.dom.window.close();
    }
  }
});

test("missing receivers and malformed status never look paused or enable recording", async () => {
  for (const result of [
    undefined,
    { ok: true },
    { ok: false, error: "Receiver missing" },
  ]) {
    const page = await popup(async () => result);
    try {
      assert.equal(page.text("status"), "Status unavailable");
      assert.equal(page.button("start").disabled, true);
      assert.equal(page.button("report").disabled, false);
      assert.ok(page.text("message"));
    } finally {
      page.dom.window.close();
    }
  }
  const page = await popup(async (request) => {
    if (request.type === "popup:status") return status();
    throw new Error("Extension context invalidated");
  });
  try {
    page.button("start").click();
    await settle();
    assert.match(page.text("message")!, /Extension context invalidated/);
    assert.equal(page.button("start").disabled, false);
  } finally {
    page.dom.window.close();
  }
});

test("actions cannot overlap and successful retry clears the failure", async () => {
  let release!: (value: unknown) => void;
  let attempts = 0;
  const page = await popup(async (request) => {
    if (request.type === "popup:status") return status();
    attempts++;
    return new Promise((resolve) => {
      release = resolve;
    });
  });
  try {
    page.button("start").click();
    page.button("start").click();
    assert.equal(attempts, 1);
    assert.equal(page.button("report").disabled, true);
    release({ ok: false, error: "Try again" });
    await settle();
    assert.match(page.text("message")!, /Try again/);
    page.button("start").click();
    release({ ok: true, recording: true });
    await settle();
    assert.equal(page.text("message"), "");
    assert.equal(attempts, 2);
  } finally {
    page.dom.window.close();
  }
});

test("manual capture distinguishes saved, queued, failed and paused outcomes", async () => {
  for (const [result, expected] of [
    [{ outcome: "saved", captureId: "one" }, /Capture saved/],
    [{ outcome: "queued", requestId: "manual-one" }, /Capture queued/],
    [{ outcome: "failed", error: "Snapshot too large" }, /Snapshot too large/],
    [{ outcome: "not-recording" }, /Recording is paused/],
  ] as const) {
    const page = await popup(async (request) =>
      request.type === "popup:status" ? status(true) : { ok: true, ...result },
    );
    try {
      page.button("capture").click();
      await settle();
      assert.match(page.text("message")!, expected);
    } finally {
      page.dom.window.close();
    }
  }
});

test("polling resolves the exact queued capture without mistaking another save for completion", async () => {
  let completion:
    { requestId: string; outcome: string; error?: string } | undefined;
  const page = await popup(async (request) =>
    request.type === "popup:status"
      ? { ...status(true), manualCapture: completion }
      : { ok: true, outcome: "queued", requestId: "mine" },
  );
  try {
    page.button("capture").click();
    await settle();
    completion = { requestId: "other", outcome: "saved" };
    page.poll();
    await settle();
    assert.match(page.text("message")!, /queued/);
    completion = { requestId: "mine", outcome: "failed", error: "Disk full" };
    page.poll();
    await settle();
    assert.match(page.text("message")!, /Disk full/);
    page.button("capture").click();
    completion = { requestId: "mine", outcome: "saved" };
    await settle();
    assert.equal(page.text("message"), "Capture saved.");
  } finally {
    page.dom.window.close();
  }
});
