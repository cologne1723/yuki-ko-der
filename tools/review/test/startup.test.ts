import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runInNewContext } from "node:vm";
import { build } from "esbuild";
import { repositoryRoot } from "translation-core/paths";
import { createReviewApp } from "../src/review-server.ts";

test("review starts without ignored data and retains UI dictionary access", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "review-no-data-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await Promise.all([
    mkdir(join(root, "translations/ko"), { recursive: true }),
    mkdir(join(root, "problem-translations/ko/problems"), { recursive: true }),
    mkdir(join(root, "assets")),
  ]);
  await Promise.all([
    writeFile(join(root, "translations/ko.messages.json"), '{"messages":[]}'),
    writeFile(
      join(root, "assets/index.html"),
      "<!doctype html><title>Review</title>",
    ),
    writeFile(
      join(root, "problem-translations/ko/problems/1.mdx"),
      await readFile(
        join(repositoryRoot, "problem-translations/ko/problems/1.mdx"),
      ),
    ),
  ]);
  const app = createReviewApp({
    repositoryRoot: root,
    assetRoot: join(root, "assets"),
  });
  const headers = { host: "127.0.0.1" };
  const index = await app.request("http://127.0.0.1/", { headers });
  assert.equal(index.status, 200);
  assert.match(await index.text(), /Review/);
  assert.doesNotMatch(
    index.headers.get("content-security-policy")!,
    /unsafe-eval/,
  );
  const list = await app.request("http://127.0.0.1/api/problems", { headers });
  assert.equal(list.status, 200);
  assert.match(
    (await list.json()).problems[0].japaneseTitle,
    /Tools and settings/,
  );
  const original = await app.request("http://127.0.0.1/api/problems/1", {
    headers,
  });
  assert.equal(original.status, 404);
  assert.match((await original.json()).error, /Refresh original/);
  const ui = await app.request("http://127.0.0.1/api/ui", { headers });
  assert.equal(ui.status, 200);
  assert.deepEqual((await ui.json()).dictionaries, []);
  assert.equal(
    (
      await app.request("http://127.0.0.1/api/ui", {
        headers: { host: "external.test" },
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await app.request("http://127.0.0.1/api/problems/1", {
        method: "PUT",
        headers: { ...headers, origin: "https://external.test" },
        body: "{}",
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await app.request("http://127.0.0.1/api/problems/1", {
        method: "PUT",
        headers,
        body: "x".repeat(8 * 1024 * 1024 + 1),
      })
    ).status,
    413,
  );
});

test("built browser compiler works with dynamic code generation disabled", async () => {
  const result = await build({
    stdin: {
      contents:
        'import { compileProblemMarkdown } from "translation-core/problem-markdown"; globalThis.compile = compileProblemMarkdown;',
      resolveDir: repositoryRoot,
    },
    bundle: true,
    write: false,
    format: "iife",
    platform: "browser",
  });
  const source = await readFile(
    join(repositoryRoot, "problem-translations/ko/problems/1.mdx"),
    "utf8",
  );
  const context = { source, result: "", atob, btoa };
  runInNewContext(
    result.outputFiles[0].text + "\nresult = compile(source)",
    context,
    { contextCodeGeneration: { strings: false, wasm: false } },
  );
  assert.match(context.result, /data-yukicoder-ko-problem/);
});
