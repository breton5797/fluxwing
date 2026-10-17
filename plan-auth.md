---
status: APPROVED   # [from-user] "계획 나오면 추천방향으로 계속 진행해" (2026-10-17)
created: 2026-10-17
decisions:
  - "[from-user] 로그인 보상 = 전체 클라우드 세이브 동기화(코인/기체/진행). 계정당 1행, 기기 간 동기화"
  - "[from-user] 이메일 = 매직링크(signInWithOtp). 비밀번호 없음"
  - "[from-user] Apple = 버튼 + signInWithOAuth/linkIdentity({provider:'apple'}) 코드 경로까지 구현, FW_CONFIG.auth.apple=false로 숨김. Google·이메일은 즉시 활성"
  - "[from-user] 기존 익명 사용자는 linkIdentity()/updateUser({email})로 제자리 승격(auth.uid() 유지). identity가 이미 다른 계정 소속이면 그 계정으로 로그인 + 1회 로컬 병합 제안"
  - "[from-claude] Q1 코인: 같은 기기 재동기화 = 3-way 차분 remote+(local-base) (0 미만 0). 이 기기 첫 병합 = 합산(coins/dia/gems), XP는 max. 경제는 지금도 기기 신뢰(schema.sql 주석)라 합산이 새 악용면을 만들지 않음"
  - "[from-claude] Q2 로그아웃 = FS_KEYS 등 기기 진행 삭제 후 reload(새 익명). 이유: 남기면 다음 로그인 계정에 다른 사람 진행이 병합됨"
  - "[from-claude] Q3 identity 충돌: 기존 계정으로 로그인 → 서버 세이브와 기기 진행이 다 있으면 [합치기(권장)] / [계정 진행만] 선택. 이전 익명 uid의 RP·시즌 기록은 이전하지 않음(한계로 명시). best는 세이브 병합 후 syncLocal()이 재제출"
  - "[from-claude] Q4 적용 = localStorage 기록 + location.reload(), state==='menu'이고 오버레이가 없을 때만. 게임이 부팅 때 저장을 한 번만 읽기 때문(W/owned/stg/best 등이 IIFE 곳곳에 흩어짐)"
  - "[from-claude] Q5 flowType 'implicit' + detectSessionInUrl true + 6자리 OTP 입력 병행. PWA standalone/메일 앱 웹뷰에서 링크가 다른 저장소로 열려도 코드로 로그인 가능"
  - "[from-claude] Q6 RLS 직접 upsert 대신 public.save_get/save_put(invoker) → private.fw_save_*(definer) RPC. rev CAS, 익명 거부(auth.users.is_anonymous), 16KB 상한을 한 곳에서. 기존 submit_score 패턴과 동일"
  - "[from-claude] Q7 익명 사용자는 클라우드 행 없음(서버가 fw_save_anon 거부)"
  - "[from-claude] Q8 포털 빌드(FW_CONFIG.ads가 'stub' 이외)에서는 로그인 UI 숨김 — 판정(포털은 외부 로그인 리다이렉트를 허용하지 않을 가능성이 큼). 리더보드용 익명 로그인은 그대로"
  - "[from-claude] Q9 서버는 경제 수치를 검증하지 않음(형식/크기/rev만). 서버 보유 인벤토리는 범위 밖"
  - "[from-claude] 진입점 = 리더보드 카드의 닉네임 줄 아래 계정 줄 1개(정체성이 있는 곳, 플레이 중엔 안 보임)"
ambiguity:
  goal_clarity: 0.9
  constraint_clarity: 0.85
  success_criteria: 0.85
  context_clarity: 0.85
  total_ambiguity: 0.13
  threshold: 0.20
restate: "Supabase 익명 플레이어를 Google/이메일 코드(Apple은 설정 뒤 활성)로 같은 uid 그대로 정식 계정으로 승격하고, FS_KEYS로 정의한 기기 진행을 계정당 1행(public.fw_saves, rev CAS)에 저장해 로그인·부팅 때 3-way 규칙으로 병합하고 메뉴에서만 push·적용하며, 포털 빌드에서는 로그인 UI를 숨긴다."
acceptance_criteria:
  - id: AC1
    desc: "fsNorm/fsSnap/fsWrites/fsMerge/fsPlan 단위 테스트 통과, 모든 fw27_ 저장 키가 FS_KEYS 또는 FS_LOCAL로 분류됨"
    verifier: "node --test tests/cloud.test.js → 0 failures"
  - id: AC2
    desc: "schema.sql에 fw_saves(RLS on, 정책 0), save_get/save_put 권한, 16KB 상한이 FS_CFG.maxBytes와 일치"
    verifier: "node --test tests/cloud-sql.test.js → 0 failures + SQL Editor 스모크(Task 2 Step 6)"
  - id: AC3
    desc: "익명 → Google 연동 후 auth.users의 같은 id에서 is_anonymous=false, fw_scores/fw_versus 행 유지"
    verifier: "수동 QA + SQL: select id, is_anonymous from auth.users where id='<연동 전 uid>'"
  - id: AC4
    desc: "익명 → 이메일 코드 연동도 같은 uid 유지. 이미 있는 이메일이면 그 계정으로 로그인 + 병합 선택"
    verifier: "수동 QA (Task 5 체크리스트)"
  - id: AC5
    desc: "기기 A에서 번 코인·산 기체가 기기 B 로그인 후 반영되고, 양쪽 변경이 3-way로 합쳐짐(손실/중복 없음)"
    verifier: "수동 QA 2기기 + fsMerge 단위 테스트"
  - id: AC6
    desc: "포털 빌드/Supabase 미설정/앱 내장 브라우저(Google 숨김)/Apple 미설정에서 숨김 규칙대로, Uncaught 0"
    verifier: "authUi 단위 테스트 + npm run build:portal -- poki 수동"
  - id: AC7
    desc: "기존 테스트 전체 회귀 없음, FW.selfTest() 실패 0"
    verifier: "npm test → 0 failures"
constraints:
  - "[from-code] 실서비스 파일은 루트 index.html 하나. src/, v2.html 수정 금지"
  - "[from-code] 순수 로직은 cloud 블록 안. window/document/localStorage/sessionStorage/setTimeout/Date/store/$ 참조 금지(get/set 함수는 인자로 주입)"
  - "[from-code] Supabase SDK는 기존 SRI 고정 2.117.2 그대로. 새 npm 의존성 없음"
  - "[from-user] node:test, TDD RED→GREEN 태스크마다"
  - "[from-code] 새 UI 문자열은 I18N_N의 ko+en 필수(나머지 언어는 en 대체, index.html:838)"
  - "[from-claude] 브랜치 feat/account-login에서 작업, 5개 태스크 끝난 뒤 PR 하나로 머지. Task 2 SQL은 PR 머지 전에 운영 DB에 적용(추가만 하므로 안전)"
  - "Surgical: 리더보드/versus/광고/경제 공식 불변. 기존 줄 수정은 플랜에 적힌 곳만"
out_of_scope:
  - "서버 보유 인벤토리/경제 서버 검증"
  - "익명 uid 간 RP·시즌 기록 병합 RPC"
  - "계정 삭제 UI, 이메일 변경, 여러 identity 관리 화면"
  - "CAPTCHA, 포털(CrazyGames/Poki) 계정 SDK 연동"
  - "같은 기기 여러 탭의 동시 저장(현재도 존재하는 동작)"
  - "index.html 분할"
---

# 계정 로그인(Google / Apple / 이메일 코드) + 클라우드 세이브 동기화 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 익명 플레이어를 같은 uid 그대로 정식 계정으로 승격하고, 기기 진행을 계정에 저장·병합해 여러 기기에서 이어서 플레이하게 한다.

**Architecture:** 비유하면 "은행 통장 + 거래 장부"다. 서버(fw_saves)는 통장 한 권(rev = 통장 쪽수)이고, 각 기기는 마지막으로 맞춘 쪽(base)을 기억한다. 맞출 때 "기기에서 base 이후 늘어난 만큼 + 서버 현재 잔액"으로 합치고(3-way), 쪽수가 어긋나면(CAS 실패) 다시 읽고 합친다. 기술적으로는 index.html에 순수 블록 `cloud`(병합·URL·오류·버튼 규칙)를 두고, 런타임 코드는 Supabase auth(linkIdentity / updateUser / signInWithOtp / verifyOtp)와 RPC(save_get / save_put) 연결만 맡는다. 적용은 메뉴에서 localStorage에 쓰고 reload한다.

**Tech Stack:** 단일 index.html (vanilla JS), @supabase/supabase-js@2.117.2 UMD(SRI 고정, 지연 로드), Supabase Postgres 17 + Auth, node:test.

**Spec:** 이 문서의 frontmatter `decisions` / `constraints` (사용자 결정 4개 + 추천 Q1~Q9). 별도 spec 파일 없음.

## 사전 지식 (코드에서 확인한 사실)

- `store` = index.html:549-552 (`get(k,d)` JSON 파싱, 실패 시 d / `set(k,v)` JSON 저장, 예외 삼킴).
- 저장은 변경할 때마다 즉시 `store.set`(unload 훅 없음). `saveW()` = :860 → `fw27_wallet2`(W), `fw27_owned`, `fw27_pass`, `fw27_starter`.
- W = :846-851 `{xp 0..99, lvl ≥1, coins, dia, gems}`. owned 기본값 = `['volt','blitz','nimbus','titan']` (:852). stg = :1341-1351 `{gates[50], score[50], clr[50], open}` (`ST_N = 50`, :1318).
- 부팅 때 한 번만 읽는 값: B(:840), W, owned, hasPass/starterBought, best(:907), stg, curStage(:1353), nick(:1080), rp(:3945). 그래서 원격 세이브를 적용하려면 reload가 필요하다.
- Supabase: `FW_CONFIG` = :534, `loadSdk` = :3647, `createClient(..., {auth:{persistSession:true, autoRefreshToken:true, detectSessionInUrl:false}})` = :3726, `onAuthStateChange` = :3727-3731(SIGNED_OUT → `sbReauth()` = 새 익명 생성), `initSupabase` = :3722-3749, 부팅 = `online()`(:4710). 전역 `sb, backend, uid, myDoc` = :3630.
- RPC 오류 패턴: `vsRpc`(:3680), `sbAuthErr`(:3720). 오버레이 패턴: `seaScr`(:468-477), `confirmDlg`(:3506), `toast`(:3499), `lbOpen` 플래그.
- 리더보드 카드 `lbScr` :505-526, 닉네임 폼 `nickForm` :520-524. 메뉴 복귀 = `toMenu()` :1581-1584.
- 순수 블록 로딩: `tests/helpers/ads.js`(정규식으로 블록 추출 → `new Function`), `readIndex()`는 `tests/helpers/hitloop.js`.
- 포털 빌드: `scripts/portal-build.mjs`가 `'window.FW_CONFIG = { '` 바로 뒤에 `ads: '<prov>', `를 삽입한다. 그 줄은 정확히 1개여야 한다.
- 배포 URL: `https://breton5797.github.io/fluxwing/`, 개발: `http://localhost:5173` (`scripts/serve.mjs`). 매니페스트 `display: standalone`(PWA).

## Global Constraints

- 실서비스 파일 = `/Users/mac/fluxwing/index.html` 하나. `src/`, `v2.html` 수정 금지.
- 순수 로직은 `/* cloud:start … */ … /* cloud:end */` 블록 안에만 둔다. window/document/localStorage/sessionStorage/setTimeout/Date/store/$ 참조 금지.
- SDK 버전/SRI(`SDK_SRC`, `SDK_SRI` :3642-3643) 변경 금지. 새 npm 의존성 금지.
- 세이브 형식 버전 `v: 1`, 서버 상한 16384 bytes(`FS_CFG.maxBytes` = SQL `c_max_bytes`).
- 새 문자열은 `I18N_N`의 `ko`, `en` 둘 다에 추가.
- 커밋 형식 `<type>: <description>`, 브랜치 `feat/account-login`.
- 매 태스크 끝에 `npm test` → 0 failures.

## Review Focus

1. **새 fw27_ 키가 분류 없이 추가됨.** 누가 키를 새로 만들면 동기화에서 조용히 빠진다. index.html의 모든 `store.get/set('fw27_…` 키가 FS_KEYS ∪ FS_LOCAL에 있어야 한다. → Task 1 테스트 "every fw27_ key is classified".
2. **손상·조작·미래 버전 서버 데이터**(`v:2`, 배열, `__proto__`, 1e30 코인, 문자열 숫자). 게임이 깨지지 않고 null 또는 clamp되어야 하며, v 불일치면 아무것도 덮어쓰지 않는다. → Task 1 fsNorm 테스트, Task 4 `remote && !remote.data → return`.
3. **다른 계정 진행을 가진 기기**(세션 만료 → 익명 → 다른 계정 로그인). 이전 계정 진행을 새 계정에 넘기지 않는다. → Task 1 fsPlan 'pull' 테스트.
4. **런 도중 pull/충돌 결과 도착.** 메뉴로 돌아올 때까지 적용과 push를 보류해, saveW가 병합본을 되돌리지 않아야 한다. → Task 4 fsCanApply 테스트.
5. **OAuth 복귀 URL 변형**(`#dev`, `?c=` 챌린지 링크, `?error=…&error_code=identity_already_exists`, hash 안의 error, 토큰 hash). 오류만 걷어내고 다른 파라미터는 보존하며, 토큰 hash는 auth-js에 맡긴다. → Task 3 authUrl 테스트.

---

### Task 1: 세이브 병합 순수 블록 (cloud 블록 1부)

**Files:**
- Modify: `/Users/mac/fluxwing/index.html` — `/* ads:end */`(:1055) 바로 다음 줄에 cloud 블록 삽입
- Create: `/Users/mac/fluxwing/tests/helpers/cloud.js`
- Create: `/Users/mac/fluxwing/tests/cloud.test.js`

**Interfaces:**
- Consumes: 없음
- Produces (Task 3·4가 사용):
  - `FS_CFG = {v:1, maxBytes:16384, stN:50, owned0:['volt','blitz','nimbus','titan']}`
  - `FS_KEYS: string[]` (계정 동기화 키), `FS_LOCAL: string[]` (기기 전용, `_`로 끝나면 접두사)
  - `fsNorm(raw) → Save | null` / `fsSnap(get) → Save` / `fsWrites(save, get) → Array<[key, value]>`
  - `fsEmpty(save) → boolean` / `fsSame(a, b) → boolean`
  - `fsMerge(local, remote, base|null) → Save` (모두 fsNorm 결과를 넣는다)
  - `fsPlan(rec, uid, remote, local) → 'adopt'|'merge3'|'pull'|'ask'` — rec = `{uid, rev, base}|null`, remote = `{rev, data: Save}|null`
  - Save 형태: `{v, w:{xp,lvl,coins,dia,gems}, owned[], pass, starter, best, bestg, stg:{gates[50],score[50],clr[50],open}, stage, bird, nick, tut, rookie, ds:{last,streak}|null, dbonus, vsg[]}`

- [ ] **Step 1: 로더 helper 작성**

`tests/helpers/cloud.js`:
```js
// Loads the pure cloud-save / login rules out of index.html (the block between the cloud markers), like tests/helpers/ads.js.
import { readIndex } from './hitloop.js';

export function loadCloud(html = readIndex()) {
  const m = html.match(/\/\* cloud:start[\s\S]*?\/\* cloud:end \*\//);
  if (!m) throw new Error('cloud block not found in index.html');
  return new Function(`${m[0]}\nreturn {FS_CFG, FS_KEYS, FS_LOCAL, fsNorm, fsSnap, fsWrites, fsEmpty, fsSame, fsMerge, fsPlan};`)();
}
```

- [ ] **Step 2: 실패하는 테스트 작성**

`tests/cloud.test.js`:
```js
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readIndex } from './helpers/hitloop.js';
import { loadCloud } from './helpers/cloud.js';

const C = loadCloud(), html = readIndex();
const S = o => C.fsNorm({ v: 1, ...o });
const getOf = m => (k, d) => (Object.hasOwn(m, k) ? m[k] : d);
const UID = '11111111-1111-4111-8111-111111111111', OTHER = '22222222-2222-4222-8222-222222222222';

test('every fw27_ key index.html stores is classified as synced or device-only', () => {
  const keys = new Set([...html.matchAll(/store\.(?:get|set)\('(fw27_[a-z0-9_]+)/g)].map(m => m[1]));
  const local = k => C.FS_LOCAL.some(p => p.endsWith('_') ? k.startsWith(p) : k === p);
  for (const k of keys) assert.ok(C.FS_KEYS.includes(k) || local(k), `classify ${k} in FS_KEYS or FS_LOCAL`);
  for (const k of C.FS_KEYS) assert.ok(keys.has(k), `${k} is in FS_KEYS but index.html never stores it`);
  assert.equal(C.FS_KEYS.filter(k => local(k)).length, 0);
});

test('FS_CFG.stN follows ST_N', () => {
  assert.equal(C.FS_CFG.stN, Number(html.match(/const ST_N = (\d+)/)[1]));
});

test('fsNorm refuses non-objects and other versions, clamps the rest', () => {
  for (const raw of [null, 7, 'x', [], { v: 2 }, { v: '1' }]) assert.equal(C.fsNorm(raw), null);
  const s = C.fsNorm({ v: 1, w: { coins: 1e30, xp: 500, lvl: -3, dia: 'x', gems: 2.7 }, owned: ['zero', 'BAD', '__proto__', 7, 'zero'],
    best: -5, stg: { gates: [3, 'x'], clr: [5], open: 999 }, nick: 'x'.repeat(40), bird: '<b>', ds: { last: 'nope', streak: 3 }, vsg: ['202610:' + UID, 'junk'] });
  assert.deepEqual(s.w, { xp: 99, lvl: 1, coins: 1e12, dia: 0, gems: 2 });
  assert.deepEqual(s.owned, ['blitz', 'nimbus', 'titan', 'volt', 'zero']);   // starters always kept, sorted, unique
  assert.equal(s.best, 0); assert.equal(s.stg.gates.length, 50); assert.equal(s.stg.gates[0], 3); assert.equal(s.stg.clr[0], 1);
  assert.equal(s.stg.open, 49); assert.equal(s.nick.length, 14); assert.equal(s.bird, 'volt'); assert.equal(s.ds, null);
  assert.deepEqual(s.vsg, ['202610:' + UID]);
});

test('fsSnap reads the game keys with the game defaults; fsWrites writes every synced key once and keeps pending claims', () => {
  const fresh = C.fsSnap(getOf({}));
  assert.ok(C.fsEmpty(fresh));
  const m = { fw27_wallet2: { coins: 500, lvl: 3, xp: 40, dia: 2, gems: 1 }, fw27_owned: ['volt', 'zero'], fw27_best: 88, fw27_bestg: 30,
    fw27_vsclaim: { g: ['202609:' + UID], p: { k: 1 } } };
  const s = C.fsSnap(getOf(m));
  assert.equal(s.w.coins, 500); assert.ok(s.owned.includes('zero')); assert.equal(s.best, 88); assert.deepEqual(s.vsg, ['202609:' + UID]);
  assert.equal(C.fsEmpty(s), false);
  const w = C.fsWrites(s, getOf(m));
  assert.deepEqual(w.map(x => x[0]).sort(), [...C.FS_KEYS].sort());
  assert.deepEqual(Object.fromEntries(w).fw27_vsclaim, { g: ['202609:' + UID], p: { k: 1 } });
  assert.ok(C.fsSame(C.fsSnap(getOf(Object.fromEntries(w))), s));   // round trip
});

test('three-way merge: currencies add what each side earned or spent since the base', () => {
  const b = S({ w: { coins: 100, gems: 10, lvl: 2, xp: 50 } });
  const l = S({ w: { coins: 150, gems: 10, lvl: 2, xp: 90 } });            // +50 coins, +40 xp here
  const r = S({ w: { coins: 80, gems: 15, lvl: 3, xp: 10 } });             // -20 coins, +5 gems, +60 xp there
  const m = C.fsMerge(l, r, b);
  assert.equal(m.w.coins, 130); assert.equal(m.w.gems, 15);
  assert.deepEqual([m.w.lvl, m.w.xp], [4, 50]);                           // 150 + 40 + 60 = 250 total xp
  assert.equal(C.fsMerge(S({ w: { coins: 0 } }), S({ w: { coins: 10 } }), S({ w: { coins: 100 } })).w.coins, 0);   // never below 0
});

test('first merge on a device (no base): currencies add up, xp takes the higher, prefs come from the account', () => {
  const l = S({ w: { coins: 300, dia: 5, lvl: 5, xp: 0 }, nick: 'Phone', bird: 'zero' });
  const r = S({ w: { coins: 200, dia: 1, lvl: 2, xp: 0 }, nick: 'Main', bird: 'volt' });
  const m = C.fsMerge(l, r, null);
  assert.equal(m.w.coins, 500); assert.equal(m.w.dia, 6); assert.equal(m.w.lvl, 5);
  assert.equal(m.nick, 'Main'); assert.equal(m.bird, 'volt');
});

test('monotonic fields: union of units and claims, OR of flags, max of bests and stages, later daily streak', () => {
  const l = S({ owned: ['zero'], pass: true, best: 50, bestg: 20, stg: { gates: [9, 1], score: [1], clr: [1, 0], open: 4 }, tut: 1,
    ds: { last: '2026-10-16', streak: 9 }, dbonus: '2026-10-16', vsg: ['202609:' + UID] });
  const r = S({ owned: ['pixel'], starter: true, best: 70, bestg: 25, stg: { gates: [2, 5], score: [8], clr: [0, 1], open: 2 },
    ds: { last: '2026-10-17', streak: 1 }, dbonus: '2026-10-17', vsg: ['202608:' + UID] });
  const m = C.fsMerge(l, r, null);
  assert.ok(m.owned.includes('zero') && m.owned.includes('pixel'));
  assert.equal(m.pass && m.starter, true); assert.deepEqual([m.best, m.bestg], [70, 25]);
  assert.deepEqual(m.stg.gates.slice(0, 2), [9, 5]); assert.deepEqual(m.stg.clr.slice(0, 2), [1, 1]); assert.equal(m.stg.open, 4);
  assert.equal(m.tut, 1); assert.deepEqual(m.ds, { last: '2026-10-17', streak: 1 }); assert.equal(m.dbonus, '2026-10-17');
  assert.deepEqual([...m.vsg].sort(), ['202608:' + UID, '202609:' + UID]);
});

test('three-way prefs: the side that changed since the base wins', () => {
  const b = S({ nick: 'A', bird: 'volt' }), l = S({ nick: 'B', bird: 'volt' }), r = S({ nick: 'A', bird: 'zero' });
  const m = C.fsMerge(l, r, b);
  assert.deepEqual([m.nick, m.bird], ['B', 'zero']);
});

test('fsPlan: adopt, merge3, pull, ask', () => {
  const full = S({ w: { coins: 9 } }), empty = S({}), remote = { rev: 3, data: S({ w: { coins: 1 } }) };
  assert.equal(C.fsPlan(null, UID, null, full), 'adopt');                                  // new account / upgraded anonymous player
  assert.equal(C.fsPlan({ uid: UID, rev: 2, base: empty }, UID, remote, full), 'merge3');
  assert.equal(C.fsPlan(null, UID, remote, empty), 'pull');                                // nothing on this device worth asking about
  assert.equal(C.fsPlan(null, UID, remote, full), 'ask');                                  // one-time choice
  assert.equal(C.fsPlan({ uid: OTHER, rev: 5, base: full }, UID, remote, full), 'pull');   // another account's progress: never handed over
  assert.equal(C.fsPlan({ uid: OTHER, rev: 5, base: full }, UID, null, full), 'pull');
});
```

- [ ] **Step 3: 실패 확인**

Run: `node --test tests/cloud.test.js`
Expected: FAIL — `cloud block not found in index.html`

- [ ] **Step 4: 최소 구현 — `/* ads:end */` 다음 줄에 삽입**

```js
/* cloud:start — cloud save (merge rules) and, later, login rules: pure, no DOM, no storage, no clock (get/set come in). tests/cloud.test.js runs this block as it stands (tests/helpers/cloud.js). */
const FS_CFG = Object.freeze({ v: 1, maxBytes: 16384, stN: 50, owned0: Object.freeze(['volt', 'blitz', 'nimbus', 'titan']) });
// Synced to the account (public.fw_saves). Every other fw27_ key stays on this device: FS_LOCAL ("_" at the end = a prefix)
const FS_KEYS = Object.freeze(['fw27_wallet2', 'fw27_owned', 'fw27_pass', 'fw27_starter', 'fw27_best', 'fw27_bestg', 'fw27_stg2', 'fw27_stage2',
  'fw27_bird', 'fw27_nick', 'fw27_tut', 'fw27_rookie_runs', 'fw27_dstreak', 'fw27_dbonus', 'fw27_vsclaim']);
const FS_LOCAL = Object.freeze(['fw27_wallet', 'fw27_stg', 'fw27_stage', 'fw27_lang', 'fw27_mute', 'fw27_vib', 'fw27_ads', 'fw27_trial', 'fw27_rp2',
  'fw27_rej', 'fw27_vsmode', 'fw27_dg', 'fw27_daily_', 'fw27_sync']);
const fsI = (v, lo, hi) => Math.max(lo, Math.min(hi, Math.floor(Number(v) || 0)));
const fsDay = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : '';
const fsId = v => typeof v === 'string' && /^[a-z]{1,12}$/.test(v) && v !== 'constructor';
const fsObj = v => v && typeof v === 'object' && !Array.isArray(v) ? v : {};
const fsArr = (a, hi) => Array.from({ length: FS_CFG.stN }, (_, i) => fsI(Array.isArray(a) ? a[i] : 0, 0, hi));
function fsNorm(raw){
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || raw.v !== FS_CFG.v) return null;
  const w = fsObj(raw.w), s = fsObj(raw.stg), d = fsObj(raw.ds);
  return { v: FS_CFG.v,
    w: { xp: fsI(w.xp, 0, 99), lvl: fsI(w.lvl, 1, 1e6), coins: fsI(w.coins, 0, 1e12), dia: fsI(w.dia, 0, 1e12), gems: fsI(w.gems, 0, 1e9) },
    owned: [...new Set([...FS_CFG.owned0, ...(Array.isArray(raw.owned) ? raw.owned : []).filter(fsId)])].sort().slice(0, 64),
    pass: raw.pass === true, starter: raw.starter === true, best: fsI(raw.best, 0, 1e9), bestg: fsI(raw.bestg, 0, 1e6),
    stg: { gates: fsArr(s.gates, 1e9), score: fsArr(s.score, 1e9), clr: fsArr(s.clr, 1), open: fsI(s.open, 0, FS_CFG.stN - 1) },
    stage: fsI(raw.stage, 0, FS_CFG.stN - 1), bird: fsId(raw.bird) ? raw.bird : 'volt',
    nick: typeof raw.nick === 'string' ? raw.nick.slice(0, 14) : '', tut: raw.tut ? 1 : 0, rookie: fsI(raw.rookie, 0, 999),
    ds: fsDay(d.last) ? { last: d.last, streak: fsI(d.streak, 0, 1e6) } : null, dbonus: fsDay(raw.dbonus),
    vsg: (Array.isArray(raw.vsg) ? raw.vsg : []).filter(k => typeof k === 'string' && /^\d{6}:[0-9a-f-]{36}$/.test(k)).slice(-24) };
}
// The device save as the game itself reads it (same keys, same defaults)
function fsSnap(get){
  const vc = fsObj(get('fw27_vsclaim', null));
  return fsNorm({ v: FS_CFG.v, w: get('fw27_wallet2', {}), owned: get('fw27_owned', FS_CFG.owned0), pass: get('fw27_pass', false), starter: get('fw27_starter', false),
    best: get('fw27_best', 0), bestg: get('fw27_bestg', 0), stg: get('fw27_stg2', null), stage: get('fw27_stage2', 0), bird: get('fw27_bird', 'volt'),
    nick: get('fw27_nick', '') || '', tut: get('fw27_tut', 0), rookie: get('fw27_rookie_runs', 0), ds: get('fw27_dstreak', null), dbonus: get('fw27_dbonus', ''), vsg: vc.g });
}
// What to store for a save. fw27_vsclaim keeps this device's pending claims (p): only the granted keys (g) travel
function fsWrites(s, get){
  const vc = fsObj(get('fw27_vsclaim', null)), p = fsObj(vc.p);
  return [['fw27_wallet2', { ...s.w }], ['fw27_owned', [...s.owned]], ['fw27_pass', s.pass], ['fw27_starter', s.starter], ['fw27_best', s.best], ['fw27_bestg', s.bestg],
    ['fw27_stg2', { gates: [...s.stg.gates], score: [...s.stg.score], clr: [...s.stg.clr], open: s.stg.open }], ['fw27_stage2', s.stage], ['fw27_bird', s.bird],
    ['fw27_nick', s.nick || null], ['fw27_tut', s.tut], ['fw27_rookie_runs', s.rookie], ['fw27_dstreak', s.ds && { ...s.ds }], ['fw27_dbonus', s.dbonus],
    ['fw27_vsclaim', { g: [...s.vsg], p }]];
}
const fsSame = (a, b) => JSON.stringify(fsNorm(a)) === JSON.stringify(fsNorm(b));
const fsEmpty = s => s.best === 0 && s.w.coins + s.w.dia + s.w.gems === 0 && s.w.lvl === 1 && s.w.xp === 0 && !s.pass && !s.starter
  && s.owned.every(id => FS_CFG.owned0.includes(id)) && s.stg.gates.every(g => g === 0);
const fsTot = w => (w.lvl - 1) * 100 + w.xp;
// l, r, b: fsNorm results. b = the copy both sides last agreed on (three-way) or null (this device's first merge with this account)
function fsMerge(l, r, b){
  const cur = k => b ? Math.max(0, r.w[k] + l.w[k] - b.w[k]) : l.w[k] + r.w[k];
  const tot = b ? Math.max(0, fsTot(r.w) + fsTot(l.w) - fsTot(b.w)) : Math.max(fsTot(l.w), fsTot(r.w));
  const pick = k => b && JSON.stringify(l[k]) !== JSON.stringify(b[k]) ? l[k] : r[k];
  const hi = l.best >= r.best ? l : r, mx = (x, y) => x.map((v, i) => Math.max(v, y[i]));
  const ds = !l.ds ? r.ds : !r.ds ? l.ds : l.ds.last !== r.ds.last ? (l.ds.last > r.ds.last ? l.ds : r.ds) : (l.ds.streak >= r.ds.streak ? l.ds : r.ds);
  return fsNorm({ v: FS_CFG.v, w: { lvl: Math.floor(tot / 100) + 1, xp: tot % 100, coins: cur('coins'), dia: cur('dia'), gems: cur('gems') },
    owned: [...l.owned, ...r.owned], pass: l.pass || r.pass, starter: l.starter || r.starter, best: hi.best, bestg: hi.bestg,
    stg: { gates: mx(l.stg.gates, r.stg.gates), score: mx(l.stg.score, r.stg.score), clr: mx(l.stg.clr, r.stg.clr), open: Math.max(l.stg.open, r.stg.open) },
    stage: pick('stage'), bird: pick('bird'), nick: pick('nick') || l.nick, tut: l.tut | r.tut, rookie: Math.max(l.rookie, r.rookie),
    ds, dbonus: l.dbonus > r.dbonus ? l.dbonus : r.dbonus, vsg: [...r.vsg, ...l.vsg.filter(k => !r.vsg.includes(k))] });
}
// rec: this device's last sync {uid, rev, base} | null; remote: {rev, data} | null (no row yet)
function fsPlan(rec, uid, remote, local){
  if (rec && rec.uid && rec.uid !== uid) return 'pull';
  if (!remote) return 'adopt';
  if (rec && rec.uid === uid && rec.base) return 'merge3';
  return fsEmpty(local) ? 'pull' : 'ask';
}
/* cloud:end */
```

- [ ] **Step 5: 통과 확인**

Run: `node --test tests/cloud.test.js`
Expected: PASS (9 tests, 0 failures)

- [ ] **Step 6: 블록 순수성 + 회귀**

Run: `awk '/cloud:start/,/cloud:end/' index.html | grep -nE 'window|document|localStorage|sessionStorage|setTimeout|Date\.|store\.|\$\('`
Expected: 출력 없음
Run: `npm test`
Expected: 0 failures

- [ ] **Step 7: 커밋**

```bash
git add index.html tests/helpers/cloud.js tests/cloud.test.js
git commit -m "feat: pure cloud save rules — classified keys, normalise, three-way merge and sync plan"
```

---

### Task 2: 서버 — public.fw_saves + save_get / save_put

**Files:**
- Modify: `/Users/mac/fluxwing/supabase/schema.sql` — 파일 끝의 pg_cron 블록(:1162) **앞에** "CLOUD SAVE" 섹션 추가. 헤더 대시보드 목록(:5-20)에 8~10번 추가. Housekeeping 문단(:23-25)에 fw_saves 한 줄 추가.
- Create: `/Users/mac/fluxwing/tests/cloud-sql.test.js`

**Interfaces:**
- Consumes: `FS_CFG.maxBytes`(Task 1)
- Produces (Task 4가 사용):
  - `rpc('save_get')` → `{rev: 0, data: null}` | `{rev: n≥1, data: jsonb, updated_at}`
  - `rpc('save_put', {p_rev: bigint, p_data: jsonb})` → `{ok: true, rev}` | `{ok: false, rev, data}`(CAS 실패: 현재 서버본을 돌려줌)
  - 오류 메시지 접두사: `fw_auth`(28000), `fw_save_anon`(42501), `fw_bad_input`(22023), `fw_rate_limited`(P0001)

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/cloud-sql.test.js`:
```js
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { loadCloud } from './helpers/cloud.js';

const sql = readFileSync(new URL('../supabase/schema.sql', import.meta.url), 'utf8');
const C = loadCloud();

test('fw_saves exists, has RLS on and no client policy', () => {
  assert.match(sql, /create table if not exists public\.fw_saves \(/);
  assert.match(sql, /alter table public\.fw_saves enable row level security;/);
  assert.doesNotMatch(sql, /create policy \w+ on public\.fw_saves/);
  assert.match(sql, /revoke all on table public\.fw_saves from public, anon, authenticated;/);
});

test('the size cap is the client cap', () => {
  assert.equal(Number(sql.match(/c_max_bytes\s+constant integer\s*:=\s*(\d+)/)[1]), C.FS_CFG.maxBytes);
});

test('definer functions pin search_path, refuse anonymous players, and are reachable only by authenticated', () => {
  for (const f of ['fw_save_me', 'fw_save_get', 'fw_save_put'])
    assert.match(sql, new RegExp(`function private\\.${f}\\([^)]*\\)[\\s\\S]*?security definer[\\s\\S]*?set search_path = ''`));
  assert.match(sql, /fw_save_anon/);
  assert.match(sql, /u\.is_anonymous/);
  for (const sig of ['public.save_get()', 'public.save_put(bigint, jsonb)', 'private.fw_save_get()', 'private.fw_save_put(bigint, jsonb)']) {
    const s = sig.replace(/[.()]/g, '\\$&');
    assert.match(sql, new RegExp(`revoke all on function ${s}\\s+from public, anon, authenticated;`));
    assert.match(sql, new RegExp(`grant execute on function ${s}\\s+to authenticated, service_role;`));
  }
  assert.match(sql, /revoke all on function private\.fw_save_me\(\)\s+from public, anon, authenticated;/);
});
```

- [ ] **Step 2: 실패 확인**

Run: `node --test tests/cloud-sql.test.js`
Expected: FAIL (fw_saves 없음)

- [ ] **Step 3: SQL 구현 — pg_cron 블록 앞에 삽입**

```sql
-- =====================================================================================================
-- CLOUD SAVE — one row per signed-in (NOT anonymous) player: the device save index.html syncs (cloud block, FS_KEYS).
-- The client merges (fsMerge); the server only stores it, with a revision number for compare-and-set:
--   save_get()             {rev: 0, data: null} when there is no row, else {rev, data, updated_at}
--   save_put(p_rev, data)  writes only when p_rev is the stored rev (0 = no row yet): {ok: true, rev: rev + 1};
--                          otherwise writes nothing and answers {ok: false, rev, data} so the client merges and retries.
-- No clocks are compared anywhere: the order of writes is the rev. The economy is not checked here (as before: the
-- wallet is the device's); what is checked is the caller (an account, not an anonymous player), the shape (a JSON
-- object with "v": 1) and the size. Deleting the auth user deletes the row (on delete cascade).
-- =====================================================================================================
create table if not exists public.fw_saves (
  player_id  uuid        primary key references auth.users (id) on delete cascade,
  rev        bigint      not null default 1,
  data       jsonb       not null,
  put_day    date,
  put_count  integer     not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint fw_saves_rev_chk  check (rev >= 1),
  constraint fw_saves_data_chk check (jsonb_typeof(data) = 'object'),
  constraint fw_saves_size_chk check (octet_length(data::text) <= 16384)
);
comment on table public.fw_saves is 'Flux Wing cloud save: one row per account. Written only by private.fw_save_put().';
alter table public.fw_saves enable row level security;
-- No policy on purpose: clients reach their row only through save_get / save_put.
revoke all on table public.fw_saves from public, anon, authenticated;
grant select, insert, update, delete on table public.fw_saves to service_role;

-- The caller's id, for accounts only. Reads auth.users (not the JWT claim), so a token issued before the
-- anonymous player was upgraded does not lock the new account out, and an anonymous player never gets a row.
create or replace function private.fw_save_me() returns uuid
language plpgsql stable security definer set search_path = '' as $$
declare v_uid uuid := (select auth.uid()); v_anon boolean;
begin
  if v_uid is null then raise exception 'fw_auth: sign-in required' using errcode = '28000'; end if;
  select u.is_anonymous into v_anon from auth.users u where u.id = v_uid;
  if not found then raise exception 'fw_auth: unknown player' using errcode = '28000'; end if;
  if v_anon then raise exception 'fw_save_anon: an account is required' using errcode = '42501'; end if;
  return v_uid;
end $$;

create or replace function private.fw_save_get() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := private.fw_save_me(); v_row public.fw_saves%rowtype;
begin
  select * into v_row from public.fw_saves where player_id = v_uid;
  if not found then return jsonb_build_object('rev', 0, 'data', null); end if;
  return jsonb_build_object('rev', v_row.rev, 'data', v_row.data, 'updated_at', v_row.updated_at);
end $$;

create or replace function private.fw_save_put(p_rev bigint, p_data jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  c_max_bytes constant integer := 16384;   -- FS_CFG.maxBytes in index.html (tests/cloud-sql.test.js keeps the two equal)
  c_day_cap   constant integer := 1500;    -- accepted writes per account per UTC day
  v_uid   uuid := private.fw_save_me();
  v_today date := (now() at time zone 'utc')::date;
  v_row   public.fw_saves%rowtype;
  v_rev   bigint;
begin
  if p_rev is null or p_rev < 0 or p_data is null or jsonb_typeof(p_data) <> 'object' or (p_data ->> 'v') is distinct from '1' then
    raise exception 'fw_bad_input: save must be a v1 object' using errcode = '22023';
  end if;
  if octet_length(p_data::text) > c_max_bytes then
    raise exception 'fw_bad_input: save too large' using errcode = '22023';
  end if;
  select * into v_row from public.fw_saves where player_id = v_uid for update;
  if not found then
    if p_rev <> 0 then return jsonb_build_object('ok', false, 'rev', 0, 'data', null); end if;
    insert into public.fw_saves (player_id, rev, data, put_day, put_count) values (v_uid, 1, p_data, v_today, 1)
    on conflict (player_id) do nothing returning rev into v_rev;
    if v_rev is null then   -- another call created it first
      select * into v_row from public.fw_saves where player_id = v_uid;
      return jsonb_build_object('ok', false, 'rev', v_row.rev, 'data', v_row.data);
    end if;
    return jsonb_build_object('ok', true, 'rev', v_rev);
  end if;
  if v_row.rev <> p_rev then return jsonb_build_object('ok', false, 'rev', v_row.rev, 'data', v_row.data); end if;
  if v_row.put_day is not distinct from v_today and v_row.put_count >= c_day_cap then
    raise exception 'fw_rate_limited: daily save limit reached' using errcode = 'P0001';
  end if;
  update public.fw_saves set rev = rev + 1, data = p_data, updated_at = now(),
    put_day = v_today, put_count = case when put_day is not distinct from v_today then put_count + 1 else 1 end
  where player_id = v_uid returning rev into v_rev;
  return jsonb_build_object('ok', true, 'rev', v_rev);
end $$;

create or replace function public.save_get() returns jsonb
language sql security invoker set search_path = '' as $$ select private.fw_save_get(); $$;
create or replace function public.save_put(p_rev bigint, p_data jsonb) returns jsonb
language sql security invoker set search_path = '' as $$ select private.fw_save_put(p_rev, p_data); $$;

revoke all on function private.fw_save_me()                from public, anon, authenticated;
revoke all on function private.fw_save_get()               from public, anon, authenticated;
revoke all on function private.fw_save_put(bigint, jsonb)  from public, anon, authenticated;
revoke all on function public.save_get()                   from public, anon, authenticated;
revoke all on function public.save_put(bigint, jsonb)      from public, anon, authenticated;
grant execute on function private.fw_save_get()               to authenticated, service_role;
grant execute on function private.fw_save_put(bigint, jsonb)  to authenticated, service_role;
grant execute on function public.save_get()                   to authenticated, service_role;
grant execute on function public.save_put(bigint, jsonb)      to authenticated, service_role;
```
주의: `fw_save_me`는 definer 함수 안에서만 불리므로 authenticated에 execute를 주지 않는다. 다른 definer 함수(소유자 권한)에서 호출하는 것은 문제없다. 헤더 대시보드 목록에는 다음을 추가한다: "8. Authentication > Sign In / Providers: Email ON(Confirm email ON), Google ON. 9. Authentication > Sign In / Providers > 'Allow manual linking' ON(linkIdentity). 10. Authentication > URL Configuration: Site URL + Redirect URLs(plan-auth.md 부록 A)."

- [ ] **Step 4: 통과 확인**

Run: `node --test tests/cloud-sql.test.js`
Expected: PASS (3 tests)

- [ ] **Step 5: SQL Editor에 적용 (운영자 수동)**

`supabase/schema.sql` 전체를 SQL Editor에 붙여 실행한다(멱등 스크립트).
Expected: 오류 없이 완료, `fw_nick_bad self-test`도 통과.

- [ ] **Step 6: SQL 스모크 (운영자 수동, 롤백되는 트랜잭션)**

```sql
-- <ACCOUNT> = is_anonymous=false인 테스트 계정 id, <ANON> = 익명 사용자 id
begin;
select set_config('request.jwt.claims', json_build_object('sub','<ACCOUNT>','role','authenticated')::text, true);
set local role authenticated;
select public.save_get();                                -- Expected: {"rev": 0, "data": null}
select public.save_put(0, '{"v":1,"best":5}'::jsonb);    -- Expected: {"ok": true, "rev": 1}
select public.save_put(0, '{"v":1,"best":6}'::jsonb);    -- Expected: {"ok": false, "rev": 1, "data": {"v":1,"best":5}}
select public.save_put(1, '{"v":2}'::jsonb);             -- Expected: ERROR fw_bad_input
select public.save_put(1, jsonb_build_object('v',1,'x',repeat('a',17000)));   -- Expected: ERROR fw_bad_input: save too large
rollback;
begin;
select set_config('request.jwt.claims', json_build_object('sub','<ANON>','role','authenticated')::text, true);
set local role authenticated;
select public.save_get();                                -- Expected: ERROR fw_save_anon
rollback;
```
[from-research] 검증 필요: `auth.users.is_anonymous` 컬럼 존재(Supabase 익명 로그인 도입 이후 표준 컬럼). 없으면 `raw_app_meta_data`가 아니라 JWT의 `is_anonymous` 클레임으로 바꾸고 테스트 정규식도 함께 고친다.

- [ ] **Step 7: 커밋**

```bash
git add supabase/schema.sql tests/cloud-sql.test.js
git commit -m "feat: cloud save table with compare-and-set save_get / save_put for accounts only"
```

---

### Task 3: 로그인 — 규칙(cloud 블록 2부) + Supabase auth 연결 + 계정 오버레이 + i18n

**Files:**
- Modify: `/Users/mac/fluxwing/index.html`
  - :534 `FW_CONFIG`의 맨 끝에 `, auth: { apple: false }` 추가(`'window.FW_CONFIG = { '` 접두는 그대로 → portal-build 영향 없음)
  - cloud 블록에 auth 규칙 추가
  - :505-526 `lbScr`의 `</form>`(:524) 다음에 계정 줄, `seaScr`(:468) 앞에 `authScr` 오버레이
  - :735 `I18N_N.ko`, :759 `I18N_N.en`에 키 추가
  - :3726 createClient 옵션, :3727-3731 onAuthStateChange, :3744 `sbUser` 설정, :3747 끝에 `authReturn(); renderAcct();`
  - `/* ---------- account login ---------- */` 런타임 섹션을 `syncLocal`(:3751) 앞에 추가
- Modify: `/Users/mac/fluxwing/tests/helpers/cloud.js` (return 확장)
- Modify: `/Users/mac/fluxwing/tests/cloud.test.js` (auth 테스트 추가)

**Interfaces:**
- Consumes: 없음(Task 1 블록에 추가만 함)
- Produces (Task 4가 사용):
  - 순수: `authUrl(href) → {cb, err, clean}` (err: `'taken'|'other'|''`), `authErr(e) → 'taken'|'rate'|'code'|'email'|'other'`, `authUi(cfg, ua) → {show, google, apple, email, inApp}`, `authEmail(s) → string|''`, `authCodeOk(s) → string|''`, `authInApp(ua) → boolean`
  - 런타임: `let sbUser`(현재 세션 user), `authAnon() → boolean`, `authOpen(mode, msgKey?)`(mode: `'pick'|'code'|'taken'|'ask'|'out'`), `authClose()`, `renderAcct()`, `authDone()`(로그인 직후 호출, Task 4가 `cloudPull()` 연결), `let authLeaving`

- [ ] **Step 1: SDK API 사실 검증 (코드 쓰기 전에)**

Run:
```bash
curl -s https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.2/dist/umd/supabase.js -o /tmp/sb.js
for s in linkIdentity signInWithOtp verifyOtp email_change identity_already_exists is_anonymous detectSessionInUrl flowType; do printf '%s ' $s; grep -c "$s" /tmp/sb.js; done
```
Expected: 모두 1 이상. [from-research] 검증 필요 — 이 플랜은 다음을 가정한다. 하나라도 다르면 멈추고 보고한다.
- `auth.linkIdentity({provider, options:{redirectTo}})`가 현재(익명) 세션에 OAuth identity를 붙이고 리다이렉트한다.
- 이미 다른 사용자에게 붙은 identity면 복귀 URL에 `error_code=identity_already_exists`가 붙는다.
- `auth.updateUser({email}, {emailRedirectTo})`가 익명 사용자에게 확인 메일(email_change)을 보낸다. 이미 쓰는 이메일이면 오류 code `email_exists`가 난다.
- `auth.verifyOtp({email, token, type:'email'|'email_change'})`가 세션을 반환한다.
- `session.user.is_anonymous`가 있다.

- [ ] **Step 2: 실패하는 테스트 추가**

helper return에 `AUTH_ERR, authUrl, authErr, authUi, authEmail, authCodeOk, authInApp`를 추가한다. `tests/cloud.test.js` 끝에 덧붙인다:
```js
test('authUrl: errors are taken out of the URL, other parameters stay, tokens are left to the SDK', () => {
  const base = 'https://breton5797.github.io/fluxwing/';
  assert.deepEqual(C.authUrl(base), { cb: false, err: '', clean: base });
  assert.deepEqual(C.authUrl(base + '#dev'), { cb: false, err: '', clean: base + '#dev' });
  const t = C.authUrl(base + '?c=abc#error=server_error&error_code=identity_already_exists&error_description=Identity+is+already+linked');
  assert.deepEqual(t, { cb: true, err: 'taken', clean: base + '?c=abc' });
  assert.deepEqual(C.authUrl(base + '?error=access_denied&error_description=x&c=1'), { cb: true, err: 'other', clean: base + '?c=1' });
  assert.equal(C.authUrl(base + '#access_token=a&refresh_token=b&type=magiclink').err, '');   // success: the SDK reads the hash
  assert.equal(C.authUrl(base + '#access_token=a&refresh_token=b').cb, true);
});

test('authErr reads codes, then messages', () => {
  assert.equal(C.authErr({ code: 'identity_already_exists' }), 'taken');
  assert.equal(C.authErr({ code: 'email_exists' }), 'taken');
  assert.equal(C.authErr({ status: 429, message: 'x' }), 'rate');
  assert.equal(C.authErr({ code: 'over_email_send_rate_limit' }), 'rate');
  assert.equal(C.authErr({ code: 'otp_expired' }), 'code');
  assert.equal(C.authErr({ code: 'email_address_invalid' }), 'email');
  assert.equal(C.authErr(null), 'other'); assert.equal(C.authErr({ message: 'boom' }), 'other');
});

test('authUi: hidden without Supabase or on a portal; Apple only when switched on; no Google inside in-app browsers', () => {
  const on = { supabaseUrl: 'u', supabaseAnonKey: 'k' }, ua = 'Mozilla/5.0 (iPhone) Safari/604.1';
  assert.deepEqual(C.authUi(on, ua), { show: true, google: true, apple: false, email: true, inApp: false });
  assert.equal(C.authUi({}, ua).show, false);
  assert.equal(C.authUi({ ...on, ads: 'poki' }, ua).show, false);
  assert.equal(C.authUi({ ...on, ads: 'crazygames' }, ua).show, false);
  assert.equal(C.authUi({ ...on, ads: 'stub' }, ua).show, true);
  assert.equal(C.authUi({ ...on, auth: { apple: true } }, ua).apple, true);
  assert.equal(C.authUi({ ...on, auth: { apple: 'yes' } }, ua).apple, false);
  const k = C.authUi(on, 'Mozilla/5.0 (iPhone) KAKAOTALK 10.0');
  assert.deepEqual([k.google, k.email, k.inApp], [false, true, true]);
  assert.equal(C.authUi(on, undefined).show, true);
});

test('authEmail and authCodeOk', () => {
  assert.equal(C.authEmail('  Me@Example.COM '), 'me@example.com');
  for (const bad of ['', 'a@b', 'no at', 'a@b.c', null, 'x'.repeat(250) + '@a.com']) assert.equal(C.authEmail(bad), '');
  assert.equal(C.authCodeOk(' 123 456 '), '123456');
  for (const bad of ['12345', 'abcdef', '', null, '12345678901']) assert.equal(C.authCodeOk(bad), '');
});
```

- [ ] **Step 3: 실패 확인**

Run: `node --test tests/cloud.test.js`
Expected: FAIL — `authUrl is not defined`

- [ ] **Step 4: 순수 규칙 구현 (cloud 블록, `/* cloud:end */` 바로 앞)**

```js
// Login rules. Auth error codes are Supabase's (error.code); messages are a fallback for older answers
const AUTH_ERR = Object.freeze({ taken: ['identity_already_exists', 'email_exists', 'user_already_exists'],
  rate: ['over_email_send_rate_limit', 'over_request_rate_limit', 'too_many_requests'], code: ['otp_expired', 'otp_disabled'],
  email: ['email_address_invalid', 'validation_failed', 'email_address_not_authorized'] });
const AUTH_Q = ['error', 'error_code', 'error_description'];
function authErr(e){
  if (!e || typeof e !== 'object') return 'other';
  const c = String(e.code || e.error_code || ''), m = String(e.message || '');
  for (const k of ['taken', 'rate', 'code', 'email']) if (AUTH_ERR[k].includes(c)) return k;
  if (e.status === 429 || /rate limit/i.test(m)) return 'rate';
  if (/already (been )?(registered|linked|exists)/i.test(m)) return 'taken';
  if (/expired|invalid.*(otp|token)/i.test(m)) return 'code';
  return 'other';
}
// A page the OAuth / email link came back to. Errors are stripped from the URL here (before the SDK sees them, so it cannot drop the
// current session over one); a success hash (#access_token=…) is the SDK's to read. clean = the URL without the auth parts
function authUrl(href){
  const u = new URL(href), h = new URLSearchParams(u.hash.startsWith('#') && u.hash.includes('=') ? u.hash.slice(1) : '');
  const code = u.searchParams.get('error_code') || h.get('error_code') || '', bad = u.searchParams.has('error') || h.has('error') || !!code;
  const tok = h.has('access_token');
  AUTH_Q.forEach(k => u.searchParams.delete(k));
  if (bad || tok) u.hash = '';
  return { cb: bad || tok, err: bad ? (AUTH_ERR.taken.includes(code) ? 'taken' : 'other') : '', clean: u.toString() };
}
const authInApp = ua => /KAKAOTALK|Instagram|FBAN|FBAV|Line\/|NAVER|DaumApps|; wv\)/i.test(String(ua || ''));
// Which login buttons this build offers. Portal builds (FW_CONFIG.ads names a portal) never show login: portals do not allow the redirects
function authUi(cfg, ua){
  const c = cfg && typeof cfg === 'object' ? cfg : {}, inApp = authInApp(ua);
  const show = !!(c.supabaseUrl && c.supabaseAnonKey) && !(typeof c.ads === 'string' && c.ads && c.ads !== 'stub');
  return { show, google: show && !inApp, apple: show && !!(c.auth && c.auth.apple === true), email: show, inApp };
}
const authEmail = s => { const v = typeof s === 'string' ? s.trim().toLowerCase() : ''; return v.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v) ? v : ''; };
const authCodeOk = s => { const v = typeof s === 'string' ? s.replace(/\s+/g, '') : ''; return /^\d{6,10}$/.test(v) ? v : ''; };
```
참고: `new URL`과 `URLSearchParams`는 브라우저가 아니라 언어 표준 객체라서 순수성 grep(Task 1 Step 6) 대상이 아니다.

- [ ] **Step 5: 통과 확인**

Run: `node --test tests/cloud.test.js`
Expected: PASS (13 tests)

- [ ] **Step 6: HTML — 계정 줄 + 오버레이**

`lbScr`의 `</form>`(:524) 다음 줄:
```html
      <div class="nickrow acctrow" id="acctRow" hidden><span id="acctLbl"></span><button class="ghost" type="button" id="acctBtn"></button></div>
```
`seaScr`(:468) 앞:
```html
  <div class="overlay" id="authScr" hidden>
    <div class="card authcard">
      <div class="lbhead"><h2 data-i18n="acct"></h2><button class="ghost" id="authClose" data-i18n="close"></button></div>
      <div class="vsnote" id="authMsg"></div>
      <div id="authPick">
        <div class="vsstatus" data-i18n="authSub"></div>
        <button class="ghost primary" id="authGoogle" data-i18n="authGoogle"></button>
        <button class="ghost" id="authApple" data-i18n="authApple" hidden></button>
        <form class="nickrow" id="authEmailForm"><input id="authEmailIn" type="email" autocomplete="email" maxlength="254"><button class="ghost" type="submit" data-i18n="authSend"></button></form>
      </div>
      <form class="nickrow" id="authCodeForm" hidden><input id="authCodeIn" inputmode="numeric" autocomplete="one-time-code" maxlength="12"><button class="ghost" type="submit" data-i18n="authVerify"></button></form>
      <div id="authTaken" hidden><button class="ghost primary" id="authTakenGo" data-i18n="authTakenGo"></button></div>
      <div id="authAsk" hidden><div class="vsstatus" id="cloudAcct"></div><div class="vsstatus" id="cloudDev"></div><button class="ghost primary" id="cloudMerge" data-i18n="cloudMerge"></button><button class="ghost" id="cloudPull" data-i18n="cloudPull"></button></div>
      <div id="authOutBox" hidden><div class="vsstatus" id="authWho"></div><button class="ghost" id="authOutBtn" data-i18n="authOut"></button></div>
    </div>
  </div>
```
CSS는 기존 `.card/.ghost/.nickrow/.vsstatus/.vsnote`를 재사용하고 새 규칙은 `.authcard{max-width:360px}` 한 줄만 둔다. ≤379px 폭에서 줄바꿈을 확인한다.

- [ ] **Step 7: i18n (ko + en)**

`I18N_N.ko`(:735)의 `adFail` 앞에 추가:
```js
acct:'계정', authCta:'로그인하고 진행 저장', authSub:'코인·기체·진행이 계정에 저장되고 다른 기기와 동기화돼요', authGoogle:'Google로 계속', authApple:'Apple로 계속', authSend:'이메일로 코드 받기', authEmailPh:'이메일 주소', authSent:'{e}(으)로 보낸 6자리 코드를 입력하거나 메일의 링크를 여세요', authCodePh:'6자리 코드', authVerify:'확인', authBadEmail:'이메일 주소를 확인해 주세요', authBadCode:'코드가 맞지 않거나 만료됐어요', authRate:'잠시 후 다시 시도해 주세요', authFail:'로그인하지 못했어요. 다시 시도해 주세요', authTaken:'이 계정에는 이미 다른 진행이 있어요. 그 계정으로 로그인할까요?', authTakenGo:'그 계정으로 로그인', authIn:'{e} 로그인됨', authOut:'로그아웃', authOutQ:'로그아웃하면 이 기기의 진행이 지워지고 처음부터 시작해요. 진행은 계정에 안전하게 남아 있어요.', authInApp:'앱 안의 브라우저에서는 Google 로그인이 막혀 있어요. 이메일 코드를 쓰거나 기본 브라우저로 여세요', cloudAsk:'이 계정에 저장된 진행이 있어요', cloudLine:'{w}: Lv {l} · 코인 {c} · 기체 {u}', cloudAcctW:'계정', cloudDevW:'이 기기', cloudMerge:'합치기 (권장)', cloudPull:'계정 진행만 사용', cloudLoaded:'계정 진행을 불러왔어요', cloudFail:'계정에 저장하지 못했어요. 잠시 후 다시 시도해요',
```
`I18N_N.en`(:759)에도 같은 키를 추가:
```js
acct:'Account', authCta:'Sign in to save progress', authSub:'Coins, units and progress are kept on your account and synced across devices', authGoogle:'Continue with Google', authApple:'Continue with Apple', authSend:'Email me a code', authEmailPh:'Email address', authSent:'Enter the 6-digit code sent to {e}, or open the link in the email', authCodePh:'6-digit code', authVerify:'Confirm', authBadEmail:'Please check the email address', authBadCode:'That code is wrong or expired', authRate:'Please try again in a moment', authFail:"Couldn't sign in. Please try again", authTaken:'That account already has other progress. Sign in to it?', authTakenGo:'Sign in to that account', authIn:'Signed in as {e}', authOut:'Sign out', authOutQ:'Signing out clears the progress on this device and starts fresh. Your progress stays safe on your account.', authInApp:'Google sign-in is blocked inside in-app browsers. Use an email code or open your default browser', cloudAsk:'This account already has saved progress', cloudLine:'{w}: Lv {l} · {c} coins · {u} units', cloudAcctW:'Account', cloudDevW:'This device', cloudMerge:'Merge (recommended)', cloudPull:'Use account progress only', cloudLoaded:'Loaded your account progress', cloudFail:"Couldn't save to your account. Will retry",
```
`t()`는 같은 플레이스홀더를 한 번만 치환하므로, 문구마다 같은 `{x}`는 한 번만 쓴다.

- [ ] **Step 8: Supabase 연결 변경 (최소 수정)**

1) :3646 `let` 목록 끝에 `sbUser = null`을 추가한다.
2) :3726 createClient 옵션을 다음으로 바꾼다:
```js
sbC = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {auth:{persistSession:true, autoRefreshToken:true, detectSessionInUrl:true, flowType:'implicit'}});
```
3) :3729와 :3730:
```js
if (s && s.user){ sbUser = s.user; if (uid !== s.user.id){ uid = s.user.id; myDoc = null; } }
else if (ev === 'SIGNED_OUT' && !reauthP && !authLeaving) setTimeout(...)   // 나머지 그대로
```
4) :3744 `uid = session.user.id;` 앞에 `sbUser = session.user;`를 넣는다. `sbReauth`(:3716)에도 `sbUser = r.data.session.user;`를 넣는다.
5) :3747 `syncLocal(); vsSync();` 다음에 `authReturn(); renderAcct();`를 추가한다.
6) `initSupabase` 실행 전, 즉 **createClient보다 먼저** URL 오류를 걷어낸다. 런타임 섹션 맨 위에 둔다:
```js
const AUTH_CB = authUrl(location.href);
if (AUTH_CB.err) history.replaceState(null, '', AUTH_CB.clean);   // the SDK never sees an auth error: the anonymous session stays as it is
```

- [ ] **Step 9: 로그인 런타임 섹션 (`syncLocal` :3751 앞)**

```js
/* ---------- account login on top of the anonymous player (supabase/schema.sql CLOUD SAVE). linkIdentity / updateUser keep auth.uid(),
   so the leaderboard row and the RP stay. An identity or email that already has an account: sign in to that one (Task 4 offers the merge) ---------- */
const AUTH_UI = authUi(window.FW_CONFIG, navigator.userAgent);
const authBack = () => location.origin + location.pathname;
const authAnon = () => !sbUser || sbUser.is_anonymous !== false;
let authMail = null, authTry = '', authLeaving = false;   // authMail: {email, type} while a code is awaited; authTry: the provider of the last OAuth attempt
const AUTH_BOX = {pick: 'authPick', code: 'authCodeForm', taken: 'authTaken', ask: 'authAsk', out: 'authOutBox'};
function authSay(k, v){ $('authMsg').textContent = k ? t(k, v) : ''; }
function authOpen(mode, msg){
  for (const m in AUTH_BOX) $(AUTH_BOX[m]).hidden = m !== mode;
  $('authGoogle').hidden = !AUTH_UI.google; $('authApple').hidden = !AUTH_UI.apple;
  $('authEmailIn').placeholder = t('authEmailPh'); $('authCodeIn').placeholder = t('authCodePh');
  if (mode === 'out') $('authWho').textContent = t('authIn', {e: (sbUser && sbUser.email) || ''});
  authSay(msg || (mode === 'pick' && AUTH_UI.inApp ? 'authInApp' : mode === 'code' && authMail ? 'authSent' : mode === 'taken' ? 'authTaken' : ''), {e: authMail ? authMail.email : ''});
  $('authScr').hidden = false; lbOpen = true;
}
function authClose(){ $('authScr').hidden = true; lbOpen = !$('shopScr').hidden || !$('lbScr').hidden || !$('vsScr').hidden; }
function renderAcct(){
  const on = AUTH_UI.show && backend === 'supa' && !!sbC; $('acctRow').hidden = !on; if (!on) return;
  $('acctLbl').textContent = authAnon() ? t('authSub') : t('authIn', {e: (sbUser && sbUser.email) || ''});
  $('acctBtn').textContent = authAnon() ? t('authCta') : t('acct');
}
async function authOAuth(p){
  if (!sbC || backend !== 'supa') return authSay('authFail');
  authTry = p; try { sessionStorage.setItem('fw_auth_try', p); } catch(e){}
  const o = {provider: p, options: {redirectTo: authBack()}};
  let r; try { r = authAnon() ? await sbC.auth.linkIdentity(o) : await sbC.auth.signInWithOAuth(o); } catch(e){ r = {error: e}; }
  if (r && r.error) authSay(authErr(r.error) === 'rate' ? 'authRate' : 'authFail');   // on success the page navigates away
}
function authReturn(){
  if (!AUTH_CB.cb) return;
  try { authTry = sessionStorage.getItem('fw_auth_try') || ''; sessionStorage.removeItem('fw_auth_try'); } catch(e){}
  if (!AUTH_CB.err){ history.replaceState(null, '', AUTH_CB.clean); if (!authAnon()) authDone(); return; }
  authOpen(AUTH_CB.err === 'taken' && authTry ? 'taken' : 'pick', AUTH_CB.err === 'taken' ? 'authTaken' : 'authFail');
}
async function authEmailSend(raw){
  const email = authEmail(raw); if (!email) return authSay('authBadEmail');
  if (!sbC || !authAnon()) return authSay('authFail');
  const back = {emailRedirectTo: authBack()}; let type = 'email_change', r;
  try { r = await sbC.auth.updateUser({email}, back); } catch(e){ r = {error: e}; }
  if (r.error && authErr(r.error) === 'taken'){ type = 'email'; try { r = await sbC.auth.signInWithOtp({email, options: {...back, shouldCreateUser: false}}); } catch(e){ r = {error: e}; } }
  if (r.error){ const k = authErr(r.error); return authSay(k === 'rate' ? 'authRate' : k === 'email' ? 'authBadEmail' : 'authFail'); }
  authMail = {email, type}; $('authCodeIn').value = ''; authOpen('code');
}
async function authCodeSend(raw){
  const token = authCodeOk(raw); if (!token || !authMail) return authSay('authBadCode');
  let r; try { r = await sbC.auth.verifyOtp({email: authMail.email, token, type: authMail.type}); } catch(e){ r = {error: e}; }
  if (r.error) return authSay(authErr(r.error) === 'rate' ? 'authRate' : 'authBadCode');
  if (r.data && r.data.user) sbUser = r.data.user;
  authMail = null; authDone();
}
function authDone(){ authClose(); renderAcct(); toast(t('authIn', {e: (sbUser && sbUser.email) || ''})); }   // Task 4 adds cloudPull()
$('acctBtn').addEventListener('click', e => { e.stopPropagation(); audioInit(); authOpen(authAnon() ? (authMail ? 'code' : 'pick') : 'out'); });
$('authClose').addEventListener('click', authClose);
$('authScr').addEventListener('click', e => { if (e.target === $('authScr')) authClose(); });
$('authGoogle').addEventListener('click', e => { e.stopPropagation(); authOAuth('google'); });
$('authApple').addEventListener('click', e => { e.stopPropagation(); if (AUTH_UI.apple) authOAuth('apple'); });
$('authTakenGo').addEventListener('click', async e => { e.stopPropagation(); if (!authTry || !sbC) return; try { await sbC.auth.signInWithOAuth({provider: authTry, options: {redirectTo: authBack()}}); } catch(x){ authSay('authFail'); } });
$('authEmailForm').addEventListener('submit', e => { e.preventDefault(); authEmailSend($('authEmailIn').value); });
$('authCodeForm').addEventListener('submit', e => { e.preventDefault(); authCodeSend($('authCodeIn').value); });
// The confirmation link was opened somewhere else (mail app, another browser): the account is upgraded on the server; this tab learns it on refresh
document.addEventListener('visibilitychange', async () => {
  if (document.hidden || !authMail || authMail.type !== 'email_change' || !sbC) return;
  try { const r = await sbC.auth.refreshSession(); const u = r.data && r.data.user; if (u && u.is_anonymous === false){ sbUser = u; authMail = null; authDone(); } } catch(e){}
});
```
`renderLB()`가 불릴 때 계정 줄 문구도 맞도록 `openLB`(:3879)의 `renderLB();` 다음에 `renderAcct();`를 넣는다.

- [ ] **Step 10: 회귀 + 포털 확인**

Run: `npm test`
Expected: 0 failures (`tests/portal.test.js`의 FW_CONFIG 줄 1개 검사 포함)
Run: `npm run build:portal -- poki && grep -c "ads: 'poki', supabaseUrl" dist/poki/index.html`
Expected: `1`

- [ ] **Step 11: 수동 QA (localhost, 부록 A 대시보드 설정 후)**

`npm run dev` → http://localhost:5173 → 리더보드 → 계정 줄 → Google:
- Expected: 연동 전 uid(`#dev`에서 `FW.vsRank.uid`)와 복귀 후 uid가 같다.
- SQL `select id, is_anonymous from auth.users where id='<uid>'` → `is_anonymous = false`.
- 이미 다른 계정에 붙은 Google로 다시 시도하면 'taken' 화면이 뜨고, 익명 uid는 그대로다(새 익명이 생기지 않음).
- 이메일 코드: 새 주소 → 같은 uid 승격. 기존 주소 → 그 계정으로 로그인.

- [ ] **Step 12: 커밋**

```bash
git add index.html tests/helpers/cloud.js tests/cloud.test.js
git commit -m "feat: sign in with Google or an email code by upgrading the anonymous player in place"
```

---

### Task 4: 동기화 엔진 — pull / push / CAS 충돌 / 병합 선택 / 적용 / 로그아웃

**Files:**
- Modify: `/Users/mac/fluxwing/index.html`
  - :548-552 store 앞에 `let onStoreSet = null;`, `set()` 끝에 `if (onStoreSet) onStoreSet(k);`
  - cloud 블록에 `fsCanApply`, `fsSummary` 추가
  - "cloud save" 런타임 섹션을 로그인 섹션 다음에 추가
  - `authDone()`에 `cloudPull();`, :3747에 `cloudPull();`, lbPoll(:3746) 안에 `if (fsDirty) cloudPush();`, `toMenu()`(:1584) 끝에 `cloudMenu();`
  - :4575 FW dev handle에 `cloud: {...}` 추가
- Modify: `/Users/mac/fluxwing/tests/helpers/cloud.js`, `/Users/mac/fluxwing/tests/cloud.test.js`

**Interfaces:**
- Consumes: Task 1 `fs*`, Task 2 RPC, Task 3 `sbUser`, `authAnon`, `authOpen('ask'|'out')`, `authClose`, `authLeaving`, `AUTH_UI`
- Produces: `cloudPull()`, `cloudPush()`, `cloudMenu()`, `authLogout()`, `fsCanApply(state, overlay) → boolean`, `fsSummary(save) → {l, c, u}`

- [ ] **Step 1: 실패하는 테스트 추가** (helper return에 `fsCanApply, fsSummary` 추가)

```js
test('a cloud save is applied and pushed only from the menu with nothing open', () => {
  assert.equal(C.fsCanApply('menu', false), true);
  for (const s of ['play', 'dying', 'over', 'paused', 'countdown']) assert.equal(C.fsCanApply(s, false), false);
  assert.equal(C.fsCanApply('menu', true), false);
});

test('fsSummary is what the merge question shows', () => {
  assert.deepEqual(C.fsSummary(C.fsNorm({ v: 1, w: { lvl: 7, coins: 1234 }, owned: ['zero', 'pixel'] })), { l: 7, c: 1234, u: 6 });
});
```
(`'over'` 상태가 index.html의 실제 상태 이름과 같은지 :1192 주변 `state ===` 사용처에서 확인. 테스트는 menu만 true면 된다.)

- [ ] **Step 2: 실패 확인**

Run: `node --test tests/cloud.test.js`
Expected: FAIL — `fsCanApply is not defined`

- [ ] **Step 3: 순수 구현 (cloud 블록)**

```js
// Saves are read once at start-up and the run writes the wallet from memory: a merged save is written (and the page restarted) only from the idle menu
const fsCanApply = (state, overlay) => state === 'menu' && !overlay;
const fsSummary = s => ({ l: s.w.lvl, c: s.w.coins, u: s.owned.length });
```

- [ ] **Step 4: 통과 확인**

Run: `node --test tests/cloud.test.js`
Expected: PASS (15 tests)

- [ ] **Step 5: store 훅 (:548-552)**

```js
let onStoreSet = null;   // the cloud save marks itself dirty here (cloud save section)
const store = {
  get(k, d){ try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch(e){ return d; } },
  set(k, v){ try { localStorage.setItem(k, JSON.stringify(v)); } catch(e){} if (onStoreSet) onStoreSet(k); }
};
```

- [ ] **Step 6: 런타임 섹션 (로그인 섹션 바로 다음)**

```js
/* ---------- cloud save: the account's copy of FS_KEYS (save_get / save_put, compare-and-set on rev). Pulled on sign-in and start-up,
   pushed from the menu after a change; a merged save is written and the page restarted, from the menu only (fsCanApply) ---------- */
const fsRecOf = r => r && typeof r === 'object' && typeof r.uid === 'string' && Number.isInteger(r.rev) && r.rev >= 0 ? {uid: r.uid, rev: r.rev, base: fsNorm(r.base)} : null;
let fsRec = fsRecOf(store.get('fw27_sync', null));
let fsDirty = false, fsBusy = false, fsReady = false, fsT = 0, fsWait = null, fsAskQ = null;
const fsOn = () => AUTH_UI.show && backend === 'supa' && !!sb && !!uid && !authAnon();
const fsOverlay = () => lbOpen || !$('authScr').hidden || !$('confScr').hidden || !$('seaScr').hidden;
const fsMine = () => fsRec && fsRec.uid === uid ? fsRec : null;
const fsCall = async (fn, a) => { try { return await sb.rpc(fn, a); } catch(e){ return {error: e || {}}; } };
function fsKeep(rev, base){ fsRec = {uid, rev, base}; store.set('fw27_sync', fsRec); }
function fsApply(s){
  if (!fsCanApply(state, fsOverlay() && $('authScr').hidden)){ fsWait = s; return; }   // the merge question itself may be open
  let last = 0; try { last = Number(sessionStorage.getItem('fw_cloud_at')) || 0; } catch(e){}
  if (Date.now() - last < 15000){ toast(t('cloudFail')); return; }   // never a restart loop
  fsWrites(s, store.get).forEach(([k, v]) => store.set(k, v));
  try { sessionStorage.setItem('fw_cloud_at', String(Date.now())); sessionStorage.setItem('fw_cloud_note', '1'); } catch(e){}
  location.reload();
}
// Write s as rev; on a conflict merge with what the account holds now (base: the copy both last agreed on) and try again, three times at most
async function fsPut(rev, s, local, base){
  for (let i = 0; i < 3; i++){
    const r = await fsCall('save_put', {p_rev: rev, p_data: s});
    if (r.error || !r.data) return false;
    if (r.data.ok){ fsKeep(r.data.rev, s); if (!fsSame(s, local)) fsApply(s); return true; }
    const now = r.data.rev > 0 ? fsNorm(r.data.data) : null;
    if (r.data.rev > 0 && !now) return false;   // a save this build cannot read: leave it alone
    s = now ? fsMerge(local, now, base) : local; rev = r.data.rev;
  }
  return false;
}
async function cloudPull(){
  if (!fsOn() || fsBusy) return; fsBusy = true; fsReady = false;
  try {
    const r = await fsCall('save_get'); if (r.error || !r.data) return;
    const remote = r.data.rev > 0 ? {rev: r.data.rev, data: fsNorm(r.data.data)} : null, local = fsSnap(store.get);
    if (remote && !remote.data) return;   // newer format on the account: touch nothing, push nothing
    const plan = fsPlan(fsRec, uid, remote, local), zero = fsNorm({v: FS_CFG.v});
    if (plan === 'adopt'){ fsReady = await fsPut(0, local, local, null); return; }
    if (plan === 'pull'){ const s = remote ? remote.data : zero; fsKeep(remote ? remote.rev : 0, s); fsReady = true; if (!fsSame(s, local)) fsApply(s); return; }
    if (plan === 'merge3'){ const m = fsMerge(local, remote.data, fsMine().base); fsReady = fsSame(m, remote.data) ? (fsKeep(remote.rev, remote.data), true) : await fsPut(remote.rev, m, local, fsMine().base); if (fsReady && !fsSame(m, local) && fsSame(m, fsRec.base)) fsApply(m); return; }
    fsAskQ = {local, remote}; fsAsk();   // 'ask'
  } finally { fsBusy = false; }
}
function fsAsk(){
  const {local, remote} = fsAskQ, a = fsSummary(remote.data), d = fsSummary(local);
  $('cloudAcct').textContent = t('cloudLine', {w: t('cloudAcctW'), l: a.l, c: a.c.toLocaleString(), u: a.u});
  $('cloudDev').textContent = t('cloudLine', {w: t('cloudDevW'), l: d.l, c: d.c.toLocaleString(), u: d.u});
  authOpen('ask', 'cloudAsk');
}
$('cloudMerge').addEventListener('click', async e => {
  e.stopPropagation(); const q = fsAskQ; if (!q || fsBusy) return; fsBusy = true;
  try { const m = fsMerge(q.local, q.remote.data, null); fsAskQ = null; authClose(); fsReady = await fsPut(q.remote.rev, m, q.local, null); if (!fsReady) toast(t('cloudFail')); } finally { fsBusy = false; }
});
$('cloudPull').addEventListener('click', e => {
  e.stopPropagation(); const q = fsAskQ; if (!q) return; fsAskQ = null; authClose();
  fsKeep(q.remote.rev, q.remote.data); fsReady = true; fsApply(q.remote.data);
});
async function cloudPush(){
  if (!fsDirty || !fsReady || !fsOn() || fsBusy || fsAskQ || !fsCanApply(state, fsOverlay())) return;
  fsDirty = false; fsBusy = true;
  try {
    const local = fsSnap(store.get), mine = fsMine();
    if (mine && fsSame(local, mine.base)) return;
    if (!(await fsPut(mine ? mine.rev : 0, local, local, mine ? mine.base : null))) fsDirty = true;
  } finally { fsBusy = false; }
}
onStoreSet = k => { if (!FS_KEYS.includes(k) || !fsOn()) return; fsDirty = true; clearTimeout(fsT); fsT = setTimeout(cloudPush, 4000); };
function cloudMenu(){ if (fsWait){ const s = fsWait; fsWait = null; fsApply(s); return; } if (fsDirty){ clearTimeout(fsT); fsT = setTimeout(cloudPush, 1500); } }
document.addEventListener('visibilitychange', () => { if (document.hidden) cloudPush(); });
// Sign-out: this device starts fresh, so the next account to sign in here never inherits this one's progress (fsPlan)
const AUTH_WIPE = [...FS_KEYS, 'fw27_sync', 'fw27_rp2', 'fw27_rej', 'fw27_dg'];
async function authLogout(){
  authLeaving = true; onStoreSet = null; clearTimeout(fsT);
  AUTH_WIPE.forEach(k => { try { localStorage.removeItem(k); } catch(e){} });
  try { await sbC.auth.signOut({scope: 'local'}); } catch(e){}
  location.replace(authBack());
}
$('authOutBtn').addEventListener('click', e => { e.stopPropagation(); authClose(); confirmDlg(t('authOutQ'), authLogout); });
try { if (sessionStorage.getItem('fw_cloud_note')){ sessionStorage.removeItem('fw_cloud_note'); setTimeout(() => toast(t('cloudLoaded')), 600); } } catch(e){}
```
`confirmDlg`의 버튼 라벨은 data-i18n `buy`로 고정이다. 로그아웃 확인에서는 열기 전에 `$('confYes').textContent = t('authOut')`로 바꾸고, `confNo`/`confYes` 닫기 처리에서 `applyI18n` 기본값으로 돌아오는지 확인한다(아니면 닫을 때 `t('buy')`로 되돌린다).

merge3 줄을 읽기 쉽게 정리할 때 의미는 다음과 같다. "서버본과 같으면 rec만 갱신, 다르면 put(충돌 재시도 포함). put 성공 시 fsPut가 local과 다를 때 적용한다." `fsApply` 중복 호출은 fsPut 내부 하나로 충분하므로, 정리하면서 마지막 `if (...) fsApply(m)`은 `fsSame(m, remote.data)`이고 `!fsSame(m, local)`인 경우에만 남긴다.

- [ ] **Step 7: 연결 (한 줄씩)**

- `authDone()` 끝에 `cloudPull();`
- :3747 `authReturn(); renderAcct();` 다음에 `cloudPull();`
- :3746 lbPoll 콜백 맨 앞 `if (!sb || document.hidden) return;` 다음에 `if (fsDirty) cloudPush();`
- `toMenu()`(:1584) 끝 `seaCheck();` 다음에 `cloudMenu();`
- `authClose()` 끝에 `if (state === 'menu') cloudMenu();` (병합 질문을 닫은 뒤 대기 중인 적용 처리)
- :4575 FW 객체에 `cloud: {get rec(){ return fsRec; }, snap: () => fsSnap(store.get), pull: cloudPull, push: cloudPush, get dirty(){ return fsDirty; }},` 추가

- [ ] **Step 8: 회귀**

Run: `npm test`
Expected: 0 failures
Run: `awk '/cloud:start/,/cloud:end/' index.html | grep -nE 'window|document|localStorage|sessionStorage|setTimeout|Date\.|store\.|\$\('`
Expected: 출력 없음

- [ ] **Step 9: 수동 QA (2개 브라우저 프로필 = 기기 A/B)**

1. A: 익명으로 코인 500 → Google 연동 → `FW.cloud.rec.rev === 1`, SQL `select rev, data->'w' from public.fw_saves` → coins 500.
2. B: 익명으로 코인 300 + 기체 1개 구매 → 같은 Google → identity taken → 그 계정으로 로그인 → "계정 Lv… 코인 500 / 이 기기 코인 300" 질문 → 합치기 → reload → 코인 800, 기체 합집합.
3. A: reload → merge3 → 코인 800 표시(A가 base 이후 변경 없음).
4. A에서 100을 쓰고 B에서 50을 벌어 각자 메뉴로 돌아가면, 양쪽 reload 후 750.
5. 런 도중 B에서 push가 일어나도 A의 런 결과가 메뉴 복귀 후 병합되어 손실이 없다.
6. A 로그아웃 → 코인 0의 새 익명, 다시 로그인 → 'pull'(fsEmpty) → 750.
7. 오프라인(DevTools Offline)에서 플레이 → 온라인 복귀 + 메뉴 → push 성공(`FW.cloud.dirty === false`).

- [ ] **Step 10: 커밋**

```bash
git add index.html tests/helpers/cloud.js tests/cloud.test.js
git commit -m "feat: sync the save with the account — pull on sign-in, push from the menu, merge on conflict, fresh device on sign-out"
```

---

### Task 5: 문서 · 운영 체크리스트 · 전체 QA

**Files:**
- Modify: `/Users/mac/fluxwing/supabase/schema.sql` 헤더(Task 2에서 추가한 8~10번 문구 확정)
- Modify: `/Users/mac/fluxwing/README.md` — "계정 로그인 / 클라우드 세이브" 절(설정 순서, FW_CONFIG.auth.apple, 포털 판정)
- (이 플랜의 부록 A가 운영 문서. 별도 파일을 새로 만들지 않음)

**Interfaces:** Consumes Task 1~4. Produces 없음.

- [ ] **Step 1: README 절 작성** — 부록 A 요약 + "Apple 켜기 = 부록 A-3 완료 후 `FW_CONFIG.auth.apple = true`" + "포털 빌드에는 로그인 UI 없음(판정)" + "로그아웃은 기기 진행을 지움(진행은 계정에 있음)".
- [ ] **Step 2: 전체 회귀**
  Run: `npm test` → Expected: 0 failures
  Run: `npm run build:portal -- crazygames && npm run build:portal -- poki` → Expected: `wrote …` 2줄
- [ ] **Step 3: 수동 QA 체크리스트 (배포 전, 실제 github.io)**
  - 익명 → Google 연동, uid 유지, 리더보드 순위·RP 그대로
  - 익명 → 이메일 코드(새 주소) 연동, uid 유지. 같은 메일의 링크로도 성공
  - 기존 이메일/Google → 그 계정 로그인 + 병합 질문(진행이 빈 기기면 질문 없이 pull)
  - iOS 홈 화면 PWA: 이메일 코드 입력으로 로그인 성공
  - 카카오톡 내장 브라우저: Google 버튼 숨김 + authInApp 안내, 이메일 코드 가능
  - 포털 dist 2종: 계정 줄 없음, 리더보드 익명 동작 그대로, Uncaught 0
  - `FW_CONFIG.auth.apple=false`: Apple 버튼 없음
  - 로그아웃 → 새 익명 + 진행 초기화, 재로그인 → 진행 복구
  - reload 루프 없음(15초 가드), `FW.selfTest()` 실패 0
- [ ] **Step 4: 커밋 + PR**

```bash
git add README.md supabase/schema.sql
git commit -m "docs: account login and cloud save setup, portal ruling and ops checklist"
git push -u origin feat/account-login
gh pr create --title "feat: account login (Google / email code, Apple behind config) with cloud save sync" --body "plan-auth.md Task 1-5. Test plan: npm test; Task 4 Step 9 + Task 5 Step 3 manual QA"
```

---

## 의존성 · 복잡도
Task 1 → (2와 3은 병렬 가능) → 4 → 5. Task 2 SQL은 Task 3 QA 전에 운영 DB에 적용한다. 복잡도 HIGH: index.html 약 +230줄, 테스트 약 +250줄, SQL 약 +110줄.

## Risks & Mitigations
- **이메일 발송 한도/스팸함 (가장 큼).** Supabase 기본 SMTP는 프로젝트 전체 발송이 시간당 몇 통 수준이라 실서비스에 쓸 수 없다. → 출시 전 커스텀 SMTP(Resend/SES 등, SPF/DKIM) 필수(부록 A-2). 메일 템플릿에 `{{ .Token }}`을 넣는다. 한도 오류는 `authRate`로 안내한다.
- **identity 충돌 시 SDK가 세션을 지우는 경우.** 익명 uid를 잃을 수 있다. → createClient 전에 오류 URL을 걷어낸다(authUrl). Task 3 Step 11에서 "새 익명이 생기지 않음"을 확인한다.
- **PWA standalone / 앱 내장 브라우저.** OAuth 복귀가 Safari로 가거나, Google이 내장 브라우저를 차단(disallowed_useragent)한다. → OTP 코드 입력, 내장 브라우저에서 Google 숨김 + 안내.
- **오래된 JWT(승격 직후에도 is_anonymous 클레임이 true).** → 서버가 `auth.users.is_anonymous`를 직접 읽는다. 다른 곳에서 연 확인 링크는 `refreshSession()`으로 감지한다.
- **병합본을 saveW가 덮어씀.** → 적용과 push는 메뉴에서만(fsCanApply), 적용은 reload.
- **reload 루프.** → 15초 가드 + 같은 결과면 적용하지 않음(fsSame).
- **시계 차이.** → rev CAS만 쓰고 시각은 비교하지 않는다. 데일리 키는 기존처럼 클라이언트 UTC 날짜.
- **세이브 크기.** 현재 약 2~3KB(50 스테이지 × 숫자 2개 + 기타). → 16KB 상한을 클라이언트와 서버가 공유하고 테스트로 일치를 강제한다.
- **정식 계정 세션 상실.** sbReauth가 새 익명을 만든다. → fsOn()=false라 push하지 않는다. 다른 계정으로 로그인하면 'pull'로 넘겨주지 않는다. 같은 계정으로 재로그인하면 merge3. 그동안 새 익명 리더보드 행이 생길 수 있음(수용).
- **첫 병합 합산의 중복 악용.** → 기기당 1회(rec 기록 후 merge3, 로그아웃 시 삭제). 로컬 저장은 지금도 편집 가능하므로 새 악용면은 아니다.
- **충돌 측 익명 uid의 RP/시즌 기록 소실.** → 한계로 명시한다. 병합 질문 문구에는 RP를 언급하지 않는다(범위 밖).

## Sprint Contract
1. [ ] `node --test tests/cloud.test.js` → 0 failures
2. [ ] `node --test tests/cloud-sql.test.js` → 0 failures
3. [ ] `npm test` → 0 failures
4. [ ] cloud 블록 순수성 grep → 0건
5. [ ] SQL 스모크(Task 2 Step 6) 기대값 6개 일치
6. [ ] Google 연동 전후 uid 동일 + `is_anonymous=false`
7. [ ] 2기기 QA(Task 4 Step 9) 7항목 통과
8. [ ] 포털 dist 2종에 계정 줄 없음, Uncaught 0
9. [ ] code-reviewer APPROVE(CRITICAL/HIGH 0), security-reviewer: RPC 권한·RLS·URL 처리 검토 통과

## 부록 A — 운영 체크리스트 (Supabase 대시보드 / 외부 콘솔)

**A-1. 즉시 (Google + 이메일)**
1. Authentication > URL Configuration
   - Site URL: `https://breton5797.github.io/fluxwing/`
   - Redirect URLs: `https://breton5797.github.io/fluxwing/**`, `http://localhost:5173/**`
   - 포털 도메인은 넣지 않는다(판정: 포털 빌드는 로그인 UI 없음).
2. Authentication > Sign In / Providers > Email: ON, Confirm email ON, OTP 길이 6, 만료 3600s 이하
3. 같은 화면 "Allow manual linking": ON (linkIdentity 필수). "Allow anonymous sign-ins"는 기존대로 ON
4. Google Cloud Console > APIs & Services > Credentials > OAuth client(Web)
   - Authorized JavaScript origins: `https://breton5797.github.io`
   - Authorized redirect URI: `https://ecjeyelgcqbliavwltbc.supabase.co/auth/v1/callback`
   - OAuth 동의 화면 게시(테스트 모드는 100명 제한)
5. Supabase > Providers > Google: Client ID / Secret 입력, ON
6. Authentication > Email Templates: "Magic Link"와 "Change Email Address"에 `{{ .Token }}`(6자리 코드)와 링크를 함께 넣는다(ko/en 병기)
7. SQL Editor: `supabase/schema.sql` 전체 실행 → Task 2 Step 6 스모크

**A-2. 출시 전 필수**
1. Authentication > SMTP Settings: 커스텀 SMTP(발신 도메인 SPF/DKIM/DMARC)
2. Authentication > Rate Limits: 이메일 발송 한도를 SMTP 공급자 한도에 맞게 상향
3. Gmail/Naver/Daum 스팸함 수신 테스트

**A-3. 나중에 (Apple)**
1. Apple Developer: App ID(Sign in with Apple), Services ID(웹), 도메인 `breton5797.github.io` 확인, Return URL `https://ecjeyelgcqbliavwltbc.supabase.co/auth/v1/callback`, Key(.p8) 발급
2. Supabase > Providers > Apple: Services ID, Team ID, Key ID, 시크릿 입력, ON. Apple 클라이언트 시크릿은 6개월마다 갱신 — 캘린더에 등록
3. `index.html` :534 `auth: { apple: true }` → 배포 → Task 5 Step 3의 Apple 항목 QA

## Success Criteria
- [ ] 기존 익명 플레이어가 Google/이메일로 로그인해도 리더보드·RP 이력이 그대로다(uid 유지).
- [ ] 두 기기에서 같은 계정으로 코인·기체·스테이지·최고 기록이 손실이나 중복 없이 합쳐진다.
- [ ] 포털 빌드와 설정 없는 빌드는 지금과 똑같이 동작한다.
- [ ] Apple은 설정 한 줄로 켤 수 있고, 꺼져 있으면 보이지 않는다.
