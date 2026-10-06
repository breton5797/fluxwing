// Meta progression: save data, daily missions, skins, records. Pure and immutable —
// every function returns a new save instead of touching the one it was given.
import { BOARD_SIZE, MISSION_COUNT, MISSIONS, SAVE_VERSION, SKINS } from './config.js';
import { rankOf } from './logic.js';
import { hashString, mulberry32 } from './rng.js';

const STAT_KEYS = ['runs', 'gates', 'perfects', 'orbs', 'dashGates', 'droneKills', 'maxCombo'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const int = (v, d = 0) => (Number.isFinite(v) && v >= 0 ? Math.floor(v) : d);
const bool = (v, d) => (typeof v === 'boolean' ? v : d);
const isObj = v => typeof v === 'object' && v !== null && !Array.isArray(v);
const isDate = v => typeof v === 'string' && DATE_RE.test(v);
const skinById = id => SKINS.find(s => s.id === id);
const missionDef = id => MISSIONS.find(m => m.id === id);

export function defaultSave() {
  return {
    v: SAVE_VERSION,
    shards: 0,
    best: 0,
    daily: { date: '', best: 0, tries: 0 },
    skin: 'flux',
    owned: ['flux'],
    stats: Object.fromEntries(STAT_KEYS.map(k => [k, 0])),
    missions: { date: '', items: [] },
    board: [],
    settings: { sfx: true, music: true, haptic: true },
    tutorialDone: false,
  };
}

// Goals and rewards always come from the day's own roll; only progress is taken from storage.
function normalizeMissions(raw) {
  if (!isObj(raw) || !isDate(raw.date) || !Array.isArray(raw.items)) return { date: '', items: [] };
  const stored = raw.items.filter(isObj);
  const items = pickMissions(raw.date).map(item => {
    const match = stored.find(it => it.id === item.id);
    const progress = Math.min(item.goal, int(match && match.progress));
    return { ...item, progress, done: progress >= item.goal };
  });
  return { date: raw.date, items };
}

function normalizeBoard(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(e => isObj(e) && Number.isFinite(e.score) && isDate(e.date))
    .map(e => ({ score: int(e.score), date: e.date }))
    .sort((a, b) => b.score - a.score)
    .slice(0, BOARD_SIZE);
}

/** Anything read from localStorage is untrusted: coerce it into a well-formed save. */
export function normalizeSave(raw) {
  const d = defaultSave();
  if (!isObj(raw)) return d;
  const owned = Array.isArray(raw.owned) ? raw.owned.filter(id => skinById(id)) : [];
  const ownedSet = [...new Set(['flux', ...owned])];
  const daily = isObj(raw.daily) && isDate(raw.daily.date)
    ? { date: raw.daily.date, best: int(raw.daily.best), tries: int(raw.daily.tries) }
    : d.daily;
  const stats = isObj(raw.stats) ? raw.stats : {};
  const settings = isObj(raw.settings) ? raw.settings : {};
  return {
    v: SAVE_VERSION,
    shards: int(raw.shards),
    best: int(raw.best),
    daily,
    skin: ownedSet.includes(raw.skin) ? raw.skin : 'flux',
    owned: ownedSet,
    stats: Object.fromEntries(STAT_KEYS.map(k => [k, int(stats[k])])),
    missions: normalizeMissions(raw.missions),
    board: normalizeBoard(raw.board),
    settings: { sfx: bool(settings.sfx, true), music: bool(settings.music, true), haptic: bool(settings.haptic, true) },
    tutorialDone: bool(raw.tutorialDone, false),
  };
}

/** Three missions per day, the same for everyone on that date. */
export function pickMissions(dateKey) {
  const rng = mulberry32(hashString(`fluxwing2:missions:${dateKey}`));
  const pool = MISSIONS.map(m => ({ m, key: rng() })).sort((a, b) => a.key - b.key).slice(0, MISSION_COUNT);
  return pool.map(({ m }) => {
    const tier = Math.floor(rng() * m.goals.length);
    return { id: m.id, goal: m.goals[tier], reward: 20 + tier * 10, progress: 0, done: false };
  });
}

export const missionText = item => missionDef(item.id).text(item.goal);

/** Roll the mission list and the daily record over when the date changes. */
export function ensureToday(save, dateKey) {
  const missions = save.missions.date === dateKey ? save.missions : { date: dateKey, items: pickMissions(dateKey) };
  const daily = save.daily.date === dateKey ? save.daily : { date: dateKey, best: 0, tries: 0 };
  return { ...save, missions, daily };
}

function advanceMission(item, run) {
  if (item.done) return item;
  const def = missionDef(item.id);
  const value = int(run[def.stat]);
  const progress = Math.min(item.goal, def.kind === 'sum' ? item.progress + value : Math.max(item.progress, value));
  return { ...item, progress, done: progress >= item.goal };
}

export const runShards = run => int(run.orbs) + Math.floor(int(run.score) / 10);

/**
 * Fold a finished run into the save.
 * @returns {{ save: object, earned: number, completed: object[], newBest: boolean }}
 */
export function applyRun(save, run, dateKey) {
  const today = ensureToday(save, dateKey);
  const items = today.missions.items.map(it => advanceMission(it, run));
  const completed = items.filter((it, i) => it.done && !today.missions.items[i].done);
  const earned = runShards(run) + completed.reduce((sum, it) => sum + it.reward, 0);
  const isDaily = run.mode === 'daily';
  const prevBest = isDaily ? today.daily.best : today.best;
  const newBest = run.score > prevBest;
  const stats = {
    ...today.stats,
    runs: today.stats.runs + 1,
    gates: today.stats.gates + run.gates,
    perfects: today.stats.perfects + run.perfects,
    orbs: today.stats.orbs + run.orbs,
    dashGates: today.stats.dashGates + run.dashGates,
    droneKills: today.stats.droneKills + run.droneKills,
    maxCombo: Math.max(today.stats.maxCombo, run.maxCombo),
  };
  const next = {
    ...today,
    shards: today.shards + earned,
    best: isDaily ? today.best : Math.max(today.best, run.score),
    daily: isDaily ? { ...today.daily, best: Math.max(today.daily.best, run.score), tries: today.daily.tries + 1 } : today.daily,
    stats,
    missions: { ...today.missions, items },
    board: isDaily ? today.board : normalizeBoard([...today.board, { score: run.score, date: dateKey }]),
  };
  return { save: next, earned, completed, newBest };
}

/** @returns {object | null} the new save, or null when the balance is too low */
export function spend(save, amount) {
  return save.shards >= amount ? { ...save, shards: save.shards - amount } : null;
}

/** @returns {{ ok: boolean, save: object, reason?: string }} */
export function buySkin(save, id) {
  const skin = skinById(id);
  if (!skin) return { ok: false, save, reason: 'unknown' };
  if (save.owned.includes(id)) return { ok: true, save: { ...save, skin: id } };
  const paid = spend(save, skin.cost);
  if (!paid) return { ok: false, save, reason: 'shards' };
  return { ok: true, save: { ...paid, owned: [...paid.owned, id], skin: id } };
}

export const withSetting = (save, key, value) => ({ ...save, settings: { ...save.settings, [key]: value } });

export const activeSkin = save => skinById(save.skin) || SKINS[0];

export function shareText(run, dateKey) {
  const head = run.mode === 'daily' ? `FLUX WING 2 · DAILY ${dateKey}` : 'FLUX WING 2';
  return [
    head,
    `🏆 ${run.score}점 · RANK ${rankOf(run.score)}`,
    `🚪 게이트 ${run.gates} · ✨ PERFECT ${run.perfects} · 🔥 콤보 x${run.maxCombo}`,
  ].join('\n');
}
