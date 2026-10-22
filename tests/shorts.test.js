// scripts/marketing-copy.mjs: the hook / caption tables and the clip plan behind scripts/shorts.mjs and scripts/store-shots.mjs.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { LANGS, SHOT_LANGS, STORE_VARIANTS, gameLang, SCENES, SCENE_ORDER, HOOKS, END_LINE, END_BEAT, SHOTS, CAPTIONS, scenePlan, hookFor, fill, parseArgs, sceneOk, clipLen, zoneOf, mulberry32 } from '../scripts/marketing-copy.mjs';

const FLYABLE = ['volt', 'blitz', 'nimbus', 'titan', 'mochi', 'aegis', 'phoenix', 'zero', 'pixel', 'neko', 'buzz', 'kraken', 'specter', 'oracle', 'raijin', 'chrono', 'goliath', 'solaris', 'pulsar'];

test('every language has a hook for every scene, an end line and a challenge line', () => {
  assert.deepEqual(LANGS, ['en', 'ko', 'ja', 'es', 'pt', 'id', 'fr', 'de', 'vi', 'th', 'hi', 'zh']);
  assert.deepEqual([...SCENE_ORDER].sort(), Object.keys(SCENES).sort());
  for (const l of LANGS) {
    assert.deepEqual(Object.keys(HOOKS[l]).sort(), [...SCENE_ORDER].sort(), l);
    for (const s of SCENE_ORDER) for (const h of HOOKS[l][s]) assert.ok(h.length > 0 && h.length <= 48, `${l}/${s}: ${h}`);
    assert.ok(HOOKS[l].beat.every(h => h.includes('{n}')), `${l}: a beat hook names the score`);
    assert.ok(HOOKS[l].zone.every(h => h.includes('{z}')), `${l}: a zone hook names the zone`);
    assert.match(END_LINE[l], /swishby\.com/);
    assert.ok(END_BEAT[l].includes('{n}'));
    if (l !== 'en') assert.notEqual(HOOKS[l].combo[0], HOOKS.en.combo[0], `${l} is translated`);
  }
});

test('store captions: six shots, a headline and a sub line in each language', () => {
  assert.deepEqual(SHOTS, ['title', 'combo', 'dash', 'roster', 'daily', 'versus']);
  assert.deepEqual(SHOT_LANGS, [...LANGS, 'zh_TW', 'nl', 'ru', 'ms', 'nb', 'ar', 'it', 'tr', 'pl', 'fi', 'he']);
  for (const l of SHOT_LANGS) for (const s of SHOTS) {
    const [head, sub] = CAPTIONS[l][s];
    assert.ok(head && sub, `${l}/${s}`);
    assert.ok(head.length <= 46, `${l}/${s} headline stays short: ${head}`);
    if (l !== 'en') assert.notEqual(head, CAPTIONS.en[s][0]);
    if (l !== 'en') assert.notEqual(sub, CAPTIONS.en[s][1], `${l}/${s} sub line is translated`);
  }
  assert.equal(CAPTIONS.en.combo[0], 'Skim the gates. Chain the combo.');
  for (const l of SHOT_LANGS.filter(l => !LANGS.includes(l))) assert.equal(gameLang(l), l, `${l} runs the game in ${l}`);
  assert.notEqual(CAPTIONS.zh_TW.title.join(), CAPTIONS.zh.title.join(), 'zh_TW is Traditional, not a copy of zh');
  assert.doesNotMatch(Object.values(CAPTIONS.ms).flat().join(' '), /\bgratis\b|\bteman\b|\btembok\b/i, 'Malay, not Indonesian');
});

test('store variants es-ES / pt-PT: European captions over the es / pt game, each one its own wording', () => {
  assert.deepEqual(Object.keys(STORE_VARIANTS), ['es-ES', 'pt-PT']);
  assert.equal(gameLang('es-ES'), 'es'); assert.equal(gameLang('pt-PT'), 'pt'); assert.equal(gameLang('ja'), 'ja');
  for (const v of Object.keys(STORE_VARIANTS)) {
    const base = gameLang(v);
    for (const s of SHOTS) {
      const [head, sub] = CAPTIONS[v][s];
      assert.ok(head && sub && head.length <= 46, `${v}/${s}`);
    }
    const differ = SHOTS.filter(s => CAPTIONS[v][s].join() !== CAPTIONS[base][s].join());
    assert.ok(differ.length >= (v === 'pt-PT' ? 5 : 2), `${v}: ${differ.length} shots differ from ${base}`);
  }
  assert.doesNotMatch(Object.values(CAPTIONS['pt-PT']).flat().join(' '), /\bpro\b|\bvocê|Ache\b|Raspe\b/, 'no Brazilian forms');
  assert.doesNotMatch(Object.values(CAPTIONS['es-ES']).flat().join(' '), /en vivo/, 'Spain says en directo');
});

test('hookFor fills the score and zone, cycles the list, and falls back to English', () => {
  assert.equal(hookFor('en', 'beat', 0, { n: 87 }), 'Can you beat 87?');
  assert.equal(hookFor('ko', 'beat', 0, { n: 87 }), '87점, 이길 수 있어?');
  assert.equal(hookFor('en', 'zone', 0, { z: 3 }), 'Zone 3. It only gets faster.');
  assert.equal(hookFor('en', 'combo', 3), hookFor('en', 'combo', 0));
  assert.equal(hookFor('xx', 'dash', 0), HOOKS.en.dash[0]);
  assert.throws(() => hookFor('en', 'nope', 0));
  assert.equal(fill('{a}-{b}', { a: 1 }), '1-{b}');
});

test('scenePlan: deterministic per seed, every scene in each 10, units and stages from the scene pools', () => {
  const a = scenePlan(20, 2027), b = scenePlan(20, 2027), c = scenePlan(20, 7);
  assert.deepEqual(a, b);
  assert.notDeepEqual(a.map(x => x.unit + x.stage), c.map(x => x.unit + x.stage));
  assert.equal(a.length, 20);
  assert.deepEqual(a.slice(0, 10).map(x => x.scene), SCENE_ORDER);
  assert.deepEqual(a.slice(10).map(x => x.scene), SCENE_ORDER);
  assert.equal(new Set(a.map(x => x.runSeed)).size, 20);
  for (const x of a) {
    const s = SCENES[x.scene];
    assert.ok(s.units.includes(x.unit) && FLYABLE.includes(x.unit), x.unit);
    if (s.daily) assert.equal(x.stage, null); else assert.ok(s.stages.includes(x.stage));
    assert.equal(x.hook, x.i < 10 ? 0 : 1);
  }
});

test('every scene lands in 8-15 s with its 1.5 s end card', () => {
  for (const s of Object.values(SCENES)) {
    for (const death of [null, 0.5, 4, s.len]) {
      const total = clipLen(s.len, death) + 1.5;
      assert.ok(total >= 8 && total <= 15, `${s.len} / ${death}: ${total}`);
    }
  }
  assert.equal(clipLen(10.5, null), 10.5);
  assert.equal(clipLen(13, 8), 10.5);
  assert.equal(clipLen(13, 1), 6.5);
});

test('sceneOk reads combos, fever, dashes, saves, casts, records and the death time off a trace', () => {
  const f = (o = {}) => ({ state: 'play', score: 0, combo: 0, tier: 0, shields: 1, dash: 0, skill: .4, ultLive: false, record: false, ...o });
  const trace = [f(), f({ score: 3, combo: 2, dash: 1 }), f({ score: 5, combo: 6, dash: 0, tier: 2 }), f({ score: 6, shields: 0, skill: 1 }), f({ score: 7, skill: 0, record: true }), f({ state: 'dying', score: 7 }), f({ state: 'over', score: 7 })];
  const { ok, stats } = sceneOk({ combo: 6, fever: 1, dashes: 1, saves: 1, casts: 1, record: 1, death: [0.1, 0.2] }, trace, 30);
  assert.equal(ok, true);
  assert.deepEqual(stats, { deathAt: 5 / 30, maxCombo: 6, fever: 1, dashes: 1, saves: 1, casts: 1, ult: 0, record: 1, score: 7, alive: 5 / 30 });
  assert.equal(sceneOk({ combo: 7 }, trace, 30).ok, false);
  assert.equal(sceneOk({}, trace, 30).ok, false, 'a run that dies in its first 6 s is too short');
  const long = Array.from({ length: 200 }, (_, i) => f({ score: i }));
  assert.deepEqual([sceneOk({ alive: 6 }, long, 30).ok, sceneOk({ alive: 7 }, long, 30).ok, sceneOk({ death: [1, 9] }, long, 30).ok], [true, false, false]);
  assert.equal(sceneOk({}, long, 30).stats.score, 199);
});

test('parseArgs, zoneOf and mulberry32', () => {
  assert.deepEqual(parseArgs(['--n=5', '--lang=ko', '--flag', 'stray', '--out=a=b'], { n: 20, lang: 'en', out: '' }), { n: 5, lang: 'ko', out: 'a=b', flag: true });
  assert.deepEqual([null, 0, 9, 10, 24, 25, 39, 40, 49].map(zoneOf), [1, 1, 1, 2, 2, 3, 3, 4, 4]);
  const r1 = mulberry32(42), r2 = mulberry32(42), xs = Array.from({ length: 5 }, r1);
  assert.deepEqual(xs, Array.from({ length: 5 }, r2));
  assert.ok(xs.every(x => x >= 0 && x < 1));
});
