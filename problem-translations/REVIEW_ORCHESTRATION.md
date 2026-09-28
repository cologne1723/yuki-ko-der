# 검토 작업 배정

검토 기준과 단계는 [REVIEW_WORKFLOW.md](REVIEW_WORKFLOW.md)와
[REVIEW_GUIDELINE.md](REVIEW_GUIDELINE.md)를 따른다.
배정 원칙은 [ORCHESTRATION.md](ORCHESTRATION.md)를 함께 적용한다.

검토만 요청받은 작업과 수정·기계 검수를 구분하고, 요청 범위를 담당자에게 명시한다.
담당자에게 [00-policy.md](00-policy.md)와 해당 문제의 구체적인 사용자 확정 표기를 전달한다.
glossary 조회가 비었다는 이유로 기존 한국어·라틴 이름을 일본어로 되돌리지 않았는지 부모가 diff를 확인한다.
기존 승인본의 내용 검사는 `--require-unreviewed` 없이 수행한다. 상태 기록 권한과 내용 검사 통과는 별개다.
환경별 생성 호출·단계별 메시지 예시는 로컬 전용
루트 `AGENTS.local.md`의 참고 목록에서 해당 실행 환경의 문서만 읽는다.
과거 실행 기록은 현재 도구 지원이나 수정·승인 권한의 근거가 아니다.
