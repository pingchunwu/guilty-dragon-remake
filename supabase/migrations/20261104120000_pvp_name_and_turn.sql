-- Every player can list every other player, so a name without a display name
-- must not show the account email. The friend code (or, before one is made, the start of the ID) keeps nameless players apart.
create or replace function public.player_name(p_player uuid) returns text
language sql stable
as $$
  select coalesce(p.display_name, '玩家 ' || coalesce(p.friend_code, left(p.id::text, 8)))
    from public.players p
   where p.id = p_player
$$;

-- The turn starts when a phase is recorded and the replay takes up to about 27 s, so 90 s leaves about 60 s to choose.
update public.game_config set value = '90' where key = 'pvp_turn_seconds';
