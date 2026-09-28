# 문제 번역 작업

- 먼저 [공통 적용 원칙](00-policy.md)을 읽는다. 사용자 확정 표기·최신 정정과 기존 표기 보호를 단계별 규칙보다 먼저 적용한다.

- 수정 전에 `humanReview`를 확인한다. `true` 또는 비어 있지 않은 검수자 ID 목록이면
  [승인된 번역 보호 규칙](TRANSLATION_GUIDELINE.md#승인된-번역-보호-규칙)에 따라 사용자의 해당 번역에 대한 명시적
  수정 허가 없이는 절대로 수정하지 않는다. 일반적인 오류 수정·간결화 요청은 허가가 아니다.
  승인 기록을 지우거나 비워 수정 가능 상태로 만드는 것도 금지한다.

- 사용자가 서브에이전트 작업을 요청하면 배정 담당자만
  [ORCHESTRATION.md](ORCHESTRATION.md)를 읽는다. 개별 번역 담당자는 아래 단계에서 시작한다.

- 모든 한국어 문제 번역은 [TRANSLATION_GUIDELINE.md](TRANSLATION_GUIDELINE.md)의
  작업 순서를 따른다. 각 단계에서 지정된 규칙 파일을 다시 읽는다.
  규칙 링크의 상대 경로는 저장소 루트가 아니라 이 문서가 있는 `problem-translations/` 기준이다.
- 번역 대상의 원문 파일을 먼저 확인하고, 메타데이터는 `No`가 정확히 일치하는
  `data/problems-source/index.json` 레코드에서 복사한다. `No`와 `ProblemId`를
  서로 바꾸지 않는다.
- 문제 파일은 `ko/problems/{problemNo}.mdx` 하나만 사용한다. HTML 대응 파일,
  문제별 JSON, 실행 가능한 MDX 구문은 추가하지 않는다.
  인라인 base64 이미지의 별도 파일은 예외이며 [이미지 파일 규칙](03-structure-and-format.md#이미지-파일)을 따른다.
- 반복 용어·고유명사는 사용자 확정 지시를 우선하고 `glossary.yaml`의 대응을 확인한다. 누락·조회 0건을 근거로 기존 이름을 일본어로 되돌리지 않는다. 원문 파일에서
  필요한 항목만 표시하려면 `pnpm glossary -- data/problems-source/NUMBER.html`을
  실행한다. glossary 파일이 없으면 이 명령은 아무것도 출력하지 않고 성공한다.
- 새 번역은 `humanReview: []`, `machineReview: unreviewed`를 유지한다. 검토나
  커밋·배포를 임의로 수행하지 않는다.
