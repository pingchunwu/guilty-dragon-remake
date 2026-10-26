-- Skill values back on the original game's scale (rule 0.7.0-draft, docs/development-spec.md §6a).
-- 0.6.0-draft divided flat values by 10; these are the wikiwiki skill table values again.
-- Percent values (including the defense skills) were already the original's and stay as they are.
-- Mirrors packages/engine/src/skills.ts.

update public.skill_definitions as s
set value = v.value
from (values
  ('iron-fist', 300),
  ('power-up-1', 20), ('power-up-2', 40), ('power-up-3', 60),
  ('belly-laugh', 300),
  ('weaken-1', 20), ('weaken-2', 40), ('weaken-3', 60),
  ('scout', 500),
  ('guard-1', 50), ('guard-2', 100), ('guard-3', 150),
  ('paw', 800),
  ('healing-water-1', 50), ('healing-water-2', 100), ('healing-water-3', 150), ('healing-water-4', 200),
  ('prank', 800),
  ('shadow-strike-1', 50), ('shadow-strike-2', 100), ('shadow-strike-3', 150),
  ('price-of-power-1', 100), ('price-of-power-2', 200), ('price-of-power-3', 300),
  ('price-of-violence-1', 100), ('price-of-violence-2', 200), ('price-of-violence-3', 300),
  ('last-stand', 800),
  ('plus-damage-1', 50), ('plus-damage-2', 100), ('plus-damage-3', 150),
  ('slim-hope-1', 200), ('slim-hope-2', 400), ('slim-hope-3', 600),
  ('joint-fight', 300),
  ('alliance', 500),
  ('hometown', 100),
  ('compatriot', 200)
) as v (id, value)
where s.id = v.id;
