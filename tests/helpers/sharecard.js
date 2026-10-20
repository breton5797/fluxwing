// Loads the pure share-card / messenger rules out of index.html (the block between the share-card markers), on top of
// the hit-loop block it builds on (SHARE_URL, shareUrl, shareMsg), the same way tests/helpers/hitloop.js does.
import { readIndex } from './hitloop.js';

export const shareCardBlock = (html = readIndex()) => {
  const m = html.match(/\/\* share-card:start[\s\S]*?\/\* share-card:end \*\//);
  if (!m) throw new Error('share-card block not found in index.html');
  return m[0];
};

export function loadShareCard(html = readIndex()){
  const hl = html.match(/\/\* hit-loop:start[\s\S]*?\/\* hit-loop:end \*\//);
  if (!hl) throw new Error('hit-loop block not found in index.html');
  return new Function(`${hl[0]}\n${shareCardBlock(html)}\nreturn {SHARE_URL, shareMsg, shareUrl, MSGR, messengerFor, messengerUrl, shareCardSpec};`)();
}
