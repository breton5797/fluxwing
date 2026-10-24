# QA 치명 1건 + 높음 9건 수정 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 2026-10-25 6인 검수에서 나온 치명 1건과 높음 9건을 11-17 출시 전에 닫는다.

**Architecture:** 게임은 단일 `index.html`(IIFE)이고 순수 규칙은 `/* name:start */ … /* name:end */` 마커 블록으로 잘라 `tests/helpers/*.js`가 `new Function`으로 로드한다. 새 규칙은 같은 방식(새 마커 블록 `loop-rules`, 기존 `fx-core`·`hit-loop` 블록)으로 넣고, 서버 쪽은 `supabase/schema.sql`의 `private.fw_save_put`에 타당성 상한을 더하며 `tests/cloud-sql.test.js`가 클라이언트 상수와 동일함을 검사한다. UI 변경은 `tests/*.test.js`의 HTML 정규식 검사로 고정한다.

**Tech Stack:** vanilla JS (index.html), CSS (styles.css), PostgreSQL/plpgsql (supabase/schema.sql), node:test, Playwright(수동 확인용), cwebp.

**Spec:** `docs/qa/2026-10-25-review.md` (종합표 #1~#10 = 이 계획의 범위. #11 이후는 범위 밖)

## Global Constraints

- 브랜치: `main`에서 `fix/qa-2026-10-25` 새로 딴다 (`feat/sns-pilot`과 무관).
- 플레이어가 보는 문구를 바꿀 때는 I18N 23개 언어 전부에 같은 키를 넣는다 (`tests/i18n.test.js`가 누락을 잡는다). 새 문구가 필요 없으면 만들지 않는다.
- 숨김 유닛 id: `aurora, tempest, pleiad` (`hidden:true`), 시즌 유닛 `monarch` (`season:true`). 이름·색을 비소유자에게 보이지 않는다.
- 물리 튜닝 값(`flap, grav, maxFall`, 스텝 상한 `.034`)은 바꾸지 않는다. 슬로모션 제거는 서브스텝으로만 한다.
- 서버 상한은 클라이언트 `FS_CFG`에 같은 숫자를 두고 `tests/cloud-sql.test.js`가 둘을 비교한다 (`c_max_bytes` 선례).
- `innerHTML` 금지(admin.test.js가 검사). 커밋 메시지는 `fix:`/`feat:`/`test:`/`docs:`.
- 각 Task 끝에 `npm test` 전체가 녹색(현재 464 pass). 브라우저 확인은 `python3 -m http.server 5173` + `http://localhost:5173/#dev`.

## Review Focus

1. 저사양 기기에서 한 프레임이 250ms를 넘을 때(백그라운드 복귀 직후): 서브스텝이 8번(=.25/.034)으로 끝나야지 수백 번 돌아 멈추면 안 된다 → Task 3 `frameSteps` 상한 테스트.
2. 대전 중 전화가 와서 탭이 숨겨진 플레이어: 즉시 사망 처리되고 상대는 정상 승리해야 한다. 복귀 시 "일시정지" 화면이 남아 있으면 안 된다 → Task 2 `vsPauseAction` 테스트 + 수동 확인.
3. 이미 `fw27_tut=1`인 기존 플레이어: 튜토리얼 변경 후에도 다시 튜토리얼을 강제당하면 안 된다 → Task 4 `tutDone` 테스트(기존 플래그 우선).
4. 서버 상한 도입 후 정상 고레벨 플레이어의 저장이 거부되면 진행이 사라진 것처럼 보인다: 상한은 6개월 플레이로도 못 닿는 값이어야 한다 → Task 1 상한값 산정 근거를 주석과 테스트에 적는다 (코인 5e7 = 숙련자 2,115코인/판 × 23,600판).
5. 폰트 비차단 로드 후 첫 페인트에 폴백 폰트가 보이다가 바뀌는 FOUT: 로고는 이미지라 영향 없고 버튼만 바뀐다. `font-display:swap`은 유지 → Task 7 테스트는 링크가 렌더 차단이 아님만 고정, FOUT는 수동 확인 항목.

---

### Task 1: 클라우드 세이브 서버 타당성 상한 (치명 #1)

**Files:**
- Modify: `supabase/schema.sql:1239-1275` (`private.fw_save_put`)
- Modify: `index.html` `FS_CFG` 정의부 (grep `const FS_CFG`) — `caps` 추가; `fsNorm`(1935-1941)의 상한을 `FS_CFG.caps`로 교체
- Test: `tests/cloud-sql.test.js`, `tests/cloud.test.js`

**Interfaces:**
- Produces: `FS_CFG.caps = { coins: 5e7, dia: 1e7, gems: 1e5, lvl: 500 }`, `FS_CFG.neverOwned = ['aurora','tempest','pleiad']` (클라이언트), SQL 상수 `c_cap_coins 50000000, c_cap_dia 10000000, c_cap_gems 100000, c_cap_lvl 500`, `c_never_owned text[] := array['aurora','tempest','pleiad']`.
- Consumes: 없음.

- [ ] **Step 1: 실패하는 테스트 — 서버 상한이 클라이언트 상한과 같다**

`tests/cloud-sql.test.js`에 추가:
```js
test('save_put refuses implausible wallets and units nobody can earn', () => {
  const C = loadCloud();
  assert.deepEqual(C.FS_CFG.caps, { coins: 5e7, dia: 1e7, gems: 1e5, lvl: 500 });
  assert.deepEqual(C.FS_CFG.neverOwned, ['aurora', 'tempest', 'pleiad']);
  for (const [k, v] of [['coins', 50000000], ['dia', 10000000], ['gems', 100000], ['lvl', 500]])
    assert.equal(Number(sql.match(new RegExp(`c_cap_${k}\\s+constant bigint\\s*:=\\s*(\\d+)`))[1]), v, k);
  assert.match(sql, /c_never_owned\s+constant text\[\]\s*:=\s*array\['aurora','tempest','pleiad'\]/);
  assert.match(sql, /fw_bad_input: save out of range/);
  assert.match(sql, /fw_bad_input: save owns a unit nobody can earn/);
});
```
`tests/cloud.test.js`에 추가:
```js
test('fsNorm clamps the wallet to the server caps and drops units nobody can earn', () => {
  const n = C.fsNorm({ v: 1, w: { coins: 9e9, dia: 9e9, gems: 9e9, lvl: 9999, xp: 0 }, owned: ['volt', 'aurora', 'mochi'] });
  assert.deepEqual(n.w, { xp: 0, lvl: 500, coins: 5e7, dia: 1e7, gems: 1e5 });
  assert.ok(!n.owned.includes('aurora')); assert.ok(n.owned.includes('mochi'));
});
```

- [ ] **Step 2: 실패 확인**

Run: `node --test tests/cloud-sql.test.js tests/cloud.test.js`
Expected: FAIL — `caps` undefined / regex 불일치.

- [ ] **Step 3: 구현**

`index.html` `FS_CFG`에 `caps`, `neverOwned` 추가. `fsNorm`: `coins/dia/gems/lvl` 상한을 `FS_CFG.caps.*`로, `owned` 필터에 `&& !FS_CFG.neverOwned.includes(id)` 추가(monarch는 시즌 지급 경로가 있으므로 허용).
`fw_save_put`: 입력 검사 뒤, 갱신 전에 추가:
- `(p_data->'w'->>'coins')::numeric > c_cap_coins` 등 4개 중 하나라도 초과 → `raise exception 'fw_bad_input: save out of range' using errcode='22023'` (값이 숫자가 아니면 0으로 취급: `coalesce(nullif(regexp_replace(...,'[^0-9]','','g'),'')::numeric,0)` 대신 `jsonb_typeof = 'number'`일 때만 비교).
- `p_data->'owned'`가 배열이고 `c_never_owned`와 교집합이 있으면 → `raise exception 'fw_bad_input: save owns a unit nobody can earn'`.
주석에 상한 근거 한 줄: "숙련자 2,115코인/판 기준 2만 판 이상".

- [ ] **Step 4: 통과 확인**

Run: `node --test tests/cloud-sql.test.js tests/cloud.test.js`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add index.html supabase/schema.sql tests/cloud-sql.test.js tests/cloud.test.js
git commit -m "fix: cloud save refuses implausible wallets and unearnable units (server + client caps)"
```

> 배포 메모(계획 밖, 실행자가 ledger에 남김): `schema.sql` 변경은 Supabase SQL 에디터에서 `fw_save_put` 블록만 다시 실행해야 적용된다.

---

### Task 2: 대전 중 일시정지 차단 (높음 #2)

**Files:**
- Modify: `index.html:2733` (visibilitychange), `2735-2738` (`togglePause`), `2748`·`2993` (`pauseBtn.hidden`)
- Modify: `index.html` `/* hit-loop:start */` 블록(1313 이후)에 순수 함수 추가
- Test: `tests/hitloop.test.js`, `tests/helpers/hitloop.js` (return 목록에 `vsPauseAction` 추가)

**Interfaces:**
- Produces: `vsPauseAction(mode, state, why) -> 'pause' | 'ignore' | 'die'` — `why`는 `'key' | 'button' | 'hidden'`.

- [ ] **Step 1: 실패하는 테스트**

```js
test('a ranked match cannot be paused: keys and the button do nothing, leaving the tab is a death', () => {
  assert.equal(vsPauseAction('endless', 'play', 'key'), 'pause');
  assert.equal(vsPauseAction('daily', 'play', 'hidden'), 'pause');
  assert.equal(vsPauseAction('versus', 'play', 'key'), 'ignore');
  assert.equal(vsPauseAction('versus', 'play', 'button'), 'ignore');
  assert.equal(vsPauseAction('versus', 'play', 'hidden'), 'die');
  assert.equal(vsPauseAction('versus', 'paused', 'key'), 'ignore');
  assert.equal(vsPauseAction('versus', 'over', 'hidden'), 'ignore');
});
```

- [ ] **Step 2: 실패 확인** — Run: `node --test tests/hitloop.test.js` Expected: FAIL `vsPauseAction is not defined`.

- [ ] **Step 3: 구현**

hit-loop 블록에 `vsPauseAction` 정의. `togglePause(why = 'key')`로 시그니처 확장: `const a = vsPauseAction(mode, state, why); if (a === 'ignore') return; if (a === 'die'){ die(); return; }` 뒤 기존 로직. 호출부: 2628 `togglePause('key')`, 2695 `togglePause('button')`, 2733 `togglePause('hidden')`. 2748·2993: `$('pauseBtn').hidden = mode === 'versus'`.

- [ ] **Step 4: 통과 확인** — Run: `node --test tests/hitloop.test.js` Expected: PASS. 수동: `#dev`에서 대전(AI 상대) 시작 → P키 무반응, 일시정지 버튼 없음, 탭 숨김 → 사망 카드.

- [ ] **Step 5: 커밋** — `git commit -m "fix: ranked matches cannot be paused; leaving the tab ends the run"`

---

### Task 3: 프레임 서브스텝으로 슬로모션 제거 (높음 #3)

**Files:**
- Create (블록): `index.html` `/* loop-rules:start */ … /* loop-rules:end */` — `loop()` 바로 위(6392 부근)
- Modify: `index.html:6396-6402` (`loop`)
- Create: `tests/helpers/loop.js`, `tests/loop.test.js`

**Interfaces:**
- Produces: `frameSteps(elapsedS, maxStep = .034, cap = .25) -> number[]` — 합이 `min(elapsedS, cap)`, 각 원소 `≤ maxStep`, 마지막 원소만 짧을 수 있음, `elapsedS ≤ 0`이면 `[]`.

- [ ] **Step 1: 실패하는 테스트**

```js
test('a slow frame is simulated in full by several steps, never slowed down', () => {
  const sum = a => a.reduce((s, x) => s + x, 0);
  assert.deepEqual(frameSteps(.016), [.016]);
  const s50 = frameSteps(.050); assert.equal(s50.length, 2); assert.ok(Math.abs(sum(s50) - .050) < 1e-9); assert.ok(s50.every(x => x <= .034 + 1e-9));
  assert.ok(Math.abs(sum(frameSteps(.1)) - .1) < 1e-9);
  assert.equal(frameSteps(2).length, 8); assert.ok(Math.abs(sum(frameSteps(2)) - .25) < 1e-9);   // background return: capped, no spiral
  assert.deepEqual(frameSteps(0), []); assert.deepEqual(frameSteps(-1), []);
});
```
`tests/helpers/loop.js`는 `hitloop.js`와 같은 패턴으로 `loop-rules` 블록을 로드해 `{ frameSteps }`를 반환.

- [ ] **Step 2: 실패 확인** — Run: `node --test tests/loop.test.js` Expected: FAIL `loop-rules block not found`.

- [ ] **Step 3: 구현**

`loop(now)`: `const el = (now - last)/1000; last = now; const steps = frameSteps(el); const rdt = steps[0] || 0;` fx 샘플링은 `el*1000`로. `update` 호출을 `for (const h of steps) update(h)`로. `render(); … tutTick(el); vsTick(el)`은 합계로 1회. `togglePause` 재개 시 `last = performance.now()`는 그대로.

- [ ] **Step 4: 통과 확인** — Run: `node --test tests/loop.test.js && npm test` Expected: PASS. 수동: `#dev`에서 검수자 2의 `fps_test.mjs` 방식(rAF 20fps 타이머)으로 게임시간/실시간 ≥ 0.98.

- [ ] **Step 5: 커밋** — `git commit -m "fix: game loop sub-steps slow frames instead of slowing the game"`

---

### Task 4: 튜토리얼 완료 조건 (높음 #4)

**Files:**
- Modify: `index.html:5694-5700` (`tutTick`), `5701-5704` (`startFromMenu`)
- Modify: hit-loop 블록 — 순수 함수 추가
- Test: `tests/hitloop.test.js`, helper return 목록에 `tutDone` 추가

**Interfaces:**
- Produces: `tutDone(flag, step, runs) -> boolean` — `flag`(저장된 `fw27_tut`)가 truthy면 true; `step === 3`(DASH 팁 노출)이면 true; `runs >= 3`이면 true; 그 외 false. 상수 `TUT_MAX_RUNS = 3`.

- [ ] **Step 1: 실패하는 테스트**

```js
test('the tutorial ends only after the DASH tip or three runs; an old save stays done', () => {
  assert.equal(tutDone(1, 0, 0), true);
  assert.equal(tutDone(0, 2, 1), false);   // died after 3 flaps: not done yet
  assert.equal(tutDone(0, 3, 1), true);
  assert.equal(tutDone(0, 1, TUT_MAX_RUNS), true);
  assert.equal(tutDone(0, 1, TUT_MAX_RUNS - 1), false);
});
```

- [ ] **Step 2: 실패 확인** — Run: `node --test tests/hitloop.test.js` Expected: FAIL `tutDone is not defined`.

- [ ] **Step 3: 구현**

`tutTick`의 사망/메뉴 분기: `tutRuns`(새 저장 키 `fw27_tutruns`, 시작 시 +1)를 세고 `if (tutDone(0, tutStep, tutRuns)) { store.set('fw27_tut', 1); evTrack('tutorial_done', {how:'run'}); }` 아니면 `tutStep = 0`만 (다음 판에 다시 tut1부터). `startFromMenu`: `if (!tutDone(store.get('fw27_tut', 0), 0, store.get('fw27_tutruns', 0)))` 튜토리얼 시작. `FS_KEYS`/`fsSnap`에 `fw27_tutruns`는 넣지 않는다(기기 로컬).

- [ ] **Step 4: 통과 확인** — Run: `npm test` Expected: PASS. 수동: 새 프로필에서 3탭 후 사망 → 다음 PLAY NOW가 다시 튜토리얼.

- [ ] **Step 5: 커밋** — `git commit -m "fix: tutorial completes on the DASH tip or after three runs, not three taps"`

---

### Task 5: 리더보드의 숨김 유닛 가리기 (높음 #6)

**Files:**
- Modify: `index.html:5361`, `5367` (LB row), `5455` (friends row), `6311` (versus 상대 표시)
- Modify: hit-loop 블록 — 순수 함수 추가
- Test: `tests/hitloop.test.js`

**Interfaces:**
- Produces: `boardUnit(bd, ownedHas) -> { name, col } | null` — `bd` 없으면 null; `bd.hidden && !ownedHas(bd.id)`이면 `{ name: '???', col: [260, 20, 45] }`; 아니면 `{ name: bd.name, col: bd.uiCol || bd.col }`.

- [ ] **Step 1: 실패하는 테스트**

```js
test('a hidden unit on a board is ??? for players who do not own it', () => {
  const aurora = { id: 'aurora', name: 'AURORA', hidden: true, col: [160, 90, 58] };
  assert.deepEqual(boardUnit(aurora, () => false), { name: '???', col: [260, 20, 45] });
  assert.deepEqual(boardUnit(aurora, id => id === 'aurora'), { name: 'AURORA', col: [160, 90, 58] });
  assert.deepEqual(boardUnit({ id: 'volt', name: 'VOLT', col: [1, 2, 3], uiCol: [4, 5, 6] }, () => false), { name: 'VOLT', col: [4, 5, 6] });
  assert.equal(boardUnit(undefined, () => true), null);
});
```

- [ ] **Step 2: 실패 확인** — Run: `node --test tests/hitloop.test.js` Expected: FAIL.

- [ ] **Step 3: 구현** — 네 호출부를 `const u = boardUnit(birdById(r.bird), id => owned.has(id))`로 바꾸고 `dot.title = u.name`, `ub.textContent = u.name`, `hsl(u.col)` 사용. 6311은 `${boardUnit(birdById(o.bird) || BIRDS[0], id => owned.has(id)).name}`.

- [ ] **Step 4: 통과 확인** — Run: `npm test` Expected: PASS. 수동: 라이브 보드 "전체" 탭 1·2위가 `???`로 보임.

- [ ] **Step 5: 커밋** — `git commit -m "fix: boards show ??? for hidden units the viewer does not own"`

---

### Task 6: 한국어 오역 + CJK 줄바꿈 (높음 #9, #10)

**Files:**
- Modify: `index.html:827` (`ko` 배열의 `'미식'` → `'신화'`), 862 `hUnits`에 '미식'이 있으면 함께
- Modify: `styles.css` (끝에 추가)
- Test: `tests/i18n.test.js`, `tests/brand.test.js`

- [ ] **Step 1: 실패하는 테스트**

`tests/i18n.test.js`:
```js
test('Korean rarity names: mythic is 신화, never the food word', () => {
  const ko = I18N.ko; assert.equal(ko.r_mythic, '신화');
  for (const v of Object.values(ko)) assert.doesNotMatch(String(v), /미식/);
});
```
`tests/brand.test.js`:
```js
test('CJK text wraps at word boundaries', () => {
  const css = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');
  assert.match(css, /:lang\(ko\)[^{]*\{[^}]*word-break:\s*keep-all[^}]*overflow-wrap:\s*anywhere/);
  assert.match(css, /:lang\(ja\)[^{]*\{[^}]*word-break:\s*auto-phrase/);
  assert.match(css, /:lang\(ja\) \.btn[^{]*\{[^}]*white-space:\s*nowrap/);
});
```
(`I18N`은 `tests/helpers/i18n.js`의 기존 로더로 얻는다.)

- [ ] **Step 2: 실패 확인** — Run: `node --test tests/i18n.test.js tests/brand.test.js` Expected: FAIL.

- [ ] **Step 3: 구현**

`styles.css` 끝:
```css
/* CJK line breaking: Korean keeps words whole, Japanese breaks at phrase boundaries where the browser can */
html:lang(ko) body{word-break:keep-all;overflow-wrap:anywhere}
html:lang(ja) body{word-break:auto-phrase;line-break:strict}
html:lang(ja) .btn{white-space:nowrap}
```
`index.html:827` `'미식'` → `'신화'`.

- [ ] **Step 4: 통과 확인** — Run: `npm test` Expected: PASS. 수동: ko-KR/ja-JP 390px에서 도움말·친구 화면 스크린샷(검수자 5 `rev5/*.png`와 비교).

- [ ] **Step 5: 커밋** — `git commit -m "fix: Korean mythic rarity reads 신화; CJK text wraps at word boundaries"`

---

### Task 7: 첫 로드 체감 개선 — 부팅 표시·로고 WebP·비차단 폰트 (높음 #7)

**Files:**
- Modify: `index.html:19` (폰트 link), `423` (로고 img), `<body>` 첫 줄 (grep `<body`), 스크립트 끝(메뉴 표시 직후, `renderVsBadge();` 6390 부근)
- Create: `logo-swishby.webp` (`cwebp -q 82 logo-swishby.png -o logo-swishby.webp`)
- Test: `tests/brand.test.js`

- [ ] **Step 1: 실패하는 테스트**

```js
test('first paint shows a boot indicator and nothing blocks it', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const body = html.indexOf('<body'), boot = html.indexOf('id="boot"'), script = html.indexOf('<script', body);
  assert.ok(boot > body && boot < script, 'boot indicator is in the body before the first script');
  assert.match(html, /<link rel="preload" as="style" href="https:\/\/fonts\.googleapis\.com\/css2[^"]*">/);
  assert.match(html, /<link rel="stylesheet" href="https:\/\/fonts\.googleapis\.com\/css2[^"]*" media="print" onload="this\.media='all'">/);
  assert.match(html, /<picture><source srcset="logo-swishby\.webp" type="image\/webp"><img class="logoimg" src="logo-swishby\.png"/);
  assert.ok(statSync(new URL('../logo-swishby.webp', import.meta.url)).size < 60 * 1024, 'webp logo under 60 KB');
  assert.match(html, /\$\('boot'\)\.remove\(\)/);
});
```

- [ ] **Step 2: 실패 확인** — Run: `node --test tests/brand.test.js` Expected: FAIL.

- [ ] **Step 3: 구현**

- `<body>` 직후: `<div id="boot" aria-hidden="true"><i></i></div>` + 첫 `<style>`(1행 인라인)에 `#boot{position:fixed;inset:0;display:grid;place-items:center;background:#07050f}#boot i{width:28px;height:28px;border:3px solid #4ff0ff;border-right-color:transparent;border-radius:50%;animation:bt 1s linear infinite}@keyframes bt{to{transform:rotate(1turn)}}`.
- 스크립트가 메뉴를 그린 뒤(`renderVsBadge();` 다음 줄) `$('boot').remove();`.
- 폰트: preload + `media="print" onload` 패턴, `<noscript>`에 일반 stylesheet.
- 로고: `<picture>`로 WebP 우선. `cwebp -q 82` 결과 60 KB 미만 확인(아니면 `-q 75`).

- [ ] **Step 4: 통과 확인** — Run: `npm test` Expected: PASS. 수동: Playwright Slow 3G에서 0.5초 내 스피너가 보이고 메뉴에서 사라짐; 버튼 폰트 FOUT 확인(허용).

- [ ] **Step 5: 커밋** — `git commit -m "perf: boot indicator, WebP logo and non-blocking fonts for the first load"`

---

### Task 8: 저품질 모드가 실제로 가벼워지게 — 글로우 끄기·DPR 캡 (높음 #8)

**Files:**
- Modify: `index.html` fx-core 블록 `fxFeatures`(1450-1460) — `glow`, `dprCap` 추가
- Modify: `index.html:2059` (`resize`), 글로우 핫스팟 5곳: 2473, 2514-2516, 3441-3442, 3478-3480, 3495
- Test: `tests/fx-core.test.js`

**Interfaces:**
- Produces: `fxFeatures(q, a11y, rm, fair).glow -> boolean` (low: false, mid/high: true), `.dprCap -> number` (low: 1.5, mid: 2, high: 2). 헬퍼 `const glowPx = px => IMP.feat.glow ? px : 0;`

- [ ] **Step 1: 실패하는 테스트**

```js
test('low quality drops canvas glow and caps the backing store at 1.5x', () => {
  const a = { shake: true, flash: true };
  assert.equal(fxFeatures('low', a, false, false).glow, false);
  assert.equal(fxFeatures('mid', a, false, false).glow, true);
  assert.equal(fxFeatures('high', a, false, false).glow, true);
  assert.equal(fxFeatures('low', a, false, false).dprCap, 1.5);
  assert.equal(fxFeatures('high', a, false, false).dprCap, 2);
});
```

- [ ] **Step 2: 실패 확인** — Run: `node --test tests/fx-core.test.js` Expected: FAIL.

- [ ] **Step 3: 구현**

`fxFeatures`에 `glow: !low, dprCap: low ? 1.5 : 2`. `resize()`: `dpr = Math.min(window.devicePixelRatio || 1, IMP ? IMP.feat.dprCap : 2)`; `impNew` 뒤 품질이 바뀌면 `resize()` 호출(`fxApply`와 6400의 `IMP = impNew(q2)` 뒤). 핫스팟 5곳의 `ctx.shadowBlur = N` → `ctx.shadowBlur = glowPx(N)`. 다른 71곳은 손대지 않는다(수치 측정 후 다음 패치).

- [ ] **Step 4: 통과 확인** — Run: `npm test` Expected: PASS. 수동: `#dev`에서 `FW.setFxQuality('low')` 후 검수자 4의 `rev4` 프레임 측정 스크립트로 CPU 4x p50이 auto 대비 줄어드는지 기록(목표 ≤ 50 ms). 실기기(중저가 안드로이드) 측정은 별도 후속.

- [ ] **Step 5: 커밋** — `git commit -m "perf: low quality turns canvas glow off and caps DPR at 1.5"`

---

### Task 9: 운영 — 라이브 보드의 QA 계정 숨김 런북 (높음 #5)

**Files:**
- Create: `docs/launch/board-cleanup.md`
- Test: `tests/legal.test.js`에 존재·필수 항목 검사 1건 (문서 테스트 선례와 같은 방식)

코드 변경 없음. 서버에 이미 `admin_set_hidden(p_id, true)`(점수·대전 행 숨김)와 `admin_tester_set`이 있다.

- [ ] **Step 1: 실패하는 테스트**

```js
test('the launch board cleanup runbook names the tool and the accounts', () => {
  const md = readFileSync(new URL('../docs/launch/board-cleanup.md', import.meta.url), 'utf8');
  for (const s of ['admin_set_hidden', 'admin_tester_set', 'QAb A1Z', 'QATEST', 'QA-B2', '2026-11-17']) assert.ok(md.includes(s), s);
});
```

- [ ] **Step 2: 실패 확인** — Expected: FAIL ENOENT.

- [ ] **Step 3: 문서 작성** — 내용: (1) `admin.html`에 owner 로그인(MFA) → 플레이어 검색 `QAb A1Z`, `QATEST`, `QA-B2`, `민황`(실제 플레이어인지 먼저 확인) → 숨김; (2) 같은 계정을 `admin_tester_set(on)`으로 표시해 앞으로의 기록도 보드에서 제외; (3) 출시일 2026-11-17 전날 "전체" 탭 상위 50을 다시 훑는 체크리스트; (4) 확인 쿼리 `select nick, bird, score from public.fw_scores where hidden order by score desc limit 20;`.

- [ ] **Step 4: 통과 확인** — Run: `npm test` Expected: PASS.

- [ ] **Step 5: 커밋** — `git commit -m "docs: launch runbook for hiding QA accounts from the live boards"`

---

## 실행 후 수동 확인 체크리스트 (최종 리뷰어용)
- 치트: 로컬 `#dev`에서 `fw27_wallet2`를 9.9M 코인으로 바꾸고 로그인 → 클라우드 저장이 `fw_bad_input`로 거부되고 로컬은 5e7로 클램프.
- 대전 중 P키·버튼·탭 숨김 3경로.
- rAF 20fps 강제 시 게임 시간 비율.
- 새 프로필 튜토리얼 3회.
- 보드 `???`, 한국어 `신화`, ja 버튼 한 줄.
- Slow 3G 부팅 스피너.
