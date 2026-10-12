// Prints private.fw_nick_bad for supabase/schema.sql from the word lists in index.html (the block between the
// nick-filter markers), so the browser and the server refuse the same names. After changing the lists:
//   node scripts/nick-filter-sql.mjs      and paste the output over the function in supabase/schema.sql
// tests/nick.test.js fails while the two differ.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const read = p => readFileSync(new URL(p, import.meta.url), 'utf8');

export function loadNickFilter(html = read('../index.html')){
  const m = html.match(/\/\* nick-filter:start[\s\S]*?\/\* nick-filter:end \*\//);
  if (!m) throw new Error('nick-filter block not found in index.html');
  return new Function(m[0] + '\nreturn {nickBad, NICK_RX, NICK_SEP, NICK_LEET, NICK_GAP};')();
}

// schema.sql keeps to ASCII: everything else becomes a \u escape (regex) or a U&'' literal (plain strings)
const esc = s => s.replace(/[^\x20-\x7e]/g, c => '\\u' + c.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0'));
const wide = (from, n) => Array.from({length: n}, (_, i) => '\\' + (from + i).toString(16).toUpperCase()).join('');
const AZ = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

export function nickFilterSql(f = loadNickFilter()){
  const src = r => { if (/['\uD800-\uDFFF]/.test(r.source)) throw new Error('a quote or a character outside the BMP cannot go into the SQL patterns: ' + r.source.slice(0, 40)); return esc(r.source); };
  const rx = k => src(f.NICK_RX[k]);
  return `create or replace function private.fw_nick_bad(p_nick text) returns boolean
language sql immutable set search_path = '' as $$
  select a ~ '${rx('raw')}'
      or a ~ '${rx('rawAll')}'
      or b ~ '${rx('sub')}'
      or p ~ '${rx('whole')}'
      or p ~ '[a-z]' and p !~ '${src(f.NICK_GAP)}' and b ~ '${rx('wholeAll')}'
  from (select a, p, regexp_replace(translate(p, '${f.NICK_LEET[0]}', '${f.NICK_LEET[1]}'), '[^a-z]', '', 'g') as b
        from (select regexp_replace(normalize(w, NFC), '${src(f.NICK_SEP)}', '', 'g') as a,
                     replace(lower(replace(replace(regexp_replace(normalize(w, NFD), '[\\u0300-\\u036F]', '', 'g'), U&'\\0110', 'd'), U&'\\0111', 'd')), U&'\\00DF', 'ss') as p
              from (select translate(left(coalesce(p_nick, ''), 64),
                             U&'${wide(0xFF21, 26)}${wide(0xFF41, 26)}',
                             '${AZ}${AZ.toLowerCase()}') as w) s0) s1) s2;
$$;`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.stdout.write(nickFilterSql() + '\n');
