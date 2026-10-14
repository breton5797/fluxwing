#!/bin/bash
# Rehearse supabase/schema.sql on a throwaway local Postgres 17 (never the production project): a temp cluster,
# and for each check script a fresh database with the Supabase parts it needs (stub.sql) and schema.sql applied
# twice (it must be idempotent), then the script.
#   bash supabase/rehearsal/run.sh supabase/rehearsal/rehearse.sql supabase/rehearsal/harden.sql
# rehearse.sql: the season rollover (the code path of the first versus call after 00:00 KST on the 1st, and of the
#               pg_cron job), claims, and a 100,000-player rollover timed under the 8 s API timeout.
# harden.sql:   the leaderboard gate cap, time budget and hidden rows.
# Needs: Postgres 17 binaries (Homebrew: brew install postgresql@17). pg_cron is not needed: the cron block skips itself.
set -u
HERE=$(cd "$(dirname "$0")" && pwd); ROOT=$(cd "$HERE/../.." && pwd)
BIN=${PG_BIN:-/opt/homebrew/opt/postgresql@17/bin}; export PATH="$BIN:$PATH"
D=$(mktemp -d); PORT=${PORT:-54917}
trap 'pg_ctl -D "$D/pg" -m fast -w stop >/dev/null 2>&1; rm -rf "$D"' EXIT
initdb -D "$D/pg" -E UTF8 --locale=en_US.UTF-8 -U postgres >/dev/null || exit 1
pg_ctl -D "$D/pg" -o "-p $PORT -c listen_addresses='' -k $D" -l "$D/pg.log" -w start >/dev/null || { tail -5 "$D/pg.log"; exit 1; }
export PGHOST="$D" PGUSER=postgres PGPORT=$PORT
for f in "$@"; do
  echo "=== $f"
  psql -X -q -d postgres -c "drop database if exists fw_reh" -c "create database fw_reh" 2>&1 | grep -v NOTICE
  psql -X -q -d postgres -c "drop role if exists anon" -c "drop role if exists authenticated" -c "drop role if exists service_role" 2>/dev/null
  export PGDATABASE=fw_reh
  psql -X -q -f "$HERE/stub.sql" || exit 1
  for i in 1 2; do echo "--- schema.sql, run $i"; psql -X -q -v ON_ERROR_STOP=1 -f "$ROOT/supabase/schema.sql" 2>&1 | grep -v -E "NOTICE|^$" | tail -5; done
  psql -X -q -f "$f" 2>&1 | grep -v NOTICE
done
