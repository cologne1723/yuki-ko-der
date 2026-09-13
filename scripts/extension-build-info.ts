import { execFileSync } from "node:child_process";

export interface ExtensionBuildInfo {
  version: string;
  commit: string;
  dirty: boolean;
  builtAt: string;
}

export function extensionBuildInfo(
  root: string,
  version: string,
): ExtensionBuildInfo {
  if (!/^\d+\.\d+\.\d+(?:\.\d+)?$/.test(version))
    throw new Error("Invalid extension version");
  const git = (...args: string[]) =>
    execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
  const commit = git("rev-parse", "HEAD");
  if (!/^[a-f0-9]{40,64}$/.test(commit))
    throw new Error("Invalid build commit");
  return {
    version,
    commit,
    dirty: git("status", "--porcelain", "--untracked-files=normal").length > 0,
    builtAt: new Date().toISOString(),
  };
}

export function buildInfoPage(info: ExtensionBuildInfo): string {
  return `<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>yukicoder 한국어 번역 — 빌드 정보</title></head>
<body><main>
<h1>yukicoder 한국어 번역 — 빌드 정보</h1>
<dl><dt>버전</dt><dd>${info.version}</dd>
<dt>기준 커밋</dt><dd><a href="https://github.com/cologne1723/yuki-ko-der/commit/${info.commit}" target="_blank" rel="noopener noreferrer"><code>${info.commit}</code></a></dd>
<dt>소스 상태</dt><dd>${info.dirty ? "미커밋 변경 포함 — 위 커밋만으로 재현할 수 없는 개발 빌드입니다." : "표시된 커밋의 소스로 생성한 빌드입니다."}</dd>
<dt>빌드 시각 (UTC)</dt><dd>${info.builtAt}</dd></dl>
<p>이 정보는 설치된 확장 기능의 빌드 기준입니다. 온라인으로 불러오는 문제 번역은 별도로 갱신될 수 있습니다.</p>
<p><a href="build-info.json">빌드 정보 JSON</a></p>
</main></body></html>\n`;
}
