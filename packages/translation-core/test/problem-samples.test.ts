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

test("explicit inline alternative output can be promoted without weakening required IO", () => {
  const alternative =
    "<p>このほか，<code>0 3 2 3</code> という出力を行った場合にも正解となります．</p>";
  const source = (prose = alternative) =>
    blocks(
      '<div class="block sample"><h6>入力</h6><pre>input</pre>' +
        "<h6>出力</h6><pre>1 1 3 3</pre>" +
        prose +
        "<h6>入力</h6><pre>next</pre><h6>出力</h6><pre>answer</pre></div>",
    );
  const target = (values: string[]) =>
    blocks(
      '<div class="block sample">' +
        values
          .map((value) => "<h6>출력</h6><pre>" + value + "</pre>")
          .join("") +
        "</div>",
    );
  const required = ["input", "1 1 3 3", "next", "answer"];
  const promoted = ["input", "1 1 3 3", "0 3 2 3", "next", "answer"];
  assert.deepEqual(sampleDataValues(source()), required);
  for (const values of [required, promoted])
    assert.deepEqual(sampleWarnings(source(), target(values), "mdx", true), []);
  for (const values of [
    promoted.map((value) => (value === "0 3 2 3" ? "0 3 2 4" : value)),
    promoted.map((value) => (value === "0 3 2 3" ? "0  3 2 3" : value)),
    ["input", "0 3 2 3", "1 1 3 3", "next", "answer"],
    ["input", "1 1 3 3", "0 3 2 3", "0 3 2 3", "next", "answer"],
    ["input", "0 3 2 3", "next", "answer"],
    promoted.slice(0, -1),
  ])
    assert.ok(sampleWarnings(source(), target(values), "mdx", true).length);
  for (const prose of [
    alternative.replace("正解", "不正解"),
    "<p>説明 <code>0 3 2 3</code></p>",
    alternative
      .replace("<code>", "<span><code>")
      .replace("</code>", "</code></span>"),
    alternative.replace("</p>", "<code>extra</code></p>"),
  ])
    assert.ok(
      sampleWarnings(source(prose), target(promoted), "mdx", true).length,
    );
});

test("observed interactive table aliases and nested paragraph tables retain order", () => {
  for (const labels of [
    ["プログラム側の出力", "ジャッジ側の出力"],
    ["プログラムによる出力　　　", "ジャッジから与えられる入力　　　"],
    ["プログラムからの入力", "プログラムの出力"],
    ["$~$ 入力 $~$", "$~$ 出力 $~$"],
  ]) {
    const table =
      "<table><tr><th>" +
      labels[0] +
      "</th><th>" +
      labels[1] +
      "</th><th>説明</th></tr>" +
      "<tr><td><pre>? 2\n</pre></td><td></td><td>ignore</td></tr>" +
      "<tr><td></td><td><pre> 4\n\n</pre></td><td>ignore too</td></tr></table>";
    for (const heading of ["サンプル", "入出力例"]) {
      const source = blocks(
        '<div class="block"><h4>' +
          heading +
          '</h4><div class="paragraph">' +
          table +
          "</div></div>",
      );
      assert.deepEqual(sampleDataValues(source), ["? 2", " 4\n"]);
      const target = (a: string, b: string) =>
        blocks(
          '<div class="block sample"><h6>출력</h6><pre>' +
            a +
            "</pre><h6>입력</h6><pre>" +
            b +
            "</pre></div>",
        );
      assert.deepEqual(
        sampleWarnings(source, target("? 2", " 4\n\n"), "mdx", true),
        [],
      );
      for (const [a, b] of [
        ["? 3", " 4\n\n"],
        [" 4\n\n", "? 2"],
        ["? 2", "4\n\n"],
      ])
        assert.ok(sampleWarnings(source, target(a, b), "mdx", true).length);
      assert.deepEqual(
        sampleDataValues(
          blocks('<div class="block"><h4>説明</h4>' + table + "</div>"),
        ),
        [],
      );
      assert.deepEqual(
        sampleDataValues(
          blocks(
            '<div class="block"><h4>' +
              heading +
              '</h4><div class="sample">' +
              table +
              "</div></div>",
          ),
        ),
        ["? 2", " 4\n"],
      );
    }
  }
});

test("explicit output example preserves intentionally invalid answer", () => {
  const source = blocks(
    '<div class="block"><h4>出力例</h4><p>条件を満たさない例</p><pre>0 1 0\n</pre></div>',
  );
  assert.deepEqual(sampleDataValues(source), ["0 1 0"]);
  const target = (value: string) =>
    blocks(
      '<div class="block sample"><h6>출력</h6><pre>' + value + "</pre></div>",
    );
  assert.deepEqual(sampleWarnings(source, target("0 1 0"), "mdx", true), []);
  assert.ok(sampleWarnings(source, target("0 0 1"), "mdx", true).length);
  assert.ok(sampleWarnings(source, [], "mdx", true).length);
  assert.deepEqual(
    sampleDataValues(
      blocks('<div class="block"><h4>説明</h4><pre>0 1 0</pre></div>'),
    ),
    [],
  );
});

test("turn-labeled interactive outputs exclude unlabelled explanatory code", () => {
  const source = blocks(
    '<div class="block"><h4>サンプル</h4>' +
      "ターン1:<br><pre>click</pre>説明<br><br>ターン2:<br><pre>buy hand\n</pre>" +
      "<p>解説</p><pre>trace</pre></div>",
  );
  assert.deepEqual(sampleDataValues(source), ["click", "buy hand"]);
  const target = (value: string) =>
    blocks(
      '<div class="block sample"><h6>출력</h6><pre>click</pre>' +
        "<h6>출력</h6><pre>" +
        value +
        "</pre></div>",
    );
  assert.deepEqual(sampleWarnings(source, target("buy hand"), "mdx", true), []);
  assert.ok(sampleWarnings(source, target("buy lily"), "mdx", true).length);
  assert.ok(sampleWarnings(source, [], "mdx", true).length);
});

test("explicit table code payloads exclude only surrounding layout, not code data", () => {
  const source = (cell: string) =>
    blocks(
      '<div class="block sample"><table><tr><th>入力</th></tr><tr><td>' +
        cell +
        "</td></tr></table></div>",
    );
  for (const [cell, expected] of [
    ["$~$<code>? 1 1 4 5</code>$~$", "? 1 1 4 5"],
    ["<code>7</code>\n        <br><code>1 2 3</code>", "7\n1 2 3"],
    ["$~$<code> $~$literal  \n\n</code>$~$", " $~$literal  \n"],
    ["<code>a</code> <code>b</code>", "a b"],
    ["prefix <code>a</code> suffix", "prefix a suffix"],
  ])
    assert.deepEqual(sampleDataValues(source(cell)), [expected]);
  const before = source("$~$<code>? 1 1 4 5</code>$~$");
  const target = (value: string) =>
    blocks(
      '<div class="block sample"><h6>입력</h6><pre>' + value + "</pre></div>",
    );
  assert.deepEqual(
    sampleWarnings(before, target("? 1 1 4 5"), "mdx", true),
    [],
  );
  for (const bad of ["? 1 1 4 2", "? 1 1 45", "$~$? 1 1 4 5$~$"])
    assert.ok(sampleWarnings(before, target(bad), "mdx", true).length);
});

test("explicit unnumbered and my-sample layouts preserve IO without traces", () => {
  for (const html of [
    '<div class="block"><h5>サンプル</h5><h6>入力</h6><pre>H: 3\n</pre><h6>出力</h6><pre>(3,2)</pre><p>説明</p><pre>trace</pre></div>',
    '<div class="block"><h4>サンプル</h4><div class="my-sample"><h5>サンプル0001</h5><div class="paragraph"><h6>入力</h6><pre>H: 3\n</pre><h6>出力</h6><pre>(3,2)</pre><p>説明</p><pre>trace</pre></div></div></div>',
  ]) {
    const original = blocks(html);
    assert.deepEqual(sampleDataValues(original), ["H: 3", "(3,2)"]);
    const target = (value: string) =>
      blocks(
        `<div class="block sample"><h6>입력</h6><pre>H: 3</pre><h6>출력</h6><pre>${value}</pre></div>`,
      );
    assert.deepEqual(
      sampleWarnings(original, target("(3,2)"), "mdx", true),
      [],
    );
    assert.ok(sampleWarnings(original, target("(2,3)"), "mdx", true).length);
    assert.ok(sampleWarnings(original, [], "mdx", true).length);
    assert.deepEqual(
      sampleDataValues(blocks(html.replaceAll("サンプル", "説明"))),
      [],
    );
  }
});

test("wrapperless interactive tables decode numeric math presentation, not literal code", () => {
  const original = blocks(
    '<div class="block"><h4>サンプル</h4><table><tr><th>入力</th><th>出力</th><th>説明</th></tr><tr><td>2</td><td></td><td>$T=2$</td></tr><tr><td></td><td>? $1$ $2$ $2$</td><td>question</td></tr><tr><td>$4$</td><td></td><td>response</td></tr><tr><td></td><td><code>! $3$</code></td><td>literal dollars</td></tr></table></div>',
  );
  const values = ["2", "? 1 2 2", "4", "! $3$"];
  assert.deepEqual(sampleDataValues(original), values);
  const target = (v: string[]) =>
    blocks(
      `<div class="block sample">${v.map((x) => `<h6>출력</h6><pre>${x}</pre>`).join("")}</div>`,
    );
  assert.deepEqual(sampleWarnings(original, target(values), "mdx", true), []);
  for (const altered of [
    values.slice(1),
    [...values].reverse(),
    ["2", "? 1 2 3", "4", "! $3$"],
    ["2", "? 1 2 2", "4", "! 3"],
  ])
    assert.ok(sampleWarnings(original, target(altered), "mdx", true).length);
  assert.deepEqual(
    sampleDataValues(
      blocks('<div class="block sample"><h6>入力</h6><pre>$4$</pre></div>'),
    ),
    ["$4$"],
  );
});

test("wrapperless numbered communication samples preserve raw role IO in order", () => {
  const html =
    '<div class="block"><h4>サンプル</h4><p>サンプル1</p><p>$A=(2,3,5)$</p><p>Aliceの入力</p><pre>Alice\n3 380\n2 3 5\n</pre><p>Aliceの出力</p><pre>3\n00\n111\n00000\n</pre><p>Bobの入力</p><pre>Bob\n3 380\n3\n00\n111\n00000\n</pre><p>Bobの出力</p><pre>2 3 5\n</pre><p>説明</p><pre>worked trace</pre></div>';
  const original = blocks(html);
  const values = [
    "Alice\n3 380\n2 3 5",
    "3\n00\n111\n00000",
    "Bob\n3 380\n3\n00\n111\n00000",
    "2 3 5",
  ];
  const translated = (items: string[]) =>
    blocks(
      `<div class="block sample">${items.map((value) => `<h6>출력</h6><pre>${value}</pre>`).join("")}</div>`,
    );
  assert.deepEqual(sampleDataValues(original), values);
  for (const ioOnly of [false, true]) {
    assert.deepEqual(
      sampleWarnings(original, translated(values), "mdx", ioOnly),
      [],
    );
    for (const changed of [
      values.slice(1),
      [...values].reverse(),
      values.map((value) => value.replace("3 380", "3380")),
      [...values, "extra"],
    ]) {
      assert.ok(
        sampleWarnings(original, translated(changed), "mdx", ioOnly).length,
      );
    }
  }
  for (const other of [
    html.replace("<h4>サンプル</h4>", "<h4>入力</h4>"),
    html.replace("<p>サンプル1</p>", "<p>説明</p>"),
  ])
    assert.deepEqual(sampleDataValues(blocks(other)), []);
});

test("explicit input-free output-only samples omit empty input placeholders only", () => {
  const notice = "<p>This is output-only. 入力は与えられません。</p>";
  const make = (prefix: string, input: string) =>
    blocks(
      `<div class="block">${prefix}<div class="sample"><h6>入力</h6><pre>${input}</pre><h6>出力</h6><pre>5\n3 1 4 1 5</pre></div></div>`,
    );
  const translated = blocks(
    '<div class="block"><div class="sample"><h6>출력</h6><pre>5\n3 1 4 1 5</pre></div></div>',
  );
  assert.deepEqual(sampleDataValues(make(notice, "")), ["5\n3 1 4 1 5"]);
  assert.deepEqual(
    sampleWarnings(make(notice, ""), translated, "mdx", true),
    [],
  );
  // HTML discards the first literal LF immediately after an opening PRE.
  for (const [prefix, input] of [
    ["", ""],
    [notice, "\n\n"],
    [notice, " "],
    [notice, "1"],
  ]) {
    assert.equal(sampleDataValues(make(prefix, input)).length, 2);
    assert.ok(
      sampleWarnings(make(prefix, input), translated, "mdx", true).length,
    );
  }
  assert.deepEqual(
    sampleDataValues(
      blocks(
        `<div class="block">${notice}<div class="sample"><h6>出力</h6><pre></pre></div></div>`,
      ),
    ),
    [""],
  );
});
test("input section explicitly declaring no input permits only an empty input placeholder", () => {
  const make = (
    input: string,
    heading = "入力",
    notice = "入力は与えられません。",
  ) =>
    blocks(
      `<div class="block"><h4>${heading}</h4><p>${notice}<br>条件</p></div><div class="block"><div class="sample"><h6>入力</h6><pre>${input}</pre><h6>出力</h6><pre>5</pre></div></div>`,
    );
  const target = blocks(
    '<div class="block"><div class="sample"><h6>출력</h6><pre>5</pre></div></div>',
  );
  assert.deepEqual(sampleWarnings(make(""), target, "mdx", true), []);
  assert.deepEqual(
    sampleDataValues(make("", "입력", "입력은 주어지지 않습니다.")),
    ["5"],
  );
  for (const source of [
    make(" "),
    make("\n\n"),
    make("1"),
    make("", "説明"),
    make("", "入力", "この段階では入力は与えられません。"),
  ]) {
    assert.equal(sampleDataValues(source).length, 2);
    assert.ok(sampleWarnings(source, target, "mdx", true).length);
  }
});

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

test("interactive tables preserve chronological nonempty IO cells, not explanations", () => {
  for (const labels of [
    ["入力", "出力"],
    ["Player A 入力", "Player B 出力"],
    ["Alice の入力", "Bob の出力"],
    ["Aliceの入力", "Bobの出力"],
    ["Alice의 입력", "Bob의 출력"],
  ]) {
    const original = blocks(`<div class="block sample"><table>
      <tr><th>#</th><th>${labels[0]}</th><th>${labels[1]}</th><th>説明</th></tr>
      <tr><td>1</td><td>1 2 4<br>1 3</td><td></td><td>prose</td></tr>
      <tr><td>2</td><td></td><td><code>? 0 1</code></td><td>more prose</td></tr>
      <tr><td>3</td><td><pre>0\n</pre></td><td>! -1</td><td>done</td></tr>
    </table></div>`);
    const values = ["1 2 4\n1 3", "? 0 1", "0", "! -1"];
    const translated = (items: string[]) =>
      blocks(
        `<div class="block sample">${items.map((value) => `<h6>출력</h6><pre>${value}</pre>`).join("")}</div>`,
      );
    assert.deepEqual(sampleDataValues(original), values);
    for (const ioOnly of [false, true]) {
      assert.deepEqual(
        sampleWarnings(original, translated(values), "mdx", ioOnly),
        [],
      );
      for (const changed of [
        values.slice(1),
        [values[1], values[0], ...values.slice(2)],
        [...values, ""],
        values.map((v) => v.replace("1 3", "13")),
      ])
        assert.ok(
          sampleWarnings(original, translated(changed), "mdx", ioOnly).length,
        );
    }
  }
});

test("named-player communication tables retain each process cell in row order", () => {
  const original = blocks(`<div class="block sample"><table>
    <tr><th>Alice の入力</th><th>Alice の出力</th><th>Bob の入力</th><th>Bob の出力</th><th>Alice の入力の説明</th></tr>
    <tr><td>Alice<br>12<br>3 2<br>1 5 3</td><td></td><td>Bob<br>12<br>3 2<br>4 2</td><td></td><td>not data</td></tr>
    <tr><td></td><td>share 2</td><td></td><td>share 1</td><td>not data</td></tr>
    <tr><td>4</td><td></td><td>5</td><td></td><td>not data</td></tr>
    <tr><td></td><td>answer 3</td><td></td><td>answer 3</td><td>not data</td></tr>
  </table></div>`);
  const values = [
    "Alice\n12\n3 2\n1 5 3",
    "Bob\n12\n3 2\n4 2",
    "share 2",
    "share 1",
    "4",
    "5",
    "answer 3",
    "answer 3",
  ];
  const translated = (items: string[]) =>
    blocks(
      `<div class="block sample">${items.map((value) => `<h6>출력</h6><pre>${value}</pre>`).join("")}</div>`,
    );
  assert.deepEqual(sampleDataValues(original), values);
  for (const ioOnly of [false, true]) {
    assert.deepEqual(
      sampleWarnings(original, translated(values), "mdx", ioOnly),
      [],
    );
    for (const changed of [
      values.slice(0, -1),
      [...values].reverse(),
      values.map((v) => v.replace("3 2", "32")),
      [...values, "not data"],
    ])
      assert.ok(
        sampleWarnings(original, translated(changed), "mdx", ioOnly).length,
      );
  }
});

test("unheaded alternative outputs may gain IO labels without weakening mandatory IO", () => {
  const source = blocks(`<div class="block"><div class="sample">
    <h6>入力</h6><pre>2\n1 2</pre><h6>出力</h6><pre>Yes\n0</pre>
    <p>Alternative</p><pre>Yes\n2\n1\n1</pre>
    <p>Invalid</p><pre>Yes\n6\n1\n1\n1\n1\n1\n1</pre>
    </div><div class="sample"><h6>入力</h6><pre>2\n2 1</pre>
    <h6>出力</h6><pre>Yes\n1\n1</pre></div></div>`);
  const values = [
    "2\n1 2",
    "Yes\n0",
    "Yes\n2\n1\n1",
    "Yes\n6\n1\n1\n1\n1\n1\n1",
    "2\n2 1",
    "Yes\n1\n1",
  ];
  const translated = (items: string[]) =>
    blocks(
      `<div class="block sample">${items.map((value) => `<h6>출력</h6><pre>${value}</pre>`).join("")}</div>`,
    );
  assert.deepEqual(sampleWarnings(source, translated(values), "mdx", true), []);
  for (const changed of [
    values.filter((_, index) => index !== 1),
    values.map((value, index) => (index === 2 ? "Yes\n2\n1\n2" : value)),
    [values[0], values[2], values[1], ...values.slice(3)],
    [...values, values[2]],
  ])
    assert.ok(sampleWarnings(source, translated(changed), "mdx", true).length);
});

test("legacy submitted code can remain unheaded only with all payloads preserved", () => {
  const source = blocks(
    '<div class="block sample"><pre>submitted code</pre><pre>changed code</pre><pre>answer</pre></div>',
  );
  const translated = (values: string[]) =>
    blocks(
      `<div class="block sample">${values.map((v, i) => `${i ? "<h6>출력</h6>" : ""}<pre>${v}</pre>`).join("")}</div>`,
    );
  const values = ["submitted code", "changed code", "answer"];
  assert.deepEqual(sampleWarnings(source, translated(values), "mdx", true), []);
  for (const changed of [
    values.slice(1),
    ["edited code", ...values.slice(1)],
    [values[1], values[0], values[2]],
    [...values, "extra"],
  ])
    assert.ok(sampleWarnings(source, translated(changed), "mdx", true).length);
});

test("promotion alignment handles duplicate payloads without dropping required IO", () => {
  const source = blocks(
    '<div class="block sample"><h6>入力</h6><pre>a</pre><pre>b</pre><h6>出力</h6><pre>b</pre></div>',
  );
  const translated = (values: string[]) =>
    blocks(
      `<div class="block sample">${values.map((value) => `<h6>출력</h6><pre>${value}</pre>`).join("")}</div>`,
    );
  for (const values of [
    ["a", "b"],
    ["a", "b", "b"],
  ])
    assert.deepEqual(
      sampleWarnings(source, translated(values), "mdx", true),
      [],
    );
  assert.ok(sampleWarnings(source, translated(["a"]), "mdx", true).length);
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
