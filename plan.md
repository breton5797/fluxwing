---
status: APPROVED
created: 2026-10-16
decisions:
  - "Q1 [from-user] 데일리 2배 = 기존 '하루 첫 데일리 런 연속 보상(coin/dia/gem)' 2배 (미션 신설 아님)"
  - "Q2 [from-user] SDK 확정 전 실서비스 기본 어댑터 = stub ok (가짜 3초 광고 성공)"
  - "Q3 [from-user] 전면 광고 = 결과 카드를 떠날 때(재시도/메뉴 클릭 직후), 최소 간격 180초"
ambiguity:
  goal_clarity: 0.9
  constraint_clarity: 0.9
  success_criteria: 0.9
  context_clarity: 0.9
  total_ambiguity: 0.10
  threshold: 0.20
restate: "SWISHBY 실서비스 index.html에 광고 제공자 어댑터(stub 우선)와 순수 페이싱·보상 규칙 블록을 추가하고, 이를 기존 이어하기 광고 버튼, 결과 카드의 코인 2배 / 데일리 보상 2배 버튼, 3판당 1회 + 최소 간격 전면 광고에 연결하며, 광고가 없거나 실패하면 버튼을 숨겨 게임 흐름을 그대로 둔다."
acceptance_criteria:
  - id: AC1
    desc: "순수 규칙(페이싱, 상한 카운트, 보상 계산, 중복 수령 방지, 어댑터 선택, 타임아웃 가드)이 DOM 없이 node:test로 통과"
    verifier: "node --test tests/ads.test.js → 0 failures"
    status: pending
  - id: AC2
    desc: "기존 테스트 전체 회귀 없음"
    verifier: "npm test → 0 failures"
    status: pending
  - id: AC3
    desc: "?ads=ok: 이어하기 광고 → 부활 / 코인 2배 → 보너스가 정확히 1회 지급 / 데일리 첫 런 2배 → 1회 지급"
    verifier: "npm run dev → http://localhost:.../#dev?ads=ok 수동 또는 Playwright, FW.W 전후 값 비교"
    status: pending
  - id: AC4
    desc: "?ads=none 및 ?ads=fail: 광고 버튼이 숨겨지거나 실패 안내 후 사라지고, 코인 이어하기·재시도·메뉴는 정상 동작"
    verifier: "Playwright 또는 수동: #contAd/#oAd2x/#oAdDaily hidden 확인, 이어하기 카운트다운 계속 진행"
    status: pending
  - id: AC5
    desc: "전면 광고는 비-versus 완료 런 3판 이상 그리고 마지막 노출 후 AD_CFG.interGapMs 이상일 때만, 보상형 광고를 본 판에는 노출 안 함"
    verifier: "tests/ads.test.js adInterDue 케이스 + 수동으로 4판 연속 재시도"
    status: pending
constraints:
  - "[from-code] 실서비스 파일은 루트 index.html 한 개. src/와 v2.html은 수정하지 않는다"
  - "[from-code] 순수 로직은 /* ads:start */ ~ /* ads:end */ 마커 블록에 두고, 외부 스코프(W, store, $, Date.now, setTimeout)를 참조하지 않는다(now/wait는 인자로 주입)"
  - "[from-user] 테스트는 node:test, TDD(RED→GREEN→IMPROVE)"
  - "[from-code] 저장은 localStorage(store.get/set). 새 키는 fw27_ads 하나. Supabase 스키마 변경 없음"
  - "[from-code] i18n 새 문자열은 key 기반 추가(ko/en, 나머지는 en fallback, index.html:731 규칙)"
  - "[from-claude] 실제 SDK(Poki/CrazyGames/AdSense H5) 스크립트 로딩은 하지 않음. 어댑터 계약만 고정"
  - "Surgical: 이어하기 코인 비용(200), canContinue 조건, 기존 보상 공식은 바꾸지 않는다"
out_of_scope:
  - "실제 광고 SDK 연동 (2단계 별도 계획)"
  - "데일리 미션 시스템 신설"
  - "src/의 REVIVE/MISSIONS 레거시 코드"
  - "광고 시청 서버 검증·부정 방지(로컬 지갑 구조상 1단계 불필요)"
  - "index.html 파일 분할 리팩터링"
---

# 1단계 보상형 광고 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 광고 제공자 어댑터(stub 우선)와 순수 페이싱·보상 규칙을 index.html에 넣고, 보상형 광고 3곳과 상한이 걸린 전면 광고에 연결한다. 광고를 쓸 수 없으면 버튼을 숨긴다.

**Architecture:** 규칙과 어댑터는 index.html 안의 `/* ads:start … ads:end */` 순수 블록에 둔다. 기존 hit-loop 블록과 같은 패턴이며, `tests/helpers/ads.js`가 `new Function`으로 불러와 테스트한다. DOM 연결은 기존 이어하기(`openCont/closeCont`), 결과 카드(`showOver`), 재시도/메뉴 핸들러 옆에 최소한으로 붙인다. 비유하면 콘센트 규격(어댑터 계약)을 먼저 정하고 지금은 테스트용 멀티탭(stub)만 꽂아 두는 셈이고, 나중에 Poki나 CrazyGames 플러그만 바꿔 끼우면 된다.

**Tech Stack:** vanilla JS (단일 HTML, 'use strict' IIFE), localStorage, node:test (Node ≥20)

**Spec:** 이 문서의 frontmatter와 "요구사항 재진술"

## 요구사항 재진술 (코드 대조 후)

| # | 요청 | 실서비스 index.html의 실제 상태 | 이 계획의 해석 |
|---|---|---|---|
| R1 | 게임오버 무료 리바이브 1회 (샤드 30 리바이브와 병존) | [from-code] 이어하기 화면 `#contScr`: `#contAd`(가짜 3초 광고), `#contCoin`(200 코인), 판당 1회(`contUsed`), 스테이지 모드, 점수 3 이상 (`index.html:1690-1720`). 샤드 리바이브는 `src/` 레거시에만 있음 | `#contAd`를 어댑터로 교체. 판당 1회 규칙과 코인 경로는 그대로 |
| R2 | 런 종료 "샤드 2배" | [from-code] 재화는 coins. 런 수입 = `fieldCoin + scoreCoin` (`index.html:1753`) | 결과 카드 "광고 보고 코인 2배" 버튼: `fieldCoin + scoreCoin`만큼 1회 추가 지급 (레벨업·클리어·데일리 보너스는 제외) |
| R3 | 데일리 미션 보상 2배 | [from-code] 미션 없음. 데일리 첫 런 연속 보상 `dailyReward(streak)` → coin/dia/gem (`index.html:1755-1761`) | [from-user Q1] 그 판에서 데일리 보상이 지급됐을 때만 "데일리 보상 2배" 버튼, 같은 보상을 1회 추가 지급 |
| R4 | 전면 광고: 3판당 최대 1회 + 최소 간격 | 없음 | 비-versus 런 완료 수 ≥ 3 그리고 마지막 노출 후 ≥ `interGapMs`(180000)일 때. 보상형 광고를 본 판은 제외. 노출 시점은 결과 카드를 떠날 때 [from-user Q3] |
| R5 | SDK 미정 → adapter + stub | 없음 | 계약 `{name, ready(), rewarded(place), interstitial()}`. stub 모드 `ok/fail/skip/none`, 타임아웃·예외 가드. 실서비스 기본 stub ok [from-user Q2] |
| R6 | 실패/미로드 시 degrade | `#contAd`가 항상 보임 | `ready()`가 false면 버튼 숨김. 실패하면 짧은 안내 후 버튼 숨김, 흐름 유지 |
| R7 | node:test, DOM 없는 순수 로직 테스트, TDD | [from-code] `tests/helpers/hitloop.js`가 index.html 블록을 그대로 실행하는 선례 있음 | `tests/helpers/ads.js` + `tests/ads.test.js` |

## 인라인 vs 별도 모듈: 결정과 근거
- **결정: 인라인 마커 블록.** [from-code]
- 근거 1: 저장소에 같은 패턴이 이미 있습니다. hit-loop(`index.html:942-977` ↔ `tests/helpers/hitloop.js`)과 nick-filter(`scripts/nick-filter-sql.mjs`)가 index.html 블록을 그대로 테스트합니다. 테스트 대상과 배포 코드가 한 소스입니다.
- 근거 2: 실서비스는 외부 JS 없는 단일 HTML입니다. 별도 `ads.js`를 두면 배포 단위와 캐시 무효화, `brand.test.js` 같은 단일 파일 가정이 새로 생깁니다.
- 근거 3: 실제 SDK는 어차피 벤더 CDN 스크립트(예: Poki `poki-sdk.js`)를 런타임에 주입합니다. 저장소에 둘 코드는 얇은 어댑터뿐이라 블록 안에 들어갑니다.
- 트레이드오프: index.html은 이미 약 4,580줄로 800줄 규칙을 넘습니다. 분할은 이 작업의 범위가 아니라서 언급만 합니다(Surgical).

## Global Constraints
- 수정 대상: `/Users/mac/fluxwing/index.html`. 새로 만들 파일: `tests/helpers/ads.js`, `tests/ads.test.js`
- 순수 블록은 `URLSearchParams`, `Promise`, `Math`, `Number` 외의 전역을 참조하지 않는다. `now`와 `wait`는 인자로 받는다
- 저장 키: `fw27_ads` = `{runs, lastAt}`
- `AD_CFG = { interEvery: 3, interGapMs: 180000, timeoutMs: 30000, stubMs: 3000 }` (stubMs 3000 = 지금 가짜 광고 길이)
- 보상형 결과 값은 `'granted' | 'skipped' | 'failed'`, 전면 결과 값은 `'shown' | 'failed'`. 그 밖의 값은 모두 `'failed'`로 본다
- `?ads=` 쿼리 override는 제공자가 stub이거나 localhost일 때만 허용한다(실제 SDK 배포에서 `?ads=ok`로 무료 보상을 받는 것을 차단)

## Review Focus
1. 광고 재생 중 보상 버튼 연타나 재시도 클릭 → 이중 지급 또는 상태 꼬임. 기대 동작: `adBusy` 동안 무시하고, `adClaim`이 같은 판·같은 지점의 두 번째 수령을 거부. (Task 1 테스트, Task 4 수동)
2. SDK가 응답하지 않음(Promise가 영원히 pending) → 이어하기 카운트다운이 멈춤. 기대 동작: `timeoutMs` 후 `'failed'`, 카운트다운 재개. (Task 2 테스트)
3. 어댑터의 `ready()`나 `rewarded()`가 예외를 던짐 → 기대 동작: 버튼 숨김, 게임은 계속. (Task 2 테스트)
4. 기기 시계가 과거로 감 → 전면 광고가 영원히 막히거나 연속 노출. 기대 동작: 미래 시각의 `lastAt`은 now로 당겨, 최대 한 간격만 대기. (Task 1 테스트)
5. `fw27_ads` 손상이나 조작(`{runs:'x', lastAt:-5}`, 배열, null) → 기대 동작: 새로 설치한 상태로 정규화. (Task 1 테스트)

---

### Task 1: 순수 페이싱·보상 규칙 블록

**Files:**
- Modify: `index.html`, `/* hit-loop:end */`(약 977행)바로 다음에 ads 블록 1부 삽입
- Create: `tests/helpers/ads.js`, `tests/ads.test.js`

**Interfaces:**
- Produces: `AD_CFG`, `adNorm(raw, now) → {runs, lastAt}`, `adRunDone(st) → st`, `adInterShown(st, now) → st`, `adInterDue(st, now, {mode, rewarded}) → boolean`, `adCoinBonus(fieldCoin, scoreCoin) → number`, `adDailyBonus(rw|null) → {coin,dia,gem}|null`, `adClaim(claimed, place) → claimed|null`, `adOffers(ready, run) → {revive, coin2x, daily2x}`. 여기서 `run = {coinBonus, dailyBonus, claimed}`

- [ ] **Step 1: 로더 작성** `tests/helpers/ads.js`
```js
import { readIndex } from './hitloop.js';
export function loadAds(html = readIndex()) {
  const m = html.match(/\/\* ads:start[\s\S]*?\/\* ads:end \*\//);
  if (!m) throw new Error('ads block not found in index.html');
  return new Function(`${m[0]}\nreturn {AD_CFG, AD_STUB_MODES, adNorm, adRunDone, adInterShown, adInterDue, adCoinBonus, adDailyBonus, adClaim, adOffers, adStub, adGuard, adPick};`)();
}
```
- [ ] **Step 2: 실패하는 테스트 작성** `tests/ads.test.js` (1부)
```js
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadAds } from './helpers/ads.js';
const A = loadAds();
const NOW = 1_800_000_000_000, GAP = A.AD_CFG.interGapMs;

test('broken or tampered pacing data reads as a fresh install', () => {
  for (const raw of [null, undefined, 7, 'x', [], { runs: 'x', lastAt: -5 }, { runs: -3, lastAt: NaN }])
    assert.deepEqual(A.adNorm(raw, NOW), { runs: 0, lastAt: 0 });
  assert.deepEqual(A.adNorm({ runs: 2.9, lastAt: NOW - 10 }, NOW), { runs: 2, lastAt: NOW - 10 });
});
test('a lastAt in the future (clock moved back) is pulled to now', () => {
  assert.equal(A.adNorm({ runs: 5, lastAt: NOW + 9e9 }, NOW).lastAt, NOW);
});
test('interstitial: at most one per 3 runs and never inside the gap', () => {
  const ctx = { mode: 'endless', rewarded: false };
  let st = A.adNorm(null, NOW);
  st = A.adRunDone(A.adRunDone(st));
  assert.equal(A.adInterDue(st, NOW, ctx), false);           // 2 runs
  st = A.adRunDone(st);
  assert.equal(A.adInterDue(st, NOW, ctx), true);            // 3 runs, never shown
  st = A.adInterShown(st, NOW);
  assert.deepEqual(st, { runs: 0, lastAt: NOW });
  st = A.adRunDone(A.adRunDone(A.adRunDone(st)));
  assert.equal(A.adInterDue(st, NOW + GAP - 1, ctx), false); // 3 runs but inside the gap
  assert.equal(A.adInterDue(st, NOW + GAP, ctx), true);
});
test('no interstitial in versus or right after a rewarded ad', () => {
  const st = { runs: 9, lastAt: 0 };
  assert.equal(A.adInterDue(st, NOW, { mode: 'versus', rewarded: false }), false);
  assert.equal(A.adInterDue(st, NOW, { mode: 'daily', rewarded: true }), false);
});
test('pacing helpers return new objects', () => {
  const st = Object.freeze({ runs: 1, lastAt: 0 });
  assert.notEqual(A.adRunDone(st), st);
});
test('coin x2 pays the run income again; daily x2 the daily reward again', () => {
  assert.equal(A.adCoinBonus(120, 330), 450);
  assert.equal(A.adCoinBonus(-5, NaN), 0);
  assert.deepEqual(A.adDailyBonus({ coin: 350, dia: 100, gem: 2 }), { coin: 350, dia: 100, gem: 2 });
  assert.equal(A.adDailyBonus(null), null);
});
test('each placement can be claimed once per run', () => {
  const c1 = A.adClaim({}, 'coin2x');
  assert.deepEqual(c1, { coin2x: true });
  assert.equal(A.adClaim(c1, 'coin2x'), null);
  assert.deepEqual(A.adClaim(c1, 'daily2x'), { coin2x: true, daily2x: true });
});
test('offers hide everything when no ad is ready, and anything already claimed or worth 0', () => {
  const run = { coinBonus: 10, dailyBonus: { coin: 1, dia: 0, gem: 0 }, claimed: {} };
  assert.deepEqual(A.adOffers(false, run), { revive: false, coin2x: false, daily2x: false });
  assert.deepEqual(A.adOffers(true, run), { revive: true, coin2x: true, daily2x: true });
  assert.deepEqual(A.adOffers(true, { coinBonus: 0, dailyBonus: null, claimed: {} }), { revive: true, coin2x: false, daily2x: false });
  assert.equal(A.adOffers(true, { ...run, claimed: { coin2x: true } }).coin2x, false);
});
```
- [ ] **Step 3: 실패 확인.** `node --test tests/ads.test.js` → FAIL "ads block not found in index.html"
- [ ] **Step 4: 최소 구현.** index.html, hit-loop:end 바로 아래
```js
/* ads:start — rewarded / interstitial rules and the ad-provider adapters: pure, no DOM, no storage, no clock of its own (now and wait come in). tests/ads.test.js runs this block as it stands (tests/helpers/ads.js). */
const AD_CFG = Object.freeze({ interEvery: 3, interGapMs: 180000, timeoutMs: 30000, stubMs: 3000 });
const AD_STUB_MODES = Object.freeze(['ok', 'fail', 'skip', 'none']);
const adInt = (v, max) => { const n = Math.floor(Number(v)); return Number.isFinite(n) && n > 0 ? Math.min(n, max) : 0; };
// saved pacing {runs: finished runs since the last interstitial, lastAt: when it ran (ms)}. Junk reads as a fresh install; a lastAt in the future (clock moved back) is pulled to now
function adNorm(raw, now){ const r = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}; return { runs: adInt(r.runs, 999), lastAt: Math.min(adInt(r.lastAt, 1e15), now) }; }
const adRunDone = st => ({ ...st, runs: Math.min(999, st.runs + 1) });
const adInterShown = (st, now) => ({ ...st, runs: 0, lastAt: now });
const adInterDue = (st, now, ctx) => ctx.mode !== 'versus' && !ctx.rewarded && st.runs >= AD_CFG.interEvery && now - st.lastAt >= AD_CFG.interGapMs;
const adCoinBonus = (field, sc) => adInt(field, 1e12) + adInt(sc, 1e12);   // the run's own income (field + score coins, unit multiplier included); level-up, clear and daily coins are not doubled
const adDailyBonus = rw => rw ? { coin: adInt(rw.coin, 1e12), dia: adInt(rw.dia, 1e12), gem: adInt(rw.gem, 1e9) } : null;
const adClaim = (claimed, place) => claimed[place] ? null : { ...claimed, [place]: true };
const adOffers = (ready, run) => ({ revive: !!ready, coin2x: !!ready && run.coinBonus > 0 && !run.claimed.coin2x, daily2x: !!ready && !!run.dailyBonus && !run.claimed.daily2x });
/* ads:end */
```
(Task 2가 `adStub/adGuard/adPick`을 같은 블록에 추가하기 전까지 로더 return에서 그 세 이름이 ReferenceError를 냅니다. Task 1에서는 로더 return에 세 이름 대신 임시로 `adStub: null, adGuard: null, adPick: null`을 넣거나, Task 1과 Task 2를 한 커밋으로 묶으세요.)
- [ ] **Step 5: 통과 확인.** `node --test tests/ads.test.js` → PASS, `npm test` → 0 failures
- [ ] **Step 6: 커밋.** `git commit -m "feat: ad pacing and reward rules as a pure block"`

**Acceptance:** `node --test tests/ads.test.js` 0 failures. 블록이 `W`, `store`, `$`, `Date`, `setTimeout`을 참조하지 않음(`grep`으로 확인).

---

### Task 2: 어댑터 계약, stub, 가드, 선택기

**Files:** Modify `index.html` (ads 블록, `/* ads:end */` 앞) · Test `tests/ads.test.js` (2부)

**Interfaces:**
- Adapter 계약: `{ name: string, ready(): boolean, rewarded(place): Promise<'granted'|'skipped'|'failed'>, interstitial(): Promise<'shown'|'failed'> }`
- Produces: `adStub({mode, wait, ms}) → Adapter`, `adGuard(adapter, wait, ms) → Adapter` (예외·타임아웃·이상한 반환 값 → `'failed'`, `ready()` 예외 → false), `adPick(search, host, cfg) → {prov, mode}`

- [ ] **Step 1: 실패하는 테스트 작성**
```js
const tick = () => new Promise(r => setTimeout(r, 0));
test('the stub answers by its mode', async () => {
  const mk = mode => A.adStub({ mode, wait: tick, ms: 1 });
  assert.equal(await mk('ok').rewarded('revive'), 'granted');
  assert.equal(await mk('skip').rewarded('revive'), 'skipped');
  assert.equal(await mk('fail').rewarded('revive'), 'failed');
  assert.equal(mk('none').ready(), false);
  assert.equal(mk('ok').ready(), true);
  assert.equal(await mk('ok').interstitial(), 'shown');
  assert.equal(await mk('fail').interstitial(), 'failed');
});
test('the guard turns a hang, a throw or junk into failed', async () => {
  const hang = { name: 'hang', ready: () => true, rewarded: () => new Promise(() => {}), interstitial: () => new Promise(() => {}) };
  const boom = { name: 'boom', ready: () => { throw new Error('x'); }, rewarded: () => { throw new Error('x'); }, interstitial: async () => { throw new Error('x'); } };
  const junk = { name: 'junk', ready: () => 1, rewarded: async () => 'yes', interstitial: async () => 42 };
  const g = a => A.adGuard(a, tick, 5);
  assert.equal(await g(hang).rewarded('coin2x'), 'failed');
  assert.equal(await g(hang).interstitial(), 'failed');
  assert.equal(g(boom).ready(), false);
  assert.equal(await g(boom).rewarded('coin2x'), 'failed');
  assert.equal(await g(boom).interstitial(), 'failed');
  assert.equal(await g(junk).rewarded('coin2x'), 'failed');
  assert.equal(await g(junk).interstitial(), 'failed');
  assert.equal(g(junk).ready(), true);
});
test('?ads= picks a stub mode only where the stub is the provider or on localhost', () => {
  assert.deepEqual(A.adPick('', 'breton5797.github.io', undefined), { prov: 'stub', mode: 'ok' });
  assert.deepEqual(A.adPick('?ads=fail', 'breton5797.github.io', 'stub'), { prov: 'stub', mode: 'fail' });
  assert.deepEqual(A.adPick('?ads=ok', 'breton5797.github.io', 'poki'), { prov: 'poki', mode: '' });
  assert.deepEqual(A.adPick('?ads=none', 'localhost', 'poki'), { prov: 'stub', mode: 'none' });
  assert.deepEqual(A.adPick('?ads=hack', 'localhost', 'stub'), { prov: 'stub', mode: 'ok' });
});
```
- [ ] **Step 2: 실패 확인.** → FAIL "A.adStub is not a function"(또는 ReferenceError)
- [ ] **Step 3: 구현** (ads 블록, `/* ads:end */` 바로 위)
```js
// An adapter: {name, ready() sync (the UI asks while it draws), rewarded(place) -> 'granted'|'skipped'|'failed', interstitial() -> 'shown'|'failed'}. The stub stands in until a provider (Poki / CrazyGames / AdSense H5) gets its own adapter with the same shape
function adStub(o){
  const mode = AD_STUB_MODES.includes(o.mode) ? o.mode : 'ok', ms = o.ms == null ? AD_CFG.stubMs : o.ms;
  return { name: 'stub:' + mode, ready: () => mode !== 'none',
    rewarded: async () => { if (mode === 'none') return 'failed'; await o.wait(ms); return mode === 'ok' ? 'granted' : mode === 'skip' ? 'skipped' : 'failed'; },
    interstitial: async () => { if (mode === 'none' || mode === 'fail') return 'failed'; await o.wait(ms); return 'shown'; } };
}
const AD_RW = ['granted', 'skipped', 'failed'], AD_IN = ['shown', 'failed'];
// Any adapter as the game sees it: a throw, an answer outside the list or no answer within ms is a failure, so a broken provider only hides buttons
function adGuard(a, wait, ms){
  const safe = (f, ok) => async (...x) => { try { const r = await Promise.race([Promise.resolve().then(() => f(...x)), wait(ms).then(() => 'failed')]); return ok.includes(r) ? r : 'failed'; } catch (e){ return 'failed'; } };
  return { name: a.name, ready: () => { try { return !!a.ready(); } catch (e){ return false; } }, rewarded: safe(a.rewarded, AD_RW), interstitial: safe(a.interstitial, AD_IN) };
}
// cfg: FW_CONFIG.ads ('stub' or, later, a provider name). ?ads=ok|fail|skip|none picks the stub's answer, but only where the stub is the provider or on localhost: on a real provider it would hand out free rewards
function adPick(search, host, cfg){
  const q = new URLSearchParams(search).get('ads'), prov = typeof cfg === 'string' && cfg ? cfg : 'stub', local = /^(localhost|127\.0\.0\.1)$/.test(host);
  if (AD_STUB_MODES.includes(q) && (prov === 'stub' || local)) return { prov: 'stub', mode: q };
  return prov === 'stub' ? { prov: 'stub', mode: 'ok' } : { prov, mode: '' };
}
```
- [ ] **Step 4: 통과 확인.** `node --test tests/ads.test.js` → PASS, `npm test` → 0 failures
- [ ] **Step 5: 커밋.** `git commit -m "feat: ad provider adapter contract with stub, guard and picker"`

**Acceptance:** Review Focus 2·3번 테스트 통과. 실제 SDK 이름(`poki` 등)을 넘겨도 예외 없이 `{prov, mode:''}`를 반환.

---

### Task 3: 런타임 어댑터 인스턴스와 이어하기(무료 리바이브) 연결

**Files:** Modify `index.html`
- ads 블록 아래에 런타임 상태 추가
- `openCont`/`closeCont`/`#contAd` 핸들러 (약 1691-1720행)
- `window.FW_CONFIG`(약 532행)는 수정하지 않음. `ads` 필드가 없으면 기본값 stub

**Interfaces:**
- Consumes: Task 2의 `adStub`, `adGuard`, `adPick`, `AD_CFG`
- Produces: `ADS` (guarded adapter), `adBusy` (boolean), `runAd(place) → Promise<'granted'|'skipped'|'failed'>`, i18n 키 `adFail`

- [ ] **Step 1: 런타임 배선** (ads:end 바로 아래, 블록 밖)
```js
const adWait = ms => new Promise(r => setTimeout(r, ms));
const ADS = (() => { const p = adPick(location.search, location.hostname, (window.FW_CONFIG || {}).ads); return adGuard(p.prov === 'stub' ? adStub({ mode: p.mode, wait: adWait }) : adStub({ mode: 'none', wait: adWait }), adWait, AD_CFG.timeoutMs); })();   // a provider without an adapter yet = no ads
let adBusy = false;
async function runAd(place){ if (adBusy) return 'failed'; adBusy = true; try { return await ADS.rewarded(place); } finally { adBusy = false; } }
```
- [ ] **Step 2: 이어하기 수정** (지금 `adTimer`가 하는 일을 `adBusy`로 교체)
  - `openCont`: `$('contAd').hidden = !adOffers(ADS.ready(), {coinBonus:0, dailyBonus:null, claimed:{}}).revive; $('contAd').disabled = false;`
  - `tick`: `if (state !== 'cont' || adBusy) return;` (광고 중에는 카운트다운 정지, 기존 동작과 같음)
  - `closeCont`: `clearInterval(adTimer); adTimer = 0;` 줄 삭제(`adTimer` 변수와 함께, 이번 변경으로 생긴 고아 정리)
  - `#contAd` 핸들러:
```js
$('contAd').addEventListener('click', async e => {
  e.stopPropagation(); if (adBusy) return; audioInit(); $('contAd').disabled = true; $('contCoin').disabled = true;
  $('contAdMsg').hidden = false; $('contAdMsg').textContent = t('adPlaying');
  const r = await runAd('revive');
  if (state !== 'cont') return;
  if (r === 'granted'){ FX.adSeen = true; closeCont(true); return; }
  $('contAdMsg').textContent = t('adFail'); $('contAd').hidden = true; $('contCoin').disabled = W.coins < CONT_COST;   // the coin continue and the countdown carry on
});
```
  - `FX.adSeen`: `newFx()`(약 1104행)에 `adSeen:false` 추가. 이어하기를 거쳐도 유지됨(FX는 continue 때 초기화되지 않음, 1115행 주석 참조). Task 5의 "보상형 본 판" 판정에 씀
  - i18n: key 기반 추가 블록(약 731행 이후)의 ko·en에 `adFail` 추가. ko '지금은 광고를 볼 수 없어요', en 'No ad available right now'
- [ ] **Step 3: 수동 검증** (`npm run dev`)
  - `http://localhost:<port>/?ads=ok#dev`: 점수 3 이상에서 사망 → 광고 버튼 → 약 3초 뒤 부활, 같은 판 두 번째 사망에는 이어하기 화면 없음
  - `?ads=fail#dev`: 실패 안내, 광고 버튼 숨김, 코인 버튼 사용 가능, 카운트다운 재개 → 0에서 결과 카드
  - `?ads=none#dev`: 광고 버튼이 처음부터 숨김
  - `?ads=skip#dev`: 실패와 같은 처리
- [ ] **Step 4: 회귀.** `npm test` → 0 failures. 콘솔에서 `FW.selfTest()` → 실패 0
- [ ] **Step 5: 커밋.** `git commit -m "feat: continue screen asks the ad adapter and hides the ad button when none is ready"`

**Acceptance:** 위 4개 모드의 수동 결과가 기대와 일치. 코인 이어하기(200)와 `canContinue` 조건 diff 0줄.

---

### Task 4: 결과 카드 "코인 2배" / "데일리 보상 2배"

**Files:** Modify `index.html`
- 마크업: `#oRewards`(약 415행) 다음에 버튼 2개
- `showOver` 보상 구간(약 1752-1768행)
- i18n ko·en

**Interfaces:**
- Consumes: `adCoinBonus`, `adDailyBonus`, `adClaim`, `adOffers`, `runAd`, `ADS`
- Produces: 런 단위 상태 `adRun = {coinBonus, dailyBonus, claimed}` (`showOver`에서 새로 만듦), 함수 `renderAdOffers()`

- [ ] **Step 1: 마크업**
```html
<button class="ghost primary" id="oAd2x" hidden></button>
<button class="ghost primary" id="oAdDaily" hidden></button>
```
- [ ] **Step 2: showOver 연결.** `W.coins += fieldCoin + scoreCoin; …saveW();` 줄 바로 다음
```js
adRun = { coinBonus: adCoinBonus(fieldCoin, scoreCoin), dailyBonus: dCoin ? adDailyBonus(dailyReward(dStreak)) : null, claimed: {} };
renderAdOffers();
```
  - 파일 상단 run 상태 근처에 `let adRun = { coinBonus: 0, dailyBonus: null, claimed: {} };` 선언
  - `dailyReward(dStreak)`는 1760행에서 실제 지급에 쓴 값과 같은 호출임(순수 함수라 값 동일)
- [ ] **Step 3: 렌더·클릭**
```js
function renderAdOffers(){
  const of = adOffers(ADS.ready(), adRun);
  $('oAd2x').hidden = !of.coin2x; $('oAd2x').disabled = false; $('oAd2x').textContent = t('ad2x', { n: adRun.coinBonus.toLocaleString() });
  $('oAdDaily').hidden = !of.daily2x; $('oAdDaily').disabled = false; $('oAdDaily').textContent = t('adDaily2x');
}
async function claimAd(place, btn, pay){
  if (adBusy || state !== 'over') return; btn.disabled = true;
  const r = await runAd(place), next = r === 'granted' ? adClaim(adRun.claimed, place) : null;
  if (state !== 'over') return;
  if (next){ adRun = { ...adRun, claimed: next }; FX.adSeen = true; pay(); saveW(); renderWallet(); }
  else $('oWhy').textContent = t('adFail');
  btn.hidden = true;   // granted or not, the offer is gone for this run
}
$('oAd2x').addEventListener('click', e => { e.stopPropagation(); claimAd('coin2x', $('oAd2x'), () => { W.coins += adRun.coinBonus; }); });
$('oAdDaily').addEventListener('click', e => { e.stopPropagation(); const b = adRun.dailyBonus; claimAd('daily2x', $('oAdDaily'), () => { W.coins += b.coin; W.dia += b.dia; W.gems += b.gem; }); });
```
  - `W`를 제자리에서 바꾸는 방식은 기존 지갑 코드 관례(`index.html:1760-1762`)를 따른 것(Surgical, 기존 스타일 유지)
- [ ] **Step 4: i18n (ko/en).** `ad2x`: '광고 보고 코인 2배 (+{n})' / 'Watch an ad: coins x2 (+{n})'. `adDaily2x`: '광고 보고 데일리 보상 2배' / 'Watch an ad: daily reward x2'
- [ ] **Step 5: 수동 검증**
  - `?ads=ok#dev`, 스테이지 런 종료 → 콘솔 `FW.W.coins` 기록 → 2배 클릭 → 약 3초 뒤 정확히 `+coinBonus`, 버튼 사라짐, 빠른 연타에도 한 번만 지급
  - 그 UTC 날 첫 데일리 런 → 데일리 2배 버튼 보이고 coin/dia/gem 각각 증가. 같은 날 두 번째 데일리 런에서는 데일리 2배 버튼 없음
  - `coinBonus`가 0인 런(점수 0, 오브 0) → 코인 2배 버튼 없음
  - `?ads=none` → 두 버튼 모두 없음
  - 광고 재생 중 재시도 클릭 → 새 판 시작 후 보상이 지급되지 않음(`state !== 'over'` 가드)
- [ ] **Step 6: 회귀·커밋.** `npm test` 0 failures → `git commit -m "feat: result card offers ad doubles for run coins and the daily reward"`

**Acceptance:** 지급액이 `adCoinBonus` / `adDailyBonus`와 정확히 같음. 판당 지점별 최대 1회. 광고가 없으면 결과 카드 레이아웃이 지금과 같음.

---

### Task 5: 전면 광고 페이싱 연결과 저장

**Files:** Modify `index.html`
- `showOver` 시작부
- `retryBtn` / `menuBtn` 핸들러 (약 1432-1433행)

**Interfaces:**
- Consumes: `adNorm`, `adRunDone`, `adInterDue`, `adInterShown`, `ADS`, `adBusy`, `FX.adSeen`
- Produces: localStorage `fw27_ads`

- [ ] **Step 1: 런 카운트.** `showOver` 시작부(`state = 'over'` 다음)
```js
if (mode !== 'versus') store.set('fw27_ads', adRunDone(adNorm(store.get('fw27_ads', null), Date.now())));
```
- [ ] **Step 2: 결과 카드를 떠날 때 노출** [from-user Q3]
```js
async function adLeave(go){
  if (adBusy) return; const now = Date.now(), st = adNorm(store.get('fw27_ads', null), now);
  if (adInterDue(st, now, { mode, rewarded: FX.adSeen }) && ADS.ready()){
    adBusy = true; let r; try { r = await ADS.interstitial(); } finally { adBusy = false; }
    if (r === 'shown') store.set('fw27_ads', adInterShown(st, Date.now()));
  }
  go();
}
$('retryBtn').addEventListener('click', e => { e.stopPropagation(); audioInit(); adLeave(() => { if (mode === 'versus'){ toMenu(); openVs(); } else startGame(mode); }); });
$('menuBtn').addEventListener('click', e => { e.stopPropagation(); adLeave(toMenu); });
```
  - 기존 두 줄(1432-1433)을 위 내용으로 교체
  - 전면 광고 실패 시 카운터를 초기화하지 않음. 다음 판에 다시 시도함
- [ ] **Step 3: 수동 검증**
  - `?ads=ok#dev`에서 `localStorage.removeItem('fw27_ads')` → 1·2판 뒤 재시도는 즉시 시작, 3판 뒤 재시도는 약 3초 전면 광고 후 시작
  - 이어서 4·5·6판(180초 이내) → 노출 없음
  - 3판째에 2배 광고를 본 경우 → 그 판 퇴장 시 노출 없음
  - versus 결과 → 카운트·노출 없음
  - `?ads=fail` → 노출 없이 즉시 진행
- [ ] **Step 4: 전체 회귀**
  - `npm test` → 0 failures
  - `FW.selfTest()` → 실패 0
  - 콘솔 에러 0 (Playwright `browser_console_messages`)
- [ ] **Step 5: 커밋.** `git commit -m "feat: capped interstitial when leaving the result card"`

**Acceptance:** AC5 충족. 재시도·메뉴 연타 시 판이 두 번 시작되지 않음(`adBusy` 가드).

---

## 의존성
- Task 1 → Task 2 (같은 블록, 로더 return 이름 공유) → Task 3 (`ADS`, `runAd`) → Task 4 (`runAd`, `FX.adSeen`) → Task 5 (`FX.adSeen`, `adBusy`)
- 외부 의존성: 없음 (새 npm 패키지 없음, Supabase 변경 없음)
- 2단계(별도 계획): SDK 확정 → `adPoki`/`adCrazy`/`adH5` 중 하나를 같은 계약으로 추가 → `FW_CONFIG.ads` 설정 → 벤더 스크립트 동적 주입, 광고 중 오디오 음소거, gameplayStart/Stop 훅

## 리스크
- **MEDIUM: 경제 인플레이션.** stub `ok`가 실서비스 기본값이면 2배 보상이 사실상 무료입니다. [from-user Q2] 사용자가 수용: 상점도 이미 테스트 빌드로 즉시 지급 중이라 1단계에서는 같은 수준.
- **MEDIUM: 이어하기 회귀.** `adTimer`를 제거하면서 카운트다운 정지 로직이 바뀝니다. 완화: Task 3 Step 3의 4개 모드 수동 검증, `canContinue`·`CONT_COST` diff 0 확인.
- **LOW: 비동기 경쟁.** 광고 중 상태 전환이 일어날 수 있습니다. 완화: `adBusy`, `state` 재확인, `adClaim` 1회 보장.
- **LOW: 블록 독립성 깨짐.** ads 블록이 외부 식별자를 참조하면 `new Function` 로더에서 ReferenceError가 나서 테스트가 바로 실패합니다. 즉 테스트가 이 가드 역할을 합니다.
- **LOW: 결과 카드 혼잡.** 데일리 모드 첫 런에는 버튼이 2개 더 보입니다. 완화: 화면 폭 379px 이하에서 수동 확인. 문제가 되면 데일리 2배만 노출하는 쪽으로 조정합니다(사용자 확인 필요).
- **참고:** index.html은 약 4,580줄로 800줄 규칙을 넘습니다. 이번 작업에서는 분할하지 않습니다.

## 복잡도 추정
- **MEDIUM.** 실서비스 파일 1개(index.html의 약 6곳: 블록 1개, 런타임 배선, 이어하기, 결과 카드 마크업과 로직, 재시도/메뉴, i18n)와 새 테스트 파일 2개
- 추정 변경량: index.html +80~110줄, 테스트 +120줄. 5개 Task, 각각 반나절 이내

## Sprint Contract
1. [ ] `node --test tests/ads.test.js` → 0 failures (Review Focus 5개 포함)
2. [ ] `npm test` → 0 failures
3. [ ] `#dev` 콘솔 `FW.selfTest()` → 실패 0
4. [ ] `?ads=ok`: 이어하기 광고 → 부활 1회
5. [ ] `?ads=ok`: 코인 2배 → `FW.W.coins` 증가분 == `coinBonus`, 연타해도 1회
6. [ ] `?ads=ok`: 그날 첫 데일리 런 → 데일리 2배로 coin/dia/gem 증가분 == `dailyReward(streak)`
7. [ ] `?ads=none` / `?ads=fail`: `#contAd`, `#oAd2x`, `#oAdDaily` 숨김(또는 실패 후 숨김), 진행 정상
8. [ ] 전면 광고: 3판 미만 또는 180초 이내에는 노출 0회, 조건 충족 시 1회
9. [ ] 실서비스 호스트에서 `?ads=ok`에 provider≠stub이면 무시(테스트로 확인)

### 품질 기준
- code-reviewer: APPROVE (CRITICAL/HIGH 0)
- verify-agent: PASS

## Success Criteria
- [ ] 보상형 광고 3지점(이어하기, 코인 2배, 데일리 2배)과 상한이 걸린 전면 광고가 stub 어댑터로 동작
- [ ] 어댑터를 바꿔 끼우는 데 필요한 변경이 "새 adapter 함수 + FW_CONFIG.ads" 두 곳으로 한정
- [ ] 광고 불가 시 모든 광고 UI가 숨겨지고 기존 흐름은 그대로
