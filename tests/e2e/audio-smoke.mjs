// Audio lifecycle smoke: PORT=5173 node tests/e2e/audio-smoke.mjs [screenshot dir]   (dev server on 127.0.0.1)
// Suspend when hidden, stall catch-up, music off = no nodes, the full-mix peak, the effects screen in German. Supabase is blocked.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
const base = `http://127.0.0.1:${process.env.PORT || 5173}`, shots = process.argv[2];
const b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
await ctx.route(/supabase\.co/, r => r.abort());
const page = await ctx.newPage();
const errors = []; page.on('pageerror', e => errors.push(e.message));
const ready = () => page.waitForFunction(() => window.FW && window.FW.audio && document.readyState === 'complete', null, { timeout: 10000 });
const boot = async (lang = 'en', keep = false) => {
  await page.goto(`${base}/index.html#dev`);
  await page.evaluate(([l, k]) => { if (!k) localStorage.clear(); localStorage.setItem('fw27_tut', '1'); localStorage.setItem('fw27_lang', JSON.stringify(l)); }, [lang, keep]);
  await page.reload(); await ready();
};

// (d) the full mix through the real chain (compressor, master, buses), rendered offline per zone with the SFX on top
await boot();
const peaks = await page.evaluate(async () => {
  const A = FW.audio, out = [];
  for (let z = 0; z < 4; z++){
    const off = new OfflineAudioContext(2, 44100*4, 44100);
    A.offline(off, z, 3.9);
    const at = (t, f) => off.suspend(t).then(() => { f(); off.resume(); });
    at(.5, () => { A.SFX.flap(); A.SFX.pass(); }); at(1, () => { A.SFX.perfect(14); A.SFX.orb(); }); at(1.5, () => A.SFX.dash());
    at(2, () => A.SFX.skill()); at(2.5, () => A.SFX.fever()); at(3, () => { A.SFX.die(); A.SFX.shield(); }); at(3.5, () => { A.SFX.fanfare(); A.SFX.stamp(); });
    const buf = await off.startRendering();
    let pk = 0; for (let c = 0; c < 2; c++){ const d = buf.getChannelData(c); for (let i = 0; i < d.length; i++) pk = Math.max(pk, Math.abs(d[i])); }
    out.push(+pk.toFixed(3)); A.drop();
  }
  return out;
});
console.log('full-mix peaks per zone', peaks);
for (const p of peaks) assert.ok(p <= .9 && p > .1, `peak ${p}`);

// live context from here on
await boot();
await page.click('#muteBtn'); await page.click('#muteBtn');   // a gesture creates the context; the second click turns sound back on
await page.waitForFunction(() => FW.audio.ac && FW.audio.ac.state === 'running' && FW.audio.mus.timer);
assert.equal(await page.getAttribute('#muteBtn', 'aria-pressed'), 'true');

// (b) a 1.2 s main-thread stall: no note is started in the past afterwards
const stall = await page.evaluate(async () => {
  const ac = FW.audio.ac, late = [], real = OscillatorNode.prototype.start; let n = 0;
  OscillatorNode.prototype.start = function(t = 0){ n++; if (t < ac.currentTime - 1e-6) late.push(+(ac.currentTime - t).toFixed(3)); return real.call(this, t); };
  const t = performance.now(); while (performance.now() - t < 1200){}
  await new Promise(r => setTimeout(r, 600)); OscillatorNode.prototype.start = real; return { late, n };
});
console.log('after a 1.2 s stall', stall);
assert.deepEqual(stall.late, []); assert.ok(stall.n > 0);

// (a) hidden: suspended and no interval; shown: running and the interval is back
await page.evaluate(() => { Object.defineProperty(document, 'hidden', { value: true, configurable: true }); document.dispatchEvent(new Event('visibilitychange')); });
await page.waitForTimeout(300);
const hid = await page.evaluate(() => ({ st: FW.audio.ac.state, timer: FW.audio.mus.timer }));
console.log('hidden', hid); assert.deepEqual(hid, { st: 'suspended', timer: 0 });
await page.evaluate(() => { Object.defineProperty(document, 'hidden', { value: false, configurable: true }); document.dispatchEvent(new Event('visibilitychange')); });
await page.waitForTimeout(300);
const shown = await page.evaluate(() => ({ st: FW.audio.ac.state, timer: !!FW.audio.mus.timer }));
console.log('shown', shown); assert.deepEqual(shown, { st: 'running', timer: true });

// (c) music off from the effects screen: no new nodes over 5 s; music on: nodes again
const count = () => page.evaluate(async () => {
  const ac = FW.audio.ac; let n = 0; const keep = ['createOscillator', 'createGain', 'createBufferSource', 'createBiquadFilter'].map(k => [k, ac[k]]);
  for (const [k, f] of keep) ac[k] = function(...a){ n++; return f.apply(this, a); };
  await new Promise(r => setTimeout(r, 5000)); for (const [k] of keep) delete ac[k]; return n;
});
await page.click('#fxBtn'); await page.click('[data-fxmus]');
assert.equal(await page.textContent('[data-fxmus]'), 'Music: OFF');
assert.equal(await page.textContent('[data-fxsfx]'), 'Sound effects: ON');
if (shots) await page.screenshot({ path: `${shots}/fx-en-music-off.png` });
const offN = await count(); console.log('nodes in 5 s, music off', offN); assert.equal(offN, 0);
await page.click('[data-fxmus]'); const onN = await count(); console.log('nodes in 5 s, music on', onN); assert.ok(onN > 20);
await page.click('[data-fxsfx]');
assert.equal(await page.evaluate(() => [FW.audio.muted, FW.audio.musOn, FW.audio.sfxBus.gain.value, localStorage.getItem('fw27_mute'), localStorage.getItem('fw27_mus')].join()), 'true,true,0,true,true');
await page.click('#fxClose');
assert.equal(await page.getAttribute('#muteBtn', 'aria-pressed'), 'true', 'music still on: the master button stays on');
await page.click('#muteBtn');
assert.equal(await page.evaluate(() => [FW.audio.muted, FW.audio.musOn, FW.audio.master.gain.value, document.getElementById('muteBtn').classList.contains('off')].join()), 'true,false,0,true');
assert.equal(await page.getAttribute('#muteBtn', 'aria-pressed'), 'false');
if (shots) await page.screenshot({ path: `${shots}/menu-muted.png` });
await page.click('#muteBtn');
assert.equal(await page.evaluate(() => [FW.audio.muted, FW.audio.musOn, Math.abs(FW.audio.master.gain.value - .8) < 1e-6].join()), 'false,true,true');

// migration: an old muted player (fw27_mute on, no fw27_mus) stays silent, music included
await page.evaluate(() => { localStorage.setItem('fw27_mute', 'true'); localStorage.removeItem('fw27_mus'); });
await page.reload(); await ready();
assert.equal(await page.evaluate(() => [FW.audio.muted, FW.audio.musOn].join()), 'true,false');
assert.equal(await page.getAttribute('#muteBtn', 'aria-pressed'), 'false');

// a real run: flaps (SFX through the bus), pause and Resume (audioInit first), then death; no page errors
await boot();
await page.click('#startBtn'); await page.waitForTimeout(500);
await page.click('#stageList button').catch(() => {}); await page.waitForTimeout(600);
for (let i = 0; i < 6; i++){ await page.keyboard.press('Space'); await page.waitForTimeout(180); }
await page.click('#pauseBtn'); assert.equal(await page.evaluate(() => FW.state), 'paused');
await page.click('#resumeBtn'); assert.equal(await page.evaluate(() => FW.state), 'play');
assert.equal(await page.evaluate(() => FW.audio.ac.state), 'running');
await page.waitForTimeout(3000);
console.log('after a run', await page.evaluate(() => FW.state));

// (e) German UI: the effects screen is German
await boot('de');
await page.click('#fxBtn');
const de = await page.evaluate(() => [document.getElementById('fxTitle').textContent, ...[...document.querySelectorAll('#fxScr .row button')].map(x => x.textContent)]);
console.log('de', de);
assert.deepEqual(de, ['Effekte', 'Auto', 'Niedrig', 'Mittel', 'Hoch', 'Bildschirmwackeln: AN', 'Bildschirmblitz: AN', 'Musik: AN', 'Soundeffekte: AN']);
if (shots) await page.screenshot({ path: `${shots}/fx-de.png` });
assert.deepEqual(errors, []);
await b.close();
console.log('audio smoke ok');
