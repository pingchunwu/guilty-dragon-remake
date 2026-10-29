# OG armors (防具) - collection notes

Source: wikiwiki.jp/guildra (Guilty Dragon wiki, snapshot dated around 2013-2014).

## Pages used

| Page | URL | Saved as | Use |
|---|---|---|---|
| 装備 (equipment index) | https://wikiwiki.jp/guildra/%E8%A3%85%E5%82%99 | raw/armors-equipment.html | Says the old text moved to 装備変更; links to unit lists 重装/軽装/魔装 (units, not items) |
| 装備変更 (equipment change) | https://wikiwiki.jp/guildra/%E8%A3%85%E5%82%99%E5%A4%89%E6%9B%B4 | raw/armors-equipment-change.html | Main armor table (防具): 107 rows |
| 装備合成 (synthesis) | https://wikiwiki.jp/guildra/%E8%A3%85%E5%82%99%E5%90%88%E6%88%90 | raw/weapons-gousei.html (saved earlier by the weapons agent, reused, not refetched) | Draft armor data (防具：胴/脚/頭/背中); page says it is a draft ("たたき台") and asks for info |
| unit list "重装NORMAL" | .../%E9%87%8D%E8%A3%85NORMAL | raw/armors-heavy-normal.html | Not armor data: it is a list of units by rarity, so it was not used |

Fetch: urllib, browser User-Agent, 2 s between requests. No 403, 429 or challenge pages were seen. Re-run with `python crawl-armors.py parse` (parses saved files only).

## Page structure

- 装備変更 has two tables, 武器 (weapons, skipped here) and 防具. The 防具 table has four columns: 部位 (part, with rowspan), 防具名 (name), 防御力 (defense), 入手方法 (how obtained).
- Parts on the page: 胴 (body), 脚 (legs), 頭 (head), 背 (back). No 属性 (colour) column exists for armors.
- Event-only values appear as `base%(event%)`, for example `3%(5%)`. Some rows have only an event value, written as `(2%)`.
- Some 入手方法 cells span two rows (rowspan). The parser carries them down. Example: 黒魔獣の爪翼 has no obtained cell of its own and takes 愛しき人への贈り物 (2013/05) from the row above. This is inferred from the table structure, not stated on the wiki.
- No armor has an image on any fetched page. The only `<img>` tags are site header and smiley images. The weapons table has a broken `&ref(): File not found: "ナビコ.jpg"`. That file is referenced for ナビコぐるみ (back armor) but was never uploaded.

## How armor defense works (per the wiki)

- 防御力 is a percentage per armor piece. Example: 傭兵の上衣 = "2％" (body, 初期装備 = starting item).
- Wiki note on the table: "※()内の数値はイベント期間中のみの効果" ("values in parentheses are effective only during the event period").
- 装備合成 (draft) describes enhancement: DEF rises per level, with EXP cost per level and a cap ("合成強化上限", max enhancement through synthesis). Example: 若鹿の胴衣 base 4%, +1 = 5%.
- Awakened (覚醒) armors in the draft also list effects, for example 黄昏の戦装の胴衣: 軽装強化 +3% (light-armor boost), 重装耐性 -1.5% (heavy-armor resistance). 流浪囚人の脚衣: 魔装強化 +3%, 軽装耐性 -1.5%. These are only in the draft.

## Counts

Total: 113 rows (a-001 to a-113).
- 107 from 装備変更 (a-001 to a-107).
- 6 from 装備合成 draft only (a-108 to a-113). These are not in the 装備変更 list.
- 3 armors appear in both lists and are merged into one row: 黄昏の戦装の胴衣, プレゼント大袋, 黒魔獣の爪翼.

By part:
- 胴 (body): 14
- 脚 (legs): 13
- 頭 (head): 50
- 背 (back): 36

Rarity: 0 rows have a rarity. The wiki gives no armor rarity. The 【N】/【R】/【SR】 labels on the equipment index link to unit lists, not armor. The `tier` column holds the draft heading (通常 / 強化 / 覚醒, plus "?" where the heading is unclear). It covers 9 draft armors only. For the 107 rows from 装備変更 it is blank.

Colour affinity: none (armors have no 属性 on the wiki).

Images: 0 downloaded. The `images/armors/` folder was not created because there was nothing to download.

## Missing, uncertain, or not recorded

- No rarity, colour affinity, or image for any armor on the wiki.
- Effect text: only the two draft armors with a listed 軽装/魔装/重装/軽装耐性 effect (黄昏の戦装の胴衣, 流浪囚人の脚衣) have it. All others are blank.
- how_obtained is blank for the 6 draft-only armors. The draft does not give it.
- Draft-only armors may not match the game. 装備合成 is marked as a draft and some blocks have no name:
  - 装備合成 防具：脚 has a 通常 block with levels 1 to 3 (1000 EXP) but no name.
  - 装備合成 防具：頭 has 通常 and 覚醒 blocks with levels but no names.
  - These nameless blocks were not turned into rows.
- Some draft levels are incomplete (blank "+2" value or EXP). These are recorded as "not recorded" in upgrade_levels.
- 黄昏の戦装の胴衣 and the 拘衣 armors have "覚醒?" tiers because the draft heading is ambiguous.
- Values are copied as printed. The wiki mixes full-width ％ and ASCII %, and both are kept in defense_raw.
- Data is old (2013-2014 snapshot). Equipment on the current game may differ.
