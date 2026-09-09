import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readProblemTitleCatalog } from "../src/problem-title-catalog.ts";

const mdx = (no: number, id: number, title = "Source") => `---
schemaVersion: 1
locale: ko
problemNo: ${no}
problemId: ${id}
sourceTitle: ${title}
sourceHtmlSha256: ${"a".repeat(64)}
reviewStatus: unreviewed
title: 번역
---

## 문제 설명

본문
`;

test("title catalog distinguishes public numbers from IDs and aggregates every bad file", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "title-identities-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const index = join(root, "index.json");
  await writeFile(
    index,
    JSON.stringify({
      problems: [
        { No: 1, ProblemId: 18, Title: "Source" },
        { No: 18, ProblemId: 42, Title: "Other" },
      ],
    }),
  );
  await writeFile(join(root, "1.mdx"), mdx(1, 18));
  await writeFile(join(root, "18.mdx"), mdx(18, 42, "Other"));
  assert.deepEqual(
    (await readProblemTitleCatalog(root, index)).map((p) => [
      p.problemNo,
      p.problemId,
    ]),
    [
      [1, 18],
      [18, 42],
    ],
  );
  await writeFile(join(root, "18.mdx"), mdx(18, 18));
  await writeFile(join(root, "19.mdx"), mdx(20, 99));
  await writeFile(join(root, "21.mdx"), "broken frontmatter");
  await assert.rejects(readProblemTitleCatalog(root, index), (error: Error) => {
    assert.match(error.message, /18\.mdx.*problemId duplicates 1\.mdx/);
    assert.match(error.message, /18\.mdx.*expects problemNo=18, problemId=42/);
    assert.match(error.message, /19\.mdx/);
    assert.match(error.message, /21\.mdx/);
    return true;
  });
});

test("title catalog supports builds without a downloaded index but rejects malformed IDs", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "title-offline-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(join(root, "1.mdx"), mdx(1, 18));
  assert.equal(
    (await readProblemTitleCatalog(root, join(root, "absent.json"))).length,
    1,
  );
  await writeFile(join(root, "2.mdx"), mdx(2, 0));
  await assert.rejects(readProblemTitleCatalog(root), /2\.mdx/);
});
