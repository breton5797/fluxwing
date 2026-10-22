// Admin page smoke: node tests/e2e/admin-smoke.mjs  (starts scripts/serve.mjs on 127.0.0.1:$PORT, default 5174, unless one answers there)
// Nothing reaches a real server: every *.supabase.co request is answered by a fake backend here, and the SDK from the CDN is
// served from node_modules (the identical file, so the page's SRI hash still holds). A signed-in session sits in the SDK's
// storage key before the page loads, as the game would have left it.
// Checks: an owner sees all nine tabs and each renders with no page error; a nickname with markup in it stays text (no <img>,
// window.__xss untouched); the delete button wakes up only once the id is retyped and sends p_confirm; a mod sees no owner
// tabs and no delete; admin_me false shows the no-permission screen; no session shows the sign-in screen with no guest option.
// Second factor: an owner at aal1 keeps the mod tabs, the owner tabs show the TOTP step (enrol: QR + secret, or a code for a
// verified factor); after the fake verify the session is aal2, admin_me says so and the owner tabs work. In a frame: nothing runs.
// Charts: every chart is an inline SVG that answers hover and keyboard focus with a tooltip, its 표로 보기 twin opens and closes,
// and a markup nickname stays text inside SVG labels and tooltips. Google Fonts are stubbed (SHOT_DIR=… lets them through for screenshots).
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';

const PORT = Number(process.env.PORT) || 5174, base = `http://127.0.0.1:${PORT}/admin.html`;
const SDK = readFileSync(new URL('../../node_modules/@supabase/supabase-js/dist/umd/supabase.js', import.meta.url), 'utf8');
const up = () => fetch(base).then(r => r.ok, () => false);
let srv = null;
if (!(await up())){
  srv = spawn(process.execPath, [new URL('../../scripts/serve.mjs', import.meta.url).pathname], { env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore' });
  for (let i = 0; i < 50 && !(await up()); i++) await new Promise(r => setTimeout(r, 100));
}

const XSS = '<img src=x onerror=window.__xss=1>';
const ME = '00000000-0000-4000-8000-0000000000aa', P1 = '11111111-1111-4111-8111-111111111111', P2 = '22222222-2222-4222-8222-222222222222';
const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
const exp = Math.floor(Date.now() / 1000) + 3600;
const user = { id: ME, aud: 'authenticated', role: 'authenticated', email: 'boss@example.com', is_anonymous: false, app_metadata: { provider: 'google' }, user_metadata: {}, created_at: '2026-10-01T00:00:00Z' };
const JWT = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: ME, role: 'authenticated', aud: 'authenticated', exp, is_anonymous: false, email: user.email })}.sig`;
const sess = { access_token: JWT, token_type: 'bearer', expires_in: 3600, expires_at: exp, refresh_token: 'r1', user };
const now = new Date().toISOString(), seoul = n => new Date(Date.now() + 9 * 3600e3 - n * 864e5).toISOString().slice(0, 10), day = seoul(0);
// 30 realistic days, newest first as the server sends them: a weekly wave on a slow climb; retention empty where the day has not ended
const wave = (i, base, amp, k = 1) => +(base + amp * Math.sin(i / 1.1 * k) - i * base / 90).toFixed(2);
const DAYS = Array.from({ length: 30 }, (_, i) => seoul(i));
const P = n => `${String(n).repeat(8)}-${String(n).repeat(4)}-4${String(n).repeat(3)}-8${String(n).repeat(3)}-${String(n).repeat(12)}`;
const NICKS = ['Ace', '<img src=x onerror=window.__xss=1>', '하늘다람쥐', 'Nimbus', 'zz_top', '구름위로', 'Pilot', 'FlapKing', 'gate.runner', '밤하늘'];
const KPI = {
  installs: DAYS.map((d, i) => ({ day: d, installs: Math.round(wave(i, 34, 9)) })),
  retention: DAYS.map((d, i) => ({ day: d, installs: Math.round(wave(i, 34, 9)), d1: i < 2 ? null : i === 9 ? 40.5 : wave(i, 38, 5, 2), d7: i < 8 ? null : wave(i, 16, 3, 2), d30: null })),
  daily: DAYS.map((d, i) => ({ day: d, dau: Math.round(wave(i, 140, 22)), runs_per_dau: wave(i, 6.1, 0.6, 3), share_rate: wave(i, 4.2, 1.1, 2), purchase_conversion: wave(i, 1.3, 0.4, 3), ad_views: 0, daily_runs: Math.round(wave(i, 60, 12)) })),
  sessions: DAYS.map((d, i) => ({ day: d, sessions: Math.round(wave(i, 260, 40)), avg_min: wave(i, 4.6, 0.5, 2), median_min: wave(i, 3.4, 0.4, 2) }))
};

const sessOf = aal => ({ ...sess, access_token: `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: ME, role: 'authenticated', aud: 'authenticated', exp, is_anonymous: false, email: user.email, aal })}.sig` });
const SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="21" height="21"><path d="M0 0h7v7H0z" fill="#000"/></svg>';
const canned = role => ({
  admin_overview: { users: { total: 1234, guests: 900, signed_in: 334, new_1d: 12, new_7d: 80 }, players: { scores: 800, versus: 300, hidden: 3 },
    season: { season: 202610, prev: 202609, rolled_at: now }, reports: { open_targets: 2, last_1d: 4 }, errors: { last_1d: 7 }, push: { devices: 40 }, testers: { count: 3 }, admins: { count: 2 },
    cron: [{ job: 'fw_vs_tick', schedule: '*/10 * * * *', active: true, last_status: 'succeeded', last_at: now }] },
  admin_kpi: KPI,
  admin_players: { total: 2, rows: [
    { id: P1, nick: XSS, cc: 'KR', best: 120, rp: 1500, hidden: false, guest: true, provider: 'anonymous', created_at: now, last_sign_in_at: now, reports: 3 },
    { id: P2, nick: 'Ace', cc: 'US', best: 99, rp: null, hidden: true, guest: false, provider: 'google', created_at: now, last_sign_in_at: null, reports: 0 }] },
  admin_player: { id: P1, guest: true, provider: 'anonymous', email: role === 'owner' ? 'p1@example.com' : null, created_at: now, last_sign_in_at: now, tester: false, admin_role: null,
    scores: { nick: XSS, cc: 'KR', best: 120, gates: 120, bird: 'b1', daily_key: day, daily_score: 40, hidden: false, last_submit_at: now },
    versus: { nick: XSS, rp: 1500, wins: 3, losses: 1, draws: 0, hidden: false }, standings: [{ season: 4, rank: 2, rp: 1800, tier: 'gold', claimed_at: null }],
    save: { rev: 7, updated_at: now }, reports_received: [{ reason: 'name', place: 'lb', nick: XSS, seen: false, at: now }], reports_sent: 0, referrals: { invited: 1, held: 1 }, push_devices: 1,
    events: [{ at: now, kind: 'run_end', props: { score: 12, note: XSS } }], errors: [{ at: now, build: 'L1', msg: XSS }] },
  admin_set_hidden: { id: P1, hidden: true },
  admin_reset_nick: { id: P1, nick: 'Pilot' },
  admin_reports: [{ target: P1, nick: XSS, reason: 'name', n: 4, counted: 3, last: now, places: ['lb', 'vs'], hidden: false },
    { target: P1, nick: XSS, reason: 'cheat', n: 1, counted: 0, last: now, places: ['vs'], hidden: false },
    ...[3, 4, 5, 6, 7].map((k, i) => ({ target: P(k), nick: NICKS[k], reason: i % 2 ? 'other' : 'name', n: 5 - i, counted: i % 2 ? 0 : Math.max(0, 2 - i), last: now, places: ['lb'], hidden: k === 6 }))],
  admin_reports_clear: { deleted: 3 },
  admin_testers: [{ id: P2, nick: 'Ace', note: XSS, added_at: now }],
  admin_tester_set: { id: P1, tester: true },
  admin_errors: [{ id: 1, at: now, player_id: P1, build: 'L1', msg: XSS, stack: XSS + '\n at x', url: 'https://swishby.com/', ua: 'UA' }],
  admin_referrals_held: [{ invitee: P1, inviter: P2, inviter_nick: 'Ace', invitee_nick: XSS, invitee_best: 120, linked_at: now, days: 2, stage: 1 }],
  admin_referral_release: { released: 1 },
  admin_season: { season: 202610, prev: 202609, rolled_at: now, top: NICKS.map((nick, i) => ({ rank: i + 1, nick, rp: 2400 - i * 170, tier: i < 3 ? 'gold' : 'silver', claimed_at: i % 3 ? now : null })),
    live: NICKS.map((nick, i) => ({ nick, rp: 1480 - i * 115, wins: 30 - i * 2, losses: 8 + i })) },
  admin_season_tick: { season: 5 },
  admin_delete_player: { deleted: true },
  admin_log: [{ at: now, admin_id: ME, admin_nick: 'Boss', action: 'hide', target: P1, detail: { nick: XSS } }]
});

const b = await chromium.launch();
async function open({ role, signedIn = true, width = 1280, aal = 'aal2', factors = [], over = {} }){
  const ctx = await b.newContext({ viewport: { width, height: 900 } }), page = await ctx.newPage(), calls = [], errors = [], data = { ...canned(role), ...over }, sbReqs = [];
  const st = { aal, factors: factors.map(f => ({ ...f })), verifies: [] };
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push('console: ' + m.text()); });
  page.on('dialog', d => { errors.push('native dialog: ' + d.type()); d.dismiss(); });
  if (signedIn) await page.addInitScript(s => localStorage.setItem('sb-ecjeyelgcqbliavwltbc-auth-token', s), JSON.stringify(sess));
  await page.route(/cdn\.jsdelivr\.net/, r => r.fulfill({ status: 200, contentType: 'text/javascript', body: SDK, headers: { 'access-control-allow-origin': '*' } }));
  await page.route(/fonts\.(googleapis|gstatic)\.com/, r => process.env.SHOT_DIR ? r.continue() : r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  await page.route(/supabase\.co/, async r => {
    sbReqs.push(r.request().url());
    const req = r.request(), u = new URL(req.url()), H = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
    const json = (body, status = 200) => r.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body), headers: H });
    if (req.method() === 'OPTIONS') return r.fulfill({ status: 204, headers: H });
    if (u.pathname === '/auth/v1/settings') return json({ external: { google: true, apple: true } });
    if (u.pathname === '/auth/v1/user') return json({ ...user, factors: st.factors });
    if (u.pathname === '/auth/v1/factors' && req.method() === 'POST'){
      const f = { id: 'f' + (st.factors.length + 1), factor_type: 'totp', friendly_name: JSON.parse(req.postData()).friendly_name, status: 'unverified' };
      st.factors = [...st.factors, f];
      return json({ id: f.id, type: 'totp', friendly_name: f.friendly_name, totp: { qr_code: SVG, secret: 'JBSWY3DPEHPK3PXP', uri: 'otpauth://totp/SWISHBY:boss' } });
    }
    const fm = u.pathname.match(/^\/auth\/v1\/factors\/([^/]+)(?:\/(challenge|verify))?$/);
    if (fm && req.method() === 'DELETE'){ st.factors = st.factors.filter(f => f.id !== fm[1]); return json({ id: fm[1] }); }
    if (fm && fm[2] === 'challenge') return json({ id: 'c-' + fm[1], type: 'totp', expires_at: exp });
    if (fm && fm[2] === 'verify'){
      const body = JSON.parse(req.postData()); st.verifies.push({ factor: fm[1], ...body });
      if (body.code !== '123456' || body.challenge_id !== 'c-' + fm[1]) return json({ code: 'mfa_verification_failed', message: 'Invalid TOTP code entered' }, 422);
      st.factors = st.factors.map(f => f.id === fm[1] ? { ...f, status: 'verified' } : f); st.aal = 'aal2';
      return json(sessOf('aal2'));
    }
    if (u.pathname === '/auth/v1/token') return json(sess);
    if (u.pathname === '/auth/v1/logout') return r.fulfill({ status: 204, headers: H });
    const m = u.pathname.match(/^\/rest\/v1\/rpc\/([a-z_]+)$/);
    if (m){
      calls.push({ name: m[1], body: JSON.parse(req.postData() || '{}'), auth: req.headers()['authorization'] });
      if (m[1] === 'admin_me') return json(role ? { admin: true, role, aal: st.aal } : { admin: false, role: null, aal: null });
      if (role === 'owner' && st.aal !== 'aal2' && ['admin_testers', 'admin_tester_set', 'admin_referrals_held', 'admin_referral_release', 'admin_season_tick', 'admin_delete_player', 'admin_log'].includes(m[1]))
        return json({ code: '42501', message: 'fw_admin_mfa: second factor required' }, 403);
      if (!(m[1] in data)) return json({ code: 'PGRST202', message: 'unknown ' + m[1] }, 404);
      return json(data[m[1]]);
    }
    errors.push('unexpected request ' + u.pathname);
    return json({ message: 'no' }, 404);
  });
  await page.goto(base);
  return { ctx, page, calls, errors, st, sbReqs };
}
const tabLabels = page => page.$$eval('#tabs button', bs => bs.map(x => x.textContent));
const noMarkup = async page => {
  assert.equal(await page.locator('#view img').count(), 0, 'no <img> from data');
  assert.equal(await page.evaluate(() => window.__xss), undefined, 'onerror never ran');
};
// every chart in the view: an SVG with marks; hover and keyboard focus each bring the tooltip; the table twin opens and closes
async function chartsWork(page, want){
  const figs = page.locator('#view figure.fig');
  assert.equal(await figs.count(), want, 'chart count');
  for (let i = 0; i < want; i++){
    const f = figs.nth(i), svg = f.locator('svg.chart').first();
    await svg.waitFor();
    assert.ok(await f.locator('svg.chart path[d^="M"]').count() > 0, `chart ${i} has marks`);
    const bb = await svg.boundingBox();
    await page.mouse.move(bb.x + bb.width * 0.7, bb.y + bb.height * 0.45);
    await f.locator('.tip:not([hidden])').waitFor({ timeout: 3000 });
    await page.mouse.move(0, 0);
    await f.locator('.tip').waitFor({ state: 'hidden' });
    await svg.focus();
    await f.locator('.tip:not([hidden])').waitFor({ timeout: 3000 });
    await page.keyboard.press('ArrowLeft');
    assert.ok((await f.locator('.tip').textContent()).length > 0);
    await page.evaluate(() => document.activeElement.blur());
    const btn = f.locator('.tbl-btn');
    if (await btn.count()){
      const was = await btn.getAttribute('aria-expanded');
      await btn.click();
      assert.equal(await btn.getAttribute('aria-expanded'), was === 'true' ? 'false' : 'true');
      assert.equal(await f.locator('.twin').isVisible(), was !== 'true', 'the table twin toggles');
      await btn.click();
    }
  }
}
const settled = page => page.waitForFunction(() => !/^불러오는 중/.test(document.getElementById('view').textContent));
const clickTab = async (page, label) => { await page.click(`#tabs button:text-is("${label}")`); await settled(page); };
const shot = (page, name) => process.env.SHOT_DIR ? page.screenshot({ path: `${process.env.SHOT_DIR}/${name}`, fullPage: true }) : null;

// --- owner: every tab, the XSS nickname, the delete flow
{
  const { ctx, page, calls, errors } = await open({ role: 'owner' });
  await page.waitForSelector('#app:not([hidden]) #tabs button');
  assert.deepEqual(await tabLabels(page), ['개요', '지표', '플레이어', '신고', '시즌', '오류', '테스터', '추천', '기록']);
  await page.waitForSelector('#view .vw');
  assert.match(await page.textContent('#view'), /1,234/);
  assert.equal(calls[0].auth, 'Bearer ' + JWT, 'the stored session is used');
  assert.equal(await page.textContent('#roleTag'), 'owner');
  await shot(page, 'admin-overview-1280.png');
  const seen = {};
  for (const label of ['지표', '플레이어', '신고', '시즌', '오류', '테스터', '추천', '기록', '개요']){
    await clickTab(page, label);
    const txt = await page.textContent('#view');
    assert.doesNotMatch(txt, /서버 오류|권한 없음|입력 오류|서버 함수 없음/, label + ': ' + txt.slice(0, 200));
    seen[label] = txt;
    await noMarkup(page);
  }
  for (const label of ['플레이어', '신고', '시즌', '오류', '추천']) assert.ok(seen[label].includes(XSS), `${label} shows the nickname as text`);
  // overview: the hero flight path, two sparklines, the users split; then each chart tab
  assert.equal(await page.locator('#view .hero svg.chart path.ln').count(), 1);
  assert.match(await page.textContent('#heroCmp'), /^어제는 [\d,]+명으로 그 전 7일 평균(보다 \d+% (많음|적음)|과 같음)$/, 'a full month compares yesterday');
  assert.match(await page.textContent('#view .hero-n'), /^[\d,]+$/);
  assert.equal(await page.locator('#view .vital svg.chart').count(), 2, 'sparklines');
  assert.equal(await page.locator('#view .split i').count(), 2);
  assert.match(await page.textContent('#view ul.cron'), /✓\s*성공/);
  await chartsWork(page, 1);
  assert.deepEqual(calls.filter(c => c.name === 'admin_kpi')[0].body, { p_days: 30 }, 'the overview asks for 30 days');
  await clickTab(page, '지표');
  await chartsWork(page, 6);
  assert.equal(await page.locator('#view figure:has-text("리텐션") .keys span').count(), 3, 'retention legend');
  const tickTexts = async t => page.locator(`#view figure:has(.fig-t:text-is("${t}")) svg.chart > text`).allTextContents();
  for (const t of ['일일 활성 사용자', '설치']) assert.ok((await tickTexts(t)).filter(x => /^[\d.]+K?$/.test(x)).every(x => !x.includes('.')), `${t}: integer ticks`);
  for (const t of ['리텐션', '공유율', '구매 전환']) assert.ok((await tickTexts(t)).some(x => /^\d+(\.\d+)?%$/.test(x)), `${t}: % ticks`);
  assert.ok((await tickTexts('리텐션')).some(x => /^D1 \d+(\.\d)?%$/.test(x)), 'end label with one decimal');
  await page.click('#view .range button:text-is("90일")'); await settled(page);
  assert.deepEqual(calls.filter(c => c.name === 'admin_kpi').at(-1).body, { p_days: 90 });
  await page.click('#view .range button:text-is("30일")'); await settled(page);
  await clickTab(page, '신고');
  await chartsWork(page, 1);
  assert.ok((await page.locator('#view svg.chart text').allTextContents()).some(t => t.includes('<img src=x')), 'the nickname is SVG text');
  assert.equal(await page.locator('#view svg.chart line.mk').count(), 1, 'the auto-hide line');
  assert.ok((await page.locator('#view svg.chart text').allTextContents()).includes('자동 숨김 기준: 집계 3'));
  assert.equal(await page.locator('#view svg.chart g').first().locator('path').count(), 2, 'counted solid + the rest as a tint');
  assert.equal(await page.locator('#view svg.chart g').first().locator('path[fill-opacity="0.4"]').count(), 1);
  assert.equal(await page.locator('#view figure .keys span').count(), 2, 'the two parts have a legend');
  assert.equal(await page.locator('#view button.danger').count(), 0, 'row actions are quiet');
  const rTicks = await page.locator('#view svg.chart > text:not(.lbl):not(.val)').allTextContents();
  assert.ok(rTicks.filter(t => /^\d/.test(t)).every(t => /^\d+K?$/.test(t)), 'integer ticks: ' + rTicks);
  assert.ok(await page.locator('#view svg.chart tspan.crit').count() >= 1, 'hot rows carry a glyph');
  const bars = await page.locator('#view svg.chart').boundingBox();
  await page.mouse.move(bars.x + bars.width * 0.5, bars.y + 30);
  assert.ok((await page.textContent('#view .tip')).includes(XSS), 'the full nickname as tooltip text');
  assert.match(await page.textContent('#view .tip'), /신고 5건, 집계 3건/);
  await page.mouse.move(0, 0);
  await noMarkup(page);
  await clickTab(page, '시즌');
  await chartsWork(page, 1);
  await noMarkup(page);
  assert.match(await page.textContent('#view .facts'), /2026-10/);
  assert.match(seen['지표'], /40\.5%/);
  assert.deepEqual(calls.find(c => c.name === 'admin_kpi').body, { p_days: 30 });
  assert.deepEqual(calls.find(c => c.name === 'admin_players').body, { p_q: '', p_limit: 50, p_offset: 0 });

  // a write asks first in the page's own dialog; cancel sends nothing, confirm sends the contract's arguments
  await clickTab(page, '신고');
  const n0 = calls.length;
  await page.click('#view button:text-is("신고 정리")');
  await page.waitForSelector('#modal:not([hidden])');
  await page.click('#mNo');
  assert.equal(calls.length, n0, 'cancel sends nothing');
  await page.click('#view button:text-is("신고 정리")');
  assert.equal(await page.getAttribute('#mOk', 'class'), 'danger', 'the destructive confirm carries the critical fill');
  await page.click('#mOk');
  await page.waitForSelector('#toast:not([hidden])');
  await settled(page);
  assert.deepEqual(calls.find(c => c.name === 'admin_reports_clear').body, { p_target: P1, p_reason: 'name' });

  // player detail from the report's link, then the delete flow
  await page.click('#view button.link');
  await page.waitForSelector('#delBtn');
  await noMarkup(page);
  assert.ok((await page.textContent('#view')).includes('p1@example.com'), 'the owner sees the email');
  assert.equal(await page.isDisabled('#delBtn'), true, 'disabled before the id is typed');
  await page.fill('#delIn', P1.slice(0, -1));
  assert.equal(await page.isDisabled('#delBtn'), true, 'disabled with a near miss');
  await page.fill('#delIn', P1);
  assert.equal(await page.isDisabled('#delBtn'), false, 'enabled with the exact id');
  await page.click('#delBtn');
  await page.waitForSelector('#modal:not([hidden])');
  assert.match(await page.textContent('#mBody'), /되돌릴 수 없습니다/);
  await page.click('#mOk');
  await page.waitForFunction(() => document.querySelector('#view input[type=search]'));
  assert.deepEqual(calls.find(c => c.name === 'admin_delete_player').body, { p_id: P1, p_confirm: P1 });

  // the season tick (owner only) and the hide toggle from the list's detail
  await clickTab(page, '시즌');
  await page.click('#view button:text-is("정산 확인 실행")'); await page.click('#mOk');
  await page.waitForFunction(() => document.querySelector('#view .vw'));
  assert.ok(calls.some(c => c.name === 'admin_season_tick'));
  assert.deepEqual(errors, [], 'no page errors (owner)');
  console.log('PASS admin-smoke owner', calls.length, 'rpc calls,', [...new Set(calls.map(c => c.name))].length, 'distinct');
  await ctx.close();
}

// --- a young history: today + yesterday only (production began 10-21): no comparison yet, a quiet line; one day: a dot, no line
for (const n of [2, 1, 0]){
  const daily = KPI.daily.slice(0, n), kpi = { ...KPI, daily };
  const { ctx, page, errors } = await open({ role: 'owner', over: { admin_kpi: kpi } });
  await page.waitForSelector('#view .vw');
  if (n){
    assert.equal(await page.textContent('#view .hero-n'), String(daily[0].dau), 'the big number is today so far');
    assert.match(await page.textContent('#view .hero'), /오늘 지금까지 활성 사용자/);
    assert.equal(await page.textContent('#heroCmp'), '비교는 기록이 8일 쌓이면 보입니다');
    assert.equal(await page.getAttribute('#heroCmp', 'class'), 'hero-s quiet', 'no glyph, no colour');
  }
  assert.equal(await page.locator('#view .hero svg.chart path.ln').count(), n === 2 ? 1 : 0, `${n} days: line`);
  assert.equal(await page.locator('#view .hero svg.chart circle.glow').count(), n ? 1 : 0, `${n} days: the dot`);
  if (n === 0) assert.match(await page.textContent('#view .hero'), /아직 데이터가 없습니다/);
  assert.ok(await page.evaluate(() => { const s = document.querySelector('#view .hero svg.chart'); return !s || [...s.querySelectorAll('text')].every(t => t.getBBox().x + t.getBBox().width <= s.width.baseVal.value + 1); }), 'labels inside the chart');
  assert.deepEqual(errors, []);
  console.log('PASS admin-smoke hero with', n, 'days');
  await ctx.close();
}

// --- a server refusal is shown readably
{
  const { ctx, page, errors } = await open({ role: 'owner' });
  await page.waitForSelector('#view .vw');
  await page.route(/\/rest\/v1\/rpc\/admin_log/, r => r.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ code: '42501', message: 'fw_admin: not allowed' }), headers: { 'access-control-allow-origin': '*' } }));
  await page.click('#tabs button:text-is("기록")');
  await page.waitForFunction(() => /권한 없음/.test(document.getElementById('view').textContent));
  await page.route(/\/rest\/v1\/rpc\/admin_testers/, r => r.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ code: '42501', message: 'fw_admin_mfa: second factor required' }), headers: { 'access-control-allow-origin': '*' } }));
  await page.click('#tabs button:text-is("테스터")');
  await page.waitForFunction(() => /2단계 인증 필요/.test(document.getElementById('view').textContent));
  assert.deepEqual(errors, []);
  console.log('PASS admin-smoke error text');
  await ctx.close();
}

// --- mod: no owner tabs, no email, no delete, no season tick; 360px wide without a page-wide scroll
{
  const { ctx, page, errors } = await open({ role: 'mod', width: 360 });
  await page.waitForSelector('#app:not([hidden]) #tabs button');
  assert.deepEqual(await tabLabels(page), ['개요', '지표', '플레이어', '신고', '시즌', '오류']);
  await page.waitForSelector('#view .vw');
  await shot(page, 'admin-overview-360.png');
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= 360), 'no horizontal page scroll at 360px');
  await clickTab(page, '플레이어');
  await page.click('#view button.link');
  await page.waitForFunction(() => /시즌 기록/.test(document.getElementById('view').textContent));
  assert.equal(await page.locator('#delBtn').count(), 0, 'no delete for a mod');
  assert.ok(!(await page.textContent('#view')).includes('p1@example.com'));
  assert.equal(await page.locator('#view button:text-is("테스터 지정")').count(), 0);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= 360), 'player detail fits 360px');
  await shot(page, 'admin-player-360.png');
  await noMarkup(page);
  await clickTab(page, '시즌');
  assert.equal(await page.locator('#view button:text-is("정산 확인 실행")').count(), 0);
  await clickTab(page, '신고');
  const rb = await page.locator('#view svg.chart').boundingBox();
  await page.mouse.click(rb.x + rb.width * 0.5, rb.y + 30);
  await page.waitForFunction(() => /시즌 기록/.test(document.getElementById('view').textContent));
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= 360), 'charts fit 360px');
  assert.deepEqual(errors, [], 'no page errors (mod)');
  console.log('PASS admin-smoke mod');
  await ctx.close();
}

// --- owner at aal1, no factor yet: the mod tabs work, the owner tabs show the enrolment, a verified code opens them
{
  const { ctx, page, calls, errors, st } = await open({ role: 'owner', aal: 'aal1' });
  await page.waitForSelector('#app:not([hidden]) #tabs button');
  await page.waitForSelector('#view .vw');
  assert.deepEqual(await tabLabels(page), ['개요', '지표', '플레이어', '신고', '시즌', '오류', '테스터', '추천', '기록'], 'the owner tabs stay listed');
  assert.match(await page.textContent('#roleTag'), /2단계 미인증/);
  assert.equal(await page.isVisible('#mfaNote'), true);
  await clickTab(page, '신고');
  assert.ok((await page.textContent('#view')).includes(XSS), 'a mod-level tab works at aal1');
  await page.click('#view button.link'); await settled(page);
  assert.equal(await page.locator('#delBtn').count(), 0, 'no delete before the second factor');
  assert.equal(await page.locator('#view button:text-is("2단계 인증 필요")').count(), 1);
  await clickTab(page, '시즌');
  assert.equal(await page.locator('#view button:text-is("정산 확인 실행")').count(), 0);
  await clickTab(page, '기록');
  assert.match(await page.textContent('#view'), /2단계 인증 필요/);
  assert.ok(!calls.some(c => ['admin_log', 'admin_testers', 'admin_referrals_held'].includes(c.name)), 'owner reads wait for aal2');
  await noMarkup(page);
  await page.click('#mfaEnroll');
  await page.waitForSelector('#mfaQr');
  assert.match(await page.getAttribute('#mfaQr', 'src'), /^data:image\/svg\+xml;charset=utf-8,%3Csvg/);
  assert.ok(await page.evaluate(() => { const i = document.getElementById('mfaQr'); return i.complete && i.naturalWidth > 0; }), 'the QR renders under the CSP');
  assert.equal(await page.textContent('#mfaSecret'), 'JBSWY3DPEHPK3PXP');
  assert.equal(st.factors[0].friendly_name, 'SWISHBY admin');
  await page.fill('#mfaCode', '000000'); await page.click('#mfaGo');
  await page.waitForFunction(() => /맞지 않/.test(document.getElementById('mfaMsg').textContent));
  assert.equal(st.aal, 'aal1');
  await page.fill('#mfaCode', '123456'); await page.click('#mfaGo');
  await page.waitForSelector('#mfaNote', { state: 'hidden' });
  await page.waitForFunction(() => document.querySelector('#view table'));
  assert.equal(await page.textContent('#roleTag'), 'owner');
  const log = calls.find(c => c.name === 'admin_log');
  assert.ok(log && log.auth === 'Bearer ' + sessOf('aal2').access_token, 'owner calls go out with the aal2 token');
  assert.ok((await page.textContent('#view')).includes('hide'), 'the log renders');
  await clickTab(page, '테스터');
  assert.doesNotMatch(await page.textContent('#view'), /2단계 인증 필요|권한 없음/);
  assert.deepEqual(errors, [], 'no page errors (mfa enrol)');
  console.log('PASS admin-smoke mfa enrol', st.verifies.length, 'verify calls');
  await ctx.close();
}

// --- owner at aal1 with a verified factor: just the code
{
  const { ctx, page, errors, st } = await open({ role: 'owner', aal: 'aal1', factors: [{ id: 'f9', factor_type: 'totp', friendly_name: 'SWISHBY admin', status: 'verified' }] });
  await page.waitForSelector('#view .vw');
  await page.click('#mfaNoteBtn');
  await page.waitForSelector('#mfaCode');
  assert.equal(await page.locator('#mfaEnroll').count(), 0, 'no second enrolment');
  await page.fill('#mfaCode', '123 456'); await page.click('#mfaGo');
  await page.waitForSelector('#mfaNote', { state: 'hidden' });
  assert.deepEqual(st.verifies.map(v => [v.factor, v.code]), [['f9', '123456']]);
  await clickTab(page, '기록');
  assert.ok((await page.textContent('#view')).includes('hide'));
  assert.deepEqual(errors, [], 'no page errors (mfa code)');
  console.log('PASS admin-smoke mfa code');
  await ctx.close();
}

// --- inside a frame: a line of text, no client, no request to Supabase
{
  const ctx = await b.newContext(), page = await ctx.newPage(), sbReqs = [], errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.route(/supabase\.co/, r => { sbReqs.push(r.request().url()); return r.abort(); });
  await page.route(/cdn\.jsdelivr\.net/, r => r.fulfill({ status: 200, contentType: 'text/javascript', body: SDK, headers: { 'access-control-allow-origin': '*' } }));
  await page.addInitScript(s => localStorage.setItem('sb-ecjeyelgcqbliavwltbc-auth-token', s), JSON.stringify(sess));
  await page.goto(`http://127.0.0.1:${PORT}/privacy.html`);
  await page.evaluate(() => { const f = document.createElement('iframe'); f.id = 'fr'; f.src = 'admin.html'; document.body.append(f); });
  const fr = await (await page.waitForSelector('#fr')).contentFrame();
  await fr.waitForFunction(() => /다른 페이지 안에서 열 수 없습니다/.test(document.body.textContent));
  await page.waitForTimeout(500);
  assert.equal(await fr.locator('#app, #login, #tabs').count(), 0);
  assert.deepEqual(sbReqs, [], 'no Supabase request from a framed page');
  assert.deepEqual(errors, []);
  console.log('PASS admin-smoke framed');
  await ctx.close();
}

// --- design screenshots (SHOT_DIR only): overview, 지표, 신고, 시즌 at 1280 and 360
if (process.env.SHOT_DIR) for (const width of [1280, 360]){
  const { ctx, page, errors } = await open({ role: 'owner', width });
  await page.waitForSelector('#view .vw');
  await page.waitForTimeout(800);
  for (const [label, name] of [['개요', 'overview'], ['지표', 'kpi'], ['신고', 'reports'], ['시즌', 'season']]){
    await clickTab(page, label); await page.waitForTimeout(700);
    assert.ok(await page.evaluate(w => document.documentElement.scrollWidth <= w, width), `${name} fits ${width}px`);
    await shot(page, `design-${name}-${width}.png`);
  }
  await clickTab(page, '지표');
  const f = page.locator('#view figure.fig').nth(2);
  await f.scrollIntoViewIfNeeded();
  const bb = await f.locator('svg.chart').boundingBox();
  await page.mouse.move(bb.x + bb.width * 0.6, bb.y + bb.height * 0.4);
  await f.locator('.tip:not([hidden])').waitFor();
  await f.screenshot({ path: `${process.env.SHOT_DIR}/design-tooltip-${width}.png` });
  assert.deepEqual(errors, []);
  console.log('PASS admin-smoke screenshots', width);
  await ctx.close();
}

// --- signed in but not an admin
{
  const { ctx, page, calls, errors } = await open({ role: null });
  await page.waitForSelector('#denied:not([hidden])');
  assert.equal(await page.textContent('#deniedTitle'), '권한이 없습니다');
  assert.equal(await page.isHidden('#app'), true);
  assert.deepEqual([...new Set(calls.map(c => c.name))], ['admin_me'], 'nothing but admin_me is asked');
  await page.click('#deniedOut');
  await page.waitForSelector('#login:not([hidden])');
  assert.deepEqual(errors, []);
  console.log('PASS admin-smoke no permission');
  await ctx.close();
}

// --- no session: the sign-in screen, no rpc at all
{
  const { ctx, page, calls, errors } = await open({ role: 'owner', signedIn: false });
  await page.waitForSelector('#login:not([hidden])');
  assert.ok(await page.isVisible('#gBtn') && await page.isVisible('#aBtn') && await page.isVisible('#mailIn'));
  assert.doesNotMatch(await page.textContent('#login'), /게스트로/);
  assert.equal(calls.length, 0);
  assert.deepEqual(errors, []);
  console.log('PASS admin-smoke sign-in screen');
  await ctx.close();
}

await b.close();
if (srv) srv.kill();
