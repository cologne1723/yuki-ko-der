import { katexStylePlugin } from "./katex-style-plugin.ts";
import { buildDirectory } from "translation-core/paths";

import { build } from "esbuild";
import { cp, mkdir, rm } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const repositoryRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../..",
);
const sourceRoot = join(repositoryRoot, "tools/review/public");
const outputRoot = buildDirectory("review");
const katexRoot = join(repositoryRoot, "node_modules", "katex", "dist");
const coreRequire = createRequire(
  join(repositoryRoot, "packages/translation-core/package.json"),
);
const mathjaxRoot = dirname(coreRequire.resolve("mathjax-full/package.json"));

await rm(outputRoot, { recursive: true, force: true });
await mkdir(outputRoot, { recursive: true });
await build({
  plugins: [katexStylePlugin],
  entryPoints: [join(sourceRoot, "app/main.tsx")],
  bundle: true,
  format: "esm",
  outfile: join(outputRoot, "app.js"),
  platform: "browser",
  target: "es2022",
  jsx: "automatic",
  define: {
    "process.env.NODE_ENV": '"production"',
    // MathJax's CommonJS loader computes this even with every extension preloaded.
    __dirname: '"/mathjax/components"',
  },
  minify: true,
  sourcemap: true,
});
await Promise.all([
  cp(join(sourceRoot, "index.html"), join(outputRoot, "index.html")),
  cp(join(katexRoot, "katex.min.css"), join(outputRoot, "katex/katex.min.css")),
  cp(join(katexRoot, "fonts"), join(outputRoot, "katex/fonts"), {
    recursive: true,
  }),
  cp(
    join(mathjaxRoot, "es5/output/chtml/fonts/woff-v2"),
    join(outputRoot, "mathjax/fonts/woff-v2"),
    { recursive: true },
  ),
]);
