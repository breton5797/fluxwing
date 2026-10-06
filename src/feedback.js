// Turns simulation events into juice: sound, particles, floating text, shake, haptics.
import { ZONES } from './config.js';

const GOLD = [48, 100, 65];
const POWER_POP = {
  shield: ['SHIELD', [190, 100, 70]],
  magnet: ['MAGNET', GOLD],
  slow: ['SLOW-MO', [280, 100, 72]],
  double: ['DOUBLE SCORE', [120, 90, 62]],
};

/**
 * @param {{ fx: object, audio: object, haptic: (ms: number | number[]) => void, palette: () => object }} deps
 * @returns {(event: object, ctx: { g: object, birdX: number }) => void}
 */
export function createFeedback({ fx, audio, haptic, palette }) {
  const sfx = audio.sfx;
  const rnd = (lo, hi) => lo + Math.random() * (hi - lo);

  function onPass(e, x, y, pal) {
    if (e.kind === 'perfect') {
      sfx.perfect(e.combo);
      haptic(15);
      fx.kick({ flash: 0.18, hitstop: 0.06, shake: 4 });
      fx.pop(e.combo > 1 ? `PERFECT x${e.combo}  +${e.pts}` : `PERFECT +${e.pts}`, x + 10, y - 30, pal.a, true);
      for (let i = 0; i < 16; i++) fx.part(x + 20, y, rnd(60, 260), rnd(-130, 130), 0.6, pal.a, 2.5);
    } else if (e.kind === 'phase') {
      sfx.phase();
      fx.pop(`PHASE +${e.pts}`, x, y - 30, pal.b);
    } else {
      sfx.pass();
    }
  }

  const handlers = {
    flap(e, x, y, pal) {
      sfx.flap();
      for (let i = 0; i < 5; i++) fx.part(x - 6, y + 6, rnd(-140, -60), rnd(40, 120), 0.35, pal.b, 2);
    },
    dash(e, x, y, pal) {
      sfx.dash();
      haptic(30);
      fx.kick({ shake: 8, flash: 0.35 });
      for (let i = 0; i < 24; i++) fx.part(x, y, rnd(-500, -200), rnd(-100, 100), 0.5, pal.b, 3);
    },
    pass: onPass,
    comboBreak(e, x, y) { fx.pop('COMBO BREAK', x, y + 36, [0, 0, 70]); },
    orb(e, x, y, pal, ox) {
      sfx.orb();
      fx.burst(ox, e.y, 6, 110, 0.35, GOLD, 2);
    },
    power(e, x, y) {
      const [label, col] = POWER_POP[e.kind];
      sfx.power();
      haptic(20);
      fx.pop(label, x, y - 34, col, true);
    },
    shieldBreak(e, x, y) {
      sfx.shield();
      haptic(40);
      fx.kick({ shake: 10, flash: 0.3 });
      fx.pop('SHIELD BREAK', x, y - 34, [190, 100, 70]);
      fx.burst(x, y, 20, 240, 0.5, [190, 100, 70], 2.5);
    },
    droneKill(e, x, y, pal, ox) {
      sfx.kill();
      haptic(25);
      fx.kick({ shake: 7, hitstop: 0.04 });
      fx.pop(`DRONE +${e.pts}`, ox, e.y - 26, [0, 100, 70], true);
      fx.burst(ox, e.y, 26, 300, 0.6, [0, 100, 66], 3);
    },
    fever(e, x, y) {
      sfx.fever();
      haptic([20, 30, 20]);
      fx.kick({ flash: 0.4, shake: 6 });
      fx.showBanner('COMBO IGNITED', 'FEVER ×2', [48, 100, 62]);
      audio.setMusic({ fever: true });
      fx.burst(x, y, 30, 320, 0.7, GOLD, 3);
    },
    feverEnd() { audio.setMusic({ fever: false }); },
    zone(e) {
      sfx.zone();
      audio.setMusic({ zone: e.zone });
      const kicker = e.loop > 0 ? `LOOP ${e.loop + 1} · ZONE ${e.zone + 1}` : `ZONE ${e.zone + 1}`;
      fx.showBanner(kicker, ZONES[e.zone].name, null);
    },
    die(e, x, y, pal) {
      sfx.die();
      haptic([40, 40, 80]);
      fx.kick({ shake: 18, flash: 0.6, hitstop: 0.12 });
      audio.setMusic({ playing: false, fever: false });
      for (let i = 0; i < 46; i++) {
        const a = Math.random() * 6.28, s = rnd(80, 440);
        fx.part(x, y, Math.cos(a) * s, Math.sin(a) * s, rnd(0.9, 1.5), Math.random() < 0.5 ? pal.a : pal.b, rnd(2, 5));
      }
    },
    revive(e, x, y) {
      sfx.revive();
      haptic(30);
      fx.kick({ flash: 0.5 });
      audio.setMusic({ playing: true });
      fx.pop('BACK ONLINE', x + 20, y - 36, [190, 100, 70], true);
      fx.burst(x, y, 28, 260, 0.7, [190, 100, 70], 3);
    },
  };

  return (e, { g, birdX }) => {
    const handler = handlers[e.type];
    if (!handler) return;
    const ox = e.wx === undefined ? birdX : e.wx - g.dist + birdX;
    handler(e, birdX, g.bird.y, palette(), ox);
  };
}
