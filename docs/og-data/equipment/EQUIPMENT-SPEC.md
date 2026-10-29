# OG equipment spec (weapons and armors)

Source: the Guilty Dragon wiki (wikiwiki.jp/guildra), pages 装備変更 (main lists) and 装備合成 (enhancement draft), 2013–2014 snapshot. The raw pages are in `raw/`. The data is in `og-weapons.csv` (124 rows) and `og-armors.csv` (113 rows). Collection notes are in `weapons-notes.md` and `armors-notes.md`; the scripts are `crawl-weapons.py` and `crawl-armors.py`.

Review (2026-10-29): the row counts match the wiki tables, with 121 weapon rows and 107 armor rows on 装備変更. Every name appears on the saved pages, and every POW value in the CSV agrees with its 攻撃力 cell.

## What the OG has

- **Slots:** one weapon per colour (重装 / 軽装 / 魔装) and four armor parts: 頭 head, 胴 body, 脚 legs and 背 back.
- **Weapons:** a POW value (攻撃力). The leader card's colour picks which weapon adds to the total, as the remake already does.
- **Armors:** a defense percentage (防御力). The four parts add up.
- **Event values:** a value in parentheses applies only during its event, for example `300(1100)` or `(2000)`. Event-only items have no base value. Skill bonuses do not stack on limited-time power-up gear.
- **Grades and enhancement:** 装備合成 lists three grades, 通常, 強化 and 覚醒. Fusion (合成) adds POW or DEF per +level, up to a cap. The page is a draft ("たたき台"), so only a few items have per-level values:
  - 守護者の大剣: 1800 → 2200 at +5.
  - 若鹿の胴衣: 4% → 5% at +1.
- **Awakened armor effects** (draft only): colour boosts and resistances, for example 黄昏の戦装の胴衣 with 軽装強化 +3% and 重装耐性 -1.5%.
- **Not on the wiki:**
  - rarity for any weapon or armor
  - per-item skills for weapons
  - a colour for armors
  - item images: none of the pages has one, so nothing was downloaded and `images/` is empty

## Weapons (124)

| Colour | Count | Starter | Base POW | Event POW |
|---|---|---|---|---|
| 重装 | 44 (incl. 3 draft-only) | 岩砕 300 | 300–1800 | 1100–2000 |
| 軽装 | 40 | 飛蝗 300 | 300–1300 | 1100–2000 |
| 魔装 | 40 | 心玉の杖 300 | 300–1300 | 700–2000 |

18 weapons are event-only and have no base POW. The three draft-only weapons are 重蒼剣・鋼断, 苔森 and 守護者の大剣. 1 value is marked uncertain on the wiki: キャンディの杖 `300(700?)`.

## Armors (113)

| Part | Count | Base DEF | Event DEF |
|---|---|---|---|
| 頭 head | 50 | 1–3% | 2–8% |
| 胴 body | 14 | 2–10% | – |
| 脚 legs | 13 | 2–10% | – |
| 背 back | 36 | 1–3% | 2–5% |

- 12 armors are event-only.
- 6 armors appear only in the 装備合成 draft and have no source.
- 黒魔獣の爪翼 has no source cell of its own. Its source was carried down from the row above (a rowspan), so it is inferred.

## Compared with the engine today (`packages/engine/src/equipment.ts`, `types.ts`)

| Topic | OG | Engine now | To do when implementing |
|---|---|---|---|
| Slots | 3 weapons + head/body/legs/back | Same (`WEAPON_KINDS`, `ARMOR_KINDS`) | – |
| Weapon value | POW 300–2000 | `attack` | Import the 106 weapons that have a base POW. Decide whether event-only items get their event value. |
| Armor value | % per part, summed | `defense`, summed by `defenseOf` (a % in 0.7.0) | Import as is. A full OG set tops out around 10+10+3+3 = 26% base. |
| Levels | +N fusion per item, with draft per-level values | `ITEM_LEVEL_PERCENT` 10% per level, `ITEM_MAX_LEVEL` 10 | Keep the engine's formula. The OG curve is too incomplete to copy. |
| Grade 通常/強化/覚醒 | Yes (draft) | None | Possibly map it onto rarity. |
| Rarity | Not on the wiki | Items have rarity for the gacha | Assign from POW or DEF bands. Needs a decision. |
| Armor colour effects | Only on awakened armors (draft) | None | Defer. |
| Images | None | – | New art is needed for every item, made like the cards. |
