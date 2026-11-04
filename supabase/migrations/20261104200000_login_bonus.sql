-- Cards and gear get separate tickets, and the login bonus panel replaces the daily ticket.
-- The first login of each Taipei day checks the next of 7 slots and grants its item;
-- days need not be consecutive. Keep the panel in step with engine LOGIN_BONUS_PANEL.
alter table public.players
  add column item_tickets integer not null default 0 check (item_tickets >= 0),
  add column login_checks integer not null default 0 check (login_checks >= 0);
-- Null until the first login, so a new player's first day counts.
alter table public.players rename column last_ticket_date to last_login_date;
alter table public.players alter column last_login_date drop not null;

-- Rows before this are all card tickets. 'daily' stays allowed for those old rows.
alter table public.ticket_ledger add column kind text not null default 'card' check (kind in ('card', 'item'));
alter table public.ticket_ledger drop constraint ticket_ledger_reason_check;
alter table public.ticket_ledger add constraint ticket_ledger_reason_check
  check (reason in ('starting', 'daily', 'draw', 'login_bonus'));

insert into public.game_config (key, value) values ('login_bonus_panel', '[
  {"kind": "card", "count": 1},
  {"kind": "item", "count": 1},
  {"kind": "card", "count": 1},
  {"kind": "item", "count": 1},
  {"kind": "card", "count": 1},
  {"kind": "item", "count": 1},
  {"kind": "card", "count": 1}
]'::jsonb);

create or replace function public.player_state(p_player uuid) returns jsonb
language sql stable
as $$
  select jsonb_build_object(
    'tickets', (select tickets from public.players where id = p_player),
    'itemTickets', (select item_tickets from public.players where id = p_player),
    'pity', (select card_pity from public.players where id = p_player),
    'cards', coalesce(
      (select jsonb_object_agg(card_id, jsonb_build_object('level', level, 'shards', shards, 'obtainedAt', obtained_at))
         from public.player_cards where player_id = p_player),
      '{}'::jsonb),
    'decks', coalesce(
      (select jsonb_object_agg(kind, slots) from public.decks where player_id = p_player),
      '{}'::jsonb),
    'items', coalesce(
      (select jsonb_object_agg(item_id, jsonb_build_object('level', level, 'shards', shards))
         from public.player_items where player_id = p_player),
      '{}'::jsonb),
    'loadout', public.loadout_of(p_player)
  )
$$;

-- Checks today's slot once. Returns {panel, checked} when it did, null if already
-- claimed today. Caller must hold the player row lock.
create function public.claim_login_bonus(p_player uuid) returns jsonb
language plpgsql
as $$
declare
  v_today date := public.taipei_today();
  v_last date;
  v_checks integer;
  v_panel jsonb;
  v_slot integer;
  v_kind text;
  v_count integer;
begin
  select last_login_date, login_checks into v_last, v_checks from public.players where id = p_player;
  if v_last is not distinct from v_today then
    return null;
  end if;

  select value into v_panel from public.game_config where key = 'login_bonus_panel';
  if v_panel is null or jsonb_array_length(v_panel) = 0 then
    raise exception 'CONFIG_MISSING';
  end if;
  v_slot := v_checks % jsonb_array_length(v_panel);
  v_kind := v_panel -> v_slot ->> 'kind';
  v_count := (v_panel -> v_slot ->> 'count')::integer;

  update public.players
     set last_login_date = v_today,
         login_checks = login_checks + 1,
         tickets = tickets + case when v_kind = 'card' then v_count else 0 end,
         item_tickets = item_tickets + case when v_kind = 'item' then v_count else 0 end
   where id = p_player;
  insert into public.ticket_ledger (player_id, kind, delta, reason, ref)
  values (p_player, v_kind, v_count, 'login_bonus', v_today::text);

  return jsonb_build_object('panel', v_panel, 'checked', v_slot + 1);
end;
$$;

revoke execute on function public.claim_login_bonus(uuid) from public, anon, authenticated;

create or replace function public.sync_player() returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_player uuid := public.require_player();
  v_deck jsonb;
  v_starting integer;
  v_bonus jsonb;
begin
  perform 1 from public.players where id = v_player for update;
  if not found then
    select value into v_deck from public.game_config where key = 'default_deck';
    select (value #>> '{}')::integer into v_starting from public.game_config where key = 'starting_tickets';
    if v_deck is null or v_starting is null then
      raise exception 'CONFIG_MISSING';
    end if;

    insert into public.players (id, tickets)
    values (v_player, v_starting)
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
  v_bonus := public.claim_login_bonus(v_player);
  if v_bonus is null then
    return public.player_state(v_player);
  end if;
  return public.player_state(v_player) || jsonb_build_object('loginBonus', v_bonus);
end;
$$;

create or replace function public.gacha_draw(p_player uuid, p_kind text, p_idempotency_key text) returns jsonb
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
  v_max integer;
  v_results jsonb := '[]'::jsonb;
  v_pity integer;
  v_sr_seen boolean := false;
  v_tiers text[];
  v_tier_total integer;
  v_rarity text;
begin
  -- Serializes all draws for this player, including retries of the same key.
  select card_pity into v_pity from public.players where id = p_player for update;
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

  if p_kind = 'card' then
    update public.players set tickets = tickets - 1 where id = p_player and tickets >= 1;
  else
    update public.players set item_tickets = item_tickets - 1 where id = p_player and item_tickets >= 1;
  end if;
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
    if p_kind = 'card' then
      v_tiers := case
        when v_pity + 1 >= 300 then array['SSR', 'UR']
        when i = 10 and not v_sr_seen then array['SR', 'SSR', 'UR']
      end;
      v_tier_total := v_total;
      if v_tiers is not null then
        select coalesce(sum(e.weight), 0) into v_tier_total
          from public.pool_entries e join public.card_definitions c on c.id = e.card_id
         where e.pool_id = v_pool and c.rarity = any(v_tiers);
        -- A pool without the guaranteed rarity draws normally.
        if v_tier_total = 0 then
          v_tiers := null;
          v_tier_total := v_total;
        end if;
      end if;
      v_roll := floor(random() * v_tier_total)::integer;
      select card_id, rarity into v_id, v_rarity from (
        select e.card_id, c.rarity, sum(e.weight) over (order by e.card_id) as cumulative
          from public.pool_entries e join public.card_definitions c on c.id = e.card_id
         where e.pool_id = v_pool and e.weight > 0 and (v_tiers is null or c.rarity = any(v_tiers))
      ) w where w.cumulative > v_roll order by w.cumulative limit 1;
      v_sr_seen := v_sr_seen or v_rarity in ('SR', 'SSR', 'UR');
      v_pity := case when v_rarity in ('SSR', 'UR') then 0 else v_pity + 1 end;
      select level, shards into v_level, v_shards
        from public.player_cards where player_id = p_player and card_id = v_id;
    else
      v_roll := floor(random() * v_total)::integer;
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
      -- One level per duplicate up to the cap (engine applyPull); later ones are shards.
      if p_kind = 'card' then
        v_max := public.card_max_level(v_id);
      else
        v_max := 10;
      end if;
      if v_level < v_max then
        v_level := v_level + 1;
        v_leveled := true;
      else
        v_shards := v_shards + 1;
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

  update public.players set card_pity = v_pity where id = p_player;

  insert into public.gacha_requests (player_id, idempotency_key, pool_id, kind, results)
  values (p_player, p_idempotency_key, v_pool, p_kind, v_results);
  insert into public.ticket_ledger (player_id, kind, delta, reason, ref)
  values (p_player, p_kind, -1, 'draw', p_idempotency_key);

  return jsonb_build_object('results', v_results, 'state', public.player_state(p_player), 'replayed', false);
end;
$$;

drop function public.accrue_daily_tickets(uuid);
