-- Card attack, equipment (armor, weapon, gear), loadouts and the item gacha.
-- Content values come from the generated placeholder content migration.

alter table public.card_definitions add column attack integer not null default 0 check (attack >= 0);

create type public.item_kind as enum ('armor', 'weapon', 'gear');

-- Public content ----------------------------------------------------------

create table public.item_definitions (
  id      text primary key,
  name    text not null,
  kind    public.item_kind not null,
  -- Weapons: added to every phase's attack after multipliers.
  attack  integer not null default 0 check (attack >= 0),
  -- Armor: subtracted from damage taken in a lost phase.
  defense integer not null default 0 check (defense >= 0)
);

create table public.item_pools (
  id     text primary key,
  active boolean not null default false
);

create unique index item_pools_one_active on public.item_pools (active) where active;

create table public.item_pool_entries (
  pool_id text not null references public.item_pools (id) on delete cascade,
  item_id text not null references public.item_definitions (id),
  weight  integer not null check (weight >= 0),
  primary key (pool_id, item_id)
);

-- Player state ------------------------------------------------------------

create table public.player_items (
  player_id uuid not null references public.players (id) on delete cascade,
  item_id   text not null references public.item_definitions (id),
  level     integer not null default 1 check (level >= 1),
  shards    integer not null default 0 check (shards >= 0),
  primary key (player_id, item_id)
);

-- One loadout per player, used for both attack and defense. Null = empty slot.
create table public.loadouts (
  player_id  uuid primary key references public.players (id) on delete cascade,
  armor_id   text references public.item_definitions (id),
  weapon_id  text references public.item_definitions (id),
  gear_id    text references public.item_definitions (id),
  updated_at timestamptz not null default now()
);

-- Card and item draws share the request table and its idempotency keys.
alter table public.gacha_requests drop constraint gacha_requests_pool_id_fkey;
alter table public.gacha_requests add column kind text not null default 'card' check (kind in ('card', 'item'));

alter table public.item_definitions  enable row level security;
alter table public.item_pools        enable row level security;
alter table public.item_pool_entries enable row level security;
alter table public.player_items      enable row level security;
alter table public.loadouts          enable row level security;

create policy "content readable" on public.item_definitions  for select using (true);
create policy "content readable" on public.item_pools        for select using (true);
create policy "content readable" on public.item_pool_entries for select using (true);

create policy "own rows" on public.player_items for select to authenticated using (player_id = auth.uid());
create policy "own rows" on public.loadouts     for select to authenticated using (player_id = auth.uid());

revoke insert, update, delete, truncate on all tables in schema public from anon, authenticated;

-- Internal helpers ----------------------------------------------------------

create or replace function public.player_state(p_player uuid) returns jsonb
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
      '{}'::jsonb),
    'items', coalesce(
      (select jsonb_object_agg(item_id, jsonb_build_object('level', level, 'shards', shards))
         from public.player_items where player_id = p_player),
      '{}'::jsonb),
    'loadout', coalesce(
      (select jsonb_build_object('armor', armor_id, 'weapon', weapon_id, 'gear', gear_id)
         from public.loadouts where player_id = p_player),
      '{"armor": null, "weapon": null, "gear": null}'::jsonb)
  )
$$;

-- Grants the starter items and loadout once. Safe to call on every sync, so
-- players created before equipment existed get them too.
create function public.grant_starter_items(p_player uuid) returns void
language plpgsql
as $$
declare
  v_loadout jsonb;
begin
  select value into v_loadout from public.game_config where key = 'starter_loadout';
  if v_loadout is null then
    raise exception 'CONFIG_MISSING';
  end if;
  insert into public.player_items (player_id, item_id)
  select p_player, value from jsonb_each_text(v_loadout) where value is not null
  on conflict do nothing;
  insert into public.loadouts (player_id, armor_id, weapon_id, gear_id)
  values (p_player, v_loadout ->> 'armor', v_loadout ->> 'weapon', v_loadout ->> 'gear')
  on conflict do nothing;
end;
$$;

-- Ten pulls from the active card or item pool for one ticket. Retrying with
-- the same idempotency key returns the original result without charging.
create function public.gacha_draw(p_player uuid, p_kind text, p_idempotency_key text) returns jsonb
language plpgsql
as $$
declare
  v_existing jsonb;
  v_existing_kind text;
  v_pool text;
  v_total integer;
  v_roll integer;
  v_id text;
  v_level integer;
  v_shards integer;
  v_is_new boolean;
  v_leveled boolean;
  v_results jsonb := '[]'::jsonb;
begin
  -- Serializes all draws for this player, including retries of the same key.
  perform 1 from public.players where id = p_player for update;
  if not found then
    raise exception 'PLAYER_NOT_FOUND';
  end if;

  select results, kind into v_existing, v_existing_kind
    from public.gacha_requests where player_id = p_player and idempotency_key = p_idempotency_key;
  if found then
    if v_existing_kind <> p_kind then
      raise exception 'IDEMPOTENCY_KEY_REUSED';
    end if;
    return jsonb_build_object('results', v_existing, 'state', public.player_state(p_player), 'replayed', true);
  end if;

  perform public.accrue_daily_tickets(p_player);

  update public.players set tickets = tickets - 1 where id = p_player and tickets >= 1;
  if not found then
    raise exception 'INSUFFICIENT_TICKETS';
  end if;

  if p_kind = 'card' then
    select id into v_pool from public.card_pools where active;
    select sum(weight) into v_total from public.pool_entries where pool_id = v_pool;
  else
    select id into v_pool from public.item_pools where active;
    select sum(weight) into v_total from public.item_pool_entries where pool_id = v_pool;
  end if;
  if v_pool is null or coalesce(v_total, 0) <= 0 then
    raise exception 'NO_ACTIVE_POOL';
  end if;

  for i in 1..10 loop
    v_roll := floor(random() * v_total)::integer;
    if p_kind = 'card' then
      select card_id into v_id from (
        select card_id, sum(weight) over (order by card_id) as cumulative
          from public.pool_entries where pool_id = v_pool and weight > 0
      ) w where w.cumulative > v_roll order by w.cumulative limit 1;
      select level, shards into v_level, v_shards
        from public.player_cards where player_id = p_player and card_id = v_id;
    else
      select item_id into v_id from (
        select item_id, sum(weight) over (order by item_id) as cumulative
          from public.item_pool_entries where pool_id = v_pool and weight > 0
      ) w where w.cumulative > v_roll order by w.cumulative limit 1;
      select level, shards into v_level, v_shards
        from public.player_items where player_id = p_player and item_id = v_id;
    end if;

    v_is_new := not found;
    v_leveled := false;
    if v_is_new then
      v_level := 1;
      v_shards := 0;
    else
      v_shards := v_shards + 1;
      if v_shards >= 5 then
        v_level := v_level + 1;
        v_shards := v_shards - 5;
        v_leveled := true;
      end if;
    end if;

    if p_kind = 'card' then
      insert into public.player_cards (player_id, card_id, level, shards) values (p_player, v_id, v_level, v_shards)
      on conflict (player_id, card_id) do update set level = excluded.level, shards = excluded.shards;
    else
      insert into public.player_items (player_id, item_id, level, shards) values (p_player, v_id, v_level, v_shards)
      on conflict (player_id, item_id) do update set level = excluded.level, shards = excluded.shards;
    end if;

    v_results := v_results || jsonb_build_object(
      'id', v_id, 'isNew', v_is_new, 'level', v_level, 'shards', v_shards, 'leveledUp', v_leveled);
  end loop;

  insert into public.gacha_requests (player_id, idempotency_key, pool_id, kind, results)
  values (p_player, p_idempotency_key, v_pool, p_kind, v_results);
  insert into public.ticket_ledger (player_id, delta, reason, ref)
  values (p_player, -1, 'draw', p_idempotency_key);

  return jsonb_build_object('results', v_results, 'state', public.player_state(p_player), 'replayed', false);
end;
$$;

revoke execute on function public.player_state(uuid), public.grant_starter_items(uuid),
  public.gacha_draw(uuid, text, text)
  from public, anon, authenticated;

-- Client RPCs ---------------------------------------------------------------

create or replace function public.sync_player() returns jsonb
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

  perform public.grant_starter_items(v_player);
  perform public.accrue_daily_tickets(v_player);
  return public.player_state(v_player);
end;
$$;

create or replace function public.draw_ten(p_idempotency_key text) returns jsonb
language plpgsql security definer
set search_path = public
as $$
  begin
    return public.gacha_draw(public.require_player(), 'card', p_idempotency_key);
  end;
$$;

create function public.draw_items_ten(p_idempotency_key text) returns jsonb
language plpgsql security definer
set search_path = public
as $$
  begin
    return public.gacha_draw(public.require_player(), 'item', p_idempotency_key);
  end;
$$;

-- Validates and saves the loadout. Returns {ok, errors}; errors match the
-- engine's LoadoutError.
create function public.save_loadout(p_armor text, p_weapon text, p_gear text) returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_player uuid := public.require_player();
  v_errors jsonb := '[]'::jsonb;
  v_slot text;
  v_id text;
  v_kind public.item_kind;
begin
  perform 1 from public.players where id = v_player for update;
  if not found then
    raise exception 'PLAYER_NOT_FOUND';
  end if;

  for v_slot, v_id in select * from (values ('armor', p_armor), ('weapon', p_weapon), ('gear', p_gear)) s loop
    continue when v_id is null;
    select kind into v_kind from public.item_definitions where id = v_id;
    if not found then
      v_errors := v_errors || jsonb_build_object('code', 'UNKNOWN_ITEM', 'slot', v_slot, 'itemId', v_id);
    elsif v_kind::text <> v_slot then
      v_errors := v_errors || jsonb_build_object('code', 'WRONG_KIND', 'slot', v_slot, 'itemId', v_id);
    end if;
    if not exists (select 1 from public.player_items where player_id = v_player and item_id = v_id) then
      v_errors := v_errors || jsonb_build_object('code', 'NOT_OWNED', 'slot', v_slot, 'itemId', v_id);
    end if;
  end loop;

  if jsonb_array_length(v_errors) > 0 then
    return jsonb_build_object('ok', false, 'errors', v_errors);
  end if;

  insert into public.loadouts (player_id, armor_id, weapon_id, gear_id) values (v_player, p_armor, p_weapon, p_gear)
  on conflict (player_id) do update
    set armor_id = excluded.armor_id, weapon_id = excluded.weapon_id, gear_id = excluded.gear_id, updated_at = now();
  return jsonb_build_object('ok', true, 'errors', '[]'::jsonb);
end;
$$;

revoke execute on function public.draw_items_ten(text), public.save_loadout(text, text, text) from public, anon;
grant execute on function public.draw_items_ten(text), public.save_loadout(text, text, text) to authenticated;
