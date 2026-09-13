import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import { compileProblemMarkdown } from "translation-core/problem-markdown";
import { labelPublishedProblem } from "../src/problem-publication.ts";

test("direct publication refuses a hidden problem", () => {
  assert.throws(
    () =>
      labelPublishedProblem(
        '<main data-yukicoder-ko-problem data-visibility="false"><h3>Hidden</h3><p>Retained body</p></main>',
      ),
    /Hidden problem cannot be published/,
  );
});

for (const status of ["machine", "unreviewed", "approved"]) {
  test(`published ${status} problem shows the requested review notice`, () => {
    const source = `---
schemaVersion: 1
locale: ko
problemNo: 1
problemId: 17
sourceTitle: "Original"
sourceHtmlSha256: ${"a".repeat(64)}
reviewStatus: ${status}
title: "제목"
---

## 예제

### 입력 {file="sample.txt"}

\`\`\`text
1  2
3
\`\`\`
`;
    const original = new JSDOM(compileProblemMarkdown(source));
    const published = labelPublishedProblem(original.serialize());
    const result = new JSDOM(published);
    try {
      const expected = "No.1 제목";
      assert.equal(
        result.window.document.querySelector("h3")?.textContent,
        expected,
      );
      assert.equal(result.window.document.title, expected);
      assert.equal(
        result.window.document.querySelector("h3")?.previousElementSibling
          ?.textContent ?? null,
        status === "approved" ? null : "아래 텍스트는 기계번역 되었습니다",
      );
      assert.equal(
        result.window.document.querySelector(".problem-statement")?.innerHTML,
        original.window.document.querySelector(".problem-statement")?.innerHTML,
      );
      assert.equal(
        result.window.document
          .querySelector("main")
          ?.outerHTML.split(">", 1)[0],
        original.window.document
          .querySelector("main")
          ?.outerHTML.split(">", 1)[0],
      );
      assert.equal(labelPublishedProblem(published), published);
    } finally {
      original.window.close();
      result.window.close();
    }
  });
}
