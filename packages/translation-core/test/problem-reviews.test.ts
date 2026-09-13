import {
  metadataReviewStatus,
  assertUnreviewedTranslation,
} from "../src/problem-review-status.ts";
import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { JSDOM } from "jsdom";
import {
  parseProblemMarkdown,
  setProblemMarkdownReviews,
  setProblemMarkdownReviewStatus,
} from "../src/problem-frontmatter.ts";
import { compileProblemMarkdown } from "../src/problem-markdown.ts";
import { labelPublishedProblem } from "../../../tools/audit/src/problem-publication.ts";
import { effectiveProblemStatus } from "../src/problem-review-status.ts";

const source = await readFile("problem-translations/ko/problems/1.mdx", "utf8");
test("translation-only gate requires an empty reviewer list and never changes review state", () => {
  for (const human of [[], ["cologne"], ["one", "two"]])
    for (const machine of ["unreviewed", "approved"] as const) {
      const mdx = setProblemMarkdownReviews(source, { human, machine });
      const metadata = parseProblemMarkdown(mdx).metadata;
      const snapshot = structuredClone(metadata);
      if (!human.length && machine === "unreviewed")
        assert.doesNotThrow(() => assertUnreviewedTranslation(metadata));
      else assert.throws(() => assertUnreviewedTranslation(metadata), /미승인/);
      assert.deepEqual(metadata, snapshot);
    }
  assert.throws(
    () => assertUnreviewedTranslation({ reviewStatus: "unreviewed" }),
    /미승인/,
  );
  assert.throws(() => assertUnreviewedTranslation({}), /미승인/);
});

for (const human of [null, "unreviewed", "approved"] as const) {
  test(`machine approval retains public notice unless human approves (${human})`, () => {
    const reviews = { human, machine: "approved" as const };
    const changed = setProblemMarkdownReviews(source, reviews);
    const doc = new JSDOM(
      labelPublishedProblem(compileProblemMarkdown(changed)),
    );
    try {
      assert.equal(
        !!doc.window.document.querySelector(".machine-translation-notice"),
        human !== "approved",
      );
      assert.equal(
        effectiveProblemStatus(reviews),
        human === "approved" ? "approved" : "unreviewed",
      );
      assert.equal(
        parseProblemMarkdown(changed).body,
        parseProblemMarkdown(source).body,
      );
    } finally {
      doc.window.close();
    }
  });
}

test("independent review edits preserve block metadata, comments, line endings and samples", () => {
  for (const newline of ["\n", "\r\n"]) {
    const original = source
      .replace(/^humanReview:.*$/m, "reviewStatus: machine")
      .replace(/^machineReview:.*\r?\n/m, "")
      .replace(
        /^reviewStatus:.*$/m,
        "reviewStatus: # decision\n  human: approved\n  machine: unreviewed",
      )
      .replace(/\r?\n/g, newline);
    const changed = setProblemMarkdownReviewStatus(
      original,
      "approved",
      "machine",
    );
    assert.deepEqual(
      metadataReviewStatus(parseProblemMarkdown(changed).metadata),
      {
        human: ["cologne"],
        machine: "approved",
      },
    );
    assert.equal(
      parseProblemMarkdown(changed).body,
      parseProblemMarkdown(original).body,
    );
    assert.match(changed, /# decision/);
    assert.equal(changed.includes("\r\n"), newline === "\r\n");
  }
});
