import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, readFileSync } from "node:fs";
import { JSDOM } from "jsdom";
import { convertProblemHtmlToMarkdown } from "../src/convert-problem-html-to-mdx.ts";
import { compileProblemMarkdown } from "translation-core/problem-markdown";
import { conversionSemantics } from "../src/problem-conversion-rules.ts";
import { labelPublishedProblem } from "../src/problem-publication.ts";
const wrap = (content: string) =>
  `<!doctype html><title>[기계 번역] No.1 Fixture</title><main data-yukicoder-ko-problem data-schema-version="1" data-locale="ko" data-problem-no="1" data-problem-id="17" data-source-title="Fixture" data-source-html-sha256="${"a".repeat(64)}" data-review-status="unreviewed"><h3>[기계 번역] No.1 Fixture</h3><div class="problem-statement"><div class="block"><h4>Statement</h4>${content}</div></div></main>`;
test("conversion and publication reject explicit incompatible markup without stamping unknown HTML", () => {
  const html = wrap("<pre><code>$literal$</code></pre>");
  for (const version of ["1", "3"]) {
    const incompatible = html.replace(
      "data-yukicoder-ko-problem",
      `data-yukicoder-ko-problem data-render-markup-version="${version}"`,
    );
    assert.throws(
      () => convertProblemHtmlToMarkdown(incompatible),
      /Unsupported problem render markup/,
    );
    assert.throws(
      () => labelPublishedProblem(incompatible),
      /Unsupported problem render markup/,
    );
  }
  assert.doesNotMatch(
    labelPublishedProblem(html),
    /data-render-markup-version/,
  );
  const compiled = compileProblemMarkdown(convertProblemHtmlToMarkdown(html));
  assert.match(
    labelPublishedProblem(compiled),
    /data-render-markup-version="2"/,
  );
  assert.equal(
    JSDOM.fragment(compiled).querySelector("pre > code")?.textContent,
    "$literal$",
  );
});
test("legacy conversion retains supported semantics and exact sample whitespace", () => {
  const html = wrap(
    '<p>Value x<sup>2</sup> and a<sub>i</sub>, formula $N_i$. <a href="https://yukicoder.me/">Source</a><img src="data:image/png;base64,AAAA" alt="diagram"></p><table><tr><th>A</th><th>B</th></tr><tr><td>0</td><td>1</td></tr></table><div class="sample" data-file="a.txt"><h5>Sample</h5><div class="paragraph"><h6>Input</h6><pre><code>\n\n#### literal\n1 \n</code></pre><h6>Output</h6><pre>2\n</pre></div></div>',
  );
  const mdx = convertProblemHtmlToMarkdown(html);
  const result = new JSDOM(compileProblemMarkdown(mdx)).window.document;
  assert.match(mdx, /\^\{\\text\{2\}\}/);
  assert.match(mdx, /_\{\\text\{i\}\}/);
  assert.match(mdx, /\$N_i\$/);
  assert.equal(
    result.querySelector("img")!.getAttribute("src"),
    "data:image/png;base64,AAAA",
  );
  assert.equal(
    result.querySelector("a")!.getAttribute("href"),
    "https://yukicoder.me/",
  );
  assert.deepEqual(
    [...result.querySelectorAll("td")].map((td) => td.textContent),
    ["0", "1"],
  );
  assert.equal(
    result.querySelector(".sample pre")!.textContent,
    "\n\n#### literal\n1 \n",
  );
});
for (const unsupported of [
  '<p><video src="x"></video></p>',
  '<table><tr><td colspan="2">x</td></tr></table>',
  "Unwrapped prose",
  '<p style="color:red">Text</p>',
]) {
  test(`conversion rejects unsupported content: ${unsupported}`, () =>
    assert.throws(
      () => convertProblemHtmlToMarkdown(wrap(unsupported)),
      /Unsupported/,
    ));
}

test("conversion preserves direct sample prose, inline links and withdrawn conditions", () => {
  const source = wrap(
    '<p><del>Withdrawn condition</del> and <s>old rule</s>.</p><div class="sample" data-file=""><h5>Example</h5><div class="paragraph"><h6>Input</h6><pre>1\n</pre><h6>Output</h6><pre>2\n</pre>Explanation with <a href="https://yukicoder.me/">a source</a> and x<sup>2</sup>.</div></div>',
  );
  const result = new JSDOM(
    compileProblemMarkdown(convertProblemHtmlToMarkdown(source)),
  ).window.document;
  assert.deepEqual(
    [...result.querySelectorAll("s")].map((node) => node.textContent),
    ["Withdrawn condition", "old rule"],
  );
  assert.match(
    result.querySelector(".sample")!.textContent!,
    /Explanation with a source and/,
  );
  assert.equal(
    result.querySelector(".sample a")!.getAttribute("href"),
    "https://yukicoder.me/",
  );
  assert.deepEqual(
    [...result.querySelectorAll(".sample pre")].map((node) => node.textContent),
    ["1\n", "2\n"],
  );
});

test("unsupported constructs inside a sample are rejected instead of being dropped", () => {
  assert.throws(
    () =>
      convertProblemHtmlToMarkdown(
        wrap(
          '<div class="sample" data-file=""><h5>Example</h5><div class="paragraph"><h6>Input</h6><pre>1\n</pre><video>Unsupported explanation</video></div></div>',
        ),
      ),
    /Unsupported/,
  );
});

test("conversion preserves br-separated sample data through the converter DOM", () => {
  const source = wrap(
    '<div class="sample" data-file=""><h5>Example</h5><div class="paragraph"><h6>Input</h6><pre>1<br>2<br></pre><h6>Output</h6><pre>3<br></pre></div></div>',
  );
  const dom = new JSDOM(
    compileProblemMarkdown(convertProblemHtmlToMarkdown(source)),
  );
  try {
    assert.deepEqual(
      [...dom.window.document.querySelectorAll(".sample pre")].map(
        (pre) => pre.textContent,
      ),
      ["1\n2\n", "3\n"],
    );
  } finally {
    dom.window.close();
  }
});

test("PRE round trips preserve every blank line, optional CODE, and empty content", () => {
  for (const code of [false, true]) {
    for (const content of [
      "",
      "\n",
      "\n\n",
      "x",
      "x\n",
      "\n\nx\n\n\n",
      "  x  \n",
      "```\n~~~\n::::\n$ x_i $\n",
    ]) {
      const pre = code
        ? `<pre><code>${content}</code></pre>`
        : `<pre>\n${content}</pre>`;
      const original = new JSDOM(wrap(pre));
      const mdx = convertProblemHtmlToMarkdown(wrap(pre));
      const compiled = new JSDOM(compileProblemMarkdown(mdx));
      assert.equal(
        compiled.window.document.querySelector("pre")!.textContent,
        content,
      );
      assert.equal(
        !!compiled.window.document.querySelector("pre > code"),
        code,
      );
      assert.deepEqual(
        conversionSemantics(compiled.window.document.body),
        conversionSemantics(original.window.document.body),
      );
      original.window.close();
      compiled.window.close();
    }
  }
});

test("conversion retains nested ignore/process scopes over both prose and PRE", () => {
  const original = wrap(
    '<div class="tex2jax_ignore"><p>$ ignored_i $ and <code>$literal$</code></p><pre>\n\n$ data_i $\n::::\n</pre><div class="tex2jax_process"><p>$ processed_i $</p><pre class="tex2jax_ignore"><code class="tex2jax_process">\n$x$</code></pre></div></div>',
  );
  const mdx = convertProblemHtmlToMarkdown(original);
  const source = new JSDOM(original);
  const compiled = new JSDOM(compileProblemMarkdown(mdx));
  assert.match(mdx, /::::: tex2jax_ignore/);
  assert.deepEqual(
    conversionSemantics(compiled.window.document.body),
    conversionSemantics(source.window.document.body),
  );
  source.window.close();
  compiled.window.close();
});

test("conversion refuses unsupported code or scope loss", () => {
  for (const content of [
    "<pre>prefix<code>$x$</code></pre>",
    "<pre><strong>$x$</strong></pre>",
    '<p><code class="tex2jax_process">$x$</code></p>',
    '<blockquote class="tex2jax_ignore"><p>$x$</p></blockquote>',
    "<p><code></code></p>",
  ]) {
    assert.throws(
      () => convertProblemHtmlToMarkdown(wrap(content)),
      /Unsupported|round-trip/,
    );
  }
});

for (const no of [
  97, 304, 305, 1386, 1388, 1440, 2069, 2534, 2740, 2787, 2909,
]) {
  const path = new URL(
    `../../../data/problems-source/${no}.html`,
    import.meta.url,
  );
  test(
    `source No.${no} PRE structure survives conversion without math inference`,
    { skip: !existsSync(path) },
    () => {
      const source = JSDOM.fragment(readFileSync(path, "utf8"));
      for (const pre of source.querySelectorAll("pre")) {
        const html = wrap(pre.outerHTML);
        const original = JSDOM.fragment(html);
        const result = JSDOM.fragment(
          compileProblemMarkdown(convertProblemHtmlToMarkdown(html)),
        );
        assert.deepEqual(
          conversionSemantics(result.querySelector("main")!),
          conversionSemantics(original.querySelector("main")!),
        );
      }
    },
  );
}

for (const no of [87, 2906, 2908, 8117]) {
  const path = new URL(
    `../../../data/problems-source/${no}.html`,
    import.meta.url,
  );
  test(
    `source No.${no} explicit TeX scopes survive conversion`,
    { skip: !existsSync(path) },
    () => {
      const source = JSDOM.fragment(readFileSync(path, "utf8"));
      for (const scope of source.querySelectorAll(
        ".tex2jax_ignore,.tex2jax_process",
      )) {
        const html = wrap(scope.outerHTML);
        const original = JSDOM.fragment(html);
        const result = JSDOM.fragment(
          compileProblemMarkdown(convertProblemHtmlToMarkdown(html)),
        );
        assert.deepEqual(
          conversionSemantics(result.querySelector("main")!),
          conversionSemantics(original.querySelector("main")!),
        );
      }
    },
  );
}
