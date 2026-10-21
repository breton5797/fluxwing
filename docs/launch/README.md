# SWISHBY 출시 준비 현황

기준: 2026-10-21 (수) 오후. 근거 문서: 「스위스비 글로벌 마케팅 플랜」(2026-10-19)의 출시 전 체크리스트와 필수 바이럴 3종.

플랜 원칙: 아래 체크리스트가 모두 끝나야 1주차 광고를 켠다.

## 출시 전 체크리스트

| # | 항목 | 상태 | 어디에 | 남은 일 (담당) |
| --- | --- | --- | --- | --- |
| 1 | 영문 이름·상표 | 1차 조사 완료 | 아래 "상표 메모" | 변리사 유사성 의견, KIPRIS·USPTO·WIPO 직접 검색 (대표) |
| 2 | 스토어 제목·설명·스크린샷 현지화 | **완료**: Play 등록정보 14개 언어 게시 (10-21) | `store-listing.json` (글자수 제한은 `tests/store-listing.test.js`가 검사), 스크린샷 `scripts/store-shots.mjs` | es-ES·pt-PT 전용 캡션 스크린샷 (지금은 es-419·pt-BR 재사용), th·hi·vi 원어민 검수 |
| 3 | 게임 언어 자동 전환 = 스토어 언어 | **완료** | `detectLang()`: 브라우저 언어 → 12개 언어, 없으면 영어 | — |
| 4 | 일일 챌린지 결과 공유 이미지 버튼 | **완료** (#57, 라이브) | `shareCardSpec` | — |
| 5 | 설치·튜토리얼·D1/D7·결제·광고 이벤트 트래킹 | **완료** (#57, 운영 DB 적용, 400일 정리 cron `fw_events_gc` 10-21 등록) | `public.track` (자체 DB, 제3자 트래커 없음) + `supabase/checks/kpi.sql` | — |
| 6 | 9:16 숏폼 자동 생성, 첫 20개 | 결과물 완료 (#56) | `scripts/shorts.mjs`, 결과물 `~/Downloads/swishby-marketing/` | 업로드 (대표, 8번 계정 개설 후) |
| 7 | TikTok·Meta·구글 광고 계정 + 결제 수단 | 미착수 | — | 계정 개설·카드 등록은 대표만 가능 |
| 8 | 틱톡·유튜브·인스타 공식 계정, 프로필에 스토어 링크 | 미착수 | — | 계정 개설은 대표만 가능. 스토어 전에는 https://swishby.com 링크 |

## 프로덕션 출시 일정 (2026-10-21 결정: 11-17 화 출시)

기한은 2027-01-19 (사전등록 게시 + 90일). 11-17 출시면 기한까지 63일 여유가 있어, 심사가 밀려도 다시 제출할 시간이 있다.

| 날짜 | 할 일 | 담당 |
| --- | --- | --- |
| ~10-23 (금) | IARC 재심사 승인 확인, PR #65 머지, 새 스크린샷(`~/Downloads/swishby-marketing/store-v2`, `store-eu`) 업로드 후 심사 제출 | Claude (업로드·제출은 대표 승인) |
| 10-27 (화) ~ 11-08 (일) | 비공개 테스트 Alpha: 지인 10~20명 초대, Android vitals(비정상 종료·ANR)와 피드백 확인 | 대표 (테스터 초대), Claude (집계·수정) |
| 11-01 (일) 00:00 KST | 첫 시즌 정산 자동 실행 → 결과 확인 | Claude |
| 11-09 (월) | 수정이 있으면 1.0.1 (versionCode 2) AAB 빌드·업로드 | Claude |
| 11-10 (화) | 프로덕션 트랙 제출 (심사 여유 7일). 광고 계정(TikTok·Meta·Google)과 SNS 계정 준비 마감 | 대표 (제출 승인, 계정·카드) |
| 11-17 (화) | 출시: 단계적 배포 20% → 이상 없으면 100%. 사전등록자 알림·자동 설치. 광고 1주차 시작 | 대표 + Claude |
| 예비 | 심사 반려·지연 시 수정 후 재제출. 늦어도 2027-01-05까지 제출 | — |

## 필수 바이럴 3종

| 전술 | 상태 | 메모 |
| --- | --- | --- |
| 도전장 링크 | 이미 있음 | `?c=점수&d=날짜` 딥링크, 같은 일일 코스에서 대결 (`readChallenge`, `challengeResult`) |
| 친구 초대 크레딧 | **완료** (#57, 운영 SQL 적용) | `?r=친구코드`: 친구가 3일 플레이 + 스테이지 10 도달 시 초대자에게 젬, 3·10·25명 단계 보상, 월 25명 상한, 피초대자 별도 보상 없음 |
| 구글플레이 사전등록 + 마일스톤 보상 | **사전등록 진행 중** | 10-21 게시, 178개국 활성. 마일스톤 보상은 없음: Play 결제(Billing)가 연동되지 않아 보상을 약속하면 지급할 수 없음 (정책 위반). **정식 출시 기한 2027-01-19 (화)** = 게시일 + 90일 |

## 스토어 계정

**Google Play (조직 계정, 2026-10-21 개설·게시)**

- 개발자 계정: MINIMALKOREA (계정 ID 5761637377585574051), D-U-N-S 696516627, 웹사이트 https://swishby.com 인증, 연락처 contact@swishby.com (→ minimalkorea@naver.com 전달).
- 앱: "SWISHBY: One-Tap Sky Dash", 패키지 `com.minimalkorea.swishby`, 비공개 테스트 Alpha 1.0.0 (vc 1), 카테고리 아케이드.
- 앱 콘텐츠 10개 선언 저장: 대상 13세 이상, 광고 없음, 데이터 보안은 `privacy.html` 기준, 계정 삭제 URL https://swishby.com/delete-account.html.
- 콘텐츠 등급(IARC): 10-21 재제출 (사용자 차단·신고 기능 "예", #63 반영) → **검토 중**. 등급 값은 이전과 같음.
- 사전등록: 178개국, 리워드 없음, 지원 기기는 번들 1.0.0 기준 19,299대. 정식(프로덕션) 출시는 **2027-01-19까지**.
- 결제 프로필의 조직 주소가 예전 주소(성남대로 69, 702호)로 남아 있음. 인증 후에는 수정이 막혀 있어 Google 결제 지원에 변경 요청 필요 (대표).

**Apple**: 개발자 프로그램 가입 완료 (개인, Team 6SGPPQF3VQ). App Store Connect는 이 Chrome에서 로그인되어 있지 않음. 주의: 웹페이지를 감싸기만 한 앱은 심사 4.2(최소 기능)로 반려될 수 있어, iOS는 Capacitor 등으로 Game Center·햅틱 같은 네이티브 기능을 붙이는 편이 안전하다.

**Android 패키지 (2026-10-21 빌드 완료)**: PWA를 TWA(Bubblewrap)로 감싼 서명된 AAB `~/swishby-android/swishby-1.0.0-1.aab` (패키지 `com.minimalkorea.swishby`, 1.0.0 / versionCode 1, targetSdk 36). 업로드 키와 비밀번호 파일은 같은 폴더에 있다 (맥 밖에 백업 필요). 재빌드 방법과 키 정보는 `android/README.md`. `https://swishby.com/.well-known/assetlinks.json`에 업로드 키 지문이 들어 있고, 첫 업로드 후 Play 앱 서명 키 지문을 추가해야 설치된 앱에서 주소창이 사라진다.

## 상표 메모 (2026-10-21 웹 조사, 법률 의견 아님)

- "SWISHBY" 이름의 앱·게임·상표 검색 결과 없음. 웹 검색에 나온 것은 자사 저장소의 이름 변경 PR뿐.
- 주의: ThinkFun IP Holdings가 **SWISH** 상표를 보유하며, 그중 **컴퓨터 게임 소프트웨어**를 지정상품으로 한 출원이 있다 (일련번호 85077100, 85798833). 퍼즐·카드게임 SWISH (85977614)는 소유자 표기가 출처마다 다름 (ThinkFun / FoxMind).
- 그 밖의 SWISH: 아케이드 경품 게임 (등록 4448160, 28류), 스포츠 앱 "Swish Sports", AR 농구 게임 "Swish!!" — 업종·이름이 달라 직접 충돌 가능성은 낮아 보이나 판단은 변리사에게.
- 할 일: USPTO TSDR에서 85077100·85798833의 현재 상태(살아 있는지) 확인, KIPRIS에서 "스위스비"/"SWISHBY" 9류·41류 검색, 출원 여부 결정.

## 이 문서 밖의 열린 항목 (이전 세션에서 이어짐)

- 신고·차단 (Play UGC 정책): **완료** (#63, 운영 DB 적용). 서로 다른 로그인 사용자 3명이 같은 닉네임을 신고하면 리더보드에서 자동 숨김. 검토·해제 쿼리는 `supabase/schema.sql` REPORTS 주석.
- 업로드 키 백업: `~/swishby-android/`의 키스토어와 비밀번호 파일을 맥 밖(오프라인 저장소)에 백업 (대표). 잃어버리면 Play에 키 재설정 요청이 필요.
- 프로덕션 출시: 11-17 (화)로 결정, 위 "프로덕션 출시 일정" 참고.
- iOS: App Store Connect 미로그인. 웹 래퍼만으로는 심사 4.2 위험이 있어 Capacitor + Game Center·햅틱 권장.
- CAPTCHA: Cloudflare Turnstile 사이트 키가 아직 비어 있음 (클라이언트는 머지됨, 키를 넣는 한 줄 PR + Supabase Attack Protection 설정).
- 게임물 등급분류(GRAC): 사업자 게임에 광고를 붙이려면 등급이 먼저 필요. 스토어 출시분은 IARC 설문으로 처리되지만 swishby.com 웹 버전은 별도 확인 필요.
- 첫 시즌 보상 정산: 2026-11-01 (일) 00:00 KST.

## 출처

- [Google Play: 신규 개인 계정 테스트 요건](https://support.google.com/googleplay/android-developer/answer/14151465)
- [Google Play: 사전등록](https://support.google.com/googleplay/android-developer/answer/9859047)
- [Apple App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)
- [ThinkFun IP Holdings 상표 목록 (Justia)](https://trademarks.justia.com/owners/thinkfun-ip-holdings-inc-2169868)
- [SWISH 85977614 (Furm)](https://furm.com/trademarks/swish-85977614)
