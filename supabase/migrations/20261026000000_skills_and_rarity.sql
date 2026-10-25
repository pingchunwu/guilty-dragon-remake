-- Leader skills and card rarity (rule version 0.6.0-draft, docs/development-spec.md §6a).
-- Skill effects run in packages/engine (skills.ts); this table mirrors the
-- definitions so cards can reference them and draws can cap levels.

create table public.skill_definitions (
  id        text primary key,
  name      text not null,
  -- Name in the original game, for tracing back to the source.
  original  text not null,
  max_level integer not null check (max_level between 1 and 10),
  timing    text not null,
  effect    jsonb not null,
  value     integer not null,
  per_level boolean not null
);

alter table public.skill_definitions enable row level security;
create policy "content readable" on public.skill_definitions for select using (true);

alter table public.card_definitions
  add column rarity text not null default 'N' check (rarity in ('N', 'N+', 'R', 'R+', 'SR', 'SR+')),
  add column skill_id text references public.skill_definitions (id);
