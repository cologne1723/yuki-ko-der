# yukicoder 한국어 번역

[yukicoder](https://yukicoder.me/)의 화면 문구와 문제를 한국어로 표시하는 Firefox·Chrome 확장 기능입니다.
문제 번역은 [GitHub Pages](https://cologne1723.github.io/yuki-ko-der/)에서 제공합니다.

- 도구 모음 아이콘으로 **KO(한국어)**와 **JA(일본어 원문)**를 전환합니다.
- 문제 제목과 본문, 메뉴와 안내 문구를 번역합니다.
- 검수되지 않은 문제 번역에는 **(기계번역입니다)**를 표시합니다.
- 번역이 없거나 원문 검증에 실패하면 일본어 원문을 유지합니다.

## 로컬 설치

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

`main`에 배포 대상 변경을 푸시하면 GitHub Actions가 문제 번역을 검증하고 GitHub Pages에 배포합니다.
[문제 번역 배포 워크플로](https://github.com/cologne1723/yuki-ko-der/actions/workflows/publish-problem-translations.yml)를 직접 실행할 수도 있습니다.
Pages에는 문제 번역 파일이 배포되며, 검수 편집기는 로컬에서 실행합니다.

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

`dist/`는 빌드 결과, `data/`는 다운로드한 원문·미리보기·작업 기록입니다.
두 폴더와 `node_modules/`는 Git에 포함하지 않습니다.

# 콘텐츠 권리 및 삭제 요청 안내 / コンテンツの権利と削除依頼

이 프로젝트에서 복제하고 번역한 yukicoder 원문과 그 밖의 컨텐츠는 제 소유가 아닙니다.
해당 컨텐츠의 모든 권리는 각 권리자에게 있습니다.
이 프로젝트는 독립적인 번역 프로젝트이고, yukicoder 또는 원저작자와 제휴하거나 그들의 승인을 받은 프로젝트가 아닙니다.

[GitHub 이슈를 등록](https://github.com/cologne1723/yuki-ko-der/issues/new)해서 문제의 삭제 요청을 주신 경우, 해당 컨텐츠를 즉시 삭제하도록 하겠습니다.

本プロジェクトで複製または翻訳したyukicoderの問題原文、およびそのコンテンツは私の所有ではありません。
そのコンテンツのすべての権利は各権利者にあります。
このプロジェクトは独立した翻訳プロジェクトであり、yukicoderや原作者と提携または承認したプロジェクトではありません。

[GitHub issueを登録](https://github.com/cologne1723/yuki-ko-der/issues/new)で問題の削除リクエストをいただいた場合は、対象のコンテンツをすぐに削除します。
