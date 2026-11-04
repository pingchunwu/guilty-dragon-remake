-- When a player first got each card, for the deck picker's sort and filter.
alter table public.player_cards add column obtained_at timestamptz not null default now();

-- Known from draw history; cards with none (starters) count as got at sign-up.
update public.player_cards pc
   set obtained_at = coalesce(
     (select min(g.created_at)
        from public.gacha_requests g, jsonb_array_elements(g.results) r
       where g.player_id = pc.player_id and r->>'id' = pc.card_id),
     (select p.created_at from public.players p where p.id = pc.player_id));

create or replace function public.player_state(p_player uuid) returns jsonb
language sql stable
as $$
  select jsonb_build_object(
    'tickets', (select tickets from public.players where id = p_player),
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
