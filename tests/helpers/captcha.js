// Loads the pure captcha helpers out of index.html (the block between the captcha markers),
// the same way tests/helpers/ads.js does for the ads block.
import { readIndex } from './hitloop.js';

export function loadCaptcha(html = readIndex()) {
  const m = html.match(/\/\* captcha:start[\s\S]*?\/\* captcha:end \*\//);
  if (!m) throw new Error('captcha block not found in index.html');
  return new Function(`${m[0]}\nreturn {CAP_CFG, capCfg, capAsk};`)();
}
