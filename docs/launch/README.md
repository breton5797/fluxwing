# SWISHBY 출시 준비 현황

기준: 2026-10-23 (금). (10-23: CAPTCHA·Supabase Pro·SNS 핸들 결정 반영) 근거 문서: 「스위스비 글로벌 마케팅 플랜」(2026-10-19)의 출시 전 체크리스트와 필수 바이럴 3종.

플랜 원칙: 아래 체크리스트가 모두 끝나야 1주차 광고를 켠다.

## 출시 전 체크리스트

| # | 항목 | 상태 | 어디에 | 남은 일 (담당) |
| --- | --- | --- | --- | --- |
| 1 | 영문 이름·상표 | 1차 조사 완료 | 아래 "상표 메모" | 변리사 유사성 의견, KIPRIS·USPTO·WIPO 직접 검색 (대표) |
| 2 | 스토어 제목·설명·스크린샷 현지화 | **완료**: Play 14개 언어 게시 (10-21, es-ES·pt-PT 전용 스크린샷과 th·hi·vi 수정 #65 포함), App Store 14개 언어 입력 (10-22) | `store-listing.json` (글자수 제한은 `tests/store-listing.test.js`가 검사), 스크린샷 `scripts/store-shots.mjs` | — |
| 3 | 게임 언어 자동 전환 = 스토어 언어 | **완료** | `detectLang()`: 브라우저 언어 → 12개 언어, 없으면 영어 | — |
| 4 | 일일 챌린지 결과 공유 이미지 버튼 | **완료** (#57, 라이브) | `shareCardSpec` | — |
| 5 | 설치·튜토리얼·D1/D7·결제·광고 이벤트 트래킹 | **완료** (#57, 운영 DB 적용, 400일 정리 cron `fw_events_gc` 10-21 등록) | `public.track` (자체 DB, 제3자 트래커 없음) + `supabase/checks/kpi.sql` | — |
| 6 | 9:16 숏폼 자동 생성, 첫 20개 | 결과물 완료 (#56) | `scripts/shorts.mjs`, 결과물 `~/Downloads/swishby-marketing/` | 업로드 (대표, 8번 계정 개설 후) |
| 7 | TikTok·Meta·구글 광고 계정 + 결제 수단 | 미착수 | — | 계정 개설·카드 등록은 대표만 가능. 마감 11-10. Meta 광고 계정은 8번 인스타 계정과 연결 |
| 8 | 틱톡·유튜브·인스타 공식 계정, 프로필에 스토어 링크 | 핸들·프로필 키트 준비 완료 (10-23) | 핸들 **@swishbygame** (4곳 통일), 소개 문구 5개 언어 `sns-kit.json` (글자 수는 `tests/sns-kit.test.js`), 이미지 `node scripts/sns-images.mjs` → `marketing/out/sns/` | 계정 개설 (대표). TikTok에서 @swishbygame이 비어 있는지 가입 화면에서 확인. 스토어 전에는 https://swishby.com 링크 |

## 프로덕션 출시 일정 (2026-10-21 결정: 11-17 화 출시)

기한은 2027-01-19 (사전등록 게시 + 90일). 11-17 출시면 기한까지 63일 여유가 있어, 심사가 밀려도 다시 제출할 시간이 있다.

| 날짜 | 할 일 | 담당 |
| --- | --- | --- |
| ~10-23 (금) | **완료 (10-22 확인)**: IARC 재심사 승인 (스토어에 "전체이용가 · 사용자 상호작용"), #65 머지, 새 스크린샷 17건 게시 | — |
| 10-27 (화) ~ 11-08 (일) | 비공개 테스트 Alpha: 지인 10~20명 초대, Android vitals(비정상 종료·ANR)와 피드백 확인 | 대표 (테스터 초대), Claude (집계·수정) |
| 11-01 (일) 00:00 KST | 첫 시즌 정산 자동 실행 → 결과 확인 | Claude |
| 11-09 (월) | 수정이 있으면 1.0.1 (versionCode 2) AAB 빌드·업로드 | Claude |
| 11-10 (화) | 프로덕션 트랙 제출 (심사 여유 7일). 출시 노트("새로운 기능")는 `store-listing.json`의 언어별 `play.notes` (500자 이내, Play 입력란에 `<en-US>…</en-US>` 형식으로 붙여넣기). 광고 계정(TikTok·Meta·Google)과 SNS 계정 준비 마감 | 대표 (제출 승인, 계정·카드) |
| 11-17 (화) | 출시: 단계적 배포 20% → 이상 없으면 100%. 사전등록자 알림·자동 설치. 광고 1주차 시작 | 대표 + Claude |
| 예비 | 심사 반려·지연 시 수정 후 재제출. 늦어도 2027-01-05까지 제출 | — |

### iOS (같은 날 11-17 출시, 2026-10-21 결정)

앱: Capacitor 8 (`ios/`, 설명은 `ios/README.md`). 코드·서버 (#68, #69, #73): PKCE 로그인, 햅틱, Game Center, 푸시(함수 `push-send`, pg_net·Vault, Redirect URL). 10-22에 TestFlight 빌드 1.0.0 (2)로 대표 iPad에서 Apple 로그인, 점수 제출, 신고, 푸시(등록 → APNs 발송 `sent: 1`)를 확인했다. App Store Connect 앱 ID 6825629800.

| 날짜 | 할 일 | 담당 |
| --- | --- | --- |
| 10-22 | Apple 개발자 계정 개인 → 조직(MINIMALKOREA, D-U-N-S 696516627) 전환 요청 **제출**. 답은 minimalkorea@naver.com으로 | 대표 (승인 메일 확인) |
| 10-22 | **완료**: 앱 만들기, Game Center 리더보드 `swishby.best`·반복 `swishby.daily`, APNs 키(Key ID AK53HL92SY) → Supabase 함수 비밀값 | — |
| 10-22 | **완료**: TestFlight 1.0.0 (2), 대표 iPad에서 확인. 빌드 1은 푸시 토큰 대소문자 버그로 등록 실패 → #73으로 수정 | — |
| 10-22 | **완료**: 등록정보 14개 언어(문구, 6.9″ 스크린샷 84장), 빌드 2 연결, Game Center 켬, 카테고리 게임 › 액션·캐주얼, 연령 등급 4+ (한국 전체이용가), 무료 174개국(중국 제외), 개인정보 라벨 게시, 심사 연락처·메모, 출시 예약 11-17 00:00 KST, 개인정보처리방침 갱신 #72 | — |
| 11-10 (화) 10:00 | 심사 제출: 버전 1.0.0 + 리더보드 2개를 한 묶음으로. 구글 캘린더 알림 있음. 무인 자동 제출은 권한 정책상 불가라, 대표가 세션에서 "iOS 심사 제출해"라고 하면 Claude가 제출. 조직 전환 완료 여부 먼저 확인 (판매자 이름) | 대표 지시 → Claude |
| 11-17 (화) 00:00 KST | 승인되면 자동 출시 (예약) | — |

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
- 콘텐츠 등급(IARC): 10-21 재제출 (사용자 차단·신고 기능 "예", #63 반영) → **승인·게시** (10-22 확인, 스토어 표시 "전체이용가 · 사용자 상호작용").
- 사전등록: 178개국, 리워드 없음, 지원 기기는 번들 1.0.0 기준 19,299대. 정식(프로덕션) 출시는 **2027-01-19까지**.
- 결제 프로필의 조직 주소가 예전 주소(성남대로 69, 702호)로 남아 있음. 인증 후에는 수정이 막혀 있어 Google 결제 지원에 변경 요청 필요 (대표).

**Apple**: 개발자 프로그램 (Team 6SGPPQF3VQ, 지금은 개인 명의 → 조직 전환 요청 10-22). App Store Connect는 Chrome에 로그인되어 있음. 앱 "SWISHBY: One-Tap Sky Dash" (Apple ID 6825629800, SKU `swishby-ios`, 번들 `com.minimalkorea.swishby`). 심사 4.2(최소 기능) 대비로 Capacitor 앱에 Game Center·햅틱·푸시를 붙였다.

**Android 패키지 (2026-10-21 빌드 완료)**: PWA를 TWA(Bubblewrap)로 감싼 서명된 AAB `~/swishby-android/swishby-1.0.0-1.aab` (패키지 `com.minimalkorea.swishby`, 1.0.0 / versionCode 1, targetSdk 36). 업로드 키와 비밀번호 파일은 같은 폴더에 있다 (맥 밖에 백업 필요). 재빌드 방법과 키 정보는 `android/README.md`. `https://swishby.com/.well-known/assetlinks.json`에 업로드 키 지문이 들어 있고, 첫 업로드 후 Play 앱 서명 키 지문을 추가해야 설치된 앱에서 주소창이 사라진다.

## 상표 메모 (2026-10-21 웹 조사, 법률 의견 아님)

- "SWISHBY" 이름의 앱·게임·상표 검색 결과 없음. 웹 검색에 나온 것은 자사 저장소의 이름 변경 PR뿐.
- 주의: ThinkFun IP Holdings가 **SWISH** 상표를 보유하며, 그중 **컴퓨터 게임 소프트웨어**를 지정상품으로 한 출원이 있다 (일련번호 85077100, 85798833). 퍼즐·카드게임 SWISH (85977614)는 소유자 표기가 출처마다 다름 (ThinkFun / FoxMind).
- 그 밖의 SWISH: 아케이드 경품 게임 (등록 4448160, 28류), 스포츠 앱 "Swish Sports", AR 농구 게임 "Swish!!" — 업종·이름이 달라 직접 충돌 가능성은 낮아 보이나 판단은 변리사에게.
- 할 일: USPTO TSDR에서 85077100·85798833의 현재 상태(살아 있는지) 확인, KIPRIS에서 "스위스비"/"SWISHBY" 9류·41류 검색, 출원 여부 결정.

## 이 문서 밖의 열린 항목 (이전 세션에서 이어짐)

- 신고·차단 (Play UGC 정책): **완료** (#63, 운영 DB 적용). 서로 다른 로그인 사용자 3명이 같은 닉네임을 신고하면 리더보드에서 자동 숨김. 검토·해제 쿼리는 `supabase/schema.sql` REPORTS 주석.
- 업로드 키 백업: **완료** (10-21, USB). 잃어버리면 Play에 키 재설정 요청이 필요. APNs 키 파일(AuthKey_AK53HL92SY.p8)도 다시 받을 수 없으니 같은 곳에 백업 (대표).
- 프로덕션 출시: 11-17 (화)로 결정, 위 "프로덕션 출시 일정" 참고.
- iOS: 위 "iOS" 일정 참고. 11-10 심사 제출만 남음.
- CAPTCHA: **출시 후로 보류 (10-23 결정)**. Supabase의 CAPTCHA는 프로젝트 전체에 걸려서, 켜는 순간 siteKey가 빈 채로 묶인 iOS 빌드 1.0.0 (3)의 익명 로그인이 모두 실패한다. iOS 앱은 `capacitor://localhost`에서 돌아 Turnstile이 동작하는지도 확인되지 않았다 (Android는 swishby.com을 여는 TWA라 문제없음). 그동안은 Supabase 기본 IP 속도 제한에 맡긴다. 켜려면: iOS 대응 방법(예: https 페이지에서 확인 후 앱으로 복귀)을 설계해 새 iOS 빌드에 넣고, 그 빌드가 대부분 퍼진 뒤 README "CAPTCHA 켜기" 순서대로.
- Supabase Pro: **11-10 전에 Pro 조직 `breton5797`로 이전 (10-23 결정)**. 지금은 Free 조직 `smartgwanri` (10-23 기준 DB 15 MB / 500 MB, 사용자 308명). 이유는 용량이 아니라 일일 백업(Free는 없음)과 Realtime 동시 접속 한도(Free 200) — 출시 광고로 트래픽이 몰리기 전에 확보. 추가 비용은 컴퓨트 약 월 $10 (조직 기본료는 이미 냄). 이전은 대표가 대시보드 → 프로젝트 설정 → Transfer project에서 하고, 끝나면 Claude가 로그인·점수 제출·대결(Realtime)을 확인한다.
- 게임물 등급분류(GRAC): 사업자 게임에 광고를 붙이려면 등급이 먼저 필요. 스토어 출시분은 IARC(Play)·Apple 자체 등급으로 처리. swishby.com 웹 버전은 국민신문고로 질의 제출 (접수번호 1AA-2610-0856753, 답변 기한 11-04 전후). 답이 없거나 "필요"면 등급분류 신청.
- 첫 시즌 보상 정산: 2026-11-01 (일) 00:00 KST.

## 출처

- [Google Play: 신규 개인 계정 테스트 요건](https://support.google.com/googleplay/android-developer/answer/14151465)
- [Google Play: 사전등록](https://support.google.com/googleplay/android-developer/answer/9859047)
- [Apple App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)
- [ThinkFun IP Holdings 상표 목록 (Justia)](https://trademarks.justia.com/owners/thinkfun-ip-holdings-inc-2169868)
- [SWISH 85977614 (Furm)](https://furm.com/trademarks/swish-85977614)
