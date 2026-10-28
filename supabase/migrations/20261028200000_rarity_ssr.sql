-- SR+ cards become the new SSR tier; the check now allows N, R, SR, SSR.
alter table public.card_definitions drop constraint card_definitions_rarity_check;
alter table public.card_definitions add constraint card_definitions_rarity_check check (rarity in ('N', 'R', 'SR', 'SSR'));
