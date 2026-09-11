import assert from "node:assert/strict";
import test from "node:test";
import { setTimeout } from "node:timers/promises";
import { build } from "esbuild";
import { JSDOM } from "jsdom";
import { katexStylePlugin } from "../src/katex-style-plugin.ts";
import { installStagingSrcdoc } from "./iframe-srcdoc-fixture.ts";

const bundle = await build({
  plugins: [
    katexStylePlugin,
    {
      name: "controlled-preview-math",
      setup(build) {
        build.onResolve({ filter: /^\.\.\/tex\.ts$/ }, () => ({
          path: "controlled-math",
          namespace: "controlled-math",
        }));
        build.onLoad({ filter: /.*/, namespace: "controlled-math" }, () => ({
          contents:
            "export async function renderPreviewMath(root, profile, options) { await globalThis.mathJob(root, profile, options); }",
          loader: "js",
        }));
      },
    },
  ],
  stdin: {
    resolveDir: process.cwd() + "/tools/review",
    loader: "tsx",
    contents: `import React from 'react';
      import { act, render, cleanup } from '@testing-library/react';
      import { MantineProvider } from '@mantine/core';
      import { Preview } from './public/app/preview.tsx';
      import { previewDocument } from './public/app/preview-document.ts';
      export { previewDocument };
      let view;
      export function show(html) { act(() => {
        const content = <MantineProvider env="test"><Preview html={html} title="Preview" renderProfile={{engine:'mathjax',version:'3.2.2'}} sourceUrl="https://yukicoder.me/problems/no/42"/></MantineProvider>;
        if(view) view.rerender(content); else view=render(content);
      }); }
      export function unmount() { act(() => cleanup()); }
    `,
  },
  bundle: true,
  write: false,
  format: "iife",
  globalName: "previewFixture",
  platform: "browser",
  jsx: "automatic",
  define: { "process.env.NODE_ENV": '"development"' },
});

test("async preview keeps the latest draft, last good document, retry and unmount lifecycle", async (t) => {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", {
    url: "http://localhost/",
    runScripts: "outside-only",
    pretendToBeVisual: true,
  });
  const jobs: {
    root: HTMLElement;
    resolve: () => void;
    reject: (error: Error) => void;
  }[] = [];
  installStagingSrcdoc(dom);
  Object.assign(dom.window, {
    matchMedia: () => ({
      matches: false,
      addEventListener() {},
      removeEventListener() {},
    }),
    ResizeObserver: class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
    mathJob: (root: HTMLElement) =>
      new Promise<void>((resolve, reject) =>
        jobs.push({ root, resolve, reject }),
      ),
  });
  dom.window.eval(bundle.outputFiles[0].text);
  const fixture = (
    dom.window as unknown as {
      previewFixture: { show(html: string): void; unmount(): void };
    }
  ).previewFixture;
  t.after(() => {
    fixture.unmount();
    dom.window.close();
  });
  fixture.show("<p>first draft</p>");
  await setTimeout(0);
  fixture.show("<p>latest draft</p>");
  await setTimeout(0);
  assert.equal(jobs.length, 2);
  const frame = dom.window.document.querySelector<HTMLIFrameElement>(
    'iframe[title="Preview"]',
  )!;
  assert.equal(
    dom.window.document.querySelectorAll("iframe[data-review-math-stage]")
      .length,
    1,
  );
  jobs[1].resolve();
  await setTimeout(30);
  assert.match(frame.srcdoc, /latest draft/);
  assert.equal(
    dom.window.document.querySelectorAll("iframe[data-review-math-stage]")
      .length,
    0,
  );
  jobs[0].resolve();
  await setTimeout(30);
  assert.match(frame.srcdoc, /latest draft/);
  fixture.show("<p>retry draft</p>");
  await setTimeout(0);
  jobs[2].reject(new Error("font rendering unavailable"));
  await setTimeout(30);
  assert.match(frame.srcdoc, /latest draft/);
  assert.match(
    dom.window.document.querySelector('[role="alert"]')!.textContent!,
    /font rendering unavailable/,
  );
  dom.window.document.querySelector<HTMLButtonElement>("button")!.click();
  await setTimeout(30);
  assert.equal(jobs.length, 4);
  jobs[3].resolve();
  await setTimeout(30);
  assert.match(frame.srcdoc, /retry draft/);
  assert.equal(dom.window.document.querySelector('[role="alert"]'), null);
  fixture.show("<p>stale failure</p>");
  await setTimeout(0);
  fixture.show("<p>final draft</p>");
  await setTimeout(0);
  jobs[5].resolve();
  jobs[4].reject(new Error("stale error"));
  await setTimeout(30);
  assert.match(frame.srcdoc, /final draft/);
  assert.equal(dom.window.document.querySelector('[role="alert"]'), null);
  fixture.show("<p>unmounted draft</p>");
  await setTimeout(0);
  fixture.unmount();
  jobs[6].reject(new Error("unmounted error"));
  await setTimeout(30);
  assert.equal(dom.window.document.querySelector("iframe"), null);
});

for (const phase of ["load", "fonts", "math"])
  test(`preview ${phase} timeout removes staging frame and ignores late work`, async () => {
    const dom = new JSDOM("<!doctype html>", {
      url: "http://localhost/",
      runScripts: "outside-only",
    });
    let calls = 0;
    let release!: () => void;
    const stalled = new Promise<void>((resolve) => {
      release = resolve;
    });
    if (phase !== "load")
      installStagingSrcdoc(
        dom,
        phase === "fonts"
          ? (doc) =>
              Object.defineProperty(doc, "fonts", { value: { ready: stalled } })
          : undefined,
      );
    Object.assign(dom.window, {
      mathJob: async () => {
        calls++;
        if (phase === "math") await stalled;
      },
    });
    dom.window.eval(bundle.outputFiles[0].text);
    const fixture = (
      dom.window as unknown as {
        previewFixture: {
          previewDocument: (...args: unknown[]) => Promise<string>;
        };
      }
    ).previewFixture;
    try {
      await assert.rejects(
        fixture.previewDocument(
          "<p>$x$</p>",
          false,
          "http://localhost",
          undefined,
          { engine: "mathjax", version: "3.2.2" },
          undefined,
          { timeoutMs: 40 },
        ),
        /timed out/,
      );
      assert.equal(
        dom.window.document.querySelector("iframe[data-review-math-stage]"),
        null,
      );
      release();
      await setTimeout(0);
      assert.equal(calls, phase === "math" ? 1 : 0);
      assert.equal(
        dom.window.document.querySelector("iframe[data-review-math-stage]"),
        null,
      );
    } finally {
      release();
      dom.window.close();
    }
  });

test("standalone preview sanitizes before math, resolves source-relative links, and keeps scripts disabled", async () => {
  const dom = new JSDOM("<!doctype html>", {
    url: "http://localhost/",
    runScripts: "outside-only",
  });
  let received: HTMLElement | undefined;
  installStagingSrcdoc(dom);
  Object.assign(dom.window, {
    mathJob: async (root: HTMLElement) => {
      received = root;
      assert.ok(root.isConnected);
      assert.ok(root.ownerDocument.defaultView);
      assert.equal(
        root.ownerDocument.defaultView!.frameElement?.getAttribute("sandbox"),
        "allow-same-origin",
      );
    },
  });
  dom.window.eval(bundle.outputFiles[0].text);
  const fixture = (
    dom.window as unknown as {
      previewFixture: {
        previewDocument: (...args: unknown[]) => Promise<string>;
      };
    }
  ).previewFixture;
  try {
    const html = await fixture.previewDocument(
      `<base href="https://evil.example/"><script>alert(1)</script><iframe srcdoc="bad"></iframe><form>bad</form><p onclick="alert(1)">$x$</p><a href="43">next</a><a href="#input">anchor</a><a href="javascript:alert(1)">bad</a><img src="../image.png" onerror="alert(1)"><h4 id="input">Input</h4>`,
      false,
      "http://localhost",
      undefined,
      { engine: "mathjax", version: "3.2.2" },
      "https://yukicoder.me/problems/no/42",
    );
    assert.ok(received);
    assert.equal(
      dom.window.document.querySelector("iframe[data-review-math-stage]"),
      null,
    );
    assert.equal(received.ownerDocument.compatMode, "CSS1Compat");
    assert.equal(
      received.querySelector("script,iframe,form,[onclick],[onerror]"),
      null,
    );
    const doc = new dom.window.DOMParser().parseFromString(html, "text/html");
    assert.ok(html.startsWith("<!doctype html>"));
    assert.equal(doc.compatMode, "CSS1Compat");
    assert.equal(
      doc.querySelector("base")?.href,
      "https://yukicoder.me/problems/no/42",
    );
    assert.equal(
      doc.querySelector("a")?.href,
      "https://yukicoder.me/problems/no/43",
    );
    assert.equal(doc.querySelector("a")?.rel, "noopener noreferrer");
    assert.equal(doc.querySelectorAll("a")[1].getAttribute("href"), "#input");
    assert.equal(doc.querySelectorAll("a")[2].getAttribute("href"), null);
    assert.equal(
      doc.querySelector("img")?.src,
      "https://yukicoder.me/problems/image.png",
    );
    assert.match(doc.querySelector("meta")!.content, /default-src 'none'/);
    assert.equal(
      doc.querySelector("script,iframe,form,[onclick],[onerror]"),
      null,
    );
  } finally {
    dom.window.close();
  }
});
