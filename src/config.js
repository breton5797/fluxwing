// Tunable constants. Everything gameplay-relevant lives here so the sim stays free of magic numbers.

export const LH = 640;
export const GROUND = 584;

export const PHYS = Object.freeze({
  step: 1 / 120,
  gravity: 1500,
  flapVy: -470,
  maxVy: 720,
  birdR: 13,
  baseSpeed: 190,
  speedGain: 120,
  loopSpeed: 12,
  maxLoopBonus: 4,
  dashTime: 0.55,
  dashMul: 2.6,
  startY: 280,
});

export const GATE = Object.freeze({
  w: 68,
  firstX: 520,
  perfectPx: 16,
  gatesPerZone: 12,
  rampGates: 45,
  spawnAhead: 1500,
  cullBehind: 400,
  pulseAmp: 22,
});

export const METER = Object.freeze({ perfect: 0.34, pass: 0.08, orb: 0.05, drone: 0.2 });
export const POWER = Object.freeze({ magnet: 7, slow: 4.5, double: 8 });
export const POWER_KINDS = Object.freeze(['shield', 'magnet', 'slow', 'double']);
export const FEVER = Object.freeze({ combo: 5, time: 6 });
export const DRONE = Object.freeze({ r: 11, fromGate: 8, points: 3, lineGap: 72 });
export const REVIVE = Object.freeze({ cost: 30, minScore: 5, invuln: 2.2, window: 4 });

export const ZONES = Object.freeze([
  { name: 'DUSK ARC', sky: [[262, 62, 8], [318, 70, 22]], a: [338, 100, 62], b: [190, 100, 62], gate: [300, 80, 58], root: 110 },
  { name: 'TIDE GRID', sky: [[214, 80, 7], [186, 85, 20]], a: [178, 100, 58], b: [52, 100, 62], gate: [190, 90, 52], root: 98 },
  { name: 'SOLAR VEIN', sky: [[18, 70, 8], [28, 90, 24]], a: [42, 100, 60], b: [330, 100, 64], gate: [20, 95, 58], root: 123.47 },
  { name: 'AURORA RUN', sky: [[160, 70, 6], [268, 60, 22]], a: [140, 100, 60], b: [280, 100, 72], gate: [150, 85, 50], root: 130.81 },
  { name: 'CHROME STORM', sky: [[220, 30, 8], [205, 35, 26]], a: [24, 100, 60], b: [200, 100, 72], gate: [210, 40, 66], root: 92.5 },
  { name: 'NULL VOID', sky: [[250, 15, 4], [0, 60, 14]], a: [0, 100, 64], b: [0, 0, 96], gate: [355, 85, 55], root: 82.41 },
]);

export const SKINS = Object.freeze([
  { id: 'flux', name: 'FLUX', cost: 0, body: null, wing: null, trail: 'zone' },
  { id: 'mint', name: 'MINT BYTE', cost: 60, body: [158, 90, 58], wing: [190, 100, 70], trail: 'skin' },
  { id: 'solar', name: 'SOLAR', cost: 120, body: [38, 100, 58], wing: [12, 100, 62], trail: 'skin' },
  { id: 'ghost', name: 'GHOST', cost: 200, body: [220, 20, 92], wing: [200, 60, 80], trail: 'skin' },
  { id: 'magma', name: 'MAGMA', cost: 300, body: [8, 100, 54], wing: [48, 100, 60], trail: 'skin' },
  { id: 'prism', name: 'PRISM', cost: 500, body: null, wing: null, trail: 'rainbow' },
]);

// kind 'sum' accumulates across runs for the day, 'max' needs it within a single run.
export const MISSIONS = Object.freeze([
  { id: 'perfects', kind: 'sum', stat: 'perfects', goals: [8, 12, 18], text: n => `PERFECT 판정 ${n}회` },
  { id: 'gates', kind: 'sum', stat: 'gates', goals: [40, 60, 90], text: n => `게이트 ${n}개 통과` },
  { id: 'orbs', kind: 'sum', stat: 'orbs', goals: [50, 80, 120], text: n => `오브 ${n}개 수집` },
  { id: 'dashGates', kind: 'sum', stat: 'dashGates', goals: [4, 6, 10], text: n => `대시로 게이트 ${n}개 돌파` },
  { id: 'droneKills', kind: 'sum', stat: 'droneKills', goals: [2, 3, 5], text: n => `대시로 드론 ${n}기 격파` },
  { id: 'combo', kind: 'max', stat: 'maxCombo', goals: [4, 6, 8], text: n => `한 판에서 콤보 ${n} 달성` },
  { id: 'score', kind: 'max', stat: 'score', goals: [40, 70, 110], text: n => `한 판에서 ${n}점 달성` },
]);

export const MISSION_COUNT = 3;
export const BOARD_SIZE = 5;
export const RANKS = Object.freeze([['S', 150], ['A', 80], ['B', 35], ['C', 0]]);
export const SAVE_KEY = 'fw2_save';
export const SAVE_VERSION = 1;
