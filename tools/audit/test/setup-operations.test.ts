import assert from "node:assert/strict";
import test from "node:test";
import {
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setupData } from "../src/operations/setup.ts";
import {
  activateSource,
  recoverSourceStore,
  sha256,
} from "../src/operations/source-store.ts";
import { problemSelection } from "../src/operations/types.ts";
const canonical = '<div class="block"><h4>問題</h4><p>original</p></div>';
const metadata = { No: 1, ProblemId: 18, Title: "題名" };
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "setup-operation-"));
  const problemRoot = join(root, "problem-translations/ko/problems");
  const dataRoot = join(root, "data"),
    sourceRoot = join(dataRoot, "problems-source");
  await mkdir(problemRoot, { recursive: true });
  const path = join(problemRoot, "1.mdx");
  const text = `---\nschemaVersion: 1\nlocale: ko\nproblemNo: 1\nproblemId: 18\nsourceTitle: 題名\nsourceHtmlSha256: ${sha256(canonical)}\nreviewStatus: unreviewed\ntitle: 제목\n---\n\n## 문제\n\n번역\n`;
  await writeFile(path, text);
  let html = canonical,
    title = metadata.Title,
    calls = 0;
  const request: typeof fetch = async (url) => {
    assert.match(
      String(url),
      /^https:\/\/yukicoder\.me\/api\/v1\/problems\/(18|19)(\/html)?$/,
    );
    calls++;
    return String(url).endsWith("/html")
      ? new Response(html)
      : Response.json({ ...metadata, Title: title });
  };
  return {
    root,
    dataRoot,
    sourceRoot,
    path,
    text,
    request,
    change: (h: string, t = metadata.Title) => {
      html = h;
      title = t;
    },
    calls: () => calls,
    cleanup: () => rm(root, { recursive: true, force: true }),
  };
}

test("setup checks source identity/title/hash, refreshes mismatches and preserves revisions and translations", async () => {
  const f = await fixture();
  try {
    await activateSource(
      f.sourceRoot,
      { ...metadata, Title: "old title" },
      new TextEncoder().encode("old bytes"),
    );
    const context = {
      repositoryRoot: f.root,
      dataRoot: f.dataRoot,
      request: f.request,
    };
    assert.equal(
      (await setupData(context, "problems")).items[0].status,
      "saved",
    );
    assert.equal(
      await readFile(join(f.sourceRoot, "1.html"), "utf8"),
      canonical,
    );
    assert.equal(
      (await setupData(context, "problems")).items[0].status,
      "skipped",
    );
    assert.equal(f.calls(), 2);
    assert.equal((await readdir(join(f.sourceRoot, "revisions/1"))).length, 2);
    assert.equal(await readFile(f.path, "utf8"), f.text);
    f.change(canonical + "changed");
    assert.equal(
      (await setupData({ ...context, refresh: true }, "problems")).items[0]
        .status,
      "review-required",
    );
    assert.equal(
      await readFile(join(f.sourceRoot, "1.html"), "utf8"),
      canonical,
    );
    f.change(canonical, "new title");
    assert.equal(
      (await setupData({ ...context, refresh: true }, "problems")).items[0]
        .status,
      "review-required",
    );
    assert.equal(await readFile(f.path, "utf8"), f.text);
  } finally {
    await f.cleanup();
  }
});

test("CI lint can omit input-format style while still rejecting invalid HTML", async () => {
  const { checkProblems } = await import("../src/operations/problems.ts");
  const f = await fixture();
  const context = { repositoryRoot: f.root, dataRoot: f.dataRoot };
  try {
    await rm(f.path);
    const path = join(f.root, "problem-translations/ko/problems/1.html");
    const { compileProblemMarkdown } =
      await import("translation-core/problem-markdown");
    const html = compileProblemMarkdown(
      f.text + "\n## 입력\n\n```text\nN M\n```\n",
    );
    await writeFile(path, html);
    assert.equal(
      (await checkProblems(context, "lint")).items[0].status,
      "failed",
    );
    assert.equal(
      (await checkProblems(context, "lint", { inputFormat: false })).items[0]
        .status,
      "passed",
    );
    await writeFile(path, html.replace("<pre>", "<pre =oops>"));
    const invalid = await checkProblems(context, "lint", {
      inputFormat: false,
    });
    assert.equal(invalid.items[0].status, "failed");
    assert.match(invalid.items[0].message, /HTML syntax error/);
  } finally {
    await f.cleanup();
  }
});

test("local validation reports every No/ID mix-up using the exact public-number index entry", async () => {
  const { checkProblems } = await import("../src/operations/problems.ts");
  const f = await fixture();
  try {
    await activateSource(
      f.sourceRoot,
      metadata,
      new TextEncoder().encode(canonical),
    );
    await activateSource(
      f.sourceRoot,
      { No: 18, ProblemId: 42, Title: "Other" },
      new TextEncoder().encode(canonical),
    );
    await writeFile(f.path, f.text.replace("problemId: 18", "problemId: 1"));
    await writeFile(
      join(f.root, "problem-translations/ko/problems/18.mdx"),
      f.text.replace("problemNo: 1", "problemNo: 18"),
    );
    const result = await checkProblems(
      { repositoryRoot: f.root, dataRoot: f.dataRoot },
      "validate",
    );
    assert.equal(result.items.length, 2);
    assert.ok(result.items.every((i) => i.status === "failed"));
    assert.match(result.items[0].message, /expects problemId=18/);
    assert.match(result.items[1].message, /expects problemId=42/);
    await assert.rejects(
      activateSource(
        f.sourceRoot,
        { ...metadata, No: 2 },
        new TextEncoder().encode("wrong"),
      ),
      /duplicate original problem identity/,
    );
    assert.equal(
      await readFile(join(f.sourceRoot, "1.html"), "utf8"),
      canonical,
    );
  } finally {
    await f.cleanup();
  }
});

test("interrupted source/index replacement rolls back before a retry and serial writes retain every index entry", async () => {
  const f = await fixture();
  try {
    await activateSource(
      f.sourceRoot,
      metadata,
      new TextEncoder().encode(canonical),
    );
    const index = await readFile(join(f.sourceRoot, "index.json"));
    await writeFile(
      join(f.sourceRoot, ".replacement.json"),
      JSON.stringify({
        problemNo: 1,
        source: Buffer.from(canonical).toString("base64"),
        index: index.toString("base64"),
      }),
    );
    await writeFile(join(f.sourceRoot, "1.html"), "partial replacement");
    await recoverSourceStore(f.sourceRoot);
    assert.equal(
      await readFile(join(f.sourceRoot, "1.html"), "utf8"),
      canonical,
    );
    await Promise.all(
      [2, 3].map((no) =>
        activateSource(
          f.sourceRoot,
          { ...metadata, No: no, ProblemId: no },
          new TextEncoder().encode(String(no)),
        ),
      ),
    );
    const saved = JSON.parse(
      await readFile(join(f.sourceRoot, "index.json"), "utf8"),
    );
    assert.deepEqual(
      saved.problems.map((p: { No: number }) => p.No),
      [1, 2, 3],
    );
  } finally {
    await f.cleanup();
  }
});

test("ranges reject invalid input and cancellation preserves completed original data", async () => {
  assert.deepEqual(problemSelection("1-3,2,8"), [1, 2, 3, 8]);
  assert.throws(() => problemSelection("3-1"));
  const f = await fixture();
  try {
    const controller = new AbortController();
    controller.abort();
    await assert.rejects(
      setupData(
        {
          repositoryRoot: f.root,
          dataRoot: f.dataRoot,
          signal: controller.signal,
          request: f.request,
        },
        "problems",
      ),
    );
    assert.equal(f.calls(), 0);
    assert.equal(await readFile(f.path, "utf8"), f.text);
  } finally {
    await f.cleanup();
  }
});

test("source lock is released after an interrupted worker and malformed indexes cannot replace original bytes", async () => {
  const { Worker } = await import("node:worker_threads");
  const f = await fixture();
  try {
    await activateSource(
      f.sourceRoot,
      metadata,
      new TextEncoder().encode(canonical),
    );
    const worker = new Worker(
      `const {DatabaseSync}=require('node:sqlite');const {parentPort,workerData}=require('node:worker_threads');const lock=new DatabaseSync(workerData);lock.exec('BEGIN IMMEDIATE');parentPort.postMessage('locked');setInterval(()=>{},1000);`,
      { eval: true, workerData: join(f.sourceRoot, ".source-lock.sqlite") },
    );
    await new Promise<void>((resolve, reject) => {
      worker.once("message", () => resolve());
      worker.once("error", reject);
    });
    const controller = new AbortController();
    const waiting = recoverSourceStore(f.sourceRoot, controller.signal);
    controller.abort();
    await assert.rejects(waiting);
    await worker.terminate();
    await recoverSourceStore(f.sourceRoot);
    await writeFile(join(f.sourceRoot, "index.json"), '{"problems":null}');
    await assert.rejects(
      activateSource(f.sourceRoot, metadata, new TextEncoder().encode("new")),
      /Invalid original source index/,
    );
    assert.equal(
      await readFile(join(f.sourceRoot, "1.html"), "utf8"),
      canonical,
    );
  } finally {
    await f.cleanup();
  }
});

test("task dispatch and CLI operations agree on setup, saved/live checks, ranges, partial failure and cancelled retries", async () => {
  const { runOperation, inputRevision } =
    await import("../src/operations/run.ts");
  const { checkProblems } = await import("../src/operations/problems.ts");
  const f = await fixture();
  const context = {
    repositoryRoot: f.root,
    dataRoot: f.dataRoot,
    request: f.request,
  };
  try {
    const input = {
      operation: "setup" as const,
      selection: "problems" as const,
      problems: "1-1",
    };
    assert.equal((await runOperation(context, input)).items[0].status, "saved");
    assert.deepEqual(
      await runOperation(context, input),
      await setupData({ ...context, problems: [1] }, "problems"),
    );
    for (const [operation, mode] of [
      ["verify-problems", "live"],
      ["audit-problems", "audit"],
    ] as const) {
      assert.deepEqual(
        await runOperation(context, { operation, problems: "1" }),
        await checkProblems({ ...context, problems: [1] }, mode),
      );
    }
    await writeFile(
      join(f.root, "problem-translations/ko/problems/2.mdx"),
      f.text
        .replace("problemNo: 1", "problemNo: 2")
        .replace("problemId: 18", "problemId: 19"),
    );
    const partial = await runOperation(context, { ...input, problems: "1-2" });
    assert.deepEqual(
      partial.items.map((item) => item.status),
      ["skipped", "failed"],
    );
    const controller = new AbortController();
    await assert.rejects(
      runOperation(
        {
          ...context,
          signal: controller.signal,
          progress: (item) => {
            if (item.id === "1") controller.abort();
          },
        },
        { ...input, problems: "1-2" },
      ),
    );
    assert.equal(
      await readFile(join(f.sourceRoot, "1.html"), "utf8"),
      canonical,
    );
    await mkdir(join(f.root, "translations/ko"), { recursive: true });
    await writeFile(
      join(f.root, "translations/ko.messages.json"),
      '{"messages":[]}',
    );
    const revision = await inputRevision(context, {
      operation: "setup",
      selection: "pages",
    });
    await writeFile(
      join(f.root, "translations/ko.messages.json"),
      '{"messages":[]}\n',
    );
    assert.notEqual(
      await inputRevision(context, { operation: "setup", selection: "pages" }),
      revision,
    );
  } finally {
    await f.cleanup();
  }
});
