// Prints supabase/rehearsal/nick.sql: every name of tests/helpers/nick-names.js (and every default Pilot-NNNN) run through
// private.fw_nick_bad, so the server is checked against the same lists as the browser. After changing the lists:
//   node scripts/nick-rehearsal.mjs > supabase/rehearsal/nick.sql
//   bash supabase/rehearsal/run.sh supabase/rehearsal/nick.sql      → WARNING: nick check OK: …
// tests/nick.test.js fails while the committed file differs.
import { fileURLToPath } from 'node:url';
import { REFUSED, ALLOWED } from '../tests/helpers/nick-names.js';

export function nickRehearsalSql(){
  const q = s => { if (s.includes('$q$')) throw new Error('a name may not contain $q$: ' + s); return '$q$' + s + '$q$'; };
  const pilots = Array.from({ length: 9000 }, (_, i) => 'Pilot-' + (i + 1000));
  const list = a => a.map(q).join(',\n    ');
  return `-- nickname filter: private.fw_nick_bad refuses every REFUSED name and lets every ALLOWED one (and Pilot-1000…9999) through.
-- Printed by scripts/nick-rehearsal.mjs from tests/helpers/nick-names.js; run: bash supabase/rehearsal/run.sh supabase/rehearsal/nick.sql
do $nk$
declare bad text[] := '{}'; n text;
begin
  foreach n in array array[
    ${list(REFUSED)}
  ]::text[] loop if not private.fw_nick_bad(n) then bad := bad || ('passed: ' || n); end if; end loop;
  foreach n in array array[
    ${list(ALLOWED)}
  ]::text[] loop if private.fw_nick_bad(n) then bad := bad || ('blocked: ' || n); end if; end loop;
  for i in 1000..9999 loop if private.fw_nick_bad('Pilot-' || i) then bad := bad || ('blocked: Pilot-' || i); end if; end loop;
  if cardinality(bad) > 0 then raise exception 'fw_nick_bad differs from the browser filter: %', bad; end if;
  raise warning 'nick check OK: % refused, % allowed (and % Pilot-NNNN)', ${REFUSED.length}, ${ALLOWED.length}, ${pilots.length};
end $nk$;
`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.stdout.write(nickRehearsalSql());
