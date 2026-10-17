---
status: APPROVED
created: 2026-10-17
decisions:
  - "[from-user] Q1 전면 광고 페이싱: 1단계 상한(3판+180s) 유지 — 포털에서도 동일"
  - "[from-user] Q2 포털 빌드: scripts/portal-build.mjs 사용"
  - "[from-user] Q3 happytime: 결과 카드 신기록 + 스테이지 클리어"
  - "[from-user] Q4 실제 SDK 가드: 120s"
  - "[from-research] SDK API 가정 전체를 공식 문서로 검증 완료 (docs.crazygames.com/sdk/*, sdk.poki.com/html5): CDN URL, CG SDK.init/requestAd('rewarded'|'midgame', {adStarted,adFinished,adError})/environment('local'|'crazygames'|'disabled')/ad.hasAdblock()/game.gameplayStart|Stop|happytime, Poki init().then/.catch, rewardedBreak()→Promise<boolean withReward>, commercialBreak()→Promise<void>, gameplayStart/Stop, gameLoadingFinished 모두 계획 가정과 일치. CG는 midgame 자체 쿨다운(~3분)이 있어 우리 180s 상한과 호환"
  - "[from-claude] 벤더 공통 상태기계(adVendor) + 벤더별 드라이버(AD_DRV) 2층 구조"
  - "[from-claude] gameplayStart/Stop은 루프에서 state==='play' 엣지 1곳 감지(adPlaySync), 어댑터가 중복 제거"
  - "[from-claude] 음소거는 runAd/adLeave 전후로 master gain 0 (adVol)"
ambiguity:
  total_ambiguity: 0.08
  threshold: 0.20
restate: "FW_CONFIG.ads가 'crazygames' 또는 'poki'일 때만 해당 벤더 SDK를 CDN에서 동적 주입하고, 1단계 어댑터 계약을 따르는 실제 어댑터로 ADS placeholder를 교체하며, 광고 중 음소거, gameplay 시작/정지, happytime, 로딩 완료 이벤트를 최소 훅으로 보내고, SDK 로드나 초기화가 실패하면 ready()=false로 광고 UI를 숨겨 게임을 그대로 둔다."
acceptance_criteria:
  - id: AC1
    desc: "adVendor 상태기계(로드 전 ready=false, 차단, 초기화 실패, 이벤트 대기와 최신 상태만 송신, 1회 1광고, 광고 전 gameplayStop)가 fake 드라이버로 통과"
    verifier: "node --test tests/ads-sdk.test.js → 0 failures"
  - id: AC2
    desc: "CrazyGames, Poki 드라이버가 fake SDK 전역으로 결과값·이벤트 매핑 통과. 알 수 없는 제공자/프로토타입 키는 광고 없음"
    verifier: "node --test tests/ads-sdk.test.js → 0 failures"
  - id: AC3
    desc: "기존 테스트 전체 회귀 없음"
    verifier: "npm test → 0 failures"
  - id: AC4
    desc: "광고 차단기 ON + 포털 빌드: 게임 전 흐름 정상, 광고 버튼 3종 숨김, 전면 광고 없이 즉시 진행, Uncaught 0"
    verifier: "수동 QA: dist/crazygames, dist/poki"
  - id: AC5
    desc: "광고 중 master gain 0, 종료 후 사용자 mute 설정대로 복원"
    verifier: "수동 + adVol 단위 테스트"
  - id: AC6
    desc: "gameplayStart/Stop 교대 송신(런/리바이브/재개=start, 사망/일시정지/탭숨김/메뉴=stop), 중복 없음, 광고 시점 항상 stop"
    verifier: "SDK 디버그 로그 수동 + AC1 단위"
  - id: AC7
    desc: "포털 빌드 산출물의 FW_CONFIG.ads가 해당 제공자, 원본 index.html 불변"
    verifier: "node --test tests/portal.test.js; npm run build:portal -- poki"
  - id: AC8
    desc: "포털 호스트에서 ?ads=ok가 실제 제공자를 stub으로 못 바꿈"
    verifier: "tests/ads.test.js 기존 adPick 케이스"
constraints:
  - "[from-code] 실서비스 파일은 루트 index.html 하나. src/, v2.html 수정 금지"
  - "[from-code] 순수 로직은 ads 블록 안, window/document/setTimeout/Date/store/$ 참조 금지. SDK 객체·load·wait는 주입"
  - "[from-user] SDK 스크립트는 해당 제공자일 때만 동적 주입. stub(기본)은 네트워크 요청 0"
  - "[from-user] FW_CONFIG.ads: 'crazygames' | 'poki' | 'stub'(기본)"
  - "[from-code] 1단계 계약과 결과값 집합 불변. 선택 메서드 ev(kind)만 추가, adGuard가 안전 통과"
  - "[from-user] node:test, TDD. 새 npm 의존성 없음"
  - "Surgical: 페이싱 규칙, 보상 공식, 이어하기 비용, 1단계 UI 흐름 불변"
out_of_scope:
  - "AdSense H5 등 다른 제공자"
  - "CG 사용자 계정/데이터 저장/인게임 구매/settings.muteAudio 리스너"
  - "포털 정책 검토(외부 링크·Supabase 허용 여부) — 업로드 전 별도"
  - "광고 시청 서버 검증 / index.html 분할 / 포털 업로드 자동화"
---

# 2단계 실제 광고 SDK 연동 (CrazyGames + Poki)

**Goal:** FW_CONFIG.ads가 'crazygames'|'poki'일 때 SDK 동적 주입, 1단계 계약을 따르는 실제 어댑터로 교체, 광고 중 음소거 + gameplay/happytime/loaded 이벤트, 실패 시 기존 degrade 유지.

**Architecture:** ads 블록에 벤더 공통 상태기계 `adVendor(name, drv, env)`(loading→on|noads|off)와 드라이버 표 `AD_DRV`. 런타임은 스크립트 주입(adLoad), 광고 전후 음소거(adAudio), 루프 1줄 gameplay 엣지(adPlaySync)만. 비유: 차단기 하나(adVendor)에 나라별 플러그(드라이버)를 꽂는 구조.

## Interfaces 요약
- `AD_EVS = ['start','stop','happy','loaded']`
- `adVendor(name, drv, env) → Adapter & {ev(kind), boot:Promise}` — drv={init(sdk)→Promise<bool>, rewarded(sdk), interstitial(sdk), ev:{start?,stop?,happy?,loaded?}}, env={load()→Promise<sdk|null>}
- `adGuard` 반환에 `ev(kind)` 추가 (AD_EVS 외 무시, 예외 삼킴, 없으면 no-op)
- `adPlayEv(wasPlaying, state) → 'start'|'stop'|null`, `adVol(muted, adOn) → 0|0.5`
- `AD_SDK = {guardMs:120000, loadMs:10000, src:{crazygames:'https://sdk.crazygames.com/crazygames-sdk-v3.js', poki:'https://game-cdn.poki.com/scripts/v2/poki-sdk.js'}}`
- `AD_GLOBAL = {crazygames(w), poki(w)}`, `AD_DRV = {crazygames, poki}`, `adMake(p, env)`, `adGuardMs(prov)`
- 런타임: `adLoad(prov)`, `adOn`/`adAudio(on)`, `adPlaying`/`adPlaySync()`

## Review Focus
1. 알 수 없는 제공자/프로토타입 키('toString','__proto__','Poki') → 예외 없이 광고 없음 (Object.hasOwn)
2. 실제 보상형 광고 30s+ → 120s 가드 (adGuardMs)
3. init 전 이벤트(loaded/start) → 큐 후 loaded 1회 + 최신 play 상태 1회, stop이 start보다 먼저 안 나감
4. 원래 muted / 광고 중 mute 토글 → 광고 중 항상 0, 종료 후 설정대로
5. 광고 중 탭 숨김/일시정지/같은 프레임 전이 → gameplay 중복 없음, 광고 시점 항상 stop

## Task 1: adVendor 상태기계 + adPlayEv/adVol (ads 블록, tests/ads-sdk.test.js, 로더 return 확장)
TDD: planner 테스트 11케이스(RED) → AD_EVS/adGuard.ev/adVendor/adPlayEv/adVol 구현(GREEN) → 블록 순수성 grep → 커밋 "feat: vendor ad adapter state machine with queued gameplay events"

## Task 2: AD_SDK/AD_GLOBAL/AD_DRV/adMake/adGuardMs (ads 블록, 테스트 2부)
SDK 검증 완료([from-research] decisions 참조). TDD: fakeCg/fakePoki 테스트(RED) → 구현(GREEN) → 커밋 "feat: CrazyGames v3 and Poki ad drivers behind the adapter contract"
- CG: init→environment 'disabled'면 noads, hasAdblock true면 noads(검사 예외는 on), requestAd 콜백 매핑, ev start/stop/happy
- Poki: init reject→noads(이벤트는 유지), rewardedBreak()===true→granted else skipped, commercialBreak→shown, ev start/stop/loaded

## Task 3: 런타임 배선 (index.html :1013-1017, audioInit, mute 버튼, adLeave)
adLoad(스크립트 주입, 10s 타임아웃, 실패 시 remove+null, loadSdk 패턴), ADS=adGuard(adMake(...), adWait, adGuardMs(p.prov)), adOn/adAudio, runAd·adLeave 전후 adAudio(true/false), audioInit·mute 버튼이 adVol 사용. 회귀: npm test + ?ads=ok#dev 1단계 흐름 + stub일 때 SDK 네트워크 요청 0. 커밋 "feat: load the portal ad SDK on demand and mute the game while an ad plays"

## Task 4: 이벤트 훅 (loop 끝 adPlaySync, visibilitychange 동기화, 신기록+스테이지 클리어 happy, 부팅 끝 loaded)
수동 검증은 Task 5 빌드로. 커밋 "feat: tell the portal when gameplay starts and stops, happy moments and load done"

## Task 5: 포털 빌드 (scripts/portal-build.mjs, tests/portal.test.js, package.json build:portal)
portalHtml(html, prov): FW_CONFIG 줄 정확히 1개 확인 후 `ads: '<prov>', ` 삽입, 미지 제공자 throw. CLI → dist/<prov>/ (index.html + manifest.webmanifest, icon.svg, apple-touch-icon.png). dist는 gitignore. TDD → 커밋 "feat: portal builds that set the ad provider for CrazyGames and Poki"
QA 체크리스트(수동, 두 포털): 차단기 ON 전 흐름 정상·버튼 숨김·Uncaught 0 / 보상형 1회 지급·광고 중 무음 / 중도 닫기→adFail·카운트다운 재개 / 전면 광고 상한·직전 gameplayStop / versus 동일 / ?ads=ok 무시 / ≤379px 복귀 정상

## 의존성·리스크·복잡도
Task 1→2→3→4, Task 5 Step1-4 병렬 가능. 외부: 벤더 CDN(QA 시). 리스크: 포털 자체 빈도 제어와 상한 중복(수익 영향, Q1 결정으로 수용) / Poki commercialBreak는 실제 노출 미보고(shown 처리, 카운터 초기화 수용) / 120s 가드 뒤 늦게 끝나는 광고(busy로 신규 광고 차단). 복잡도 MEDIUM: index.html +70~90줄, 테스트 +200줄, 스크립트 +25줄.

## Sprint Contract
1. node --test tests/ads-sdk.test.js → 0 failures
2. node --test tests/portal.test.js → 0 failures
3. npm test → 0 failures
4. FW.selfTest() → 실패 0
5. stub 빌드: SDK 네트워크 요청 0, 1단계 흐름 그대로
6. dist 빌드 + 차단기 ON: 광고 UI 숨김, 게임 정상
7. ads 블록 grep: window|document|setTimeout|Date. → 0건
