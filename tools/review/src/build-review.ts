import { buildDirectory } from "translation-core/paths";

import { build } from "esbuild";
import { cp, mkdir, rm } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../..",
);
const sourceRoot = join(repositoryRoot, "tools/review/public");
const outputRoot = buildDirectory("review");
const katexRoot = join(repositoryRoot, "node_modules", "katex", "dist");

await rm(outputRoot, { recursive: true, force: true });
await mkdir(outputRoot, { recursive: true });
await build({
  entryPoints: [join(sourceRoot, "app/main.tsx")],
  bundle: true,
  format: "esm",
  outfile: join(outputRoot, "app.js"),
  platform: "browser",
  target: "es2022",
  jsx: "automatic",
  define: { "process.env.NODE_ENV": '"production"' },
  minify: true,
  sourcemap: true,
});
await Promise.all([
  cp(join(sourceRoot, "index.html"), join(outputRoot, "index.html")),
  cp(join(katexRoot, "katex.min.css"), join(outputRoot, "katex/katex.min.css")),
  cp(join(katexRoot, "fonts"), join(outputRoot, "katex/fonts"), {
    recursive: true,
  }),
]);
