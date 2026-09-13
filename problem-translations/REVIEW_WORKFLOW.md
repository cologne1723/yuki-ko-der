# 문제 번역 검토 작업

- 먼저 저장소의 [AGENTS.md](../AGENTS.md)와 [AGENTS.rules.md](../AGENTS.rules.md)를
  읽는다. 사용자에게 보내는 진행·완료 보고에는 지정된 말투를 적용하고,
  번역 본문에는 대화용 말투를 넣지 않는다.
- 모든 한국어 문제 번역 검토는 [REVIEW_GUIDELINE.md](REVIEW_GUIDELINE.md)의
  작업 순서를 따른다. 각 단계에서 지정된 규칙 파일을 다시 읽는다.
- 사용자가 서브에이전트 검토를 요청하면
  배정 담당자는 [REVIEW_ORCHESTRATION.md](REVIEW_ORCHESTRATION.md)를 읽는다.
  모델·도구·병렬 한도는 공통 번역 기준이 아니라 환경별 실행 설정으로 관리한다.
  단독 검토도 같은 단계와 완료 기준을
  적용한다. 문서 작성 요청만으로 실제 문제 검토를 시작하지 않는다.
- 번역 내용 확인에 사용하는 규칙 파일은 번역 작업과 같은 `01-source.md`, `02-meaning.md`,
  `03-structure-and-format.md`, `04-verification.md`와 `glossary.yaml`이다.
  검토는 원문·번역의 의미, 조건, 입출력, 예제가 모순되는지에 중점을 둔다.
  공유 규칙이 허용하는 표현·서식 선택이 명백히 틀리지 않으면 승인한다. 단순 문체·서식 취향은
  기계 승인 보류 사유가 아니다.
- 검토 대상은 기존 `ko/problems/{problemNo}.mdx`와 해당 문제의 이미지 파일이다.
  원문 HTML 전체와 `data/problems-source/index.json`의 `No`가 정확히 일치하는
  레코드를 확인한다. `No`와 `ProblemId`를 서로 바꾸지 않는다.
- 반복 용어·고유명사는 `pnpm glossary -- data/problems-source/NUMBER.html`로
  필요한 항목만 조회한다. glossary 전체를 열지 않는다.
- 검토만 요청받았다면 발견 사항을 보고한다. 수정도 요청받았다면 해당 범위의
  명백한 오류를 수정하고 저장본 전체를 다시 대조·검증한다. 승인된 번역은 명시적
  수정 요청 없이 바꾸지 않는다.
- 기계 검수 요청에는 `machineReview` 판정·기록이 포함된다. 전체 대조와 검증을
  통과하면 `approved`, 명백한 공유 규칙 위반·오류·모순 또는 판정에 필요한 미검증 범위가 남으면 `unreviewed`로 유지한다.
  `reviewStatus: machine`은 레거시이며 기계검수 완료로 세지 않는다.
- 사람 검수는 `humanReview`의 검수자 ID 목록으로 별도 관리한다. 사람의 사전 확인을 기계 검수의
  조건으로 요구하거나 기계 검수 결과로 사람 승인을 기록하지 않는다.
  커밋·배포는 명시적 요청 없이 수행하지 않는다.
- 임시 파일·작업 메모는 `data/stray/`, 생성한 검토 보고서는 `data/reports/`에
  둔다. 두 디렉터리는 로컬 전용이다. 검토 근거를 번역 본문에 넣지 않는다.
