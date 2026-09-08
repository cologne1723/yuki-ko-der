import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { defaultDataDirectory, dataDirectory } from "../src/paths.ts";
import {
  saveDataDirectory,
  preferredDataDirectory,
} from "../src/review-settings.ts";

test("data preference persists for next start and leaves current directories intact", async () => {
  const root = await mkdtemp(join(tmpdir(), "review-settings-"));
  try {
    const active = defaultDataDirectory(root);
    assert.equal(preferredDataDirectory(root), undefined);
    await writeFile(join(root, "keep.txt"), "original");
    await saveDataDirectory(root, "alternate-data");
    assert.equal(active, join(root, "data"));
    assert.equal(dataDirectory([], root), join(root, "alternate-data"));
    assert.equal(
      dataDirectory(["--data-dir", "explicit"], root),
      join(root, "explicit"),
    );
    assert.throws(() => dataDirectory(["--data-dir"], root), /requires a path/);
    assert.equal(defaultDataDirectory(root), join(root, "alternate-data"));
    assert.equal(await readFile(join(root, "keep.txt"), "utf8"), "original");
    await assert.rejects(saveDataDirectory(root, "keep.txt"), /not a folder/);
    await assert.rejects(saveDataDirectory(root, "keep.txt/child"));
    await assert.rejects(saveDataDirectory(root, " "), /requires a path/);
    assert.equal(defaultDataDirectory(root), join(root, "alternate-data"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
