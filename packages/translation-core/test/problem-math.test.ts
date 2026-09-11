import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import { build } from "esbuild";
import {
  SITE_KATEX,
  SITE_MATHJAX,
  detectProblemRenderProfile,
} from "../src/problem-render-profile.ts";
import { resolveProblemUrls } from "../src/problem-urls.ts";

// Run in a browser realm: KaTeX auto-render uses its realm's global document.
const bundle = (
  await build({
    stdin: {
      contents:
        'import {renderProblemMath} from "./packages/translation-core/src/problem-math.ts"; import {prepareTranslatedBlocks} from "./packages/translation-core/src/problem-rendering.ts"; window.renderMath = renderProblemMath; window.prepareBlocks = prepareTranslatedBlocks;',
      resolveDir: process.cwd(),
    },
    bundle: true,
    write: false,
    format: "iife",
    platform: "browser",
  })
).outputFiles[0].text;
const cases = [
  ["bare pre", "<pre>$HOME USER$</pre>", 1, 1],
  ["actual code child", "<pre><code>$HOME USER$</code></pre>", 0, 0],
  ["sample math", '<div class="sample"><pre>$N$</pre></div>', 1, 1],
  ["ignored", '<div class="tex2jax_ignore"><pre>$N$</pre></div>', 0, 0],
  [
    "process override",
    '<div class="tex2jax_ignore"><p class="tex2jax_process">$N$</p></div>',
    0,
    1,
  ],
  ["mixed lines", "<pre>$N$\nplain text</pre>", 1, 1],
  ["embedded break", "<p>$a<br>b$</p>", 0, 1],
  ["heading", "<h3>No.2025 $k$ title</h3>", 1, 1],
] as const;
for (const profile of [SITE_KATEX, SITE_MATHJAX]) {
  for (const [label, html, katex, mathjax] of cases) {
    test(`${profile.engine} follows site's ${label} behavior`, async () => {
      const dom = new JSDOM(
        `<!doctype html><body><p id="outside">$OUTSIDE$</p><main>${html}</main></body>`,
        { runScripts: "outside-only" },
      );
      try {
        dom.window.eval(bundle);
        const root = dom.window.document.querySelector<HTMLElement>("main")!;
        await (
          dom.window as unknown as {
            renderMath: (
              root: HTMLElement,
              profile: typeof SITE_KATEX,
            ) => Promise<void>;
          }
        ).renderMath(root, profile);
        assert.equal(
          root.querySelectorAll(
            profile.engine === "katex" ? ".katex" : "mjx-container",
          ).length,
          profile.engine === "katex" ? katex : mathjax,
        );
        assert.equal(
          dom.window.document.querySelector("#outside")?.innerHTML,
          "$OUTSIDE$",
        );
      } finally {
        dom.window.close();
      }
    });
  }
}
test("KaTeX keeps rejected TeX literal just as site auto-render does", async () => {
  const dom = new JSDOM("<!doctype html><main>$\\undefinedcommand{x}$</main>", {
    runScripts: "outside-only",
  });
  try {
    dom.window.eval(bundle);
    const root = dom.window.document.querySelector<HTMLElement>("main")!;
    await (dom.window as any).renderMath(root, SITE_KATEX);
    assert.equal(root.textContent, "$\\undefinedcommand{x}$");
    assert.equal(root.querySelector(".katex-error"), null);
  } finally {
    dom.window.close();
  }
});
test("MathJax never retypesets its assistive MathML or leaks macros across previews", async () => {
  const dom = new JSDOM(
    "<!doctype html><main>$\\gdef\\localMacro{X}\\localMacro$ $\\cancel{x}$</main><aside>$\\localMacro$</aside>",
    { runScripts: "outside-only" },
  );
  try {
    dom.window.eval(bundle);
    const render = (dom.window as any).renderMath;
    const root = dom.window.document.querySelector("main")!;
    await render(root, SITE_MATHJAX);
    const before = root.innerHTML;
    await render(root, SITE_MATHJAX);
    assert.equal(root.innerHTML, before);
    assert.equal(root.querySelectorAll("mjx-container").length, 2);
    const aside = dom.window.document.querySelector("aside")!;
    await render(aside, SITE_MATHJAX);
    assert.ok(aside.textContent?.includes("localMacro"));
    assert.equal(
      dom.window.document.querySelectorAll("#yukicoder-ko-MathJax-CHTML-styles")
        .length,
      1,
    );
  } finally {
    dom.window.close();
  }
});
test("MathJax preparation measures in a hidden connected scope and cleans it up", async () => {
  const dom = new JSDOM(
    '<!doctype html><main id="content"><p>Original $N$</p></main>',
    { runScripts: "outside-only" },
  );
  try {
    dom.window.eval(bundle);
    const document = dom.window.document;
    const host = document.querySelector<HTMLElement>("main")!;
    const before = host.innerHTML;
    const observed: Node[] = [];
    const observer = new dom.window.MutationObserver((records) => {
      for (const record of records) observed.push(...record.addedNodes);
    });
    observer.observe(host, { childList: true });
    const source = document.createElement("div");
    source.innerHTML = '<div class="block">$\\frac{a}{b}$</div>';
    const result = await (dom.window as any).prepareBlocks(
      [...source.children],
      {
        document,
        profile: SITE_MATHJAX,
        renderHost: host,
      },
    );
    observer.disconnect();
    const staging = observed.find((node) =>
      (node as HTMLElement).hasAttribute?.("data-yukicoder-ko-render-staging"),
    ) as HTMLElement;
    assert.ok(staging);
    assert.equal(staging.style.visibility, "hidden");
    assert.equal(staging.hasAttribute("inert"), true);
    assert.equal(staging.isConnected, false);
    assert.equal(host.innerHTML, before);
    assert.equal(result[0].isConnected, false);
    assert.equal(result[0].querySelectorAll("mjx-container").length, 1);
  } finally {
    dom.window.close();
  }
});
test("renderer selection uses page scripts, rejects unknowns and never guesses by age", () => {
  for (const [script, expected] of [
    ["mathjax@3/es5/tex-mml-chtml.js", SITE_MATHJAX],
    ["katex@0.17.0/dist/katex.min.js", SITE_KATEX],
    ["katex@9/dist/katex.min.js", undefined],
  ] as const) {
    const dom = new JSDOM(
      `<script src="https://cdn.jsdelivr.net/npm/${script}"></script>`,
    );
    assert.deepEqual(detectProblemRenderProfile(dom.window.document), expected);
    dom.window.close();
  }
  for (const extra of [
    "katex@9/dist/katex.min.js",
    "mathjax@4/tex-mml-chtml.js",
    "mathjax@3/es5/tex-mml-chtml.js",
  ]) {
    const dom = new JSDOM(
      `<script src="https://cdn.jsdelivr.net/npm/katex@0.17.0/dist/katex.min.js"></script><script src="https://cdn.jsdelivr.net/npm/${extra}"></script>`,
    );
    assert.equal(detectProblemRenderProfile(dom.window.document), undefined);
    dom.window.close();
  }
  const unknownWithMetadata = new JSDOM(
    '<meta name="yukicoder-ko-math-engine" content="katex"><meta name="yukicoder-ko-math-version" content="0.17.0"><script src="/katex.min.js"></script>',
  );
  assert.equal(
    detectProblemRenderProfile(unknownWithMetadata.window.document),
    undefined,
  );
  unknownWithMetadata.window.close();
});
test("fragment links stay local and other relative resources use original problem URL", () => {
  const dom = new JSDOM(
    '<main><a href="#note">note</a><a href="?x=1">query</a><img src="../image.png"><a href="javascript:alert(1)">bad</a></main>',
  );
  const root = dom.window.document.querySelector("main")!;
  resolveProblemUrls(root, "https://yukicoder.me/problems/no/204");
  assert.equal(root.querySelector("a")?.getAttribute("href"), "#note");
  assert.equal(
    root.querySelectorAll("a")[1].getAttribute("href"),
    "https://yukicoder.me/problems/no/204?x=1",
  );
  assert.equal(
    root.querySelector("img")?.getAttribute("src"),
    "https://yukicoder.me/problems/image.png",
  );
  assert.equal(root.querySelectorAll("a")[2].hasAttribute("href"), false);
  dom.window.close();
});
