-- The client picks the battle screen's rules (0.6.0 or 0.7.0 playback) from the view.
create or replace function public.pvp_view(p_battle uuid) returns jsonb
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
    'ruleVersion', s.state ->> 'ruleVersion',
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
