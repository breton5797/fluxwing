// DOM overlays: menu panels and the result card. Builds nodes with textContent only,
// so nothing read from storage is ever interpreted as markup.
import { REVIVE, SKINS } from './config.js';
import { rankOf } from './logic.js';
import { missionText } from './progress.js';

export const $ = id => document.getElementById(id);

export function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  const { text, cls, style, ...attrs } = props;
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = String(text);
  if (style) Object.assign(node.style, style);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  node.append(...children);
  return node;
}

const css = c => `hsl(${c[0]},${c[1]}%,${c[2]}%)`;
const stat = (label, value, cls = '') => el('div', { cls: `stat ${cls}` }, [el('span', { text: label }), el('strong', { text: value })]);

function missionRow(item) {
  const pct = `${Math.round((item.progress / item.goal) * 100)}%`;
  return el('div', { cls: `mission${item.done ? ' done' : ''}` }, [
    el('div', { cls: 'top' }, [el('span', { text: missionText(item) }), el('span', { cls: 'reward', text: `◆ ${item.reward}` })]),
    el('div', { cls: 'bar' }, [el('b', { style: { width: pct } })]),
    el('div', { cls: 'prog', text: item.done ? '완료 · 보상 지급됨' : `${item.progress} / ${item.goal}` }),
  ]);
}

function missionsPanel(save) {
  return [
    el('div', { cls: 'list' }, save.missions.items.map(missionRow)),
    el('p', { cls: 'note', text: '미션은 매일 자정에 바뀝니다. 완료하면 판이 끝날 때 샤드(◆)가 자동 지급됩니다.' }),
  ];
}

function skinCard(skin, save) {
  const owned = save.owned.includes(skin.id), on = save.skin === skin.id;
  const dot = skin.trail === 'rainbow'
    ? { background: 'linear-gradient(90deg,#ff4f8b,#ffd25a,#4ff0ff)', color: '#ffd25a' }
    : { background: css(skin.body || [338, 100, 62]), color: css(skin.wing || [190, 100, 62]) };
  const label = on ? '장착 중' : owned ? '보유' : `◆ ${skin.cost}`;
  return el('button', { cls: `skin${on ? ' on' : ''}${owned ? '' : ' locked'}`, 'data-skin': skin.id, 'aria-pressed': String(on) }, [
    el('span', { cls: 'dot', style: dot }),
    el('span', { cls: 'name', text: skin.name }),
    el('span', { cls: 'cost', text: label }),
  ]);
}

function skinsPanel(save) {
  return [
    el('div', { cls: 'skins' }, SKINS.map(s => skinCard(s, save))),
    el('p', { cls: 'note', text: `보유 샤드 ◆ ${save.shards} · 오브를 모으고 미션을 깨면 샤드를 얻습니다.` }),
  ];
}

function recordsPanel(save) {
  const rows = save.board.flatMap((e, i) => [
    el('span', { cls: 'n', text: `#${i + 1}` }), el('span', { cls: 's', text: e.score }), el('span', { cls: 'd', text: e.date }),
  ]);
  const st = save.stats;
  return [
    el('div', { cls: 'stats' }, [
      stat('Best', save.best), stat('Daily', save.daily.best), stat('Runs', st.runs),
      stat('Gates', st.gates), stat('Perfect', st.perfects), stat('Max combo', st.maxCombo),
      stat('Orbs', st.orbs), stat('Phase', st.dashGates), stat('Drones', st.droneKills),
    ]),
    rows.length ? el('div', { cls: 'board' }, rows) : el('p', { cls: 'note', text: '아직 기록이 없습니다. 첫 비행을 시작하세요.' }),
  ];
}

function helpPanel() {
  const rows = [
    ['TAP · SPACE', '날갯짓'],
    ['SHIFT · DASH', '게이지 100%일 때 대시 — 벽과 드론을 관통'],
    ['P · ESC', '일시정지'],
    ['PERFECT', '게이트 가장자리를 16px 이내로 스치면 콤보 +1, 대시 게이지 충전'],
    ['FEVER', '콤보 5마다 6초간 점수 ×2'],
    ['드론', '게이트 사이를 순찰. 대시로 격파하면 +3'],
    ['파워업', 'S 실드 · M 마그넷 · T 슬로모션 · ×2 더블 스코어'],
    ['REVIVE', `판당 한 번, ◆${REVIVE.cost}로 이어하기`],
    ['DAILY RUN', '날짜마다 고정된 코스. 모두가 같은 코스에 도전'],
  ];
  return [el('div', { cls: 'keys' }, rows.flatMap(([k, v]) => [el('b', { text: k }), el('span', { text: v })]))];
}

const PANELS = {
  missions: { title: 'DAILY MISSIONS', build: missionsPanel },
  skins: { title: 'SKINS', build: skinsPanel },
  records: { title: 'RECORDS', build: recordsPanel },
  help: { title: 'HOW TO PLAY', build: helpPanel },
};

export function renderPanel(name, save) {
  const panel = PANELS[name];
  if (!panel) return false;
  $('panelTitle').textContent = panel.title;
  $('panelBody').replaceChildren(...panel.build(save));
  return true;
}

export function renderMenu(save, dateLabel) {
  $('shardCount').textContent = String(save.shards);
  $('dailyInfo').textContent = `${dateLabel} · BEST ${save.daily.best}`;
  $('menuBest').textContent = save.best > 0 ? `BEST ${save.best}` : 'SPACE 또는 PLAY로 시작';
  $('missionDot').hidden = save.missions.items.every(it => it.done);
  $('sfxBtn').setAttribute('aria-pressed', String(save.settings.sfx));
  $('musicBtn').setAttribute('aria-pressed', String(save.settings.music));
}

/** @param {{ run: object, result: object, best: number, dateLabel: string }} data */
export function renderOver({ run, result, best, dateLabel }) {
  $('oMode').textContent = run.mode === 'daily' ? `DAILY RUN · ${dateLabel}` : 'CLASSIC';
  $('oScore').textContent = String(run.score);
  $('oRank').textContent = `RANK ${rankOf(run.score)}`;
  $('oNew').hidden = !result.newBest || run.score === 0;
  $('oStats').replaceChildren(
    stat('Best', best), stat('Gates', run.gates), stat('Perfect', run.perfects),
    stat('Max combo', run.maxCombo), stat('Drones', run.droneKills), stat('Shards', `+${result.earned}`, 'gold'),
  );
  $('oMissions').replaceChildren(...result.completed.map(it =>
    el('div', { cls: 'mission done' }, [
      el('div', { cls: 'top' }, [el('span', { text: `미션 완료 · ${missionText(it)}` }), el('span', { cls: 'reward', text: `◆ ${it.reward}` })]),
    ])));
  $('shareBtn').textContent = 'SHARE';
}

export function show(id, visible) { $(id).hidden = !visible; }
