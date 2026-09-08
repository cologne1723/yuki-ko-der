import { strict as assert } from "node:assert";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test, { after } from "node:test";
import { JSDOM } from "jsdom";
import {
  parseReviewState,
  ProblemReviewStore,
  ReviewError,
  structuralWarnings,
} from "../src/problem-review.ts";

const fixtureRoots: string[] = [];
after(() =>
  Promise.all(
    fixtureRoots.map((root) => rm(root, { recursive: true, force: true })),
  ),
);
async function fixtureRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "yukicoder-review-"));
  fixtureRoots.push(root);
  const sourceDirectory = join(root, "data", "problems-source");
  const translationDirectory = join(
    root,
    "problem-translations",
    "ko",
    "problems",
  );
  await Promise.all([
    mkdir(sourceDirectory, { recursive: true }),
    mkdir(translationDirectory, { recursive: true }),
    mkdir(join(root, "dist", "review"), { recursive: true }),
  ]);
  // Review-state tests must work without the ignored downloaded corpus.
  const japanese =
    '<div class="block"><h4>Fixture</h4><p>Example source.</p><div class="sample"><h5>サンプル1</h5><pre>3\n100\n</pre></div></div>';
  const hash = createHash("sha256").update(japanese).digest("hex");
  const korean = [
    "---",
    "schemaVersion: 1",
    "locale: ko",
    "problemNo: 1",
    "problemId: 17",
    'sourceTitle: "Fixture"',
    `sourceHtmlSha256: ${hash}`,
    "reviewStatus: machine",
    'title: "길의 지름길"',
    "---",
    "",
    "## Fixture",
    "",
    "마을에는",
    "",
    '### 예제 {file="fixture.txt"}',
    "",
    "```text",
    "3",
    "100",
    "```",
    "",
  ].join("\n");
  await Promise.all([
    writeFile(join(sourceDirectory, "1.html"), japanese),
    writeFile(join(translationDirectory, "1.mdx"), korean),
    writeFile(
      join(sourceDirectory, "index.json"),
      JSON.stringify({
        problems: [{ No: 1, ProblemId: 17, Title: "Fixture" }],
      }),
    ),
    writeFile(
      join(root, "dist", "review", "index.html"),
      "<!doctype html>review",
    ),
  ]);
  return root;
}

test("save, approve, approved edits, and unapprove follow review status rules", async () => {
  const root = await fixtureRoot();
  const store = new ProblemReviewStore(root);
  const listed = await store.list();
  assert.equal(listed.length, 1);
  assert.equal(listed[0].problemNo, 1);
  const initial = await store.get(1);
  assert.equal(initial.koreanTitle, "길의 지름길");
  assert.equal(initial.reviewStatus, "unreviewed");
  assert.equal(
    initial.machineTranslated,
    initial.koreanSource.includes("reviewStatus: machine"),
  );

  const saved = await store.save(
    1,
    initial.koreanSource,
    initial.revision,
    "save",
  );
  assert.equal(saved.reviewStatus, "unreviewed");
  assert.equal(saved.machineTranslated, false);
  assert.doesNotMatch(saved.koreanHtml, /\[기계 번역\]/u);

  const approved = await store.save(
    1,
    saved.koreanSource,
    saved.revision,
    "approve",
  );
  assert.equal(approved.reviewStatus, "approved");

  const unchanged = await store.save(
    1,
    approved.koreanSource,
    approved.revision,
    "save",
  );
  assert.equal(unchanged.reviewStatus, "approved");

  const editedSource = approved.koreanSource.replace("마을에는", "도시에는");
  const edited = await store.save(1, editedSource, approved.revision, "save");
  assert.equal(edited.reviewStatus, "unreviewed");
  assert.match(edited.koreanHtml, /도시에는/u);

  const reopened = await store.save(
    1,
    edited.koreanSource,
    edited.revision,
    "unapprove",
  );
  assert.equal(reopened.reviewStatus, "unreviewed");
});

test("writes reject stale revisions but report sample changes as warnings", async () => {
  const root = await fixtureRoot();
  const store = new ProblemReviewStore(root);
  const initial = await store.get(1);
  await assert.rejects(
    store.save(1, initial.koreanSource, "0".repeat(64), "save"),
    (error: unknown) =>
      error instanceof ReviewError && error.statusCode === 409,
  );
  const changedSample = initial.koreanSource.replace(
    "```text\n3\n100",
    "```text\n4\n100",
  );
  const saved = await store.save(1, changedSample, initial.revision, "save");
  assert.ok(
    saved.validationWarnings.some(
      (warning) =>
        warning.includes("예제 1 입출력 1") &&
        warning.includes('원문: "3\\n100') &&
        warning.includes('번역문: "4\\n100'),
    ),
  );
});

test("concurrent writes for one problem are serialized by revision", async () => {
  const store = new ProblemReviewStore(await fixtureRoot());
  const initial = await store.get(1);
  const first = store.save(
    1,
    initial.koreanSource.replace("마을에는", "도시에는"),
    initial.revision,
    "save",
  );
  const second = store.save(
    1,
    initial.koreanSource.replace("마을에는", "농촌에는"),
    initial.revision,
    "save",
  );
  const results = await Promise.allSettled([first, second]);
  assert.equal(results[0].status, "fulfilled");
  assert.equal(results[1].status, "rejected");
  assert.equal((results[1] as PromiseRejectedResult).reason.statusCode, 409);
  assert.match((await store.get(1)).koreanSource, /도시에는/u);
});

test("invalid MDX remains editable and can be repaired without disabling the problem list", async () => {
  const root = await fixtureRoot();
  const store = new ProblemReviewStore(root);
  const path = join(root, "problem-translations", "ko", "problems", "1.mdx");
  await writeFile(
    path,
    (await readFile(path, "utf8")).replace("## Fixture", "<script>"),
  );
  const broken = await store.get(1);
  assert.ok(
    broken.validationErrors?.some((error) =>
      error.includes("translation is invalid"),
    ),
  );
  assert.match(broken.koreanSource, /<script>/);
  assert.equal((await store.list()).length, 1);
  const repaired = await store.save(
    1,
    broken.koreanSource.replace("<script>", "## Fixture"),
    broken.revision,
    "save",
  );
  assert.equal(repaired.validationErrors, undefined);
});

test("formula changes do not produce warnings", () => {
  const source = new JSDOM('<div class="block"><p>\\(A\\) \\(B\\)</p></div>')
    .window.document;
  const translated = new JSDOM('<div class="block"><p>$A$ $C$</p></div>').window
    .document;
  const warnings = structuralWarnings(
    [source.querySelector(".block")!],
    [translated.querySelector(".block")!],
  );
  assert.deepEqual(warnings, []);
});

test("approval warnings explain how to restore an unrecognized MDX sample", async () => {
  const store = new ProblemReviewStore(await fixtureRoot());
  const initial = await store.get(1);
  const missingMarker = initial.koreanSource.replace(
    '### 예제 {file="fixture.txt"}',
    "### 예제",
  );
  const approved = await store.save(
    1,
    missingMarker,
    initial.revision,
    "approve",
  );
  assert.equal(approved.reviewStatus, "approved");
  assert.equal(approved.validationWarnings.length, 1);
  const warning = approved.validationWarnings[0];
  assert.match(warning, /예제 이름: 원문 "サンプル1"/u);
  assert.match(warning, /MDX 예제 제목 형식: ### 예제 1 \{file=""\}/u);
  assert.doesNotMatch(warning, /<div/u);
  const corrected = approved.koreanSource.replace(
    "### 예제",
    '### 예제 {file=""}',
  );
  const saved = await store.save(1, corrected, approved.revision, "save");
  assert.equal(saved.reviewStatus, "unreviewed");
  assert.deepEqual(saved.validationWarnings, []);
});

test("sample filename changes do not produce warnings", () => {
  const source = new JSDOM(
    '<div class="block"><div class="sample" data-file="source.txt"></div></div>',
  ).window.document;
  const translated = new JSDOM(
    '<div class="block"><div class="sample" data-file="translated.txt"></div></div>',
  ).window.document;
  const warnings = structuralWarnings(
    [source.querySelector(".block")!],
    [translated.querySelector(".block")!],
  );
  assert.deepEqual(warnings, []);
});

test("interrupted conversions recover matching generated files and retained originals", async () => {
  const { compileProblemMarkdown } =
    await import("translation-core/problem-markdown");
  const { convertProblemHtmlToMarkdown } =
    await import("translation-audit/convert-problem-html-to-mdx");
  for (const moved of [false, true]) {
    const root = await fixtureRoot();
    const directory = join(root, "problem-translations/ko/problems");
    const recovery = join(root, "data/reports/problem-conversions");
    await mkdir(recovery, { recursive: true });
    const original = compileProblemMarkdown(
      await readFile(join(directory, "1.mdx"), "utf8"),
    );
    const generated = convertProblemHtmlToMarkdown(original);
    const digest = (text: string) =>
      createHash("sha256").update(text).digest("hex");
    await writeFile(join(directory, "1.mdx"), generated);
    await writeFile(
      join(moved ? recovery : directory, moved ? "1.original.html" : "1.html"),
      original,
    );
    await writeFile(
      join(recovery, "1.json"),
      JSON.stringify({
        version: 1,
        problemNo: 1,
        originalHash: digest(original),
        generatedHash: digest(generated),
      }),
    );
    const store = new ProblemReviewStore(root);
    assert.equal((await store.list()).length, 1);
    assert.equal((await store.get(1)).sourceFormat, "mdx");
    assert.equal(await readFile(join(directory, "1.mdx"), "utf8"), generated);
    for (const path of [
      join(directory, "1.html"),
      join(recovery, "1.json"),
      join(recovery, "1.original.html"),
    ])
      await assert.rejects(readFile(path), { code: "ENOENT" });
  }
});

test("conversion recovery preserves edited sources and isolates ambiguous problems", async () => {
  const { compileProblemMarkdown } =
    await import("translation-core/problem-markdown");
  const { convertProblemHtmlToMarkdown } =
    await import("translation-audit/convert-problem-html-to-mdx");
  for (const changed of ["html", "mdx", "no-intent"]) {
    const root = await fixtureRoot();
    const directory = join(root, "problem-translations/ko/problems");
    const recovery = join(root, "data/reports/problem-conversions");
    await mkdir(recovery, { recursive: true });
    const mdx = await readFile(join(directory, "1.mdx"), "utf8");
    const original = compileProblemMarkdown(mdx);
    const generated = convertProblemHtmlToMarkdown(original);
    const digest = (text: string) =>
      createHash("sha256").update(text).digest("hex");
    const htmlBytes =
      original + (changed === "html" ? "<!-- concurrent edit -->" : "");
    const mdxBytes =
      generated + (changed === "mdx" ? "\nConcurrent edit\n" : "");
    await writeFile(join(directory, "1.html"), htmlBytes);
    await writeFile(join(directory, "1.mdx"), mdxBytes);
    await writeFile(
      join(directory, "2.mdx"),
      mdx.replace("problemNo: 1", "problemNo: 2"),
    );
    if (changed !== "no-intent")
      await writeFile(
        join(recovery, "1.json"),
        JSON.stringify({
          version: 1,
          problemNo: 1,
          originalHash: digest(original),
          generatedHash: digest(generated),
        }),
      );
    const store = new ProblemReviewStore(root);
    const list = await store.list();
    assert.equal(list.length, 2);
    assert.match(
      list.find((p) => p.problemNo === 1)!.validationErrors!.join(" "),
      /inspect/,
    );
    assert.equal(
      list.find((p) => p.problemNo === 2)!.validationErrors,
      undefined,
    );
    await assert.rejects(store.get(1), /inspect/);
    assert.equal(await readFile(join(directory, "1.html"), "utf8"), htmlBytes);
    assert.equal(await readFile(join(directory, "1.mdx"), "utf8"), mdxBytes);
    if (changed !== "no-intent")
      assert.ok(await readFile(join(recovery, "1.json")));
  }
});
