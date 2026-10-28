// Sign-in entries, daily grace / hours left and the iPad side bands: node tests/e2e/account-daily-smoke.mjs  (dev server: PORT=5173 node scripts/serve.mjs)
// Nothing reaches a real server: the offline part aborts every *.supabase.co request; the online part answers every one of them
// here with a fake guest session (the same fake backend as events-smoke). Screenshots land in $SHOTS (default: the system temp dir).
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const base = `http://127.0.0.1:${process.env.PORT || 5173}/index.html#dev`, shots = process.env.SHOTS || tmpdir();
const b = await chromium.launch();
const seedJs = s => { localStorage.clear(); for (const [k, v] of Object.entries(s)) localStorage.setItem(k, JSON.stringify(v)); };
const watch = (page, errors) => {
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|ERR_FAILED/.test(m.text())) errors.push('console: ' + m.text()); });
};
const menu = page => page.waitForFunction(() => window.FW && FW.state === 'menu');

// ---------- offline: daily grace + hours left, iPad bands, phone has none ----------
{
  const errors = [], ctx = await b.newContext({ viewport: { width: 390, height: 844 } }), page = await ctx.newPage(); watch(page, errors);
  await page.route(/supabase\.co/, r => r.abort());
  await page.goto(base);
  const twoAgo = await page.evaluate(() => new Date(Date.now() - 2 * 864e5).toISOString().slice(0, 10));
  await page.evaluate(seedJs, { fw27_tut: 1, fw27_lang: 'en', fw27_dintro: 1, fw27_dstreak: { last: twoAgo, streak: 4 } });
  await page.reload(); await menu(page);
  const sub = await page.textContent('#dailySub');
  assert.match(sub, /^Day 5 streak run · .* · \d{1,2} h left$/, 'one missed day keeps the streak, hours left shown: ' + sub);
  assert.equal(await page.isHidden('#acctTop'), true, 'offline: no sign-in, no icon');
  assert.equal(await page.evaluate(() => document.body.classList.contains('wide')), false, 'a phone has no side bands');
  await page.screenshot({ path: join(shots, 'p390-en-menu-offline.png') });
  for (const [w, h] of [[820, 1180], [1024, 1366]]){
    await page.setViewportSize({ width: w, height: h }); await page.waitForTimeout(700);
    assert.equal(await page.evaluate(() => document.getElementById('stage').clientWidth), 560, 'the play column stays 560 px');
    assert.equal(await page.evaluate(() => document.body.classList.contains('wide')), true, `${w}: side bands on`);
    const lum = await page.evaluate(() => { const c = document.getElementById('sideBg'), d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let s = 0; for (let i = 0; i < d.length; i += 4) s += d[i] + d[i + 1] + d[i + 2]; return s / (d.length / 4) / 3; });
    assert.ok(lum > 8, `${w}: the band copy holds the zone backdrop (mean ${lum.toFixed(1)})`);
    await page.screenshot({ path: join(shots, `ipad-${w}x${h}-menu.png`) });
    await page.evaluate(() => document.getElementById('startBtn').click());
    await page.evaluate(() => document.querySelector('#stageScr .stc').click());
    await page.waitForFunction(() => FW.state === 'play');
    await page.evaluate(() => { for (let i = 0; i < 240; i++){ if (i % 22 === 0) dispatchEvent(new KeyboardEvent('keydown', { code: 'Space' })); FW.step(1/120); } });
    await page.waitForTimeout(400);
    await page.screenshot({ path: join(shots, `ipad-${w}x${h}-play.png`) });
    await page.evaluate(() => FW.kill()); await page.waitForFunction(() => FW.state === 'over', null, { timeout: 10000 });
    await page.evaluate(() => document.getElementById('menuBtn').click()); await menu(page);
  }
  assert.deepEqual(errors, [], 'no page errors offline');
  await ctx.close();
  console.log('PASS account-daily offline:', sub);
}

// ---------- online against a fake backend: the three sign-in entries ----------
{
  const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
  const UID = '00000000-0000-4000-8000-00000000abcd', exp = Math.floor(Date.now() / 1000) + 3600;
  const JWT = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: UID, role: 'authenticated', aud: 'authenticated', exp, is_anonymous: true })}.sig`;
  const user = { id: UID, aud: 'authenticated', role: 'authenticated', is_anonymous: true, app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() };
  const sess = { access_token: JWT, token_type: 'bearer', expires_in: 3600, expires_at: exp, refresh_token: 'r1', user };
  const errors = [], ctx = await b.newContext({ viewport: { width: 390, height: 844 } }), page = await ctx.newPage(); watch(page, errors);
  await page.route(/supabase\.co/, async r => {
    const u = new URL(r.request().url()), cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
    const json = (body, status = 200) => r.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body), headers: cors });
    if (r.request().method() === 'OPTIONS') return r.fulfill({ status: 204, headers: cors });
    if (u.pathname === '/auth/v1/signup') return json(sess);
    if (u.pathname === '/auth/v1/user') return json(user);
    if (u.pathname === '/auth/v1/settings') return json({ external: {} });
    if (u.pathname.startsWith('/rest/v1/fw_scores')) return json(u.searchParams.get('player_id') ? null : []);
    if (u.pathname.startsWith('/rest/v1/rpc/')) return json(null);
    if (u.pathname.startsWith('/realtime/')) return r.abort();
    return json([]);
  });
  await page.goto(base);
  await page.evaluate(seedJs, { fw27_tut: 1, fw27_lang: 'en', fw27_dintro: 1 });
  await page.reload(); await menu(page);
  await page.waitForSelector('#acctTop:not([hidden])', { timeout: 20000 });
  await page.screenshot({ path: join(shots, 'p390-en-menu-guest.png') });
  for (const [w, h] of [[360, 780], [320, 640]]){ await page.setViewportSize({ width: w, height: h }); await page.waitForTimeout(300); await page.screenshot({ path: join(shots, `p${w}-en-menu-guest.png`) }); }
  const clash = await page.evaluate(() => { const a = document.getElementById('wallet').getBoundingClientRect(), t = document.getElementById('topBtns').getBoundingClientRect(); return a.right > t.left && a.top < t.bottom; });
  assert.equal(clash, false, 'the wallet never runs under the top buttons at 320 px');
  await page.setViewportSize({ width: 390, height: 844 });
  // 1. the top-bar icon opens the sign-in sheet
  await page.click('#acctTop');
  assert.equal(await page.isVisible('#authScr'), true); assert.equal(await page.isVisible('#authPick'), true);
  await page.screenshot({ path: join(shots, 'p390-en-auth-from-icon.png') });
  await page.click('#authClose');
  // 2. the first stage clear shows "save your progress" once
  const clearStage1 = async () => {
    await page.evaluate(() => document.getElementById('startBtn').click());
    await page.evaluate(() => document.querySelector('#stageScr .stc').click());
    await page.waitForFunction(() => FW.state === 'play');
    const ok = await page.evaluate(() => {
      const flap = () => dispatchEvent(new KeyboardEvent('keydown', { code: 'Space' }));
      for (let i = 0; i < 120 * 90 && FW.state === 'play'; i++){
        const g = FW.gates.find(q => !q.scored && q.x + q.w > FW.bird.x - 20), ty = g ? g.base + (g.off || 0) : 300;
        if (FW.bird.y > ty + 6 && FW.bird.vy > -120) flap();
        FW.step(1/120); if (FW.FX.clearDone) return true;
      }
      return FW.FX.clearDone;
    });
    assert.ok(ok, 'the bot clears stage 1');
    await page.evaluate(() => FW.kill()); await page.waitForFunction(() => FW.state === 'over', null, { timeout: 10000 });
  };
  await clearStage1();
  assert.equal(await page.isVisible('#oSave'), true, 'save prompt after the first clear');
  assert.equal(await page.textContent('#oSave span'), 'Save your progress? Sign in and your coins, units and stages stay safe on every device');
  assert.equal(await page.evaluate(() => localStorage.getItem('fw27_savepr')), '1');
  await page.screenshot({ path: join(shots, 'p390-en-result-saveprompt.png') });
  await page.click('#oSaveGo');
  assert.equal(await page.isVisible('#authScr'), true, 'Sign in opens the same sheet');
  await page.click('#authClose');
  await page.evaluate(() => document.getElementById('menuBtn').click()); await menu(page);
  await clearStage1();
  assert.equal(await page.isHidden('#oSave'), true, 'never a second time');
  await page.evaluate(() => document.getElementById('menuBtn').click()); await menu(page);
  // 3. the versus guest note has a sign-in button
  await page.evaluate(() => document.getElementById('vsBtn').click());
  await page.waitForSelector('#vsGuestRow:not([hidden])', { timeout: 10000 });
  await page.screenshot({ path: join(shots, 'p390-en-vs-guest.png') });
  await page.click('#vsGuestGo');
  assert.equal(await page.isVisible('#authScr'), true, 'the versus button opens the sheet');
  await page.click('#authClose');
  // Korean menu with the icon
  await page.evaluate(() => { localStorage.setItem('fw27_lang', '"ko"'); }); await page.reload(); await menu(page);
  await page.waitForSelector('#acctTop:not([hidden])', { timeout: 20000 });
  assert.equal(await page.getAttribute('#acctTop', 'aria-label'), '계정');
  await page.screenshot({ path: join(shots, 'p390-ko-menu-guest.png') });
  assert.deepEqual(errors, [], 'no page errors online');
  await ctx.close();
  console.log('PASS account-daily online');
}
await b.close();
