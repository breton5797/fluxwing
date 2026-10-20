# SWISHBY 출시 준비 현황

기준: 2026-10-21 (수). 근거 문서: 「스위스비 글로벌 마케팅 플랜」(2026-10-19)의 출시 전 체크리스트와 필수 바이럴 3종.

플랜 원칙: 아래 체크리스트가 모두 끝나야 1주차 광고를 켠다.

## 출시 전 체크리스트

| # | 항목 | 상태 | 어디에 | 남은 일 (담당) |
| --- | --- | --- | --- | --- |
| 1 | 영문 이름·상표 | 1차 조사 완료 | 아래 "상표 메모" | 변리사 유사성 의견, KIPRIS·USPTO·WIPO 직접 검색 (대표) |
| 2 | 스토어 제목·설명·스크린샷 현지화 (영·일·스·포·인니 + 한) | 문구 완료, 스크린샷 생성 도구 PR | `store-listing.json` (글자수 제한은 `tests/store-listing.test.js`가 검사), 스크린샷은 `feat/shorts-pipeline` PR | 스토어 콘솔에 붙여넣기 (계정 생성 후) |
| 3 | 게임 언어 자동 전환 = 스토어 언어 | 게임 쪽 완료 | `detectLang()`: 브라우저 언어 → 12개 언어, 없으면 영어 | 스토어 등록 언어를 위 6개로 맞추면 끝 |
| 4 | 일일 챌린지 결과 공유 이미지 버튼 | PR | `feat/share-card` | 머지 (대표) |
| 5 | 설치·튜토리얼·D1/D7·결제·광고 이벤트 트래킹 | PR | `feat/events` (자체 DB, 제3자 트래커 없음) + `supabase/checks/kpi.sql` | 머지 후 프로덕션 SQL 적용 |
| 6 | 9:16 숏폼 자동 생성, 첫 20개 | PR + 결과물 | `feat/shorts-pipeline`, 결과물 `~/Downloads/swishby-marketing/` | 업로드 (대표) |
| 7 | TikTok·Meta·구글 광고 계정 + 결제 수단 | 미착수 | — | 계정 개설·카드 등록은 대표만 가능 |
| 8 | 틱톡·유튜브·인스타 공식 계정, 프로필에 스토어 링크 | 미착수 | — | 계정 개설은 대표만 가능. 스토어 전에는 https://swishby.com 링크 |

## 필수 바이럴 3종

| 전술 | 상태 | 메모 |
| --- | --- | --- |
| 도전장 링크 | 이미 있음 | `?c=점수&d=날짜` 딥링크, 같은 일일 코스에서 대결 (`readChallenge`, `challengeResult`) |
| 친구 초대 크레딧 | PR | `feat/referral`: 친구가 3일 플레이 + 스테이지 10 도달 시 초대자에게 젬, 3·10·25명 단계 보상, 월 25명 상한, 피초대자 별도 보상 없음 |
| 구글플레이 사전등록 + 마일스톤 보상 | **막힘** | Play 개발자 계정이 없음 (2026-10-21 확인). 아래 "스토어 계정" 참고 |

## 스토어 계정

**Google Play**: breton5797@gmail.com에는 개발자 계정이 없다 (가입 화면으로 이동됨).

- **개인 계정**: 등록비 $25 + 신분 인증. 2023-11-13 이후 만든 개인 계정은 **테스터 12명이 14일 연속 참여한 비공개 테스트**를 마쳐야 프로덕션 출시와 **사전등록이 열린다**. 오늘 바로 시작해도 사전등록은 빨라야 2026-11-04 이후 + 프로덕션 신청 심사.
- **조직 계정 (권장)**: 미니멀코리아 사업자로 등록. 위 테스트 의무가 없어 사전등록을 바로 열 수 있다. D-U-N-S 번호(무료, 발급에 며칠~수 주)가 필요하다. 계정 소유 Google 계정은 나중에 바꿀 수 없으니 소유 계정을 먼저 정한다.

**결정 (2026-10-21): Google Play는 조직 계정으로 간다.** 가입 순서:

1. D-U-N-S 번호 확인·신청: [Dun & Bradstreet의 Google 개발자용 페이지](https://www.dnb.com/en-us/smb/duns/google-developers.html)에서 미니멀코리아가 이미 번호를 갖고 있는지 먼저 검색하고, 없으면 무료로 신청한다. 수수료를 받는 대행은 필요 없다.
2. 영문 상호·주소를 하나로 정한다. 사업자등록증, D-U-N-S, Play Console 조직명·주소가 서로 같아야 자동 인증이 된다.
3. 계정 소유 Google 계정을 정한다 (만든 뒤 바꿀 수 없다). 기본안: breton5797@gmail.com.
4. [Play Console 가입](https://play.google.com/console/signup) → 조직 → 결제 프로필 연결 → 등록비 $25 → D-U-N-S 입력 (아직 없으면 "아니요"로 넘어가고 인증 기한 안에 입력). 조직 웹사이트는 Search Console에서 이미 인증된 https://swishby.com.
5. 계정이 열리면: 앱 만들기 (패키지 `com.minimalkorea.swishby`) → 내부 테스트에 AAB 업로드 → 앱 무결성 화면의 앱 서명 키 SHA-256을 `.well-known/assetlinks.json`에 추가 → 스토어 등록정보에 `store-listing.json` 문구와 스크린샷 → 콘텐츠 등급 설문(IARC) → 사전등록 열기.

**Apple**: 개발자 프로그램 가입 완료 (개인, Team 6SGPPQF3VQ). App Store Connect는 이 Chrome에서 로그인되어 있지 않음. 주의: 웹페이지를 감싸기만 한 앱은 심사 4.2(최소 기능)로 반려될 수 있어, iOS는 Capacitor 등으로 Game Center·햅틱 같은 네이티브 기능을 붙이는 편이 안전하다.

**Android 패키지 (2026-10-21 빌드 완료)**: PWA를 TWA(Bubblewrap)로 감싼 서명된 AAB `~/swishby-android/swishby-1.0.0-1.aab` (패키지 `com.minimalkorea.swishby`, 1.0.0 / versionCode 1, targetSdk 36). 업로드 키와 비밀번호 파일은 같은 폴더에 있다 (맥 밖에 백업 필요). 재빌드 방법과 키 정보는 `android/README.md`. `https://swishby.com/.well-known/assetlinks.json`에 업로드 키 지문이 들어 있고, 첫 업로드 후 Play 앱 서명 키 지문을 추가해야 설치된 앱에서 주소창이 사라진다.

## 상표 메모 (2026-10-21 웹 조사, 법률 의견 아님)

- "SWISHBY" 이름의 앱·게임·상표 검색 결과 없음. 웹 검색에 나온 것은 자사 저장소의 이름 변경 PR뿐.
- 주의: ThinkFun IP Holdings가 **SWISH** 상표를 보유하며, 그중 **컴퓨터 게임 소프트웨어**를 지정상품으로 한 출원이 있다 (일련번호 85077100, 85798833). 퍼즐·카드게임 SWISH (85977614)는 소유자 표기가 출처마다 다름 (ThinkFun / FoxMind).
- 그 밖의 SWISH: 아케이드 경품 게임 (등록 4448160, 28류), 스포츠 앱 "Swish Sports", AR 농구 게임 "Swish!!" — 업종·이름이 달라 직접 충돌 가능성은 낮아 보이나 판단은 변리사에게.
- 할 일: USPTO TSDR에서 85077100·85798833의 현재 상태(살아 있는지) 확인, KIPRIS에서 "스위스비"/"SWISHBY" 9류·41류 검색, 출원 여부 결정.

## 이 문서 밖의 열린 항목 (이전 세션에서 이어짐)

- CAPTCHA: Cloudflare Turnstile 사이트 키가 아직 비어 있음 (클라이언트는 머지됨, 키를 넣는 한 줄 PR + Supabase Attack Protection 설정).
- 게임물 등급분류(GRAC): 사업자 게임에 광고를 붙이려면 등급이 먼저 필요. 스토어 출시분은 IARC 설문으로 처리되지만 swishby.com 웹 버전은 별도 확인 필요.
- 첫 시즌 보상 정산: 2026-11-01 (일) 00:00 KST.

## 출처

- [Google Play: 신규 개인 계정 테스트 요건](https://support.google.com/googleplay/android-developer/answer/14151465)
- [Google Play: 사전등록](https://support.google.com/googleplay/android-developer/answer/9859047)
- [Apple App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)
- [ThinkFun IP Holdings 상표 목록 (Justia)](https://trademarks.justia.com/owners/thinkfun-ip-holdings-inc-2169868)
- [SWISH 85977614 (Furm)](https://furm.com/trademarks/swish-85977614)
