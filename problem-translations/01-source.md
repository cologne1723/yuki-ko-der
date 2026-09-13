# 원문과 메타데이터

번역 시작 전에 이 파일을 읽는다.

- 원문 HTML을 처음부터 끝까지 읽는다. 제목만 보고 번역하지 않는다.
- 원문은 `node tools/show-problem-source.mjs NUMBER`로 읽는다. JSDOM으로 인라인 이미지 데이터만 가리고 본문 전체를 출력한다. 이미지는 분리 후 `view_image`로 본다. 원문에 `cat`을 쓰지 않는다.
- 행·파일명·숫자 개수를 보고할 때는 직접 센 실행 결과만 쓴다. 방법: JSDOM으로 추출한 대상에 `split`, `match` 또는 `Buffer.byteLength`를 적용한다. 눈대중 개수는 생략한다.
- `data/problems-source/index.json`에서 `No`가 정확히 일치하는 레코드를 찾는다.
  방법: 번호 전체 검색 대신 `index.problems.filter(r => Number(r.No) === problemNo)`로 고른다. 결과가 정확히 1개인지 확인하고 그 레코드의 `No`, `ProblemId`, `Title`을 함께 출력한다.
- 파일명과 URL에는 `No`를, API 식별에는 `ProblemId`를 사용한다.
- 해당 레코드의 `Title`을 `sourceTitle`에 그대로 복사한다.
- 미확정 이름을 보고하기 전에 인명·단체명인지 확인한다. `Palindromic Path (Hard)` 같은 일반 문제 제목은 번역 대상이며, glossary에 없다는 이유로 원문 유지 목록에 넣지 않는다.
- 원문 HTML 파일의 SHA-256을 `sourceHtmlSha256`에 기록한다.
- 공지, 이야기, 예제 설명, 링크, 이미지, 코드, 실제 데이터의 보존 여부를 구분한다.
- 긴 예제·URL·이미지는 재타이핑하지 않는다. JSDOM으로 원문의 textContent/속성을
  추출하고, 도구 출력 JSON을 파싱해 apply_patch 문자열에 직접 삽입한다.
  `<pre>` 시작 태그 직후의 줄바꿈 하나는 HTML 파서가 제거한다. raw HTML 정규식 결과를 실제 예제 데이터로 취급하지 말고 JSDOM의 `textContent`를 기준으로 삼는다. 그 이후의 빈 줄은 보존한다.
  PRE 안에 `<br>`가 있으면 `textContent`가 행을 붙이므로 `packages/translation-core/src/problem-samples.ts`의 `samplePreText`로 추출한다. 예: `5<br>3`은 `53`이 아니라 `5\n3`이다.
- 승인된 번역은 명시적 수정 요청 없이 바꾸지 않는다. 작업 상태·에이전트 말투를 본문에 넣지 않는다.
