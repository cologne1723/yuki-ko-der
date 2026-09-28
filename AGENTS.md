Read [AGENTS.rules.md](AGENTS.rules.md) before coding. Translation-only tasks do not require reading it; follow [the translation workflow](problem-translations/WORKFLOW.md) instead.

문제 번역·검토·배정은 [공통 적용 원칙](problem-translations/00-policy.md)을 먼저 적용한다. 사용자 확정 표기와 최신 정정은 glossary 누락이나 일반적인 원문 유지 규칙으로 취소하지 않는다. 기존 한국어·라틴 이름을 일본어로 되돌리는 수정을 임의로 하지 않는다.

단순 수정은 Python 스크립트를 만들어 실행하지 말고 직접 패치한다. 일괄 수정(bulk 수정)은 반드시 대상과 변경 범위에 대한 사람의 명시적 승인을 받은 뒤 수행한다. 승인 없이 자동 치환이나 여러 파일에 같은 변경을 적용하지 않는다. 기존 대화에서 해당 대상과 범위의 명시적 승인을 받았다면 그 범위에서만 진행한다.

If `AGENTS.local.md` exists, consult its reference list and read only the files relevant to the current task. Keep machine-specific and agent-specific file references there, not in shared guidelines.

For problem translation reviews, read [AGENTS.rules.md](AGENTS.rules.md), then follow [the review workflow](problem-translations/REVIEW_WORKFLOW.md), including its detailed guideline and subagent procedure.
