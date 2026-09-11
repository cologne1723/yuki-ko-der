import {
  legacyProblemStatus,
  metadataReviewStatus,
} from "translation-core/problem-review-status";
import assert from "node:assert/strict";
import test from "node:test";
import { once } from "node:events";
import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout } from "node:timers/promises";
import { createReviewApp } from "../src/review-server.ts";
import { ReviewTasks } from "../src/tasks.ts";
import {
  compileProblemMarkdown,
  parseProblemMarkdown,
} from "translation-core/problem-markdown";
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "review-task-"));
  await mkdir(join(root, "problem-translations/ko/problems"), {
    recursive: true,
  });
  await mkdir(join(root, "translations/ko"), { recursive: true });
  const source = await readFile(
    "problem-translations/ko/problems/1.mdx",
    "utf8",
  );
  await writeFile(join(root, "problem-translations/ko/problems/1.mdx"), source);
  await writeFile(
    join(root, "translations/ko.messages.json"),
    JSON.stringify({ messages: [] }),
  );
  const dataRoot = join(root, "data"),
    tasks = new ReviewTasks(root, dataRoot);
  const stores = [tasks];
  const createTasks = () => {
    const store = new ReviewTasks(root, dataRoot);
    stores.push(store);
    return store;
  };
  const app = createReviewApp({
    repositoryRoot: root,
    dataRoot,
    assetRoot: "dist/review",
    taskStore: tasks,
  });
  const request = async (
    path: string,
    body?: unknown,
    method = body === undefined ? "GET" : "POST",
  ) => {
    const response = await app.request(`http://localhost${path}`, {
      method,
      headers: {
        host: "localhost",
        origin: "http://localhost",
        "content-type": "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: response.status, body: await response.json() };
  };
  const cleanup = async () => {
    await Promise.all(stores.map((store) => store.whenIdle()));
    await rm(root, { recursive: true, force: true });
  };
  return { root, dataRoot, tasks, request, source, cleanup, createTasks };
}
async function terminal(tasks: ReviewTasks, id: string) {
  for (let i = 0; i < 300; i++) {
    const task = await tasks.get(id);
    if (!["running", "cancelling"].includes(task.status)) {
      await tasks.whenIdle();
      return task;
    }
    await setTimeout(20);
  }
  throw new Error("Worker did not finish");
}
test("real task worker persists progress, rejects simultaneous tasks and detects changed inputs", async () => {
  const f = await fixture();
  try {
    const task = await f.tasks.start({
      operation: "validate-problems",
      problems: "1",
    });
    await assert.rejects(
      f.tasks.start({ operation: "validate-ui" }),
      /Another task/,
    );
    const complete = await terminal(f.tasks, task.id);
    assert.equal(complete.status, "completed", complete.error);
    assert.equal(complete.result?.items[0].status, "passed");
    assert.equal(
      complete.result?.items[0].reviewStatus,
      legacyProblemStatus(
        metadataReviewStatus(parseProblemMarkdown(f.source).metadata),
      ),
    );
    assert.equal(complete.stale, false);
    const restarted = f.createTasks();
    assert.equal((await restarted.get(task.id)).status, "completed");
    await writeFile(
      join(f.root, "problem-translations/ko/problems/1.mdx"),
      f.source + "\n",
    );
    assert.equal((await restarted.get(task.id)).stale, true);
  } finally {
    await f.cleanup();
  }
});
test("cancellation and interrupted-task recovery never report success", async () => {
  const f = await fixture();
  try {
    const task = await f.tasks.start({ operation: "validate-problems" });
    await f.tasks.cancel(task.id);
    assert.equal((await terminal(f.tasks, task.id)).status, "cancelled");
    const record = {
      ...task,
      id: "11111111-1111-1111-1111-111111111111",
      status: "running",
    };
    await writeFile(
      join(f.dataRoot, "reports/review-tasks", `${record.id}.json`),
      JSON.stringify(record),
    );
    const restarted = f.createTasks();
    assert.equal((await restarted.get(record.id)).status, "interrupted");
  } finally {
    await f.cleanup();
  }
});
test("settings are next-start only and task routes validate origin and supported inputs", async () => {
  const f = await fixture();
  try {
    const settings = await f.request(
      "/api/settings",
      { dataDirectory: "different-data" },
      "PUT",
    );
    assert.equal(settings.status, 200);
    assert.equal(settings.body.activeDataDirectory, f.dataRoot);
    assert.equal(
      settings.body.nextDataDirectory,
      join(f.root, "different-data"),
    );
    assert.equal(
      (await f.request("/api/settings")).body.activeDataDirectory,
      f.dataRoot,
    );
    const next = createReviewApp({
      repositoryRoot: f.root,
      assetRoot: "dist/review",
    });
    const response = await next.request("http://localhost/api/settings", {
      headers: { host: "localhost" },
    });
    assert.equal(
      (await response.json()).activeDataDirectory,
      join(f.root, "different-data"),
    );
    assert.equal(
      (
        await f.request(
          "/api/settings",
          { dataDirectory: "translations/ko.messages.json" },
          "PUT",
        )
      ).status,
      400,
    );
    assert.equal(
      (
        await f.request("/api/tasks", {
          operation: "shell",
          command: "anything",
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await f.request("/api/tasks", {
          operation: "audit-translations",
          page: "../private.html",
        })
      ).status,
      400,
    );
  } finally {
    await f.cleanup();
  }
});
test("conversion previews are read-only and explicit save rejects stale revisions", async () => {
  const f = await fixture();
  try {
    const path = join(f.root, "problem-translations/ko/problems/1.html");
    await writeFile(path, compileProblemMarkdown(f.source));
    await rm(join(f.root, "problem-translations/ko/problems/1.mdx"));
    const started = await f.request("/api/tasks", {
      operation: "convert-problem",
      problemNo: 1,
    });
    assert.equal(started.status, 202);
    const id = started.body.id;
    let task;
    for (let i = 0; i < 300; i++) {
      task = (await f.request(`/api/tasks/${id}`)).body;
      if (!["running", "cancelling"].includes(task.status)) break;
      await setTimeout(20);
    }
    assert.equal(task.status, "completed", task.error);
    assert.ok(task.result.artifact.content.startsWith("---"));
    assert.ok(await readFile(path, "utf8"));
    await writeFile(path, (await readFile(path, "utf8")) + "\n");
    assert.equal((await f.request(`/api/tasks/${id}/convert`, {})).status, 409);
    await f.tasks.whenIdle();
  } finally {
    await f.cleanup();
  }
});

test("explicit conversion preserves approval and unsupported or ambiguous previews preserve source files", async () => {
  const f = await fixture();
  try {
    const path = join(f.root, "problem-translations/ko/problems/1.html");
    const mdxPath = join(f.root, "problem-translations/ko/problems/1.mdx");
    const approved = f.source
      .replace("reviewStatus: unreviewed", "reviewStatus: approved")
      .replace("reviewStatus: machine", "reviewStatus: approved");
    await writeFile(path, compileProblemMarkdown(approved));
    await rm(mdxPath);
    assert.equal(
      (
        await f.request("/api/tasks", {
          operation: "convert-problem",
          problemNo: 1,
          html: "upload",
        })
      ).status,
      400,
    );
    const start = await f.request("/api/tasks", {
      operation: "convert-problem",
      problemNo: 1,
    });
    let result;
    for (let i = 0; i < 300; i++) {
      result = await f.request(`/api/tasks/${start.body.id}`);
      if (result.body.status === "completed") break;
      await setTimeout(20);
    }
    assert.equal(result?.body.status, "completed");
    assert.equal(result?.body.result.items[0].reviewStatus, "approved");
    assert.equal(
      (await f.request(`/api/tasks/${start.body.id}/convert`, {})).status,
      200,
    );
    assert.deepEqual(
      metadataReviewStatus(
        parseProblemMarkdown(await readFile(mdxPath, "utf8")).metadata,
      ),
      { human: "approved", machine: "approved" },
    );
    await assert.rejects(readFile(path), { code: "ENOENT" });
    await f.tasks.whenIdle();
    const failed = await f.tasks.start({
      operation: "convert-problem",
      html: "<script>not supported</script>",
    });
    assert.equal((await terminal(f.tasks, failed.id)).status, "failed");
    assert.deepEqual(
      metadataReviewStatus(
        parseProblemMarkdown(await readFile(mdxPath, "utf8")).metadata,
      ),
      { human: "approved", machine: "approved" },
    );
    const retry = await f.tasks.start({
      operation: "validate-problems",
      problems: "1",
    });
    assert.equal((await terminal(f.tasks, retry.id)).status, "completed");
  } finally {
    await f.cleanup();
  }
});

test("uploaded conversion stays current when an unrelated repository translation changes", async () => {
  const f = await fixture();
  try {
    const task = await f.tasks.start({
      operation: "convert-problem",
      html: compileProblemMarkdown(f.source),
    });
    const result = await terminal(f.tasks, task.id);
    assert.equal(result.status, "completed", result.error);
    assert.equal(result.stale, false);
    assert.equal(result.result?.artifact?.problemNo, undefined);
    await writeFile(
      join(f.root, "problem-translations/ko/problems/1.mdx"),
      f.source + "\nUnrelated draft edit\n",
    );
    const current = await f.tasks.get(task.id);
    assert.equal(current.stale, false);
    assert.equal(
      current.result?.artifact?.content,
      result.result?.artifact?.content,
    );
  } finally {
    await f.cleanup();
  }
});

test("a corrupt saved task is reported without disabling healthy history or new work", async () => {
  const f = await fixture();
  try {
    const directory = join(f.dataRoot, "reports/review-tasks");
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, "bad.json"), "{unfinished");
    const tasks = f.createTasks();
    assert.deepEqual(await tasks.list(), []);
    assert.equal((await tasks.recovery())[0].file, "bad.json");
    assert.equal(
      await readFile(join(directory, "bad.json"), "utf8"),
      "{unfinished",
    );
    const task = await tasks.start({
      operation: "validate-problems",
      problems: "1",
    });
    const result = await terminal(tasks, task.id);
    assert.equal(result.status, "completed");
  } finally {
    await f.cleanup();
  }
});

test("saved source changes invalidate audit history without invalidating setup outputs", async () => {
  const f = await fixture();
  try {
    const { inputRevision } = await import("translation-audit/operations/run");
    const context = { repositoryRoot: f.root, dataRoot: f.dataRoot };
    const inputs = [
      { operation: "audit-problems" as const, problems: "1" },
      { operation: "audit-ui-pages" as const },
      { operation: "audit-ui-contexts" as const },
      {
        operation: "audit-translations" as const,
        page: "main.html",
        dictionaries: ["main.json"],
      },
      { operation: "setup" as const, selection: "both" as const },
      { operation: "convert-problem" as const, html: "uploaded" },
    ];
    const initial = await Promise.all(
      inputs.map((input) => inputRevision(context, input)),
    );
    await mkdir(join(f.dataRoot, "problems-source"), { recursive: true });
    await mkdir(join(f.dataRoot, "pages"), { recursive: true });
    await writeFile(join(f.dataRoot, "problems-source/1.html"), "original");
    await writeFile(join(f.dataRoot, "problems-source/index.json"), "{}");
    await writeFile(join(f.dataRoot, "pages/main.html"), "page");
    const saved = await Promise.all(
      inputs.map((input) => inputRevision(context, input)),
    );
    for (let i = 0; i < 4; i++) assert.notEqual(saved[i], initial[i]);
    for (let i = 4; i < 6; i++) assert.equal(saved[i], initial[i]);
    await writeFile(
      join(f.dataRoot, "problems-source/1.html"),
      "updated original",
    );
    await writeFile(join(f.dataRoot, "pages/main.html"), "updated page");
    const changed = await Promise.all(
      inputs.map((input) => inputRevision(context, input)),
    );
    for (let i = 0; i < 4; i++) assert.notEqual(changed[i], saved[i]);
    await rm(join(f.dataRoot, "pages/main.html"));
    assert.notEqual(await inputRevision(context, inputs[2]), changed[2]);
  } finally {
    await f.cleanup();
  }
});

test("null glossary write bodies return validation errors", async () => {
  const f = await fixture();
  try {
    for (const route of ["/api/ui/main.json/0", "/api/ui-shared/main.json/0"]) {
      const response = await f.request(route, null, "PUT");
      assert.equal(response.status, 400);
      assert.equal(typeof response.body.error, "string");
      assert.doesNotMatch(response.body.error, /TypeError|Cannot read/);
    }
  } finally {
    await f.cleanup();
  }
});

test("unused task stores perform no startup IO after their fixture is removed", async () => {
  const root = await mkdtemp(join(tmpdir(), "review-task-unused-"));
  new ReviewTasks(root, join(root, "data"));
  await rm(root, { recursive: true, force: true });
  await setTimeout(20);
  await assert.rejects(
    readFile(join(root, "data/reports/review-tasks/.owner.sqlite")),
    { code: "ENOENT" },
  );
});

test("task readiness reports filesystem errors and retries after repair", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "review-task-readiness-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const dataRoot = join(root, "data");
  await writeFile(dataRoot, "not a directory");
  const tasks = new ReviewTasks(root, dataRoot);
  const first = tasks.initialize();
  assert.equal(tasks.initialize(), first);
  await assert.rejects(first, { code: "ENOTDIR" });
  await assert.rejects(tasks.list(), { code: "ENOTDIR" });
  await rm(dataRoot);
  await tasks.initialize();
  assert.deepEqual(await tasks.list(), []);
  await tasks.whenIdle();
});

test("secondary task stores preserve live ownership, refresh progress, and cannot cancel", async () => {
  const f = await fixture();
  try {
    const task = await f.tasks.start({
      operation: "validate-problems",
      problems: "1",
    });
    const other = f.createTasks();
    assert.equal((await other.get(task.id)).status, "running");
    await assert.rejects(
      other.start({ operation: "validate-ui" }),
      /Another review server/,
    );
    await assert.rejects(other.cancel(task.id), /server that started/);
    assert.equal((await f.tasks.get(task.id)).status, "running");
    const completed = await terminal(other, task.id);
    // A terminal record can be observed before the owning worker's exit handler
    // releases its SQLite lock. Drain the owner, not the read-only observer.
    await f.tasks.whenIdle();
    assert.equal(completed.status, "completed");
    assert.ok(completed.progress.length);
    const next = await other.start({ operation: "validate-ui" });
    assert.equal((await terminal(other, next.id)).status, "completed");
  } finally {
    await f.cleanup();
  }
});

test("task ownership survives a second process and recovers after owner termination", async () => {
  const { spawn } = await import("node:child_process");
  const { pathToFileURL } = await import("node:url");
  const { resolve } = await import("node:path");
  const f = await fixture();
  const script = `
    import { ReviewTasks } from ${JSON.stringify(pathToFileURL(resolve("tools/review/src/tasks.ts")).href)};
    const tasks = new ReviewTasks(${JSON.stringify(f.root)}, ${JSON.stringify(f.dataRoot)});
    const task = await tasks.start({ operation: "validate-problems", problems: "1" });
    process.send({ id: task.id }, () => process.kill(process.pid, "SIGSTOP"));
  `;
  const child = spawn(
    process.execPath,
    ["--import", "tsx", "--input-type=module", "-e", script],
    {
      cwd: process.cwd(),
      stdio: ["ignore", "pipe", "pipe", "ipc"],
    },
  );
  let diagnostics = "";
  child.stderr!.on("data", (chunk) => {
    diagnostics += String(chunk);
  });
  const exited = once(child, "exit");
  try {
    const [{ id }] = (await Promise.race([
      once(child, "message"),
      exited.then(() => {
        throw new Error(`Owner exited before starting: ${diagnostics}`);
      }),
      setTimeout(10000, undefined, { ref: false }).then(() => {
        throw new Error("Owner did not start");
      }),
    ])) as [{ id: string }];
    const observer = f.createTasks();
    assert.equal((await observer.get(id)).status, "running");
    await assert.rejects(
      observer.start({ operation: "validate-ui" }),
      /Another review server/,
    );
    await assert.rejects(observer.cancel(id), /server that started/);
    child.kill("SIGKILL");
    await exited;
    const recovered = await observer.get(id);
    assert.equal(recovered.status, "interrupted");
    const replacement = await observer.start({ operation: "validate-ui" });
    assert.equal(
      (await terminal(observer, replacement.id)).status,
      "completed",
    );
  } finally {
    if (child.exitCode === null && child.signalCode === null)
      child.kill("SIGKILL");
    await exited;
    await f.cleanup();
  }
});

test("validated and reloaded task inputs preserve revision-sensitive property order", async (t) => {
  const f = await fixture();
  t.after(f.cleanup);
  const { operationInput, inputRevision } =
    await import("translation-audit/operations/run");
  const input = { html: "uploaded", operation: "convert-problem" as const };
  assert.equal(JSON.stringify(operationInput(input)), JSON.stringify(input));
  const revision = await inputRevision(
    { repositoryRoot: f.root, dataRoot: f.dataRoot },
    input,
  );
  const id = "abcdef";
  await mkdir(f.tasks.directory, { recursive: true });
  await writeFile(
    join(f.tasks.directory, `${id}.json`),
    JSON.stringify({
      id,
      input,
      revision,
      dataRoot: f.dataRoot,
      startedAt: new Date().toISOString(),
      status: "completed",
      progress: [],
    }),
  );
  const task = await f.tasks.get(id);
  assert.equal(JSON.stringify(task.input), JSON.stringify(input));
  assert.equal(task.stale, false);
});
