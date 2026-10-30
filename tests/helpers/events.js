// Loads the pure product-event helpers out of index.html (the block between the events markers),
// the same way tests/helpers/errlog.js does for the errlog block.
import { readIndex } from './hitloop.js';

export function loadEvents(html = readIndex()) {
  const m = html.match(/\/\* events:start[\s\S]*?\/\* events:end \*\//);
  if (!m) throw new Error('events block not found in index.html');
  return new Function(`${m[0]}\nreturn {EV_CFG, EV_V, evSid, evOk, evNew, evAdd, evTake, evDue, evHide, evShow, evPlat, evStamp, evBhp, evAtt, evRunProps};`)();
}
