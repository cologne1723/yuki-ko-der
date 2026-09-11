import MarkdownIt from "markdown-it";
import { JSDOM } from "jsdom";
import { build } from "esbuild";
import { buildDirectory, dataDirectory } from "translation-core/paths";

import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { cliOptions } from "translation-core/cli-options";
import { parseProblemCatalog } from "translation-core/problem-catalog";
import { compileProblemMarkdown } from "translation-core/problem-markdown";
import { readProblemTitleCatalog } from "translation-core/problem-title-catalog";
import { labelPublishedProblem } from "./problem-publication.ts";
import { sourceSamplesFingerprint } from "./problem-publication-data.ts";
import {
  problemPublicSourceUrl,
  readProblemRenderProfile,
} from "translation-core/problem-render-profile-files";
import type { ProblemRenderProfile } from "translation-core/problem-render-profile";
import { readOfflinePublicationData } from "./offline-publication-data.ts";

const repositoryRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../..",
);
export async function buildProblemTranslations(
  options: {
    sourceRoot?: string;
    dataRoot?: string;
    outputRoot?: string;
    requireRenderProfiles?: boolean;
  } = {},
) {
  const sourceRoot =
    options.sourceRoot ?? join(repositoryRoot, "problem-translations");
  const sourceProblems = join(sourceRoot, "ko", "problems");
  const offline = await readOfflinePublicationData(
    join(sourceRoot, "publication-data.json"),
  );
  const coreRequire = createRequire(
    join(repositoryRoot, "packages/translation-core/package.json"),
  );
  const katexRoot = dirname(coreRequire.resolve("katex/package.json"));
  const mathjaxRoot = dirname(coreRequire.resolve("mathjax-full/package.json"));
  const outputRoot = options.outputRoot ?? buildDirectory("problems");
  const outputProblems = join(outputRoot, "ko", "problems");
  const dataRoot =
    options.dataRoot ?? dataDirectory(process.argv.slice(2), repositoryRoot);
  const problemTitles = await readProblemTitleCatalog(
    sourceProblems,
    join(dataRoot, "problems-source/index.json"),
  );
  const readme = await readFile(join(repositoryRoot, "README.md"), "utf8");
  const noticeStart = readme.indexOf("# 콘텐츠 권리 및 삭제 요청 안내");
  if (noticeStart < 0)
    throw new Error("README content-rights notice is missing");
  const disclaimer = `<footer class="content-rights"><hr>${new MarkdownIt({ html: false }).render(readme.slice(noticeStart))}</footer>`;

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

  // Gather every blocker before replacing the existing publication directory.
  const prepared = new Map<
    number,
    {
      html: string;
      sourceSamplesSha256?: string;
    }
  >();
  const blockers: string[] = [];
  const unavailableProfiles: string[] = [];
  const missingSamples: number[] = [];
  for (const [problemNo, filename] of sourceProblemsByNumber) {
    try {
      const source = await readFile(join(sourceProblems, filename), "utf8");
      const html =
        extname(filename) === ".mdx" ? compileProblemMarkdown(source) : source;
      let profile: ProblemRenderProfile | undefined;
      try {
        profile = await readProblemRenderProfile(dataRoot, problemNo);
      } catch (error) {
        unavailableProfiles.push(`${problemNo}: ${String(error)}`);
      }
      const dom = new JSDOM(html);
      let sourceSamplesSha256: string | undefined;
      try {
        const metadata = dom.window.document.querySelector<HTMLElement>(
          "main[data-yukicoder-ko-problem]",
        )?.dataset;
        const saved = offline.get(problemNo);
        if (saved && saved.sourceHtmlSha256 !== metadata?.sourceHtmlSha256)
          throw new Error(
            "Offline publication data names a different source revision; re-export locally",
          );
        profile ??= saved?.profile;
        sourceSamplesSha256 = await sourceSamplesFingerprint(dataRoot, {
          problemNo,
          problemId: Number(metadata?.problemId),
          sourceTitle: metadata?.sourceTitle ?? "",
          sourceHtmlSha256: metadata?.sourceHtmlSha256 ?? "",
        });
        sourceSamplesSha256 ??= saved?.sourceSamplesSha256;
      } finally {
        dom.window.close();
      }
      if (!profile)
        unavailableProfiles.push(`${problemNo}: not collected or exported`);
      if (!sourceSamplesSha256) missingSamples.push(problemNo);
      // Run all deterministic publication validation before touching old output.
      const published = labelPublishedProblem(html, {
        profile,
        sourceUrl: problemPublicSourceUrl(problemNo),
      });
      prepared.set(problemNo, {
        html: published,
        sourceSamplesSha256,
      });
    } catch (error) {
      blockers.push(`${problemNo}: ${String(error)}`);
    }
  }
  if (missingSamples.length)
    console.warn(
      `Matching original revisions unavailable; sourceSamplesSha256 omitted for: ${missingSamples.join(", ")}`,
    );
  if (unavailableProfiles.length)
    console.warn(
      options.requireRenderProfiles
        ? `Required render profiles unavailable for ${unavailableProfiles.length} problems; publication will not be replaced.\n${unavailableProfiles.join("\n")}`
        : `Standalone math unavailable for ${unavailableProfiles.length} problems; translations remain in the catalog with an explicit notice.\n${unavailableProfiles.join("\n")}`,
    );
  if (options.requireRenderProfiles && unavailableProfiles.length)
    blockers.push(
      ...unavailableProfiles.map(
        (message) => `Render profile unavailable: ${message}`,
      ),
    );
  if (blockers.length)
    throw new Error(
      `Problem publication preflight failed (${blockers.length} issues).\n${blockers.join("\n")}`,
    );

  await rm(outputRoot, { recursive: true, force: true });
  await mkdir(outputProblems, { recursive: true });
  await cp(join(katexRoot, "dist"), join(outputRoot, "assets/katex"), {
    recursive: true,
  });
  await cp(
    join(mathjaxRoot, "es5/output/chtml/fonts/woff-v2"),
    join(outputRoot, "assets/mathjax/fonts/woff-v2"),
    { recursive: true },
  );
  await build({
    entryPoints: [join(repositoryRoot, "tools/audit/src/published-page.ts")],
    bundle: true,
    outfile: join(outputRoot, "assets/problem-page.js"),
    platform: "browser",
    target: "es2022",
  });

  const hashes = new Map<number, string>();
  for (const [problemNo, { html }] of prepared) {
    const published = html
      .replace(
        /<\/head>/iu,
        `${styles}<link rel="stylesheet" href="../../assets/katex/katex.min.css"><script defer src="../../assets/problem-page.js"></script></head>`,
      )
      .replace(
        /<body([^>]*)>/iu,
        `<body$1><nav aria-label="문제 탐색"><a href="../../">문제 목록</a><button type="button" data-back>뒤로가기</button><a href="https://yukicoder.me/problems/no/${problemNo}">일본어 원문 보기</a></nav>`,
      )
      .replace(/<\/body>/iu, `${disclaimer}\n</body>`);
    await writeFile(
      join(outputProblems, `${problemNo}.html`),
      published,
      "utf8",
    );
    hashes.set(problemNo, createHash("sha256").update(published).digest("hex"));
  }
  const entries = problemTitles.map((entry) => ({
    ...entry,
    htmlSha256: hashes.get(entry.problemNo)!,
    ...(prepared.get(entry.problemNo)?.sourceSamplesSha256
      ? {
          sourceSamplesSha256: prepared.get(entry.problemNo)!
            .sourceSamplesSha256,
        }
      : {}),
  }));
  const catalog = parseProblemCatalog({
    schemaVersion: 1,
    revision: createHash("sha256")
      .update(JSON.stringify(entries))
      .digest("hex"),
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
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
)
  await buildProblemTranslations({
    requireRenderProfiles: Boolean(cliOptions()["require-render-profiles"]),
  });
