#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const problemNo = Number(process.argv[2]);
const outputPath = resolve(
  process.argv[3] ?? `tmp/problem-translation-${problemNo}.draft.html`,
);
if (!Number.isInteger(problemNo) || problemNo < 0) {
  console.error(
    "Usage: scaffold-problem-translation.ts PROBLEM_NO [OUTPUT.html]",
  );
  process.exit(2);
}

const pageResponse = await fetch(
  `https://yukicoder.me/problems/no/${problemNo}`,
);
if (!pageResponse.ok) {
  throw new Error(`Problem page returned ${pageResponse.status}`);
}
const pageHtml = await pageResponse.text();
const problemIdMatch = pageHtml.match(/data-problem-id=["'](\d+)["']/u);
if (!problemIdMatch) {
  throw new Error("Problem page did not expose ProblemId");
}

const problemId = Number(problemIdMatch[1]);
const metadataUrl = `https://yukicoder.me/api/v1/problems/${problemId}`;
const [metadataResponse, sourceResponse] = await Promise.all([
  fetch(metadataUrl),
  fetch(`${metadataUrl}/html`),
]);
if (!metadataResponse.ok || !sourceResponse.ok) {
  throw new Error("Canonical source request failed");
}
const [metadata, sourceBytes] = await Promise.all([
  metadataResponse.json(),
  sourceResponse.arrayBuffer(),
]);
if (metadata.No !== problemNo || metadata.ProblemId !== problemId) {
  throw new Error("Canonical metadata does not match the requested problem");
}

const hash = createHash("sha256")
  .update(Buffer.from(sourceBytes))
  .digest("hex");
const escapedTitle = metadata.Title.replace(/&/gu, "&amp;").replace(
  /"/gu,
  "&quot;",
);
const draft = `<!doctype html>
<html lang="ko">
<head><meta charset="utf-8"><title>[기계 번역] TODO</title></head>
<body>
<main data-yukicoder-ko-problem data-schema-version="1" data-locale="ko"
  data-review-status="unreviewed"
  data-problem-no="${problemNo}" data-problem-id="${problemId}"
  data-source-title="${escapedTitle}" data-source-html-sha256="${hash}">
  <h3>[기계 번역] TODO</h3>
  <div class="problem-statement">
    <!-- Build the statement from the source structure, but do not copy Japanese prose. -->
  </div>
</main>
</body>
</html>
`;

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, draft, { flag: "wx" });
console.log(`Drafted ${outputPath}`);
console.log(
  "Translate the complete HTML and keep [기계 번역] only in the problem title.",
);
