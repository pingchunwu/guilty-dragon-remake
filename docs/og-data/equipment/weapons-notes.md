# Weapons (武器) data notes

Source: https://wikiwiki.jp/guildra/ (ギルティドラゴン 罪竜と八つの呪い 攻略 Wiki)
Collected by `crawl-weapons.py`. Raw pages are in `raw/`. Output is `og-weapons.csv` (UTF-8 with BOM, 124 rows).

## Page structure found

- **装備** (`/guildra/装備`): only a redirect notice ("以前のページは「装備変更」に引っ越しました"). No data.
- **装備変更** (`/guildra/装備変更`): the main weapon list. One HTML table with columns 属性 (colour) / 武器名 / 攻撃力 / 入手方法. Colour blocks are 重装, 軽装, 魔装 (rowspan cells). The table has 121 weapon rows: 重装 41, 軽装 40, 魔装 40. The same page also holds an armour (防具) table, which is out of scope here.
- **装備合成** (`/guildra/装備合成`): enhancement tables with POW per level, for weapons and armour. Only three weapons appear here: 重蒼剣・鋼断 (通常), 苔森 (強化), 守護者の大剣 (覚醒). None of them are in the 装備変更 table.
- **装備解体** (`/guildra/装備解体`): dismantling rules (EXメタル rewards). No weapon stats.
- **スキル** (`/guildra/スキル`) and **スキル別一覧** (linked as スキル別早見表): skill-card effect tables. These are not per weapon. They are referenced only for the wording of how skills affect weapon power.
- **重装NORMAL** etc. (linked from the top page as 【N】 【R】 ...): these are character (unit) lists, not weapon lists. Saved as `raw/weapons-heavy-N.html` for reference, not parsed.
- No weapon detail pages are linked from the equipment pages. Weapon names are plain text, not links.

## How weapon power works (per the wiki)

- 装備変更 footnote: `※()内の数値はイベント期間中のみの効果` ("Values in parentheses apply only during the event period"). So the parenthesised POW is an event-period value.
- 装備合成 intro: `装備には「通常」「強化」「覚醒」があります` ("Equipment comes in 通常 / 強化 / 覚醒 grades").
- 装備合成 intro: `期間限定パワーアップ装備の場合、合成した強化の数値は上乗せされない` ("For limited-time power-up equipment, the fusion enhancement value is not added on top").
- Enhancement: each weapon has a POW value per level (`+1`, `+2` ...). For 守護者の大剣 the wiki lists base 1800, +1 1880, up to +5 2200. For 重蒼剣・鋼断 it lists base 400, +1 430, +2 460, and leaves +3 and above blank. For 苔森 it lists base 1000 and +1 1040, and leaves +2 and above blank. Blank cells are not invented.
- Skill page wording (translated): 「武器のパワーを300増やす」 = "raise weapon power by 300"; 「武器のパワーをLv×20増やす」 = "raise weapon power by Lv×20"; 「相手の武器パワーを300減らす」 = "reduce the enemy's weapon power by 300". The skill effects act on weapon power only.

## CSV columns

- `id`: w-001 ... w-124, in wiki order (装備変更 first, then 装備合成).
- `name`, `colour`: from the wiki as written.
- `rarity`: **empty for all rows**. No weapon rarity appears on any equipment page.
- `grade`: 通常 / 強化 / 覚醒, only for the three 装備合成 weapons.
- `attack_raw`: 攻撃力 cell verbatim (e.g. `300(1100)`, `(1300)`, `300(700?)`). Empty for the three 装備合成 weapons.
- `pow_base`: the number before the parentheses (72 rows have base and parenthesised, 31 base only, 18 parenthesised only, plus 3 with no 攻撃力 row).
- `pow_in_parentheses`: the number in parentheses (event-period value per the footnote).
- `pow_levels`: per-level POW for the three 装備合成 weapons, e.g. `base=1800; +1=1880; ...`.
- `acquisition`: 入手方法 verbatim. Line breaks inside the cell are joined with a space (e.g. `イベント： スポーツ秋の祭典！ (2013/09)`).
- `effect_text`: **empty for all rows**. No per-weapon effect or skill text exists on the wiki pages.
- `image_url`: **empty for all rows**. The equipment pages contain no `<img>` tags, and no weapon image links were found.
- `source_page`: the 装備変更 or 装備合成 URL.
- `notes`: flags the uncertain value (`300(700?)`) and marks the three 装備合成 weapons.

## Counts

| Colour | 装備変更 rows | 装備合成 rows | Total |
|---|---|---|---|
| 重装 | 41 | 3 | 44 |
| 軽装 | 40 | 0 | 40 |
| 魔装 | 40 | 0 | 40 |
| **Total** | 121 | 3 | **124** |

Rarity counts: not available (0 labelled). Grade counts: 通常 1, 強化 1, 覚醒 1.

## Missing / uncertain

- **Images: 0 of 124 downloaded.** No image URLs exist on the equipment pages. `images/weapons/` was not created because there was nothing to save.
- **Rarity: not on the wiki** for weapons. The 【N】/【R】/【SR】 labels on the top page belong to unit lists, not weapons.
- **Effect / skill text: not on the wiki** per weapon. Only general skill-card effects exist (スキル page).
- **Parenthesised values**: the footnote says they are event-period values. Rows like `(1300)` with no base (e.g. 風心雅) appear only in events. Whether the wiki intends a different reading is not stated.
- **`300(700?)`** (キャンディの杖): the wiki marks 700 with `?`. Kept as written, flagged in `notes`.
- **Blank POW cells** in the 装備合成 tables are left blank (e.g. 重蒼剣 +3 onward, 苔森 +2 onward, 守護者 beyond +5 is listed as end). Not filled.
- **Acquisition text** for event weapons is verbatim, with line breaks joined by spaces.
- **Event-only weapons** have no base 攻撃力, so `pow_base` is empty for them.
- The 装備 page is a redirect stub, and `raw/armors-equipment.html` is another agent's file. Neither was touched.
- No code, commits or other project files were changed.
