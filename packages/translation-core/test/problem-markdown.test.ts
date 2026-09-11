import {
  legacyProblemStatus,
  metadataReviewStatus,
} from "../src/problem-review-status.ts";
import { strict as assert } from "node:assert";
import { access, readFile } from "node:fs/promises";
import test from "node:test";
import { JSDOM } from "jsdom";
import {
  compileProblemMarkdown,
  parseProblemMarkdown,
  parseProblemFenceInfo,
} from "../src/problem-markdown.ts";

test("problem MDX compiles formulas, fences, and component-free samples", async () => {
  const source = await readFile(
    "problem-translations/ko/problems/1.mdx",
    "utf8",
  );
  const html = compileProblemMarkdown(source);
  const document = new JSDOM(html).window.document;

  assert.equal(parseProblemMarkdown(source).metadata.problemNo, 1);
  assert.ok(
    ["machine", "unreviewed", "approved"].includes(
      legacyProblemStatus(
        metadataReviewStatus(parseProblemMarkdown(source).metadata),
      ),
    ),
  );
  assert.doesNotMatch(source, /machineTranslated/u);
  assert.doesNotMatch(source, /<(?:br|div|pre|p)\b/iu);
  assert.doesNotMatch(source, /<\/?Sample\b/u);
  assert.match(source, /### 예제 1 \{file="01_sample_01\.txt"\}/u);
  assert.match(source, /```text\n3\n100/u);
  assert.match(html, /\$S_i\$/u);
  assert.doesNotMatch(source, /\\\(|\\\[/u);
  assert.doesNotMatch(html, /<em>i<\/em>/u);
  assert.ok(
    document.querySelector(
      '.sample[data-file="01_sample_01.txt"] > .paragraph > h6',
    ),
  );
  assert.ok(document.querySelector(".block > p > br"));
  assert.ok(
    document.querySelector(
      '.sample[data-file="01_sample_03.txt"] > .paragraph > p:empty',
    ),
  );
  await assert.rejects(
    access("problem-translations/ko/problems/1.html"),
    /ENOENT/u,
  );
});

test("problem MDX rejects executable or structural markup", async () => {
  const source = await readFile(
    "problem-translations/ko/problems/1.mdx",
    "utf8",
  );
  assert.throws(
    () =>
      compileProblemMarkdown(
        source.replace("## 문제 설명", "## 문제 설명\n\n<div>"),
      ),
    /native Markdown/u,
  );
  assert.throws(
    () =>
      compileProblemMarkdown(
        source.replace("## 문제 설명", "import x from 'x'\n\n## 문제 설명"),
      ),
    /may not import/u,
  );
  assert.throws(
    () =>
      compileProblemMarkdown(
        source.replace("## 문제 설명", "## 문제 설명\n\n<Widget>"),
      ),
    /native Markdown|Unsupported/u,
  );
});

test("fenced data is not interpreted as MDX structure or executable code", () => {
  const source = [
    "---",
    "schemaVersion: 1",
    "locale: ko",
    "problemNo: 1",
    "problemId: 17",
    'sourceTitle: "Fixture"',
    `sourceHtmlSha256: ${"a".repeat(64)}`,
    "reviewStatus: approved",
    'title: "Fixture"',
    "---",
    "",
    "## 설명",
    "",
    "```text",
    '### 샘플 {file="data.txt"}',
    'import value from "data"',
    "## 이것은 데이터",
    "```",
    "",
  ].join("\n");
  const html = compileProblemMarkdown(source);
  assert.equal(html.match(/class="sample"/gu)?.length ?? 0, 0);
  assert.match(html, /import value from &quot;data&quot;/u);
  assert.match(html, /## 이것은 데이터/u);
});

test("non-empty lines share a paragraph and blank lines start a new one", async () => {
  const source = await readFile(
    "problem-translations/ko/problems/1.mdx",
    "utf8",
  );
  const frontmatter = source.slice(0, source.indexOf("## "));
  const html = compileProblemMarkdown(`${frontmatter}## 문제 설명

첫째 줄
둘째 줄

새 문단
`);
  const document = new JSDOM(html).window.document;
  const paragraphs = document.querySelectorAll(".block > p");

  assert.equal(paragraphs.length, 2);
  assert.equal(paragraphs[0].innerHTML, "첫째 줄<br>\n둘째 줄");
  assert.equal(paragraphs[1].textContent, "새 문단");
});

test("sample fences preserve literal headings, initial blank lines and trailing spaces", async () => {
  const source = await readFile(
    "problem-translations/ko/problems/1.mdx",
    "utf8",
  );
  const frontmatter = source.slice(0, source.indexOf("## "));
  const sample =
    "\n\n#### literal data\n## literal section\n$literal$\n6 3 4 3 1 \n";
  const doc = new JSDOM(
    compileProblemMarkdown(
      `${frontmatter}## 예제\n\n### 예제 1 {file=""}\n\n#### 입력\n\n\`\`\`text\n${sample}\`\`\`\n\n## 설명\n\n본문\n`,
    ),
  ).window.document;
  assert.equal(doc.querySelector(".sample pre")!.textContent, sample);
  assert.equal(doc.querySelectorAll(".block").length, 2);
  assert.equal(doc.querySelectorAll(".sample h6").length, 1);
});

test("author notices render before sections without changing sample data", async () => {
  const source = await readFile(
    "problem-translations/ko/problems/15.mdx",
    "utf8",
  );
  const doc = new JSDOM(compileProblemMarkdown(source)).window.document;
  const statement = doc.querySelector(".problem-statement")!;
  assert.equal(statement.firstElementChild?.tagName, "P");
  assert.equal(
    statement.firstElementChild?.textContent,
    "(출제자 공지) 2014/12/16 17:45에 테스트 케이스의 입력 형식 오류를 수정했습니다.",
  );
  assert.equal(
    statement.children[1].querySelector("h4")?.textContent,
    "문제 설명",
  );
  assert.equal(
    doc.querySelector(".sample pre")?.textContent,
    "3 220\n180\n220\n280\n",
  );
  const { body } = parseProblemMarkdown(source);
  const frontmatter = source.slice(0, source.length - body.length);
  const multiple = new JSDOM(
    compileProblemMarkdown(
      `${frontmatter}첫 공지\n\n둘째 공지\n\n## 설명\n\n본문\n`,
    ),
  ).window.document;
  assert.equal(multiple.querySelectorAll(".problem-statement > p").length, 2);
  assert.throws(
    () => compileProblemMarkdown(`${frontmatter}공지뿐\n`),
    /## sections/u,
  );
  assert.throws(
    () =>
      compileProblemMarkdown(`${frontmatter}# 잘못된 제목\n\n## 설명\n본문\n`),
    /before ## sections/u,
  );
});

const fixtureHeader = `---
schemaVersion: 1
locale: ko
problemNo: 97
problemId: 1
sourceTitle: Fixture
sourceHtmlSha256: ${"a".repeat(64)}
humanReview: null
machineReview: unreviewed
title: Fixture
---

`;

test("blockquote notices preserve nested content before the first section", () => {
  const doc = new JSDOM(
    compileProblemMarkdown(
      `${fixtureHeader}> **Notice**\n>\n> First paragraph.\n>\n> > Nested notice.\n>\n> Last paragraph.\n\nFollowing notice.\n\n## Statement\n\nBody.\n\n## Samples\n\n### Sample 1 {file="sample.txt"}\n\n#### Input\n\n\`\`\`text\n1\n\`\`\`\n`,
    ),
  ).window.document;
  const statement = doc.querySelector(".problem-statement")!;
  assert.equal(statement.firstElementChild?.tagName, "BLOCKQUOTE");
  assert.equal(
    statement.querySelector("blockquote strong")?.textContent,
    "Notice",
  );
  assert.equal(
    statement.querySelector("blockquote blockquote")?.textContent?.trim(),
    "Nested notice.",
  );
  assert.equal(statement.children[1].textContent, "Following notice.");
  assert.equal(
    statement.children[2].querySelector("h4")?.textContent,
    "Statement",
  );
  assert.equal(statement.querySelector(".sample pre")?.textContent, "1\n");
});

test("all fence languages produce bare PRE regardless of heading or dollar count", () => {
  for (const language of ["", "text", "cpp", "python"]) {
    for (const section of ["입력", "문제 설명", "예제"]) {
      const content = "\n\n$ A_i \\\\ B_i $\n$C$\nint main() {}\n\n\n";
      const dom = new JSDOM(
        compileProblemMarkdown(
          `${fixtureHeader}## ${section}\n\n~~~${language}\n${content}~~~\n`,
        ),
      );
      const pre = dom.window.document.querySelector("pre")!;
      assert.equal(pre.querySelector("code"), null);
      assert.equal(pre.textContent, content);
      dom.window.close();
    }
  }
});

test("explicit fence metadata preserves CODE, TeX classes and absent final LF", () => {
  const dom = new JSDOM(
    compileProblemMarkdown(
      `${fixtureHeader}## Statement\n\n~~~cpp html="code" class="tex2jax_ignore" code-class="tex2jax_process" eol="none"\n\n$ x_i $\n~~~\n`,
    ),
  );
  const pre = dom.window.document.querySelector("pre")!;
  assert.equal(pre.className, "tex2jax_ignore");
  assert.equal(pre.children.length, 1);
  assert.equal(pre.firstElementChild!.tagName, "CODE");
  assert.equal(pre.firstElementChild!.className, "tex2jax_process");
  assert.equal(pre.textContent, "\n$ x_i $");
  dom.window.close();
  for (const info of [
    'text onclick="x"',
    'text html="pre"',
    'text class="other"',
    'text eol="bad"',
    'text code-class="tex2jax_process"',
    'text html="code" html="code"',
  ]) {
    assert.throws(
      () => parseProblemFenceInfo(info),
      /Unsupported|must|requires/,
    );
  }
  assert.equal(parseProblemFenceInfo('html="code"').code, true);
});

test("nested explicit TeX containers preserve prose and processing scopes", () => {
  const dom = new JSDOM(
    compileProblemMarkdown(`${fixtureHeader}## Statement

:::: tex2jax_ignore

$ ignored_i $

::: tex2jax_process

$ processed_i $

:::

~~~~text
$still_ignored$
~~~~

::::

$ outside_i $
`),
  );
  const doc = dom.window.document;
  assert.equal(
    doc.querySelector(".tex2jax_ignore > p")!.textContent,
    "$ ignored_i $",
  );
  assert.equal(
    doc.querySelector(".tex2jax_ignore > .tex2jax_process > p")!.textContent,
    "$ processed_i $",
  );
  assert.equal(
    doc.querySelector("pre")!.parentElement!.className,
    "tex2jax_ignore",
  );
  assert.equal(doc.querySelector(".block > p")!.textContent, "$ outside_i $");
  dom.window.close();
});

test("inline math keeps leading whitespace and multiline TeX with the site's delimiters", () => {
  for (const tex of [
    String.raw`$  a_i \\ b_i $`,
    String.raw`\( a_i \\ b_i \)`,
    String.raw`\[ a_i \\ b_i \]`,
    String.raw`$$ a_i \\ b_i $$`,
    "$\n  \\begin{array}{c}\na_i \\\\\nb_i\n\\end{array}\n$",
  ]) {
    const dom = new JSDOM(
      compileProblemMarkdown(`${fixtureHeader}## Statement\n\n${tex}\n`),
    );
    assert.equal(
      dom.window.document.querySelector(".block > p")!.textContent,
      tex,
    );
    assert.equal(dom.window.document.querySelector("em"), null);
    dom.window.close();
  }
});
