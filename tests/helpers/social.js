import { readFileSync } from 'node:fs';
export const readIndex = () => readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
const NAMES = ['SOC_ALPH', 'fcNorm', 'fcOk', 'fcFmt', 'friendErrKey', 'socNorm', 'notifyRoute', 'notifText', 'feedMerge',
  'ffaPlaces', 'ffaRp', 'ffaMatchId', 'ffaPlaceFinal', 'FFA_RP', 'GUILD_COST', 'guildCostOk', 'guildReqOk', 'gpayNext', 'gdFailKind'];
export function loadSocial(html = readIndex()) {
  const m = html.match(/\/\* social-core:start[\s\S]*?\/\* social-core:end \*\//);
  if (!m) throw new Error('social-core block not found in index.html');
  // names from later phases may not exist yet: collect what the block defines so far
  return new Function(`${m[0]}
    const api = {}; for (const k of ${JSON.stringify(NAMES)}) try { api[k] = eval(k); } catch(e){}
    return api;`)();
}
