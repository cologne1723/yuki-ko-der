#!/usr/bin/env node

import { cp, mkdir, rm } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourceRoot = join(repositoryRoot, "review");
const outputRoot = join(repositoryRoot, ".review-dist");
const katexRoot = join(repositoryRoot, "node_modules", "katex", "dist");

await rm(outputRoot, { recursive: true, force: true });
await mkdir(outputRoot, { recursive: true });
await build({
  entryPoints: [join(sourceRoot, "client.ts")],
  bundle: true,
  format: "iife",
  outfile: join(outputRoot, "client.js"),
  platform: "browser",
  target: "es2022",
  sourcemap: true,
});
await Promise.all([
  cp(join(sourceRoot, "index.html"), join(outputRoot, "index.html")),
  cp(join(sourceRoot, "styles.css"), join(outputRoot, "styles.css")),
  cp(
    join(katexRoot, "katex.min.css"),
    join(outputRoot, "katex", "katex.min.css"),
  ),
  cp(join(katexRoot, "fonts"), join(outputRoot, "katex", "fonts"), {
    recursive: true,
  }),
]);

await build({
  entryPoints: [join(sourceRoot, "ui.ts")],
  bundle: true,
  format: "iife",
  outfile: join(outputRoot, "ui.js"),
  platform: "browser",
  target: "es2022",
});
await Promise.all([
  cp(join(sourceRoot, "ui.html"), join(outputRoot, "ui.html")),
  cp(join(sourceRoot, "ui.css"), join(outputRoot, "ui.css")),
]);
