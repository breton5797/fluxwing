import { readFileSync } from 'node:fs';
export const readIndex = () => readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
export function loadLoop(html = readIndex()) {
  const m = html.match(/\/\* loop-rules:start[\s\S]*?\/\* loop-rules:end \*\//);
  if (!m) throw new Error('loop-rules block not found in index.html');
  return new Function(`${m[0]}\nreturn { frameSteps };`)();
}
