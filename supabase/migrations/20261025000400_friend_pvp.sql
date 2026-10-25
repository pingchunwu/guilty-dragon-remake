-- Asynchronous friend PvP (docs/development-spec.md §5, §6b).
-- Battles are resolved by the `pvp` Edge Function, which runs the same
-- TypeScript engine and writes through the service-role functions below.
-- Players read a sanitized view only: never the seed, RNG state, draw-pile
-- order or the defender's hand.

-- Names and friends -----------------------------------------------------

-- Null shows the account email (decided 2026-10-25).
alter table public.players add column display_name text check (char_length(display_name) between 1 and 20);
-- Assigned on first lobby visit; shared with friends to add each other.
alter table public.players add column friend_code text unique;

-- One-directional: a player's friends are listed first when challenging.
create table public.friends (
  player_id  uuid not null references public.players (id) on delete cascade,
  friend_id  uuid not null references public.players (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (player_id, friend_id),
  check (player_id <> friend_id)
);

-- Battles -------------------------------------------------------------------

-- Public summary, readable by both participants.
create table public.pvp_battles (
  id            uuid primary key default gen_random_uuid(),
  challenger_id uuid not null references public.players (id) on delete cascade,
  defender_id   uuid not null references public.players (id) on delete cascade,
  status        text not null default 'active' check (status in ('active', 'challenger_won', 'defender_won')),
  end_reason    text check (end_reason in ('hp', 'surrender', 'timeout')),
  -- Current phase while active; the last phase reached once finished.
  phase         integer not null,
  challenger_hp integer not null,
  defender_hp   integer not null,
  -- The challenger must act before this (plus grace) or loses by timeout.
  deadline      timestamptz not null,
  created_at    timestamptz not null default now(),
  finished_at   timestamptz,
  check (challenger_id <> defender_id),
  check ((status = 'active') = (end_reason is null))
);

-- One unfinished battle per challenger (decided 2026-10-25).
create unique index pvp_battles_one_active on public.pvp_battles (challenger_id) where status = 'active';
create index pvp_battles_defender on public.pvp_battles (defender_id, created_at desc);

-- Immutable snapshots, seed and engine state. Never readable by players.
create table public.pvp_battle_secrets (
  battle_id    uuid primary key references public.pvp_battles (id) on delete cascade,
  rule_version text not null,
  ai_version   text not null,
  seed         jsonb not null,
  -- Both decks with card levels, card definitions and equipment at creation.
  snapshot     jsonb not null,
  state        jsonb not null
);

-- Audit record of each resolved phase. Raw results include hands a
-- player may not see, so this is read through pvp_view only.
create table public.pvp_phases (
  battle_id  uuid not null references public.pvp_battles (id) on delete cascade,
  phase      integer not null,
  -- The challenger's selection; null on deck-out phases.
  selection  jsonb,
  result     jsonb not null,
  created_at timestamptz not null default now(),
  primary key (battle_id, phase)
);

alter table public.friends            enable row level security;
alter table public.pvp_battles        enable row level security;
alter table public.pvp_battle_secrets enable row level security;
alter table public.pvp_phases         enable row level security;

create policy "own rows" on public.friends for select to authenticated using (player_id = auth.uid());
create policy "participant" on public.pvp_battles for select to authenticated
  using (challenger_id = auth.uid() or defender_id = auth.uid());

revoke insert, update, delete, truncate on all tables in schema public from anon, authenticated;
revoke all on public.pvp_battle_secrets, public.pvp_phases from anon, authenticated;

-- PROVISIONAL: 5 s grace on the server for network latency.
insert into public.game_config (key, value) values
  ('pvp_turn_seconds', '60'),
  ('pvp_grace_seconds', '5')
on conflict (key) do nothing;

-- Internal helpers ----------------------------------------------------------

create function public.config_seconds(p_key text) returns interval
language sql stable
as $$ select make_interval(secs => (select (value #>> '{}')::integer from public.game_config where key = p_key)) $$;

create function public.player_name(p_player uuid) returns text
language sql stable
as $$
  select coalesce(p.display_name, u.email, '玩家')
    from public.players p left join auth.users u on u.id = p.id
   where p.id = p_player
$$;

create function public.ensure_friend_code(p_player uuid) returns text
language plpgsql
as $$
declare
  -- No 0/O or 1/I so codes are easy to read aloud.
  c_alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_code text;
begin
  select friend_code into v_code from public.players where id = p_player;
  while v_code is null loop
    v_code := (select string_agg(substr(c_alphabet, 1 + floor(random() * 32)::integer, 1), '')
                 from generate_series(1, 8));
    begin
      update public.players set friend_code = v_code where id = p_player;
    exception when unique_violation then
      v_code := null;
    end;
  end loop;
  return v_code;
end;
$$;

-- Marks the challenger's battle lost once its deadline (plus grace) passed.
create function public.pvp_expire(p_challenger uuid) returns void
language sql
as $$
  update public.pvp_battles
     set status = 'defender_won', end_reason = 'timeout', finished_at = now()
   where challenger_id = p_challenger and status = 'active'
     and now() > deadline + public.config_seconds('pvp_grace_seconds')
$$;

-- In a deck-out phase where only the challenger ran out, the defender keeps
-- its hand; the engine still reports it, so hide it from the challenger.
create function public.pvp_public_result(p_result jsonb) returns jsonb
language sql immutable
as $$
  select case
    when p_result ->> 'kind' = 'deck_out' and not (p_result #>> '{sides,defender,ranOut}')::boolean
      then jsonb_set(p_result, '{sides,defender}',
             (p_result #> '{sides,defender}') || '{"played": [], "baseAttack": 0, "attack": 0}'::jsonb)
    else p_result
  end
$$;

-- What the challenger sees: own hand, counts, HP, equipment, the last phase
-- result and the definitions of the cards shown.
create function public.pvp_view(p_battle uuid) returns jsonb
language plpgsql stable
as $$
declare
  b public.pvp_battles;
  s public.pvp_battle_secrets;
  v_last jsonb;
  v_me jsonb;
  v_them jsonb;
  v_ids text[];
begin
  select * into b from public.pvp_battles where id = p_battle;
  select * into s from public.pvp_battle_secrets where battle_id = p_battle;
  select public.pvp_public_result(result) into v_last
    from public.pvp_phases where battle_id = p_battle order by phase desc limit 1;
  v_me := s.state #> '{sides,challenger}';
  v_them := s.state #> '{sides,defender}';
  select array_agg(distinct id) into v_ids from (
    select jsonb_array_elements_text(s.snapshot #> '{challenger,deck}') as id
    union all select jsonb_path_query(coalesce(v_last, '{}'), '$.sides.*.chain[*].card') #>> '{}'
    union all select jsonb_path_query(coalesce(v_last, '{}'), '$.sides.*.played[*]') #>> '{}'
  ) x;
  return jsonb_build_object(
    'id', b.id,
    'opponent', jsonb_build_object('id', b.defender_id, 'name', public.player_name(b.defender_id)),
    'status', b.status,
    'endReason', b.end_reason,
    'phase', b.phase,
    'kind', s.state ->> 'kind',
    'deadline', b.deadline,
    'serverNow', now(),
    'hp', jsonb_build_object('challenger', b.challenger_hp, 'defender', b.defender_hp),
    'equipment', jsonb_build_object('challenger', v_me -> 'equipment', 'defender', v_them -> 'equipment'),
    'hand', v_me -> 'hand',
    'drawPile', jsonb_build_object(
      'challenger', jsonb_array_length(v_me -> 'drawPile'),
      'defender', jsonb_array_length(v_them -> 'drawPile')),
    'ranOut', jsonb_build_object('challenger', v_me -> 'ranOut', 'defender', v_them -> 'ranOut'),
    'last', v_last,
    'cards', (select jsonb_object_agg(k, v) from jsonb_each(s.snapshot -> 'cards') e(k, v) where k = any (v_ids)),
    'levels', s.snapshot #> '{challenger,levels}'
  );
end;
$$;

-- Finished battles as challenger or defender, newest first.
create function public.pvp_history(p_player uuid) returns jsonb
language sql stable
as $$
  select coalesce(jsonb_agg(h order by finished_at desc), '[]'::jsonb) from (
    select finished_at, jsonb_build_object(
      'id', id,
      'role', case when challenger_id = p_player then 'challenger' else 'defender' end,
      'opponent', jsonb_build_object(
        'id', case when challenger_id = p_player then defender_id else challenger_id end,
        'name', public.player_name(case when challenger_id = p_player then defender_id else challenger_id end)),
      'won', (status = 'challenger_won') = (challenger_id = p_player),
      'endReason', end_reason,
      'phase', phase,
      'hp', jsonb_build_object('challenger', challenger_hp, 'defender', defender_hp),
      'finishedAt', finished_at
    ) as h
      from public.pvp_battles
     where (challenger_id = p_player or defender_id = p_player) and status <> 'active'
     order by finished_at desc
     limit 30
  ) x
$$;

-- One side's snapshot: deck in slot order, card levels and equipped items.
create function public.pvp_side_snapshot(p_player uuid, p_slots jsonb) returns jsonb
language sql stable
as $$
  with deck as (
    select ids.card_id, array_position(array['heavy', 'light', 'magic', 'free'], s.key) as slot_ord, ids.ord
      from jsonb_each(p_slots) s, jsonb_array_elements_text(s.value) with ordinality as ids(card_id, ord)
  )
  select jsonb_build_object(
    'deck', (select jsonb_agg(card_id order by slot_ord, ord) from deck),
    'levels', coalesce((select jsonb_object_agg(pc.card_id, pc.level) from public.player_cards pc
                         where pc.player_id = p_player and pc.card_id in (select card_id from deck)), '{}'::jsonb),
    'loadout', coalesce((select jsonb_build_object('armor', armor_id, 'weapon', weapon_id, 'gear', gear_id)
                           from public.loadouts where player_id = p_player),
                        '{"armor": null, "weapon": null, "gear": null}'::jsonb),
    'itemLevels', coalesce((select jsonb_object_agg(pi.item_id, pi.level) from public.player_items pi
                             join public.loadouts l on l.player_id = pi.player_id
                              and pi.item_id in (l.armor_id, l.weapon_id, l.gear_id)
                            where pi.player_id = p_player), '{}'::jsonb)
  )
$$;

revoke execute on function public.config_seconds(text), public.player_name(uuid),
  public.ensure_friend_code(uuid), public.pvp_expire(uuid), public.pvp_public_result(jsonb),
  public.pvp_view(uuid), public.pvp_history(uuid), public.pvp_side_snapshot(uuid, jsonb)
  from public, anon, authenticated;

-- Client RPCs ---------------------------------------------------------------

-- Everything the PvP screen needs: own name and friend code, every other
-- player (friends first), the active battle and recent history.
create function public.pvp_lobby() returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_player uuid := public.require_player();
  v_active uuid;
begin
  perform 1 from public.players where id = v_player;
  if not found then
    raise exception 'PLAYER_NOT_FOUND';
  end if;
  perform public.ensure_friend_code(v_player);
  perform public.pvp_expire(v_player);
  select id into v_active from public.pvp_battles where challenger_id = v_player and status = 'active';

  return jsonb_build_object(
    'me', (select jsonb_build_object('id', id, 'name', public.player_name(id), 'friendCode', friend_code)
             from public.players where id = v_player),
    'players', coalesce((
      select jsonb_agg(jsonb_build_object('id', p.id, 'name', public.player_name(p.id), 'friend', f.friend_id is not null)
                       order by f.friend_id is null, public.player_name(p.id), p.id)
        from public.players p
        left join public.friends f on f.player_id = v_player and f.friend_id = p.id
       where p.id <> v_player), '[]'::jsonb),
    'active', case when v_active is null then null else public.pvp_view(v_active) end,
    'history', public.pvp_history(v_player)
  );
end;
$$;

-- Sets the shown name; an empty name goes back to the email.
create function public.pvp_set_name(p_name text) returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_player uuid := public.require_player();
  v_name text := nullif(btrim(coalesce(p_name, '')), '');
begin
  if char_length(v_name) > 20 then
    raise exception 'NAME_TOO_LONG';
  end if;
  update public.players set display_name = v_name where id = v_player;
  if not found then
    raise exception 'PLAYER_NOT_FOUND';
  end if;
  return public.pvp_lobby();
end;
$$;

create function public.pvp_add_friend(p_code text) returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_player uuid := public.require_player();
  v_friend uuid;
begin
  select id into v_friend from public.players where friend_code = upper(btrim(coalesce(p_code, '')));
  if v_friend is null then
    raise exception 'FRIEND_NOT_FOUND';
  end if;
  if v_friend = v_player then
    raise exception 'FRIEND_IS_SELF';
  end if;
  insert into public.friends (player_id, friend_id) values (v_player, v_friend) on conflict do nothing;
  return public.pvp_lobby();
end;
$$;

create function public.pvp_remove_friend(p_friend uuid) returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_player uuid := public.require_player();
begin
  delete from public.friends where player_id = v_player and friend_id = p_friend;
  return public.pvp_lobby();
end;
$$;

-- Ends the active battle as a loss (decided: abandoning is a loss).
create function public.pvp_surrender() returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_player uuid := public.require_player();
begin
  perform public.pvp_expire(v_player);
  update public.pvp_battles
     set status = 'defender_won', end_reason = 'surrender', finished_at = now()
   where challenger_id = v_player and status = 'active';
  if not found then
    raise exception 'NO_ACTIVE_BATTLE';
  end if;
  return public.pvp_lobby();
end;
$$;

revoke execute on function public.pvp_lobby(), public.pvp_set_name(text), public.pvp_add_friend(text),
  public.pvp_remove_friend(uuid), public.pvp_surrender()
  from public, anon;
grant execute on function public.pvp_lobby(), public.pvp_set_name(text), public.pvp_add_friend(text),
  public.pvp_remove_friend(uuid), public.pvp_surrender()
  to authenticated;

-- Edge Function only (service role) -------------------------------------------

-- Checks a new battle may start and returns both sides' snapshots.
create function public.pvp_prepare(p_challenger uuid, p_defender uuid) returns jsonb
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
    'cards', (select jsonb_object_agg(id, jsonb_build_object('id', id, 'name', name, 'type', type, 'attack', attack))
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

create function public.pvp_create(p_challenger uuid, p_defender uuid, p_snapshot jsonb, p_seed jsonb, p_state jsonb)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  begin
    insert into public.pvp_battles (challenger_id, defender_id, phase, challenger_hp, defender_hp, deadline)
    values (p_challenger, p_defender, (p_state ->> 'phase')::integer,
            (p_state #>> '{sides,challenger,hp}')::integer, (p_state #>> '{sides,defender,hp}')::integer,
            now() + public.config_seconds('pvp_turn_seconds'))
    returning id into v_id;
  exception when unique_violation then
    raise exception 'BATTLE_IN_PROGRESS';
  end;
  insert into public.pvp_battle_secrets (battle_id, rule_version, ai_version, seed, snapshot, state)
  values (v_id, p_state ->> 'ruleVersion', p_state ->> 'aiVersion', p_seed, p_snapshot, p_state);
  return public.pvp_view(v_id);
end;
$$;

-- The challenger's active battle with its snapshot and engine state.
create function public.pvp_load(p_challenger uuid) returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_result jsonb;
begin
  perform public.pvp_expire(p_challenger);
  select jsonb_build_object('battleId', b.id, 'phase', b.phase, 'snapshot', s.snapshot, 'state', s.state)
    into v_result
    from public.pvp_battles b join public.pvp_battle_secrets s on s.battle_id = b.id
   where b.challenger_id = p_challenger and b.status = 'active';
  if v_result is null then
    raise exception 'NO_ACTIVE_BATTLE';
  end if;
  return v_result;
end;
$$;

-- Stores a resolved phase. Each phase applies once: a stale or repeated
-- request fails with PHASE_CONFLICT. A late one ends the battle by timeout.
create function public.pvp_record_phase(p_battle uuid, p_phase integer, p_selection jsonb, p_result jsonb, p_state jsonb)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  b public.pvp_battles;
  v_status text := p_state ->> 'status';
begin
  select * into b from public.pvp_battles where id = p_battle for update;
  if not found or b.status <> 'active' or b.phase <> p_phase then
    raise exception 'PHASE_CONFLICT';
  end if;
  if now() > b.deadline + public.config_seconds('pvp_grace_seconds') then
    update public.pvp_battles
       set status = 'defender_won', end_reason = 'timeout', finished_at = now()
     where id = p_battle;
    return public.pvp_view(p_battle);
  end if;

  insert into public.pvp_phases (battle_id, phase, selection, result) values (p_battle, p_phase, p_selection, p_result);
  update public.pvp_battle_secrets set state = p_state where battle_id = p_battle;
  update public.pvp_battles
     set phase = (p_state ->> 'phase')::integer,
         challenger_hp = (p_state #>> '{sides,challenger,hp}')::integer,
         defender_hp = (p_state #>> '{sides,defender,hp}')::integer,
         status = v_status,
         end_reason = case when v_status = 'active' then null else 'hp' end,
         finished_at = case when v_status = 'active' then null else now() end,
         deadline = now() + public.config_seconds('pvp_turn_seconds')
   where id = p_battle;
  return public.pvp_view(p_battle);
end;
$$;

revoke execute on function public.pvp_prepare(uuid, uuid), public.pvp_create(uuid, uuid, jsonb, jsonb, jsonb),
  public.pvp_load(uuid), public.pvp_record_phase(uuid, integer, jsonb, jsonb, jsonb)
  from public, anon, authenticated;
grant execute on function public.pvp_prepare(uuid, uuid), public.pvp_create(uuid, uuid, jsonb, jsonb, jsonb),
  public.pvp_load(uuid), public.pvp_record_phase(uuid, integer, jsonb, jsonb, jsonb)
  to service_role;
