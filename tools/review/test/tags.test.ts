import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createReviewApp } from "../src/review-server.ts";

test("tag review persists only the selected tag, requires explicit approval and rejects stale and cross-origin writes", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "tag-review-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, "translations/tags"), { recursive: true });
  const path = join(root, "translations/tags/ko.json");
  const original = {
    locale: "ko",
    tags: [
      {
        source: "動的計画法",
        target: "동적 계획법",
        reviewStatus: "unreviewed",
        problemCount: 313,
        solvedAcKey: "dp",
      },
      {
        source: "数学",
        target: "수학",
        reviewStatus: "approved",
        problemCount: 213,
      },
    ],
  };
  await writeFile(path, JSON.stringify(original));
  const app = createReviewApp({
    repositoryRoot: root,
    assetRoot: root,
    dataRoot: join(root, "data"),
  });
  const get = async () => {
    const r = await app.request("/api/tags", {
      headers: { host: "localhost" },
    });
    assert.equal(r.status, 200);
    return r.json();
  };
  const put = async (
    revision: string,
    target: string,
    action: string,
    origin = "http://localhost",
  ) =>
    app.request("/api/tags/" + encodeURIComponent("動的計画法"), {
      method: "PUT",
      headers: {
        host: "localhost",
        origin,
        "content-type": "application/json",
      },
      body: JSON.stringify({ revision, target, action }),
    });
  let data = await get();
  const initialRevision = data.revision;
  assert.equal(
    (
      await put(
        data.revision,
        "다이나믹 프로그래밍",
        "save",
        "https://example.com",
      )
    ).status,
    403,
  );
  assert.equal((await put(data.revision, " ", "approve")).status, 400);
  let response = await put(data.revision, "다이나믹 프로그래밍", "save");
  assert.equal(response.status, 200);
  data = await response.json();
  assert.equal(data.tags[0].reviewStatus, "unreviewed");
  assert.deepEqual(data.tags[1], original.tags[1]);
  assert.equal((await put(initialRevision, "old", "approve")).status, 409);
  response = await put(data.revision, data.tags[0].target, "approve");
  data = await response.json();
  assert.equal(data.tags[0].reviewStatus, "approved");
  response = await put(data.revision, data.tags[0].target, "save");
  data = await response.json();
  assert.equal(data.tags[0].reviewStatus, "approved");
  response = await put(data.revision, "다이나믹 프로그래밍 수정", "save");
  data = await response.json();
  assert.equal(data.tags[0].reviewStatus, "unreviewed");
  data = await (
    await put(data.revision, data.tags[0].target, "approve")
  ).json();
  data = await (
    await put(data.revision, data.tags[0].target, "unapprove")
  ).json();
  assert.equal(data.tags[0].reviewStatus, "unreviewed");
  const disk = JSON.parse(await readFile(path, "utf8"));
  assert.equal(disk.tags[0].source, "動的計画法");
  assert.equal(disk.tags[0].solvedAcKey, "dp");
  assert.equal(disk.tags[0].problemCount, 313);
  const results = await Promise.all([
    put(data.revision, "first", "save"),
    put(data.revision, "second", "save"),
  ]);
  assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
  const remove = (
    source: string,
    revision: string,
    origin = "http://localhost",
  ) =>
    app.request("/api/tags/" + encodeURIComponent(source), {
      method: "DELETE",
      headers: {
        host: "localhost",
        origin,
        "content-type": "application/json",
      },
      body: JSON.stringify({ revision }),
    });
  assert.equal((await remove("動的計画法", data.revision)).status, 409);
  data = await get();
  assert.equal(
    (await remove("動的計画法", data.revision, "https://example.com")).status,
    403,
  );
  assert.equal((await remove("missing", data.revision)).status, 404);
  let deleted = await remove("動的計画法", data.revision);
  assert.equal(deleted.status, 200);
  data = await deleted.json();
  assert.deepEqual(data.tags, [original.tags[1]]);
  assert.deepEqual(JSON.parse(await readFile(path, "utf8")).tags, [
    original.tags[1],
  ]);
  deleted = await remove("数学", data.revision);
  assert.equal(deleted.status, 200);
  assert.deepEqual((await deleted.json()).tags, []);
});
