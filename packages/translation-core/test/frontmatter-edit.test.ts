import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import {
  parseProblemMarkdown,
  setProblemMarkdownReviewStatus,
} from "../src/problem-frontmatter.ts";

test("review status edits preserve comments, surrounding metadata and exact sample bytes", async () => {
  const original = await readFile(
    "problem-translations/ko/problems/1.mdx",
    "utf8",
  );
  for (const newline of ["\n", "\r\n"]) {
    for (const scalar of [
      '"machine" # retained',
      "'machine' # retained",
      "machine # retained",
      "|- # retained\n  machine",
      ">- # retained\n  machine",
    ]) {
      const source = original
        .replace(/^humanReview:.*$/m, "reviewStatus: machine")
        .replace(/^machineReview:.*\r?\n/m, "")
        .replace(/^reviewStatus:.*$/m, `reviewStatus: ${scalar}`)
        .replace(/\r?\n/g, newline);
      const result = setProblemMarkdownReviewStatus(
        source,
        "approved",
        "human",
        "cologne",
      );
      assert.deepEqual(parseProblemMarkdown(result).metadata.humanReview, [
        "cologne",
      ]);
      assert.equal(
        parseProblemMarkdown(result).body,
        parseProblemMarkdown(source).body,
      );
      assert.match(result, /# retained/);
      const {
        humanReview: _human,
        machineReview: _machine,
        ...metadata
      } = parseProblemMarkdown(result).metadata;
      assert.deepEqual(
        { ...metadata, reviewStatus: "machine" },
        parseProblemMarkdown(source).metadata,
      );
    }
  }
});
