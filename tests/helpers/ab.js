// Loads the pure A/B rules (사5-lite) and the near-miss line (다4) out of index.html (the block between the ab markers),
// with the page's hashStr, the same way tests/helpers/events.js does for the events block.
import { readIndex } from './hitloop.js';

export function loadAb(html = readIndex()) {
  const m = html.match(/\/\* ab:start[\s\S]*?\/\* ab:end \*\//);
  if (!m) throw new Error('ab block not found in index.html');
  const h = html.match(/function hashStr\(s\)\{[^\n]*?return h >>> 0; \}/);
  if (!h) throw new Error('hashStr not found in index.html');
  return new Function(`${h[0]}\n${m[0]}\nreturn {AB_KEYS, AB_DEF, AB_URL, NEAR_MIN, abId, abNorm, abBucket, abArm, abTag, nearMiss};`)();
}
