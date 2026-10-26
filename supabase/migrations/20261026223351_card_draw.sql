-- Card DRAW (0–6): how many cards a leader draws (rule version 0.7.0-draft,
-- docs/development-spec.md §6a). Values come with the next content migration.
alter table public.card_definitions add column draw integer not null default 0 check (draw between 0 and 6);

-- PvP snapshots carry each card's DRAW.
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
                  'id', id, 'name', name, 'type', type, 'attack', attack, 'draw', draw, 'rarity', rarity, 'skill', skill_id))
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
