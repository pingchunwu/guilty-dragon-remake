-- Equipment slots for rule 0.7.0-draft (docs/development-spec.md §6a): a weapon
-- per card colour (heavy, light, magic) and an armor piece per body part (head,
-- body, legs, back) with a defense %. Replaces the armor/weapon/gear kinds.
-- Every player moves to the starter set; the old placeholder items are removed.

-- Item kinds ------------------------------------------------------------------

alter table public.item_definitions alter column kind type text using kind::text;
drop function public.save_loadout(text, text, text);
drop type public.item_kind;

-- Old items have no slot under the new kinds: drop them, their pool and copies.
-- gacha_requests keeps old IDs in its results as history (no foreign key).
alter table public.loadouts drop column armor_id, drop column weapon_id, drop column gear_id;
delete from public.player_items where item_id in (select id from public.item_definitions where kind in ('armor', 'weapon', 'gear'));
delete from public.item_pool_entries where item_id in (select id from public.item_definitions where kind in ('armor', 'weapon', 'gear'));
delete from public.item_pools where id = 'item-pool-v0';
delete from public.item_definitions where kind in ('armor', 'weapon', 'gear');

alter table public.item_definitions add constraint item_definitions_kind_check
  check (kind in ('heavy', 'light', 'magic', 'head', 'body', 'legs', 'back'));
comment on column public.item_definitions.attack is 'Weapons: power on the card POW scale.';
comment on column public.item_definitions.defense is 'Armor pieces: defense percent; a side''s defense is the sum of its pieces.';

alter table public.loadouts
  add column heavy_id text references public.item_definitions (id),
  add column light_id text references public.item_definitions (id),
  add column magic_id text references public.item_definitions (id),
  add column head_id  text references public.item_definitions (id),
  add column body_id  text references public.item_definitions (id),
  add column legs_id  text references public.item_definitions (id),
  add column back_id  text references public.item_definitions (id);

-- PLACEHOLDER content, same values as packages/engine/src/catalog.ts ----------

insert into public.item_definitions (id, name, kind, attack, defense) values
  ('ph-weapon-heavy-01', '見習重裝武器', 'heavy', 300, 0),
  ('ph-weapon-heavy-02', '重裝武器試作 02', 'heavy', 640, 0),
  ('ph-weapon-heavy-03', '重裝武器試作 03', 'heavy', 980, 0),
  ('ph-weapon-heavy-04', '重裝武器試作 04', 'heavy', 1320, 0),
  ('ph-weapon-heavy-05', '重裝武器試作 05', 'heavy', 1660, 0),
  ('ph-weapon-heavy-06', '重裝武器試作 06', 'heavy', 2000, 0),
  ('ph-weapon-light-01', '見習輕裝武器', 'light', 300, 0),
  ('ph-weapon-light-02', '輕裝武器試作 02', 'light', 640, 0),
  ('ph-weapon-light-03', '輕裝武器試作 03', 'light', 980, 0),
  ('ph-weapon-light-04', '輕裝武器試作 04', 'light', 1320, 0),
  ('ph-weapon-light-05', '輕裝武器試作 05', 'light', 1660, 0),
  ('ph-weapon-light-06', '輕裝武器試作 06', 'light', 2000, 0),
  ('ph-weapon-magic-01', '見習魔裝武器', 'magic', 300, 0),
  ('ph-weapon-magic-02', '魔裝武器試作 02', 'magic', 640, 0),
  ('ph-weapon-magic-03', '魔裝武器試作 03', 'magic', 980, 0),
  ('ph-weapon-magic-04', '魔裝武器試作 04', 'magic', 1320, 0),
  ('ph-weapon-magic-05', '魔裝武器試作 05', 'magic', 1660, 0),
  ('ph-weapon-magic-06', '魔裝武器試作 06', 'magic', 2000, 0),
  ('ph-armor-head-01', '見習頭甲', 'head', 0, 2),
  ('ph-armor-head-02', '頭甲試作 02', 'head', 0, 3),
  ('ph-armor-head-03', '頭甲試作 03', 'head', 0, 5),
  ('ph-armor-head-04', '頭甲試作 04', 'head', 0, 6),
  ('ph-armor-head-05', '頭甲試作 05', 'head', 0, 8),
  ('ph-armor-head-06', '頭甲試作 06', 'head', 0, 10),
  ('ph-armor-body-01', '見習胴甲', 'body', 0, 2),
  ('ph-armor-body-02', '胴甲試作 02', 'body', 0, 3),
  ('ph-armor-body-03', '胴甲試作 03', 'body', 0, 5),
  ('ph-armor-body-04', '胴甲試作 04', 'body', 0, 6),
  ('ph-armor-body-05', '胴甲試作 05', 'body', 0, 8),
  ('ph-armor-body-06', '胴甲試作 06', 'body', 0, 10),
  ('ph-armor-legs-01', '見習腿甲', 'legs', 0, 2),
  ('ph-armor-legs-02', '腿甲試作 02', 'legs', 0, 3),
  ('ph-armor-legs-03', '腿甲試作 03', 'legs', 0, 5),
  ('ph-armor-legs-04', '腿甲試作 04', 'legs', 0, 6),
  ('ph-armor-legs-05', '腿甲試作 05', 'legs', 0, 8),
  ('ph-armor-legs-06', '腿甲試作 06', 'legs', 0, 10),
  ('ph-armor-back-01', '見習背甲', 'back', 0, 2),
  ('ph-armor-back-02', '背甲試作 02', 'back', 0, 3),
  ('ph-armor-back-03', '背甲試作 03', 'back', 0, 5),
  ('ph-armor-back-04', '背甲試作 04', 'back', 0, 6),
  ('ph-armor-back-05', '背甲試作 05', 'back', 0, 8),
  ('ph-armor-back-06', '背甲試作 06', 'back', 0, 10)
on conflict (id) do update
  set name = excluded.name, kind = excluded.kind, attack = excluded.attack, defense = excluded.defense;

insert into public.item_pools (id, active) values ('item-pool-v1', true)
on conflict (id) do nothing;

insert into public.item_pool_entries (pool_id, item_id, weight) values
  ('item-pool-v1', 'ph-weapon-heavy-01', 1),
  ('item-pool-v1', 'ph-weapon-heavy-02', 1),
  ('item-pool-v1', 'ph-weapon-heavy-03', 1),
  ('item-pool-v1', 'ph-weapon-heavy-04', 1),
  ('item-pool-v1', 'ph-weapon-heavy-05', 1),
  ('item-pool-v1', 'ph-weapon-heavy-06', 1),
  ('item-pool-v1', 'ph-weapon-light-01', 1),
  ('item-pool-v1', 'ph-weapon-light-02', 1),
  ('item-pool-v1', 'ph-weapon-light-03', 1),
  ('item-pool-v1', 'ph-weapon-light-04', 1),
  ('item-pool-v1', 'ph-weapon-light-05', 1),
  ('item-pool-v1', 'ph-weapon-light-06', 1),
  ('item-pool-v1', 'ph-weapon-magic-01', 1),
  ('item-pool-v1', 'ph-weapon-magic-02', 1),
  ('item-pool-v1', 'ph-weapon-magic-03', 1),
  ('item-pool-v1', 'ph-weapon-magic-04', 1),
  ('item-pool-v1', 'ph-weapon-magic-05', 1),
  ('item-pool-v1', 'ph-weapon-magic-06', 1),
  ('item-pool-v1', 'ph-armor-head-01', 1),
  ('item-pool-v1', 'ph-armor-head-02', 1),
  ('item-pool-v1', 'ph-armor-head-03', 1),
  ('item-pool-v1', 'ph-armor-head-04', 1),
  ('item-pool-v1', 'ph-armor-head-05', 1),
  ('item-pool-v1', 'ph-armor-head-06', 1),
  ('item-pool-v1', 'ph-armor-body-01', 1),
  ('item-pool-v1', 'ph-armor-body-02', 1),
  ('item-pool-v1', 'ph-armor-body-03', 1),
  ('item-pool-v1', 'ph-armor-body-04', 1),
  ('item-pool-v1', 'ph-armor-body-05', 1),
  ('item-pool-v1', 'ph-armor-body-06', 1),
  ('item-pool-v1', 'ph-armor-legs-01', 1),
  ('item-pool-v1', 'ph-armor-legs-02', 1),
  ('item-pool-v1', 'ph-armor-legs-03', 1),
  ('item-pool-v1', 'ph-armor-legs-04', 1),
  ('item-pool-v1', 'ph-armor-legs-05', 1),
  ('item-pool-v1', 'ph-armor-legs-06', 1),
  ('item-pool-v1', 'ph-armor-back-01', 1),
  ('item-pool-v1', 'ph-armor-back-02', 1),
  ('item-pool-v1', 'ph-armor-back-03', 1),
  ('item-pool-v1', 'ph-armor-back-04', 1),
  ('item-pool-v1', 'ph-armor-back-05', 1),
  ('item-pool-v1', 'ph-armor-back-06', 1)
on conflict (pool_id, item_id) do update set weight = excluded.weight;

insert into public.game_config (key, value) values
  ('starter_loadout', '{"heavy":"ph-weapon-heavy-01","light":"ph-weapon-light-01","magic":"ph-weapon-magic-01","head":"ph-armor-head-01","body":"ph-armor-body-01","legs":"ph-armor-legs-01","back":"ph-armor-back-01"}'::jsonb)
on conflict (key) do update set value = excluded.value;

-- Every existing player gets the starter set, equipped.
insert into public.player_items (player_id, item_id)
select p.id, s.value from public.players p, jsonb_each_text('{"heavy":"ph-weapon-heavy-01","light":"ph-weapon-light-01","magic":"ph-weapon-magic-01","head":"ph-armor-head-01","body":"ph-armor-body-01","legs":"ph-armor-legs-01","back":"ph-armor-back-01"}'::jsonb) s
on conflict do nothing;
update public.loadouts set
  heavy_id = 'ph-weapon-heavy-01', light_id = 'ph-weapon-light-01', magic_id = 'ph-weapon-magic-01',
  head_id = 'ph-armor-head-01', body_id = 'ph-armor-body-01', legs_id = 'ph-armor-legs-01', back_id = 'ph-armor-back-01',
  updated_at = now();

-- Stored 0.6.0-draft battles hold resolved equipment in their state. Map the
-- old weapon to every colour and the old armor to the body, so the engine's
-- 0.6.0 reading (strongest weapon, sum of armor) gives the same numbers.
create function public.legacy_equipment(e jsonb) returns jsonb
language sql immutable
as $$
  select jsonb_build_object('heavy', e -> 'weapon', 'light', e -> 'weapon', 'magic', e -> 'weapon',
                            'head', null, 'body', e -> 'armor', 'legs', null, 'back', null)
$$;
update public.pvp_battle_secrets
   set state = jsonb_set(jsonb_set(state,
         '{sides,challenger,equipment}', public.legacy_equipment(state #> '{sides,challenger,equipment}')),
         '{sides,defender,equipment}', public.legacy_equipment(state #> '{sides,defender,equipment}'))
 where state #> '{sides,challenger,equipment}' ? 'gear';
drop function public.legacy_equipment(jsonb);

-- Functions reading loadouts ----------------------------------------------------

-- A player's loadout as {heavy, light, magic, head, body, legs, back}; null = empty slot.
create function public.loadout_of(p_player uuid) returns jsonb
language sql stable
as $$
  select coalesce(
    (select jsonb_build_object('heavy', heavy_id, 'light', light_id, 'magic', magic_id,
                               'head', head_id, 'body', body_id, 'legs', legs_id, 'back', back_id)
       from public.loadouts where player_id = p_player),
    '{"heavy": null, "light": null, "magic": null, "head": null, "body": null, "legs": null, "back": null}'::jsonb)
$$;

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
    'loadout', public.loadout_of(p_player)
  )
$$;

-- Grants the starter items and loadout once; safe to call on every sync.
create or replace function public.grant_starter_items(p_player uuid) returns void
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
  insert into public.loadouts (player_id, heavy_id, light_id, magic_id, head_id, body_id, legs_id, back_id)
  values (p_player, v_loadout ->> 'heavy', v_loadout ->> 'light', v_loadout ->> 'magic',
          v_loadout ->> 'head', v_loadout ->> 'body', v_loadout ->> 'legs', v_loadout ->> 'back')
  on conflict do nothing;
end;
$$;

-- One side's PvP snapshot: deck in slot order, card levels and equipped items.
create or replace function public.pvp_side_snapshot(p_player uuid, p_slots jsonb) returns jsonb
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
    'loadout', public.loadout_of(p_player),
    'itemLevels', coalesce((select jsonb_object_agg(pi.item_id, pi.level) from public.player_items pi
                            where pi.player_id = p_player
                              and pi.item_id in (select value from jsonb_each_text(public.loadout_of(p_player)))),
                           '{}'::jsonb)
  )
$$;

revoke execute on function public.loadout_of(uuid) from public, anon, authenticated;

-- Validates and saves the loadout ({heavy, light, ..., back}: item ID or null).
-- Returns {ok, errors}; errors match the engine's LoadoutError.
create function public.save_loadout(p_loadout jsonb) returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_player uuid := public.require_player();
  v_errors jsonb := '[]'::jsonb;
  v_slot text;
  v_id text;
  v_kind text;
begin
  perform 1 from public.players where id = v_player for update;
  if not found then
    raise exception 'PLAYER_NOT_FOUND';
  end if;
  if jsonb_typeof(p_loadout) is distinct from 'object' then
    raise exception 'BAD_REQUEST';
  end if;

  foreach v_slot in array array['heavy', 'light', 'magic', 'head', 'body', 'legs', 'back'] loop
    v_id := p_loadout ->> v_slot;
    continue when v_id is null;
    select kind into v_kind from public.item_definitions where id = v_id;
    if not found then
      v_errors := v_errors || jsonb_build_object('code', 'UNKNOWN_ITEM', 'slot', v_slot, 'itemId', v_id);
    elsif v_kind <> v_slot then
      v_errors := v_errors || jsonb_build_object('code', 'WRONG_KIND', 'slot', v_slot, 'itemId', v_id);
    end if;
    if not exists (select 1 from public.player_items where player_id = v_player and item_id = v_id) then
      v_errors := v_errors || jsonb_build_object('code', 'NOT_OWNED', 'slot', v_slot, 'itemId', v_id);
    end if;
  end loop;

  if jsonb_array_length(v_errors) > 0 then
    return jsonb_build_object('ok', false, 'errors', v_errors);
  end if;

  insert into public.loadouts (player_id, heavy_id, light_id, magic_id, head_id, body_id, legs_id, back_id)
  values (v_player, p_loadout ->> 'heavy', p_loadout ->> 'light', p_loadout ->> 'magic',
          p_loadout ->> 'head', p_loadout ->> 'body', p_loadout ->> 'legs', p_loadout ->> 'back')
  on conflict (player_id) do update
    set heavy_id = excluded.heavy_id, light_id = excluded.light_id, magic_id = excluded.magic_id,
        head_id = excluded.head_id, body_id = excluded.body_id, legs_id = excluded.legs_id,
        back_id = excluded.back_id, updated_at = now();
  return jsonb_build_object('ok', true, 'errors', '[]'::jsonb);
end;
$$;

revoke execute on function public.save_loadout(jsonb) from public, anon;
grant execute on function public.save_loadout(jsonb) to authenticated;
