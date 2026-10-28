"""Build docs/card-spec.md, docs/skill-spec.md and packages/engine/src/og-cards.ts from the crawled OG CSVs.

Remake changes: cards keep only max POW (as `POW`) and take their skill max level
from the skill table; skills drop the event-only and fusion/sell-only categories.
Run: python -X utf8 docs/og-data/build-specs.py
"""
import collections
import csv
import json
import pathlib
import unicodedata

HERE = pathlib.Path(__file__).parent
DOCS = HERE.parent
OG_CARDS_TS = DOCS.parent / "packages" / "engine" / "src" / "og-cards.ts"
DROP = {"ファントムイベント限定スキル", "GvGイベント限定スキル", "合成・売却専用スキル"}
COLOURS = ["重装", "軽装", "魔装"]
RARITIES = ["N", "N+", "R", "R+", "SR", "SR+"]


def fold(r):
    """N+ and R+ merge into N and R; SR+ is its own SSR tier."""
    return "SSR" if r == "SR+" else r.rstrip("+")
# Card-list spellings that differ from the skill table (word order, typo, 打/討).
ALIAS = {
    "カード3": "ガード3",
    "アーマーブレイク3": "ブレイクアーマー3",
    "ダメージプラス3": "プラスダメージ3",
    "不意打ち2": "不意討ち2",
    "不意打ち3": "不意討ち3",
}
# Engine skill id (packages/engine/src/skills.ts) by OG skill name, for og-cards.ts.
ENGINE_ID = {
  "乱舞": "ranbu",
  "俊足": "swift",
  "連撃": "rengeki",
  "強襲連撃": "assault",
  "追撃": "pursuit",
  "遠い目": "far-gaze",
  "見切り": "mikiri",
  "心眼": "mind-eye",
  "アイアンフィスト": "iron-fist",
  "パワーアップ1": "power-up-1",
  "パワーアップ2": "power-up-2",
  "パワーアップ3": "power-up-3",
  "ギフトオブパワー": "gift-of-power",
  "パワーゲイズ1": "power-gaze-1",
  "パワーゲイズ2": "power-gaze-2",
  "パワーゲイズ3": "power-gaze-3",
  "魂の息吹": "soul-breath",
  "不借身命": "reckless",
  "腹筋崩壊": "belly-laugh",
  "脱力1": "weaken-1",
  "脱力2": "weaken-2",
  "脱力3": "weaken-3",
  "武装解除": "disarm",
  "力の封印1": "power-seal-1",
  "力の封印2": "power-seal-2",
  "力の封印3": "power-seal-3",
  "武装封咒": "arms-curse",
  "攻撃調査": "scout",
  "ガード1": "guard-1",
  "ガード2": "guard-2",
  "ガード3": "guard-3",
  "銀冠穴熊": "silver-crown",
  "見守る心": "watchful",
  "ハードアーマー1": "hard-armor-1",
  "ハードアーマー2": "hard-armor-2",
  "ハードアーマー3": "hard-armor-3",
  "魄の甲冑": "soul-armor",
  "癒しの肉球": "paw",
  "癒しの水1": "healing-water-1",
  "癒しの水2": "healing-water-2",
  "癒しの水3": "healing-water-3",
  "癒しの水4": "healing-water-4",
  "ハイヒール": "high-heal",
  "ヒール1": "heal-1",
  "ヒール2": "heal-2",
  "ヒール3": "heal-3",
  "ヒール4": "heal-4",
  "いたずら": "prank",
  "影討ち1": "shadow-strike-1",
  "影討ち2": "shadow-strike-2",
  "影討ち3": "shadow-strike-3",
  "先走り（＾ｏ＾）ノ": "jump-the-gun",
  "不意討ち1": "ambush-1",
  "不意討ち2": "ambush-2",
  "不意討ち3": "ambush-3",
  "力の代償1": "price-of-power-1",
  "力の代償2": "price-of-power-2",
  "力の代償3": "price-of-power-3",
  "暴力の代償1": "price-of-violence-1",
  "暴力の代償2": "price-of-violence-2",
  "暴力の代償3": "price-of-violence-3",
  "背水の陣": "last-stand",
  "プラスダメージ1": "plus-damage-1",
  "プラスダメージ2": "plus-damage-2",
  "プラスダメージ3": "plus-damage-3",
  "レイズダメージ1": "raise-damage-1",
  "レイズダメージ2": "raise-damage-2",
  "レイズダメージ3": "raise-damage-3",
  "戦神の鉄槌": "war-hammer",
  "いちるの望み1": "slim-hope-1",
  "いちるの望み2": "slim-hope-2",
  "いちるの望み3": "slim-hope-3",
  "守護神1": "guardian-1",
  "守護神2": "guardian-2",
  "守護神3": "guardian-3",
  "ブレイクアーマー1": "break-armor-1",
  "ブレイクアーマー2": "break-armor-2",
  "ブレイクアーマー3": "break-armor-3",
  "鎧通し": "armor-pierce",
  "天秤の武技": "balance-art",
  "凌駕の武技": "surpass-art",
  "不調の武技": "slump-art",
  "遠い絆": "distant-bond",
  "援軍": "reinforcements",
  "おとり": "decoy",
  "選民主義1": "elitism-1",
  "選民主義2": "elitism-2",
  "選民主義3": "elitism-3",
  "よこどり": "snatch",
  "挟撃": "pincer",
  "包囲網": "encircle",
  "フレンドメール": "friend-mail",
  "フレンドコール": "friend-call",
  "共闘": "joint-fight",
  "同盟": "alliance",
  "同郷の友": "hometown",
  "同国の友": "compatriot",
  "PT再編成": "regroup",
  "シャッフル": "shuffle",
  "かく乱": "disrupt",
  "戦略潰し": "strategy-crush",
  "ぶちこわし": "havoc",
  "粛清1": "purge-1",
  "粛清2": "purge-2",
  "粛清3": "purge-3",
  "王者の風格": "regal",
  "呪紋支援": "curse-support",
  "鋼刃突撃": "steel-charge",
  "双刃介入": "twin-blade",
  "シールド": "shield",
  "ものまね": "mimic",
}
TYPE = {"重装": "heavy", "軽装": "light", "魔装": "magic"}


def read(name):
    with open(HERE / name, encoding="utf-8-sig") as f:
        return list(csv.DictReader(f))


skills = [s for s in read("og-skills.csv") if s["category"] not in DROP]
cards = read("og-cards.csv")
by_name = {s["skill"]: s for s in skills}
# A card skill written without its tier (ハードアーマー) still has one max level if all tiers agree.
by_stem = collections.defaultdict(set)
for s in skills:
    by_stem[s["skill"].rstrip("0123456789")].add(s["max_level"])


def resolve(raw):
    if raw in by_name:
        return raw, by_name[raw]["max_level"], False
    norm = unicodedata.normalize("NFKC", raw)
    name = ALIAS.get(norm, norm)
    if name in by_name:
        return name, by_name[name]["max_level"], True
    levels = by_stem.get(name)
    if levels and len(levels) == 1:
        return f"{name} (tier not given)", next(iter(levels)), True
    return raw, "", True


def esc(v):
    return v.replace("|", "\\|")


def row(cells):
    return "| " + " | ".join(esc(str(c)) for c in cells) + " |"


# ---- cards ----
use_count = collections.Counter()
unresolved, renamed = set(), set()
lines = [
    "# Card spec (OG card library, remake form)",
    "",
    "Source: `docs/og-data/og-cards.csv`, crawled 2026-10-27 from the wikiwiki "
    "[ユニット早見表](https://wikiwiki.jp/guildra/%E3%83%A6%E3%83%8B%E3%83%83%E3%83%88%E6%97%A9%E8%A6%8B%E8%A1%A8). "
    "Generated by `docs/og-data/build-specs.py`; edit the script, not this file.",
    "",
    "Remake changes from the OG data:",
    "",
    "- **POW** is the OG max POW. The OG initial POW is dropped (card level only changes the skill level).",
    "- **Skill max Lv** comes from [skill-spec.md](skill-spec.md), not the card list.",
    "- + rarities are merged into their base rarity (N+→N, R+→R); SR+ becomes SSR.",
    "",
]
body = []
og_cards = []
stats = collections.defaultdict(list)
for colour in COLOURS:
    body += [f"## {colour}", "", row(["Rarity", "Name", "POW", "DRAW", "Skill", "Skill max Lv"]),
             "|---|---|---|---|---|---|"]
    group = [c for c in cards if c["colour"] == colour]
    group.sort(key=lambda c: (RARITIES.index(c["rarity"]), -int(c["pow_max"] or 0)))
    for n, c in enumerate(group, 1):
        name, max_lv, changed = resolve(c["skill"])
        use_count[name] += 1
        if not max_lv:
            unresolved.add(c["skill"])
        elif changed:
            renamed.add((c["skill"], name))
        stem = name.removesuffix(" (tier not given)")
        engine_id = ENGINE_ID.get(stem + "1" if stem != name else stem)
        if not engine_id:
            raise SystemExit(f"no engine skill for card {c['name']}: {c['skill']}")
        og_cards.append({"id": f"og-{TYPE[colour]}-{n:03d}", "name": c["name"], "type": TYPE[colour],
                         "attack": int(c["pow_max"]), "draw": int(c["draw"]), "rarity": fold(c["rarity"]),
                         "skill": engine_id})
        skill = name if name == c["skill"] else f"{name} (list: {c['skill']})"
        body.append(row([fold(c["rarity"]), c["name"], c["pow_max"], c["draw"], skill, max_lv or "?"]))
        stats[(colour, fold(c["rarity"]))].append(c)
    body.append("")

lines += ["## Summary by colour and rarity", "",
          row(["Colour", "Rarity", "Cards", "POW min", "POW avg", "POW max", "DRAW avg"]),
          "|---|---|---|---|---|---|---|"]
for colour in COLOURS:
    for r in ("N", "R", "SR", "SSR"):
        g = stats.get((colour, r))
        if not g:
            continue
        pw = [int(c["pow_max"]) for c in g]
        dr = [int(c["draw"]) for c in g]
        lines.append(row([colour, r, len(g), min(pw), round(sum(pw) / len(pw)), max(pw),
                          f"{sum(dr) / len(dr):.1f}"]))
lines += ["", f"Total: {len(cards)} cards.", ""]
if renamed:
    lines += ["Skill names the card list spells differently from the skill table (matched as shown):", ""]
    lines += [f"- {a} → {b}" for a, b in sorted(renamed)] + [""]
if unresolved:
    lines += ["Not in the skill table, max level left as `?` (the wiki's sub-pages were blocked by a bot check "
              "during the crawl): " + ", ".join(sorted(unresolved)), ""]
(DOCS / "card-spec.md").write_text("\n".join(lines + body), encoding="utf-8", newline="\n")

header = ("// GENERATED by docs/og-data/build-specs.py from docs/og-data/og-cards.csv. Do not edit by hand.\n"
          "// The original game's card library in card-spec.md order; IDs are og-<type>-<n> within each type.\n"
          'import type { CardDefinition } from "./types";\n\n'
          "export const OG_CARDS: readonly CardDefinition[] = [\n")
OG_CARDS_TS.write_text(header + "".join(f"  {json.dumps(c, ensure_ascii=False)},\n" for c in og_cards) + "];\n",
                       encoding="utf-8", newline="\n")

# ---- skills ----
lines = [
    "# Skill spec (OG skill table, remake form)",
    "",
    "Source: `docs/og-data/og-skills.csv`, crawled 2026-10-27 from the wikiwiki "
    "[スキル](https://wikiwiki.jp/guildra/%E3%82%B9%E3%82%AD%E3%83%AB) page. "
    "Generated by `docs/og-data/build-specs.py`; edit the script, not this file.",
    "",
    "Remake changes: the categories " + ", ".join(sorted(DROP)) + " are removed. "
    "**Cards** counts the cards in [card-spec.md](card-spec.md) with that skill. "
    "Timing is filled only where the wiki states it.",
    "",
]
cats = collections.OrderedDict()
for s in skills:
    cats.setdefault(s["category"] or "(no category on the wiki)", []).append(s)
lines += [row(["Category", "Skills"]), "|---|---|"]
lines += [row([k, len(v)]) for k, v in cats.items()] + ["", f"Total: {len(skills)} skills.", ""]
for cat, group in cats.items():
    lines += [f"## {cat}", "",
              row(["Skill", "Timing", "Effect", "Value", "Max Lv", "At max Lv", "Cards"]),
              "|---|---|---|---|---|---|---|"]
    for s in group:
        lines.append(row([s["skill"], s["timing"], s["effect_text"], s["value_formula"], s["max_level"],
                          s["value_at_max_level"], use_count.get(s["skill"], 0)]))
    lines.append("")
(DOCS / "skill-spec.md").write_text("\n".join(lines), encoding="utf-8")

assert sum(len(v) for v in stats.values()) == len(cards)
assert not any(s["category"] in DROP for s in skills)
print(f"cards {len(cards)}, skills {len(skills)}, renamed {len(renamed)}, unresolved {sorted(unresolved)}")
