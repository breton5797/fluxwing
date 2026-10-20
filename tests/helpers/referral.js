// Loads the pure friend-invite helpers out of index.html (the block between the referral markers), together with the
// social-core block whose friend-code helpers (fcNorm / fcOk) it uses, the same way tests/helpers/social.js does.
import { readIndex } from './hitloop.js';

export function loadReferral(html = readIndex()) {
  const s = html.match(/\/\* social-core:start[\s\S]*?\/\* social-core:end \*\//);
  const m = html.match(/\/\* referral:start[\s\S]*?\/\* referral:end \*\//);
  if (!s || !m) throw new Error('social-core or referral block not found in index.html');
  return new Function(`${s[0]}\n${m[0]}\nreturn {REF_CFG, refParse, refStrip, refUrl, refNorm, refSeen, refLinkDue, refLinked, refReportDue, refReported,
    refView, refMs, refPayGems, refToGrant, refPaidAdd, refNudgeDue};`)();
}
