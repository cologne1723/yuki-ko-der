import assert from "node:assert/strict";
import { join } from "node:path";
import test from "node:test";
import {
  buildDirectory,
  dataDirectory,
  defaultDataDirectory,
  repositoryRoot,
} from "../src/paths.ts";

test("output and data paths remain rooted at the repository from package cwd", () => {
  const originalCwd = process.cwd();
  try {
    process.chdir(join(repositoryRoot, "tools", "audit"));
    assert.equal(
      buildDirectory("review"),
      join(repositoryRoot, "dist", "review"),
    );
    assert.equal(dataDirectory([]), join(repositoryRoot, "data"));
    assert.equal(
      dataDirectory(["--data-dir", "data/custom"]),
      join(repositoryRoot, "data/custom"),
    );
    const absolute = join(repositoryRoot, "data", "explicit");
    assert.equal(dataDirectory(["--data-dir", absolute]), absolute);
    const fixtureRoot = join(repositoryRoot, "data", "fixture");
    assert.equal(defaultDataDirectory(fixtureRoot), join(fixtureRoot, "data"));
    assert.throws(() => dataDirectory(["--data-dir"]), /requires a path/);
  } finally {
    process.chdir(originalCwd);
  }
});
