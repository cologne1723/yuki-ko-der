import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { build } from "esbuild";
import { chromium } from "playwright";
import type { EditorView } from "codemirror";

declare global {
  interface Window {
    editorSourceFixture: {
      view: EditorView;
      save: (source: string) => void;
    };
  }
}

test("saving maps the editor viewport without replaying an older scroll", async (t) => {
  if (process.env.REVIEW_BROWSER_TESTS !== "1") {
    t.skip("Set REVIEW_BROWSER_TESTS=1 for the source scroll regression");
    return;
  }
  const executablePath =
    process.env.REVIEW_TEST_BROWSER ??
    (existsSync("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome")
      ? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
      : chromium.executablePath());
  assert.ok(
    existsSync(executablePath),
    "Install Chromium or set REVIEW_TEST_BROWSER",
  );
  const source =
    "---\nhumanReview: [reviewer]\nmachineReview: approved\n---\n\n" +
    Array.from(
      { length: 150 },
      (_, i) =>
        `Paragraph ${i}: text that wraps across the source editor and keeps the document scrollable.\n`,
    ).join("\n");
  const bundle = await build({
    stdin: {
      contents: `
import { EditorView, basicSetup } from 'codemirror';
import { applySavedSource } from './public/app/editor-source.ts';
export const view = new EditorView({
  doc: ${JSON.stringify(source)},
  parent: document.body,
  extensions: [basicSetup, EditorView.lineWrapping, EditorView.theme({
    '&': {height: '400px', width: '420px'},
    '.cm-scroller': {overflow: 'auto'},
  })],
});
export function save(source) { applySavedSource(view, source); }
`,
      resolveDir: resolve("tools/review"),
    },
    bundle: true,
    write: false,
    format: "iife",
    globalName: "editorSourceFixture",
    platform: "browser",
  });
  const browser = await chromium.launch({ executablePath, headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage();
  await page.addInitScript("window.__name = (target) => target;");
  await page.route("**/*", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<!doctype html><body></body>",
    }),
  );
  await page.goto("http://review.test/");
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  await page.evaluate(() => {
    const { view } = window.editorSourceFixture;
    view.dispatch({
      selection: { anchor: view.state.doc.line(100).from + 12 },
      scrollIntoView: true,
    });
    view.focus();
  });
  // Include CodeMirror's deferred layout pass, not just synchronous dispatch.
  const settle = () =>
    page.evaluate(
      () =>
        new Promise<void>((resolve) => {
          let frames = 0;
          const next = () =>
            ++frames === 6 ? resolve() : requestAnimationFrame(next);
          requestAnimationFrame(next);
        }),
    );
  await settle();
  const before = await page.evaluate(() => {
    const { view } = window.editorSourceFixture;
    return {
      top: view.scrollDOM.scrollTop,
      cursor: view.state.selection.main.head,
    };
  });
  assert.ok(
    before.top > 400,
    "The test must start in the middle of the document",
  );
  const saved = source
    .replace("[reviewer]", "[]")
    .replace("machineReview: approved", "machineReview: unreviewed");
  await page.evaluate((saved) => window.editorSourceFixture.save(saved), saved);
  await settle();
  const after = await page.evaluate(() => {
    const { view } = window.editorSourceFixture;
    return {
      top: view.scrollDOM.scrollTop,
      cursor: view.state.selection.main.head,
      source: view.state.doc.toString(),
    };
  });
  assert.equal(after.source, saved);
  assert.equal(after.cursor, before.cursor + saved.length - source.length);
  assert.ok(
    Math.abs(after.top - before.top) <= 1,
    "Saving metadata preserves the viewport",
  );

  for (const distance of [150, -200, 100]) {
    const requested = await page.evaluate((distance) => {
      const { view, save } = window.editorSourceFixture;
      save(
        view.state.doc
          .toString()
          .replace(/humanReview: \[[^\]]*\]/, (line) =>
            line === "humanReview: []"
              ? "humanReview: [reviewer]"
              : "humanReview: []",
          ),
      );
      // A wheel/touchpad scroll can arrive after the save response, before
      // CodeMirror's next animation-frame measurement. Do not mock either API.
      view.scrollDOM.scrollTop += distance;
      return view.scrollDOM.scrollTop;
    }, distance);
    await settle();
    assert.equal(
      await page.evaluate(
        () => window.editorSourceFixture.view.scrollDOM.scrollTop,
      ),
      requested,
      "The save must not overwrite a newer scroll during its deferred layout pass",
    );
  }
});
