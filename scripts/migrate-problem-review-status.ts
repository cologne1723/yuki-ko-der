#!/usr/bin/env node

import { readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { migrateProblemReviewHtml } from "./problem-review.ts";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const directory = join(
  repositoryRoot,
  "problem-translations",
  "ko",
  "problems",
);

for (const filename of await readdir(directory)) {
  if (!/^\d+\.html$/u.test(filename)) continue;
  const path = join(directory, filename);
  const original = await readFile(path, "utf8");
  const migrated = migrateProblemReviewHtml(original);
  if (migrated !== original) await writeFile(path, migrated, "utf8");
}
