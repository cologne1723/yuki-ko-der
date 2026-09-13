import { sourceCorrectionFixture } from "./source-correction-fixture.ts";
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";
import katex from "katex";
import { compileProblemMarkdown } from "../src/problem-markdown.ts";
import {
  preservationErrors,
  statementFormulas,
  checkProblemPreservation,
} from "../src/problem-preservation.ts";
import { SITE_KATEX, SITE_MATHJAX } from "../src/problem-render-profile.ts";
import {
  sourceFormulaCorrections,
  sourceBinaryLiteralFormulas,
} from "../src/problem-source-corrections-node.ts";

const fixture = readFileSync("problem-translations/ko/problems/1.mdx", "utf8");
const front = fixture.slice(0, fixture.indexOf("## "));

test("query-subscript and empty-set source corrections cannot waive other formula changes", () => {
  for (const no of [3553, 3582]) {
    const original = sourceCorrectionFixture(no);
    const corrections = sourceFormulaCorrections(no, original);
    assert.equal(corrections.length, no === 3553 ? 1 : 3);
    assert.deepEqual(sourceFormulaCorrections(no + 1, original), []);
    assert.deepEqual(sourceFormulaCorrections(no, original + "\n"), []);
    for (const correction of corrections) {
      assert.notEqual(correction.before, correction.after);
      const source = new JSDOM("<p>$" + correction.before + "$</p>");
      try {
        for (const [formula, evidence, passes] of [
          [correction.after, [correction], true],
          [correction.before, [correction], false],
          [correction.after, [], false],
          [correction.after.replaceAll("\\{", "{"), [correction], false],
          [correction.after + "+1", [correction], false],
        ] as const) {
          const target = new JSDOM("<p>$" + formula + "$</p>");
          try {
            assert.equal(
              preservationErrors(
                source.window.document,
                target.window.document,
                SITE_KATEX,
                evidence,
              ).length === 0,
              passes,
            );
          } finally {
            target.window.close();
          }
        }
      } finally {
        source.window.close();
      }
    }
  }
});

test("snapshot-bound binary literal formulas preserve digits without exempting other integers", () => {
  const original = sourceCorrectionFixture(3009);
  const literals = sourceBinaryLiteralFormulas(3009, original);
  assert.equal(literals.length, 3);
  assert.deepEqual(sourceBinaryLiteralFormulas(3008, original), []);
  assert.deepEqual(sourceBinaryLiteralFormulas(3009, original + "\n"), []);
  const source = new JSDOM(literals.map((f) => "<p>$" + f + "$</p>").join(""));
  try {
    for (const [values, extra, evidence, passes] of [
      [literals, "", literals, true],
      [literals, "", [], false],
      [literals, "<p>$1111$</p>", literals, false],
      [literals, "<p>$N=1000$</p>", literals, false],
      [literals, "<p>$1111$ $N=1000$</p>", literals, false],
      [[literals[0], "111", literals[2]], "", literals, false],
      [
        [literals[0].replace("1001", "1000"), ...literals.slice(1)],
        "",
        literals,
        false,
      ],
      [[literals[0], String.raw`1\,111`, literals[2]], "", literals, false],
      [literals.slice(0, 2), "", literals, false],
      [literals, "", [...literals, "101010"], false],
    ] as const) {
      const target = new JSDOM(
        values.map((f) => "<p>$" + f + "$</p>").join("") + extra,
      );
      try {
        assert.equal(
          preservationErrors(
            source.window.document,
            target.window.document,
            SITE_KATEX,
            [],
            evidence,
          ).length === 0,
          passes,
        );
      } finally {
        target.window.close();
      }
    }
  } finally {
    source.window.close();
  }
});

test("existing explicit CODE fence preserves Python regex instead of rendering it as TeX", () => {
  const code = String.raw`pattern = re.compile(r"A\[(\-?\d+)\]$")`;
  const source = new JSDOM("<pre><code>" + code + "</code></pre>");
  try {
    for (const [info, passes] of [
      ['python html="code"', true],
      ["python", false],
    ] as const) {
      const md =
        front + "## 문제 설명\n\n" + "```" + info + "\n" + code + "\n```\n";
      const target = new JSDOM(compileProblemMarkdown(md));
      try {
        assert.equal(
          target.window.document.querySelector("pre")!.textContent,
          code + "\n",
        );
        assert.equal(
          preservationErrors(
            source.window.document,
            target.window.document,
            SITE_KATEX,
          ).length === 0,
          passes,
        );
      } finally {
        target.window.close();
      }
    }
  } finally {
    source.window.close();
  }
});

test("documented set corrections require exact source hash, number and occurrence", () => {
  const original = sourceCorrectionFixture(2911);
  const corrections = sourceFormulaCorrections(2911, original);
  assert.equal(corrections.length, 1);
  assert.deepEqual(sourceFormulaCorrections(2912, original), []);
  assert.deepEqual(sourceFormulaCorrections(2911, original + "\n"), []);
  const { before, after } = corrections[0];
  assert.deepEqual(
    [2, 3].filter((n) => [1, 2].includes(n)),
    [2],
  );
  const source = new JSDOM("<p>$" + before + "$</p>");
  try {
    for (const [formula, correspondence, passes] of [
      [after, corrections, true],
      [after, [], false],
      [before, corrections, false],
      [after.replace("= \\{2\\}", "= \\{3\\}"), corrections, false],
      [after.replace("\\cap", "\\cup"), corrections, false],
      [after.replace("\\{2\\}", "{2}"), corrections, false],
      [after, [{ ...corrections[0], occurrences: 2 }], false],
      [after, [corrections[0], corrections[0]], false],
    ] as const) {
      const target = new JSDOM("<p>$" + formula + "$</p>");
      try {
        assert.equal(
          preservationErrors(
            source.window.document,
            target.window.document,
            SITE_KATEX,
            correspondence,
          ).length === 0,
          passes,
        );
      } finally {
        target.window.close();
      }
    }
    const missing = new JSDOM("<p>$x$</p>");
    assert.ok(
      preservationErrors(
        missing.window.document,
        missing.window.document,
        SITE_KATEX,
        corrections,
      ).some((error) => error.includes("정정 근거 불일치")),
    );
    missing.window.close();
    const changed = new JSDOM(
      "<p>$" +
        after +
        '$ $1234$</p><a href="https://example.com/changed">x</a>',
    );
    const errors = preservationErrors(
      source.window.document,
      changed.window.document,
      SITE_KATEX,
      corrections,
    );
    assert.ok(errors.some((error) => error.includes("정수 서식")));
    assert.ok(errors.some((error) => error.includes("href")));
    changed.window.close();
  } finally {
    source.window.close();
  }
});

test("mobile sample-class branding does not hide wrapperless h5/h6 examples", () => {
  const source = new JSDOM(
    '<div class="block"><div class="sample"><h4>注釈</h4><b>brand</b></div><h4>入力</h4><pre>$N$</pre></div><div class="block"><h4>サンプル</h4><h5>サンプル1</h5><div class="paragraph"><h6>入力</h6><pre>1  2</pre><h6>出力</h6><pre>3</pre><p>説明</p><pre>worked prose</pre></div></div>',
  );
  try {
    for (const [input, output, file, passes] of [
      ["1  2", "3", "", true],
      ["1 2", "3", "", false],
      ["1  2", "4", "", false],
      ["3", "1  2", "", false],
      ["1  2", "3", "invented.txt", false],
    ] as const) {
      const target = new JSDOM(
        `<div class="sample" data-file="${file}"><h5>예제 1</h5><h6>입력</h6><pre>${input}</pre><h6>출력</h6><pre>${output}</pre></div>`,
      );
      assert.equal(
        preservationErrors(source.window.document, target.window.document)
          .length === 0,
        passes,
      );
      target.window.close();
    }
  } finally {
    source.window.close();
  }
});

test("resource comparison accepts Unicode URL serialization but not destination changes", () => {
  const url = "https://example.com/年齢?q=年#計算";
  const source = new JSDOM(`<a href="${url}">source</a>`);
  const encoded = new URL(url).href;
  try {
    for (const [href, passes] of [
      [encoded, true],
      [encoded.replace("q=", "r="), false],
      [encoded.replace("example.com", "other.example"), false],
      [encoded.replace("#", "/#"), false],
      ["https://example.com/a%2Fb", false],
    ] as const) {
      const target = new JSDOM(`<a href="${href}">번역</a>`);
      assert.equal(
        preservationErrors(source.window.document, target.window.document)
          .length === 0,
        passes,
      );
      target.window.close();
    }
    const a = new JSDOM('<a href="https://example.com/a%2Fb">a</a>');
    const b = new JSDOM('<a href="https://example.com/a/b">b</a>');
    assert.ok(preservationErrors(a.window.document, b.window.document).length);
    a.window.close();
    b.window.close();
  } finally {
    source.window.close();
  }
});

test("wrapperless source examples retain sample data and filename checks at document scope", () => {
  const source = new JSDOM(
    '<div class="block"><h4>サンプル</h4><p>サンプル1</p><p>Aliceの入力</p><pre>1  2</pre><p>Aliceの出力</p><pre>3</pre></div>',
  );
  try {
    for (const [file, value, ok] of [
      ["", "1  2", true],
      ["wrong.txt", "1  2", false],
      ["", "1 2", false],
    ] as const) {
      const translated = new JSDOM(
        `<div class="block"><div class="sample" data-file="${file}"><h6>입력</h6><pre>${value}</pre><h6>출력</h6><pre>3</pre></div></div>`,
      );
      try {
        assert.equal(
          preservationErrors(source.window.document, translated.window.document)
            .length === 0,
          ok,
        );
      } finally {
        translated.window.close();
      }
    }
  } finally {
    source.window.close();
  }
});

test("translated otherwise label preserves cases without hiding structural loss", () => {
  const tex = String.raw`f(a,b)=\left\{\begin{array}{cc}a\ \&\ b&(p(a)=p(b))\\0&(\text{otherwise})\end{array}\right.`;
  const translated = tex.replace("otherwise", "그 외");
  const source = new JSDOM("<p>$" + tex + "$</p>");
  try {
    for (const [formula, expected] of [
      [translated, 0],
      [translated.replace(String.raw`\left\{`, String.raw`\left.`), 1],
      [translated.replace("p(a)=p(b)", String.raw`p(a)\neq p(b)`), 1],
      [translated.replace("그 외", "항상"), 1],
    ] as const) {
      const target = new JSDOM("<p>$" + formula + "$</p>");
      try {
        assert.equal(
          preservationErrors(
            source.window.document,
            target.window.document,
          ).filter((error) => error.includes("집합 수식")).length,
          expected,
        );
      } finally {
        target.window.close();
      }
    }
  } finally {
    source.window.close();
  }
});

test("short comparison commands cannot silently become letter products", () => {
  for (const command of ["ge", "le"]) {
    const source = new JSDOM(`<p>$i \\${command} 0$</p>`);
    for (const [tex, expected] of [
      [`i ${command} 0`, true],
      [`i \\${command} 0`, false],
      ["large", false],
    ] as const) {
      const target = new JSDOM(`<p>$${tex}$</p>`);
      assert.equal(
        preservationErrors(source.window.document, target.window.document).some(
          (error) => error.includes("역슬래시 누락"),
        ),
        expected,
      );
      target.window.close();
    }
    source.window.close();
  }
});

test("doubled thin-space escaping is not accepted as a TeX line break", () => {
  const source = new JSDOM("<p>$998244353$</p>");
  const target = new JSDOM("<p>$998\\\\,244\\\\,353$</p>");
  assert.ok(
    preservationErrors(source.window.document, target.window.document).some(
      (error) => error.includes("역슬래시가 두 개"),
    ),
  );
  source.window.close();
  target.window.close();
});

test("prose repetitions of mathematical input rows are not code literals", () => {
  const source = new JSDOM("<p>source</p>");
  const target = new JSDOM(
    "<div class=block><h4>입력</h4><pre>$1\\ s\\ r$</pre></div><p><code>1 s r</code><code>4 3</code></p>",
  );
  assert.equal(
    preservationErrors(source.window.document, target.window.document).filter(
      (x) => x.includes("본문에서 인라인 코드"),
    ).length,
    1,
  );
  source.window.close();
  target.window.close();
});

test("collective vs individual choice must be explicit, not guessed by the checker", () => {
  const source = new JSDOM("<p>source</p>");
  for (const [text, count] of [
    ["모든 카드를 세 상자 중 하나에 넣습니다.", 1],
    ["모든 카드를 각각 세 상자 중 하나에 넣습니다.", 0],
    ["모든 카드를 세 상자 중 하나인 모두 같은 상자에 넣습니다.", 0],
  ] as const) {
    const target = new JSDOM(`<p>${text}</p>`);
    assert.equal(
      preservationErrors(source.window.document, target.window.document).length,
      count,
    );
    target.window.close();
  }
  source.window.close();
});

test("lost TeX command names fail even when KaTeX accepts letter products", () => {
  const source = new JSDOM(
    "<p>$1\\leq j\\leq9$ $\\displaystyle\\sum_i A_i$ $\\ldots$ $summary$</p>",
  );
  const target = new JSDOM(
    "<p>$1leq jleq9$ $displaystylesum_i A_i$ $ldots$ $summary$</p>",
  );
  assert.equal(
    preservationErrors(source.window.document, target.window.document).filter(
      (error) => error.includes("역슬래시 누락"),
    ).length,
    1,
  );
  assert.deepEqual(
    preservationErrors(source.window.document, source.window.document),
    [],
  );
  source.window.close();
  target.window.close();
});

test("math hidden in inline code is rejected, source code literals are exempt", () => {
  const source = new JSDOM("<p>$S$</p><code>$literal$</code>");
  const target = new JSDOM(
    "<code>$S$</code><code>$literal$</code><pre><code>$sample$</code></pre>",
  );
  assert.equal(
    preservationErrors(source.window.document, target.window.document).filter(
      (error) => error.includes("인라인 코드"),
    ).length,
    1,
  );
  source.window.close();
  target.window.close();
});

test("explicit ignored source examples are literals, but process overrides are not", () => {
  const source = new JSDOM(
    '<p class="tex2jax_ignore">$2015 \\le N$ <span class="tex2jax_process">$active$</span></p>',
  );
  const target = new JSDOM(
    "<code>$2\\,015 \\le N$</code><code>$active$</code>",
  );
  try {
    for (const profile of [undefined, SITE_MATHJAX, SITE_KATEX]) {
      const errors = preservationErrors(
        source.window.document,
        target.window.document,
        profile,
      ).filter((error) => error.includes("본문 수식을 인라인 코드"));
      assert.equal(errors.length, profile?.engine === "katex" ? 0 : 1);
      if (errors.length) assert.match(errors[0], /active/);
    }
  } finally {
    source.window.close();
    target.window.close();
  }
});

test("standalone large integers use thin spaces, without reformatting sample literals", () => {
  const source = new JSDOM("<p>source</p>");
  for (const [formula, bad] of [
    ["998244353", true],
    ["90+89010=89100", true],
    [String.raw`90+89\,010=89\,100`, false],
    ["998,244,353", true],
    [String.raw`998\,244\,353`, false],
    ["000002", false],
    ["1110_{(2)}", false],
    ["11111_{(2)}", false],
    ["7654_{(8)}", false],
    ["1110_{(2)}+1110", true],
    ["1110_{(10)}", true],
    ["1234_{(2)}", true],
    ["1110_i", true],
    ["1,2,3", false],
  ] as const) {
    const dom = new JSDOM(`<p>$${formula}$</p>`);
    assert.equal(
      preservationErrors(source.window.document, dom.window.document).some(
        (error) => error.includes("정수 서식"),
      ),
      bad,
    );
    dom.window.close();
  }
  source.window.close();
});

test("worked explanations are translatable, but headed sample IO remains protected", () => {
  const source = new JSDOM(
    '<div class="sample"><h6>入力</h6><pre>1</pre><h6>出力</h6><pre>2</pre><p>説明</p><pre>手順1: $a=1$</pre></div>',
  );
  const translated = new JSDOM(
    '<div class="sample"><h6>입력</h6><pre>1</pre><h6>출력</h6><pre>2</pre><p>설명</p><p>단계 1: $a=1$</p></div>',
  );
  assert.deepEqual(
    preservationErrors(source.window.document, translated.window.document),
    [],
  );
  translated.window.document.querySelector("pre")!.textContent = "3";
  assert.ok(
    preservationErrors(source.window.document, translated.window.document).some(
      (e) => e.includes("입출력"),
    ),
  );
  source.window.close();
  translated.window.close();
});

test("main sections follow translation order regardless of original order", () => {
  const source = new JSDOM("<p>source</p>");
  const dom = new JSDOM(
    compileProblemMarkdown(
      front + "## 문제 설명\n\n본문\n\n## 제한\n\n제한\n\n## 입력\n\n입력\n",
    ),
  );
  assert.ok(
    preservationErrors(source.window.document, dom.window.document).some(
      (error) => error.includes("절 순서"),
    ),
  );
  source.window.close();
  dom.window.close();
});

test("multiline TeX survives Markdown, including row separators and visible braces", () => {
  const formulas = [
    String.raw`\{a,b\}`,
    String.raw`\frac{a_1}{b_{2}}`,
    String.raw`\begin{cases}
1 & (k=1)\\
2 & (k>1)
\end{cases}`,
    String.raw`\begin{aligned}
a&=1\\
b&=2
\end{aligned}`,
  ];
  for (const formula of formulas) {
    const body = "$\n" + formula + "\n$";
    const dom = new JSDOM(
      compileProblemMarkdown(front + "## 문제 설명\n\n" + body + "\n"),
    );
    assert.equal(
      dom.window.document.querySelector(".block p")!.textContent,
      body,
    );
    const rendered = new JSDOM(
      katex.renderToString(formula, { throwOnError: true }),
    );
    if (formula.includes("\\{"))
      assert.match(
        rendered.window.document.querySelector(".katex-html")!.textContent!,
        /\{a,b\}/,
      );
    dom.window.close();
    rendered.window.close();
  }
});

test("set loss fails even though KaTeX accepts grouping; normal fractions are not sets", () => {
  const original = new JSDOM(String.raw`<p>$\{a,b\}$ $\frac{a_1}{b_2}$</p>`);
  const good = new JSDOM(String.raw`<p>$\{a, b\}$ $\frac{a_1}{b_2}$</p>`);
  const bad = new JSDOM("<p>${a,b}$ $\\frac{a_1}{b_2}$</p>");
  assert.doesNotThrow(() =>
    katex.renderToString("{a,b}", { throwOnError: true }),
  );
  assert.deepEqual(
    preservationErrors(original.window.document, good.window.document),
    [],
  );
  assert.equal(
    preservationErrors(original.window.document, bad.window.document).length,
    1,
  );
  [original, good, bad].forEach((dom) => dom.window.close());
});

test("samples ignore one final LF, not zero deletion, blank lines, spaces or filenames", () => {
  const html = (value: string, file = "") =>
    `<div class="sample" data-file="${file}"><pre><code>${value}</code></pre></div>`;
  const source = new JSDOM(html("$literal$\n0 0  \n"));
  for (const [value, file, passes] of [
    ["$literal$\n0 0  ", "", true],
    ["$literal$\n0  \n", "", false],
    ["$literal$\n0 0\n", "", false],
    ["$literal$\n0 0  \n\n", "", false],
    ["$literal$\n0 0  \n", "invented.txt", false],
  ] as const) {
    const translated = new JSDOM(html(value, file));
    assert.equal(
      preservationErrors(source.window.document, translated.window.document)
        .length === 0,
      passes,
    );
    translated.window.close();
  }
  source.window.close();
});

test("engine scanners preserve DOM boundaries and their own BR/comment behavior", () => {
  const dom = new JSDOM(
    "<p>$left</p><p>right$</p><p>$a<br>b$</p><p>$c<!-- comment -->d$</p><p>$e<span>middle</span>f$</p><pre>$ bare_i $</pre><code>$code_i$</code>",
  );
  const before = dom.serialize();
  assert.deepEqual(statementFormulas(dom.window.document, SITE_KATEX), [
    " bare_i ",
  ]);
  assert.deepEqual(statementFormulas(dom.window.document, SITE_MATHJAX), [
    "a\nb",
    "cd",
    " bare_i ",
  ]);
  assert.deepEqual(statementFormulas(dom.window.document), [" bare_i "]);
  assert.equal(dom.serialize(), before);
  dom.window.close();
});

test("KaTeX joins adjacent text nodes but never text across skipped elements", () => {
  const dom = new JSDOM("<p></p><p>$a<code>not math</code>b$</p>");
  dom.window.document.querySelector("p")!.append("$", "x_i", "$");
  assert.deepEqual(statementFormulas(dom.window.document, SITE_KATEX), ["x_i"]);
  assert.deepEqual(statementFormulas(dom.window.document, SITE_MATHJAX), [
    "x_i",
  ]);
  dom.window.close();
});

test("MathJax process overrides ignore/CODE, while KaTeX keeps the ignored subtree literal", () => {
  const dom = new JSDOM(
    '<div class="tex2jax_ignore">$ignored$<p class="tex2jax_process">$processed$</p><pre>$ignored_pre$</pre></div><code class="tex2jax_process">$code_override$</code><pre><code>$code$</code></pre>',
  );
  assert.deepEqual(statementFormulas(dom.window.document, SITE_KATEX), []);
  assert.deepEqual(statementFormulas(dom.window.document, SITE_MATHJAX), [
    "processed",
    "code_override",
  ]);
  dom.window.close();
});

test("only raw sample IO is excluded, and removing its text does not join neighboring formulas", () => {
  const dom = new JSDOM(
    '<div class="sample"><h6>入力</h6><pre>$raw$</pre><h6>出力</h6><pre>$other$</pre><p>Trace</p><pre>$worked$</pre></div><div class="sample">$left<pre>0</pre>right$</div>',
  );
  for (const profile of [SITE_KATEX, SITE_MATHJAX])
    assert.deepEqual(statementFormulas(dom.window.document, profile), [
      "worked",
    ]);
  assert.equal(dom.window.document.querySelector("pre")!.textContent, "$raw$");
  dom.window.close();
});

test("MathJax scans environments and escaped dollars using its own FindTeX configuration", () => {
  const dom = new JSDOM(
    String.raw`<p>\begin{align}x&amp;=1\end{align}</p><p>\$x$</p>`,
  );
  assert.deepEqual(statementFormulas(dom.window.document, SITE_MATHJAX), [
    String.raw`\begin{align}x&=1\end{align}`,
    "x",
  ]);
  assert.deepEqual(statementFormulas(dom.window.document, SITE_KATEX), ["x"]);
  dom.window.close();
});

test("syntax validation uses the evidenced engine, never a KaTeX verdict for MathJax or unknown profiles", async () => {
  const source = new JSDOM("<p>source</p>");
  const target = new JSDOM(String.raw`<p>$\require{color}\color{red}{x}$</p>`);
  const before = target.serialize();
  assert.ok(
    (
      await checkProblemPreservation(
        source.window.document,
        target.window.document,
        SITE_KATEX,
      )
    ).some((e) => e.startsWith("KaTeX ")),
  );
  assert.deepEqual(
    await checkProblemPreservation(
      source.window.document,
      target.window.document,
      SITE_MATHJAX,
    ),
    [],
  );
  assert.deepEqual(
    await checkProblemPreservation(
      source.window.document,
      target.window.document,
    ),
    [],
  );
  assert.equal(target.serialize(), before);
  target.window.document.querySelector("p")!.textContent =
    String.raw`$\frac{1}$`;
  assert.ok(
    (
      await checkProblemPreservation(
        source.window.document,
        target.window.document,
        SITE_MATHJAX,
      )
    ).some((e) => e.startsWith("MathJax ")),
  );
  source.window.close();
  target.window.close();
});

test("MathJax numeric advice uses its rendered MathML without counting source code", async () => {
  const source = new JSDOM("<p>source</p>");
  const target = new JSDOM("<p>$1234$</p><pre><code>$9876$</code></pre>");
  const errors = await checkProblemPreservation(
    source.window.document,
    target.window.document,
    SITE_MATHJAX,
  );
  assert.equal(errors.filter((e) => e.includes("정수 서식")).length, 1);
  assert.ok(errors.some((e) => e.includes("1234")));
  source.window.close();
  target.window.close();
});
