// Loads the pure ad pacing / reward rules and the ad-provider adapters out of index.html
// (the block between the ads markers), the same way tests/helpers/hitloop.js does.
import { readIndex } from './hitloop.js';

export function loadAds(html = readIndex()) {
  const m = html.match(/\/\* ads:start[\s\S]*?\/\* ads:end \*\//);
  if (!m) throw new Error('ads block not found in index.html');
  return new Function(`${m[0]}\nreturn {AD_CFG, AD_STUB_MODES, adNorm, adRunDone, adInterShown, adInterDue, adCoinBonus, adDailyBonus, adClaim, adOffers, adStub, adGuard, adPick, AD_EVS, adVendor, adPlayEv, adVol};`)();
}
