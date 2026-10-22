// Runs the translation tables of index.html (from `const I18N = {` through the last merge into I18N) in a sandbox
// and returns the merged per-language tables the game uses.
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

export function loadI18N(){
  return loadI18NParts().I18N;
}

// The merged tables plus the pieces around them: the world-launch table as written (I18N_W, before the English fallback) and the language helpers.
export function loadI18NParts(){
  const h = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
  const a = h.indexOf('const I18N = {'), end = '/* i18n:end';
  const b = h.indexOf(end);
  if (a < 0 || b < 0) throw new Error('i18n block (const I18N ... /* i18n:end */) not found in index.html');
  const ctx = vm.createContext({});
  vm.runInContext(h.slice(a, b) + '\nglobalThis.__P = {I18N, I18N_W, langOf, RTL_LANGS, bcp47, numLoc};', ctx);
  return ctx.__P;
}
