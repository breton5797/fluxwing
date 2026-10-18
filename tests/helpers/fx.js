import { readFileSync } from 'node:fs';
export const readIndex = () => readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
export function loadFx(html = readIndex()) {
  const m = html.match(/\/\* fx-core:start[\s\S]*?\/\* fx-core:end \*\//);
  if (!m) throw new Error('fx-core block not found in index.html');
  return new Function(`${m[0]}\nreturn {FX_EVENTS, FX_DEFAULTS, FX_RANGES, fxCfgMerge, fxQualityPick, fxQualityStep, fxFeatures, hitstopFor, punchFor, shakeKick, shakeStep, fxPool, poolSpawn, poolStep, fxRng, burstSpec, gradCol, decel, popScale, easeOutBack, comboLevel, deathPhase, shieldRings, arcsOn, sfxRoute, hapticFor};`)();
}
