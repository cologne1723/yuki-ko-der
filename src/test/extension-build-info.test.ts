import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { JSDOM } from "jsdom";
import {
  extensionBuildInfo,
  buildInfoPage,
} from "../../scripts/extension-build-info.ts";

test("extension provenance records actual HEAD and distinguishes clean, edited and untracked sources", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "extension-build-info-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const git = (...args: string[]) =>
    execFileSync("git", args, {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  git("init");
  await writeFile(join(root, "source.txt"), "fixture");
  git("add", "source.txt");
  git(
    "-c",
    "user.name=Fixture",
    "-c",
    "user.email=fixture@example.invalid",
    "-c",
    "commit.gpgsign=false",
    "commit",
    "-m",
    "fixture",
  );
  const clean = extensionBuildInfo(root, "0.1.2");
  assert.equal(clean.commit, git("rev-parse", "HEAD"));
  assert.equal(clean.dirty, false);
  assert.equal(clean.version, "0.1.2");
  assert.ok(Number.isFinite(Date.parse(clean.builtAt)));
  await writeFile(join(root, "new.txt"), "new source");
  assert.equal(extensionBuildInfo(root, "0.1.2").dirty, true);
  await rm(join(root, "new.txt"));
  await writeFile(join(root, "source.txt"), "edited source");
  const dirty = extensionBuildInfo(root, "0.1.2");
  assert.equal(dirty.dirty, true);
  assert.equal(dirty.commit, clean.commit);
  const dom = new JSDOM(buildInfoPage(dirty));
  try {
    assert.equal(
      dom.window.document.querySelector("code")!.textContent,
      clean.commit,
    );
    assert.match(dom.window.document.body.textContent!, /미커밋 변경 포함/);
    assert.match(
      dom.window.document.body.textContent!,
      /문제 번역은 별도로 갱신/,
    );
    assert.equal(dom.window.document.querySelector("script"), null);
  } finally {
    dom.window.close();
  }
  assert.throws(
    () => extensionBuildInfo(root, "<invalid>"),
    /Invalid extension version/,
  );
});
