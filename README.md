# SWISHBY

> 이전 이름: Flux Wing. 아래 본문은 이전 버전(v2.html, src/)을 기준으로 쓰여 있다.

원터치 비행 게임의 2027 버전. 탭 한 번으로 날아오르는 코어는 그대로 두고, 아슬아슬하게 스칠수록 보상이 커지는 구조를 얹었다. 빌드 단계도 의존성도 없는 정적 웹 게임이다.

## 실행

```bash
npm run dev      # http://localhost:5173
npm test         # 단위 + 봇 비행 테스트
npm run coverage # 커버리지 리포트
```

ES 모듈을 쓰므로 `v2.html`을 파일로 직접 열면 동작하지 않는다. 정적 서버(위 `dev` 스크립트 또는 아무 호스팅)로 띄운다. 배포는 저장소 루트를 그대로 정적 호스팅에 올리면 된다.

## 배포 (2026-10-26부터)

| 브랜치 | 서버 | 주소 |
| --- | --- | --- |
| `main` | Vercel (팀 Minimalkora, 프로젝트 `swishby`, Pro) | https://swishby.com (www는 308로 넘어감) |
| `dev` | GitHub Pages (사용자 지정 도메인 없음) | https://breton5797.github.io/fluxwing/ |

- 흐름: 기능 PR → `dev`에 머지 → 개발 주소에서 확인 → `dev`→`main` PR → 머지하면 Vercel이 운영에 배포한다.
- 개발 주소도 **운영 Supabase**를 쓴다. 거기서 한 플레이는 운영 랭킹에 남는다.
- Vercel은 빌드 없이 저장소 루트를 그대로 올린다(설치 명령은 비워 둠). 공개하면 안 되는 폴더는 `.vercelignore`로 뺀다(`tests/vercel-deploy.test.js`가 검사).
- DNS는 Namecheap: `@` A `216.150.1.1`, `216.150.16.1`, `www` CNAME `323774410988634b.vercel-dns-016.com`. 메일 전달(MX)과 TXT는 그대로 둔다.

## 조작

| 입력 | 동작 |
| --- | --- |
| 탭 · Space · ↑ · W | 날갯짓 |
| Shift · D · E · DASH 버튼 | 대시 (게이지 100%) |
| P · Esc | 일시정지 |

## 게임 규칙

- **PERFECT / 콤보** — 게이트 가장자리를 16px 이내로 스치면 PERFECT. 콤보가 쌓일수록 점수(1 + 콤보)가 커지고 대시 게이지가 찬다.
- **FEVER** — 콤보 5마다 6초간 점수 ×2.
- **페이즈 대시** — 벽과 드론을 관통한다. 관통한 게이트는 +2, 격파한 드론은 +3. 벽 안에서는 대시가 끝나지 않는다.
- **게이트 3종** — 고정, 상하 이동(⇅), 틈이 맥동(◇).
- **드론** — 8번째 게이트 이후 게이트 사이를 순찰한다. 두 틈을 잇는 직선 경로는 항상 비워 둔다.
- **파워업 4종** — 실드(S), 마그넷(M), 슬로모션(T), 더블 스코어(×2).
- **존 6개** — 게이트 12개마다 전환되고, 한 바퀴 돌면 속도가 붙은 다음 루프가 시작된다.
- **리바이브** — 판당 한 번, 샤드 30개로 이어하기.
- **데일리 런** — 날짜로 시드가 고정된 코스. 같은 날 모두가 같은 코스를 난다.
- **미션 · 스킨** — 날짜마다 미션 3개가 주어지고, 오브와 미션 보상으로 모은 샤드(◆)로 스킨을 산다.

저장 데이터(기록, 샤드, 스킨, 설정)는 브라우저 `localStorage`의 `fw2_save` 키에만 있다. 서버는 없다.

## 구조

```
index.html               SWISHBY 2027 (실서비스 게임) (단일 파일, 배포 루트)
v2.html, styles.css      Flux Wing 2 화면 뼈대와 오버레이
src/config.js            모든 튜닝 상수
src/rng.js               시드 RNG, 날짜 키
src/logic.js             순수 규칙: 코스 생성, 난이도, 판정, 점수
src/sim.js               DOM 없는 결정론적 시뮬레이션 (1/120초 고정 스텝)
src/progress.js          저장 데이터, 미션, 스킨 (순수 · 불변)
src/storage.js           localStorage 경계
src/feedback.js          시뮬레이션 이벤트 → 효과음 · 파티클 · 진동
src/audio.js             합성 효과음과 스텝 시퀀서 BGM
src/fx.js, src/render.js 파티클과 캔버스 렌더러
src/ui.js, src/main.js   DOM 패널, 상태 머신과 프레임 루프
sw.js                    오프라인 캐시 (네트워크 우선)
tests/                   node:test 스위트, tests/helpers/bot.js 자동 비행 봇
```

시뮬레이션은 `Math.random`, 화면 크기, 프레임 레이트에 의존하지 않는다. 그래서 데일리 코스가 기기와 무관하게 동일하고, 테스트에서 봇이 실제 코스를 비행해 통과 가능성을 검증한다. `src/logic.js`의 `rng()` 호출 순서를 바꾸면 모든 데일리 코스가 바뀐다.

`?debug`를 붙여 열면 `window.__fluxwing.peek()`으로 현재 상태를 읽을 수 있다(자동 플레이 테스트용, 읽기 전용).

## 계정 로그인 / 클라우드 세이브

리더보드 카드의 계정 줄에서 Google 또는 이메일 6자리 코드로 로그인하면, 기존 익명 플레이어가 **같은 uid 그대로** 정식 계정으로 승격되어 리더보드·RP 이력이 유지된다. 코인·기체·스테이지 진행(`index.html`의 cloud 블록 `FS_KEYS`)은 계정당 1행(`public.fw_saves`, rev CAS)에 저장되어 기기 간 동기화된다. 충돌은 클라이언트가 3-way 병합(`fsMerge`)으로 해소하고, 적용은 메뉴에서만 localStorage에 쓴 뒤 reload한다.

- **설정 순서**: `supabase/schema.sql` 헤더의 대시보드 체크리스트 8~10번 + `plan-auth.md` 부록 A (URL Configuration, Email OTP, Google OAuth, Allow manual linking). 출시 전 커스텀 SMTP 필수 — 기본 SMTP는 시간당 발송 수가 매우 적다. 메일 템플릿(Magic Link·Change Email)에 `{{ .Token }}`을 넣어야 6자리 코드 입력이 동작한다.
- **Apple 켜기**: Apple Developer 설정(부록 A-3) 완료 후 `index.html`의 `FW_CONFIG.auth.apple = true` 한 줄. 꺼져 있으면 버튼이 보이지 않는다.
- **포털 빌드**(CrazyGames/Poki)에는 로그인 UI가 없다(판정: 포털은 외부 로그인 리다이렉트를 허용하지 않음). 리더보드용 익명 로그인은 그대로 동작한다.
- **로그아웃**은 이 기기의 진행을 지우고 새 익명으로 시작한다(진행은 계정에 남음) — 다음에 다른 계정으로 로그인할 때 진행이 섞이지 않게 하기 위해서다.
- **계정 삭제**는 계정 화면의 빨간 버튼 → 게임 안 확인 창 → `public.delete_me()` 한 번이다. 서버는 `auth.users` 행만 지우고 모든 게임 테이블이 cascade로 따라간다(익명화 없음). 운영 DB에는 `supabase/schema.sql`의 ACCOUNT DELETION 블록을 한 번 적용한다. 리허설: `bash supabase/rehearsal/run.sh supabase/rehearsal/delete-me.sql`.

### Apple 로그인 켜기

Apple 로그인 버튼은 Supabase에서 Apple 제공자가 켜지는 순간 자동으로 나타난다(클라이언트가 `/auth/v1/settings`를 읽는다). 켜는 데 필요한 것은 Apple Developer Program 계정뿐이다.

1. developer.apple.com → Certificates, Identifiers & Profiles → Identifiers → App ID(예: `com.minimalkorea.swishby`)에 **Sign in with Apple** 체크.
2. Identifiers → **Services ID**(예: `com.minimalkorea.swishby.web`) 생성 → Sign in with Apple 설정에서 Primary App ID 선택, 도메인 `swishby.com`, Return URL `https://ecjeyelgcqbliavwltbc.supabase.co/auth/v1/callback`.
3. Keys → **Sign in with Apple** 키 생성 → `.p8` 내려받기(한 번만 받을 수 있다), Key ID 메모. Team ID는 Membership 페이지에 있다.
4. 이 저장소에서 `node scripts/apple-client-secret.mjs --team <Team ID> --key-id <Key ID> --client <Services ID> --p8 <AuthKey.p8>` 실행 → `apple-secret.txt` 한 줄이 생긴다(화면에 출력하지 않는다). 6개월마다 다시 만든다.
5. Supabase → Authentication → Providers → Apple: Client IDs에 Services ID, Secret Key (for OAuth)에 `apple-secret.txt`의 한 줄, 켜기 → 저장. 게임을 새로 열면 Apple 버튼이 보인다.

### CAPTCHA 켜기 (Cloudflare Turnstile)

익명 로그인은 아무나 DB에 사용자를 쌓을 수 있는 입구라 Supabase가 CAPTCHA를 강하게 권장한다. 클라이언트는 익명 로그인과 이메일 코드 요청(`signInWithOtp`) 직전에만 Turnstile 스크립트를 불러 토큰을 받고(`index.html`의 captcha 블록), 보이지 않는 방식(`interaction-only`)이라 평소에는 아무것도 뜨지 않는다. **순서가 중요하다: 클라이언트를 먼저 배포하고 그다음 Supabase에서 켠다.** 반대로 하면 토큰 없는 로그인이 전부 실패한다.

1. Cloudflare 대시보드 → Turnstile → Add widget: 도메인 `swishby.com`(로컬 QA용 `localhost`도 추가), 모드 Managed. **Site key**(공개)와 **Secret key**(비밀)를 받는다.
2. `index.html`의 `FW_CONFIG.auth.captcha.siteKey`에 Site key를 넣어 배포한다. 비어 있으면 꺼진 상태다.
3. Supabase → Authentication → Attack Protection → Enable Captcha protection → Turnstile → Secret key → Save.
4. 끄려면 3번을 먼저 끄고 그다음 siteKey를 비운다.

로컬 QA: Cloudflare의 테스트 키 Site `1x00000000000000000000AA`(항상 통과) / Secret `1x0000000000000000000000000000000AA`. `#dev`에서 `FW.cap()`이 `{captchaToken}`을 돌려주면 위젯이 동작하는 것이다.

## 소셜 기능 운영 적용 (친구 · 알림 · 4인 FFA)

클라이언트(index.html)는 머지만으로 배포되지만, 서버 쪽은 Supabase SQL Editor에서 한 번 적용해야 한다.
(길드 기능은 2026-10-18에 제거됐다. 운영 DB에서 길드 객체를 걷어내려면 `supabase/drop-guilds.sql`을 한 번 실행한다.)

1. `supabase/schema.sql`의 **SOCIAL — FRIENDS / FRIEND ALERTS / 4-PLAYER FFA** 섹션과
   FFA로 바뀐 versus 정의(`fw_vs_cfg`의 `drop function`+재생성, `fw_versus_start/report`, `fw_vs_settle` 라우팅,
   제약 교체 alter 4건)를 실행한다. 파일 전체를 다시 실행해도 안전하다(멱등).
2. `supabase/checks/` 의 `social.sql`, `ffa.sql`, `versus-regress.sql`을 순서대로 실행해
   각각 `PASS` notice를 확인한다. 전부 트랜잭션 안에서 돌고 롤백된다.
3. 적용 전까지 클라이언트는 전부 "오프라인/미집계" 경로로 동작한다: 친구 화면은 오프라인 안내,
   FFA는 무랭크(연습 표기) 정산. 적용 후 자동으로 살아난다.
4. claude.ai 아티팩트에서는 Supabase 연결이 차단되므로(2026-10 실측) 소셜 기능은 웹/PWA 빌드 전용이다.
   아티팩트의 대전 인간 매칭은 기존 room 경로로 동작하며 항상 무랭크다.

## 오류 추적 (클라이언트 오류 로그)

외부 추적기 없이, 게임이 잡지 못한 오류(`error`, `unhandledrejection`)를 서버 테이블 `private.fw_client_errors`에 직접 적는다.
클라이언트(`index.html`의 errlog 블록)는 같은 버그를 세션당 한 번, 세션당 최대 5건만 보내고, 주소의 쿼리는 절대 보내지
않는다(OAuth 복귀 코드가 거기 실린다). 서버 함수 `public.report_error()`는 플레이어당 시간당 10건, 전체 시간당 500건을
넘으면 저장하지 않고, 저장 전에 길이를 자른다. 30일이 지난 행은 pg_cron `fw_client_errors_gc`가 지운다.

- 운영 적용: `supabase/schema.sql`의 CLIENT ERRORS 블록과 cron 블록을 한 번 실행한다(파일 전체 재실행도 안전하다).
- 읽기(SQL Editor): `select at, player_id, build, msg, left(stack, 200), url, extra from private.fw_client_errors order by at desc limit 50;`
  `build`는 페이지 인라인 스크립트 총 길이(`L…`)라 배포마다 달라지며, 어느 배포의 오류인지 구분하는 용도다.
- 리허설: `bash supabase/rehearsal/run.sh supabase/rehearsal/errlog.sql`

## 이용 지표 (자체 이벤트 트래킹)

광고 집행 기준(D1 ≥ 35%, D7 ≥ 10%, 평균 세션 5분 이상, 튜토리얼 완료율, 구매 전환, 광고 시청)을 외부 분석 도구 없이 재기 위해,
게임이 이벤트를 서버 테이블 `private.fw_events`에 직접 적는다. 종류는 고정 목록이다: `first_open`(기기 첫 실행, 전달되면
`fw27_ev_first`로 표시), `session_start`, `session_end`(`dur` = 이 세션의 화면 표시 초), `tutorial_done`(첫 실행 팁이 끝나
`fw27_tut`가 1이 되는 순간), `run_end`(모드·점수·스테이지·유닛), `daily_done`, `shop_buy`(테스트 상점, 결제 없음), `ad_view`(보상형
지급·전면 표시 때만, 지금은 `FW_CONFIG.ads`가 `'none'`이라 0), `share`, `level_up`. `purchase`는 실결제용으로 예약만 해 두었다.

- 클라이언트(`index.html`의 events 블록): 메모리 큐(최대 50)에 쌓아 10건이 차거나 30초마다 `public.track()` 한 번으로 보낸다.
  서버 세션(게스트 익명 세션 포함)이 있을 때만 보내고, 실패한 묶음은 다시 보내지 않는다. 화면이 가려지면 `session_end`를 넣고
  남은 큐를 `fetch(..., {keepalive: true})`로 보낸다(클라이언트의 rpc는 페이지가 닫히면 끊긴다). 토큰은 auth 콜백에서 보관한다.
  30분 넘게 가려졌다 돌아오면 새 세션이다. 주기적 핑은 쓰지 않는다(시간당 60행 × 400일이 남는다).
- 서버: `public.track(p_events jsonb, p_build text)`는 플레이어당 시간당 300건, 전체 시간당 20,000건, 호출당 50건까지만 저장하고
  목록에 없는 종류, 형식이 틀린 세션 id는 건너뛰며, 1KB를 넘는 props는 버린다. 계정을 지우면 함께 지워지고(FK cascade),
  400일이 지난 행은 pg_cron `fw_events_gc`가 지운다.
- 지표: `supabase/checks/kpi.sql`(일별 설치, 설치 코호트별 D1/D7/D30, 세션 길이, 튜토리얼 완료율, DAU당 판 수·공유율·구매 전환·광고
  시청, 코호트별 구매 전환). SQL Editor에서 한 쿼리씩 실행한다. 날짜는 한국 시간 기준이다.
- 운영 적용: `supabase/schema.sql`의 PRODUCT EVENTS 블록(파일 맨 끝)을 한 번 실행한다(파일 전체 재실행도 안전하다).
- 리허설: `bash supabase/rehearsal/run.sh supabase/rehearsal/events.sql` (`authenticated` 역할로 실행해 권한까지 확인하고, 이어서 kpi.sql을 돌린다)
