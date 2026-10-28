-- Rarity "+" tiers are merged into their base tier (N+ -> N, R+ -> R, SR+ -> SR); the check allows only N, R, SR.
-- The inline check from 20261026000000_skills_and_rarity.sql is named card_definitions_rarity_check by Postgres.
alter table public.card_definitions drop constraint card_definitions_rarity_check;
alter table public.card_definitions add constraint card_definitions_rarity_check check (rarity in ('N', 'R', 'SR'));
