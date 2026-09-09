# yukicoder 한국어 번역

[yukicoder](https://yukicoder.me/)의 화면 문구와 문제를 한국어로 표시하는 Firefox·Chrome 확장 기능입니다.
문제 번역은 [GitHub Pages](https://cologne1723.github.io/yuki-ko-der/)에서 가져옵니다.

## 설치와 사용

Node.js 24와 `packageManager`에 지정된 pnpm 11.21.0을 사용합니다.
새 `git clone`에서 다음 순서로 실행합니다.

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm check

pnpm review
```

- **Firefox:** `about:debugging` → **이 Firefox** → **임시 부가 기능 로드**에서 `dist/extension/firefox/manifest.json`을 선택합니다. 브라우저를 재시작하면 다시 불러와야 합니다.
- **Chrome:** `chrome://extensions` → **개발자 모드** → **압축해제된 확장 프로그램을 로드합니다**에서 `dist/extension/chrome/`를 선택합니다.

확장 기능을 도구 모음에 고정하고 아이콘을 누르면 **파란 KO(한국어)**와 **빨간 JA(일본어 원문)**가 전환됩니다.
문제 링크와 `No.번호 문제명`도 번역된 제목으로 표시합니다.
번역이 없거나 원문 검증에 실패한 문제는 일본어로 표시합니다.

확장 코드나 화면 문구를 수정한 뒤에는 `pnpm build`를 실행하고 확장 기능을 다시 불러온 뒤 yukicoder 탭을 새로고침하세요.
이 버전으로 확장을 한 번 업데이트하면 이후 **배포된 문제 제목과 본문**은 페이지를 새로 열거나 새로고침할 때 갱신됩니다. 열려 있는 페이지는 자동으로 바뀌지 않습니다.
로컬 번역 파일을 저장하는 것만으로는 공개 번역이 갱신되지 않습니다. 문제 배포에 성공해야 반영됩니다.
문제 목록과 본문 캐시는 합계 8 MiB 안에서 오래 사용하지 않은 본문부터 정리합니다.
큰 본문은 온라인에서 표시할 수 있어도 캐시에 남지 않을 수 있습니다.
일시적인 통신 오류에는 마지막 유효한 문제 목록을 사용하며, 문제가 삭제되었거나 본문 검증에 실패하면 원문을 유지합니다. 일시적인 오류 안내의 **다시 시도**로 복구할 수 있습니다.

빌드·검사·패키지 생성과 검수 서버 시작에는 다운로드한 원문이 필요하지 않습니다.
원문이 없거나 오래되었으면 문제 검수 화면의 **원문 새로 받기**를 누르세요.
**도구와 설정**에서는 문제 번호·범위를 선택해 원문과 UI 미리보기를 받거나
이미 받은 자료를 새로 확인할 수 있습니다. 작업 결과에서 실패 항목을 다시
실행할 수 있으며, 다운로드는 번역 내용·원문 해시·승인 상태를 바꾸지 않습니다.
현재 번역과 맞지 않는 최신 원문은 별도 이력으로 보관하고 검수 필요를 알립니다.

기본 자료 폴더는 `data/`이며 **도구와 설정 → 자료 폴더**에서 다음 시작에 사용할
폴더를 저장합니다. 실행 중인 서버는 현재 폴더를 계속 사용하고 기존 자료는
이동하거나 삭제하지 않습니다. 우선순위는 명시한 `--data-dir`, 저장한 설정,
기본 `data/` 순서입니다. 상대 경로는 저장소 루트 기준입니다.
자동화에는 `pnpm run setup --problems 1,3-8 --refresh --data-dir /absolute/path`를
사용할 수 있습니다. `pnpm --dir /path/to/repo …`로 다른 디렉터리에서 실행할 수
있으며, Git 훅은 `pnpm hooks:install`로 명시적으로 설치합니다.

## 번역 편집

```sh
pnpm review
```

- [문제 검수](http://127.0.0.1:4173/): `problem-translations/ko/problems/*.mdx`를 편집합니다. [문제 번역 지침](problem-translations/TRANSLATION_GUIDELINE.md)을 따라 주세요.
- [화면 문구 검수](http://127.0.0.1:4173/ui): `translations/ko.messages.json`의 공통 문구를 편집합니다. 페이지별 사전에는 사용처 참조만 둡니다.
- [도구와 설정](http://127.0.0.1:4173/tools): 다운로드, 저장·현재 원문 검사, 문제·UI 검증, 번역 범위·문맥 검사, HTML 검사와 MDX 변환을 실행합니다. 작업은 하나씩 실행되며 중단·재시도할 수 있습니다. 페이지를 다시 열면 실행 중인 작업에 연결합니다.
- **화면 문구 검수 → 수집 ZIP 가져오기:** 여러 ZIP을 순서대로 가져온 뒤 같은 편집기에서 **초안 저장**, **승인 후 다음**, **나중에**, **번역 대상 아님**으로 작업합니다. 자료와 진행 상태는 `data/collections/`에 저장됩니다. 연결이 불확실한 문구는 **확인 필요**에 남습니다. 가져오기만으로는 번역이 바뀌지 않으며, 승인은 명시적으로 수행합니다.

편집기 옆 검사 메뉴에서도 선택한 문제나 UI 사전을 검사할 수 있습니다. 검사는
저장된 번역을 사용하며 편집 중인 내용은 유지됩니다. 입력 번역이 바뀌면 결과에
오래된 결과임을 표시합니다. HTML 변환은 먼저 미리 보고 명시적으로 저장하며,
외부에서 올린 HTML은 MDX 다운로드만 제공합니다. 새 한국어 문구와 번역 변경은
사람이 검수해야 하며 검사 통과만으로 승인되지 않습니다.

자동화에는 다음 명령을 사용할 수 있습니다.

```sh
pnpm test
pnpm validate:ui
pnpm validate:problems
pnpm lint:problems
pnpm verify:problems
```

## 저장소 구성

| 경로                                | 소유 범위                                                |
| ----------------------------------- | -------------------------------------------------------- |
| `src/`, `scripts/`, `manifest.json` | 번역 확장 런타임과 빌드·패키징                           |
| `packages/translation-core/`        | 공통 사전 규칙, 메타데이터, Markdown, 예제 비교와 렌더링 |
| `tools/review/`                     | 문제·UI 검수 서버, 편집기, 자산과 테스트                 |
| `tools/audit/`                      | 명시적 다운로드, 검증, 감사, 변환과 문제 배포 빌드       |
| `tools/ui-collector/`               | 독립적인 UI 수집 확장과 저장·내보내기                    |
| `translations/`                     | 공통 UI 문구와 페이지별 사용처                           |
| `problem-translations/`             | 문제별 편집 소스와 번역 지침                             |
| `icons/`                            | 원본 아이콘과 도구 모음 SVG                              |

`dist/`는 모든 패키지의 빌드 출력이며 `data/`는 다운로드한 원문, 미리보기와
보고서입니다. 두 경로와 `node_modules/`는 Git에서 제외합니다.

| 경로                                                    | 생성 내용              |
| ------------------------------------------------------- | ---------------------- |
| `dist/extension/{chrome,firefox}/`                      | 번역 확장              |
| `dist/collector/{chrome,firefox}/`                      | 수집 확장              |
| `dist/review/`                                          | 검수 편집기 자산       |
| `dist/problems/`                                        | 문제 번역 배포 HTML    |
| `dist/archives/{extension,collector}/`                  | 확장 ZIP               |
| `data/problems-source/`, `data/pages/`, `data/reports/` | 원문, 미리보기, 보고서 |

보고서와 캡처는 각각 `data/reports/`와 `data/pages/`에 보관합니다.
이미지 작업 원본은 `data/assets/`에 보관합니다. 검증용 복제본, 일회성 작업 스크립트와
이전 빌드 백업은 작업을 마친 뒤 검증 결과를 기록하고 정리합니다.

각 빌드는 자신의 출력만 갱신합니다. 도구 모음 PNG는 확장 빌드 출력에 직접 생성합니다.
수집 확장은 `pnpm --filter ui-collector-internal build`로 별도 빌드하며
[설치 및 사용 안내](tools/ui-collector/README.md)를 따릅니다.

## 배포

- **확장 기능:** `pnpm package`로 `dist/archives/extension/`에 ZIP을 생성합니다. Firefox·Chrome 스토어에는 별도로 제출합니다.
- **문제 번역:** [Pages 설정](https://github.com/cologne1723/yuki-ko-der/settings/pages)에서 **GitHub Actions**를 선택합니다. `main`에 문제 번역 변경을 푸시하거나 **문제 번역 배포** 워크플로를 직접 실행하면 검증·컴파일 후 배포됩니다.

# 콘텐츠 권리 및 삭제 요청 안내 / コンテンツの権利と削除依頼

이 프로젝트에서 복제하고 번역한 yukicoder 원문과 그 밖의 컨텐츠는 제 소유가 아닙니다.
해당 컨텐츠의 모든 권리는 각 권리자에게 있습니다.
이 프로젝트는 독립적인 번역 프로젝트이고, yukicoder 또는 원저작자와 제휴하거나 그들의 승인을 받은 프로젝트가 아닙니다.

[GitHub 이슈를 등록](https://github.com/cologne1723/yuki-ko-der/issues/new)해서 문제의 삭제 요청을 주신 경우, 해당 컨텐츠를 즉시 삭제하도록 하겠습니다.

本プロジェクトで複製または翻訳したyukicoderの問題原文、およびそのコンテンツは私の所有ではありません。
そのコンテンツのすべての権利は各権利者にあります。
このプロジェクトは独立した翻訳プロジェクトであり、yukicoderや原作者と提携または承認したプロジェクトではありません。

[GitHub issueを登録]（https://github.com/cologne1723/yuki-ko-der/issues/new）で問題の削除リクエストをいただいた場合は、対象のコンテンツをすぐに削除します。
