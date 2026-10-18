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

## 소셜 기능 운영 적용 (친구 · 알림 · 4인 FFA · 길드)

클라이언트(index.html)는 머지만으로 배포되지만, 서버 쪽은 Supabase SQL Editor에서 한 번 적용해야 한다.

1. `supabase/schema.sql`의 **SOCIAL — FRIENDS / FRIEND ALERTS / 4-PLAYER FFA / GUILDS** 섹션과
   FFA로 바뀐 versus 정의(`fw_vs_cfg`의 `drop function`+재생성, `fw_versus_start/report`, `fw_vs_settle` 라우팅,
   제약 교체 alter 4건)를 실행한다. 파일 전체를 다시 실행해도 안전하다(멱등).
2. `supabase/checks/` 의 `social.sql`, `guild.sql`, `ffa.sql`, `versus-regress.sql`을 순서대로 실행해
   각각 `PASS` notice를 확인한다. 전부 트랜잭션 안에서 돌고 롤백된다.
3. 적용 전까지 클라이언트는 전부 "오프라인/미집계" 경로로 동작한다: 친구·길드 화면은 오프라인 안내,
   FFA는 무랭크(연습 표기) 정산. 적용 후 자동으로 살아난다.
4. claude.ai 아티팩트에서는 Supabase 연결이 차단되므로(2026-10 실측) 소셜 기능은 웹/PWA 빌드 전용이다.
   아티팩트의 대전 인간 매칭은 기존 room 경로로 동작하며 항상 무랭크다.
