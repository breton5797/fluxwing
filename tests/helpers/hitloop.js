// Loads the pure first-run / death-hint / share rules out of index.html (the block between the hit-loop
// markers), the same way scripts/nick-filter-sql.mjs loads the nickname filter.
import { readFileSync } from 'node:fs';

export const readIndex = () => readFileSync(new URL('../../index.html', import.meta.url), 'utf8');

export function loadHitLoop(html = readIndex()) {
  const m = html.match(/\/\* hit-loop:start[\s\S]*?\/\* hit-loop:end \*\//);
  if (!m) throw new Error('hit-loop block not found in index.html');
  return new Function(`${m[0]}\nreturn {SHARE_URL, ROOKIE, DAILY_REWARD, rookieRun, rookieGate, deathHint, shareUrl, shareMsg, readChallenge, challengeResult, dayIndex, dailyStreakNext, dailyReward, vsPauseAction};`)();
}
