-- Card and item levels (rule version 0.6.0-draft, docs/development-spec.md §6a).
-- Each duplicate now raises a level (it took 5 before). Cards stop at their
-- skill's max level and items at 10; duplicates past the cap are kept as shards.

-- A card's level cap: its skill's max level, 1 without a skill.
create function public.card_max_level(p_card text) returns integer
language sql stable
set search_path = public
as $$
  select coalesce((select s.max_level from public.card_definitions c
                     join public.skill_definitions s on s.id = c.skill_id
                    where c.id = p_card), 1);
$$;

revoke execute on function public.card_max_level(text) from public, anon, authenticated;

-- Existing shards were worth a fifth of a level; convert each into a level now,
-- up to the cap, and keep the rest as shards.
update public.player_cards pc
   set level = least(public.card_max_level(pc.card_id), pc.level + pc.shards),
       shards = pc.level + pc.shards - least(public.card_max_level(pc.card_id), pc.level + pc.shards)
 where pc.shards > 0 or pc.level > public.card_max_level(pc.card_id);
update public.player_items
   set level = least(10, level + shards),
       shards = level + shards - least(10, level + shards)
 where shards > 0 or level > 10;

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

  insert into public.gacha_requests (player_id, idempotency_key, pool_id, kind, results)
  values (p_player, p_idempotency_key, v_pool, p_kind, v_results);
  insert into public.ticket_ledger (player_id, delta, reason, ref)
  values (p_player, -1, 'draw', p_idempotency_key);

  return jsonb_build_object('results', v_results, 'state', public.player_state(p_player), 'replayed', false);
end;
$$;

-- Snapshots carry each card's rarity and skill so the engine can run them.
create or replace function public.pvp_prepare(p_challenger uuid, p_defender uuid) returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_attack jsonb;
  v_defense jsonb;
  v_challenger jsonb;
  v_defender jsonb;
begin
  perform 1 from public.players where id = p_challenger for update;
  if not found then
    raise exception 'PLAYER_NOT_FOUND';
  end if;
  if p_challenger = p_defender then
    raise exception 'CANNOT_CHALLENGE_SELF';
  end if;
  perform public.pvp_expire(p_challenger);
  if exists (select 1 from public.pvp_battles where challenger_id = p_challenger and status = 'active') then
    raise exception 'BATTLE_IN_PROGRESS';
  end if;
  if not exists (select 1 from public.players where id = p_defender) then
    raise exception 'OPPONENT_NOT_FOUND';
  end if;

  select slots into v_attack from public.decks where player_id = p_challenger and kind = 'attack';
  select slots into v_defense from public.decks where player_id = p_defender and kind = 'defense';
  if v_attack is null then
    raise exception 'DECK_MISSING';
  end if;
  if v_defense is null then
    raise exception 'OPPONENT_NO_DECK';
  end if;

  v_challenger := public.pvp_side_snapshot(p_challenger, v_attack);
  v_defender := public.pvp_side_snapshot(p_defender, v_defense);
  return jsonb_build_object(
    'challenger', v_challenger,
    'defender', v_defender,
    'cards', (select jsonb_object_agg(id, jsonb_build_object(
                  'id', id, 'name', name, 'type', type, 'attack', attack, 'rarity', rarity, 'skill', skill_id))
                from public.card_definitions
               where id in (select jsonb_array_elements_text(v_challenger -> 'deck')
                            union select jsonb_array_elements_text(v_defender -> 'deck'))),
    'items', coalesce((select jsonb_object_agg(id, jsonb_build_object(
                         'id', id, 'name', name, 'kind', kind, 'attack', attack, 'defense', defense))
                         from public.item_definitions
                        where id in (select value from jsonb_each_text(v_challenger -> 'loadout')
                                     union select value from jsonb_each_text(v_defender -> 'loadout'))),
                      '{}'::jsonb)
  );
end;
$$;
