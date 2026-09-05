#!/usr/bin/env node

import { cp, mkdir, rm } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputRoot = join(repositoryRoot, "dist");

await rm(outputRoot, { recursive: true, force: true });
await mkdir(join(outputRoot, "src"), { recursive: true });

await build({
  entryPoints: [
    join(repositoryRoot, "src", "config.ts"),
    join(repositoryRoot, "src", "problem-translations.ts"),
    join(repositoryRoot, "src", "content.ts"),
  ],
  bundle: true,
  entryNames: "[name]",
  format: "iife",
  outdir: join(outputRoot, "src"),
  platform: "browser",
  target: "es2022",
});

await Promise.all([
  cp(join(repositoryRoot, "manifest.json"), join(outputRoot, "manifest.json")),
  cp(join(repositoryRoot, "DISCLAIMER.md"), join(outputRoot, "DISCLAIMER.md")),
  cp(join(repositoryRoot, "PRIVACY.md"), join(outputRoot, "PRIVACY.md")),
  cp(join(repositoryRoot, "icons"), join(outputRoot, "icons"), {
    recursive: true,
  }),
  cp(join(repositoryRoot, "translations"), join(outputRoot, "translations"), {
    recursive: true,
  }),
]);
