import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createReviewApp } from "../src/review-server.ts";

test("problem image route isolates SVG responses", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "review-problem-images-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, "problem-translations/ko/images/42"), {
    recursive: true,
  });
  await mkdir(join(root, "assets"));
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>';
  await writeFile(join(root, "problem-translations/ko/images/42/1.svg"), svg);
  const app = createReviewApp({
    repositoryRoot: root,
    assetRoot: join(root, "assets"),
  });
  const response = await app.request(
    "http://127.0.0.1/problem-images/42/1.svg",
    { headers: { host: "127.0.0.1" } },
  );
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "image/svg+xml");
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.equal(
    response.headers.get("content-security-policy"),
    "default-src 'none'; sandbox",
  );
  assert.equal(await response.text(), svg);
});
