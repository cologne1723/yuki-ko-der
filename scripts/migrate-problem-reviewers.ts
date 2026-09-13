import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { atomicFile } from "../tools/audit/src/operations/source-store.ts";
import {
  parseProblemMarkdown,
  setProblemMarkdownReviews,
} from "translation-core/problem-frontmatter";
import {
  metadataReviewStatus,
  problemReviews,
} from "translation-core/problem-review-status";

export function migrateProblemReviewers(source: string): string {
  const before = parseProblemMarkdown(source);
  const reviews = problemReviews(metadataReviewStatus(before.metadata));
  const result = setProblemMarkdownReviews(source, reviews);
  const after = parseProblemMarkdown(result);
  const withoutReviews = ({
    reviewStatus: _legacy,
    humanReview: _human,
    machineReview: _machine,
    ...rest
  }: typeof before.metadata) => rest;
  assert.deepEqual(
    withoutReviews(after.metadata),
    withoutReviews(before.metadata),
  );
  assert.equal(after.body, before.body);
  assert.deepEqual(
    problemReviews(metadataReviewStatus(after.metadata)),
    reviews,
  );
  return result;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const root = fileURLToPath(
    new URL("../problem-translations/ko/problems/", import.meta.url),
  );
  const changes: { path: string; before: string; after: string }[] = [];
  let approved = 0,
    total = 0;
  // Preflight every document before writing any migration results.
  for (const file of (await readdir(root))
    .filter((file) => file.endsWith(".mdx"))
    .sort()) {
    const path = join(root, file);
    const before = await readFile(path, "utf8");
    const after = migrateProblemReviewers(before);
    if (parseProblemMarkdown(after).metadata.humanReview?.length) approved++;
    total++;
    if (before !== after) changes.push({ path, before, after });
  }
  if (process.argv.includes("--write")) {
    for (const { path, before, after } of changes) {
      assert.equal(
        await readFile(path, "utf8"),
        before,
        `Concurrent edit: ${path}`,
      );
      await atomicFile(path, after);
    }
  }
  console.log(
    JSON.stringify({
      total,
      approved,
      changed: changes.length,
      written: process.argv.includes("--write"),
    }),
  );
  if (process.argv.includes("--check") && changes.length) process.exitCode = 1;
}
