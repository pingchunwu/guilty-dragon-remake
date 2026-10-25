-- Core schema: players, collection, decks, tickets, gacha.
-- Players never write tables directly. All writes go through the security
-- definer functions at the bottom, which derive the player from auth.uid().

create type public.card_type as enum ('heavy', 'light', 'magic');
create type public.deck_kind as enum ('attack', 'defense');

-- Public content ----------------------------------------------------------

create table public.card_definitions (
  id   text primary key,
  name text not null,
  type public.card_type not null
);

create table public.card_pools (
  id     text primary key,
  active boolean not null default false
);

-- At most one active pool in v1.
create unique index card_pools_one_active on public.card_pools (active) where active;

create table public.pool_entries (
  pool_id text not null references public.card_pools (id) on delete cascade,
  card_id text not null references public.card_definitions (id),
  weight  integer not null check (weight >= 0),
  primary key (pool_id, card_id)
);

-- Tunable values, e.g. starting_tickets and default_deck.
create table public.game_config (
  key   text primary key,
  value jsonb not null
);

-- Player state ------------------------------------------------------------

create table public.players (
  id               uuid primary key references auth.users (id) on delete cascade,
  tickets          integer not null check (tickets >= 0),
  -- Last Asia/Taipei date daily tickets were accrued for.
  last_ticket_date date not null,
  created_at       timestamptz not null default now()
);

create table public.ticket_ledger (
  id         bigint generated always as identity primary key,
  player_id  uuid not null references public.players (id) on delete cascade,
  delta      integer not null,
  reason     text not null check (reason in ('starting', 'daily', 'draw')),
  ref        text,
  created_at timestamptz not null default now()
);

create table public.player_cards (
  player_id uuid not null references public.players (id) on delete cascade,
  card_id   text not null references public.card_definitions (id),
  level     integer not null default 1 check (level >= 1),
  shards    integer not null default 0 check (shards >= 0),
  primary key (player_id, card_id)
);

create table public.decks (
  player_id  uuid not null references public.players (id) on delete cascade,
  kind       public.deck_kind not null,
  -- {"heavy": [...8 ids], "light": [...], "magic": [...], "free": [...]}
  slots      jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (player_id, kind)
);

create table public.gacha_requests (
  player_id       uuid not null references public.players (id) on delete cascade,
  idempotency_key text not null check (length(idempotency_key) between 8 and 100),
  pool_id         text not null references public.card_pools (id),
  results         jsonb not null,
  created_at      timestamptz not null default now(),
  primary key (player_id, idempotency_key)
);

-- Row-level security: content is public, player rows are own-read-only ------

alter table public.card_definitions enable row level security;
alter table public.card_pools       enable row level security;
alter table public.pool_entries     enable row level security;
alter table public.game_config      enable row level security;
alter table public.players          enable row level security;
alter table public.ticket_ledger    enable row level security;
alter table public.player_cards     enable row level security;
alter table public.decks            enable row level security;
alter table public.gacha_requests   enable row level security;

create policy "content readable" on public.card_definitions for select using (true);
create policy "content readable" on public.card_pools       for select using (true);
create policy "content readable" on public.pool_entries     for select using (true);
create policy "content readable" on public.game_config      for select using (true);

create policy "own rows" on public.players        for select to authenticated using (id = auth.uid());
create policy "own rows" on public.ticket_ledger  for select to authenticated using (player_id = auth.uid());
create policy "own rows" on public.player_cards   for select to authenticated using (player_id = auth.uid());
create policy "own rows" on public.decks          for select to authenticated using (player_id = auth.uid());
create policy "own rows" on public.gacha_requests for select to authenticated using (player_id = auth.uid());

revoke insert, update, delete, truncate on all tables in schema public from anon, authenticated;

-- Internal helpers (not callable by clients) -------------------------------

create function public.taipei_today() returns date
language sql stable
as $$ select (now() at time zone 'Asia/Taipei')::date $$;

create function public.require_player() returns uuid
language plpgsql
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;
  return v_uid;
end;
$$;

-- Lazily grants one ticket per Taipei day since the last accrual. Caller must
-- hold the player row lock.
create function public.accrue_daily_tickets(p_player uuid) returns void
language plpgsql
as $$
declare
  v_last date;
  v_days integer;
begin
  select last_ticket_date into v_last from public.players where id = p_player;
  v_days := public.taipei_today() - v_last;
  if v_days > 0 then
    update public.players
       set tickets = tickets + v_days, last_ticket_date = public.taipei_today()
     where id = p_player;
    insert into public.ticket_ledger (player_id, delta, reason, ref)
    values (p_player, v_days, 'daily', public.taipei_today()::text);
  end if;
end;
$$;

create function public.player_state(p_player uuid) returns jsonb
language sql stable
as $$
  select jsonb_build_object(
    'tickets', (select tickets from public.players where id = p_player),
    'cards', coalesce(
      (select jsonb_object_agg(card_id, jsonb_build_object('level', level, 'shards', shards))
         from public.player_cards where player_id = p_player),
      '{}'::jsonb),
    'decks', coalesce(
      (select jsonb_object_agg(kind, slots) from public.decks where player_id = p_player),
      '{}'::jsonb)
  )
$$;

-- Returns validation errors in the same shape as the engine's DeckError.
create function public.deck_errors(p_player uuid, p_slots jsonb) returns jsonb
language plpgsql stable
as $$
declare
  v_errors jsonb := '[]'::jsonb;
  v_slot text;
  v_ids jsonb;
  v_id text;
  v_card public.card_definitions;
  v_seen text[] := '{}';
  v_names text[];
begin
  if jsonb_typeof(p_slots) is distinct from 'object' then
    return jsonb_build_array(jsonb_build_object('code', 'MALFORMED'));
  end if;

  foreach v_slot in array array['heavy', 'light', 'magic', 'free'] loop
    v_ids := p_slots -> v_slot;
    if jsonb_typeof(v_ids) is distinct from 'array' then
      v_errors := v_errors || jsonb_build_object('code', 'MALFORMED', 'slot', v_slot);
      continue;
    end if;
    if jsonb_array_length(v_ids) <> 8 then
      v_errors := v_errors || jsonb_build_object(
        'code', 'SLOT_SIZE', 'slot', v_slot, 'expected', 8, 'actual', jsonb_array_length(v_ids));
    end if;

    v_names := '{}';
    for v_id in select jsonb_array_elements_text(v_ids) loop
      if v_id = any (v_seen) then
        v_errors := v_errors || jsonb_build_object('code', 'DUPLICATE_CARD_IN_DECK', 'slot', v_slot, 'cardId', v_id);
      end if;
      v_seen := v_seen || v_id;

      select * into v_card from public.card_definitions where id = v_id;
      if not found then
        v_errors := v_errors || jsonb_build_object('code', 'UNKNOWN_CARD', 'slot', v_slot, 'cardId', v_id);
        continue;
      end if;
      if not exists (select 1 from public.player_cards where player_id = p_player and card_id = v_id) then
        v_errors := v_errors || jsonb_build_object('code', 'NOT_OWNED', 'slot', v_slot, 'cardId', v_id);
      end if;
      if v_slot <> 'free' and v_card.type::text <> v_slot then
        v_errors := v_errors || jsonb_build_object('code', 'WRONG_TYPE', 'slot', v_slot, 'cardId', v_id);
      end if;
      if v_card.name = any (v_names) then
        v_errors := v_errors || jsonb_build_object('code', 'DUPLICATE_NAME_IN_SLOT', 'slot', v_slot, 'name', v_card.name);
      end if;
      v_names := v_names || v_card.name;
    end loop;
  end loop;

  if (select count(*) from jsonb_object_keys(p_slots)) <> 4 then
    v_errors := v_errors || jsonb_build_object('code', 'MALFORMED');
  end if;
  return v_errors;
end;
$$;

revoke execute on function public.taipei_today(), public.require_player(),
  public.accrue_daily_tickets(uuid), public.player_state(uuid),
  public.deck_errors(uuid, jsonb)
  from public, anon, authenticated;

-- Client RPCs ---------------------------------------------------------------

-- Creates the player on first call (default deck + starting tickets, once),
-- accrues daily tickets, and returns the full player state.
create function public.sync_player() returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_player uuid := public.require_player();
  v_deck jsonb;
  v_starting integer;
begin
  perform 1 from public.players where id = v_player for update;
  if not found then
    select value into v_deck from public.game_config where key = 'default_deck';
    select (value #>> '{}')::integer into v_starting from public.game_config where key = 'starting_tickets';
    if v_deck is null or v_starting is null then
      raise exception 'CONFIG_MISSING';
    end if;

    insert into public.players (id, tickets, last_ticket_date)
    values (v_player, v_starting, public.taipei_today())
    on conflict (id) do nothing;
    if not found then
      -- A concurrent first call created the player; fall through to sync.
      perform 1 from public.players where id = v_player for update;
    else
      insert into public.ticket_ledger (player_id, delta, reason) values (v_player, v_starting, 'starting');
      insert into public.player_cards (player_id, card_id)
      select v_player, card_id
        from jsonb_each(v_deck) s, jsonb_array_elements_text(s.value) as card_id;
      insert into public.decks (player_id, kind, slots)
      values (v_player, 'attack', v_deck), (v_player, 'defense', v_deck);
    end if;
  end if;

  perform public.accrue_daily_tickets(v_player);
  return public.player_state(v_player);
end;
$$;

-- Spends one ticket for ten pulls from the active pool. Retrying with the same
-- idempotency key returns the original result without charging again.
create function public.draw_ten(p_idempotency_key text) returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_player uuid := public.require_player();
  v_existing jsonb;
  v_pool text;
  v_total integer;
  v_roll integer;
  v_card text;
  v_level integer;
  v_shards integer;
  v_is_new boolean;
  v_leveled boolean;
  v_results jsonb := '[]'::jsonb;
begin
  -- Serializes all draws for this player, including retries of the same key.
  perform 1 from public.players where id = v_player for update;
  if not found then
    raise exception 'PLAYER_NOT_FOUND';
  end if;

  select results into v_existing
    from public.gacha_requests where player_id = v_player and idempotency_key = p_idempotency_key;
  if found then
    return jsonb_build_object('results', v_existing, 'state', public.player_state(v_player), 'replayed', true);
  end if;

  perform public.accrue_daily_tickets(v_player);

  update public.players set tickets = tickets - 1 where id = v_player and tickets >= 1;
  if not found then
    raise exception 'INSUFFICIENT_TICKETS';
  end if;

  select id into v_pool from public.card_pools where active;
  select sum(weight) into v_total from public.pool_entries where pool_id = v_pool;
  if v_pool is null or coalesce(v_total, 0) <= 0 then
    raise exception 'NO_ACTIVE_POOL';
  end if;

  for i in 1..10 loop
    v_roll := floor(random() * v_total)::integer;
    select card_id into v_card from (
      select card_id, sum(weight) over (order by card_id) as cumulative
        from public.pool_entries where pool_id = v_pool and weight > 0
    ) w where w.cumulative > v_roll order by w.cumulative limit 1;

    select level, shards into v_level, v_shards
      from public.player_cards where player_id = v_player and card_id = v_card;
    v_is_new := not found;
    v_leveled := false;
    if v_is_new then
      v_level := 1;
      v_shards := 0;
      insert into public.player_cards (player_id, card_id) values (v_player, v_card);
    else
      v_shards := v_shards + 1;
      if v_shards >= 5 then
        v_level := v_level + 1;
        v_shards := v_shards - 5;
        v_leveled := true;
      end if;
      update public.player_cards set level = v_level, shards = v_shards
       where player_id = v_player and card_id = v_card;
    end if;

    v_results := v_results || jsonb_build_object(
      'cardId', v_card, 'isNew', v_is_new, 'level', v_level, 'shards', v_shards, 'leveledUp', v_leveled);
  end loop;

  insert into public.gacha_requests (player_id, idempotency_key, pool_id, results)
  values (v_player, p_idempotency_key, v_pool, v_results);
  insert into public.ticket_ledger (player_id, delta, reason, ref)
  values (v_player, -1, 'draw', p_idempotency_key);

  return jsonb_build_object('results', v_results, 'state', public.player_state(v_player), 'replayed', false);
end;
$$;

-- Validates and saves an attack or defense deck. Returns {ok, errors}.
create function public.save_deck(p_kind public.deck_kind, p_slots jsonb) returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_player uuid := public.require_player();
  v_errors jsonb;
begin
  perform 1 from public.players where id = v_player for update;
  if not found then
    raise exception 'PLAYER_NOT_FOUND';
  end if;

  v_errors := public.deck_errors(v_player, p_slots);
  if jsonb_array_length(v_errors) > 0 then
    return jsonb_build_object('ok', false, 'errors', v_errors);
  end if;

  insert into public.decks (player_id, kind, slots) values (v_player, p_kind, p_slots)
  on conflict (player_id, kind) do update set slots = excluded.slots, updated_at = now();
  return jsonb_build_object('ok', true, 'errors', '[]'::jsonb);
end;
$$;

revoke execute on function public.sync_player(), public.draw_ten(text),
  public.save_deck(public.deck_kind, jsonb)
  from public, anon;
grant execute on function public.sync_player(), public.draw_ten(text),
  public.save_deck(public.deck_kind, jsonb)
  to authenticated;
