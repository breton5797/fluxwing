// Audio lifecycle: the music scheduler's stall catch-up and the sound settings (the pure audio block of index.html),
// plus the wiring around them (suspend when hidden, iOS gesture resume, music/SFX buses, mix, mute button state).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readIndex } from './helpers/hitloop.js';

const html = readIndex();
function loadAudio(){
  const m = html.match(/\/\* audio:start[\s\S]*?\/\* audio:end \*\//);
  if (!m) throw new Error('audio block not found in index.html');
  return new Function(`${m[0]}\nreturn {MUS_AHEAD, musSpb, musCatch, musDue, musWant, musPrefInit, soundOn};`)();
}
const A = loadAudio();
const fnBody = name => { const i = html.indexOf(`function ${name}(`); assert.ok(i >= 0, name); return html.slice(i, html.indexOf('\n}', i)); };

test('musCatch: a 1.2 s stall skips the missed steps, keeping the beat grid', () => {
  const spb = A.musSpb(124), nextT = 10, now = 11.2;
  const c = A.musCatch(nextT, 5, now, spb);
  assert.ok(c.nextT >= now, 'no step left in the past');
  assert.ok(c.nextT - now < spb + 1e-9, 'lands on the first step after now');
  const k = Math.round((c.nextT - nextT)/spb);
  assert.ok(Math.abs(nextT + k*spb - c.nextT) < 1e-9, 'still on the grid');
  assert.equal(c.step, (5 + k) % 64);
});

test('musCatch: no stall, nothing changes', () => {
  assert.deepEqual(A.musCatch(5.1, 7, 5, .1), {nextT: 5.1, step: 7});
});

test('musDue: after a 1.2 s stall nothing is scheduled before the clock, and the lookahead is 0.2 s', () => {
  assert.equal(A.MUS_AHEAD, .2);
  for (const bpm of [108, 116, 124, 136]){
    const spb = A.musSpb(bpm);
    for (const now of [1.2, 3.7, 100.05, 1234.5678]){
      const r = A.musDue(now - 1.2, 63, now, spb);
      assert.ok(r.due.length > 0 && r.due.length <= Math.ceil(.2/spb) + 1, `${bpm}: ${r.due.length} steps`);
      for (const [s, t] of r.due){ assert.ok(t >= now, `${bpm}: step at ${t} < ${now}`); assert.ok(t < now + .2); assert.ok(s >= 0 && s < 64); }
      assert.ok(r.nextT >= now + .2);
    }
  }
});

test('musDue: a steady scheduler plays every step in order', () => {
  const spb = A.musSpb(108); let st = {nextT: .08, step: 0}; const seen = [];
  for (let now = 0; now < 3; now += .025){ const r = A.musDue(st.nextT, st.step, now, spb); seen.push(...r.due.map(d => d[0])); st = r; }
  seen.forEach((s, i) => assert.equal(s, i % 64));
});

test('musWant: in-play music sits under the SFX; menu and pause in proportion; off is silent', () => {
  assert.equal(A.musWant('play', true), .32);
  assert.ok(Math.abs(A.musWant('menu', true) - .22*.64) < .005);
  assert.ok(Math.abs(A.musWant('paused', true) - .12*.64) < .005);
  for (const s of ['play', 'paused', 'menu', 'over']) assert.equal(A.musWant(s, false), 0);
});

test('musPrefInit: a muted player stays silent; otherwise the saved music choice wins', () => {
  assert.equal(A.musPrefInit(true, null), false, 'old fw27_mute on and no fw27_mus: music off too');
  assert.equal(A.musPrefInit(false, null), true);
  assert.equal(A.musPrefInit(true, true), true);
  assert.equal(A.musPrefInit(false, false), false);
});

test('soundOn: the ♪ button is off only when both music and SFX are off', () => {
  assert.equal(A.soundOn(false, true), true);
  assert.equal(A.soundOn(true, true), true);
  assert.equal(A.soundOn(false, false), true);
  assert.equal(A.soundOn(true, false), false);
});

test('hidden: the context is suspended and the scheduler stopped (also on pagehide); shown: it restarts', () => {
  const h = fnBody('audioHide');
  assert.match(h, /ac\.suspend\(\)/); assert.match(h, /clearInterval\(mus\.timer\)/); assert.match(h, /mus\.timer = 0/);
  const s = fnBody('audioShow');
  assert.match(s, /mus\.nextT = ac\.currentTime \+ \.05/); assert.match(s, /setInterval\(schedMusic, 25\)/);
  assert.match(html, /addEventListener\('visibilitychange', \(\) => \{ if \(document\.hidden\) audioHide\(\); else audioShow\(\);/);
  assert.match(html, /addEventListener\('pagehide', audioHide\)/);
});

test('schedMusic uses the catch-up and creates no nodes while music is off', () => {
  const s = fnBody('schedMusic');
  assert.match(s, /musDue\(/);
  assert.match(s, /if \(!musOn\)/);
  assert.ok(s.indexOf('if (!musOn)') < s.indexOf('playStep'), 'the music-off return comes before any playStep');
});

test('iOS resume: Resume and Pause call audioInit first; document-level touchend / pointerup capture listeners', () => {
  assert.match(html, /\$\('resumeBtn'\)\.addEventListener\('click', \(\) => \{ audioInit\(\); togglePause/);
  assert.match(html, /\$\('pauseBtn'\)\.addEventListener\('click', e => \{ e\.stopPropagation\(\); audioInit\(\); togglePause/);
  assert.match(html, /addEventListener\('touchend', audioInit, \{capture: ?true, passive: ?true\}\)/);
  assert.match(html, /addEventListener\('pointerup', audioInit, \{capture: ?true\}\)/);
  assert.match(fnBody('audioInit'), /if \(ac\) \{ if \(audioResumeOn\(ac\.state\)\)/, 'cheap when the context exists');
});

test('buses and mix: SFX bus, compressor between master and destination, one shared noise buffer', () => {
  const i = fnBody('audioInit');
  assert.match(i, /createDynamicsCompressor\(\)/);
  for (const [k, v] of [['threshold', -12], ['knee', 6], ['ratio', 4], ['attack', .003], ['release', .25]]) assert.match(i, new RegExp(`${k}\\.value = ${String(v).replace('0.', '.').replace('.', '\\.')}`), k);
  assert.match(i, /master\.connect\(comp\)/); assert.match(i, /comp\.connect\(ac\.destination\)/);
  assert.match(i, /sfxBus = ac\.createGain\(\)/); assert.match(i, /sfxBus\.connect\(master\)/);
  assert.match(i, /nbuf2 = ac\.createBuffer\(1, ac\.sampleRate\*2/);
  const t = fnBody('tone'), n = fnBody('noise');
  assert.match(t, /g\.connect\(sfxBus\)/); assert.match(n, /g\.connect\(sfxBus\)/);
  assert.match(t, /setValueAtTime\(0, tt\); g\.gain\.linearRampToValueAtTime\(vol, tt \+ \.004\)/, 'onset ramp');
  assert.doesNotMatch(n, /createBuffer\(/, 'noise reuses the buffer'); assert.match(n, /\.start\(t, 0, dur\)/);
  assert.match(fnBody('playStep'), /g\.gain\.setValueAtTime\(\.38, t0\)/, 'kick .38');
});

test('SFX levels: flap .18, pass .11, perfect +40%, click .06', () => {
  assert.match(html, /flap\(\)\{ tone\(flapFreq\(Math\.random\(\)\), \.07, 'triangle', \.18, 240\); \}/);
  assert.match(html, /pass\(i\)\{ tone\(passFreq\(i\), \.09, 'square', \.11\); \}/);
  assert.match(html, /click\(\)\{ tone\(900,\.03,'square',\.06\); \}/);
  assert.match(html, /perfect\(c\)\{[^\n]*tone\(b,\.14,'triangle',\.168\); tone\(b\*1\.25,\.14,'triangle',\.14,0,\.05\); tone\(b\*1\.5,\.2,'triangle',\.14,0,\.1\);/);
});

test('settings: fw27_mus is device-only; the ♪ button shows its state with aria-pressed and the off class', () => {
  assert.ok(html.slice(html.indexOf('const FS_LOCAL'), html.indexOf(']);', html.indexOf('const FS_LOCAL'))).includes("'fw27_mus'"));
  const r = fnBody('soundUi');
  assert.match(r, /setAttribute\('aria-pressed', String\(on\)\)/); assert.match(r, /classList\.toggle\('off', !on\)/);
  assert.match(html, /#muteBtn\.off\{opacity:\.4\}/);
  assert.match(html, /<button class="ib" id="muteBtn" aria-label="Sound">/, 'the label text stays (ftue-copy-i18n localizes it)');
  assert.match(html, /data-fxmus/); assert.match(html, /data-fxsfx/);
});
