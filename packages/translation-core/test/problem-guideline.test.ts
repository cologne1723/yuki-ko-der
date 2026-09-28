import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import {
  applicableGlossary,
  glossaryTranslationErrors,
} from "../src/problem-glossary.ts";
import {
  inputFormatErrors,
  formatFenceErrors,
  proseQuantityErrors,
  missingOutputFormatErrors,
  missingInputFormatErrors,
} from "../src/problem-input-format.ts";

test("same-row-count templates retain explicitly numbered variables", () => {
  const source = new JSDOM(
    '<div class="block"><h4>入力</h4><pre>$N$\n$p_1$ $q_{1}$\n$\\vdots$\n$p_M$ $q_M$</pre></div>',
  );
  try {
    for (const [row, passes] of [
      [String.raw`$p_{1}\ q_1$`, true],
      [String.raw`$p_i\ q_i$`, false],
      [String.raw`$p_1\ q_i$`, false],
    ] as const) {
      const target = new JSDOM(
        `<div class="block"><h4>입력</h4><pre>$N$\n${row}\n$\\vdots$\n$p_M\\ q_M$</pre></div>`,
      );
      assert.equal(
        missingInputFormatErrors(source.window.document, target.window.document)
          .length === 0,
        passes,
      );
      target.window.close();
    }
  } finally {
    source.window.close();
  }
});

test("isolated non-start indices remain a manual source-typo decision", () => {
  const source = new JSDOM(
    '<div class="block"><h4>出力</h4><pre>$N$\n$x_1\\ y_2$\n$\\vdots$\n$x_N\\ y_N$</pre></div>',
  );
  const target = new JSDOM(
    '<div class="block"><h4>출력</h4><pre>$N$\n$x_1\\ y_1$\n$\\vdots$\n$x_N\\ y_N$</pre></div>',
  );
  assert.deepEqual(
    missingOutputFormatErrors(source.window.document, target.window.document),
    [],
  );
  source.window.close();
  target.window.close();
});

test("input alternatives can merge without losing template rows", () => {
  const before = new JSDOM(
    '<div class="block"><h4>入力</h4><pre>$N$ $Q$\n$A_0$ $A_1$ ... $A_{N-1}$\n$\\text{query}_1$\n...\n$\\text{query}_Q$</pre><pre>$0 ~ l ~ r$</pre><pre>$1 ~ l ~ r ~ x$</pre><pre>$2 ~ l ~ r$</pre></div>',
  );
  const after = new JSDOM(
    '<div class="block"><h4>입력</h4><pre>$N\\ Q$\n$A_0\\ A_1\\ \\cdots\\ A_{N-1}$\n$\\text{query}_1$\n$\\vdots$\n$\\text{query}_Q$</pre><pre>$0\\ l\\ r$\n$1\\ l\\ r\\ x$\n$2\\ l\\ r$</pre></div>',
  );
  assert.deepEqual(
    missingInputFormatErrors(before.window.document, after.window.document),
    [],
  );
  after.window.document.querySelectorAll("pre")[1]!.textContent =
    "$0\\ l\\ r$\n$1\\ l\\ r\\ x$";
  assert.equal(
    missingInputFormatErrors(before.window.document, after.window.document)
      .length,
    1,
  );
  before.window.close();
  after.window.close();
});

test("three dot rows are one omission marker without permitting variable row loss", () => {
  const before = new JSDOM(
    '<div class="block"><h4>入力</h4><pre>$N$\n$A_1$\n$A_2$\n$.$\n$.$\n$.$\n$A_N$</pre></div>',
  );
  const after = new JSDOM(
    '<div class="block"><h4>입력</h4><pre>$N$\n$A_1$\n$A_2$\n$\\vdots$\n$A_N$</pre></div>',
  );
  assert.deepEqual(
    missingInputFormatErrors(before.window.document, after.window.document),
    [],
  );
  after.window.document.querySelector("pre")!.textContent =
    "$N$\n$A_1$\n$\\vdots$\n$A_N$";
  assert.equal(
    missingInputFormatErrors(before.window.document, after.window.document)
      .length,
    1,
  );
  before.window.close();
  after.window.close();
});

for (const response of [
  "このとき、ジャッジ側の答えを$C$としたとき以下の入力が与えられます。",
  "また、ジャッジ側からクエリーに対する答えが以下の様に与えられます。",
])
  test(`explicit judge response under output is protected as incoming input: ${response}`, () => {
    const before = new JSDOM(
      '<div class="block"><h4>入力</h4><pre>$N$</pre></div><div class="block"><h4>出力</h4><pre>$M$ $K$\n$R_1$ $R_2$ $R_K$</pre>' +
        response +
        "<pre>$C$</pre><pre>$0$ $1$\n$S$</pre></div>",
    );
    const after = new JSDOM(
      '<div class="block"><h4>입력</h4><pre>$N$</pre><pre>$C$</pre></div><div class="block"><h4>출력</h4><pre>$M$ $K$\n$R_1$ $R_2$ $R_K$</pre><pre>$0$ $1$\n$S$</pre></div>',
    );
    assert.deepEqual(
      missingOutputFormatErrors(before.window.document, after.window.document),
      [],
    );
    assert.deepEqual(
      missingInputFormatErrors(before.window.document, after.window.document),
      [],
    );
    after.window.document.querySelectorAll("pre")[1].remove();
    assert.equal(
      missingInputFormatErrors(before.window.document, after.window.document)
        .length,
      1,
    );
    after.window.document.querySelectorAll("pre")[2].remove();
    assert.equal(
      missingOutputFormatErrors(before.window.document, after.window.document)
        .length,
      1,
    );
    before.window.close();
    after.window.close();
  });

test("input prose does not replace a source math template", () => {
  const before = new JSDOM(
    '<div class="block"><h4>入力</h4><pre>$N$</pre></div>',
  );
  const after = new JSDOM(
    '<div class="block"><h4>입력</h4><p>정수 N이 주어집니다.</p></div>',
  );
  assert.equal(
    missingInputFormatErrors(before.window.document, after.window.document)
      .length,
    1,
  );
  after.window.document
    .querySelector(".block")!
    .insertAdjacentHTML("beforeend", "<pre>$N$</pre>");
  assert.deepEqual(
    missingInputFormatErrors(before.window.document, after.window.document),
    [],
  );
  before.window.close();
  after.window.close();
});

test("missing output template is not replaced by prose or sample data", () => {
  const before = new JSDOM(
    '<div class="block"><h4>出力</h4><pre>$S_0$\n$S_1$\n$\\vdots$\n$S_{N-1}$</pre></div>',
  );
  const after = new JSDOM(
    '<div class="block"><h4>출력</h4><p>S를 출력하세요.</p><div class="sample"><pre>$S_0$</pre></div></div>',
  );
  assert.equal(
    missingOutputFormatErrors(before.window.document, after.window.document)
      .length,
    1,
  );
  after.window.document
    .querySelector(".block")!
    .insertAdjacentHTML(
      "beforeend",
      "<pre>$S_0$\n$S_1$\n$\\vdots$\n$S_{N-1}$</pre>",
    );
  assert.deepEqual(
    missingOutputFormatErrors(before.window.document, after.window.document),
    [],
  );
  before.window.close();
  after.window.close();
});

test("output template guard excludes literal samples, code, and prose-only output", () => {
  const before = new JSDOM(
    '<div class="block"><h4>出力</h4><p>答えを出力</p><pre>YES</pre><pre>$YES$</pre><pre>$-1$</pre><pre><code>$literal$</code></pre><div class="sample"><pre>$data$</pre></div></div>',
  );
  const after = new JSDOM(
    '<div class="block"><h4>출력</h4><p>답을 출력하세요.</p></div>',
  );
  assert.deepEqual(
    missingOutputFormatErrors(before.window.document, after.window.document),
    [],
  );
  before.window.close();
  after.window.close();
});

test("human-edited Korean quantities stay concise without digit coercion", () => {
  for (const phrase of [
    "첫째 줄",
    "둘째 줄",
    "한 번",
    "둘 다",
    "하나 이상",
    "중 하나를",
    "두 정수",
    "한 면",
    "세 명령",
    "여섯 개",
    "첫 번째",
    "한 걸음",
  ])
    assert.deepEqual(
      proseQuantityErrors(`## 입력\n\n${phrase}입니다.`),
      [],
      phrase,
    );
  assert.deepEqual(
    proseQuantityErrors(
      "수행한 방법. 모두 정수입니다. **한 면**만 굽습니다. [두 번째 줄](https://example.com).",
    ),
    [],
  );
});

test("prose unit quantities include bold text and example explanations", () => {
  assert.equal(proseQuantityErrors("**1행으로 출력하세요.**").length, 1);
  assert.equal(
    proseQuantityErrors("### 예제 1\n\n시속 30km로 110km를 이동합니다.").length,
    2,
  );
  assert.deepEqual(
    proseQuantityErrors(
      "2024년 4월 1일, [2496번 문제](https://example.com/30km). **$1$행**에 $30$km.\n\n`30km` ![30km](image.png)\n\n```text\n1행\n30km\n```",
    ),
    [],
  );
});

test("case reference numbers in prose are quantities, unlike sample identifiers", () => {
  assert.equal(
    proseQuantityErrors(
      "테스트 케이스 1에서는 답이 $5$입니다. 케이스 3에서도 같습니다.",
    ).length,
    2,
  );
  assert.equal(
    proseQuantityErrors("**테스트 케이스 12**를 확인하세요.").length,
    1,
  );
  assert.deepEqual(
    proseQuantityErrors(
      '### 예제 1 {file="case3.txt"}\n\n테스트 케이스 $1$에서는 $\\text{케이스 3}$입니다.\n\n`케이스 3` ![케이스 3](image.png) [링크](https://example.com/케이스3)\n\n```text\n테스트 케이스 1\n```',
    ),
    [],
  );
});

test("IO fence labels are checked before compilation discards them", () => {
  assert.equal(
    formatFenceErrors(
      "## 예제\n\n### 예제 1\n\n#### 출력\n\n~~~\nanswer\n~~~\n",
    ).length,
    1,
  );
  assert.deepEqual(formatFenceErrors("## 입력\n\n~~~text\n$N$\n~~~\n"), []);
  assert.deepEqual(
    formatFenceErrors(
      '## 입력\n\n~~~text html="code" class="tex2jax_ignore" eol="none"\nN\n~~~\n',
    ),
    [],
  );
  assert.deepEqual(
    formatFenceErrors("## 문제 설명\n\n~~~cpp\nint main() {}\n~~~\n"),
    [],
  );
});

test("glossary parses quoted YAML and matches decoded prose, not HTML attributes or samples", () => {
  const yaml = `version: 1
locale: ko
entries:
  - id: kadomatsu
    source: ["門松"]
    preferred: カドマツ
    forbidden: ["가도마쓰", "카도마쓰"]
    kind: proper_noun
    note: "quoted: note"
`;
  assert.equal(applicableGlossary(yaml, "<p>&#38272;松</p>").length, 1);
  assert.equal(
    applicableGlossary(yaml, '<a href="門松">none</a><pre>門松</pre>').length,
    0,
  );
  assert.equal(applicableGlossary(yaml, "<p>카도마쓰</p>").length, 1);
  assert.throws(() => applicableGlossary("version: 2", ""));
  assert.deepEqual(
    glossaryTranslationErrors(yaml, "<p>門松</p>", "<p>カドマツ</p>"),
    [],
  );
  assert.equal(
    glossaryTranslationErrors(yaml, "<p>門松</p>", "<p>카도마쓰</p>").length,
    2,
  );
  assert.deepEqual(
    glossaryTranslationErrors(yaml, "<p>irrelevant</p>", "<p>카도마쓰</p>"),
    [],
  );
});

test("input format rejects missing delimiters and ignores actual sample dollar characters", () => {
  const dom = new JSDOM(
    '<div class="block"><h4>입력</h4><pre>N\nS</pre><div class="sample"><pre>$literal</pre></div></div>',
  );
  assert.equal(inputFormatErrors(dom.window.document).length, 2);
  dom.window.document.querySelector("pre")!.textContent = "$N$\n$S$";
  assert.deepEqual(inputFormatErrors(dom.window.document), []);
  dom.window.document.querySelector("pre")!.textContent = "$$N$$";
  assert.equal(inputFormatErrors(dom.window.document).length, 1);
  dom.window.close();
});

test("output math templates reject missing closing dollars without rewriting literal outputs", () => {
  const dom = new JSDOM(
    '<div class="block"><h4>출력</h4><pre>$X\'</pre>' +
      "<pre>Yes\n! NaN</pre><pre><code>$literal</code></pre>" +
      '<div class="tex2jax_ignore"><pre>$literal</pre></div>' +
      '<div class="sample"><pre>$sample</pre></div></div>',
  );
  const pre = dom.window.document.querySelector("pre")!;
  assert.deepEqual(inputFormatErrors(dom.window.document), [
    "설명용 출력 형식은 행 전체를 단일 $...$로 감싸세요: $X'",
  ]);
  pre.textContent = "$X'$";
  assert.deepEqual(inputFormatErrors(dom.window.document), []);
  for (const broken of ["$$X$$", "$A$ $B$"]) {
    pre.textContent = broken;
    assert.equal(inputFormatErrors(dom.window.document).length, 1);
  }
  dom.window.close();
});

test("input format validation respects explicit source CODE and TeX ignore scopes", () => {
  const dom = new JSDOM(
    '<div class="block"><h4>입력</h4><pre><code>int main() {}</code></pre><div class="tex2jax_ignore"><pre>variable = 1</pre><div class="tex2jax_process"><pre>$N$</pre></div></div></div>',
  );
  assert.deepEqual(inputFormatErrors(dom.window.document), []);
  assert.deepEqual(
    formatFenceErrors('## 입력\n\n~~~rust html="code"\nfn main() {}\n~~~\n'),
    [],
  );
  dom.window.document.querySelector(".tex2jax_process pre")!.textContent = "N";
  assert.equal(inputFormatErrors(dom.window.document).length, 1);
  dom.window.close();
});

test("protocol literals need an exact nearby code label; variables still require math", () => {
  for (const literal of [
    "T",
    "F",
    "Yes",
    "No",
    "NaN",
    "Invalid",
    "! Yes",
    "! No",
    "! NaN",
    "! WIN",
    "! LOSE",
  ]) {
    const dom = new JSDOM(
      `<div class="block"><h4>입력</h4><ul><li><code>${literal}</code>가 주어집니다.</li></ul><pre>${literal}</pre></div>`,
    );
    assert.deepEqual(inputFormatErrors(dom.window.document), []);
    dom.window.document.querySelector("code")!.remove();
    assert.equal(inputFormatErrors(dom.window.document).length, 1);
    dom.window.close();
  }
  for (const variable of ["N", "! X", "? i j"]) {
    const dom = new JSDOM(
      `<div class="block"><h4>입력</h4><p><code>${variable}</code></p><pre>${variable}</pre></div>`,
    );
    assert.equal(inputFormatErrors(dom.window.document).length, 1);
    dom.window.close();
  }
});
