import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { build } from "esbuild";
import { chromium } from "playwright";
import { katexStylePlugin } from "../src/katex-style-plugin.ts";

test(
  "connected preview staging matches native MathJax browser metrics and leaves no frames",
  { timeout: 30000 },
  async (t) => {
    if (process.env.REVIEW_BROWSER_TESTS !== "1") {
      t.skip(
        "Set REVIEW_BROWSER_TESTS=1 for the isolated Chrome metrics check",
      );
      return;
    }
    const executablePath =
      process.env.REVIEW_TEST_BROWSER ??
      (existsSync(
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      )
        ? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
        : chromium.executablePath());
    if (!existsSync(executablePath)) {
      t.skip(
        "Install Chromium or set REVIEW_TEST_BROWSER to run layout regression",
      );
      return;
    }
    const bundle = await build({
      plugins: [katexStylePlugin],
      stdin: {
        contents:
          'export { previewDocument } from "./public/app/preview-document.ts"; export { sanitizeTranslatedBlocks } from "translation-core/problem-rendering";',
        resolveDir: resolve("tools/review"),
      },
      bundle: true,
      write: false,
      format: "iife",
      globalName: "previewMetrics",
      platform: "browser",
    });
    const coreRequire = createRequire(
      resolve("packages/translation-core/package.json"),
    );
    const fonts = join(
      dirname(coreRequire.resolve("mathjax-full/package.json")),
      "es5/output/chtml/fonts/woff-v2",
    );
    const browser = await chromium.launch({ executablePath, headless: true });
    try {
      const page = await browser.newPage();
      const loadedFonts = new Set<string>();
      await page.addInitScript("window.__name = (target) => target;");
      await page.route("**/*", async (route) => {
        const url = new URL(route.request().url());
        if (url.origin !== "http://review.test") return route.abort();
        if (url.pathname === "/")
          return route.fulfill({
            contentType: "text/html",
            body: '<!doctype html><script src="/fixture.js"></script>',
          });
        if (url.pathname === "/fixture.js")
          return route.fulfill({
            contentType: "text/javascript",
            body: bundle.outputFiles[0].text,
          });
        if (url.pathname === "/native-mathjax.js")
          return route.fulfill({
            contentType: "text/javascript",
            body: await readFile(
              coreRequire.resolve("mathjax-full/es5/tex-mml-chtml.js"),
            ),
          });
        const name = url.pathname.match(
          /^\/mathjax\/fonts\/woff-v2\/([\w-]+\.woff)$/,
        )?.[1];
        if (name) {
          loadedFonts.add(name);
          return route.fulfill({
            contentType: "font/woff",
            body: await readFile(join(fonts, name)),
          });
        }
        return route.abort();
      });
      await page.goto("http://review.test/");
      const results = await page.evaluate(async () => {
        const api = (
          window as unknown as {
            previewMetrics: {
              previewDocument: (...args: unknown[]) => Promise<string>;
              sanitizeTranslatedBlocks: (blocks: Element[]) => HTMLElement[];
            };
          }
        ).previewMetrics;
        const source = String.raw`<!doctype html><style>.large{font-size:30px}.medium{font-size:22px}</style><p>$x+1$</p><p class="medium">$\underbrace{a+b+z}_{26}$</p><p class="large">$$\begin{pmatrix}a&b\\c&d\end{pmatrix}=\frac{\sqrt{n+1}}{2}$$</p>`;
        const profile = { engine: "mathjax", version: "3.2.2" };
        const frameFor = (html: string, native = false) =>
          new Promise<HTMLIFrameElement>((resolve) => {
            const frame = document.createElement("iframe");
            frame.setAttribute(
              "sandbox",
              native ? "allow-same-origin allow-scripts" : "allow-same-origin",
            );
            frame.style.cssText = "width:640px;height:480px;border:0";
            frame.onload = () => {
              if (frame.contentDocument?.URL === "about:srcdoc") resolve(frame);
            };
            frame.srcdoc = html;
            document.body.append(frame);
          });
        const raw = await api.previewDocument(source, false, location.origin);
        // Only the trusted offline reference executes the upstream engine. The
        // candidate staging and final preview keep scripts disabled throughout.
        const reference = await frameFor(
          raw.replace(/<meta http-equiv="Content-Security-Policy"[^>]*>/, ""),
          true,
        );
        await reference.contentDocument!.fonts.ready;
        const nativeWindow = reference.contentWindow as unknown as {
          MathJax: {
            startup: { promise: Promise<void> };
            typesetPromise: (roots: HTMLElement[]) => Promise<void>;
          };
        };
        Object.assign(nativeWindow, {
          MathJax: {
            tex: {
              inlineMath: [
                ["$", "$"],
                ["\\(", "\\)"],
              ],
              processEscapes: false,
            },
            chtml: { fontURL: `${location.origin}/mathjax/fonts/woff-v2` },
            startup: { typeset: false },
          },
        });
        await new Promise<void>((resolve, reject) => {
          const script = reference.contentDocument!.createElement("script");
          script.onload = () => resolve();
          script.onerror = () =>
            reject(new Error("Native MathJax fixture failed to load"));
          script.src = `${location.origin}/native-mathjax.js`;
          reference.contentDocument!.head.append(script);
        });
        await nativeWindow.MathJax.startup.promise;
        await nativeWindow.MathJax.typesetPromise([
          reference.contentDocument!.body,
        ]);
        reference.contentDocument!.body.getBoundingClientRect();
        await reference.contentDocument!.fonts.ready;
        const serialized = await api.previewDocument(
          source,
          false,
          location.origin,
          undefined,
          profile,
          "https://yukicoder.me/problems/no/1",
          { width: 640, height: 480 },
        );
        const candidate = await frameFor(serialized);
        candidate.contentDocument!.body.getBoundingClientRect();
        await candidate.contentDocument!.fonts.ready;
        const metrics = (frame: HTMLIFrameElement) =>
          [...frame.contentDocument!.querySelectorAll("mjx-container")].map(
            (node) => {
              const bounds = node.getBoundingClientRect();
              return { width: bounds.width, height: bounds.height };
            },
          );
        // SVG in IMG must behave like the native site, including its inert
        // image-document script semantics, not be promoted to inline SVG DOM.
        let svgExecuted = false;
        window.addEventListener("message", (event) => {
          if (event.data === "svg-executed") svgExecuted = true;
        });
        const svg =
          "data:image/svg+xml;base64," +
          btoa(
            '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="16"><script>parent.postMessage("svg-executed","*")</script><rect width="32" height="16" fill="red"/></svg>',
          );
        const imageHtml = `<div class="block"><img src="${svg}"></div>`;
        const nativeImage = await frameFor(imageHtml, true);
        const previewImage = await frameFor(
          await api.previewDocument(imageHtml, false, location.origin),
        );
        const rawImage = new DOMParser().parseFromString(
          imageHtml,
          "text/html",
        );
        const extensionImage = api.sanitizeTranslatedBlocks([
          rawImage.querySelector(".block")!,
        ])[0];
        document.body.append(extensionImage);
        const extensionImg = extensionImage.querySelector("img")!;
        await extensionImg.decode();
        await new Promise((resolve) => setTimeout(resolve, 20));
        const imageSizes = [
          nativeImage.contentDocument!.querySelector("img")!,
          previewImage.contentDocument!.querySelector("img")!,
          extensionImg,
        ].map((img) => [img.naturalWidth, img.naturalHeight]);
        return {
          imageSizes,
          svgExecuted,
          reference: metrics(reference),
          candidate: metrics(candidate),
          stagingCount: document.querySelectorAll("[data-review-math-stage]")
            .length,
          css: !!candidate.contentDocument!.head.querySelector(
            "#yukicoder-ko-MathJax-CHTML-styles",
          ),
          scripts: candidate.contentDocument!.querySelectorAll("script").length,
          mode: candidate.contentDocument!.compatMode,
        };
      });
      assert.equal(results.reference.length, 3);
      assert.deepEqual(results.imageSizes, [
        [32, 16],
        [32, 16],
        [32, 16],
      ]);
      assert.equal(results.svgExecuted, false);
      assert.equal(results.candidate.length, 3);
      for (let i = 0; i < results.reference.length; i++) {
        assert.ok(results.reference[i].height > 0);
        assert.ok(
          Math.abs(results.reference[i].height - results.candidate[i].height) <
            0.1,
          JSON.stringify(results),
        );
        assert.ok(
          Math.abs(results.reference[i].width - results.candidate[i].width) <
            0.1,
          JSON.stringify(results),
        );
      }
      assert.ok(loadedFonts.size > 0);
      assert.equal(results.stagingCount, 0);
      assert.equal(results.css, true);
      assert.equal(results.scripts, 0);
      assert.equal(results.mode, "CSS1Compat");
      t.diagnostic(
        JSON.stringify({ ...results, fontsLoaded: [...loadedFonts] }),
      );
    } finally {
      await browser.close();
    }
  },
);
