// Loads the pure client-error-report helpers out of index.html (the block between the errlog markers),
// the same way tests/helpers/ads.js does for the ads block.
import { readIndex } from './hitloop.js';

export function loadErrlog(html = readIndex()) {
  const m = html.match(/\/\* errlog:start[\s\S]*?\/\* errlog:end \*\//);
  if (!m) throw new Error('errlog block not found in index.html');
  return new Function(`${m[0]}\nreturn {ERR_CFG, errNorm, errKey, errQueue, errInit, errUrl, errBuild};`)();
}
