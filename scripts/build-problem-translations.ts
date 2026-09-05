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
<p>이 안내 문구는 한국어 번역 검토 전입니다.</p>
<p>저는 원문 문제나 제삼자 콘텐츠의 권리를 소유하지 않습니다. 모든 권리는 각 권리자에게 있으며, 이 프로젝트는 yukicoder와 제휴하거나 승인을 받은 프로젝트가 아닙니다.</p>
<p>권리자 또는 그 대리인의 요청을 받으면 해당 콘텐츠를 이 프로젝트, GitHub Pages 사이트, 제가 관리하는 배포본에서 완전히 삭제하겠습니다.</p>
<p><a href="https://github.com/cologne1723/yuki-ko-der/issues/new">콘텐츠 삭제 요청</a></p>
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
      `<li><a href="ko/problems/${number}.html">${number}번 문제</a></li>`,
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
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>yukicoder 한국어 문제 번역</title>
</head>
<body>
<h1>yukicoder 한국어 문제 번역</h1>
${disclaimer}
<p>문제 번역 ${sourceProblemsByNumber.size}개를 제공합니다. 검수 상태는 각 문서에 기록되어 있습니다.</p>
<p>Firefox와 Chrome 확장 기능이 사용하는 번역 파일입니다. 확장 기능은 원문을 검증한 뒤 번역을 적용합니다.</p>
<p><a href="https://github.com/cologne1723/yuki-ko-der">소스 코드 및 설치 안내</a> · <a href="PRIVACY.md">개인정보 안내</a></p>
<ul>
${links}
</ul>
</body>
</html>
`,
);
