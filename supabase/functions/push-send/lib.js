// Pure helpers of the push-send edge function, shared with the Node tests (tests/push.test.js): the alert text, which tokens want
// which kind, and the APNs provider token (ES256 JWT, https://developer.apple.com/documentation/usernotifications). Web Crypto only.
export const LANGS = ['ko', 'en', 'ja', 'zh', 'es', 'pt', 'fr', 'de', 'id', 'vi', 'th', 'hi'];

export function alertFor(texts, lang, kind, nick, val) {
  const t = texts[LANGS.includes(lang) ? lang : 'en'] || texts.en;
  const tpl = t && t[kind];
  if (!tpl) return null;
  const n = String(nick || '').replace(/[\u0000-\u001f\u007f<>]/g, '').trim().slice(0, 14) || 'Pilot';
  return { title: 'SWISHBY', body: tpl.replace('{n}', n).replace('{s}', String(val | 0)) };
}

export const wants = (row, kind) => (kind === 'on' || kind === 'best') && (!row.kinds || row.kinds[kind] !== false);

export const apnsHost = sandbox => sandbox ? 'https://api.sandbox.push.apple.com' : 'https://api.push.apple.com';

const b64url = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const b64urlJson = o => b64url(new TextEncoder().encode(JSON.stringify(o)));

export async function apnsJwt(p8, keyId, teamId, iat) {
  const der = Uint8Array.from(atob(String(p8).replace(/-----[^-]+-----/g, '').replace(/\s+/g, '')), c => c.charCodeAt(0));
  const key = await crypto.subtle.importKey('pkcs8', der, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const head = b64urlJson({ alg: 'ES256', kid: keyId }), body = b64urlJson({ iss: teamId, iat });
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, new TextEncoder().encode(`${head}.${body}`));
  return `${head}.${body}.${b64url(sig)}`;
}
