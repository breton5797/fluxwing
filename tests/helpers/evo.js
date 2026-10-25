// Loads the pure unit-evolution rules out of index.html (the block between the evo markers), like tests/helpers/cloud.js.
import { readIndex } from './hitloop.js';

export const evoBlock = (html = readIndex()) => {
  const m = html.match(/\/\* evo:start[\s\S]*?\/\* evo:end \*\//);
  if (!m) throw new Error('evo block not found in index.html');
  return m[0];
};

export function loadEvo(html = readIndex()) {
  return new Function(`${evoBlock(html)}\nreturn {EVO_AT, EVO_BUFF, EVO_ROMAN, EVO_STN, evoNorm, evoCount, evoForm, evoToNext, evoClear, evoMerge, evoBuff};`)();
}
