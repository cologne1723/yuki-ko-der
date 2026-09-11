import assert from "node:assert/strict";
import test from "node:test";
import {
  mkdtemp,
  mkdir,
  readFile,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  buildLocalProblemPublication,
  runGroundTruthPipeline,
} from "../src/operations/ground-truth-pipeline.ts";
import { auditProblemPublicationData } from "../src/audit-problem-publication-data.ts";

async function fixture(buildSource: string) {
  const root = await mkdtemp(join(tmpdir(), "ground-truth-pipeline-"));
  const dataRoot = join(root, "custom-data");
  await mkdir(join(root, "tools/audit/src"), { recursive: true });
  await writeFile(
    join(root, "tools/audit/src/build-problem-translations.ts"),
    buildSource,
  );
  return {
    root,
    context: { repositoryRoot: root, dataRoot },
    cleanup: () => rm(root, { recursive: true, force: true }),
  };
}

const collected = () => Promise.resolve({ operation: "collected", items: [] });
const audited = () =>
  Promise.resolve({
    report: "publication-audit.json",
    total: 1,
    sampleDigests: 1,
    profiles: { "katex@0.17.0": 1 },
    unavailableProfiles: 0,
    invalidProfiles: 0,
    unavailableSourceRevisions: 0,
    blockingErrors: 0,
  });

test("background stages build locally after profiles and audit last, with explicit data root", async () => {
  const f = await fixture(
    "console.log(JSON.stringify({cwd:process.cwd(),dataRoot:process.argv.at(-1)}));",
  );
  try {
    const calls: string[] = [];
    const result = await runGroundTruthPipeline(
      f.context,
      { refreshedSince: "2026-09-10T05:40:54Z" },
      undefined,
      {
        originals: async () => {
          calls.push("originals");
          return collected();
        },
        profiles: async () => {
          calls.push("profiles");
          return collected();
        },
        build: async (context) => {
          calls.push("build");
          return buildLocalProblemPublication(context);
        },
        audit: async () => {
          calls.push("audit");
          return audited();
        },
      },
    );
    assert.deepEqual(calls, ["originals", "profiles", "build", "audit"]);
    assert.equal(result.phase, "complete");
    assert.deepEqual(result.errors, []);
    const log = await readFile(
      join(f.context.dataRoot, "reports/ground-truth-publication-build.log"),
      "utf8",
    );
    assert.deepEqual(JSON.parse(log), {
      cwd: await realpath(f.root),
      dataRoot: f.context.dataRoot,
    });
    const saved = JSON.parse(await readFile(result.report, "utf8"));
    assert.equal(saved.phase, "complete");
    assert.equal(saved.stages["local-publication-build"].exitCode, 0);
    assert.equal(saved.stages["publication-audit"].total, 1);
  } finally {
    await f.cleanup();
  }
});

test("build failures do not skip the audit and all stage blockers reach terminal error", async () => {
  const f = await fixture(
    'console.error("Problem 11: invalid source hash");console.error("Problem 12: invalid title");process.exitCode=1;',
  );
  try {
    let auditRan = false;
    const result = await runGroundTruthPipeline(
      f.context,
      { refreshedSince: "2026-09-10T05:40:54Z" },
      undefined,
      {
        originals: async () => ({
          operation: "originals",
          items: [
            { id: "8", status: "failed", message: "HTTP 503" },
            { id: "9", status: "review-required", message: "Source changed" },
          ],
        }),
        profiles: async () => {
          throw new Error("Corrupt profile collection checkpoint");
        },
        build: buildLocalProblemPublication,
        audit: async () => {
          auditRan = true;
          throw new Error("Problem 11: bad hash\nProblem 12: bad title");
        },
      },
    );
    assert.equal(auditRan, true);
    assert.equal(result.phase, "error");
    assert.equal(result.reviewRequired, 1);
    assert.deepEqual(
      result.errors.map((error) => error.stage),
      [
        "remaining-originals",
        "public-page-profiles",
        "local-publication-build",
        "publication-audit",
      ],
    );
    const saved = JSON.parse(await readFile(result.report, "utf8"));
    assert.equal(saved.phase, "error");
    assert.match(
      saved.stages["local-publication-build"].output,
      /Problem 11: invalid source hash/,
    );
    assert.match(
      saved.stages["local-publication-build"].output,
      /Problem 12: invalid title/,
    );
    assert.match(saved.errors.at(-1).message, /Problem 12: bad title/);
  } finally {
    await f.cleanup();
  }
});

test("publication audit replaces stale success with aggregated metadata errors", async () => {
  const f = await fixture("");
  try {
    const directory = join(f.root, "problem-translations/ko/problems");
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, "1.mdx"), "incomplete first translation");
    await writeFile(join(directory, "2.mdx"), "incomplete second translation");
    await mkdir(join(f.context.dataRoot, "reports"), { recursive: true });
    const report = join(
      f.context.dataRoot,
      "reports/problem-publication-data.json",
    );
    await writeFile(
      report,
      '{"phase":"complete","publicationBlockingErrors":[]}',
    );
    await assert.rejects(
      auditProblemPublicationData(f.context),
      /1\.mdx[\s\S]*2\.mdx/,
    );
    const saved = JSON.parse(await readFile(report, "utf8"));
    assert.equal(saved.phase, "error");
    assert.match(
      saved.publicationBlockingErrors[0].error,
      /1\.mdx[\s\S]*2\.mdx/,
    );
  } finally {
    await f.cleanup();
  }
});
