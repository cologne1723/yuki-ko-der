#!/usr/bin/env node

import { cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { compileProblemMarkdown } from "../src/problem-markdown.ts";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourceRoot = join(repositoryRoot, "problem-translations");
const sourceProblems = join(sourceRoot, "ko", "problems");
const outputRoot = join(repositoryRoot, ".problem-translations-dist");
const outputProblems = join(outputRoot, "ko", "problems");
const disclaimer = `<footer>
<p>I do not own the original problem statements or other third-party content. All rights remain with their respective owners. This project is not affiliated with or endorsed by yukicoder.</p>
<p>Upon a request from a content owner or their authorized representative, I will completely delete the requested content from this project, its GitHub Pages site, and other distributions under my control.</p>
<p><a href="https://github.com/cologne1723/yuki-ko-der/issues/new">Request content removal</a></p>
</footer>`;

await rm(outputRoot, { recursive: true, force: true });
await mkdir(outputProblems, { recursive: true });

const sourceProblemsByNumber = new Map<number, string>();
for (const filename of await readdir(sourceProblems)) {
  const match = filename.match(/^(\d+)\.(html|mdx)$/u);
  if (!match) continue;
  const problemNo = Number(match[1]);
  if (sourceProblemsByNumber.has(problemNo)) {
    throw new Error(`Problem ${problemNo} has both HTML and MDX sources`);
  }
  sourceProblemsByNumber.set(problemNo, filename);
}

for (const [problemNo, filename] of sourceProblemsByNumber) {
  const extension = extname(filename);
  const source = await readFile(join(sourceProblems, filename), "utf8");
  const html = extension === ".mdx" ? compileProblemMarkdown(source) : source;
  await writeFile(
    join(outputProblems, `${problemNo}.html`),
    html.replace(/<\/body>/iu, `${disclaimer}\n</body>`),
    "utf8",
  );
}

const links = [...sourceProblemsByNumber.keys()]
  .sort((left, right) => left - right)
  .map(
    (number) =>
      `<li><a href="ko/problems/${number}.html">No. ${number}</a></li>`,
  )
  .join("\n");
await writeFile(join(outputRoot, ".nojekyll"), "");
await cp(join(repositoryRoot, "PRIVACY.md"), join(outputRoot, "PRIVACY.md"));
await cp(
  join(repositoryRoot, "DISCLAIMER.md"),
  join(outputRoot, "DISCLAIMER.md"),
);
await writeFile(
  join(outputRoot, "index.html"),
  `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>yukicoder Korean problem translations</title>
</head>
<body>
<h1>yukicoder Korean problem translations</h1>
${disclaimer}
<p>${sourceProblemsByNumber.size} translated problems. Review status is recorded in each document.</p>
<p>These files supply the Firefox and Chrome extension. The extension verifies the canonical source before applying a translation.</p>
<p><a href="https://github.com/cologne1723/yuki-ko-der">Source and installation instructions</a> · <a href="PRIVACY.md">Privacy</a></p>
<ul>
${links}
</ul>
</body>
</html>
`,
);
