# yukicoder 한국어 번역

[yukicoder](https://yukicoder.me/)의 화면 문구와 문제를 한국어로 표시하는 Firefox·Chrome 확장 기능입니다.
문제 번역은 [GitHub Pages](https://cologne1723.github.io/yuki-ko-der/)에서 제공합니다.

- 도구 모음 아이콘으로 **KO(한국어)**와 **JA(일본어 원문)**를 전환합니다.
- 문제 제목과 본문, 메뉴와 안내 문구를 번역합니다.
- 문제 본문 안내에 **한국어 번역본 입니다.** 또는 **일본어 원문입니다**를 표시하고, 버튼으로 두 본문을 오갈 수 있습니다.
- 문제 번역을 먼저 표시하고 원문 변경 여부를 백그라운드에서 확인합니다. 변경이 감지되면 안내하며, **원문 보기**로 언제든 돌아갈 수 있습니다.
- 번역을 불러오는 동안 로딩 안내를 표시하며, 번역이 없거나 번역 파일 검증에 실패하면 일본어 원문을 유지합니다.

## 설치

- Firefox: [Mozilla Add-ons에서 설치](https://addons.mozilla.org/en-US/firefox/addon/yuki-ko-der/)합니다.
- Chrome: [Chrome용 ZIP 다운로드](https://cologne1723.github.io/yuki-ko-der/downloads/yukicoder-ko-chrome.zip)를 이용합니다. GitHub 로그인이나 로컬 빌드는 필요하지 않습니다.

Chrome은 ZIP을 계속 보관할 폴더에 압축 해제한 뒤, `chrome://extensions`에서 **개발자 모드**를 켜고 **압축해제된 확장 프로그램을 로드합니다**를 눌러 `manifest.json`이 있는 폴더를 선택합니다. ZIP 자체를 가져오는 방식은 아닙니다. 설치 폴더는 삭제하지 마세요.

Chrome 확장을 업데이트할 때는 새 ZIP을 같은 폴더에 압축 해제하고 확장 관리 화면에서 새로고침합니다.

## 개발용 로컬 설치

Node.js 24와 pnpm 11.21.0이 필요합니다. 저장소를 받은 뒤 다음 명령으로 빌드합니다.

```sh
git clone https://github.com/cologne1723/yuki-ko-der.git
cd yuki-ko-der
pnpm install --frozen-lockfile
pnpm build
```

| 브라우저 | 설치 방법                                                                                                             |
| -------- | --------------------------------------------------------------------------------------------------------------------- |
| Firefox  | `about:debugging` → **이 Firefox** → **임시 부가 기능 로드**에서 `dist/extension/firefox/manifest.json` 선택          |
| Chrome   | `chrome://extensions` → **개발자 모드** → **압축해제된 확장 프로그램을 로드합니다**에서 `dist/extension/chrome/` 선택 |

Firefox의 임시 설치는 브라우저를 재시작하면 해제됩니다.
설치 후 확장 기능을 도구 모음에 고정하고 yukicoder 페이지를 새로고침하세요.

## 사용과 업데이트

아이콘의 **파란 KO**는 한국어, **빨간 JA**는 일본어 표시 상태입니다.
아이콘을 누르면 현재 페이지의 언어가 바뀝니다.

배포된 문제 번역은 페이지를 다시 열거나 새로고침할 때 갱신됩니다.
확장 코드나 화면 문구를 로컬에서 수정했다면 `pnpm build` 후 확장 기능을 다시 불러오세요.
통신 오류 안내가 나오면 **다시 시도**를 누를 수 있습니다.

## 번역 편집

```sh
pnpm review
```

[검수 화면](http://127.0.0.1:4173/)에서 문제와 UI 문구를 편집합니다.
햄버거 메뉴로 다음 화면을 열 수 있습니다.

- **문제 목록:** 문제를 검색하고 일본어 원문·한국어 미리보기·번역 소스를 함께 확인합니다.
- **UI 용어집:** 여러 페이지에서 사용하는 공통 번역 문구를 편집합니다.
- **ZIP 가져오기:** UI 수집 확장이 내보낸 자료를 가져와 문구를 검수합니다.
- **도구와 설정:** 원문·미리보기 다운로드, 번역 검사와 자료 폴더 설정을 관리합니다.

다운로드한 원문 없이도 검수 서버를 시작할 수 있습니다.
원문이 없거나 오래되었다면 편집기의 **원문 새로 받기** 또는 **도구와 설정**을 사용하세요.
받은 자료는 기본적으로 `data/`에 보관합니다.

저장과 검수 승인은 별개입니다. 새 한국어 번역은 사람이 검수해야 하며, 자동 검사 통과만으로 승인되지 않습니다.
로컬에서 저장한 문제 번역은 배포가 완료되어야 공개 페이지에 반영됩니다.
[문제 번역 지침](problem-translations/TRANSLATION_GUIDELINE.md)과 [검수 도구 안내](tools/review/README.md)를 참고하세요.

## 개발과 배포

| 명령                   | 용도                                                             |
| ---------------------- | ---------------------------------------------------------------- |
| `pnpm check`           | 서식·타입·번역 검증, 전체 빌드와 테스트                          |
| `pnpm review:smoke`    | 임시 데이터로 검수 서버의 HTTP 동작 확인                         |
| `pnpm package`         | 확장을 빌드하고 `dist/archives/extension/`에 브라우저별 ZIP 생성 |
| `pnpm verify:problems` | 문제 번역을 실제 원문과 대조                                     |
| `pnpm build:problems`  | 문제 번역 배포 파일을 `dist/problems/`에 생성                    |

빌드와 배포는 yukicoder 서버에서 원문을 다운로드하지 않고 로컬 번역 파일을 검증합니다.
원문 갱신이 필요할 때만 `pnpm run setup --problems 1 --refresh`를 실행하세요.
`1` 대신 `1,3-8`처럼 대상 문제를 지정할 수 있습니다.
`pnpm verify:problems --problems 1`은 지정한 문제를 실제 원문과 대조하며, 파일을 갱신하지 않습니다.
대상을 생략하면 전체 문제에 요청하므로 필요할 때만 실행하세요.

`main`에 배포 대상 변경을 푸시하면 GitHub Actions가 로컬 검증 후 GitHub Pages에 배포합니다.
[문제 번역 배포 워크플로](https://github.com/cologne1723/yuki-ko-der/actions/workflows/publish-problem-translations.yml)를 직접 실행할 수도 있습니다.
Pages에는 문제 번역 파일과 Chrome 설치용 ZIP이 함께 배포되며, 검수 편집기는 로컬에서 실행합니다.
Pages 빌드 후 `pnpm build`와 `pnpm package:built --pages`를 실행하면 다운로드 ZIP을 포함할 수 있습니다. 기존 Actions artifact도 유지합니다.

## 저장소 안내

| 경로                                                                | 내용                                    |
| ------------------------------------------------------------------- | --------------------------------------- |
| `src/`, `scripts/`                                                  | 번역 확장과 빌드·패키징                 |
| [`packages/translation-core/`](packages/translation-core/README.md) | 공통 번역 규칙·메타데이터·Markdown 처리 |
| [`tools/review/`](tools/review/README.md)                           | 문제·UI 검수 편집기와 서버              |
| [`tools/audit/`](tools/audit/README.md)                             | 다운로드·검증·변환 명령                 |
| [`tools/ui-collector/`](tools/ui-collector/README.md)               | 별도로 설치하는 UI 수집 확장            |
| `translations/`                                                     | UI 공통 문구와 페이지별 사용처          |
| `problem-translations/`                                             | 문제별 번역 소스와 지침                 |

태그 번역 소스와 검토 안내는 [`translations/tags/`](translations/tags/README.md)에 있습니다.

`dist/`는 빌드 결과, `data/`는 다운로드한 원문·미리보기·작업 기록입니다.
보고서는 `data/reports/`, 임시 파일과 메모(`report.md` 등)는 `data/stray/`에 보관합니다.
두 폴더와 `node_modules/`는 Git에 포함하지 않습니다.

## 라이선스

이 프로젝트에서 직접 작성한 코드는 [MIT 라이선스](LICENSE)로 제공합니다.
저작권 및 라이선스 고지를 유지하면 사용·수정·재배포·상업적 이용이 가능합니다.
yukicoder 문제 원문과 이에 기반한 번역·이미지 등 콘텐츠는 이 MIT 라이선스의 적용 대상이 아닙니다.
외부 라이브러리와 그 밖의 제3자 자료는 각각의 라이선스 및 권리 조건을 따릅니다.

# 콘텐츠 권리 및 삭제 요청 안내 / コンテンツの権利と削除依頼

이 프로젝트에서 복제하고 번역한 yukicoder 원문과 그 밖의 컨텐츠는 제 소유가 아닙니다.
해당 컨텐츠의 모든 권리는 각 권리자에게 있습니다.
이 프로젝트는 독립적인 번역 프로젝트이고, yukicoder 또는 원저작자와 제휴하거나 그들의 승인을 받은 프로젝트가 아닙니다.

[GitHub 이슈를 등록](https://github.com/cologne1723/yuki-ko-der/issues/new)해서 문제의 삭제 요청을 주신 경우, 해당 컨텐츠를 즉시 삭제하도록 하겠습니다.

本プロジェクトで複製または翻訳したyukicoderの問題原文、およびそのコンテンツは私の所有ではありません。
そのコンテンツのすべての権利は各権利者にあります。
このプロジェクトは独立した翻訳プロジェクトであり、yukicoderや原作者と提携または承認したプロジェクトではありません。

[GitHub issueを登録](https://github.com/cologne1723/yuki-ko-der/issues/new)で問題の削除リクエストをいただいた場合は、対象のコンテンツをすぐに削除します。
