// push-send: one friend alert (a new row of private.fw_social_feed) as an APNs push to the recipient's iOS devices.
// Called only by the database (trigger private.fw_push_hook through pg_net) with the shared secret in x-push-secret; verify_jwt is off
// (supabase/config.toml). The trigger sends everything needed: {kind, val, nick, devices: [{token, lang}]} (only the devices whose
// player keeps that kind on), so the function reads nothing. Secrets: PUSH_HOOK_SECRET (same value as the vault secret
// push_hook_secret), APNS_KEY (the .p8 text), APNS_KEY_ID, APNS_TEAM_ID; APNS_TOPIC defaults to the bundle id. Tokens Apple calls
// dead (410, or BadDeviceToken on both hosts) go back to public.push_drop. Until the APNs secrets exist it answers 202, sends nothing.
import { createClient } from 'npm:@supabase/supabase-js@2.117.2';
import { alertFor, apnsHost, apnsJwt } from './lib.js';
import TEXTS from './texts.json' with { type: 'json' };

const env = (k: string) => Deno.env.get(k) ?? '';
let jwtCache = { at: 0, jwt: '' };

async function providerToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (jwtCache.jwt && now - jwtCache.at < 50 * 60) return jwtCache.jwt;   // Apple accepts a token for an hour, refreshes are rate limited
  jwtCache = { at: now, jwt: await apnsJwt(env('APNS_KEY'), env('APNS_KEY_ID'), env('APNS_TEAM_ID'), now) };
  return jwtCache.jwt;
}

async function send(token: string, alert: { title: string; body: string }, sandbox: boolean) {
  const res = await fetch(`${apnsHost(sandbox)}/3/device/${token}`, {
    method: 'POST',
    headers: { authorization: `bearer ${await providerToken()}`, 'apns-topic': env('APNS_TOPIC') || 'com.minimalkorea.swishby',
      'apns-push-type': 'alert', 'apns-priority': '10', 'apns-expiration': String(Math.floor(Date.now() / 1000) + 3600) },
    body: JSON.stringify({ aps: { alert, sound: 'default' } }),
  });
  const reason = res.ok ? '' : ((await res.json().catch(() => ({}))) as { reason?: string }).reason ?? '';
  return { status: res.status, reason };
}

// The hook secret, compared without an early exit (no timing hint about how much of a guess was right)
function sameSecret(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a), y = new TextEncoder().encode(b);
  let d = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) d |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return d === 0;
}

type Hook = { kind?: string; val?: number; nick?: string; devices?: { token: string; lang: string }[] };

Deno.serve(async (req) => {
  if (req.method !== 'POST' || !env('PUSH_HOOK_SECRET') || !sameSecret(req.headers.get('x-push-secret') ?? '', env('PUSH_HOOK_SECRET')))
    return new Response('forbidden', { status: 403 });
  if (!env('APNS_KEY') || !env('APNS_KEY_ID') || !env('APNS_TEAM_ID')) return new Response('apns not configured', { status: 202 });
  const hook = (await req.json().catch(() => ({}))) as Hook;
  if (!Array.isArray(hook.devices) || typeof hook.kind !== 'string') return new Response('bad input', { status: 400 });

  let sent = 0;
  const dead: string[] = [];
  for (const d of hook.devices.slice(0, 10)) {
    const alert = alertFor(TEXTS, d.lang, hook.kind, hook.nick ?? '', hook.val ?? 0);
    if (!alert || !/^[0-9a-f]{64,200}$/.test(d.token)) continue;
    let r = await send(d.token, alert, false);
    if (r.status === 403 && /ProviderToken/.test(r.reason)) { jwtCache = { at: 0, jwt: '' }; r = await send(d.token, alert, false); }   // a stale signing token
    if (r.status === 400 && r.reason === 'BadDeviceToken') r = await send(d.token, alert, true);   // a development build's token
    if (r.status === 410 || (r.status === 400 && r.reason === 'BadDeviceToken')) dead.push(d.token);
    else if (r.status === 200) sent++;
  }
  if (dead.length) {
    const db = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });
    const { error } = await db.rpc('push_drop', { p_tokens: dead });
    if (error) console.error('push_drop', error.message);
  }
  return new Response(JSON.stringify({ sent, dropped: dead.length }), { headers: { 'content-type': 'application/json' } });
});
