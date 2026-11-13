#!/bin/bash
# Startet eine frische lokale PostgreSQL-Instanz mit dem Koop-Schema (für Tests; ersetzt kein Supabase-Projekt).
#   supabase/test/db.sh start|stop     Port: GK_PG_PORT (Standard 54329)
PORT="${GK_PG_PORT:-54329}"
DIR=/tmp/gkpg
BIN="$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)"
HERE="$(cd "$(dirname "$0")" && pwd)"
run() { if [ "$(id -u)" = 0 ]; then id pgtest >/dev/null 2>&1 || useradd -m pgtest; su pgtest -c "$1"; else sh -c "$1"; fi; }
if [ "$1" = stop ]; then run "$BIN/pg_ctl -D $DIR/data stop -m fast" >/dev/null 2>&1; exit 0; fi
run "$BIN/pg_ctl -D $DIR/data stop -m fast" >/dev/null 2>&1
rm -rf "$DIR"; mkdir -p "$DIR"; [ "$(id -u)" = 0 ] && chown pgtest "$DIR"
run "$BIN/initdb -D $DIR/data -A trust -U postgres > $DIR/init.log 2>&1 && $BIN/pg_ctl -D $DIR/data -o '-p $PORT -k $DIR -c listen_addresses=127.0.0.1 -c fsync=off' -l $DIR/log start > /dev/null" || { echo "PostgreSQL ließ sich nicht starten"; exit 1; }
for i in $(seq 1 30); do psql -h 127.0.0.1 -p "$PORT" -U postgres -c 'select 1' >/dev/null 2>&1 && break; sleep 0.3; done
# Was Supabase von sich aus mitbringt: Rollen und auth.uid()
psql -q -h 127.0.0.1 -p "$PORT" -U postgres -v ON_ERROR_STOP=1 <<SQL
create role anon nologin; create role authenticated nologin;
create schema auth;
create function auth.uid() returns uuid language sql stable as \$\$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid \$\$;
grant usage on schema auth to anon, authenticated; grant usage on schema public to anon, authenticated;
SQL
psql -q -h 127.0.0.1 -p "$PORT" -U postgres -v ON_ERROR_STOP=1 -f "$HERE/../schema.sql" && psql -q -h 127.0.0.1 -p "$PORT" -U postgres -v ON_ERROR_STOP=1 -f "$HERE/../schema.sql" && echo "Datenbank bereit auf Port $PORT (Schema zweimal fehlerfrei eingespielt)"
