# 문제 번역 작업

- 사용자가 서브에이전트 작업을 요청하면 [ORCHESTRATION.md](ORCHESTRATION.md)의
  모델 지정·문제별 배정·병렬 실행 절차를 따른다.

- 모든 한국어 문제 번역은 [TRANSLATION_GUIDELINE.md](TRANSLATION_GUIDELINE.md)의
  작업 순서를 따른다. 각 단계에서 지정된 규칙 파일을 다시 읽는다.
- 번역 대상의 원문 파일을 먼저 확인하고, 메타데이터는 `No`가 정확히 일치하는
  `data/problems-source/index.json` 레코드에서 복사한다. `No`와 `ProblemId`를
  서로 바꾸지 않는다.
- 문제 파일은 `ko/problems/{problemNo}.mdx` 하나만 사용한다. HTML 대응 파일,
  문제별 JSON, 실행 가능한 MDX 구문은 추가하지 않는다.
- 반복 용어·고유명사는 `glossary.yaml`을 단일 기준으로 사용한다. 원문 파일에서
  필요한 항목만 표시하려면 `pnpm glossary -- data/problems-source/NUMBER.html`을
  실행한다. glossary 파일이 없으면 이 명령은 아무것도 출력하지 않고 성공한다.
- 새 번역은 `humanReview: null`, `machineReview: unreviewed`를 유지한다. 검토나
  커밋·배포를 임의로 수행하지 않는다.
