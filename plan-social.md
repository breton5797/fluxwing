---
status: APPROVED   # 2026-10-18 사용자 승인: Q1=T0+T1(앱 열려있을 때만), Q5=랭크 +50/+20/-20/-50, Q8=승인제+자동옵션, 나머지 Q2~Q4,Q6,Q7,Q9~Q11=권장안
created: 2026-10-18
ambiguity:
  goal_clarity: 0.8
  constraint_clarity: 0.85
  success_criteria: 0.75
  context_clarity: 0.85
  total_ambiguity: 0.19        # brownfield 가중치 .35/.25/.25/.15 → clarity 0.8075. 단, open_questions의 Q1·Q5·Q8 답에 따라 다시 매김
  threshold: 0.20
restate: "Flux Wing index.html에 다음 다섯 가지를 붙인다: 친구 코드로 맺는 상호 친구, 친구 접속·최고기록 알림(앱이 열려 있을 때 인앱 토스트+Notification), 알림 켜기/끄기 토글, 서버가 정산하는 4인 FFA(순위별 RP), 코인 30만으로 만들고 길드장이 정한 조건으로 가입을 받는 길드. 기존 1v1/2v2·fair mode·RP 규칙과 132개 테스트는 그대로 둔다."
requirements:                   # [from-user] 원문 5건
  - R1 친구 기능
  - R2 친구 접속 / 친구 최고기록 갱신 시 푸시 알림
  - R3 푸시 알림 on/off 토글
  - R4 대전 4인 각개전(FFA)
  - R5 길드 — 생성 비용 코인 300,000, 길드장이 설정한 조건을 충족한 회원의 가입을 받음
constraints:
  - "[from-user] index.html 단일 파일 유지. src/, v2.html 수정 금지 (sw.js를 다시 살리는 것은 T2에서만, 그때 별도 승인)"
  - "[from-user] 기존 node --test 132개 그린 유지. 신규 순수 로직은 /* social-core:start */ … /* social-core:end */ 블록에 두고 tests/helpers/social.js로 추출해 테스트"
  - "[from-code] 백엔드는 Supabase 익명 auth + RPC + Realtime뿐. Edge Function 없음. 모든 쓰기는 public.* SECURITY INVOKER 래퍼 → private.fw_* SECURITY DEFINER(search_path='') 패턴으로"
  - "[from-code] 코인(W.coins)은 클라이언트 로컬 지갑(fw27_wallet2). 서버는 잔액을 모름"
  - "[from-code] fair mode(daily/versus 유닛 능력 캡: fairMode(), skv, SK[].f)와 RP 규칙(1v1/2v2 +50/−50, floor 0, AI 끼면 연습전)은 바꾸지 않음"
  - "[from-code] Realtime 토픽은 realtime.messages RLS 정규식(schema.sql 1148-1159)에 맞아야 함. 새 토픽 모양을 쓰면 정책도 같이 바꿈"
  - "[from-user] 배포 타깃: claude.ai 아티팩트(Version 11) + PWA"
acceptance_criteria:
  - id: AC1
    desc: "친구: 내 8자리 친구 코드 표시·복사 → 다른 기기에서 그 코드로 요청 → 수락하면 양쪽 친구 목록에 닉네임·최고기록·접속 상태가 보임. 삭제는 양쪽에 반영. 자기 자신·중복·상한 초과 요청은 거부"
    verifier: "node --test tests/social-core.test.js (코드 형식/정규화) + SQL editor 체크 스크립트 supabase/checks/social.sql 전부 PASS + Playwright 2-context 스모크"
    status: pending
  - id: AC2
    desc: "알림: 친구 B가 접속(social_hello)하거나 fw_scores.best를 갱신하면 A에게 30초 안에 인앱 토스트가 뜸. 탭이 숨겨져 있고 권한이 granted면 Notification으로 뜸. 같은 친구의 접속 알림은 서버에서 15분에 한 번으로 묶임"
    verifier: "Playwright 2-context: B에서 submitScore → A에서 toast DOM 확인. Notification은 page.context().grantPermissions + window.Notification 스텁 호출 횟수"
    status: pending
  - id: AC3
    desc: "토글: 설정의 #pushBtn(벨, #vibBtn 패턴)이 fw27_push를 저장. off면 토스트·Notification 모두 0회. on으로 바꿀 때만 Notification.requestPermission 호출. 권한 denied / 아티팩트 환경에서는 '인앱만' 안내"
    verifier: "node test: notifyRoute(setting, perm, hidden, env) 진리표 + Playwright: off 상태에서 친구 이벤트 주입 → toast 0"
    status: pending
  - id: AC4
    desc: "FFA: 대전 패널에 1v1/2v2/FFA 세 모드. FFA 빠른매칭(m-lobby-ffa)·코드방에서 4명이 모이면 같은 시드 코스로 시작. 결과 화면에 1~4위 표시. 인간 4명이면 서버가 순위 RP [+50,+20,−20,−50](floor 0)를 정산하고, AI가 한 자리라도 끼면 연습전"
    verifier: "node test: ffaPlaces/ffaRp/ffaMatchId + vs-rules 드리프트(클라 FFA_RP ↔ fw_vs_cfg ffa_rp) + FW.selfTest().vsFfa=true + Playwright #localtest 4-page 스모크"
    status: pending
  - id: AC5
    desc: "FFA를 넣은 뒤에도 1v1/2v2 동작은 그대로: FW.selfTest의 vsRank·vs2가 수정 없이 true. fw_vs_settle의 1v1/2v2 분기는 결과가 바뀌지 않음"
    verifier: "FW.selfTest() 전체 true(#dev localhost) + supabase/checks/versus-regress.sql"
    status: pending
  - id: AC6
    desc: "길드 생성: 코인 300,000 미만이면 버튼 비활성. RPC가 성공한 뒤에만 W.coins를 300,000 차감(한 번만). 이름은 2~14자, 대소문자 무시 유일, 금칙어 필터. 한 사람은 길드 하나에만 속함"
    verifier: "node test: guildCostOk / guildPayOnce(멱등 토큰) + SQL check(중복 이름·이중 소속 거부)"
    status: pending
  - id: AC7
    desc: "길드 가입: 길드장이 조건(min_best, min_rp)과 방식(승인제/자동)을 정함. 조건 미달 신청은 서버가 fw_scores/fw_versus로 확인해 거부. 승인제면 길드장이 수락/거절. 탈퇴·추방·해산 가능. 길드 목록은 이름 검색·인원순"
    verifier: "SQL check: 조건 미달 → fw_guild_req_unmet, 정원 초과 → fw_guild_full, 남이 추방 시도 → 42501 + Playwright 생성→신청→승인 스모크"
    status: pending
  - id: AC8
    desc: "회귀: 기존 132개 + 신규 테스트 전부 그린. parse-guard가 social-core의 전역 재선언 금지까지 검사. ko/en/ja/zh 신규 i18n 키 누락 0"
    verifier: "node --test → 0 failures, 신규 i18n 키 테스트"
    status: pending
open_questions:                 # 사용자 결정 필요. 각 항목에 추천 포함
  - id: Q1
    q: "'푸시'의 MVP 범위: 앱이 열려 있을 때만(T0 인앱 토스트 + T1 Notification) 하고 앱이 닫혀 있을 때 오는 진짜 Web Push(T2)는 다음으로 미뤄도 되는가?"
    rec: "미룬다. 아티팩트에서는 T2가 원리적으로 안 되고, PWA에서도 VAPID 발송 백엔드(Edge Function)와 SW 재도입이 필요하다. 결정표 D1 참조"
  - id: Q2
    q: "친구 관계는 상호 수락(요청→수락)인가, 한쪽 팔로우인가?"
    rec: "상호 수락. 접속 시각을 알리는 기능이라 상대 동의가 필요하다"
  - id: Q3
    q: "친구 추가 수단"
    rec: "친구 코드(서버 발급 8자, Crockford base32) + 랭킹 행·대전 결과 화면에서 바로 요청. 닉네임 검색은 하지 않음 (D2)"
  - id: Q4
    q: "알림 토글은 마스터 하나인가, 종류별(접속/최고기록)인가?"
    rec: "마스터 1개(#pushBtn) + 친구 패널에 종류별 체크 2개. 비용이 거의 없음"
  - id: Q5
    q: "FFA를 랭크(RP 변동)로 할 것인가?"
    rec: "랭크로 한다. 인간 4명일 때만, 순위 RP [+50,+20,−20,−50], 보고 2명 이상이 일치해야 정산 (D3). 일정이 빠듯하면 Phase 3a(연습전)만 먼저 내보낼 수 있음"
  - id: Q6
    q: "FFA 동점 처리"
    rec: "같은 점수는 같은 순위. 같은 순위끼리는 해당 순위 구간 RP의 평균(0 쪽으로 반올림)을 받음. 예: 1·2위 동점이면 각 +35"
  - id: Q7
    q: "길드 생성 코인 차감 모델"
    rec: "클라이언트 차감 + 신뢰(상점·유닛 구매와 같은 신뢰 모델). 서버 지갑 도입은 Non-goal (D4)"
  - id: Q8
    q: "'조건을 충족하는 회원의 가입을 받는다'의 해석: 조건만 맞으면 자동 가입인가, 조건으로 거른 뒤 길드장이 승인하는가?"
    rec: "길드장이 고름. 기본은 승인제, 자동 가입 옵션 제공. 서버에서는 분기 하나라 비용이 작음"
  - id: Q9
    q: "길드 정원과 가입 조건 종류"
    rec: "정원 30. 조건은 min_best(엔드리스 최고기록)와 min_rp(현 시즌 RP). 티어는 rp에서 파생되므로 min_rp로 표현. RP는 매월 리셋된다는 점을 UI에 표시"
  - id: Q10
    q: "길드 해산·길드장 이탈 시 코인 환불"
    rec: "환불 없음. 길드장은 위임(transfer) 또는 해산만 가능"
  - id: Q11
    q: "익명 세션이 소실되면(sbReauth = 새 uid) 친구·길드도 사라지는데, MVP에서 받아들일 것인가?"
    rec: "받아들이고 UI에 경고. 근본 해결은 보류 중인 계정 로그인(PR #30) 출시에 연동"
out_of_scope:
  - "앱이 닫혀 있을 때 오는 Web Push(T2: SW + VAPID + Edge Function) — 별도 계획"
  - "채팅(친구/길드), 길드전, 길드 랭킹·보상, 길드 레벨, 길드 창고/기부"
  - "서버 지갑(코인 서버화), 결제"
  - "닉네임 검색, 친구 추천, 차단 목록(삭제로 대체), 친구 초대 링크/QR"
  - "FFA 6인 이상, FFA 팀전 변형, FFA 관전"
  - "친구에게 내 접속 숨기기(프라이버시 모드) — 후속"
  - "친구 간 직접 대전 초대 — 후속(기존 코드방 공유로 대체)"
---

# Implementation Plan: Flux Wing 소셜 5종 (친구 · 알림 · 알림 토글 · 4인 FFA · 길드)

## Overview
동네 오락실에 비유하면: 친구 = 단골끼리 주고받는 명함(친구 코드), 알림 = 가게 안에 있을 때 울리는 호출벨(앱을 닫으면 안 들림), FFA = 4명이 한 기계에서 순위를 다투는 판, 길드 = 회비(코인 30만)를 내고 만드는 동호회입니다.
기술적으로는 기존 Supabase 3종(익명 auth, SECURITY DEFINER RPC, Realtime private 채널)만으로 만듭니다. 새 인프라(Edge Function, Service Worker, 서버 지갑)는 도입하지 않습니다.

## 조사 결과 요약 (근거)
- [from-code] 리더보드: `fw_scores`(RLS select-only, 쓰기는 `submit_score` RPC), `LB_COLS`, 20초 `lbPoll`(document.hidden이면 건너뜀), 세션이 없어지면 `sbReauth()`가 새 익명 uid를 만듦(index.html 4101-4113)
- [from-code] 대전: `NET_VER='v5-'`, 로비 `fw-lobby`(1v1)·`m-lobby-2v2`, 코드방 1000-4999=1v1 / 5000-9999=2v2(`vsCodeSz`), `vsAssemble`(호스트가 n≤4명을 모으는 범용 로직), `vsSeat`/`vsTeams`(팀 0/1), `vsMatchId`(팀당 1~2명, 2명을 넘으면 null), `vsOutcome`(팀 합산), `vsRankStart/Report`(versus_start/report)
- [from-code] 서버: `fw_vs_match.mode in ('1v1','2v2')`, `fw_vs_part.team in (0,1)`, `result in ('win','lose','draw')`, `fw_vs_roster`가 `<seed>.<t0>.<t1>`만 파싱, `fw_vs_settle`는 두 팀 outcome(0/1/2) 기반, `fw_vs_cfg`는 `select 50, 50, … 30, 1000000, …`(vs-rules.test.js가 이 모양을 정규식으로 고정)
- [from-code] Realtime RLS 정규식: `^fw-v[0-9]+-(fw-lobby|c-[0-9]{4}|m-[a-z0-9]{1,14}-[a-z0-9]{1,14})$`. `m-lobby-ffa`는 이미 통과(m-x-y 모양). 그 외 새 토픽은 정책 변경이 필요
- [from-code] `sw.js`는 퇴역 상태(스스로 unregister). index.html은 SW를 등록하지 않음. manifest.webmanifest는 있음
- [from-code] 지갑 `W`는 로컬(`fw27_wallet2`). 헤더 주석: "economy (local; moves server-side at paid launch)". 시즌 보상도 "the wallet and owned units are held on the device"로 같은 신뢰 모델
- [from-code] 테스트 선례: fx-core 순수 블록 + `tests/helpers/fx.js`(new Function 추출), parse-guard(인라인 스크립트 vm 컴파일 + 블록 내 전역 재선언 금지), vs-rules 드리프트(클라 상수 ↔ SQL 정규식)
- [from-code] 참고(이번 범위 밖, 수정 안 함): i18n `vsCap` 문구가 여전히 "같은 상대와는 하루 5판까지"인데 서버 pair_cap은 1,000,000으로 사실상 꺼져 있음. 별도 요청으로 처리 권장

## 결정표

### D1. 알림(푸시) 티어 — 추천: T0 + T1 (MVP), T2 보류
| 티어 | 방식 | 아티팩트 | PWA/웹 | 앱이 닫혔을 때 | 필요한 것 | 한계 |
|---|---|---|---|---|---|---|
| **T0** 인앱 토스트 | 서버 feed + Realtime 신호(실패 시 폴링)로 받아 `toast()` | ✅ (Supabase 연결이 될 때) | ✅ | ❌ | 새 테이블·RPC·토픽 정책 | 앱이 화면에 있어야 보임 |
| **T1** Notification API | 같은 경로로 받고, `document.hidden`이면 `new Notification()` | ❌ 사실상 불가 [from-claude: claude.ai는 교차 출처 sandbox iframe이라 권한 요청이 막힐 가능성이 큼 — P0 스파이크로 확인] | ✅ (탭/PWA가 백그라운드에 살아 있을 때) | ❌ | 권한 요청 UX | 백그라운드 탭의 타이머가 1분 단위로 느려짐. iOS Safari 탭은 미지원 |
| **T2** Web Push | SW `push` 이벤트 + PushSubscription + VAPID 서명 발송 | ❌ 원리적 불가 (claude.ai 출처에 우리 SW를 등록할 수 없음) | △ (iOS는 홈 화면에 설치한 PWA 16.4+만) | ✅ | SW 재도입(sw.js 퇴역 정책 뒤집기, v2.html 루프 위험), `fw_push_subs` 테이블, **발송 백엔드**(RFC 8291 암호화 + VAPID JWT — SQL만으로는 비현실적이라 Edge Function 필요), 키 관리 | 새 인프라 2종 도입, 실패 시 디버깅 비용이 큼 |

추천 근거: 아티팩트에서는 T2가 아예 안 되고, PWA 한쪽만을 위해 SW와 Edge Function을 들이는 것은 이번 MVP 범위를 넘습니다. 요구 문구는 "푸시"지만, MVP에서는 "앱이 열려 있을 때의 알림"으로 정의하고 UI 문구에도 그 한계를 표시합니다(Q1).

전달 경로(T0/T1 공통):
- 정본(source of truth)은 서버 feed 행(`private.fw_social_feed`)입니다. 클라이언트는 `social_feed(p_since)` RPC로 읽습니다.
- 즉시성을 위해 서버 트리거가 `realtime.send()`로 수신자 private 토픽 `fw-in-<uid32hex>`에 "새 소식 있음" 신호만 보냅니다. 신호를 받으면 클라이언트가 feed를 읽습니다.
- 스파이크(P0)에서 `realtime.send` 경로가 막히면, 폴링(보일 때 30초, 숨겨져 있을 때 60초)만으로 운영합니다. 정본이 feed이므로 어느 쪽이든 결과는 같습니다.

### D2. 친구 식별 — 추천: 서버 발급 친구 코드 + 랭킹/대전 결과에서 바로 요청
| 옵션 | 장점 | 단점 |
|---|---|---|
| 닉네임 검색 | 직관적 | 닉네임이 유일하지 않음('Pilot' 기본값, fw_vs_nick 대체), 열거·괴롭힘 표면, 동명이인 혼동 |
| 4자리 코드(방 코드 선례) | 짧음 | 공간이 9천 개뿐이라 추측 가능. 방 코드는 일회용이라 괜찮지만 친구 코드는 영구 |
| **8자리 친구 코드 (Crockford base32, 서버 발급)** | 32^8≈1.1조라 추측 불가, 구두로 전달 가능(혼동 문자 I/L/O/U 제외), 닉네임이 바뀌어도 그대로 | 코드를 주고받아야 함 |
| 랭킹 행·대전 상대에서 요청 | 마찰이 0, uid를 이미 알고 있음 | 만난 적 있는 사람만 가능 |

추천: 코드를 기본으로, 랭킹·대전 결과는 보조로. 둘 다 "요청→수락" 상호 모델(Q2). 코드 표시는 `XXXX-XXXX`, 입력은 대소문자·하이픈·공백 무시 후 정규화.

### D3. FFA 정산 — 추천: 서버 랭크, 순위 RP [+50,+20,−20,−50], 보고 2명 이상 일치
| 옵션 | 서버 변경 | 공정성/경제 | 위변조 내성 | 비고 |
|---|---|---|---|---|
| A. 연습전(무랭크) | 0 | RP 무관 | 해당 없음 | 가장 빠름. 랭크 게임에서 동기가 약함 |
| B. 1위만 win(+50), 나머지 lose(−50) | 중 | 매판 −100 RP 디플레, 3/4가 손해 → 큐 기피 | 1위 일치 여부만 확인 | 단순하지만 사용자 경험이 나쁨 |
| **C. 순위 RP [+50,+20,−20,−50]** | 중~대 | 합 0(floor 0 제외), 2위도 보상 | 전체 순위 벡터 일치 요구 → 하나라도 다르면 void | 추천 |

C의 세부:
- 매치 id `<seed36>.<u1>+<u2>+<u3>+<u4>`(uid 정렬). 최대 156자로 기존 길이 제약 75..160 이내
- `p_team` = 정렬 순서상 내 좌석 0..3
- 보고값은 `p_result` = `'1,3,2,4'`(정렬된 uid 순서의 순위). 기존 'win'/'lose'/'draw'와 함께 mode별로 검증
- 정산 규칙: 보고가 서로 다르면 void. 등록자 전원 보고 + 일치면 settled. 기한이 지났을 때 일치 보고가 2명 이상이면 settled, 1명 이하면 void
  - 1v1의 "혼자 주장해도 성립"보다 엄격하게 잡은 이유: 4인전에서 혼자 남의 순위까지 정하게 두면 안 되기 때문
- wins/losses/draws는 기존처럼 delta 부호로 집계(+면 win, −면 loss, 0이면 draw). 따라서 2위는 win, 3위는 loss로 세어짐. UI 전적 표기에 주석 추가
- 동점은 Q6 규칙(같은 순위 구간 RP 평균)
- 인간 4명만 랭크. 3명 + AI 1석은 연습전(기존 "AI 끼면 연습" 규칙과 동일)

**NET_VER 범프: 필요 (`v5-` → `v6-`)** [from-code]
- 코드방 번호 구간을 다시 나눕니다: 1000-3999 1v1 / 4000-6999 2v2 / 7000-9999 FFA. 이건 v5 클라이언트와 해석이 충돌합니다
- 방 상태에 FFA 필드가 생깁니다
- 범프하면 구 빌드(캐시된 아티팩트 포함)와 신 빌드가 아예 만나지 않습니다. 기존 설계 의도와 같습니다
- Realtime 정책 정규식은 `v[0-9]+`라 변경이 필요 없습니다. 로비 `m-lobby-ffa`도 기존 패턴 안에 들어갑니다

### D4. 길드 코인 차감 — 추천: 클라이언트 차감 + 신뢰 (기존 상점 모델)
| 옵션 | 비용 | 무엇을 막는가 |
|---|---|---|
| **A. 클라이언트 차감 + 신뢰** | 소 | localStorage를 편집하는 사람은 못 막음. 정상 사용자 경험은 정확 |
| B. 서버 지갑 도입 | 대형 (모든 코인 출처·상점·보상·연속출석을 서버로) | 위변조 차단. 현재 경제 전체가 로컬이라 길드만 서버화해도 효과 없음 |
| C. 대리 검증(서버가 아는 실적으로 생성 자격 확인) | 소 | 비용 자체는 못 막지만 생성 남발은 억제 |

추천: A + C 일부.
- 서버 가드레일: uid당 소유 길드 1개(그리고 소속 1개), 생성 쿨다운 24시간, 생성 자격으로 `fw_scores` 행 존재(최고기록 > 0)
- 클라이언트 순서:
  1. 잔액 확인
  2. 멱등 토큰(`fw27_gpay = {tok, name}`)을 저장
  3. `guild_create(p_name, p_tok, …)` 호출
  4. 성공 응답(또는 같은 토큰 재호출에 "이미 내 길드" 응답)을 받았을 때만 `W.coins -= 300000; saveW()`, 그리고 토큰 삭제
- 효과: 실패 시 코인이 날아가지 않고, 응답이 유실된 경우에도 재시도로 한 번만 차감됩니다
- 근거: 유닛 구매와 시즌 보상이 이미 같은 신뢰 모델이며, schema.sql 주석에도 "Server-held inventory is what closes that"로 명시되어 있습니다(서버 인벤토리는 별도 과제)

## Requirements
- R1~R5 (frontmatter). Q1~Q11의 추천안을 전제로 작성. 사용자 답이 다르면 해당 Phase를 수정

## Architecture Changes
- `supabase/schema.sql` 끝에 `-- SOCIAL` 섹션을 추가하고 FFA 관련 versus 정의를 확장합니다
  - FFA 확장 방식: `drop constraint if exists / add` 패턴(standing tier 선례), `fw_vs_cfg` OUT 컬럼 추가는 `drop function` 선례를 따름
- `index.html`
  - `/* social-core:start */ … /* social-core:end */` 순수 블록 1개
  - 친구/알림/길드 UI 오버레이 3개(`#frScr`, `#gdScr`, 대전 패널의 FFA 탭)
  - 메뉴 `#pushBtn`, i18n 키(ko/en/ja/zh)
- `tests/`: `helpers/social.js`, `social-core.test.js`, `social-drift.test.js`, `vs-rules.test.js` 확장, `parse-guard.test.js` 확장
- `supabase/checks/social.sql`, `supabase/checks/versus-regress.sql`(SQL editor에서 수동 실행하는 단언 스크립트. 기존에 SQL 테스트 하네스가 없어 수동 단계로 둠)

## Implementation Steps

### Phase 0: 스파이크 — 플랫폼 제약 확인 (코드 커밋 없음, 결과는 이 문서에 기록)

**스파이크 결과 (2026-10-18 실측)**
- (a) 아티팩트 V11 실기기 확인: 랭킹 화면에 "온라인 랭킹에 연결되지 않아 이 기기 기록만 보여줍니다" → **아티팩트에서 Supabase 미연결(차단)**. 소셜 전 기능은 아티팩트에서 오프라인 안내로 숨김/비활성, 대전 인간 매칭은 기존 window.claude room 경로로 동작(무랭크).
- (b) Notification: (a)로 인해 아티팩트에선 수신 자체가 없음 → env 가드(`isArt`)로 requestPermission 생략, 결론 확정에 추가 실측 불요.
- (c) realtime.send: 스테이징 프로젝트 부재로 미실측 → **폴링을 정본 경로로 구현**(보일 때 30s/숨김 60s), realtime 신호는 운영 적용 시 동작하면 지연만 단축되는 enhancement. D1 폴링-우선으로 확정.
1. **아티팩트·Realtime 실측**
   - Action:
     - (a) 아티팩트 V11에서 `initSupabase`가 성공하는지 확인. CSP 때문에 window.claude backend로 떨어지면 소셜 전체가 아티팩트에서 "오프라인 표시"가 됨
     - (b) 아티팩트 iframe에서 `Notification.permission`과 `requestPermission()` 결과
     - (c) 스테이징 프로젝트에서 SQL `realtime.send(payload, event, topic, true)`가 트리거 안에서 private 토픽으로 전달되는지, 수신 정책 `topic = 'fw-in-' || replace(auth.uid()::text,'-','')`가 동작하는지 (context7로 Supabase Realtime 문서 확인 후 실험)
   - Acceptance Criteria: 세 질문에 대한 예/아니오와 증거(스크린샷 또는 콘솔 로그)가 이 문서 "스파이크 결과"에 기록됨. (c)가 아니오면 D1을 폴링 전용으로 확정
   - Dependencies: 없음 / Risk: Medium(이 결과에 따라 P2 설계가 갈림)

### Phase 1: 친구 (서버 + 클라이언트)
2. **스키마·RPC** (File: supabase/schema.sql)
   - 테이블 DDL(시그니처 수준):
     ```sql
     create table private.fw_social (player_id uuid primary key references auth.users on delete cascade,
       code text not null unique check (code ~ '^[0-9A-HJKMNP-TV-Z]{8}$'), last_seen timestamptz, hello_at timestamptz);
     create table public.fw_friends (a uuid, b uuid, since timestamptz default now(),
       primary key (a,b), check (a < b));                         -- RLS select: auth.uid() in (a,b)
     create table private.fw_friend_req (from_id uuid, to_id uuid, at timestamptz default now(),
       primary key (from_id,to_id), check (from_id <> to_id));
     ```
   - RPC(public 래퍼 → private definer):
     - `social_me() → {code, friends:int, pending_in:int}`: 첫 호출 시 코드 발급
     - `friend_request(p_code text default null, p_uid uuid default null)`: 둘 중 하나. 역방향 요청이 이미 있으면 즉시 친구 성립
     - `friend_respond(p_from uuid, p_accept bool)`
     - `friend_remove(p_uid uuid)`
     - `friends_list() → setof {player_id, nick, cc, bird, best, rp, online bool, last_seen_bucket}`: nick/best는 fw_scores, rp는 fw_versus에서 join. online = last_seen > now()−2분
   - 브레이크: 친구 상한 100, 대기 중 보낸 요청 30, 요청 20회/시간(per-uid advisory lock + count, versus_start 선례). 오류 코드 `fw_friend_self|fw_friend_dupe|fw_friend_cap|fw_rate_limited|fw_bad_input`
   - Acceptance Criteria: `supabase/checks/social.sql` 단언 PASS(자기 자신·중복·상한·남의 행 쓰기 불가·RLS로 제3자 친구 목록 0행)
   - Dependencies: P0 / Risk: Low
3. **클라이언트** (File: index.html)
   - social-core: `fcNorm(s)`, `fcOk(s)`, `fcFmt(s)`, `friendErrKey(msg)`
   - `#frScr` 오버레이: 내 코드 + 복사 버튼, 코드 입력, 받은 요청(수락/거절), 친구 목록(온라인 점, 최고기록, 티어 배지 `vtBadgeImg`, 삭제)
   - 랭킹 행과 대전 결과 화면에 "친구 요청" 버튼(uid가 VS_UID 형식일 때만)
   - 진입점: 메뉴 버튼 `#frBtn`
   - `online()` 실패 시 기존 `t('offline')` 패턴 사용
   - Acceptance Criteria: `node --test tests/social-core.test.js` 그린, Playwright 2-context 친구 성립 스모크 PASS, 신규 i18n 키 4언어 존재
   - Dependencies: 2 / Risk: Low
   - 커밋: `feat: friends — codes, requests, list (schema + client)`

### Phase 2: 알림 + 토글
4. **서버 feed·신호** (File: supabase/schema.sql)
   - DDL: `private.fw_social_feed (id bigserial, to_id uuid, from_id uuid, kind text check (kind in ('on','best')), val integer, at timestamptz)`, 보존 3일, 인덱스 `(to_id, id)`
   - `social_hello()`: last_seen 갱신. hello_at이 15분 이내면 feed를 만들지 않음. 아니면 친구 각각에 'on' 행 + `realtime.send` 신호
   - 트리거 `fw_scores_best_notify`: `after update of best` and `new.best > old.best`(+ insert best>0). 같은 친구 쌍의 'best'는 10분 이내면 행 갱신(최신 값)
   - `social_feed(p_since bigint) → setof {id, from_id, nick, kind, val, at}`: 본인 행만, 최대 50
   - Realtime 정책: 기존 정책은 건드리지 않고, `fw-in-<uid32>` select 정책만 추가. 클라이언트 insert 정책은 없음(신호는 서버만 보냄)
   - Acceptance Criteria: SQL check — 친구가 아닌 사람에게는 행 0, 15분 묶음, 본인 feed만 조회 가능. 정책 정규식 드리프트 테스트(클라 토픽 빌더 ↔ SQL) 그린
   - Dependencies: 2, P0 결과 / Risk: Medium
5. **클라이언트 수신·토글** (File: index.html)
   - social-core: `notifyRoute({on, kinds, perm, hidden, env}) → 'none'|'toast'|'os'`, `notifText(kind, nick, val, lang)`, `feedMerge(prev, rows)`(중복 id 제거, since 커서)
   - 수신: `initSupabase` 성공 후 `social_hello()`. `fw-in-…` 구독(`netJoin`은 NET_VER 접두를 붙이므로 쓰지 않고 별도 소형 구독 함수). 신호를 받거나 폴링 시점이 되면 `social_feed`
     - 폴링은 lbPoll에 끼우지 않고 별도 타이머: 보일 때 30초 / 숨겨졌을 때 60초
     - 페이지가 다시 보이면 `social_hello()`
   - 토글: `#pushBtn`(벨 SVG, `.off` 클래스, `fw27_push`, 기본 off), 종류 체크 `fw27_pushk={on:1,best:1}`
     - on으로 바꿀 때만 `requestPermission`(Notification이 있고 아티팩트가 아닐 때)
     - denied면 '인앱 알림만' 안내
   - Acceptance Criteria: notifyRoute 진리표 테스트 그린. Playwright로 AC2/AC3 확인. off 상태에서 친구 이벤트를 주입했을 때 toast 0
   - Dependencies: 3, 4 / Risk: Medium
   - 커밋: `feat: friend alerts — feed, in-app + Notification, toggle`

### Phase 3: 4인 FFA
6. **클라이언트 FFA** (File: index.html)
   - `NET_VER='v6-'`(주석에 v6 사유 추가)
   - `vs.md`/`vs.sz` 의미를 정리: 사이즈 1/2는 그대로 두고 FFA는 `vs.md = 4`, `vs.ffa = vs.sz === 4` 헬퍼
   - `vsSetMode`에 `#vsM4` 탭과 `#vsNoteFfa` 추가
   - `vsCodeSz` 재구간(1000-3999 / 4000-6999 / 7000-9999)
   - `vsAuto`: sz 4면 `m-lobby-ffa` + `vsTryQuad` 재사용(로비 이름만 인자화)
   - `vsSeat`: ffa면 `tm`을 전부 1로(모두 상대), `dx` 배치는 3명 전방 배치 재사용
   - social-core에 순수 함수:
     - `ffaPlaces(players[{sc}]) → places[]`(동점 공유)
     - `ffaRp(places) → deltas[]`(Q6 평균 규칙)
     - `ffaMatchId(seed, uids[4]) → {id, team, mode:'ffa'}|null`
     - `ffaPlaceFinal(me, others)`: 살아 있는 사람이 전부 내 점수보다 높고 죽은 사람은 확정 → 내 순위 확정
   - `vsResolve`: ffa 분기 → 내 순위 확정 시 결과 배너(“#2”), 서버 보고는 **전원 사망·이탈 후** 순위 벡터로
   - `vsFillOver`: `#oTeams`를 1~4위 리스트로 재사용
   - `drawVsHud`: FFA는 "내 순위/4" 표시
   - `vsRankStart/Report`: ffa면 `ffaMatchId`, `p_result='1,3,2,4'`
   - `vsRpNote`: FFA 예상 delta
   - 기존 `vsMatchId`·`vsOutcome`·`vsTeams`는 변경 금지(selfTest가 고정)
   - Acceptance Criteria: `node --test tests/social-core.test.js`(ffa*) 그린, `FW.selfTest()`에 `vsFfa` 추가 + 기존 `vsRank`·`vs2` 무수정 true, Playwright `#localtest` 4-page FFA 스모크(시작·결과 순위 일치)
   - Dependencies: 없음(P1과 병렬 가능) / Risk: High
7. **서버 FFA 정산** (File: supabase/schema.sql)
   - `fw_vs_cfg`에 `out ffa_rp integer[]` 추가(`drop function` 후 재생성. **vs-rules.test.js 정규식이 select 행 모양을 고정하므로 컬럼은 맨 끝에 붙이고 테스트를 함께 갱신**)
   - 제약 교체: `mode in ('1v1','2v2','ffa')`, `team between 0 and 3`, `result`·`final` 체크 확장(`^[1-4](,[1-4]){3}$` 허용)
   - `fw_vs_roster_ffa(p_match) → uuid[]`(정렬·중복·형식 검증)
   - `fw_versus_start`: mode 분기(ffa면 roster_ffa, p_team = 좌석, rival 루프는 나머지 3명)
   - `fw_versus_report`: mode별 p_result 검증
   - `fw_vs_settle`: `if v_m.mode = 'ffa' then perform private.fw_vs_settle_ffa(p_match); return; end if;`로 분리(기존 분기 무변경)
     - settle_ffa는 순위 벡터 일치, 2명 이상 보고 규칙, `ffa_rp` 적용, floor 0, delta 기록
     - lock 순서 0→b→c→d→e를 그대로 따름(sweep 재사용)
   - Acceptance Criteria: `supabase/checks/versus-regress.sql`(1v1/2v2 기존 시나리오: 합의·타임아웃·충돌 void 결과가 이전과 동일) + `checks/ffa.sql`(일치 → 정산, 불일치 → void, 단독 보고 → void, 동점 평균) PASS. vs-rules 드리프트: 클라 `FFA_RP` ↔ SQL `ffa_rp` 일치
   - Dependencies: 6과 같은 PR. **스키마를 먼저 적용하고 그다음 클라이언트 배포** / Risk: High
   - 커밋: `feat: versus 4-player FFA (NET_VER v6, placement RP)`. 3a(연습전만)와 3b(서버 정산)로 나눠 커밋 가능

### Phase 4: 길드
8. **스키마·RPC** (File: supabase/schema.sql)
   - DDL:
     ```sql
     create table public.fw_guilds (id bigint generated always as identity primary key, name text not null,
       owner uuid not null references auth.users on delete cascade, min_best integer not null default 0,
       min_rp integer not null default 0, auto_join boolean not null default false,
       members smallint not null default 1, created_at timestamptz default now(),
       check (char_length(name) between 2 and 14), check (members between 0 and 30));
     create unique index on public.fw_guilds (lower(name));
     create table public.fw_guild_members (player_id uuid primary key references auth.users on delete cascade,
       guild_id bigint not null references public.fw_guilds on delete cascade,
       role text not null check (role in ('owner','member')), joined_at timestamptz default now());
     create table private.fw_guild_apps (guild_id bigint, player_id uuid, at timestamptz, primary key (guild_id, player_id));
     create table private.fw_guild_pay (player_id uuid, tok text, guild_id bigint, at timestamptz, primary key (player_id, tok));
     ```
   - RLS: guilds·members는 authenticated에 select 허용(컬럼 grant로 타임스탬프 비공개, 기존 패턴). 쓰기 정책 없음
   - RPC:
     - `guild_create(p_name, p_tok, p_min_best, p_min_rp, p_auto)`: 이름 sanitizer는 fw_vs_nick 규칙 재사용, `fw_nick_bad`, 소속 없음, 24시간 쿨다운, fw_scores best>0, 토큰 멱등
     - `guild_update(p_min_best, p_min_rp, p_auto)`
     - `guild_apply(p_id)`: 서버가 `fw_scores.best >= min_best and coalesce(fw_versus.rp,0) >= min_rp` 확인. 불만족이면 `fw_guild_req_unmet`, 정원 초과면 `fw_guild_full`. auto면 즉시 가입
     - `guild_decide(p_uid, p_accept)`, `guild_kick(p_uid)`, `guild_leave()`(owner면 거부), `guild_transfer(p_uid)`, `guild_disband()`
     - `guild_search(p_q, p_limit)`: ilike 접두 검색, members desc
     - `guild_me() → {guild, role, apps:[…]}`
   - Acceptance Criteria: `supabase/checks/guild.sql` PASS(AC6·AC7 거부 경로 전부, 동시 신청에도 members 카운트 정합: 길드 행 for update)
   - Dependencies: 없음 / Risk: Medium
9. **클라이언트** (File: index.html)
   - social-core: `GUILD_COST = 300000`, `guildCostOk(W)`, `guildReqOk(req, me)`(UI 사전 표시용. 최종 판정은 서버), `gpayNext(state, resp)`(멱등 차감 상태기계: idle → pending(tok) → paid / failed)
   - `#gdScr`: 검색·목록(조건 표시: "최고기록 ≥ N · RP ≥ M(이번 시즌)"), 상세(멤버, 신청/탈퇴), 생성 폼(코인 부족 시 비활성 + 부족분 `shortOf` 패턴), 길드장 관리(신청 승인/거절, 추방, 조건 수정, 위임, 해산)
   - 차감은 D4 순서. 앱 시작 시 `fw27_gpay`가 남아 있으면 `guild_me`로 확인하고 정산
   - Acceptance Criteria: gpayNext 테스트(응답 유실 → 재시도 → 1회 차감, 실패 → 0회) 그린, Playwright 생성→신청→승인 스모크
   - Dependencies: 8 / Risk: Medium
   - 커밋: `feat: guilds — create (300k coins, local wallet), conditions, join/approve/kick`

### Phase 5: 통합 검증·문서
10. **회귀·스모크·운영 문서**
    - `parse-guard`에 social-core 재선언 금지 목록 추가(`vs`, `W`, `sb`, `uid`, `nick`, `rp`, `toast`, `t`)
    - `FW.selfTest` 전체 실행, Playwright 스모크 묶음
    - README에 대시보드 적용 순서(schema 재적용, Realtime 정책 확인, 스테이징 → 운영) 기록
    - Acceptance Criteria: 아래 Sprint Contract 전부 체크
    - Dependencies: 1~9 / Risk: Low
    - 커밋: `test: social smoke + selfTest vsFfa; docs: dashboard steps`

## Sprint Contract (Generator-Evaluator 사전 합의)

### 완료 기준 (테스트 가능)
1. [ ] `node --test` → 0 failures, 총 개수 ≥ 132 + 신규
2. [ ] `node --test tests/social-core.test.js` → fcNorm/fcOk, notifyRoute 진리표, ffaPlaces/ffaRp/ffaMatchId, guildReqOk, gpayNext 전부 PASS
3. [ ] `node --test tests/vs-rules.test.js tests/social-drift.test.js` → RP 50/50 유지, FFA_RP ↔ ffa_rp 일치, inbox 토픽 ↔ 정책 정규식 일치, GUILD_COST가 i18n 문구 숫자와 일치
4. [ ] localhost `#dev`에서 `FW.selfTest()` → 모든 키 true(vsRank, vs2 무수정 + vsFfa 신규)
5. [ ] SQL editor: `supabase/checks/{social,guild,ffa,versus-regress}.sql` → 각 스크립트 마지막 `select 'PASS'` 출력, 예외 0
6. [ ] Playwright(2 context, Supabase 스테이징): 친구 코드 요청 → 수락 → B가 best 갱신 → A 화면 toast 30초 이내
7. [ ] Playwright: `#pushBtn` off → 친구 이벤트 주입 → toast 0, Notification 스텁 호출 0
8. [ ] Playwright `#localtest` 4 pages: FFA 코드방 7xxx 생성 → 3명 입장 → 시작 → 4개 화면의 결과 순위 동일
9. [ ] Playwright: 코인 300,000 주입 → 길드 생성 → `W.coins`가 정확히 300,000 감소(재시도 시뮬 포함 1회) → 2번째 계정이 조건 미달이면 거부, 충족이면 신청 → 승인 → 멤버 2

### Regression Guard
1. [ ] 기존 테스트 전체 통과 (`node --test` → 0 failures)
2. [ ] 인라인 스크립트 컴파일(parse-guard) PASS. 빌드 단계는 없음(단일 HTML)
3. [ ] 1v1/2v2 빠른매칭·코드방(새 구간) 수동 1회씩, daily/versus fair mode selfTest(mech, ult, hazard) true

### 품질 기준
- code-reviewer 판정: APPROVE (CRITICAL/HIGH 0), schema 변경은 database-reviewer + security-reviewer(RLS, definer 함수) 통과
- verify-agent 판정: PASS

## Testing Strategy
- Unit(순수 블록): `tests/helpers/social.js`가 `/* social-core:start…end */`를 `new Function`으로 추출(fx.js 선례). DOM·시계·전역 없음
- 드리프트: 클라 상수와 SQL 정규식 매칭(vs-rules 선례) — FFA_RP, 토픽 모양, 코드 알파벳, 이름 길이 2..14, 정원 30
- 통합(SQL): 테스트 하네스가 없으므로 `supabase/checks/*.sql`에 `do $$ … assert … $$` 단언 스크립트를 두고 스테이징에서 수동 실행. pgTAP 도입은 Non-goal
- 인게임: `FW.selfTest`에 `vsFfa` 추가(시드 고정, 좌석·순위·매치 id·AI 연습 판정)
- E2E: Playwright 스모크 4개(친구+알림, 토글, FFA localtest, 길드)

## Risks & Mitigations
- **HIGH — 아티팩트에서 Supabase 미연결/Notification 차단**: 소셜이 PWA에서만 동작할 수 있음
  - Mitigation: P0에서 실측. 연결이 안 되면 아티팩트 UI에 "웹 버전에서 이용" 안내, 기능은 숨김(오프라인 표시 패턴)
- **HIGH — FFA 서버 정산이 기존 lock 순서·settle 로직을 건드림**: 1v1/2v2 랭크 회귀 위험
  - Mitigation: `fw_vs_settle` 첫 줄 분기로 ffa를 별도 함수에 격리, 기존 분기 무수정, versus-regress.sql, 스테이징 선적용. 3a(연습전)를 먼저 내보내는 옵션
- **HIGH — 익명 uid 소실 → 친구·길드 소실(길드장이면 길드 고아화)**
  - Mitigation: UI 경고, 길드장 위임 RPC 제공, 30일 미접속 길드장 자동 위임은 후속. 근본 해결은 계정 로그인(PR #30)
- **MED — 길드 코인 위변조(로컬 지갑)**
  - Mitigation: D4 가드레일(1인 1길드, 24시간 쿨다운, 실적 자격). 서버 지갑은 유료 출시 과제로 명시
- **MED — 알림 남발/스팸, Realtime 메시지 쿼터**
  - Mitigation: 접속 알림 15분, best 알림 10분 묶음, 친구 100명 상한, 신호는 수신자 토픽 1메시지, 클라이언트 쓰기 정책 없음
- **MED — `realtime.send` 미지원·권한 문제**
  - Mitigation: feed를 정본으로 두고 폴링으로 대체(D1). 동작 결과는 같고 지연만 늘어남
- **MED — NET_VER v6 범프로 구 빌드와 매칭 분리**
  - Mitigation: 의도된 동작. 배포 직후 잠시 큐가 얇아질 수 있으므로 1v1/2v2/FFA를 같은 날 배포
- **LOW — index.html 비대화(약 5100 → 약 6300줄)**: 파일 크기 원칙(800줄)은 단일 파일 제약으로 이미 예외
  - Mitigation: 로직은 social-core 블록에 모으고 UI 코드는 기능별 섹션 주석으로 구획
- **LOW — FFA 이탈자 점수 관측 차이로 void**: 2v2에도 있는 기존 한계
  - Mitigation: 이탈자는 마지막으로 본 점수로 확정(2v2와 동일), void는 RP 무변동

## 복잡도 추정
| Phase | 규모 | index.html | schema.sql | 테스트 | 상대 난이도 |
|---|---|---|---|---|---|
| P0 스파이크 | S | 0 | 0(스테이징 실험) | — | 낮음, 결정 영향 큼 |
| P1 친구 | M | +250 | +180 | +1 파일 | 중하 |
| P2 알림·토글 | M | +200 | +120 | 진리표·드리프트 | 중 |
| P3 FFA | L | +300 | +200 | selfTest·드리프트·4-page | **상** |
| P4 길드 | M~L | +350 | +250 | 상태기계·SQL | 중상 |
| P5 통합 | S | +20 | 0 | 스모크 | 하 |
의존성: P0 → (P1 → P2), P3·P4는 병렬. 권장 순서는 P0 → P1 → P3 → P2 → P4 → P5. 신호 경로가 확정되기 전에 FFA부터 진행해 위험한 작업을 앞에 둡니다. 세션 50% 규칙에 따라 Phase마다 새 세션에서 진행합니다.

## Success Criteria
- [ ] AC1~AC8 전부 검증 증거와 함께 체크
- [ ] open_questions Q1~Q11에 사용자 답이 기록되고 status: APPROVED
- [ ] 기존 132 테스트 + 신규 테스트 그린, selfTest 전부 true
