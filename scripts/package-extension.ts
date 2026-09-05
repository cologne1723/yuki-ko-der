#!/usr/bin/env node

import { execFile } from "node:child_process";
import { mkdir, readFile, rm } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(
  await readFile(join(root, "dist/manifest.json"), "utf8"),
);
const artifacts = join(root, "web-ext-artifacts");
await mkdir(artifacts, { recursive: true });
const archive = join(artifacts, `yukicoder-ko-${manifest.version}.zip`);
await rm(archive, { force: true });
await promisify(execFile)("zip", ["-qr", archive, "."], {
  cwd: join(root, "dist"),
});
console.log(archive);
