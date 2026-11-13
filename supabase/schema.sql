-- Garage Kings – Koop-Werkstatt (Supabase / PostgreSQL)
--
-- Einmalig im Supabase-Projekt ausführen: SQL Editor → gesamten Inhalt einfügen → Run.
-- Die Datei kann gefahrlos erneut ausgeführt werden (bestehende Werkstätten bleiben erhalten).
--
-- Grundsätze
--   * Alle Tabellen sind per Row-Level-Security gesperrt. Zugriff gibt es ausschließlich über die
--     Funktionen unten; jede prüft, dass der angemeldete Spieler Mitglied der Werkstatt ist.
--   * Der Einladungscode dient nur zum Beitreten. Danach zählt allein die Mitgliedschaft des Kontos.
--   * Der gemeinsame Spielstand liegt als ein Dokument je Werkstatt vor. Änderungen kommen als Liste
--     kleiner Schritte ("ersetze Feld X: vorher A, nachher B") und werden in einer Transaktion nur
--     dann übernommen, wenn jedes "vorher" noch stimmt. So kann nichts doppelt gekauft, verkauft,
--     entnommen oder ausgezahlt werden.
--   * Werkzeuge sind einzelne Exemplare mit eigener Kennung; Entnahme und Rückgabe sind atomar.

create table if not exists gk_workshops (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  invite_code text not null unique,
  invite_open boolean not null default true,
  state jsonb not null,
  vers jsonb not null default '{}'::jsonb,
  rev bigint not null default 0,
  tools_rev bigint not null default 0,
  created_by uuid not null,
  created_at timestamptz not null default now()
);

create table if not exists gk_members (
  workshop_id uuid not null references gk_workshops(id) on delete cascade,
  user_id uuid not null,
  name text not null,
  joined_at timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  presence jsonb not null default '{}'::jsonb,
  primary key (workshop_id, user_id)
);
create index if not exists gk_members_user on gk_members(user_id);

create table if not exists gk_changes (
  workshop_id uuid not null references gk_workshops(id) on delete cascade,
  rev bigint not null,
  by_user uuid not null,
  commit_id uuid,
  patches jsonb not null,
  at timestamptz not null default now(),
  primary key (workshop_id, rev)
);

create table if not exists gk_commits (
  workshop_id uuid not null references gk_workshops(id) on delete cascade,
  commit_id uuid not null,
  rev bigint not null,
  at timestamptz not null default now(),
  primary key (workshop_id, commit_id)
);

create table if not exists gk_ledger (
  id bigserial primary key,
  workshop_id uuid not null references gk_workshops(id) on delete cascade,
  at timestamptz not null default now(),
  by_user uuid not null,
  by_name text not null,
  amount numeric not null,
  balance numeric not null,
  note text not null
);
create index if not exists gk_ledger_ws on gk_ledger(workshop_id, id desc);

create table if not exists gk_tools (
  id uuid primary key default gen_random_uuid(),
  workshop_id uuid not null references gk_workshops(id) on delete cascade,
  type text not null,
  home_box text not null,
  box text,
  holder uuid,
  taken_at timestamptz,
  -- Ein Exemplar liegt entweder in einer Kiste oder wird von genau einem Spieler getragen.
  check ((box is null) <> (holder is null))
);
create index if not exists gk_tools_ws on gk_tools(workshop_id);

alter table gk_workshops enable row level security;
alter table gk_members enable row level security;
alter table gk_changes enable row level security;
alter table gk_commits enable row level security;
alter table gk_ledger enable row level security;
alter table gk_tools enable row level security;
-- Keine Policies: direkter Tabellenzugriff ist für alle Rollen außer dem Datenbankeigentümer gesperrt.

-- ---------------------------------------------------------------- Stammdaten

create or replace function gk_box_cap(p_box text) returns int language sql immutable as $$
  select case p_box when 'kiste_a' then 6 when 'kiste_b' then 6 when 'schrank' then 14 when 'spezial' then 4 else null end;
$$;

-- Kaufpreis eines weiteren Exemplars; null = Spezialwerkzeug, das es nur einmal je Werkstatt gibt.
create or replace function gk_tool_price(p_type text) returns numeric language sql immutable as $$
  select case p_type
    when 'ratchet' then 60 when 'screwdriver' then 15 when 'wrench' then 25
    when 'socket10' then 8 when 'socket13' then 8 when 'socket16' then 12 when 'socket17' then 10
    else null end;
$$;

create or replace function gk_shared_key(p_key text) returns boolean language sql immutable as $$
  select p_key = any (array['money','cars','upgrades','fluidStock','drainPan','auctions','waiting','events','liftUp','inventory',
    'listings','jobs','day','marketIndex','carsSold','totalProfit','jobsDone','career','achieved','contest','meet','jobEarnings']);
$$;

-- ---------------------------------------------------------------- Hilfsfunktionen (nicht von außen aufrufbar)

create or replace function gk_uid() returns uuid language plpgsql stable as $$
declare v uuid := auth.uid();
begin
  if v is null then raise exception 'nicht_angemeldet'; end if;
  return v;
end $$;

create or replace function gk_require_member(p_ws uuid) returns uuid language plpgsql stable security definer set search_path = public as $$
declare v uuid := gk_uid();
begin
  if not exists (select 1 from gk_members where workshop_id = p_ws and user_id = v) then raise exception 'kein_mitglied'; end if;
  return v;
end $$;

create or replace function gk_new_code() returns text language plpgsql as $$
declare
  abc constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  code text;
begin
  loop
    code := '';
    for i in 1..6 loop code := code || substr(abc, 1 + floor(random() * length(abc))::int, 1); end loop;
    exit when not exists (select 1 from gk_workshops where invite_code = code);
  end loop;
  return code;
end $$;

create or replace function gk_tools_json(p_ws uuid) returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'type', type, 'home', home_box, 'box', box, 'holder', holder) order by type, id), '[]'::jsonb)
  from gk_tools where workshop_id = p_ws;
$$;

create or replace function gk_members_json(p_ws uuid) returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', user_id, 'name', name, 'presence', presence,
    'online', last_seen > now() - interval '15 seconds', 'seen', extract(epoch from last_seen)) order by joined_at), '[]'::jsonb)
  from gk_members where workshop_id = p_ws;
$$;

create or replace function gk_touch(p_ws uuid, p_user uuid, p_presence jsonb) returns void language plpgsql security definer set search_path = public as $$
begin
  update gk_members set last_seen = now(), presence = coalesce(p_presence, presence) where workshop_id = p_ws and user_id = p_user;
end $$;

-- Werkzeuge lange abwesender Spieler kontrolliert zurückführen: dasselbe Exemplar wandert in seine
-- Heimatkiste (oder, wenn diese voll ist, in eine Kiste mit Platz). Es entsteht nie ein zweites Exemplar.
create or replace function gk_reclaim(p_ws uuid) returns void language plpgsql security definer set search_path = public as $$
declare t record; target text;
begin
  for t in
    select tl.id, tl.home_box from gk_tools tl join gk_members m on m.workshop_id = tl.workshop_id and m.user_id = tl.holder
    where tl.workshop_id = p_ws and m.last_seen < now() - interval '30 minutes' for update of tl
  loop
    select b into target from unnest(array[t.home_box, 'schrank', 'kiste_a', 'kiste_b', 'spezial']) with ordinality as x(b, ord)
      where (select count(*) from gk_tools where workshop_id = p_ws and box = b) < gk_box_cap(b) order by ord limit 1;
    update gk_tools set holder = null, box = coalesce(target, t.home_box), taken_at = null where id = t.id;
    update gk_workshops set tools_rev = tools_rev + 1 where id = p_ws;
  end loop;
end $$;

create or replace function gk_changes_json(p_ws uuid, p_since bigint, p_until bigint) returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('rev', rev, 'by', by_user, 'commit', commit_id, 'patches', patches) order by rev), '[]'::jsonb)
  from gk_changes where workshop_id = p_ws and rev > p_since and rev <= p_until;
$$;

-- ---------------------------------------------------------------- Werkstatt anlegen, beitreten, auflisten

create or replace function gk_create_workshop(p_name text, p_player text, p_state jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v uuid := gk_uid(); w uuid; code text; k text;
begin
  if (select count(*) from gk_members where user_id = v) >= 5 then raise exception 'zu_viele_werkstaetten'; end if;
  if jsonb_typeof(p_state) <> 'object' or jsonb_typeof(p_state->'cars') <> 'array' or jsonb_typeof(p_state->'money') <> 'number' then raise exception 'ungueltiger_spielstand'; end if;
  for k in select jsonb_object_keys(p_state) loop
    if not gk_shared_key(k) then raise exception 'ungueltiges_feld %', k; end if;
  end loop;
  code := gk_new_code();
  insert into gk_workshops(name, invite_code, state, created_by) values (left(coalesce(nullif(trim(p_name), ''), 'Werkstatt'), 40), code, p_state, v) returning id into w;
  insert into gk_members(workshop_id, user_id, name) values (w, v, left(coalesce(nullif(trim(p_player), ''), 'Spieler 1'), 24));
  -- Grundausstattung: jede Kiste hat ihren eigenen Bestand; Drehmomentschlüssel und Diagnosegerät gibt es nur einmal.
  insert into gk_tools(workshop_id, type, home_box, box)
  select w, t, b, b from (values
    ('kiste_a', 'ratchet'), ('kiste_a', 'socket10'), ('kiste_a', 'socket16'), ('kiste_a', 'screwdriver'),
    ('kiste_b', 'ratchet'), ('kiste_b', 'socket13'), ('kiste_b', 'socket17'), ('kiste_b', 'wrench'),
    ('schrank', 'ratchet'), ('schrank', 'socket10'), ('schrank', 'socket13'), ('schrank', 'socket16'), ('schrank', 'socket17'), ('schrank', 'screwdriver'), ('schrank', 'wrench'),
    ('spezial', 'torque'), ('spezial', 'obd')
  ) as seed(b, t);
  insert into gk_ledger(workshop_id, by_user, by_name, amount, balance, note)
  values (w, v, (select name from gk_members where workshop_id = w and user_id = v), 0, (p_state->>'money')::numeric, 'Werkstatt gegründet');
  return jsonb_build_object('id', w, 'code', code);
end $$;

create or replace function gk_join_workshop(p_code text, p_player text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v uuid := gk_uid(); w uuid; n int;
begin
  select id into w from gk_workshops where invite_code = upper(trim(p_code)) and invite_open for update;
  if w is null then return jsonb_build_object('ok', false, 'reason', 'code_unbekannt'); end if;
  if exists (select 1 from gk_members where workshop_id = w and user_id = v) then return jsonb_build_object('ok', true, 'id', w); end if;
  select count(*) into n from gk_members where workshop_id = w;
  if n >= 4 then return jsonb_build_object('ok', false, 'reason', 'voll'); end if;
  if (select count(*) from gk_members where user_id = v) >= 5 then return jsonb_build_object('ok', false, 'reason', 'zu_viele_werkstaetten'); end if;
  insert into gk_members(workshop_id, user_id, name) values (w, v, left(coalesce(nullif(trim(p_player), ''), 'Spieler ' || (n + 1)), 24));
  return jsonb_build_object('ok', true, 'id', w);
end $$;

create or replace function gk_my_workshops() returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', w.id, 'name', w.name, 'code', w.invite_code, 'money', w.state->'money', 'day', w.state->'day',
    'members', (select jsonb_agg(m2.name order by m2.joined_at) from gk_members m2 where m2.workshop_id = w.id)) order by m.joined_at), '[]'::jsonb)
  from gk_members m join gk_workshops w on w.id = m.workshop_id where m.user_id = auth.uid();
$$;

-- Einladung schließen/öffnen oder einen neuen Code erzeugen (der alte wird sofort ungültig).
create or replace function gk_set_invite(p_ws uuid, p_open boolean, p_renew boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v uuid := gk_require_member(p_ws); code text;
begin
  update gk_workshops set invite_open = p_open, invite_code = case when p_renew then gk_new_code() else invite_code end where id = p_ws returning invite_code into code;
  return jsonb_build_object('code', code, 'open', p_open);
end $$;

create or replace function gk_rename_player(p_ws uuid, p_player text) returns void
language plpgsql security definer set search_path = public as $$
declare v uuid := gk_require_member(p_ws);
begin
  update gk_members set name = left(coalesce(nullif(trim(p_player), ''), name), 24) where workshop_id = p_ws and user_id = v;
end $$;

-- ---------------------------------------------------------------- Zustand laden und abgleichen

create or replace function gk_get_state(p_ws uuid) returns jsonb language plpgsql security definer set search_path = public as $$
declare v uuid := gk_require_member(p_ws); w gk_workshops%rowtype;
begin
  perform gk_touch(p_ws, v, null);
  perform gk_reclaim(p_ws);
  select * into w from gk_workshops where id = p_ws;
  return jsonb_build_object('me', v, 'name', w.name, 'code', w.invite_code, 'open', w.invite_open, 'state', w.state, 'rev', w.rev, 'vers', w.vers,
    'toolsRev', w.tools_rev, 'tools', gk_tools_json(p_ws), 'members', gk_members_json(p_ws));
end $$;

-- Regelmäßiger Abgleich: meldet die eigene Anwesenheit und liefert alles, was seit p_since passiert ist.
create or replace function gk_sync(p_ws uuid, p_since bigint, p_tools_rev bigint, p_presence jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v uuid := gk_require_member(p_ws); w record; oldest bigint;
begin
  perform gk_touch(p_ws, v, p_presence);
  perform gk_reclaim(p_ws);
  select rev, vers, tools_rev into w from gk_workshops where id = p_ws;
  select min(rev) into oldest from gk_changes where workshop_id = p_ws;
  if p_since < w.rev and (oldest is null or oldest > p_since + 1) then
    -- Zu lange weg: die Einzelschritte sind nicht mehr vorrätig, der Client lädt den Stand neu.
    return jsonb_build_object('reset', true, 'rev', w.rev);
  end if;
  return jsonb_build_object('rev', w.rev, 'vers', w.vers, 'changes', gk_changes_json(p_ws, p_since, w.rev), 'members', gk_members_json(p_ws),
    'toolsRev', w.tools_rev, 'tools', case when w.tools_rev <> p_tools_rev then gk_tools_json(p_ws) else null end);
end $$;

-- Änderung am gemeinsamen Spielstand. p_patches = [{ "path": ["cars","0","components","coil1"], "before": …, "after": … }, …]
-- Statt "before" kann "ver" stehen: die erwartete Versionsnummer des obersten Feldes (für große Listen).
create or replace function gk_commit(p_ws uuid, p_id uuid, p_since bigint, p_patches jsonb, p_note text, p_presence jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v uuid := gk_require_member(p_ws);
  w gk_workshops%rowtype;
  st jsonb; vs jsonb; p jsonb; path text[]; k text; cur jsonb; aft jsonb;
  touched text[] := '{}';
  old_money numeric; new_money numeric; done bigint; gone text; who text;
begin
  perform gk_touch(p_ws, v, p_presence);
  select * into w from gk_workshops where id = p_ws for update;
  -- Wiederholte Übertragung derselben Änderung (z. B. nach einem Verbindungsabbruch) wird nicht doppelt ausgeführt.
  select rev into done from gk_commits where workshop_id = p_ws and commit_id = p_id;
  if done is not null then
    return jsonb_build_object('ok', true, 'rev', w.rev, 'own', done, 'vers', w.vers, 'changes', gk_changes_json(p_ws, p_since, w.rev));
  end if;
  if jsonb_typeof(p_patches) <> 'array' or jsonb_array_length(p_patches) = 0 or jsonb_array_length(p_patches) > 400 then raise exception 'ungueltige_aenderung'; end if;
  st := w.state; vs := w.vers;
  for p in select * from jsonb_array_elements(p_patches) loop
    select array_agg(x order by ord) into path from jsonb_array_elements_text(p->'path') with ordinality as t(x, ord);
    if path is null or array_length(path, 1) > 4 then raise exception 'ungueltiger_pfad'; end if;
    k := path[1];
    if not gk_shared_key(k) then raise exception 'ungueltiges_feld %', k; end if;
    if p ? 'ver' then
      if coalesce((vs->>k)::bigint, 0) <> (p->>'ver')::bigint then
        return jsonb_build_object('ok', false, 'reason', 'konflikt', 'path', p->'path', 'rev', w.rev, 'vers', w.vers, 'changes', gk_changes_json(p_ws, p_since, w.rev));
      end if;
    else
      cur := coalesce(st #> path, 'null'::jsonb);
      if cur is distinct from coalesce(p->'before', 'null'::jsonb) then
        return jsonb_build_object('ok', false, 'reason', 'konflikt', 'path', p->'path', 'rev', w.rev, 'vers', w.vers, 'changes', gk_changes_json(p_ws, p_since, w.rev));
      end if;
    end if;
    aft := coalesce(p->'after', 'null'::jsonb);
    -- "null" in einem Objekt heißt: Feld entfernen (sonst unterschiede sich das gespeicherte Auto vom Stand im Spiel).
    -- In Listen (Stellplätze, Hebebühnen) bleibt null als leerer Platz stehen.
    if aft = 'null'::jsonb and array_length(path, 1) > 1 and jsonb_typeof(st #> path[1:array_length(path, 1) - 1]) = 'object' then
      st := st #- path;
    else
      st := jsonb_set(st, path, aft, true);
    end if;
    if coalesce(st #> path, 'null'::jsonb) is distinct from aft then raise exception 'pfad_nicht_vorhanden %', path; end if;
    if not k = any (touched) then touched := touched || k; end if;
  end loop;

  -- Unverletzliche Regeln des gemeinsamen Spielstands
  old_money := (w.state->>'money')::numeric;
  if jsonb_typeof(st->'money') <> 'number' then raise exception 'ungueltiges_geld'; end if;
  new_money := (st->>'money')::numeric;
  if new_money < 0 and new_money < old_money then
    return jsonb_build_object('ok', false, 'reason', 'geld', 'rev', w.rev, 'vers', w.vers, 'changes', gk_changes_json(p_ws, p_since, w.rev));
  end if;
  if exists (select 1 from jsonb_each(st->'inventory') e where jsonb_typeof(e.value) = 'number' and (e.value #>> '{}')::numeric < 0)
     or exists (select 1 from jsonb_each(st->'fluidStock') e where jsonb_typeof(e.value) = 'number' and (e.value #>> '{}')::numeric < -0.0001) then
    return jsonb_build_object('ok', false, 'reason', 'bestand', 'rev', w.rev, 'vers', w.vers, 'changes', gk_changes_json(p_ws, p_since, w.rev));
  end if;
  if 'cars' = any (touched) or 'waiting' = any (touched) then
    if jsonb_typeof(st->'cars') <> 'array' or jsonb_array_length(st->'cars') <> jsonb_array_length(w.state->'cars') then raise exception 'ungueltige_stellplaetze'; end if;
    -- Kein Auto darf doppelt existieren (zwei Stellplätze oder Stellplatz + Warteliste).
    if exists (
      select 1 from (
        select c->>'uid' as uid from jsonb_array_elements(st->'cars') c where jsonb_typeof(c) = 'object'
        union all
        select c->>'uid' from jsonb_array_elements(coalesce(st->'waiting', '[]'::jsonb)) c where jsonb_typeof(c) = 'object'
      ) u group by uid having count(*) > 1
    ) then
      return jsonb_build_object('ok', false, 'reason', 'doppelt', 'rev', w.rev, 'vers', w.vers, 'changes', gk_changes_json(p_ws, p_since, w.rev));
    end if;
    -- Ein Auto, an dem der Partner gerade arbeitet, darf nicht verkauft oder abgegeben werden.
    select o.uid into gone from (
      select c->>'uid' as uid from jsonb_array_elements(w.state->'cars') c where jsonb_typeof(c) = 'object'
    ) o where not exists (
      select 1 from jsonb_array_elements(st->'cars') c where jsonb_typeof(c) = 'object' and c->>'uid' = o.uid
    ) and exists (
      select 1 from gk_members m where m.workshop_id = p_ws and m.user_id <> v and m.last_seen > now() - interval '15 seconds' and m.presence->>'car' = o.uid
    ) limit 1;
    if gone is not null then
      return jsonb_build_object('ok', false, 'reason', 'gesperrt', 'rev', w.rev, 'vers', w.vers, 'changes', gk_changes_json(p_ws, p_since, w.rev));
    end if;
  end if;

  foreach k in array touched loop
    vs := jsonb_set(vs, array[k], to_jsonb(coalesce((vs->>k)::bigint, 0) + 1), true);
  end loop;
  update gk_workshops set state = st, vers = vs, rev = w.rev + 1 where id = p_ws;
  insert into gk_changes(workshop_id, rev, by_user, commit_id, patches) values (p_ws, w.rev + 1, v, p_id, p_patches);
  insert into gk_commits(workshop_id, commit_id, rev) values (p_ws, p_id, w.rev + 1);
  delete from gk_changes where workshop_id = p_ws and rev < w.rev - 400;
  delete from gk_commits where workshop_id = p_ws and rev < w.rev - 400;
  if new_money <> old_money then
    select name into who from gk_members where workshop_id = p_ws and user_id = v;
    insert into gk_ledger(workshop_id, by_user, by_name, amount, balance, note)
    values (p_ws, v, who, new_money - old_money, new_money, left(coalesce(nullif(trim(p_note), ''), case when new_money > old_money then 'Einnahme' else 'Ausgabe' end), 160));
    delete from gk_ledger where workshop_id = p_ws and id < (select id from gk_ledger where workshop_id = p_ws order by id desc offset 300 limit 1);
  end if;
  return jsonb_build_object('ok', true, 'rev', w.rev + 1, 'own', w.rev + 1, 'vers', vs, 'changes', gk_changes_json(p_ws, p_since, w.rev));
end $$;

create or replace function gk_ledger_list(p_ws uuid, p_limit int) returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v uuid := gk_require_member(p_ws);
begin
  return (select coalesce(jsonb_agg(row order by id desc), '[]'::jsonb) from (
    select id, jsonb_build_object('at', extract(epoch from at), 'by', by_name, 'amount', amount, 'balance', balance, 'note', note) as row
    from gk_ledger where workshop_id = p_ws order by id desc limit least(greatest(p_limit, 1), 100)) x);
end $$;

-- ---------------------------------------------------------------- Werkzeugexemplare

create or replace function gk_take_tool(p_ws uuid, p_tool uuid) returns jsonb language plpgsql security definer set search_path = public as $$
declare v uuid := gk_require_member(p_ws); t gk_tools%rowtype; r bigint;
begin
  select * into t from gk_tools where id = p_tool and workshop_id = p_ws for update;
  if t.id is null then return jsonb_build_object('ok', false, 'reason', 'unbekannt'); end if;
  if t.holder is not null then return jsonb_build_object('ok', false, 'reason', case when t.holder = v then 'schon_dabei' else 'vergeben' end, 'tools', gk_tools_json(p_ws)); end if;
  -- Zeilensperren auf den eigenen Werkzeugen verhindern, dass zwei gleichzeitige Griffe die Obergrenze umgehen.
  perform 1 from gk_tools where workshop_id = p_ws and holder = v for update;
  if (select count(*) from gk_tools where workshop_id = p_ws and holder = v) >= 3 then return jsonb_build_object('ok', false, 'reason', 'leiste_voll'); end if;
  update gk_tools set holder = v, box = null, taken_at = now() where id = p_tool;
  update gk_workshops set tools_rev = tools_rev + 1 where id = p_ws returning tools_rev into r;
  return jsonb_build_object('ok', true, 'toolsRev', r, 'tools', gk_tools_json(p_ws));
end $$;

create or replace function gk_return_tool(p_ws uuid, p_tool uuid, p_box text) returns jsonb language plpgsql security definer set search_path = public as $$
declare v uuid := gk_require_member(p_ws); t gk_tools%rowtype; r bigint;
begin
  if gk_box_cap(p_box) is null then return jsonb_build_object('ok', false, 'reason', 'kiste_unbekannt'); end if;
  select * into t from gk_tools where id = p_tool and workshop_id = p_ws for update;
  if t.id is null or t.holder is distinct from v then return jsonb_build_object('ok', false, 'reason', 'nicht_dabei', 'tools', gk_tools_json(p_ws)); end if;
  perform 1 from gk_workshops where id = p_ws for update;
  if (select count(*) from gk_tools where workshop_id = p_ws and box = p_box) >= gk_box_cap(p_box) then return jsonb_build_object('ok', false, 'reason', 'kiste_voll'); end if;
  update gk_tools set holder = null, box = p_box, taken_at = null where id = p_tool;
  update gk_workshops set tools_rev = tools_rev + 1 where id = p_ws returning tools_rev into r;
  return jsonb_build_object('ok', true, 'toolsRev', r, 'tools', gk_tools_json(p_ws));
end $$;

-- Weiteres Exemplar kaufen: eigenständiges Werkzeug mit neuer Kennung, bezahlt vom Werkstattkonto.
create or replace function gk_buy_tool(p_ws uuid, p_type text, p_box text) returns jsonb language plpgsql security definer set search_path = public as $$
declare v uuid := gk_require_member(p_ws); w gk_workshops%rowtype; price numeric := gk_tool_price(p_type); m numeric; vs jsonb; who text;
begin
  if price is null then return jsonb_build_object('ok', false, 'reason', 'nicht_kaeuflich'); end if;
  if gk_box_cap(p_box) is null then return jsonb_build_object('ok', false, 'reason', 'kiste_unbekannt'); end if;
  select * into w from gk_workshops where id = p_ws for update;
  m := (w.state->>'money')::numeric;
  if m < price then return jsonb_build_object('ok', false, 'reason', 'geld'); end if;
  if (select count(*) from gk_tools where workshop_id = p_ws and box = p_box) >= gk_box_cap(p_box) then return jsonb_build_object('ok', false, 'reason', 'kiste_voll'); end if;
  insert into gk_tools(workshop_id, type, home_box, box) values (p_ws, p_type, p_box, p_box);
  vs := jsonb_set(w.vers, '{money}', to_jsonb(coalesce((w.vers->>'money')::bigint, 0) + 1), true);
  update gk_workshops set state = jsonb_set(state, '{money}', to_jsonb(m - price)), vers = vs, rev = rev + 1, tools_rev = tools_rev + 1 where id = p_ws;
  insert into gk_changes(workshop_id, rev, by_user, patches) values (p_ws, w.rev + 1, v, jsonb_build_array(jsonb_build_object('path', jsonb_build_array('money'), 'before', to_jsonb(m), 'after', to_jsonb(m - price))));
  select name into who from gk_members where workshop_id = p_ws and user_id = v;
  insert into gk_ledger(workshop_id, by_user, by_name, amount, balance, note) values (p_ws, v, who, -price, m - price, 'Werkzeug gekauft: ' || p_type);
  return jsonb_build_object('ok', true, 'tools', gk_tools_json(p_ws), 'toolsRev', w.tools_rev + 1);
end $$;

-- ---------------------------------------------------------------- Rechte

revoke all on all tables in schema public from anon, authenticated;
revoke all on function gk_touch(uuid, uuid, jsonb), gk_reclaim(uuid), gk_tools_json(uuid), gk_members_json(uuid), gk_changes_json(uuid, bigint, bigint), gk_require_member(uuid), gk_new_code() from public, anon, authenticated;
revoke all on function gk_create_workshop(text, text, jsonb), gk_join_workshop(text, text), gk_my_workshops(), gk_set_invite(uuid, boolean, boolean), gk_rename_player(uuid, text),
  gk_get_state(uuid), gk_sync(uuid, bigint, bigint, jsonb), gk_commit(uuid, uuid, bigint, jsonb, text, jsonb), gk_ledger_list(uuid, int),
  gk_take_tool(uuid, uuid), gk_return_tool(uuid, uuid, text), gk_buy_tool(uuid, text, text) from public, anon;
grant execute on function gk_create_workshop(text, text, jsonb), gk_join_workshop(text, text), gk_my_workshops(), gk_set_invite(uuid, boolean, boolean), gk_rename_player(uuid, text),
  gk_get_state(uuid), gk_sync(uuid, bigint, bigint, jsonb), gk_commit(uuid, uuid, bigint, jsonb, text, jsonb), gk_ledger_list(uuid, int),
  gk_take_tool(uuid, uuid), gk_return_tool(uuid, uuid, text), gk_buy_tool(uuid, text, text) to authenticated;
