// Loads the pure report / block helpers out of index.html (the block between the report markers), together with the
// social-core block whose player-id check (SOC_UID) it uses, the same way tests/helpers/referral.js does.
import { readIndex } from './hitloop.js';

export function loadReport(html = readIndex()) {
  const s = html.match(/\/\* social-core:start[\s\S]*?\/\* social-core:end \*\//);
  const m = html.match(/\/\* report:start[\s\S]*?\/\* report:end \*\//);
  if (!s || !m) throw new Error('social-core or report block not found in index.html');
  return new Function(`${s[0]}\n${m[0]}\nreturn {RPT_CFG, blkNorm, blkHas, blkAdd, blkDel, blkNick, rptErrKey, rptOkKey, rptCands};`)();
}
