import { strict as assert } from "node:assert";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { JSDOM } from "jsdom";
import {
  migrateProblemReviewHtml,
  parseReviewState,
  ProblemReviewStore,
  removeMachineLabel,
  ReviewError,
  setReviewStatus,
  structuralWarnings,
} from "../scripts/problem-review.ts";

async function fixtureRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "yukicoder-review-"));
  const sourceDirectory = join(root, "tmp", "problems-source");
  const translationDirectory = join(
    root,
    "problem-translations",
    "ko",
    "problems",
  );
  await Promise.all([
    mkdir(sourceDirectory, { recursive: true }),
    mkdir(translationDirectory, { recursive: true }),
    mkdir(join(root, ".review-dist"), { recursive: true }),
  ]);
  const [japanese, korean] = await Promise.all([
    readFile("tmp/problems-source/1.html", "utf8"),
    readFile("problem-translations/ko/problems/1.mdx", "utf8"),
  ]);
  await Promise.all([
    writeFile(join(sourceDirectory, "1.html"), japanese),
    writeFile(join(translationDirectory, "1.mdx"), korean),
    writeFile(
      join(sourceDirectory, "index.json"),
      JSON.stringify({
        problems: [{ No: 1, ProblemId: 17, Title: "道のショートカット" }],
      }),
    ),
    writeFile(
      join(root, ".review-dist", "index.html"),
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

  const editedSource = approved.koreanSource.replace("마을에는", "도시에는");
  const edited = await store.save(1, editedSource, approved.revision, "save");
  assert.equal(edited.reviewStatus, "approved");
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
        warning.includes("코드 블록") &&
        warning.includes('원문: "3\\n100') &&
        warning.includes('번역문: "4\\n100'),
    ),
  );
});

test("structural warnings name missing and additional formulas", () => {
  const source = new JSDOM('<div class="block"><p>\\(A\\) \\(B\\)</p></div>')
    .window.document;
  const translated = new JSDOM('<div class="block"><p>$A$ $C$</p></div>').window
    .document;
  const warnings = structuralWarnings(
    [source.querySelector(".block")!],
    [translated.querySelector(".block")!],
  );
  assert.deepEqual(warnings, [
    '원문에는 수식 "$B$"이 있지만 번역문에는 없습니다.',
    '번역문에는 수식 "$C$"이 있지만 원문에는 없습니다.',
  ]);
});

test("structural warnings name the exact differing attribute values", () => {
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
  assert.ok(
    warnings.some(
      (warning) =>
        warning.includes("data-file 속성이 다릅니다") &&
        warning.includes('원문: "source.txt"') &&
        warning.includes('번역문: "translated.txt"'),
    ),
  );
});

test("migration never resets an approved problem", async () => {
  const html = (await new ProblemReviewStore(await fixtureRoot()).get(1))
    .koreanHtml;
  const approved = setReviewStatus(removeMachineLabel(html), "approved");
  assert.equal(
    parseReviewState(migrateProblemReviewHtml(approved)).reviewStatus,
    "approved",
  );
});
