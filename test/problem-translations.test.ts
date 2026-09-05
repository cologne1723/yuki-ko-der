import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import test from "node:test";
import { JSDOM } from "jsdom";
import { compileProblemMarkdown } from "../src/problem-markdown.ts";
import "../src/problem-translations.ts";

const api = global.yukicoderProblemTranslations.testApi;

function installRemoteLoader(fetchResponse, cachedHtml) {
  const dom = new JSDOM("", {
    url: "https://yukicoder.me/problems/no/1",
    runScripts: "outside-only",
  });
  const cache = new Map(
    cachedHtml ? [["problem-translation-html:ko:1", cachedHtml]] : [],
  );
  const requests = [];
  dom.window.browser = {
    storage: {
      local: {
        get: async (key) => ({ [key]: cache.get(key) }),
        set: async (entries) =>
          Object.entries(entries).forEach(([key, value]) =>
            cache.set(key, value),
          ),
        remove: async (key) => cache.delete(key),
      },
    },
  };
  dom.window.fetch = async (url, options) => {
    requests.push({ url, options });
    if (fetchResponse instanceof Error) throw fetchResponse;
    return fetchResponse;
  };
  dom.window.eval(readFileSync("dist/src/problem-translations.js", "utf8"));
  return {
    dom,
    cache,
    requests,
    load: dom.window.yukicoderProblemTranslations.testApi
      .loadTranslationDocument,
  };
}

test("Pages HTML is fetched without credentials and cached for network outages", async () => {
  const html = compileProblemMarkdown(
    readFileSync("problem-translations/ko/problems/1.mdx", "utf8"),
  );
  const remote = installRemoteLoader({
    ok: true,
    status: 200,
    text: async () => html,
  });
  try {
    const translation = await remote.load(
      "https://cologne1723.github.io/yuki-ko-der/",
      1,
      "17",
    );
    assert.equal(translation.root.dataset.problemNo, "1");
    assert.equal(
      remote.requests[0].url,
      "https://cologne1723.github.io/yuki-ko-der/ko/problems/1.html",
    );
    assert.equal(remote.requests[0].options.credentials, "omit");
    assert.equal(remote.cache.get("problem-translation-html:ko:1"), html);
  } finally {
    remote.dom.window.close();
  }
  const offline = installRemoteLoader(new Error("offline"), html);
  try {
    assert.equal(
      (
        await offline.load(
          "https://cologne1723.github.io/yuki-ko-der/",
          1,
          "17",
        )
      ).root.dataset.problemNo,
      "1",
    );
  } finally {
    offline.dom.window.close();
  }
});

test("removed Pages translations are deleted from cache and never reused", async () => {
  const html = compileProblemMarkdown(
    readFileSync("problem-translations/ko/problems/1.mdx", "utf8"),
  );
  for (const status of [404, 410]) {
    const remote = installRemoteLoader({ ok: false, status }, html);
    try {
      assert.equal(
        await remote.load(
          "https://cologne1723.github.io/yuki-ko-der/",
          1,
          "17",
        ),
        undefined,
      );
      assert.equal(remote.cache.size, 0);
    } finally {
      remote.dom.window.close();
    }
  }
});

function installDom(html) {
  const dom = new JSDOM(html, { url: "https://yukicoder.me/problems/no/1" });
  global.document = dom.window.document;
  global.Node = dom.window.Node;
  global.NodeFilter = dom.window.NodeFilter;
  global.DOMParser = dom.window.DOMParser;
  return dom;
}

test("SHA-256 hashes exact response bytes", async () => {
  const bytes = new TextEncoder().encode("yukicoder");
  assert.equal(
    await api.sha256Hex(bytes),
    "d568d08dd8800dfdcb2727a6cfd19e9f99e42988fff5ab60f9e8f411b63017fc",
  );
});

test("semantic comparison treats rendered KaTeX as raw formula source", () => {
  installDom("<div></div>");
  const raw = api.parseHtml(
    '<div class="block"><p>町\\( N \\)です。</p></div>',
  );
  const rendered = api.parseHtml(
    '<div class="block"><p>町<span class="katex"><annotation encoding="application/x-tex">N</annotation></span>です。</p></div>',
  );
  assert.equal(
    api.semanticStatement([raw.querySelector(".block")]),
    api.semanticStatement([rendered.querySelector(".block")]),
  );
});

test("dollar-delimited TeX matches source delimiters and digit grouping", () => {
  installDom("<div></div>");
  const source = api.parseHtml(
    '<div class="block"><p>町\\(N\\)</p><pre>\\(1000\\)\n</pre></div>',
  );
  const translated = api.parseHtml(
    '<div class="block"><p>$N$번 마을</p><pre>$1\\,000$\n</pre></div>',
  );
  assert.equal(
    api.structuralStatement([source.querySelector(".block")]),
    api.structuralStatement([translated.querySelector(".block")]),
  );
});

test("whole translated HTML must preserve protected structure and sample data", () => {
  installDom("<div></div>");
  const source = api.parseHtml(
    '<div class="block"><p>町\\(N\\)</p><pre>1\n2\n</pre></div>',
  );
  const valid = api.parseHtml(
    '<div class="block"><p>마을 \\(N\\)</p><pre>1\n2\n</pre></div>',
  );
  const changed = api.parseHtml(
    '<div class="block"><p>마을 \\(N\\)</p><pre>1\n3\n</pre></div>',
  );
  assert.equal(
    api.structuralStatement([source.querySelector(".block")]),
    api.structuralStatement([valid.querySelector(".block")]),
  );
  assert.notEqual(
    api.structuralStatement([source.querySelector(".block")]),
    api.structuralStatement([changed.querySelector(".block")]),
  );
});

test("No.1 MDX compiles to one translation with verification metadata", () => {
  installDom("<div></div>");
  const source = readFileSync("problem-translations/ko/problems/1.mdx", "utf8");
  const html = compileProblemMarkdown(source);
  const translation = api.parseTranslationDocument(html, 1, "17");
  assert.equal(translation.root.dataset.sourceTitle, "道のショートカット");
  assert.match(translation.root.dataset.sourceHtmlSha256, /^[a-f0-9]{64}$/u);
  assert.equal(
    translation.blocks.length,
    (source.match(/^##[ \t]+/gmu) ?? []).length,
  );
  assert.equal(
    translation.title.textContent.startsWith("[기계 번역]"),
    source.includes("reviewStatus: machine"),
  );
});

test("whole HTML replacement is atomic and preserves rendered formulas", () => {
  installDom(`
    <main id="content"><h3>Original</h3>
      <div class="block"><p>町<span class="katex"><annotation encoding="application/x-tex">N</annotation></span>です。</p><pre>1\n</pre></div>
    </main>
  `);
  const canonical = api.parseHtml(
    '<div class="block"><p>町\\(N\\)です。</p><pre>1\n</pre></div>',
  );
  const translatedHtml = `
    <main data-yukicoder-ko-problem data-schema-version="1" data-locale="ko"
      data-problem-no="1" data-problem-id="17" data-source-title="Title"
      data-source-html-sha256="${"a".repeat(64)}">
      <h3>(!)Title</h3><div class="problem-statement">
        <div class="block"><p>마을 \\(N\\)입니다.</p><pre>1\n</pre></div>
      </div>
    </main>
  `;
  const translation = api.parseTranslationDocument(translatedHtml, 1, "17");
  const liveTitle = document.querySelector("#content > h3");
  const liveBlocks = [...document.querySelectorAll("#content > .block")];
  const apply = api.prepareReplacement(translation, liveTitle, liveBlocks, [
    canonical.querySelector(".block"),
  ]);
  assert.equal(liveTitle.textContent, "Original");
  apply();
  assert.equal(liveTitle.textContent, "(!)Title");
  assert.equal(document.querySelectorAll("#content .katex").length, 1);
  assert.equal(document.querySelector("#content pre").textContent, "1\n");
});
