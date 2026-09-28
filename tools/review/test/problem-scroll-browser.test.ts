import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { build } from "esbuild";
import { chromium, firefox } from "playwright";
import type { EditorView } from "codemirror";
import { setProblemMarkdownReviews } from "translation-core/problem-frontmatter";
import { compileProblemMarkdown } from "translation-core/problem-markdown";
import type { ProblemReview } from "../src/problem-review.ts";
import { katexStylePlugin } from "../src/katex-style-plugin.ts";

declare global {
  interface Window {
    typingFrames: { editor: number; page: number; y: number }[];
    typingFrame: number;
    problemScrollFixture: {
      view: () => EditorView;
      remember: () => void;
      sameEditor: () => boolean;
    };
  }
}

test(
  "the review app preserves source identity, cursor and scroll across save outcomes",
  { timeout: 180000 },
  async (t) => {
    if (process.env.REVIEW_BROWSER_TESTS !== "1") {
      t.skip(
        "Set REVIEW_BROWSER_TESTS=1 for the complete app scroll regression",
      );
      return;
    }
    const browserType =
      process.env.REVIEW_TEST_ENGINE === "firefox" ? firefox : chromium;
    const executablePath =
      process.env.REVIEW_TEST_BROWSER ?? browserType.executablePath();
    assert.ok(
      existsSync(executablePath),
      "Install the selected Playwright browser or set REVIEW_TEST_BROWSER",
    );
    const bundle = await build({
      plugins: [katexStylePlugin],
      stdin: {
        contents: `
import './public/app/main.tsx';
import { EditorView } from 'codemirror';
export function view() { return EditorView.findFromDOM(document.querySelector('.cm-editor')); }
let original;
export function remember() { original = view(); }
export function sameEditor() { return original === view(); }
`,
        resolveDir: resolve("tools/review"),
      },
      bundle: true,
      write: false,
      outdir: "out",
      format: "iife",
      globalName: "problemScrollFixture",
      platform: "browser",
      jsx: "automatic",
      define: {
        "process.env.NODE_ENV": '"production"',
        __dirname: '"/mathjax/components"',
      },
    });
    const source =
      `---
schemaVersion: 1
locale: ko
problemNo: 1
problemId: 1
sourceTitle: Scroll fixture
sourceHtmlSha256: ${"a".repeat(64)}
humanReview: [reviewer]
machineReview: approved
title: Scroll fixture
---

## Statement

` +
      Array.from(
        { length: 150 },
        (_, i) =>
          `Paragraph ${i}: editable source text that wraps in the source editor.\n\n`,
      ).join("");
    const browser = await browserType.launch({
      executablePath,
      headless: true,
    });
    t.after(() => browser.close());
    for (const width of [900, 1600]) {
      for (const outcome of [
        "ordinary-typing",
        "normalized",
        "unchanged",
        "failure",
        "typing",
        "scrolling",
      ] as const) {
        const name = `${width}px / ${outcome}`;
        await t.test(name, { timeout: 30000 }, async () => {
          const page = await browser.newPage({
            viewport: { width, height: 900 },
          });
          try {
            if (process.env.REVIEW_TEST_CPU_RATE && browserType === chromium) {
              const session = await page.context().newCDPSession(page);
              await session.send("Emulation.setCPUThrottlingRate", {
                rate: Number(process.env.REVIEW_TEST_CPU_RATE),
              });
            }
            await page.addInitScript("window.__name = (target) => target;");
            let problem: ProblemReview = {
              problemNo: 1,
              japaneseTitle: "Scroll fixture",
              koreanTitle: "Scroll fixture",
              reviewStatus: "approved",
              machineTranslated: false,
              sourceFormat: "mdx",
              revision: "r1",
              koreanSource: source,
              koreanHtml: compileProblemMarkdown(source),
              japaneseHtml: "<h4>Original</h4><p>Original text</p>",
              validationWarnings: [],
              renderProfile: { engine: "katex", version: "0.17.0" },
            };
            let requestCount = 0;
            let received!: (source: string) => void;
            const request = new Promise<string>((resolve) => {
              received = resolve;
            });
            let release!: () => void;
            const response = new Promise<void>((resolve) => {
              release = resolve;
            });
            await page.route("**/*", async (route) => {
              const url = new URL(route.request().url());
              if (url.origin !== "http://review.test") return route.abort();
              if (url.pathname === "/")
                return route.fulfill({
                  contentType: "text/html",
                  body: '<!doctype html><link rel="stylesheet" href="/fixture.css"><div id="root"></div><script src="/fixture.js"></script>',
                });
              if (url.pathname.startsWith("/fixture."))
                return route.fulfill({
                  contentType: url.pathname.endsWith(".css")
                    ? "text/css"
                    : "text/javascript",
                  body: bundle.outputFiles.find((file) =>
                    file.path.endsWith(
                      url.pathname.endsWith(".css") ? ".css" : ".js",
                    ),
                  )!.text,
                });
              if (url.pathname === "/api/tasks")
                return route.fulfill({ json: [] });
              if (url.pathname === "/api/problems")
                return route.fulfill({ json: { problems: [problem] } });
              if (url.pathname === "/api/problems/1") {
                if (route.request().method() === "PUT") {
                  requestCount++;
                  const submitted = route.request().postDataJSON()
                    .html as string;
                  received(submitted);
                  await response;
                  if (outcome === "failure")
                    return route.fulfill({
                      status: 409,
                      json: { error: "Fixture revision conflict" },
                    });
                  const koreanSource =
                    outcome === "unchanged"
                      ? submitted
                      : setProblemMarkdownReviews(submitted, {
                          human: [],
                          machine: "unreviewed",
                        });
                  problem = {
                    ...problem,
                    koreanSource,
                    koreanHtml: compileProblemMarkdown(koreanSource),
                    revision: "r2",
                  };
                }
                return route.fulfill({ json: problem });
              }
              return route.abort();
            });
            await page.goto("http://review.test/?problem=1");
            await page.locator(".cm-content").waitFor();
            await page.evaluate(() => {
              const fixture = window.problemScrollFixture;
              fixture.remember();
              const view = fixture.view();
              view.dispatch({
                selection: { anchor: view.state.doc.line(100).from + 12 },
                scrollIntoView: true,
              });
              view.focus();
            });
            const settle = () =>
              page.evaluate(
                () =>
                  new Promise<void>((resolve) => {
                    let frames = 0;
                    const next = () =>
                      ++frames === 20 ? resolve() : requestAnimationFrame(next);
                    requestAnimationFrame(next);
                  }),
              );
            const previewReady = async () => {
              const current = await page.evaluate(() =>
                window.problemScrollFixture.view().state.doc.toString(),
              );
              // Compilation is debounced and iframe navigation is asynchronous.
              // Main-page animation frames alone do not imply the new preview
              // has loaded (particularly on a busy CI runner).
              await page.waitForFunction((expectedHtml) => {
                const iframe = document.querySelector<HTMLIFrameElement>(
                  'iframe[title="한국어 번역"]',
                );
                const doc = iframe?.contentDocument;
                const expected = new DOMParser().parseFromString(
                  expectedHtml,
                  "text/html",
                );
                return (
                  doc?.readyState === "complete" &&
                  iframe?.closest('[aria-busy="true"]') === null &&
                  doc.querySelector(".problem-statement")?.textContent ===
                    expected.querySelector(".problem-statement")?.textContent
                );
              }, compileProblemMarkdown(current));
              await settle();
            };
            await previewReady();
            if (outcome === "ordinary-typing") {
              const record = () =>
                page.evaluate(() => {
                  const view = window.problemScrollFixture.view();
                  const iframe = document.querySelector<HTMLIFrameElement>(
                    'iframe[title="한국어 번역"]',
                  );
                  return {
                    editor: view.scrollDOM.scrollTop,
                    page: window.scrollY,
                    editorY: view.dom.getBoundingClientRect().top,
                    preview:
                      iframe?.contentDocument?.documentElement?.scrollTop ?? 0,
                  };
                });
              await page.evaluate(() => {
                const iframe = document.querySelector<HTMLIFrameElement>(
                  'iframe[title="한국어 번역"]',
                )!;
                iframe.contentDocument!.documentElement.scrollTop = 650;
              });
              await settle();
              const before = await record();
              assert.equal(
                before.preview,
                650,
                "Preview must be scrolled before typing",
              );
              const samples = [before];
              await page.evaluate(() => {
                window.typingFrames = [];
                const record = () => {
                  const view = window.problemScrollFixture.view();
                  window.typingFrames.push({
                    editor: view.scrollDOM.scrollTop,
                    page: window.scrollY,
                    y: view.dom.getBoundingClientRect().top,
                  });
                  window.typingFrame = requestAnimationFrame(record);
                };
                record();
              });
              for (const character of "abc123가나다") {
                if (/^[a-z0-9]$/.test(character))
                  await page.keyboard.press(character);
                else await page.keyboard.insertText(character);
                await previewReady();
                samples.push(await record());
              }
              const frames = await page.evaluate(() => {
                cancelAnimationFrame(window.typingFrame);
                return window.typingFrames;
              });

              assert(
                frames.every((x) => Math.abs(x.page - before.page) <= 1),
                "Typing moved page scroll while preview was rendering",
              );
              assert(
                frames.every((x) => Math.abs(x.editor - before.editor) <= 1),
                "Typing moved source scroll while preview was rendering",
              );
              assert.equal(requestCount, 0);
              assert(
                samples.every((x) => Math.abs(x.preview - before.preview) <= 1),
                `Typing moved preview scroll: ${JSON.stringify(samples)}`,
              );
              assert(
                samples.every((x) => Math.abs(x.editor - before.editor) <= 1),
                "Typing moved source scroll",
              );
              assert(
                samples.every((x) => Math.abs(x.page - before.page) <= 1),
                "Typing moved page scroll",
              );
              return;
            }
            await page.keyboard.insertText("edit");
            await settle();
            const snapshot = () =>
              page.evaluate(() => {
                const view = window.problemScrollFixture.view();
                return {
                  top: view.scrollDOM.scrollTop,
                  cursor: view.state.selection.main.head,
                  source: view.state.doc.toString(),
                  focused: view.hasFocus,
                };
              });
            const submittedState = await snapshot();
            assert.ok(submittedState.top > 400);
            await page.keyboard.press("Meta+s");
            assert.equal(await request, submittedState.source);
            // The pending state must not disable or remount the source editor.
            assert.equal(
              await page.locator(".cm-content").getAttribute("contenteditable"),
              "true",
            );
            await page.keyboard.press("Meta+s");
            if (outcome === "typing")
              await page.keyboard.insertText("new draft");
            if (outcome === "scrolling") {
              const box = await page.locator(".cm-scroller").boundingBox();
              assert.ok(box);
              await page.mouse.move(
                box.x + box.width / 2,
                Math.max(100, box.y + 100),
              );
              await page.mouse.wheel(0, 120);
            }
            await settle();
            const pendingState = await snapshot();
            if (outcome === "scrolling")
              assert.ok(pendingState.top > submittedState.top);
            release();
            await page.waitForFunction(
              () => !document.querySelector('button[data-loading="true"]'),
            );
            if (outcome === "failure")
              await page
                .getByText("Fixture revision conflict", { exact: false })
                .first()
                .waitFor();
            else
              await page
                .getByText("저장했습니다. 검수 상태를 확인하세요.", {
                  exact: true,
                })
                .waitFor();
            await settle();
            const after = await snapshot();
            assert.equal(
              requestCount,
              1,
              "Repeated Cmd+S while pending must not start another save",
            );
            assert.equal(
              await page.evaluate(() =>
                window.problemScrollFixture.sameEditor(),
              ),
              true,
            );
            assert.equal(after.focused, true);
            assert.ok(
              Math.abs(after.top - pendingState.top) <= 1,
              `Save moved source scroll: ${pendingState.top} -> ${after.top}`,
            );
            const keepsDraft = outcome === "typing" || outcome === "failure";
            assert.equal(
              after.source,
              keepsDraft ? pendingState.source : problem.koreanSource,
            );
            assert.equal(
              after.cursor,
              pendingState.cursor +
                (keepsDraft
                  ? 0
                  : problem.koreanSource.length - submittedState.source.length),
            );
            const nextResponse = page.waitForResponse(
              (response) =>
                new URL(response.url()).pathname === "/api/problems/1" &&
                response.request().method() === "PUT",
            );
            await page.keyboard.press("Meta+s");
            await nextResponse;
            assert.equal(
              requestCount,
              2,
              "Completion must allow the next save, including after failure",
            );
            await settle();
          } finally {
            await page.close();
          }
        });
      }
    }
  },
);
