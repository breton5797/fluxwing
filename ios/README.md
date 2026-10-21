# SWISHBY iOS (App Store)

swishby.com의 `index.html`을 앱 안에 넣어 실행하는 Capacitor 8 앱 (Swift Package Manager). 웹과 같은 페이지이고, 페이지가 앱 안인지 스스로 알아채 (`index.html`의 native 블록) 다음만 다르게 한다.

- 로그인: Google·Apple은 시스템 브라우저(SFSafariViewController)로 열고 `com.minimalkorea.swishby://auth`로 돌아와 세션을 시작한다 (Google은 웹뷰 로그인을 막는다). 이메일 코드는 웹과 같다.
- 햅틱: 웹의 진동 패턴을 네이티브 강도(가벼움·보통·강함)로 바꿔 쓴다.
- Game Center: 시작할 때 로그인, 판이 끝나면 `swishby.best`(무한·스테이지 최고점)와 `swishby.daily`(일일 코스)에 점수 제출, 랭킹 화면의 "Game Center" 버튼.
- 푸시: 알림(종) 버튼이 켜져 있으면 APNs 토큰을 서버에 등록해 앱이 닫혀 있을 때 친구 알림을 받는다 (`supabase/schema.sql` PUSH, `supabase/functions/push-send`). 앱이 열려 있으면 기존 토스트로 보여준다.
- 약관·개인정보·소개 링크는 Safari로 연다. Google Play 사전등록 링크는 숨긴다. 광고 없음.

- 번들 ID: `com.minimalkorea.swishby` (Android 패키지와 같음), 팀 `6SGPPQF3VQ`, 최소 iOS 15, 세로 고정
- 권한(entitlements): Game Center, Push(`aps-environment`)

## 빌드

필요: Xcode 26 이상, Node 20 이상.

```sh
npm install
npm run build:ios          # ios-www/ 만들기 (index.html + 같은 버전의 Supabase SDK + 링크된 파일) → npx cap sync ios
npx cap open ios           # Xcode에서 실행·보관(Archive)
```

시뮬레이터 빌드만 확인할 때:

```sh
cd ios/App && xcodebuild -project App.xcodeproj -scheme App -sdk iphonesimulator -destination 'generic/platform=iOS Simulator' CODE_SIGNING_ALLOWED=NO build
```

`index.html`을 고친 뒤에는 `npm run build:ios`를 다시 실행해야 앱에 반영된다.

## 출시 전 설정 (한 번)

| 무엇 | 어디서 | 누가 |
| --- | --- | --- |
| App ID `com.minimalkorea.swishby`에 Game Center·Push Notifications 기능 켜기 | developer.apple.com → Identifiers | 대표 (또는 Xcode 자동 서명이 켬) |
| App Store Connect에 앱 만들기 (번들 ID 위, SKU `swishby-ios`) | appstoreconnect.apple.com | 대표 로그인 후 Claude |
| Game Center 리더보드 2개: `swishby.best`(최고 점수, 높을수록 좋음), `swishby.daily`(반복 리더보드, 매일 00:00 UTC) | App Store Connect → 앱 → Game Center | 대표 로그인 후 Claude |
| APNs 인증 키(.p8) 만들기, Key ID 기록 | developer.apple.com → Keys | 대표 (키 파일은 한 번만 내려받을 수 있음) |
| Supabase 함수 비밀값: `APNS_KEY`(p8 내용), `APNS_KEY_ID`, `APNS_TEAM_ID=6SGPPQF3VQ`, `PUSH_HOOK_SECRET` | Supabase → Edge Functions → Secrets | Claude |
| Vault 비밀값 `push_hook_url`, `push_hook_secret` (위와 같은 값) | `supabase/schema.sql` PUSH 주석의 SQL | Claude |
| Supabase Auth → URL Configuration → Redirect URLs에 `com.minimalkorea.swishby://auth` 추가 | Supabase 대시보드 | Claude (또는 대표) |

APNs 비밀값이 없으면 푸시 함수는 아무것도 보내지 않고(202) 나머지는 그대로 동작한다.

## 심사 메모

- 4.2(최소 기능): 앱 안에 게임 전체가 들어 있고 오프라인에서도 켜진다. Game Center·햅틱·푸시 같은 기기 기능을 쓴다.
- 4.8: Google 로그인을 제공하므로 Apple 로그인도 제공한다 (웹과 같은 Supabase Apple 공급자).
- 5.1.1(v): 앱 안에서 계정 삭제 가능 (로그인 화면 → 계정 삭제).
- 3.1.1: 실제 결제 없음. 젬 등을 돈으로 팔게 되면 인앱 결제를 써야 한다.
- 수출 규정: 표준 암호화만 사용 (`ITSAppUsesNonExemptEncryption = false`).
