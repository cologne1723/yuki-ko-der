import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { JSDOM } from "jsdom";
import { migrateProblemReviewers } from "../../../scripts/migrate-problem-reviewers.ts";
import {
  parseProblemMarkdown,
  setProblemMarkdownReviews,
  sameProblemReviewContent,
  setProblemMarkdownVisibility,
} from "../src/problem-frontmatter.ts";
import { compileProblemMarkdown } from "../src/problem-markdown.ts";
import {
  effectiveProblemStatus,
  humanReviewSchema,
} from "../src/problem-review-status.ts";
import { parseReviewState } from "../src/review-state.ts";
import { labelPublishedProblem } from "../../../tools/audit/src/problem-publication.ts";
import { convertProblemHtmlToMarkdown } from "../../../tools/audit/src/convert-problem-html-to-mdx.ts";

const source = await readFile("problem-translations/ko/problems/1.mdx", "utf8");

test("legacy reviewer migration is attributed, idempotent and preserves content", () => {
  for (const human of [null, "unreviewed", "approved"] as const) {
    const modern = setProblemMarkdownReviews(source, {
      human: [],
      machine: "approved",
    });
    const old = modern.replace(/^humanReview:.*$/m, `humanReview: ${human}`);
    const migrated = migrateProblemReviewers(old);
    assert.deepEqual(
      parseProblemMarkdown(migrated).metadata.humanReview,
      human === "approved" ? ["cologne"] : [],
    );
    assert.equal(
      parseProblemMarkdown(migrated).metadata.machineReview,
      "approved",
    );
    assert.equal(
      parseProblemMarkdown(migrated).body,
      parseProblemMarkdown(old).body,
    );
    assert.equal(migrateProblemReviewers(migrated), migrated);
  }
  const legacy = setProblemMarkdownReviews(source, {
    human: [],
    machine: "unreviewed",
  })
    .replace(/^humanReview:.*$/m, "reviewStatus: approved")
    .replace(/^machineReview:.*\n/m, "");
  assert.deepEqual(
    parseProblemMarkdown(migrateProblemReviewers(legacy)).metadata.humanReview,
    ["cologne"],
  );
});

test("IDs reject empties and duplicates and retain case", () => {
  for (const value of [[""], ["   "], ["one", "one"], ["one", " one "]])
    assert.equal(humanReviewSchema.safeParse(value).success, false);
  assert.deepEqual(humanReviewSchema.parse([" cologne ", "Reviewer"]), [
    "cologne",
    "Reviewer",
  ]);
});

test("migrating an existing humanReview field preserves its comment", () => {
  const old = setProblemMarkdownReviews(source, {
    human: [],
    machine: "unreviewed",
  }).replace(
    /^humanReview:.*$/m,
    "humanReview: approved # verified previously",
  );
  const migrated = migrateProblemReviewers(old);
  assert.match(migrated, /# verified previously/);
  assert.deepEqual(parseProblemMarkdown(migrated).metadata.humanReview, [
    "cologne",
  ]);
  assert.equal(migrateProblemReviewers(migrated), migrated);
});

test("review comparison excludes bookkeeping and trailing newlines, not actual content", () => {
  const annotated = setProblemMarkdownReviews(source, {
    human: ["first", "second"],
    machine: "approved",
  });
  assert.ok(sameProblemReviewContent(source, annotated));
  assert.ok(
    sameProblemReviewContent(
      source,
      setProblemMarkdownVisibility(annotated, false),
    ),
  );
  assert.ok(sameProblemReviewContent(source, source.replace(/\n*$/, "\n\n")));
  for (const changed of [
    source.replace("마을에는", "도시에는"),
    source.replace(/^title:.*$/m, "title: 새 제목"),
    source.replace(
      /^sourceHtmlSha256:.*$/m,
      `sourceHtmlSha256: ${"a".repeat(64)}`,
    ),
  ])
    assert.equal(sameProblemReviewContent(source, changed), false);
});

test("published credits escape IDs, keep old extension status attributes and round-trip", () => {
  const human = ["cologne", '<img src=x onerror="alert(1)">'];
  const mdx = setProblemMarkdownReviews(source, { human, machine: "approved" });
  const compiled = compileProblemMarkdown(mdx);
  const published = labelPublishedProblem(compiled);
  const dom = new JSDOM(published);
  try {
    const root = dom.window.document.querySelector<HTMLElement>("main")!;
    assert.equal(root.dataset.schemaVersion, "1");
    assert.equal(root.dataset.humanReview, "approved");
    assert.equal(root.dataset.reviewStatus, "approved");
    assert.deepEqual(JSON.parse(root.dataset.humanReviewers!), human);
    assert.equal(
      dom.window.document.querySelector(".translation-reviewers img"),
      null,
    );
    assert.ok(
      dom.window.document
        .querySelector(".translation-reviewers")!
        .textContent!.includes(human[1]),
    );
    assert.equal(
      dom.window.document.querySelectorAll(".translation-contribution a")
        .length,
      2,
    );
    assert.equal(
      dom.window.document.querySelector(".machine-translation-notice"),
      null,
    );
    assert.deepEqual(parseReviewState(compiled).reviews?.human, human);
    assert.deepEqual(
      parseProblemMarkdown(convertProblemHtmlToMarkdown(compiled)).metadata
        .humanReview,
      human,
    );
    assert.equal(labelPublishedProblem(published), published);
  } finally {
    dom.window.close();
  }
  assert.equal(
    effectiveProblemStatus({ human: [], machine: "approved" }),
    "unreviewed",
  );
});
