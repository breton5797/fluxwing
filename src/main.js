// Entry point: owns the app state machine (menu → play ⇄ paused → revive? → over) and wires
// input, simulation, feedback, rendering and the save file together.
import { createAudio } from './audio.js';
import { PHYS, REVIVE, SAVE_KEY, ZONES } from './config.js';
import { createFeedback } from './feedback.js';
import { createFx } from './fx.js';
import { activeSkin, applyRun, buySkin, ensureToday, shareText, spend, withSetting } from './progress.js';
import { createRenderer } from './render.js';
import { dailySeed, dateKey, randomSeed } from './rng.js';
import { canRevive, createGame, drainEvents, revive, step, summarize } from './sim.js';
import { loadSave, persistSave } from './storage.js';
import { $, renderMenu, renderOver, renderPanel, show } from './ui.js';

const STEP = PHYS.step;
const NO_INPUT = Object.freeze({ flap: false, dash: false });
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const canvas = $('c');
const renderer = createRenderer(canvas);
const fx = createFx();

let save = ensureToday(loadSave(), dateKey());
const audio = createAudio(save.settings);
const haptic = pattern => {
  if (!save.settings.haptic || !navigator.vibrate) return;
  try { navigator.vibrate(pattern); } catch (err) { /* vibration is best-effort */ }
};
const feedback = createFeedback({ fx, audio, haptic, palette: renderer.palette });

let state = 'menu';
let game = idleGame();
let input = NO_INPUT;
let runDate = dateKey();
let lastRun = null;
let openPanel = null;
let acc = 0, scroll = 0, clock = 0, overAt = 0, reviveT = 0, coachT = 0;
let last = performance.now();

const birdX = () => Math.min(renderer.width() * 0.3, 150);
const dateLabel = key => key.slice(5).replace('-', '.');

function idleGame() {
  const g = createGame({ seed: 1 });
  return { ...g, gates: [], orbs: [], drones: [], bird: { ...g.bird, y: 300 } };
}

function commit(next) {
  save = next;
  persistSave(save);
  renderMenu(save, dateLabel(save.daily.date || dateKey()));
}

function setScreen(next) {
  state = next;
  show('menu', next === 'menu' && !openPanel);
  show('panel', next === 'menu' && Boolean(openPanel));
  show('pauseScr', next === 'paused');
  show('reviveScr', next === 'revive');
  show('over', next === 'over');
  show('pauseBtn', next === 'play');
  show('shardPill', next !== 'play' && next !== 'paused');
  show('dashBtn', next === 'play');
  if (next !== 'play') show('coach', false);
}

function startRun(mode) {
  audio.init();
  runDate = dateKey();
  commit(ensureToday(save, runDate));
  game = createGame({ seed: mode === 'daily' ? dailySeed(runDate) : randomSeed(), mode });
  fx.reset();
  fx.showBanner(mode === 'daily' ? `DAILY RUN · ${dateLabel(runDate)}` : 'ZONE 1', ZONES[0].name, null);
  input = { flap: true, dash: false };
  acc = 0;
  openPanel = null;
  audio.setMusic({ playing: true, zone: 0, fever: false });
  setScreen('play');
  coachT = save.tutorialDone ? 0 : 7;
  show('coach', coachT > 0);
}

// Fold the current run into the save. Every way out of a run goes through here exactly once.
function bankRun() {
  lastRun = summarize(game);
  const result = applyRun(save, lastRun, runDate);
  commit({ ...result.save, tutorialDone: true });
  return result;
}

function finishRun() {
  const result = bankRun();
  renderOver({ run: lastRun, result, best: lastRun.mode === 'daily' ? save.daily.best : save.best, dateLabel: dateLabel(runDate) });
  if (result.completed.length) audio.sfx.reward();
  overAt = clock;
  setScreen('over');
  $('retryBtn').focus({ preventScroll: true });
}

function offerRevive() {
  if (!canRevive(game) || save.shards < REVIVE.cost) { finishRun(); return; }
  reviveT = REVIVE.window;
  $('reviveCost').textContent = String(REVIVE.cost);
  setScreen('revive');
}

function acceptRevive() {
  if (state !== 'revive') return;
  const paid = spend(save, REVIVE.cost);
  if (!paid || !revive(game)) { finishRun(); return; }
  commit(paid);
  acc = 0;
  setScreen('play');
}

function toMenu() {
  if (state === 'play' || state === 'paused') bankRun(); // quitting mid-run still keeps what was earned
  audio.setMusic({ playing: false, fever: false });
  game = idleGame();
  fx.reset();
  openPanel = null;
  setScreen('menu');
  $('playBtn').focus({ preventScroll: true });
}

function togglePause() {
  if (state === 'play' && game.phase === 'play') setScreen('paused');
  else if (state === 'paused') { last = performance.now(); setScreen('play'); }
}

function flapIntent() {
  audio.init();
  if (state === 'play') input = { ...input, flap: true };
  else if (state === 'paused') togglePause();
  else if (state === 'over') retry();
  else if (state === 'menu' && !openPanel) startRun('classic');
}

// A short lockout so a player still mashing flap sees the result card before restarting.
function retry() {
  if (state === 'over' && lastRun && clock - overAt > 0.6) startRun(lastRun.mode);
}

function dashIntent() {
  audio.init();
  if (state === 'play') input = { ...input, dash: true };
}

function toggleSetting(key) {
  audio.init();
  const value = !save.settings[key];
  commit(withSetting(save, key, value));
  audio.setEnabled({ [key]: value });
  if (value) audio.sfx.ui();
}

function showPanel(name) {
  openPanel = renderPanel(name, save) ? name : null;
  setScreen('menu');
}

function onSkinClick(id) {
  const result = buySkin(save, id);
  if (result.ok) { commit(result.save); audio.sfx.power(); } else { audio.sfx.shield(); }
  renderPanel('skins', save);
}

async function shareRun() {
  if (!lastRun) return;
  const text = shareText(lastRun, runDate);
  const label = result => { $('shareBtn').textContent = result; };
  if (navigator.share) {
    try { await navigator.share({ text }); label('SHARED'); return; } catch (err) {
      if (err && err.name === 'AbortError') return; // the player closed the share sheet
    }
  }
  // No share sheet (desktop, embedded viewers): fall back to the clipboard.
  try { await navigator.clipboard.writeText(text); label('COPIED'); } catch (err) { label('COPY FAILED'); }
}

/* ---------- input wiring ---------- */
const FLAP_KEYS = ['Space', 'ArrowUp', 'KeyW'];
const DASH_KEYS = ['ShiftLeft', 'ShiftRight', 'KeyD', 'KeyE'];

function onKey(e) {
  if (e.repeat) return;
  const onButton = e.target instanceof HTMLButtonElement;
  if (FLAP_KEYS.includes(e.code) || (e.code === 'Enter' && !onButton)) {
    if (onButton && state !== 'play' && state !== 'paused') return; // let the focused button activate natively
    e.preventDefault();
    flapIntent();
  } else if (DASH_KEYS.includes(e.code)) {
    e.preventDefault();
    dashIntent();
  } else if (e.code === 'KeyP' || e.code === 'Escape') {
    if (openPanel) showPanel(null); else togglePause();
  }
}

// Another tab wrote the save: adopt it rather than overwrite it with a stale copy.
function onStorage(e) {
  if (e.key !== SAVE_KEY || !e.newValue) return;
  save = ensureToday(loadSave(), dateKey());
  renderMenu(save, dateLabel(save.daily.date));
  if (openPanel) renderPanel(openPanel, save);
}

function click(id, handler) {
  $(id).addEventListener('click', e => {
    e.stopPropagation();
    e.currentTarget.blur();
    audio.init();
    handler(e);
  });
}

function wire() {
  addEventListener('keydown', onKey);
  addEventListener('resize', renderer.resize);
  canvas.addEventListener('pointerdown', e => { e.preventDefault(); flapIntent(); });
  $('dashBtn').addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); dashIntent(); });
  $('over').addEventListener('pointerdown', e => { if (e.target === $('over')) flapIntent(); });
  click('playBtn', () => startRun('classic'));
  click('dailyBtn', () => startRun('daily'));
  click('retryBtn', retry);
  click('menuBtn', toMenu);
  click('quitBtn', toMenu);
  click('shareBtn', shareRun);
  click('resumeBtn', togglePause);
  click('pauseBtn', togglePause);
  click('reviveBtn', acceptRevive);
  click('skipBtn', finishRun);
  click('panelClose', () => showPanel(null));
  click('sfxBtn', () => toggleSetting('sfx'));
  click('musicBtn', () => toggleSetting('music'));
  for (const tab of document.querySelectorAll('.tab')) {
    tab.addEventListener('click', () => { audio.init(); audio.sfx.ui(); showPanel(tab.dataset.panel); });
  }
  $('panelBody').addEventListener('click', e => {
    const card = e.target instanceof Element ? e.target.closest('[data-skin]') : null;
    if (card) onSkinClick(card.dataset.skin);
  });
  addEventListener('storage', onStorage);
  document.addEventListener('visibilitychange', () => { if (document.hidden && state === 'play') togglePause(); });
}

/* ---------- frame loop ---------- */
function advance(rdt) {
  if (fx.hitstop > 0) { fx.hitstop -= rdt; return; }
  const before = game.dist;
  acc = Math.min(acc + rdt, STEP * 8);
  while (acc >= STEP && game.phase !== 'over') {
    step(game, STEP, input);
    input = NO_INPUT;
    acc -= STEP;
    for (const e of drainEvents(game)) feedback(e, { g: game, birdX: birdX() });
  }
  scroll += game.dist - before;
  if (game.phase !== 'play') show('dashBtn', false);
  if (game.phase === 'over') offerRevive();
}

function idle(rdt) {
  const bird = { ...game.bird, y: 300 + Math.sin(clock * 2.4) * 18, rot: Math.sin(clock * 2.4) * 0.15, wing: (Math.sin(clock * 12) + 1) / 2 };
  game = { ...game, bird, dist: game.dist + 120 * rdt };
  scroll += 120 * rdt;
}

function tickCoach(rdt) {
  if (coachT <= 0) return;
  coachT -= rdt;
  if (coachT <= 0) show('coach', false);
}

function frame(now) {
  const rdt = Math.min(0.05, Math.max(0, (now - last) / 1000));
  last = now;
  clock += rdt;
  if (state === 'play') { advance(rdt); tickCoach(rdt); audio.tick(); }
  else if (state === 'menu') idle(rdt);
  else if (state === 'revive') {
    reviveT -= rdt;
    $('reviveCount').textContent = String(Math.max(1, Math.ceil(reviveT)));
    if (reviveT <= 0) finishRun();
  }
  if (state !== 'paused') {
    const flying = (state === 'play' || state === 'menu') && game.phase === 'play';
    fx.update(rdt * game.timeScale, rdt, flying ? { wx: game.dist, y: game.bird.y } : null);
  }
  renderer.draw({
    g: game, fx, skin: activeSkin(save), birdX: birdX(), scroll, clock, reducedMotion,
    hud: state === 'play' || state === 'paused', mode: game.mode, dateLabel: dateLabel(runDate),
  }, rdt);
  $('dashBtn').classList.toggle('ready', state === 'play' && game.dashMeter >= 1);
  requestAnimationFrame(frame);
}

function registerServiceWorker() {
  if (!('serviceWorker' in navigator) || !location.protocol.startsWith('http')) return;
  // Offline support is a bonus: a failed registration must never block the game.
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

// `?debug` exposes a read-only peek at the live state for automated play-testing.
if (new URLSearchParams(location.search).has('debug')) {
  globalThis.__fluxwing = Object.freeze({ peek: () => ({ state, game, save, lastRun }) });
}

renderer.resize();
wire();
renderMenu(save, dateLabel(save.daily.date));
setScreen('menu');
registerServiceWorker();
requestAnimationFrame(frame);
