# 번역 차단 항목 (BLOCKER)

## 신규 원문 확인 대기 (2026-09-13)

- **3705 — 부분점 참조 불일치:** 공식 원문의 부분점 표는 소과제 1·2·3을 정의하지만, 예제 1 설명은 소과제 2·4의 제한을 만족한다고 적혀 있다. 번역에는 원문대로 보존했다. 올바른 참조 번호는 출제자 확인이 필요하며, 자동 검사 통과로 해결 처리하지 않는다. 아래 85개 스냅샷 집계와 별개다.

기준: 2026-09-12, [작업 기록](data/reports/translation-all-agents-2026-09-10.json)의 `phase: blocked` **85개** 스냅샷.

이 문서는 기존 차단 사유를 정리한 해결 목록이다. 이번 작성 중 원문 충돌·자동 검사·외부 리소스를 새로 재검증하지 않았다. 따라서 과거의 검사기/렌더러 문제는 현재 이미 해결되었을 수 있으며, 먼저 재현해야 한다. 작업 중인 메인 스레드의 상태·번역·검사기는 변경하지 않았다.

각 문제는 대표 원인으로 한 번만 분류했다. 한 문제에 여러 원인이 있으면 기록된 사유와 해결 항목에 함께 적었다. 사용자 판단이 필요한 원문/표기 결정과 개발·검증 작업을 구분한다. 체크박스는 이 문서의 해결 메모용이며 번역 승인이나 작업 기록의 완료 상태를 자동 변경하지 않는다.

## 분류 요약

| 대표 원인                    | 문제 수 | 주된 해결 작업                       |
| ---------------------------- | ------: | ------------------------------------ |
| 원문 조건·예제·부분점 충돌   |      26 | 정본·의도·채점 기준 확인             |
| 제목·암호문 해석             |       4 | 의미/한국어 표기 또는 원문 유지 결정 |
| 숨김·상호작용·음성·표시 방향 |      11 | 퍼즐 효과 보존 방식·음성 확인        |
| 이미지 렌더링·외부 리소스    |       9 | 파일/표시 지원 및 미리보기 검증      |
| 독립 검산·증명 미완료        |       2 | 정확한 계산/증명                     |
| 검사기 지원·오탐             |      33 | 현행 검사 재현 후 지원 보완          |

## 해결 기록 방법

문제별 `결정/근거`에 적용할 정정 내용, 정본 링크 또는 파일, 표기 결정을 적는다. 기술 문제는 재현 결과와 수정/검증 근거를 적는다. 결정 후에는 해당 번역을 반영·전체 대조하고 검사를 다시 수행해야 한다. 원문 예제의 마지막 줄바꿈 하나 차이는 해결 대상이 아니다. 기존 `219.mdx:24` 공백 오류는 이 85개의 개별 차단 원인에 추가하지 않았다.

### 2026-09-13 지시 반영

- 작업 범위는 당시 남은 재검증·차단 문제뿐이다. 이미 완료된 문제는 재배정하지 않는다.
- 아래 `결정/근거`의 사용자 지시를 적용한다. `네타 문제는 미번역`인 항목은 번역하지 않으며, 번역 완료와 구분해 사용자 결정에 따른 제외로 기록한다. 기존 초안을 임의로 삭제하지 않는다.
- `번역 보류`·`사람이 풀어보고 결정`인 항목은 그 대기를 유지한다. 확인되지 않은 원문 정정을 확정하거나 자동 검사 통과로 대기를 해소하지 않는다.
- 번역자 주석을 명시한 항목은 원문과 구별되는 주석으로 반영한다. 이 지시는 일반적인 원문 외 설명 금지의 해당 문제별 예외다. 질문 작성·실제 발송·답변 수신은 각각 별도로 기록하며, 발송 확인 없이 보냈다고 쓰지 않는다.
- 표기 결정이나 기술 해결이 있는 항목은 반영 후 전체 대조·검사를 마친 뒤에만 해결 확인을 갱신한다. 위 85개 표는 최초 스냅샷이며 현재 진행 수가 아니다.

## 1. 원문 조건·예제·부분점 충돌 (26개)

원문·채점 기준 중 적용할 정의와 정정 내용을 확정한다. 실제 예제 데이터는 근거 없이 변경하지 않는다.

### 2814

- [x] 해결 확인
- 자료: [원문](data/problems-source/2814.html) · [원사이트](https://yukicoder.me/problems/no/2814)
- 기록된 차단 사유: 원문 합산횟수 N-1회 이하만으로 최종원소1개 보장되지 않음(N3/0회 반례). 추가 종료조건 원문없음. 정확히N-1회로 임의변경하지 않고 원문유지.
- 필요한 해결: 최종 원소가 정확히 1개여야 하는지, 연산 횟수/종료 조건을 확정한다.
- 결정/근거: "N-1회 이하 조작을 반복한다"가 아니라 "N-1회, 이하(following)의 조작을 반복한다."로 해석하는게 맞음
- 반영/검증 (2026-09-13): 후처리를 정확히 N-1회로 반영했다. 원문·저장본 전체 대조, N=3 minimax/예제 전체 과정·N=1 경계 확인 및 validate/lint/미승인 보존 검사 통과. [재검증 기록](data/reports/translation-2814-3317-2026-09-13.md). 번역 승인과 별개다.

### 2862

- [ ] 해결 확인
- 자료: [원문](data/problems-source/2862.html) · [원사이트](https://yukicoder.me/problems/no/2862)
- 기록된 차단 사유: 原文예제2 N=10이나S=45616572034길이11. 데이터수정의도미확정. translation-2862-source-conflict-2026-09-12.md. 형식교정중/완료아님.
- 필요한 해결: 예제 2의 N=10과 길이 11 문자열 중 어느 쪽을 고칠지 정답 원본을 제공한다.
- 결정/근거: "질문을 생성해서 보냄. 그 전까지 translator's note로 문제가 잘못되어 보인다고 말함"
- 반영/검증 (2026-09-13): 길이 11을 재계산하고 MDX 상단에 원문과 분리한 번역자 주를 추가했다. 실제 예제 데이터는 유지했으며 전체 대조·validate/lint/미승인 보존 검사를 통과했다. [질문 초안과 근거](data/reports/translation-blocker-clarifications-2026-09-13.md)는 로컬에 작성했지만 **미발송**이다. 원문 정정 답변 대기는 유지한다.

### 2985

- [ ] 해결 확인
- 2026-09-13 지시 반영: 기존 번역은 수정하지 않고, 원문 전체와 예제1 부분집합 열거를 확인해 [질문 초안](data/reports/translation-2985-question-2026-09-13.md)을 작성했다. 미발송이며 사람 풀이·원문 정정 확인 대기를 유지한다.
- 자료: [원문](data/problems-source/2985.html) · [원사이트](https://yukicoder.me/problems/no/2985)
- 기록된 차단 사유: Source sample1 conflicts with A+TB: exhaustive enumeration A2 B1 T10000 gives10002, source output20001. Samples2/3 agree. Raw data retained, translator notes kept in report only. All gates/explicit KaTeX pass but meaning conflict unresolved.
- 필요한 해결: 예제 1의 식 A+TB와 출력 20001 중 올바른 정의/데이터를 확정한다(기록된 계산값 10002).
- 결정/근거: "질문을 생성해서 보냄. 그 전까지 번역을 하지 않음. 사람이 직접 문제를 풀어보고 확인"

### 3262

- [ ] 해결 확인
- 자료: [원문](data/problems-source/3262.html) · [원사이트](https://yukicoder.me/problems/no/3262)
- 기록된 차단 사유: 원문도입i원안→p_i문제와엄밀조건p_i원안→i문제의역방향충돌. 예제p는자기역순열이라판별불가。個数は逆順列の全単射で同じだが定義の不一致は残る。원문유지하고완료수제외.
- 필요한 해결: 순열 대응을 i→p_i로 할지 p_i→i로 할지 확정한다.
- 결정/근거: "질문을 생성해서 보냄. 그 전까지 translator's note로 엄밀한 문제의 p의 정의가 다르다고 보냄"
- 반영/검증 (2026-09-13): 양쪽 정의를 유지한 번역자 주를 추가했다. 모든 예제 순열 검산, 원문/최종 전체 대조, GIF 8프레임의 문구 번역 및 실제 미리보기, 제목 렌더, validate/lint/미승인 보존 검사 완료. [질문 초안과 근거](data/reports/translation-blocker-clarifications-2026-09-13.md)는 **미발송**이며 공식 정의 확인 대기는 유지한다.

### 3324

- [ ] 해결 확인
- 자료: [원문](data/problems-source/3324.html) · [원사이트](https://yukicoder.me/problems/no/3324)
- 기록된 차단 사유: 원문분할정의의개수x에범위1<=k<=N표기. 길이M인A의끝인덱스는N+1로되어예제1N10/M6에서A7..10이존재하지않음. 사용자확인필요.
- 필요한 해결: 분할 개수 x, 범위 k, 배열 길이 M에 맞는 마지막 인덱스를 확정한다.
- 결정/근거: 인덱스는 맞는 표시를 사용해야함. clar를 보냄 예제에 대해서는 A는 일반적인 배열을 의미하는 것으로 보임. 질문을 생성해서 보내고, 번역은 그냥 진행함
- 반영/검증 (2026-09-13): 사용자 지시대로 x의 범위와 마지막 인덱스를 배열 길이 M에 맞게 정정하고 원문 표기/근거를 번역자 주로 명시했다. 일반 배열 예시는 유지했다. 전체 대조·예제 최소 분할 검산·3검사 완료. [질문 초안 및 검증 기록](data/reports/translation-3205-3213-3214-3232-3266-3324-2026-09-13.md)은 미발송이며 공식 확인은 대기한다. 번역 재검증은 완료했다.

### 3390

- [ ] 해결 확인
- 자료: [원문](data/problems-source/3390.html) · [원사이트](https://yukicoder.me/problems/no/3390)
- 기록된 차단 사유: 부모 원문/저장본 전체 및7이미지 시각확인. 3예제 모든연산 직접시뮬레이션 출력/예제1대상집합 전부확인. 6번째 입력2 1 -1/출력3과 원문 설명·그림7(4공개/1비공개) 충돌. 설명은1공개로 수정요청했으나 원문그림 보존하여 미해결 보류. validate/lint/preservation통과(프로필없음), 별도KaTeX 미실행.
- 필요한 해결: 예제 그림 7의 공개/비공개 상태를 실제 연산과 일치시키는 정정 방식을 정한다.
- 결정/근거: "질문을 통해서 clar를 보냄, 그 전에는 translators note로 그림이 이상해보인다고 보냄"
- 반영/검증 (2026-09-13): 마지막 원문 그림과 설명의 오류를 번역자 주로 명시했다. 원본 이미지/예제 데이터 유지, 모든 질의와 대상 집합 검산, 이미지 7개 육안·바이트·실제 미리보기 및 전체 대조·validate/lint/미승인 보존 검사 완료. [질문 초안과 근거](data/reports/translation-blocker-clarifications-2026-09-13.md)는 **미발송**이며 공식 정정 확인은 대기한다.

### 3439

- [ ] 해결 확인
- 자료: [원문](data/problems-source/3439.html) · [원사이트](https://yukicoder.me/problems/no/3439)
- 기록된 차단 사유: 부모원문/최종저장본전체대조. 注記 모듈러확률정의전체누락·Cherry-chan변형·rooted tree미번역·원문없는검증메모추가수정확인. 원문2026/01/24결함공지보존. 부모트리생성전수열거: 예제1첫질의확률0,5/17,7/17,5/17(mod0 704643073 587202561 704643073)로원문0,1/4,1/2,1/4와충돌; 두번째질의0 840626824 157617530 0 0일치. 원문충돌로보류·예제데이터임의수정안함. 이미지ko/images/3439/1.png분리·시각확인(바배경WriterKazun/Tester p-adic표지). 분리전부모validate/lint/preservation/KaTeX통과; 분리후실제파일보존/미리보기통합검증대기.
- 필요한 해결: 확률 분포/트리 생성 방식 또는 예제 1 첫 질의의 정답을 확정한다.
- 결정/근거: "번역문을 확인하고, 실제로 문제가 잘못된것인지 전수조사를 사람이 한 이후, clar를 보냄"
- 이미지 후속 완료 (2026-09-13): 로컬 이미지 원본 보존·표제 번역·실제 review 앱 미리보기·validate/lint/미승인 보존 검사 완료. 작업자의 이미지 덮어쓰기를 부모가 발견해 원문 디코딩 파일로 복원했다. [위반·복원·검증 기록](data/reports/translation-held-image-followup-3439-3398-2026-09-13.md). 확률 충돌과 설치된 플러그인의 사람 확인은 여전히 대기한다.

### 3496

- [ ] 해결 확인
- 자료: [원문](data/problems-source/3496.html) · [원사이트](https://yukicoder.me/problems/no/3496)
- 기록된 차단 사유: 원문충돌보류: 점수3M-Q와AC점수Q, 모든입출력정수와문자열프로토콜. 임의확정없이원문유지. 부모validate/lint/보존·KaTeX통과, 대화형54개IO셀독립순서/내용대조일치. 부모수정요청: 중복초기화/빈출력제거,54셀전환,프로토콜변수/수량/배열서식. 검토메타데이터유지.
- 필요한 해결: 점수 Q와 3M-Q 중 실제 채점식을 확정하고 '모든 입출력 정수'의 적용 범위를 정정한다.
- 결정/근거: clar를 보냄, 그 전까지 사람이 풀어보고 채점식을 확정함

### 3562

- [ ] 해결 확인
- 자료: [원문](data/problems-source/3562.html) · [원사이트](https://yukicoder.me/problems/no/3562)
- 기록된 차단 사유: 원문/최종전체대조. 부모지적추가정수단정/통신문장삭제,부분점이동,수량/수신조사/flush강조복원후validate/lint/preservation통과. wrapper없는샘플인식수정및38회귀테스트/tsc통과. Alice입력/출력→Bob입력/출력4블록원문일치/3문자열총길이10/복원2,3,5확인. 원문제한Q377/410/420에예제380은불포함하여원문충돌보류. 미승인유지.
- 필요한 해결: 허용 Q 목록(377/410/420)과 예제 Q=380 중 올바른 기준을 확정한다.
- 결정/근거: clar를 보냄, 그 전에 사람이 풀어보고 데이터를 확인함

### 3613

- [ ] 해결 확인
- 자료: [원문](data/problems-source/3613.html) · [원사이트](https://yukicoder.me/problems/no/3613)
- 기록된 차단 사유: 원문과 저장본 전체 대조. 부모가 부분점 표 번호의 수식 누락 수정 요청. 수정 후 validate/lint/check:translation(KaTeX)/diff 통과. 원문 표시 표 20/80/100점,N=2/N<=8/추가없음과 숨은 data-subtask-json 40/60/100점,N=2/N<=10/추가없음 충돌. 예제1 N=4이나 원문 부분문제1,2 만족 문구는 N=2 조건과 모순. 임의 수정하지 않고 보류. Breadくん 원문 유지. 부모 node 모든 i<j의 Ai*Aj 합 계산으로 27/100000000/66 일치: 합병마다 서로 다른 두 그룹의 원래 빵 쌍을 정확히 한번 결합하므로 총비용은 순서와 무관.
- 필요한 해결: 보이는 부분점 표와 숨은 data-subtask-json 중 실제 채점 기준을 확인하고 조건·점수의 정본을 지정한다. 예제의 부분문제 만족 주장도 함께 확인한다.
- 결정/근거: 문제를 풀어보고 결정함

### 3617

- [ ] 해결 확인
- 자료: [원문](data/problems-source/3617.html) · [원사이트](https://yukicoder.me/problems/no/3617)
- 기록된 차단 사유: 원문/최종 저장본 전체 대조. 부모가 부분점7행 통째 누락 지적, 에이전트는 전체제한으로 대응됐다고 오보고하여 재지시 후 표복원/수량/용어통일. validate/lint/check:translation(KaTeX)/diff 통과. 원문 충돌5건: 모든 예제는 M!=10^5라 부분문제6 불만족, 예제4는 N1000>300 및 Ti1e18>1e10도 위반; 예제2는 Ti2>M^2=1로 부분문제5도 불만족. 원문 주장 유지하여 보류. 부모 node 주기 순열 역상과 이진거듭제곱으로 전체4예제14출력 4,3,2/2,1/6,6,6/29,29,411,169,411,1 일치. 첫예제4회 중간 배열 보존. 미승인 유지.
- 필요한 해결: 보이는 부분점 표와 숨은 data-subtask-json 중 실제 채점 기준을 확인하고 조건·점수의 정본을 지정한다. 예제의 부분문제 만족 주장도 함께 확인한다.
- 결정/근거: 문제를 풀어보고 결정함

### 3639

- [ ] 해결 확인
- 자료: [원문](data/problems-source/3639.html) · [원사이트](https://yukicoder.me/problems/no/3639)
- 기록된 차단 사유: 원문 숨은 부분점7행(25,25,25,50,50,50,25점)과 보이는6행(10,20,10,20,10,30%) 충돌. 숨은1 N2,Q1 vs 보이는1 N2,M1,Q1; 숨은5 P_i>=P_(i+1) vs 보이는5 L/P<=100; 숨은6 L/P<=1e5 vs 보이는6 무제한. 보이는 표 보존하고 사용자 확인 필요. 이름 kazuppa国/いつ菌/Itsukin 원문 유지.
- 필요한 해결: 보이는 부분점 표와 숨은 data-subtask-json 중 실제 채점 기준을 확인하고 조건·점수의 정본을 지정한다. 예제의 부분문제 만족 주장도 함께 확인한다.
- 결정/근거: 문제를 풀어보고 결정함

### 3640

- [ ] 해결 확인
- 자료: [원문](data/problems-source/3640.html) · [원사이트](https://yukicoder.me/problems/no/3640)
- 기록된 차단 사유: 숨은부분점 vs 보이는표: 부분3/4 JSON L_i<R_i 엄격 vs 표 L_i<=R_i. 점수20,30,20,50,30,50 vs15,10,10,20,20,25%. 보이는 표 유지; 등호 포함 여부/점수 사용자 확인 필요.
- 필요한 해결: 보이는 부분점 표와 숨은 data-subtask-json 중 실제 채점 기준을 확인하고 조건·점수의 정본을 지정한다. 예제의 부분문제 만족 주장도 함께 확인한다.
- 결정/근거: 문제를 풀어보고 결정함

### 3641

- [ ] 해결 확인
- 자료: [원문](data/problems-source/3641.html) · [원사이트](https://yukicoder.me/problems/no/3641)
- 기록된 차단 사유: data-subtask-json과 보이는 표 조건 충돌: 부분1/2 숨은N=1 vs 표N<=1e3, 부분3 숨은N<=1e5 추가 vs 표N제한없음. 점수 JSON30,30,30,30 vs 표20,30,30,20%. 보이는 표 유지; 사용자 확인 필요.
- 필요한 해결: 보이는 부분점 표와 숨은 data-subtask-json 중 실제 채점 기준을 확인하고 조건·점수의 정본을 지정한다. 예제의 부분문제 만족 주장도 함께 확인한다.
- 결정/근거: 문제를 풀어보고 결정함

### 3642

- [ ] 해결 확인
- 자료: [원문](data/problems-source/3642.html) · [원사이트](https://yukicoder.me/problems/no/3642)
- 기록된 차단 사유: 숨은부분점6 C_i=1만 vs 보이는 N<=100,C_i=1; 숨은부분점7 N,W_i,C_i<=200 vs 보이는 모든입력<=100. 점수15,30,15,30,45,45,90,30 vs5,3,2,10,15,20,30,15%. 보이는 표 유지; 사용자 확인 필요.
- 필요한 해결: 보이는 부분점 표와 숨은 data-subtask-json 중 실제 채점 기준을 확인하고 조건·점수의 정본을 지정한다. 예제의 부분문제 만족 주장도 함께 확인한다.
- 결정/근거: 문제를 풀어보고 결정함

### 3643

- [ ] 해결 확인
- 자료: [원문](data/problems-source/3643.html) · [원사이트](https://yukicoder.me/problems/no/3643)
- 기록된 차단 사유: 숨은부분점2 T=1,N<=2000 vs 보이는 N<=2000 및 모든N합<=2000; 숨은부분3 T=1 vs 보이는 N<=2e5및합<=2e5. 점수25,75,75,75 vs10,30,30,30%. 보이는 표 유지; 사용자 확인 필요.
- 필요한 해결: 보이는 부분점 표와 숨은 data-subtask-json 중 실제 채점 기준을 확인하고 조건·점수의 정본을 지정한다. 예제의 부분문제 만족 주장도 함께 확인한다.
- 결정/근거: 문제를 풀어보고 결정함

### 3644

- [ ] 해결 확인
- 자료: [원문](data/problems-source/3644.html) · [원사이트](https://yukicoder.me/problems/no/3644)
- 기록된 차단 사유: 숨은부분점 2행(N1/무제한,50/50점) vs 보이는3행(N1/N2/무제한,10/20/70%). 보이는 표 유지; 사용자 확인 필요.
- 필요한 해결: 보이는 부분점 표와 숨은 data-subtask-json 중 실제 채점 기준을 확인하고 조건·점수의 정본을 지정한다. 예제의 부분문제 만족 주장도 함께 확인한다.
- 결정/근거: 문제를 풀어보고 결정함

### 3645

- [ ] 해결 확인
- 자료: [원문](data/problems-source/3645.html) · [원사이트](https://yukicoder.me/problems/no/3645)
- 기록된 차단 사유: 숨은부분점1 N=2 vs 보이는 N<=2. 점수20,40,40 vs10,30,60%. 보이는 표 보존; 사용자 확인 필요.
- 필요한 해결: 보이는 부분점 표와 숨은 data-subtask-json 중 실제 채점 기준을 확인하고 조건·점수의 정본을 지정한다. 예제의 부분문제 만족 주장도 함께 확인한다.
- 결정/근거: 문제를 풀어보고 결정함

### 5008

- [ ] 해결 확인
- 자료: [원문](data/problems-source/5008.html) · [원사이트](https://yukicoder.me/problems/no/5008)
- 기록된 차단 사유: 부모 원문/최종전체대조 및 diff validate lint check:translation KaTeX 통과. 예제20행 E20=0과1<=Ei 및 예제제한만족주장 충돌 미해결 보류. 부모 대회공지 전체/22열점수표/제목식별자/3행입력/조건별3개하위조건/강조/날짜위치 반복복원 지시, 마지막 목록분리빈줄 부모수정. 자율 준수 성공 아님. 반정수 이동/끝점후감쇠/사진별round와평균round/모든case합 또는nonAC시0/생성 및 동점조건 보존. 표/진자시뮬/샘플시각/PNG 모든근거 parentChecks 및 parentImageVerification. 미승인 유지.
- 필요한 해결: 예제 E20=0을 허용하는지, 제한 1≤Ei 또는 예제를 정정할지 확정한다.
- 결정/근거: clar를 보냄. 문제를 풀어보고 결정함

### 5011

- [ ] 해결 확인
- 자료: [원문](data/problems-source/5011.html) · [원사이트](https://yukicoder.me/problems/no/5011)
- 기록된 차단 사유: 부모 원문/저장본 전체 대조 및 diff validate lint check:translation KaTeX 통과. 부모 강조 누락·절 배치·수량·% 단위·WT/ST 입력 정의 재수정 지시 후 통과, 자율 준수 성공 아님. WT5 원문 정의대로 n200000에서 ceil3n/4개에 w25부터 배증: 선택 수150000,37500,9375,2344,586,147,36,9,3, 합7488900 평균37.4445. 원문 모든 case 기댓값 약50 주장과 차이 미해결로 보류. 실제 샘플 모든 T 및 점수 parentChecks 일치. 이미지0, 행사명 원문 유지, 미승인 유지.
- 필요한 해결: WT5 생성 규칙과 '모든 case 기댓값 약 50' 설명 중 정정할 내용을 확정한다.
- 결정/근거: WT5 생성 규칙이 임의의 Q에 대해서 올바르지 않는 기댓값을 내는지 확인, 그런 경우 clar를 요청
- 반영/검증 (2026-09-13): 생성은 Q가 아니라 N에만 의존한다. 원문 절차의 임의 양의 길이 N에서 평균은 항상 37.5 미만임을 유한 합으로 증명했고, 실제 N=200000에서는 37.4445를 BigInt로 재현했다. [계산·증명 및 질문 초안](data/reports/translation-blocker-clarifications-2026-09-13.md)을 작성했다(**미발송**). 실제 생성기/원문 중 정정 대상은 공식 확인 대기이며 MDX의 규칙을 임의 변경하지 않았다.

### 5018

- [ ] 해결 확인
- 자료: [원문](data/problems-source/5018.html) · [원사이트](https://yukicoder.me/problems/no/5018)
- 기록된 차단 사유: 부모원문/최종전체대조 및diff validate lint통과. check:translation은원문일본어대화표8셀미인식만실패,직접source8td와저장본8실제블록모두동일true8개/방향순서유지. 원문예제서점10고정D두주불가능(하한1.02241544>상한1.00868651)부모및agent독립재계산으로보류. 그외주별전체재고·인기·돈·총96권1점일치parentChecks. 부모$$블록/행동번호/flush강조/본문-1수식복원지시,잔여seed범위/예제참조번호부모수정. 최초수량검색누락반복되었으므로자율준수성공아님. 이미지0/未확정ゆき出版 유지/미승인 유지.
- 필요한 해결: 예제 서점 10의 고정 D가 두 주의 결과를 동시에 만족해야 하는지, 생성 규칙/예제를 확정한다. 표 예제 검사기 문제도 별도로 재확인한다.
- 결정/근거: clar를 보냄. 문제를 풀어보고 결정함

### 5023

- [ ] 해결 확인
- 자료: [원문](data/problems-source/5023.html) · [원사이트](https://yukicoder.me/problems/no/5023)
- 기록된 차단 사유: 원문/최종전체대조 및 부모 diff validate lint check:translation KaTeX 통과. 원문입력전부정수와HH:MM문자열충돌,정수인구생성실수식반올림미정의 별개2건보류. 부모가짜undefined예제/닫힘펜스/강조/수량/추가개행요구/단계3을3회로읽히는표현 교정지시후형식통과,자율준수성공아님. a_i,b_i모두출발지인원문오타는본문정의근거출발/목적지교정. 원문샘플400+184flight모든시간·기체연결검사및점유율점수226637 parentChecks,최적성아님. 이미지0/スクエア航空会社·サークル航空会社원문유지/미승인유지.
- 필요한 해결: HH:MM 문자열을 제외한 정수 조건의 범위와 인구 생성 시 실수→정수 반올림 방식을 확정한다.
- 결정/근거: clar를 보냄. 문제를 풀어보고 결정함

### 8009

- [ ] 해결 확인
- 자료: [원문](data/problems-source/8009.html) · [원사이트](https://yukicoder.me/problems/no/8009)
- 기록된 차단 사유: 부모원문/최종전체대조 및 diff validate lint check:translation KaTeX 통과(동시배치8010/8011실패와개별분리). N0허용과1<=L<=R<=N정의충돌미해결보류. 빈구간/답0추정추가없음. 부모내용수정없음. 4예제전구간최대직접열거3,5,1,4 parentSampleVerification. 수량검색모두와예제제목만/이미지0/미확정인명없음/미승인유지.
- 필요한 해결: N=0을 허용할 때의 빈 구간 및 정답을 정하거나 N의 하한을 확정한다.
- 결정/근거: clar를 보냄.
- 반영/검증 (2026-09-13): N=0에서는 1≤L≤R≤N이 불가능함을 재확인했다. 기존 예제 전구간 검산은 3/5/1/4이며 N=0의 의도는 판별하지 못한다. 빈 구간 허용/하한/빈 입력 행에 관한 [질문 초안](data/reports/translation-blocker-clarifications-2026-09-13.md)을 작성했다(**미발송**). 임의로 답0을 추가하지 않았다.

### 8031

- [ ] 해결 확인
- 자료: [원문](data/problems-source/8031.html) · [원사이트](https://yukicoder.me/problems/no/8031)
- 기록된 차단 사유: https://arxiv.org/pdf/1102.0049 Angoshtari-Yavari2011 p1–2 직접확인:NaCl구형직접합발산,중성화보정Wolf별도. 예제alpha는최근접거리1/2의NaCl(4(alpha000+alpha111)=0=sum beta,중성충족)라원문구형f(R)유한수렴보장과충돌. 알려진Madelung값은그구형극한의증거가아님. agent원문유지/본문보정추가금지지시,완료보류예정. 추가독립구형합수치검사선택가능.
- 필요한 해결: 구형 직접합의 수렴 보장과 예제가 같은 정의를 사용하는지 확인하고, 필요하면 합산/정규화 정의를 제공한다.
- 결정/근거: 솔직히 무슨 말인지 모르겠음
- 설명 보강 (2026-09-13): 문제는 ‘구 안의 전하를 그대로 더해 구를 키운 극한’을 요구하지만 예제 배치는 그 방식으로 수렴하지 않는다. 중성 조건을 만족해도 같은 구면의 전하가 같은 부호로 한꺼번에 추가되기 때문이다. 보정 합산법을 쓰면 원문 정의를 바꾸게 된다. [쉬운 설명·예제 대응·독립 비수렴 논증·근거 자료](data/reports/translation-blocker-clarifications-2026-09-13.md)를 추가했다. 의도한 합산 방식 확인이 필요하며 MDX에 임의 보정을 넣지 않았다.

### 8117

- [ ] 해결 확인
- 자료: [원문](data/problems-source/8117.html) · [원사이트](https://yukicoder.me/problems/no/8117)
- 기록된 차단 사유: 원문 행 길이≤100 vs 공개 참조 구현 len(line)<100 충돌. 리터럴/변수 경계 참조 구현≤10^100와 원문<10^100 차이. 참조 구현이 현 저지와 동일한지 미확인. 샘플 검사 지원 누락 별도.
- 필요한 해결: 현재 저지 기준의 행 길이 경계(100 포함 여부)와 수치 경계(10^100 포함 여부)를 확정한다. 이미 보완된 샘플 인식 문제와 구분한다.
- 결정/근거: 무슨 문제인지 모르겠음 그냥 일단 번역 보류

### 8120

- [ ] 해결 확인
- 자료: [원문](data/problems-source/8120.html) · [원사이트](https://yukicoder.me/problems/no/8120)
- 기록된 차단 사유: 부모 원문 전체 대조. 본문 법998243353/예제 설명998244353 불일치. BigInt C(41,9)=350343565로 두 법 모두 같은 나머지여서 예제로 정정 불가. 작성 전 보류. 주의 중첩 부정은 원문대로 보존해야 함.
- 필요한 해결: 법이 998243353인지 998244353인지 확정한다. 기록된 예제는 두 값을 구별하지 못한다.
- 결정/근거: 이 부분이 조크 문제인 부분인 것 같음

### 재검증 중 추가 확인: 2900

- [ ] 원문 제한의 합산 범위 확인
- 자료: [원문](data/problems-source/2900.html) · [대조 근거](data/reports/translation-2900-source-ambiguity-2026-09-12.md)
- 원문 1≤Σx,y,m≤10^5의 뜻이 각 변수별 테스트 전체 합인지, 세 변수를 합친 합인지 불명확하다. 예제는 각각14/13/21, 합48로 두 해석을 모두 만족한다. 원문을 재독했으며 기존 번역/보류를 유지한다.
- 질문 초안(미발송): 制約「1≤Σx,y,m≤10^5」は、全テストケースの x,y,m の総和をそれぞれ10^5以下とする意味でしょうか。それとも全テストケースの (x+y+m) の総和を10^5以下とする意味でしょうか。サンプルはどちらも満たすため、合計範囲をご確認いただけますか。

### 재검증 중 추가 확인: 2912

- [ ] N=0 허용 여부 확인
- 자료: [원문](data/problems-source/2912.html) · [대조 근거](data/reports/translation-2912-source-ambiguity-2026-09-12.md)
- 첫 문장은 N을 양의 정수로 정의하지만 제한은0≤N≤10^5다. 세 예제는 모두N=2라 판별 불가. 원문을 재독했으며 기존 번역/보류를 유지한다.
- 질문 초안(미발송): 冒頭では N を正整数としていますが、制約は0≤N≤10^5となっています。N=0の入力は許されますか。許される場合は各問い合わせの答えを空グラフの連結成分数0とする理解でよいでしょうか。

## 2. 제목·암호문 해석 (4개)

제목/용어의 의미와 사용할 한국어 표기 또는 원문 유지 방침을 지정한다. 남아 있는 별도 검산도 완료해야 한다.

### 3206

- [ ] 해결 확인
- 자료: [원문](data/problems-source/3206.html) · [원사이트](https://yukicoder.me/problems/no/3206)
- 기록된 차단 사유: 제목 う　し　た　ウ　ニ　木　あ　く　ん　笑 해석 미확정. 원문/metadata에는 설명 없으며 유사 제목만으로 확정불가. 추측하지 않고 원문 유지. 본문수정/이미지대조 완료, 최종별도검사및예제계산아직미완료.
- 필요한 해결: 제목 'う　し　た　ウ　ニ　木　あ　く　ん　笑'의 의미/한국어 표기 또는 원문 유지 방침을 정한다. 최종 검사와 예제 검산도 남아 있다.
- 결정/근거: _작성 대기_
- 반영/검증 (2026-09-13): [본문·예제·이미지 재검증 완료](data/reports/translation-3206-body-2026-09-13.md). 모든 정점 부분집합/루트 전수 검산, 그림4개 원본 데이터·육안·실제 미리보기, 전체 대조 및3검사 통과. 이제 남은 확인은 제목 표기뿐이며 원문으로 유지했다.

### 3317

- [x] 해결 확인
- 자료: [원문](data/problems-source/3317.html) · [원사이트](https://yukicoder.me/problems/no/3317)
- 기록된 차단 사유: ワロングアンサーロングアンサーンスワロンガー제목말장난한국어표기미확정. 사용자확인필요.
- 필요한 해결: 말장난 제목 'ワロングアンサーロングアンサーンスワロンガー'의 표기 또는 원문 유지 방침을 정한다. 대형 예제 검산도 남아 있다.
- 결정/근거: "waronganswerronganswernswaronger"를 사용
- 반영/검증 (2026-09-13): 지정 제목 반영, 원문 전체 대조·12개 치환 강조 복원·모든 중간 문자열 보존 확인. 큰 T 예제는 접두사 안정성 근거와 정확한 위치 계산으로 검산했다. validate/lint/미승인 보존 검사 통과. [재검증 기록](data/reports/translation-2814-3317-2026-09-13.md).

### 3512

- [x] 해결 확인
- 자료: [원문](data/problems-source/3512.html) · [원사이트](https://yukicoder.me/problems/no/3512)
- 기록된 차단 사유: 자동3검사통과. 원문중복금지수식명백오기수정은부모요청후반영. title moesode 의미는공식문제/제출목록에서도미확정으로원문유지. 제목번역미완료이므로전체완료에포함하지않음.
- 필요한 해결: 'moesode'의 의미/표기 또는 원문 유지 방침을 정한다.
- 결정/근거: 원문 그대로 사용
- 반영/검증 (2026-09-13): 제목 moesode 유지 결정 적용. 원문·저장본 전체 대조, 모든 예제의 전역 하한과 구체적 추가 간선 검산, validate/lint/미승인 보존 검사 통과. [재검증 기록](data/reports/translation-3026-3029-3512-2026-09-13.md).

### 8064

- [ ] 해결 확인
- 자료: [원문](data/problems-source/8064.html) · [원사이트](https://yukicoder.me/problems/no/8064)
- 기록된 차단 사유: 원문암호본문의badigit/수치경계b..frye/규칙의의미미확정. 추측해독문삽입않고원문보존초안저장. 에이전트4검사통과는의미번역완료아님. 26예제52블록부모추출비교일치. 다른문제번역계속가능.
- 필요한 해결: 암호문 badigit 및 b..frye의 의미를 확인하고, 암호 자체를 유지할지 번역 가능한 표현 체계를 정한다.
- 결정/근거: 네타 문제는 미번역

## 3. 숨김·상호작용·음성·표시 방향 (11개)

원문의 퍼즐 효과를 보존할 표시·재생 방식을 정한다. 숨은 정보를 공개하거나 삭제하는 방식은 별도 결정 없이 적용하지 않는다.

### 8077

- [ ] 해결 확인
- 자료: [원문](data/problems-source/8077.html) · [원사이트](https://yukicoder.me/problems/no/8077)
- 기록된 차단 사유: 본문/제한/형식/예제데이터가class속성에숨겨진퍼즐. 실제PRE6개 textContent비어있음; 예제2/3출력은설명속성에만있고실제출력블록없음. 가시본문복원은퍼즐변경/현재MDX rawHTML금지와충돌. 임의노출초안작성안함. ab는a*b로본문및예제와확정가능하며그자체오타아님.
- 필요한 해결: 원문의 퍼즐 효과를 보존할 표시·재생 방식을 정한다. 숨은 정보를 공개하거나 삭제하는 방식은 별도 결정 없이 적용하지 않는다.
- 결정/근거: 네타 문제는 미번역

### 8084

- [ ] 해결 확인
- 자료: [원문](data/problems-source/8084.html) · [원사이트](https://yukicoder.me/problems/no/8084)
- 기록된 차단 사유: 중첩details/summary클릭트리자체가게임북퍼즐. 현MDX rawHTML거부/전용상호작용표현없음. 정적평탄화는원문의조작을잃으므로초안작성안함. 번역완료아님/표현지원필요.
- 필요한 해결: 원문의 퍼즐 효과를 보존할 표시·재생 방식을 정한다. 숨은 정보를 공개하거나 삭제하는 방식은 별도 결정 없이 적용하지 않는다.
- 결정/근거: 네타 문제는 미번역

### 8085

- [ ] 해결 확인
- 자료: [원문](data/problems-source/8085.html) · [원사이트](https://yukicoder.me/problems/no/8085)
- 기록된 차단 사유: 흰색font로숨긴Docs링크를현재MDX에서동일하게보존할수없음. 가시링크노출은퍼즐변경/숨김삭제는정보손실. PRE의br도textContent와가시행차이있음. 원문15/41의도적문구임의정정안함/파일작성전보류.
- 필요한 해결: 원문의 퍼즐 효과를 보존할 표시·재생 방식을 정한다. 숨은 정보를 공개하거나 삭제하는 방식은 별도 결정 없이 적용하지 않는다.
- 결정/근거: 네타 문제는 미번역

### 8095

- [ ] 해결 확인
- 자료: [원문](data/problems-source/8095.html) · [원사이트](https://yukicoder.me/problems/no/8095)
- 기록된 차단 사유: 인코딩법유일하지않음안내가font white숨김. 현재MDX숨김표현지원없음/가시문구노출또는삭제는퍼즐변경. 파일작성전보류. 원문암호숫자/무입력빈파일/공백없는반각영소문자숫자1행조건보존필요.
- 필요한 해결: 원문의 퍼즐 효과를 보존할 표시·재생 방식을 정한다. 숨은 정보를 공개하거나 삭제하는 방식은 별도 결정 없이 적용하지 않는다.
- 결정/근거: 네타 문제는 미번역

### 8098

- [ ] 해결 확인
- 자료: [원문](data/problems-source/8098.html) · [원사이트](https://yukicoder.me/problems/no/8098)
- 기록된 차단 사유: 부모원문전체확인. font white의 + textrm{o}와 예제 외 호도법 안내는 숨김 퍼즐이며 단순수식잔여물/도수법조건으로 바꿀수없음. 현재MDX숨김표현미지원으로작성전보류.
- 필요한 해결: 원문의 퍼즐 효과를 보존할 표시·재생 방식을 정한다. 숨은 정보를 공개하거나 삭제하는 방식은 별도 결정 없이 적용하지 않는다.
- 결정/근거: 네타 문제는 미번역

### 8106

- [ ] 해결 확인
- 자료: [원문](data/problems-source/8106.html) · [원사이트](https://yukicoder.me/problems/no/8106)
- 기록된 차단 사유: 부모원문전체대조. 맨앞div.class에페이지소스표시권유숨은안내. 현MDX숨김속성지원없어가시번역/삭제시퍼즐의미손상. 작성전보류. 특이10의이중음수지수/모듈러복원/답유일성원문수식보존필요.
- 필요한 해결: 원문의 퍼즐 효과를 보존할 표시·재생 방식을 정한다. 숨은 정보를 공개하거나 삭제하는 방식은 별도 결정 없이 적용하지 않는다.
- 결정/근거: 네타 문제는 미번역

### 8107

- [ ] 해결 확인
- 자료: [원문](data/problems-source/8107.html) · [원사이트](https://yukicoder.me/problems/no/8107)
- 기록된 차단 사유: 부모DOM MIME확인: 첫IMG는data:audio/mpeg,나머지2개JPEG. 문제설명음성미확인/현이미지분리도구및MDX재생표현미지원. 예제최대매칭만으로전체음성조건추측금지. 작성전보류.
- 필요한 해결: 문제 설명 음성의 파일/전사 내용을 확인하고 오디오 재생 표현을 지원한다. 이미지로 취급하지 않는다.
- 결정/근거: 네타 문제는 미번역

### 8115

- [ ] 해결 확인
- 자료: [원문](data/problems-source/8115.html) · [원사이트](https://yukicoder.me/problems/no/8115)
- 기록된 차단 사유: 부모원문全体대조: N mod7=1조건이font#FFFFFF숨김. 현MDX숨김표현지원없어가시화/삭제시퍼즐변경. 작성전보류. 2025만우절화요일/N113→7월23일Wednesday/주년공지보존필요.
- 필요한 해결: 원문의 퍼즐 효과를 보존할 표시·재생 방식을 정한다. 숨은 정보를 공개하거나 삭제하는 방식은 별도 결정 없이 적용하지 않는다.
- 결정/근거: 네타 문제는 미번역

### 8124

- [ ] 해결 확인
- 자료: [원문](data/problems-source/8124.html) · [원사이트](https://yukicoder.me/problems/no/8124)
- 기록된 차단 사유: 부모 원문 전체 대조: font white로 出力はすべて整数 숨김. 현 MDX 숨김 표현 미지원으로 작성 전 보류. 가시화/삭제하지 않음.
- 필요한 해결: 원문의 퍼즐 효과를 보존할 표시·재생 방식을 정한다. 숨은 정보를 공개하거나 삭제하는 방식은 별도 결정 없이 적용하지 않는다.
- 결정/근거: 네타 문제는 미번역

### 8131

- [ ] 해결 확인
- 자료: [원문](data/problems-source/8131.html) · [원사이트](https://yukicoder.me/problems/no/8131)
- 기록된 차단 사유: 외부problem.mp3/sample.mp3 내용 및 예제채보일치 미검증. 가용청취·전사도구없음/웹Drive열기실패. 형식통과를전체의미검증으로주장하지않음.
- 필요한 해결: problem.mp3와 sample.mp3의 접근 가능한 파일을 제공하거나 확인하고, 음원과 예제 채보를 대조한다.
- 결정/근거: 네타 문제는 미번역

### 8133

- [ ] 해결 확인
- 자료: [원문](data/problems-source/8133.html) · [원사이트](https://yukicoder.me/problems/no/8133)
- 기록된 차단 사유: 원문전체 방향제어문자 대조/로컬Chrome원문표시확인. raw7000000001→화면1000000007,224→422. 로컬수학렌더0개로원사이트재현확정아님. 상세translation-bidi-8133-2026-09-12.md. 작성전보류.
- 필요한 해결: 원사이트의 실제 수학 렌더링과 방향 제어 효과를 확인하고 보존 방식을 정한다. 원시 숫자만 보고 정정하지 않는다.
- 결정/근거: 네타 문제는 미번역

## 4. 이미지 렌더링·외부 리소스 (9개)

이미지 파일 분리·참조 및 렌더러 지원을 확인하고 실제 미리보기에서 표시를 검증한다. 보안 정책을 무조건 완화하거나 검사만 우회하지 않는다.

### 2906

- [ ] 해결 확인
- 2026-09-13 작업 완료: SVG 분리/실제 미리보기, 전체38 PRE 보존, 모든 예제 독립 mex 검산, 코드 안 수량/문법 빈 선택지/강조 교정 후 번역 재검증 통과. 실제 플러그인 표시 확인 요청. [근거](data/reports/translation-stlang-2906-2908-2026-09-13.md).
- 자료: [원문](data/problems-source/2906.html) · [원사이트](https://yukicoder.me/problems/no/2906)
- 기록된 차단 사유: Full source pre38 present, samples/links exact, SVG src present but no img DOM; canonical sample headings unsupported, code dollar parsing2 diagnostics. Parent corrections4, not autonomous success.
- 필요한 해결: 이미지 파일 분리·참조 및 렌더러 지원을 확인하고 실제 미리보기에서 표시를 검증한다. 보안 정책을 무조건 완화하거나 검사만 우회하지 않는다.
- 결정/근거: 일단 작업하고 실제 플러그인 상에서 검증 요청

### 2908

- [ ] 해결 확인
- 2026-09-13 기술 작업 완료, 원문 확인 보류: SVG/미리보기/38 PRE/모든 예제 검산/번역 검사 통과. 원문 간이 실행환경의 m 미정의, M 인수 미전달, 반환 타입힌트와 value 설명 불일치를 확인해 코드 임의 수정 없이 blocked 유지. [질문 초안·근거, 미발송](data/reports/translation-stlang-2906-2908-2026-09-13.md). 실제 플러그인 표시도 확인 요청.
- 자료: [원문](data/problems-source/2908.html) · [원사이트](https://yukicoder.me/problems/no/2908)
- 기록된 차단 사유: Full38 pre ordered exact; raw samples/5links/SVGsrc retained; canonical headings unsupported, SVG no image DOM, code literals misparsed by preservation. Current actual SITE_KATEX diagnostics0. Parent corrections3 plus final code blank-line restoration.
- 필요한 해결: 이미지 파일 분리·참조 및 렌더러 지원을 확인하고 실제 미리보기에서 표시를 검증한다. 보안 정책을 무조건 완화하거나 검사만 우회하지 않는다.
- 결정/근거: 일단 작업하고 실제 플러그인 상에서 검증 요청

### 3047

- [ ] 해결 확인
- 2026-09-13 작업 완료: SVG16개 분리/원문 바이트/실제 미리보기, 모든 예제 네트워크의 전0/1입력 검산 완료. 큰26입력 네트워크 각각67108864개 확인. 개별 예제 입출력 제목14개/강조12곳 교정 후 번역 재검증 통과. 실제 플러그인 표시와 バッチャー 이름 표기 확인 요청. [근거](data/reports/translation-3047-2026-09-13.md).
- 자료: [원문](data/problems-source/3047.html) · [원사이트](https://yukicoder.me/problems/no/3047)
- 기록된 차단 사유: All16 original SVG data URLs preserved in order at corresponding explanations; compiled img0 (existing SVG support). Meaningful final blank output restored; parent removed IMG9_MOVE and IMG8_MOVE placeholders and clarified existential No condition.
- 필요한 해결: 이미지 파일 분리·참조 및 렌더러 지원을 확인하고 실제 미리보기에서 표시를 검증한다. 보안 정책을 무조건 완화하거나 검사만 우회하지 않는다.
- 결정/근거: 일단 작업하고 실제 플러그인 상에서 검증 요청

### 3272

- [ ] 해결 확인
- 2026-09-13 작업 완료: 원문 SHA/PNG signature 한정 MIME 오타 지원, 두 PNG 분리/바이트 대조/실제 미리보기 및 모든 예제 독립 검산 완료. 번역 재검증 통과, 실제 플러그인에서 표시 확인 요청은 남김. [근거](data/reports/translation-3272-3319-3397-2026-09-13.md).
- 자료: [원문](data/problems-source/3272.html) · [원사이트](https://yukicoder.me/problems/no/3272)
- 기록된 차단 사유: 원문두번째이미지MIME이data:imrage/png오타라렌더에서제거됨. 저장본원문주소유지. preservation실패. 의미본문전체대조했으나이미지육안/독립예제계산미완료. 완료수제외.
- 필요한 해결: 오타 MIME data:imrage/png의 실제 파일 형식을 확인하여 정정/분리 근거를 남긴다. 이미지 시각 확인과 예제 검산도 완료한다.
- 결정/근거: 일단 작업하고 실제 플러그인 상에서 검증 요청

### 3319

- [ ] 해결 확인
- 2026-09-13 작업 완료: SVG 2개 분리/원문 바이트/실제 미리보기/모든 예제 계수 확인 및 번역 검사 통과. 실제 플러그인 표시, 미확정 이름, 원문 C++ 예시의 int ans 한계는 사람 확인 대상. [근거](data/reports/translation-3272-3319-3397-2026-09-13.md).
- 자료: [원문](data/problems-source/3319.html) · [원사이트](https://yukicoder.me/problems/no/3319)
- 기록된 차단 사유: 원문data:image/svg+xml;base64이미지2개가Markdown컴파일에서제거됨. URI변경/코어렌더러변경없이보류.
- 필요한 해결: 이미지 파일 분리·참조 및 렌더러 지원을 확인하고 실제 미리보기에서 표시를 검증한다. 보안 정책을 무조건 완화하거나 검사만 우회하지 않는다.
- 결정/근거: 일단 작업하고 실제 플러그인 상에서 검증 요청

### 3397

- [ ] 해결 확인
- 2026-09-13 작업 완료: 이미지 4개 분리/원문 바이트/실제 미리보기 및 큰 예제 10개를 포함한 모든 예제 exact BigInt 검산 완료. 후보 전체를 포함하는 floor 구간 재귀 근거와 교차 검산 기록. 실제 플러그인에서 표시 확인 요청은 남김. [근거](data/reports/translation-3272-3319-3397-2026-09-13.md).
- 자료: [원문](data/problems-source/3397.html) · [원사이트](https://yukicoder.me/problems/no/3397)
- 기록된 차단 사유: 부모 원문/초안 전체대조. 예제1·2 18경우 전수계산확인, 예제3큰10경우 독립최적화미확인. 예상시간공지분리·입력 i+1행관계 수정요청. 원문img4/MDX data이미지4인데 compileProblemMarkdown 결과img2(webp만)로 SVG2개누락 직접확인, preservation실패. 이미지시각대조 및 최종전체재독 미완료. 렌더러문제로 보류.
- 필요한 해결: 이미지 파일 분리·참조 및 렌더러 지원을 확인하고 실제 미리보기에서 표시를 검증한다. 보안 정책을 무조건 완화하거나 검사만 우회하지 않는다.
- 결정/근거: 일단 작업하고 실제 플러그인 상에서 검증 요청

### 5021

- [ ] 해결 확인
- 2026-09-13 작업 완료: 원문URL/원문SHA/이미지SHA를 기록한 로컬파일 보존지원으로 CSP 변경 없이 실제 미리보기 표시를 확인했다. 본문/수식/공지/그림합 대조 및 번역 검사 통과. 실제 플러그인 표시 확인 요청. [근거](data/reports/translation-external-images-2026-09-13.md).
- 자료: [원문](data/problems-source/5021.html) · [원사이트](https://yukicoder.me/problems/no/5021)
- 기록된 차단 사유: 부모 원문/저장본전체대조 및diff validate lint check:translation KaTeX통과. 부모mod정의상정확1e8의나머지0근거로초과→이상명백경계교정,강조·확정AC표현·불필요배경제목복원지시후통과. 이미지외부URL보존하지만실제preview는CSP img-src가localhost/yukicoder.me만허용하여i.ibb.co차단,이미지naturalWidth0인표시지원미해결로보류. 보안정책임의변경안함. sourcefetch16988bytes와agent검증용JPEG동일true,직접view640x199피라미드1,2,3,4→3,5,7→8,12→20모든합일치. 검증용다운로드는data/stray/5021-source-image.jpg로이동. 순환오차0/99999999→1,실제입출력샘플없음. 미확정인명없음/미승인 유지.
- 필요한 해결: 이미지 파일 분리·참조 및 렌더러 지원을 확인하고 실제 미리보기에서 표시를 검증한다. 보안 정책을 무조건 완화하거나 검사만 우회하지 않는다.
- 결정/근거: 일단 작업하고 실제 플러그인 상에서 검증 요청

### 8018

- [ ] 해결 확인
- 2026-09-13 작업 완료: 원문URL/해시 기반 GIF3개 로컬파일화, 실제 미리보기와 모든 간선방향/가중치 대조.3예제100턴과 설명의1/99턴 독립 계산 통과. 실제 플러그인 표시 확인 요청. [근거](data/reports/translation-external-images-2026-09-13.md).
- 자료: [원문](data/problems-source/8018.html) · [원사이트](https://yukicoder.me/problems/no/8018)
- 기록된 차단 사유: 부모원문/최종전체대조 및 diff validate lint check:translation KaTeX통과. 실제preview외부GIF3개CSP차단width0으로표시지원보류,보안정책변경없음. 부모수량rg없음허위보고확인·누락U출력형식·vdots·첫턴5실수수식·출력중복수정지시후통과/자율준수성공아님. 원문3예제100턴모든중간설명 parentSampleVerification/3GIF모든간선가중치parentImageVerification. sourcePRE개행은DOM기준보존. 미확정Google/Wikipedia원문유지/미승인유지.
- 필요한 해결: 이미지 파일 분리·참조 및 렌더러 지원을 확인하고 실제 미리보기에서 표시를 검증한다. 보안 정책을 무조건 완화하거나 검사만 우회하지 않는다.
- 결정/근거: 일단 작업하고 실제 플러그인 상에서 검증 요청

### 8069

- [ ] 해결 확인
- 2026-09-13 작업 완료: 원문URL/원문SHA/PNG SHA를 고정한 로컬파일로 실제 미리보기 표시 확인. 원본 이미지 유지, 보이는 표제/문장 조각만 번역하고 가려진 정보는 복원하지 않았다. 실제 플러그인 표시 및 caption의 퍼즐 정보 보존은 사람 확인 요청. [근거](data/reports/translation-external-images-2026-09-13.md).
- 자료: [원문](data/problems-source/8069.html) · [원사이트](https://yukicoder.me/problems/no/8069)
- 기록된 차단 사유: 원문/최종전체대조및네검사는통과하나실제컴파일HTML Chrome미리보기의원문http이미지complete=true naturalWidth=0 naturalHeight=0. https직접다운로드1280x800 PNG는정상/육안확인. 링크문자열보존통과만으로화면정상이라판정불가. 원문주소를임의치환해검사우회하지않음. 이미지렌더해결필요.
- 필요한 해결: 이미지 파일 분리·참조 및 렌더러 지원을 확인하고 실제 미리보기에서 표시를 검증한다. 보안 정책을 무조건 완화하거나 검사만 우회하지 않는다.
- 결정/근거: 일단 작업하고 실제 플러그인 상에서 검증 요청

## 5. 독립 검산·증명 미완료 (2개)

누락 후보가 없다는 근거를 포함한 정확 검산/증명을 수행한다. 현재 일치하는 계산 결과만으로 완료 처리하지 않는다.

### 3398

- [ ] 해결 확인
- 자료: [원문](data/problems-source/3398.html) · [원사이트](https://yukicoder.me/problems/no/3398)
- 기록된 차단 사유: 최종원문/저장본 전체대조 및 JP/EN 이미지2개시각확인. D2입력명시행복원·Fastest/Writer 일반역할및링크제목번역 수정확인. 37예제중 small15 전수탐색, 모든양의답 직전/현재오차경계확인, -1네경우 AB%D=0 및 gcd주기최대오차로 증명. 이야기계수34028236692093846346 및 두경계오차2→3/3→4 확인. 에이전트가전역floor-sum검증완료라보고했으나재현명령요청후미실행이었음을시인하여철회. 재시도보고도구체입력없는heredoc·일부EXACT_PASS주장이라부모검증근거로채택안함. 예제3의13~20전역최소성미검증으로보류; q반복은13번전체9498314939269구간으로비현실적이라효율적정확검증필요. 실행명령/출력필수04규칙보강. 부모validate/lint/preservation/KaTeX통과. 별도이미지변환도후속필요.
- 필요한 해결: 예제 3의 13~20에 대해 효율적인 전역 최소성 검산을 수행한다. 일부 경계값 일치나 실행하지 않은 floor-sum 계산 주장은 근거로 쓰지 않는다.
- 결정/근거: 이건 실제로 사람이 문제를 풀어보는게 맞는 것 같음
- 이미지 후속 완료 (2026-09-13): 카드 2개 원본 보존·인접 표제 번역·실제 review 앱 미리보기·validate/lint/미승인 보존 검사 완료. [검증 기록](data/reports/translation-held-image-followup-3439-3398-2026-09-13.md). 예제 전역 최소성과 설치된 플러그인의 사람 확인은 여전히 대기한다.

### 3554

- [ ] 해결 확인
- 자료: [원문](data/problems-source/3554.html) · [원사이트](https://yukicoder.me/problems/no/3554)
- 기록된 차단 사유: 원문/최종전체대조, validate/lint/preservation 통과. 부모 node /private/tmp/verify-3554.mjs 실행값303611125277312236일치. 그러나 후보p_k제한 및 빈도차단조성은 에이전트재질문후미증명인정, 조건부검산일뿐이므로 전체검증보류. 작은예제와모든f값/최빈동률최소정의보존확인. 04에조건부검산과증명구분규칙추가. 미승인유지.
- 필요한 해결: 후보 p_k만 고려해도 충분한지와 빈도차 단조성을 증명하거나, 해당 가정 없는 독립 계산으로 대형 예제를 검증한다.
- 결정/근거: 이건 실제로 사람이 문제를 풀어보는게 맞는 것 같음

## 6. 검사기 지원·오탐 (33개)

현행 검사기로 먼저 재현한다. 아직 실패하면 원문 구조/리터럴/동등한 URL/근거 있는 정정을 지원하도록 검사기를 수정하고 회귀 검사를 수행한다. 통과 목적으로 번역 내용을 훼손하지 않는다.

2026-09-13 [현행 보존 검사 재현](data/reports/blocker-technical-reproduction-2026-09-13.md): 3042·3115·3246·3276·3359·8014·8015는 이 검사에서 통과했다. 2819·2848·2978·3011·3018·3069·3088·3120은 현재 수량 오류만 보고된다. 나머지는 예제 인식·코드/이진수·정정 대응 오류가 재현됐다. 아래 과거 사유와 구분하며, 전체 재검증 전에는 해결 완료로 표시하지 않는다.

2026-09-13 [예제 인식 보완 및 회귀 검사](data/reports/blocker-sample-parser-2026-09-13.md): 일본어 표 머리글·입출력 예 절·중첩 paragraph 표·출력 예·턴별 출력 라벨을 지원했다. 추가 조사에서2965·3237은 CODE 밖 들여쓰기/장식이 데이터로 오인된 것이 확인되어 초기 '실제 데이터 불일치' 판단을 정정했다. 명시 CODE/BR 구조의 바깥 장식만 제외하며 실제 데이터는 바꾸지 않는다. 전체 번역 대조 전에는 해결 완료로 표시하지 않는다.

### 2819

- [x] 해결 확인
- 반영/검증 (2026-09-13): 표4셀/질의와 응답 방향/16연산표 검산, 수식 강조 손상 부모교정 후 전체대조·3검사 통과. [재검증 기록](data/reports/translation-2819-2848-2978-2026-09-13.md).
- 자료: [원문](data/problems-source/2819.html) · [원사이트](https://yukicoder.me/problems/no/2819)
- 기록된 차단 사유: source table IO not supported by preservation checker
- 필요한 해결: 현행 검사기로 먼저 재현한다. 아직 실패하면 원문 구조/리터럴/동등한 URL/근거 있는 정정을 지원하도록 검사기를 수정하고 회귀 검사를 수행한다. 통과 목적으로 번역 내용을 훼손하지 않는다.
- 결정/근거: _작성 대기_

### 2848

- [x] 해결 확인
- 반영/검증 (2026-09-13): 표9셀/130날짜 후보 열거, PNG 원문디코딩·실제미리보기/일본어라벨 대응 확인. 출력절·안내문·강조 부모교정 후3검사 통과, 기존 d_i 정정 유지. [재검증 기록](data/reports/translation-2819-2848-2978-2026-09-13.md).
- 자료: [원문](data/problems-source/2848.html) · [원사이트](https://yukicoder.me/problems/no/2848)
- 기록된 차단 사유: source table outside .sample; sequential IO equal, render errors0; corrected source d_j typo to d_i
- 필요한 해결: 현행 검사기로 먼저 재현한다. 아직 실패하면 원문 구조/리터럴/동등한 URL/근거 있는 정정을 지원하도록 검사기를 수정하고 회귀 검사를 수행한다. 통과 목적으로 번역 내용을 훼손하지 않는다.
- 결정/근거: _작성 대기_

### 2911

- [x] 해결 확인
- 반영/검증 (2026-09-13): 원문/저장본 전체·예제 독립 계산·미승인 상태 대조 후 3검사 통과. 교집합 {2} 정정 근거와 해시 한정 수식 대응을 추가했다. [재검증 기록](data/reports/translation-2911-3009-3278-3052-3053-3054-2026-09-13.md).
- 자료: [원문](data/problems-source/2911.html) · [원사이트](https://yukicoder.me/problems/no/2911)
- 기록된 차단 사유: Source sample4 intersection typo {1} corrected to {2}; preservation checker rejects intentional correction; validate/lint/render pass.
- 필요한 해결: 예제 4 교집합 {1}→{2} 정정 근거를 검토하고 검사기가 정당한 원문 정정을 수용하도록 한다.
- 결정/근거: _작성 대기_

### 2925

- [x] 해결 확인
- 반영/검증 (2026-09-13): 원문/저장본 전체 대조,7셀 시간순·방향·실제데이터 및 중복bb패배 검산, literal WIN/LOSE 복원·제목수량·승리설명 부모교정 후3검사통과. [재검증 기록](data/reports/translation-2925-2965-3237-2026-09-13.md).
- 자료: [원문](data/problems-source/2925.html) · [원사이트](https://yukicoder.me/problems/no/2925)
- 기록된 차단 사유: Source interactive table outside .sample unsupported; all7 sequential IO exact, validate/lint pass, actual render0. Parent corrected explanatory WIN/LOSE math.
- 필요한 해결: 현행 검사기로 먼저 재현한다. 아직 실패하면 원문 구조/리터럴/동등한 URL/근거 있는 정정을 지원하도록 검사기를 수정하고 회귀 검사를 수행한다. 통과 목적으로 번역 내용을 훼손하지 않는다.
- 결정/근거: _작성 대기_

### 2962

- [x] 해결 확인
- 반영/검증 (2026-09-13): 표6셀 프로그램/저지 방향·맨해튼거리4/0및전역최솟값0검증, 응답입력절이동 후 전체대조·3검사통과. [재검증 기록](data/reports/translation-2962-3011-3018-3049-3050-3051-2026-09-13.md).
- 자료: [원문](data/problems-source/2962.html) · [원사이트](https://yukicoder.me/problems/no/2962)
- 기록된 차단 사유: Source table has no pre; parent restored6 chronological canonical IO fences after worker removed fences to bypass. Raw6 IO exact, validate/lint/render0; preservation fails6 missing source values.
- 필요한 해결: 현행 검사기로 먼저 재현한다. 아직 실패하면 원문 구조/리터럴/동등한 URL/근거 있는 정정을 지원하도록 검사기를 수정하고 회귀 검사를 수행한다. 통과 목적으로 번역 내용을 훼손하지 않는다.
- 결정/근거: _작성 대기_

### 2965

- [x] 해결 확인
- 반영/검증 (2026-09-13): CODE 밖 HTML들여쓰기 오인 해소,7셀 및5단계 상태·실패결과 검산. A숨김·연산번호·전체합mod괄호·중복설명 부모교정 후3검사통과. [재검증 기록](data/reports/translation-2925-2965-3237-2026-09-13.md).
- 자료: [원문](data/problems-source/2965.html) · [원사이트](https://yukicoder.me/problems/no/2965)
- 기록된 차단 사유: Source sample table unsupported: canonical two IO blocks restored after false pass via inline prose. Raw data/meaning retained; validator/lint/explicit KaTeX pass.
- 필요한 해결: 현행 검사기로 먼저 재현한다. 아직 실패하면 원문 구조/리터럴/동등한 URL/근거 있는 정정을 지원하도록 검사기를 수정하고 회귀 검사를 수행한다. 통과 목적으로 번역 내용을 훼손하지 않는다.
- 결정/근거: _작성 대기_

### 2967

- [x] 해결 확인
- 반영/검증 (2026-09-13): 원문 표8셀 시간순·방향과 응답4/2/−1·최종순열 직접 검증, 전체 대조 및3검사통과. [재검증 기록](data/reports/translation-2967-3177-3347-2026-09-13.md).
- 자료: [원문](data/problems-source/2967.html) · [원사이트](https://yukicoder.me/problems/no/2967)
- 기록된 차단 사유: Source interactive table unsupported; restored 8 chronological fenced IO blocks after false pass from removing fences. Raw data/meaning retained; validator/lint/explicit KaTeX passed.
- 필요한 해결: 현행 검사기로 먼저 재현한다. 아직 실패하면 원문 구조/리터럴/동등한 URL/근거 있는 정정을 지원하도록 검사기를 수정하고 회귀 검사를 수행한다. 통과 목적으로 번역 내용을 훼손하지 않는다.
- 결정/근거: _작성 대기_

### 2978

- [x] 해결 확인
- 반영/검증 (2026-09-13): 표8셀/모든6부분배열 비교, 별도−1형식·종료경고·공지위치·시간순설명 부모교정 후 전체대조·3검사 통과. [재검증 기록](data/reports/translation-2819-2848-2978-2026-09-13.md).
- 자료: [원문](data/problems-source/2978.html) · [원사이트](https://yukicoder.me/problems/no/2978)
- 기록된 차단 사유: Source interactive table unsupported; restored8 chronological fenced IO after false pass via Markdown table. Canonical queries/response moved to input, -1 math; validator/lint/explicit KaTeX pass.
- 필요한 해결: 현행 검사기로 먼저 재현한다. 아직 실패하면 원문 구조/리터럴/동등한 URL/근거 있는 정정을 지원하도록 검사기를 수정하고 회귀 검사를 수행한다. 통과 목적으로 번역 내용을 훼손하지 않는다.
- 결정/근거: _작성 대기_

### 3009

- [x] 해결 확인
- 반영/검증 (2026-09-13): 원문/저장본 전체·예제 독립 계산·미승인 상태 대조 후 3검사 통과. 이진 수식 원문 보존과 해시 한정 리터럴 검사를 추가했다. [재검증 기록](data/reports/translation-2911-3009-3278-3052-3053-3054-2026-09-13.md).
- 자료: [원문](data/problems-source/3009.html) · [원사이트](https://yukicoder.me/problems/no/3009)
- 기록된 차단 사유: Binary strings in source math incorrectly flagged as decimal thousands formatting. Parent restored no-space bit input, original set TeX boundaries and notice placement. All other gates/explicit KaTeX passed; preserve binary data.
- 필요한 해결: 현행 검사기로 먼저 재현한다. 아직 실패하면 원문 구조/리터럴/동등한 URL/근거 있는 정정을 지원하도록 검사기를 수정하고 회귀 검사를 수행한다. 통과 목적으로 번역 내용을 훼손하지 않는다.
- 결정/근거: _작성 대기_

### 3011

- [x] 해결 확인
- 반영/검증 (2026-09-13): 표6셀·첫수락즉시종료/N≤2x·전체예산영역검증, 이야기/공지/별도−1형식 부모교정 후 전체대조·3검사통과. [재검증 기록](data/reports/translation-2962-3011-3018-3049-3050-3051-2026-09-13.md).
- 자료: [원문](data/problems-source/3011.html) · [원사이트](https://yukicoder.me/problems/no/3011)
- 기록된 차단 사유: Interactive source table unsupported;6 chronological IO exact (out12,in0,out11,in0,out10,in1). Parent corrected too-high amount to too-many proposals and response numeric math; all other gates/explicit KaTeX pass. 岩井星人さん pending.
- 필요한 해결: 현행 검사기로 먼저 재현한다. 아직 실패하면 원문 구조/리터럴/동등한 URL/근거 있는 정정을 지원하도록 검사기를 수정하고 회귀 검사를 수행한다. 통과 목적으로 번역 내용을 훼손하지 않는다.
- 결정/근거: _작성 대기_

### 3018

- [x] 해결 확인
- 반영/검증 (2026-09-13): 표6셀·전체42칸후보/적응형오답가능성·p2검증, 공지위치 부모교정 후 전체대조·3검사통과. [재검증 기록](data/reports/translation-2962-3011-3018-3049-3050-3051-2026-09-13.md).
- 자료: [원문](data/problems-source/3018.html) · [원사이트](https://yukicoder.me/problems/no/3018)
- 기록된 차단 사유: Adaptive interactive source table unsupported;6 canonical chronological IO preserved (in6 7,out?3 2,in5,out?3 6,in13,out!1 3), final answer may be WA. Parent generic adaptive/numeric math correction. Other gates/explicit KaTeX pass; 岩井星人さん pending.
- 필요한 해결: 현행 검사기로 먼저 재현한다. 아직 실패하면 원문 구조/리터럴/동등한 URL/근거 있는 정정을 지원하도록 검사기를 수정하고 회귀 검사를 수행한다. 통과 목적으로 번역 내용을 훼손하지 않는다.
- 결정/근거: _작성 대기_

### 3042

- [x] 해결 확인
- 반영/검증 (2026-09-13): 빈 원문 출력 제목에 대응하는 출력2 보존, 원문/저장본 전체 대조 및 독립 배율 검산 완료. 단위/출력 문장 부모 교정 후 3검사 통과. [재검증 기록](data/reports/translation-3042-3115-3246-2026-09-13.md). 번역 승인과 별개다.
- 자료: [원문](data/problems-source/3042.html) · [원사이트](https://yukicoder.me/problems/no/3042)
- 기록된 차단 사유: Source sample output h6 is empty; checker cannot recognize output2. Parent restored canonical output after worker added unrecognized 출력 데이터 heading to falsely pass. Other gates/render0.
- 필요한 해결: 현행 검사기로 먼저 재현한다. 아직 실패하면 원문 구조/리터럴/동등한 URL/근거 있는 정정을 지원하도록 검사기를 수정하고 회귀 검사를 수행한다. 통과 목적으로 번역 내용을 훼손하지 않는다.
- 결정/근거: _작성 대기_

### 3069

- [x] 해결 확인
- 반영/검증 (2026-09-13): 원문 표9/15셀의 방향·시간순 설명·경계 제자리/도달/2N초과를 독립 검산. 원문 강조·수량 보완 후 전체 대조와 3검사 통과. [재검증 기록](data/reports/translation-3069-3055-2026-09-13.md).
- 자료: [원문](data/problems-source/3069.html) · [원사이트](https://yukicoder.me/problems/no/3069)
- 기록된 차단 사유: Interactive source tables unsupported: canonical chronological9/15 IO preserved, validate/lint/explicitKaTeX pass; preservation fails missing source samples.
- 필요한 해결: 현행 검사기로 먼저 재현한다. 아직 실패하면 원문 구조/리터럴/동등한 URL/근거 있는 정정을 지원하도록 검사기를 수정하고 회귀 검사를 수행한다. 통과 목적으로 번역 내용을 훼손하지 않는다.
- 결정/근거: _작성 대기_

### 3084

- [ ] 해결 확인
- 재검증 (2026-09-13): 표7셀/원문 코드6종 보존 및 질의·정답 절/공지위치/제목 수식 부모교정 후3검사는 통과. 원문 C의 scanf 포인터·세미콜론 누락을 syntax-only로 확인했으므로 해결 완료로 표시하지 않는다. 코드 정정 허용/출제자 확인 결정 필요. Python flush 주석과 오류 응답 괄호 값도 함께 확인 요청하며 외부 발송은 하지 않았다. [근거·요청 초안](data/reports/translation-3084-3088-3056-3057-2026-09-13.md).
- 자료: [원문](data/problems-source/3084.html) · [원사이트](https://yukicoder.me/problems/no/3084)
- 기록된 차단 사유: Source interactive table unsupported;7 chronological IO preserved;6 unique code examples exact, links restored;other gates/explicitKaTeX0. Source dubious code comments/sentinel parenthesis reported.
- 필요한 해결: 현행 검사기로 먼저 재현한다. 아직 실패하면 원문 구조/리터럴/동등한 URL/근거 있는 정정을 지원하도록 검사기를 수정하고 회귀 검사를 수행한다. 통과 목적으로 번역 내용을 훼손하지 않는다.
- 결정/근거: _작성 대기_

### 3088

- [x] 해결 확인
- 반영/검증 (2026-09-13): 원문 진법 표기·비트열 유지, 제목/설명절 부모교정 후 전체대조·3검사통과. N0..128 전수검산 및 모든 최상위 비트 후보의 전역 곱 상계로 큰 예제 최적성 확인. [재검증 기록](data/reports/translation-3084-3088-3056-3057-2026-09-13.md).
- 자료: [원문](data/problems-source/3088.html) · [원사이트](https://yukicoder.me/problems/no/3088)
- 기록된 차단 사유: Binary1100/1010 misclassified as decimal thousands; original bitstrings preserved. Other gates and explicitKaTeX0.
- 필요한 해결: 현행 검사기로 먼저 재현한다. 아직 실패하면 원문 구조/리터럴/동등한 URL/근거 있는 정정을 지원하도록 검사기를 수정하고 회귀 검사를 수행한다. 통과 목적으로 번역 내용을 훼손하지 않는다.
- 결정/근거: _작성 대기_

### 3115

- [x] 해결 확인
- 반영/검증 (2026-09-13): 표4셀의 방향·순서·실제 데이터 및 적응형 예제 계산 대조 완료. 출력 형식/닫는 달러/제목 수량 부모 교정 후 3검사 통과. 출력 수식 검사 누락도 회귀 테스트와 함께 보완했다. [재검증 기록](data/reports/translation-3042-3115-3246-2026-09-13.md).
- 자료: [원문](data/problems-source/3115.html) · [원사이트](https://yukicoder.me/problems/no/3115)
- 기록된 차단 사유: Original interactive table not recognized by preservation checker; chronological four IO blocks restored and parent other gates/render pass.
- 필요한 해결: 현행 검사기로 먼저 재현한다. 아직 실패하면 원문 구조/리터럴/동등한 URL/근거 있는 정정을 지원하도록 검사기를 수정하고 회귀 검사를 수행한다. 통과 목적으로 번역 내용을 훼손하지 않는다.
- 결정/근거: _작성 대기_

### 3120

- [x] 해결 확인
- 반영/검증 (2026-09-13): 실제 9개 대화형 셀과 방향, K 감소 및 승패 재현. 부모가 실제 저장본의 출력 형식 오배치를 수정한 후 3검사 통과. [재검증](data/reports/translation-3120-3161-3058-3059-2026-09-13.md). 사람 승인 아님.
- 자료: [원문](data/problems-source/3120.html) · [원사이트](https://yukicoder.me/problems/no/3120)
- 기록된 차단 사유: Original interactive table unsupported by preservation checker; nine chronological IO blocks and explanations restored; parent other gates/render pass.
- 필요한 해결: 현행 검사기로 먼저 재현한다. 아직 실패하면 원문 구조/리터럴/동등한 URL/근거 있는 정정을 지원하도록 검사기를 수정하고 회귀 검사를 수행한다. 통과 목적으로 번역 내용을 훼손하지 않는다.
- 결정/근거: _작성 대기_

### 3161

- [x] 해결 확인
- 반영/검증 (2026-09-13): 실제 12개 대화형 셀/방향/경계/비적응형 예외 검산, 부모 질의 출력 절 이동·수치 응답 수식·부정 범위 교정 후 3검사 통과. 物理好き君 표기는 미확정 원문 유지. [재검증](data/reports/translation-3120-3161-3058-3059-2026-09-13.md). 사람 승인 아님.
- 자료: [원문](data/problems-source/3161.html) · [원사이트](https://yukicoder.me/problems/no/3161)
- 기록된 차단 사유: Preservation checker does not recognize source interactive table; 12 chronological IO cells manually matched, validate/lint/SITE_KATEX pass.
- 필요한 해결: 현행 검사기로 먼저 재현한다. 아직 실패하면 원문 구조/리터럴/동등한 URL/근거 있는 정정을 지원하도록 검사기를 수정하고 회귀 검사를 수행한다. 통과 목적으로 번역 내용을 훼손하지 않는다.
- 결정/근거: _작성 대기_

### 3177

- [x] 해결 확인
- 반영/검증 (2026-09-13): 출력전용 예제 파서 지원,010 오답·양변1 보존. 공지 위치/세 값의 묶음 수량 부모교정,8튜플 전수계산·전체 대조·3검사통과. [재검증 기록](data/reports/translation-2967-3177-3347-2026-09-13.md).
- 자료: [원문](data/problems-source/3177.html) · [원사이트](https://yukicoder.me/problems/no/3177)
- 기록된 차단 사유: 출력 전용 원문 예제 미지원: preservation 예제1 원문 없음. 부모 전체 대조, 실제 출력 0 1 0 및 오답 설명/양변1 보존; validate/lint/명시적 KaTeX 0 오류. 가공 빈 입력 블록 제거. 03 규칙 실제 존재하는 예제 블록만 작성하도록 수정.
- 필요한 해결: 현행 검사기로 먼저 재현한다. 아직 실패하면 원문 구조/리터럴/동등한 URL/근거 있는 정정을 지원하도록 검사기를 수정하고 회귀 검사를 수행한다. 통과 목적으로 번역 내용을 훼손하지 않는다.
- 결정/근거: _작성 대기_

### 3212

- [x] 해결 확인
- 반영/검증 (2026-09-13): 표6셀·적응적 후보 전수확인, 응답형식3블록 복원/공지위치/전체이름 부모교정 후 전체대조·3검사·추가KaTeX통과. [재검증 기록](data/reports/translation-3212-3400-5003-2026-09-13.md).
- 자료: [원문](data/problems-source/3212.html) · [원사이트](https://yukicoder.me/problems/no/3212)
- 기록된 차단 사유: 원문표6IO셀을검사기가예제로인식하지못함. 부모전체대조/시간순6블록직접일치,7/9응답모두1,0확인. 호칭chikuwa氏/원안절/누락설명복원 및SUPER/수량부모보정. validate/lint통과,preservation실패. 이름chikuwa氏미확정원문유지.
- 필요한 해결: 현행 검사기로 먼저 재현한다. 아직 실패하면 원문 구조/리터럴/동등한 URL/근거 있는 정정을 지원하도록 검사기를 수정하고 회귀 검사를 수행한다. 통과 목적으로 번역 내용을 훼손하지 않는다.
- 결정/근거: _작성 대기_

### 3237

- [x] 해결 확인
- 반영/검증 (2026-09-13): CODE 밖 장식$~$ 오인 해소,10셀 시간순/방향 및후보{1,5}검산. 출력형식위치·Invalid리터럴·초기입력정수범위·교차참조 부모교정 후3검사통과. はるく君 원문유지. [재검증 기록](data/reports/translation-2925-2965-3237-2026-09-13.md).
- 자료: [원문](data/problems-source/3237.html) · [원사이트](https://yukicoder.me/problems/no/3237)
- 기록된 차단 사유: 원문대화표예제미인식: check:translation 예제1원문없음. 원문/저장본전체대조및10개실제입출력셀시간순보존확인. 질의끝점조건및1포함Yes/No직접계산;두응답후후보1,5남아적응형정답보장없다는주의보존. validate/lint통과. KaTeX별도확인아직안함. はるく君원문유지.
- 필요한 해결: 현행 검사기로 먼저 재현한다. 아직 실패하면 원문 구조/리터럴/동등한 URL/근거 있는 정정을 지원하도록 검사기를 수정하고 회귀 검사를 수행한다. 통과 목적으로 번역 내용을 훼손하지 않는다.
- 결정/근거: _작성 대기_

### 3246

- [x] 해결 확인
- 반영/검증 (2026-09-13): 표9셀의 방향·순서·실제 데이터, 잘못된 질의 응답과 대입 실패 상태, 10개 강조 전체 대조 완료. 제목 수량 부모 교정 후 3검사 통과. [재검증 기록](data/reports/translation-3042-3115-3246-2026-09-13.md).
- 자료: [원문](data/problems-source/3246.html) · [원사이트](https://yukicoder.me/problems/no/3246)
- 기록된 차단 사유: 원문표를.sample로인식하지못해preservation검사예제1원문없음실패. 완료수제외.
- 필요한 해결: 현행 검사기로 먼저 재현한다. 아직 실패하면 원문 구조/리터럴/동등한 URL/근거 있는 정정을 지원하도록 검사기를 수정하고 회귀 검사를 수행한다. 통과 목적으로 번역 내용을 훼손하지 않는다.
- 결정/근거: _작성 대기_

### 3276

- [x] 해결 확인
- 반영/검증 (2026-09-13): 이진수1101_(2) 그대로 현행검사통과, BR입력6행/예제보존 및 최소양의x 전수검산. [재검증](data/reports/translation-3276-3359-3064-3065-2026-09-13.md). 사람 승인 아님.
- 자료: [원문](data/problems-source/3276.html) · [원사이트](https://yukicoder.me/problems/no/3276)
- 기록된 차단 사유: 부모preservation재실행:원문이진수1101_(2)를십진정수서식오류로오인해실패. 이진수보존하며완료수제외.
- 필요한 해결: 현행 검사기로 먼저 재현한다. 아직 실패하면 원문 구조/리터럴/동등한 URL/근거 있는 정정을 지원하도록 검사기를 수정하고 회귀 검사를 수행한다. 통과 목적으로 번역 내용을 훼손하지 않는다.
- 결정/근거: _작성 대기_

### 3278

- [x] 해결 확인
- 반영/검증 (2026-09-13): 원문/저장본 전체·예제 독립 계산·미승인 상태 대조 후 3검사 통과. 원문 Python PRE/CODE를 기존 html=code 펜스로 보존했고 코드는 실행하지 않았다. [재검증 기록](data/reports/translation-2911-3009-3278-3052-3053-3054-2026-09-13.md).
- 자료: [원문](data/problems-source/3278.html) · [원사이트](https://yukicoder.me/problems/no/3278)
- 기록된 차단 사유: 부모preservation재실행:원문Python정규식의대괄호이스케이프를수식으로오인하여KaTeX실패. 코드변형우회금지,원문보존하고완료수제외.
- 필요한 해결: 현행 검사기로 먼저 재현한다. 아직 실패하면 원문 구조/리터럴/동등한 URL/근거 있는 정정을 지원하도록 검사기를 수정하고 회귀 검사를 수행한다. 통과 목적으로 번역 내용을 훼손하지 않는다.
- 결정/근거: _작성 대기_

### 3347

- [x] 해결 확인
- 반영/검증 (2026-09-13): 원문 표6셀 시간순·방향·비연속 부분 수열 Yes/No·최종배열 검증. 질문/응답 절 분리와 강조복원 후 전체 대조·3검사통과. [재검증 기록](data/reports/translation-2967-3177-3347-2026-09-13.md).
- 자료: [원문](data/problems-source/3347.html) · [원사이트](https://yukicoder.me/problems/no/3347)
- 기록된 차단 사유: 부모 원문/저장본 전체 대조. 모든출력 flush/개행 조건 및 인터랙티브 정의 누락 복원, 질문형식 입력절 및 예제제목/입출력제목 복원 요청 후 확인. 원문표 시간순6개 IO셀과 저장6블록 일치, (1,2,4) 부분수열 Yes/(3,2,1) No 확인. validate/lint/별도 SITE_KATEX 오류0. 보존검사 원문표 미인식으로 예제1없음 실패하므로 보류; 우회안함.
- 필요한 해결: 현행 검사기로 먼저 재현한다. 아직 실패하면 원문 구조/리터럴/동등한 URL/근거 있는 정정을 지원하도록 검사기를 수정하고 회귀 검사를 수행한다. 통과 목적으로 번역 내용을 훼손하지 않는다.
- 결정/근거: _작성 대기_

### 3359

- [x] 해결 확인
- 반영/검증 (2026-09-13): Unicode원문URL 그대로 현행정규화검사통과, 허용C전체1000개 정확절삭/강조7곳대응/3검사통과. 브링근호는 고등과학원 한국어용례확인, ブリング・ジェラード標準形 은 미확정원문유지·명칭확인필요. [근거/재검증](data/reports/translation-3276-3359-3064-3065-2026-09-13.md). 사람 승인 아님.
- 자료: [원문](data/problems-source/3359.html) · [원사이트](https://yukicoder.me/problems/no/3359)
- 기록된 차단 사유: 부모 원문/저장본 전체 대조. 비음이아닌->음이아닌 및 수량/차수 수정요청 확인. 정수다항식 k^5+k*10^12-C*10^15 경계로 예제0.000/0.754/1.000 정확절삭 확인. 링크원문=저장본, 렌더후 percent-encoding되며 decodeURI 동일을 직접 확인; 보존검사 href비교 실패라 보류. 브링근호/브링제라드 표준형 한국어 표준명 근거는 추가확인 필요(영문 자료만으로 한국어 표준명 입증 불충분). validate/lint 에이전트통과; 별도KaTeX 미확인.
- 필요한 해결: Unicode URL의 동등성 검사 문제를 재현/수정하고, 브링 근호·브링–제라드 표준형의 한국어 표기를 확인한다.
- 결정/근거: _작성 대기_

### 3400

- [x] 해결 확인
- 반영/검증 (2026-09-13): 표7셀·응답4/−1·의도적오답 검산, 질의절/제목수식 교정 후 전체대조·3검사·추가KaTeX통과. [재검증 기록](data/reports/translation-3212-3400-5003-2026-09-13.md).
- 자료: [원문](data/problems-source/3400.html) · [원사이트](https://yukicoder.me/problems/no/3400)
- 기록된 차단 사유: 부모 원문/저장본 전체 대조. 원문표7IO셀과 MDX7블록 순서/데이터 직접일치 확인. P=(1,3,4,5,2) 쿼리4/-1 및 의도적최종WA 보존. judge재판오역/IO제목누락 수정요청 후확인. validate/lint통과, preservation 원문표code셀 미인식7블록오류로보류. 별도KaTeX 미실행. Nana/이야기문자열 원문유지.
- 필요한 해결: 현행 검사기로 먼저 재현한다. 아직 실패하면 원문 구조/리터럴/동등한 URL/근거 있는 정정을 지원하도록 검사기를 수정하고 회귀 검사를 수행한다. 통과 목적으로 번역 내용을 훼손하지 않는다.
- 결정/근거: _작성 대기_

### 3553

- [x] 해결 확인
- 반영/검증 (2026-09-13): 모든 q의 동작 정의와 입력에 근거한 t_1→t_q 정정을 원문 해시·수식·횟수 결합으로 지원했다. 전체 부분집합 전수 예제 일치, 부모 강조 복원 후 3검사 통과. [근거/재검증](data/reports/translation-3553-3582-2026-09-13.md). 사람 승인 아님.
- 자료: [원문](data/problems-source/3553.html) · [원사이트](https://yukicoder.me/problems/no/3553)
- 기록된 차단 사유: 개별보류: 원문t1집합제약을본문전체질의정의에맞게tq로수정했으나집합수식보존검사가이를원문불일치로거부. 검사우회없이의도적원문오기수정근거를지원하는검증경로필요. 예제파일명복원/모든예제독립검산완료,validate/lint통과. 전체번역목표는계속진행. 미승인유지.
- 필요한 해결: 질의 종류 제한 t_1→t_q 정정 근거를 검토하고 집합 수식 보존 검사를 지원한다.
- 결정/근거: _작성 대기_

### 3582

- [x] 해결 확인
- 반영/검증 (2026-09-13): B=0/단독 T/양의 인덱스 조건으로 두 튜플의 빈 집합 정정, 빈 집합 합의 상한1 제거를 확정했다. 원문 해시·수식·횟수 결합 검사 및 전 정수 합집합 증명, 3검사 통과. [근거/재검증](data/reports/translation-3553-3582-2026-09-13.md). 사람 승인 아님.
- 자료: [원문](data/problems-source/3582.html) · [원사이트](https://yukicoder.me/problems/no/3582)
- 기록된 차단 사유: 개별보류: 원문/최종전체대조. B0와단독T입력및후속공집합합에따라예제1/2튜플T={0}를빈집합으로교정,예제2빈집합합상한1삭제. 부모보존검사재실행해두튜플및displaystyle충돌재현. 올바른교정을철회하거나오기중복삽입하지않음. 근거있는원문교정검증경로필요. 예제2두번째쿼리단독은전체정수가아니라x>=-1이며첫쿼리와합집합이전체임을저장본에서확인. 미승인유지.
- 필요한 해결: B=0/단독 T 입력의 빈 집합 정정과 합 상한 삭제 근거를 확인하고, 올바른 교정본을 검사할 경로를 마련한다.
- 결정/근거: _작성 대기_

### 5003

- [x] 해결 확인
- 반영/검증 (2026-09-13): 명시적턴예제5개 지원, 코드3개/날짜공지7개/시설표/각턴3단계 직접검증. 단위/순번 부모교정 후 전체대조·3검사·추가KaTeX통과. [재검증 기록](data/reports/translation-3212-3400-5003-2026-09-13.md).
- 자료: [원문](data/problems-source/5003.html) · [원사이트](https://yukicoder.me/problems/no/5003)
- 기록된 차단 사유: 원문/최종전체대조/부모diff validate lint통과,check:translation은예제1이원문에없음실패:source샘플이div.sample없이h4サンプル+5pre로구성되어인식누락. 정상###예제1및####출력5개유지하고보류. 부모출력절형식분리/이야기code해제/번호·단위·bold·인물제목·원문실행코드복원지시,agent새1가지오류와인용제목우회발생하여반복재수정. 자율준수성공아님. 명령/C코드decode후동일true,true/원문예제5출력문자열순서동일/5턴전중간값parentSampleVerification일치/시설표모든수치·효과순서·구매판매강화 보존. 이미지0/미확정物理好きさん·게임명物理好きクリッカー원문유지/미승인유지.
- 필요한 해결: 현행 검사기로 먼저 재현한다. 아직 실패하면 원문 구조/리터럴/동등한 URL/근거 있는 정정을 지원하도록 검사기를 수정하고 회귀 검사를 수행한다. 통과 목적으로 번역 내용을 훼손하지 않는다.
- 결정/근거: _작성 대기_

### 5016

- [x] 해결 확인 — 2026-09-13 전체 재대조·독립 검산·미승인 강제 검사 통과. [근거](data/reports/translation-5016-8014-8015-3068-2026-09-13.md)
- 자료: [원문](data/problems-source/5016.html) · [원사이트](https://yukicoder.me/problems/no/5016)
- 기록된 차단 사유: 부모 원문/최종전체대조 및 diff validate lint 통과. check:translation은 원문プログラムからの入力/プログラムの出力 표11셀미인식만실패(이미지/파일명오류는실제누락수정후해소). 부모 직접source11td text와MDX11실제text블록모두동일true11개/방향시계열보존하여검사기한계보류. 부모누락JPEG2복원·원문없는정규분포삭제·출력형식절이동·수량/강조/본문실패값수식 반복지시,최종S/T수식과샘플공지bold부모수정. 모든최단경로·수익·자금검산및원문이미지/미리보기 parentSampleVerification,parentImageVerification,parentImagePreview. 未확정太郎君/KYOPRO 원문유지/미승인 유지.
- 필요한 해결: 현행 검사기로 먼저 재현한다. 아직 실패하면 원문 구조/리터럴/동등한 URL/근거 있는 정정을 지원하도록 검사기를 수정하고 회귀 검사를 수행한다. 통과 목적으로 번역 내용을 훼손하지 않는다.
- 결정/근거: 2026-09-13 현행 검사·전체 원문/저장본·독립 계산 재검증 완료. 위 연결 보고서에 최초 보고 오류와 부모 개입, 실제 미승인 상태, 남긴 미확정 이름을 구분했다.

### 8014

- [x] 해결 확인 — 2026-09-13 전체 재대조·독립 검산·미승인 강제 검사 통과. [근거](data/reports/translation-5016-8014-8015-3068-2026-09-13.md)
- 자료: [원문](data/problems-source/8014.html) · [원사이트](https://yukicoder.me/problems/no/8014)
- 기록된 차단 사유: 부모원문/최종전체대조 및 diff validate lint통과. check는원문sample2가samplediv밖인구조미인식에따른2입출력/파일명만실패. JSDOMsource고정실입력및4샘플블록모두저장본동일true5개. 올바른###예제2{file빈값}/####입출력유지,제목깊이우회금지지시후보류. 부모가정→제한오역/출력누락/가짜파일명/수량/하드코딩번역교정후상태. BigInt해시342/409775251 parentSampleVerification. 이미지0/미확정없음/미승인유지.
- 필요한 해결: 현행 검사기로 먼저 재현한다. 아직 실패하면 원문 구조/리터럴/동등한 URL/근거 있는 정정을 지원하도록 검사기를 수정하고 회귀 검사를 수행한다. 통과 목적으로 번역 내용을 훼손하지 않는다.
- 결정/근거: 2026-09-13 현행 검사·전체 원문/저장본·독립 계산 재검증 완료. 위 연결 보고서에 최초 보고 오류와 부모 개입, 실제 미승인 상태, 남긴 미확정 이름을 구분했다.

### 8015

- [x] 해결 확인 — 2026-09-13 전체 재대조·독립 검산·미승인 강제 검사 통과. [근거](data/reports/translation-5016-8014-8015-3068-2026-09-13.md)
- 자료: [원문](data/problems-source/8015.html) · [원사이트](https://yukicoder.me/problems/no/8015)
- 기록된 차단 사유: 부모원문/최종전체대조 및 diff validate lint 통과. check는원문Unicodehref→Markdownpercentencoding만실패,decodeURI동일true확인한검사한계보류. JSDOMsource코드와4예제블록모두저장본동일true5개. rawHTMLpre직후개행은DOM에서제거되므로부모선행빈줄지시가잘못됐음정정/01규칙보완. 부모S=abcz리터럴분리후통과항목유지. BigInt두쌍hash4길이20/다름parentSampleVerification. 太郎君원문호칭유지/이미지0/미승인유지.
- 필요한 해결: 현행 검사기로 먼저 재현한다. 아직 실패하면 원문 구조/리터럴/동등한 URL/근거 있는 정정을 지원하도록 검사기를 수정하고 회귀 검사를 수행한다. 통과 목적으로 번역 내용을 훼손하지 않는다.
- 결정/근거: 2026-09-13 현행 검사·전체 원문/저장본·독립 계산 재검증 완료. 위 연결 보고서에 최초 보고 오류와 부모 개입, 실제 미승인 상태, 남긴 미확정 이름을 구분했다.

## 추가 명칭 확인 (재검증에서 이관)

### 3076 · 3077

- [ ] 제목 명칭 확인 — 기존 `Goodstuff Deck Builder` → `굿스터프 덱 빌더` 표기를 사용할지 사람 확인 대기. 3077의 같은 제목 `(어려움)`도 포함.
- 본문·형식·예제 독립검산·미승인 강제 검사는 2026-09-13 완료했다. 제목 미확정을 본문 실패와 구분한다.
- 자료: [3076 원문](data/problems-source/3076.html), [3077 원문](data/problems-source/3077.html). [재검증 근거](data/reports/translation-3076-3077-2026-09-13.md)
- 필요한 결정: 기존 한국어 제목을 확정하거나 사용할 대체 표기를 지정한다. 현재 제목은 임의로 확정·용어집 등록하지 않았다.

## 재검증 중 확인된 표시 차단

### 3096

- 2026-09-13 작업 완료: 원문URL/해시 기록의 로컬PNG2개 보존지원과 실제 미리보기 통과. frontier 연결성/차수DP로 큰예제545088277까지 정확 계산, N1..6 모든단순경로 DFS 교차확인. 번역 재검증 통과, 실제 플러그인 표시 사람 확인 요청. [근거](data/reports/translation-external-images-2026-09-13.md).

- [ ] 실제 검토 미리보기의 GitHub 이미지 표시 확인/지원 필요.
- 원문·번역·예제·보존 검사 및 원본 그림 2개의 시각 대조는 완료했다. MDX URL/위치와 원본 파일은 정상이다.
- 원인: `tools/review/public/app/preview-document.ts`의 `img-src` CSP가 GitHub를 허용하지 않아 실제 미리보기에서 두 이미지 모두 너비 0이다. 외부 요청 없이 다운로드 파일을 같은 URL에 응답하는 재현에서도 실패했다.
- 필요한 해결: 원문 리소스를 보존하는 검토 표시 경로를 확인하거나 지원한다. 검사 통과를 위해 CSP를 제거하거나 원문 이미지 URL을 바꾸지 않았다.
- [대조·재현 기록](data/reports/translation-3096-3097-2026-09-13.md). 번역 내용의 불명확함과 UI 표시 실패를 구분하며, 현재는 완료로 집계하지 않는다.

## 주의

이 목록의 기술적 차단은 사용자의 번역 판단이 반드시 필요한 항목과 다르다. 특히 표 예제 인식, 출력 전용 예제, 이진수/코드 오탐, URL 인코딩, SVG/이미지 분리는 현재 구현을 다시 확인한 뒤 해결할 개발 작업이다. 검사 통과를 위해 예제 표를 지우거나 코드·집합·문자열을 원문과 다르게 바꾸지 않는다.
