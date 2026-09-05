import { strict as assert } from "node:assert";
import { access, readFile } from "node:fs/promises";
import test from "node:test";
import { JSDOM } from "jsdom";
import {
  compileProblemMarkdown,
  parseProblemMarkdown,
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
      parseProblemMarkdown(source).metadata.reviewStatus,
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
