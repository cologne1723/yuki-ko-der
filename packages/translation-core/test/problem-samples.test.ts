import { strict as assert } from "node:assert";
import test from "node:test";
import { JSDOM } from "jsdom";
import { sampleWarnings, sampleDataValues } from "../src/problem-samples.ts";

test("nested canonical sample wrappers count each code block once", () => {
  const original = blocks(
    '<div class="block"><div class="sample"><pre>first input</pre><pre>first output</pre><div class="sample"><pre>second input</pre><pre>second output</pre></div></div></div>',
  );
  const translated = blocks(
    '<div class="block"><div class="sample"><pre>first input</pre><pre>first output</pre></div><div class="sample"><pre>second input</pre><pre>second output</pre></div></div>',
  );
  assert.deepEqual(sampleWarnings(original, translated), []);
  const altered = blocks(
    '<div class="block"><div class="sample"><pre>first input</pre><pre>first output</pre></div><div class="sample"><pre>wrong input</pre><pre>second output</pre></div></div>',
  );
  const warnings = sampleWarnings(original, altered);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /second input.*wrong input/);
});
import { compileProblemMarkdown } from "../src/problem-markdown.ts";

function blocks(html: string): Element[] {
  return [...new JSDOM(html).window.document.querySelectorAll(".block")];
}
const sample =
  '<div class="sample"><h5>Example</h5><pre>1  2\n</pre><pre>3\n</pre><p>Explanation</p></div>';
const source = blocks(
  `<div class="block"><h4>Title</h4><p>$N$</p><pre>Input format</pre>${sample}</div>`,
);

test("HTML br preserves sample line boundaries without accepting concatenated data", () => {
  const original = blocks(
    '<div class="block"><div class="sample"><pre>3<br>3 7<br>1 1<br>5 3</pre></div></div>',
  );
  assert.deepEqual(
    sampleWarnings(
      original,
      blocks(
        '<div class="block"><div class="sample"><pre>3\n3 7\n1 1\n5 3</pre></div></div>',
      ),
    ),
    [],
  );
  assert.equal(
    sampleWarnings(
      original,
      blocks(
        '<div class="block"><div class="sample"><pre>33 71 15 3</pre></div></div>',
      ),
    ).length,
    1,
  );
});

test("only example IO is compared across freely edited translations", () => {
  assert.deepEqual(
    sampleWarnings(
      source,
      blocks(
        `<div class="block"><h1>Different</h1><p>$M^2$</p><pre>Other format</pre></div><div class="block">${sample.replace("Example", "Changed").replace("Explanation", "New explanation $Z$")}</div>`,
      ),
    ),
    [],
  );
});

test("identical IO remains valid when translated samples are grouped differently", () => {
  const source = blocks(`
    <div class="block">
      <div class="sample"><h5>Input 1</h5><pre>1</pre><pre>2</pre></div>
      <div class="sample"><h5>Input 2</h5><pre>3</pre><pre>4</pre></div>
    </div>`);
  const translated = blocks(`
    <div class="block">
      <div class="sample"><h5>One combined example</h5><pre>1</pre><pre>2</pre><pre>3</pre><pre>4</pre></div>
    </div>`);
  assert.deepEqual(sampleWarnings(source, translated), []);
});

test("missing or additional examples and IO blocks have specific warnings", () => {
  assert.match(
    sampleWarnings(source, blocks('<div class="block"></div>'))[0],
    /예제 1.*번역문.*없습니다/u,
  );
  assert.match(sampleWarnings([], source)[0], /예제 1.*원문.*없습니다/u);
  const fewer = blocks(
    `<div class="block">${sample.replace("<pre>3\n</pre>", "")}</div>`,
  );
  assert.match(sampleWarnings(source, fewer)[0], /입출력 2.*"3".*null/u);
});

test("example whitespace and order remain protected", () => {
  assert.match(
    sampleWarnings(
      source,
      blocks(`<div class="block">${sample.replace("1  2", "1 2")}</div>`),
    )[0],
    /입출력 1/u,
  );
  assert.equal(
    sampleWarnings(
      source,
      blocks(
        `<div class="block">${sample.replace("1  2", "3").replace(">3\n</pre><p>", ">1  2\n</pre><p>")}</div>`,
      ),
    ).length,
    2,
  );
  assert.deepEqual(
    sampleWarnings(
      source,
      blocks(`<div class="block">${sample.replaceAll("\n", "\r\n")}</div>`),
    ),
    [],
  );
});

test("missing MDX sample markers report each source name and a working heading", () => {
  const values = [
    ["4", "Alice"],
    ["11", "Alice"],
    ["24", "Alice"],
    ["600", "Bob"],
  ];
  const original = blocks(
    `<div class="block">${values
      .map(
        ([input, output], index) =>
          `<div class="sample"><h5>サンプル${index + 1}</h5><pre>${input}\n</pre><pre>${output}\n</pre></div>`,
      )
      .join("")}</div>`,
  );
  const mdx = `---
schemaVersion: 1
locale: ko
problemNo: 2
problemId: 18
sourceTitle: "Fixture"
sourceHtmlSha256: ${"a".repeat(64)}
reviewStatus: approved
title: "테스트"
---

## 예제

${values
  .map(
    ([input, output], index) =>
      `### 예제 ${index + 1}\n\n#### 입력\n\n\`\`\`text\n${input}\n\`\`\`\n\n#### 출력\n\n\`\`\`text\n${output}\n\`\`\``,
  )
  .join("\n\n")}
`;
  const warnings = sampleWarnings(
    original,
    blocks(compileProblemMarkdown(mdx)),
    "mdx",
  );
  assert.equal(warnings.length, 4);
  let corrected = mdx;
  for (const [index, warning] of warnings.entries()) {
    assert.ok(warning.includes(`예제 이름: 원문 "サンプル${index + 1}"`));
    assert.ok(warning.includes(`원문: ${JSON.stringify(values[index])}`));
    assert.match(warning, /원문에 파일 이름이 없으므로 \{file=""\}/u);
    assert.doesNotMatch(warning, /<div/u);
    const heading = warning.match(/MDX 예제 제목 형식: (.+)/u)?.[1];
    assert.equal(heading, `### 예제 ${index + 1} {file=""}`);
    corrected = corrected.replace(`### 예제 ${index + 1}`, heading!);
  }
  assert.deepEqual(
    sampleWarnings(original, blocks(compileProblemMarkdown(corrected)), "mdx"),
    [],
  );
  assert.match(corrected, /reviewStatus: approved/u);
});

test("sample diagnostics include filenames and format-specific repair instructions", () => {
  const original = blocks(
    `<div class="block">${sample.replace('class="sample"', 'class="sample" data-file="01_sample_01.txt"')}</div>`,
  );
  const missing = sampleWarnings(original, [], "mdx")[0];
  assert.match(missing, /예제 이름: 원문 "Example"/u);
  assert.match(missing, /파일 이름: 원문 "01_sample_01.txt"/u);
  assert.match(missing, /### 예제 1 \{file="01_sample_01.txt"\}/u);
  const legacy = sampleWarnings(original, [], "html")[0];
  assert.match(legacy, /수정 방법:/u);
  assert.match(legacy, /<div class="sample">/u);
  assert.doesNotMatch(legacy, /MDX|\{file=/u);
  const changed = sampleWarnings(
    original,
    blocks(
      `<div class="block">${sample.replace(">3\n</pre>", ">9\n</pre>").replace("Example", "번역 예제")}</div>`,
    ),
    "mdx",
  )[0];
  assert.match(changed, /예제 이름: 원문 "Example" \/ 번역문 "번역 예제"/u);
  assert.match(changed, /2번째 입출력 코드 블록.*원문 값 "3"/u);
  const extra = sampleWarnings([], original, "mdx")[0];
  assert.match(extra, /예제 이름: 원문 없음 \/ 번역문 "Example"/u);
  assert.match(extra, /수정 방법:.*중복.*제거/u);
});

test("site custom sample headings identify the same raw IO as translated headings", () => {
  const source = blocks(`<div class="block"><div class="sample">
    <h6>定数</h6><pre>$N$\n1 2\n</pre>
    <h6>返すべき値</h6><pre>3\n</pre>
    <p>Explanation</p><pre>worked trace</pre>
  </div></div>`);
  const translation = blocks(`<div class="block"><div class="sample">
    <h6>입력</h6><pre>$N$\n1 2\n</pre>
    <h6>출력</h6><pre>3\n</pre>
    <p>Translated explanation</p><pre>translated worked trace</pre>
  </div></div>`);
  assert.deepEqual(sampleDataValues(source), ["$N$\n1 2", "3"]);
  assert.deepEqual(sampleWarnings(source, translation, "mdx", true), []);
});

test("raw sample digests preserve significant trailing blank lines and BR boundaries", () => {
  assert.deepEqual(
    sampleDataValues(
      blocks('<div class="block sample"><pre>a<br>b\n\n</pre></div>'),
    ),
    ["a\nb\n"],
  );
});

test("all confirmed source IO heading aliases retain data without capturing worked explanations", () => {
  const headings = [
    "出力例",
    "入力例1",
    "出力例1",
    "回答プログラムの出力",
    "応答プログラムの出力",
    "提出プログラムの出力",
    "ジャッジプログラムの出力",
    "ジャッジの出力",
    "저지의 출력",
    "입력과 답변",
    "출력과 질문",
    "入力１",
    "出力３",
    "входные данные",
    "выходные данные",
    "invoer",
    "เอาต์พุต",
    "\u202e入力",
    "\u202e出力",
  ];
  for (const heading of headings) {
    assert.deepEqual(
      sampleDataValues(
        blocks(
          `<div class="block sample"><h6>${heading}</h6><pre>\u202e1  2\n</pre><pre>worked trace</pre></div>`,
        ),
      ),
      ["\u202e1  2"],
      heading,
    );
  }
  for (const heading of ["入力 (デコード後)", "不正解の出力", "暗証番号"]) {
    assert.deepEqual(
      sampleDataValues(
        blocks(
          `<div class="block sample"><h6>入力</h6><pre>data</pre><h6>${heading}</h6><pre>not raw IO</pre></div>`,
        ),
      ),
      ["data"],
      heading,
    );
  }
});
