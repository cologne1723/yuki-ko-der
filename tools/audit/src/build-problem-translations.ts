import MarkdownIt from "markdown-it";
import { buildDirectory } from "translation-core/paths";

import { createHash } from "node:crypto";
import { cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseProblemCatalog } from "translation-core/problem-catalog";
import { compileProblemMarkdown } from "translation-core/problem-markdown";
import { readProblemTitleCatalog } from "translation-core/problem-title-catalog";

const repositoryRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../..",
);
const sourceRoot = join(repositoryRoot, "problem-translations");
const sourceProblems = join(sourceRoot, "ko", "problems");
const outputRoot = buildDirectory("problems");
const outputProblems = join(outputRoot, "ko", "problems");
const readme = await readFile(join(repositoryRoot, "README.md"), "utf8");
const noticeStart = readme.indexOf("# 콘텐츠 권리 및 삭제 요청 안내");
if (noticeStart < 0) throw new Error("README content-rights notice is missing");
const disclaimer = `<footer>${new MarkdownIt({ html: false }).render(readme.slice(noticeStart))}</footer>`;

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

const hashes = new Map<number, string>();
for (const [problemNo, filename] of sourceProblemsByNumber) {
  const extension = extname(filename);
  const source = await readFile(join(sourceProblems, filename), "utf8");
  const html = extension === ".mdx" ? compileProblemMarkdown(source) : source;
  const published = html
    .replace(
      /<body([^>]*)>/iu,
      `<body$1><nav aria-label="원문"><a href="https://yukicoder.me/problems/no/${problemNo}">일본어 원문 보기</a></nav>`,
    )
    .replace(/<\/body>/iu, `${disclaimer}\n</body>`);
  await writeFile(join(outputProblems, `${problemNo}.html`), published, "utf8");
  hashes.set(problemNo, createHash("sha256").update(published).digest("hex"));
}
const entries = (await readProblemTitleCatalog(sourceProblems)).map(
  (entry) => ({ ...entry, htmlSha256: hashes.get(entry.problemNo)! }),
);
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
</head>
<body>
<h1>yukicoder 한국어 문제 번역</h1>
${disclaimer}
<p>문제 번역 ${sourceProblemsByNumber.size}개를 제공합니다. 검수 상태는 각 문서에 기록되어 있습니다.</p>
<p>Firefox와 Chrome 확장 기능이 사용하는 번역 파일입니다. 확장 기능은 원문을 검증한 뒤 번역을 적용합니다.</p>
<p><a href="https://github.com/cologne1723/yuki-ko-der">소스 코드 및 설치 안내</a> · <a href="README.md">콘텐츠 권리 및 삭제 요청 / コンテンツの権利と削除依頼</a> · <a href="README.md">개인정보 안내 / プライバシーについて</a></p>
<ul>
${links}
</ul>
</body>
</html>
`,
);
