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
} from "../src/problem-input-format.ts";

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
