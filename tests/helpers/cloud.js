// Loads the pure cloud-save / login rules out of index.html (the block between the cloud markers), like tests/helpers/ads.js.
import { readIndex } from './hitloop.js';

export function loadCloud(html = readIndex()) {
  const m = html.match(/\/\* cloud:start[\s\S]*?\/\* cloud:end \*\//);
  if (!m) throw new Error('cloud block not found in index.html');
  return new Function(`${m[0]}\nreturn {FS_CFG, FS_KEYS, FS_LOCAL, fsNorm, fsSnap, fsWrites, fsEmpty, fsSame, fsMerge, fsPlan, AUTH_ERR, authUrl, authErr, authUi, authEmail, authCodeOk, authInApp, fsCanApply, fsSummary, fsLater};`)();
}
