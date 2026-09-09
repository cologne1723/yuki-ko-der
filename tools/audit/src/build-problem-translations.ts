import MarkdownIt from "markdown-it";
import { build } from "esbuild";
import { buildDirectory, defaultDataDirectory } from "translation-core/paths";

import { createHash } from "node:crypto";
import { cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseProblemCatalog } from "translation-core/problem-catalog";
import { compileProblemMarkdown } from "translation-core/problem-markdown";
import { readProblemTitleCatalog } from "translation-core/problem-title-catalog";
import { labelPublishedProblem } from "./problem-publication.ts";

const repositoryRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../..",
);
const sourceRoot = join(repositoryRoot, "problem-translations");
const sourceProblems = join(sourceRoot, "ko", "problems");
const outputRoot = buildDirectory("problems");
const outputProblems = join(outputRoot, "ko", "problems");
const problemTitles = await readProblemTitleCatalog(
  sourceProblems,
  join(defaultDataDirectory(repositoryRoot), "problems-source/index.json"),
);
const readme = await readFile(join(repositoryRoot, "README.md"), "utf8");
const noticeStart = readme.indexOf("# 콘텐츠 권리 및 삭제 요청 안내");
if (noticeStart < 0) throw new Error("README content-rights notice is missing");
const disclaimer = `<footer class="content-rights"><hr>${new MarkdownIt({ html: false }).render(readme.slice(noticeStart))}</footer>`;

await rm(outputRoot, { recursive: true, force: true });
await mkdir(outputProblems, { recursive: true });
await cp(
  join(repositoryRoot, "node_modules/katex/dist"),
  join(outputRoot, "assets/katex"),
  { recursive: true },
);
await build({
  entryPoints: [join(repositoryRoot, "tools/audit/src/published-page.ts")],
  bundle: true,
  outfile: join(outputRoot, "assets/problem-page.js"),
  platform: "browser",
  target: "es2022",
});
const styles = `<style>
body { max-width: 960px; margin: 0 auto; padding: 24px; line-height: 1.7; font-family: system-ui, sans-serif; }
nav { display: flex; flex-wrap: wrap; gap: 16px; margin-bottom: 24px; }
nav button { font: inherit; cursor: pointer; }
pre { overflow-x: auto; padding: 12px; background: #f5f5f5; }
.machine-translation-notice { padding: 12px 16px; background: #fff5d6; border-left: 4px solid #bd8500; }
.content-rights { margin-top: 48px; color: #555; font-size: .875rem; }
.content-rights hr { border: 0; border-top: 1px solid #ccc; margin-bottom: 24px; }
.content-rights h1 { font-size: 1.1rem; }
.katex-display { overflow-x: auto; overflow-y: hidden; }
img { max-width: 100%; }
</style>`;

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

const hashes = new Map<number, string>();
for (const [problemNo, filename] of sourceProblemsByNumber) {
  const extension = extname(filename);
  const source = await readFile(join(sourceProblems, filename), "utf8");
  const html = extension === ".mdx" ? compileProblemMarkdown(source) : source;
  const published = labelPublishedProblem(html)
    .replace(
      /<\/head>/iu,
      `${styles}<link rel="stylesheet" href="../../assets/katex/katex.min.css"><script defer src="../../assets/problem-page.js"></script></head>`,
    )
    .replace(
      /<body([^>]*)>/iu,
      `<body$1><nav aria-label="문제 탐색"><a href="../../">문제 목록</a><button type="button" data-back>뒤로가기</button><a href="https://yukicoder.me/problems/no/${problemNo}">일본어 원문 보기</a></nav>`,
    )
    .replace(/<\/body>/iu, `${disclaimer}\n</body>`);
  await writeFile(join(outputProblems, `${problemNo}.html`), published, "utf8");
  hashes.set(problemNo, createHash("sha256").update(published).digest("hex"));
}
const entries = problemTitles.map((entry) => ({
  ...entry,
  htmlSha256: hashes.get(entry.problemNo)!,
}));
const catalog = parseProblemCatalog({
  schemaVersion: 1,
  revision: createHash("sha256").update(JSON.stringify(entries)).digest("hex"),
  entries,
});
await writeFile(
  join(outputRoot, "ko/problem-catalog.json"),
  JSON.stringify(catalog) + "\n",
);

const links = [...sourceProblemsByNumber.keys()]
  .sort((left, right) => left - right)
  .map(
    (number) =>
      `<li><a href="ko/problems/${number}.html">${number}번 문제</a></li>`,
  )
  .join("\n");
await writeFile(join(outputRoot, ".nojekyll"), "");
await cp(join(repositoryRoot, "README.md"), join(outputRoot, "README.md"));
await writeFile(
  join(outputRoot, "index.html"),
  `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>yukicoder 한국어 문제 번역</title>
${styles}
</head>
<body>
<h1>yukicoder 한국어 문제 번역</h1>
<p>문제 번역 ${sourceProblemsByNumber.size}개를 제공합니다. 검수 상태는 각 문서에 기록되어 있습니다.</p>
<p>Firefox와 Chrome 확장 기능이 사용하는 번역 파일입니다. 확장 기능은 번역을 먼저 표시하고 원문 변경 여부를 백그라운드에서 확인합니다.</p>
<p><a href="https://github.com/cologne1723/yuki-ko-der">소스 코드 및 설치 안내</a> · <a href="README.md">콘텐츠 권리 및 삭제 요청 / コンテンツの権利と削除依頼</a></p>
<ul>
${links}
</ul>
${disclaimer}
</body>
</html>
`,
);
