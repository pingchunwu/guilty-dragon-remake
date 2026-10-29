"""Armor (防具) data collection for Guilty Dragon OG wiki (wikiwiki.jp/guildra).

Modes:
  python crawl-armors.py fetch <url> <out_file> [<url> <out_file> ...]
      Fetch pages with urllib (browser UA), 2 s between requests, save raw HTML.
      Stops on HTTP error or a challenge page. Does not bypass bot checks.
  python crawl-armors.py parse
      Parse raw/armors-equipment-change.html (防具 table) plus the armor part of
      raw/weapons-gousei.html (装備合成, draft) into og-armors.csv (utf-8-sig).
"""
import csv
import os
import re
import sys
import time
import urllib.error
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
RAW = os.path.join(HERE, "raw")
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/124.0 Safari/537.36")
BASE = "https://wikiwiki.jp/guildra/"
CHANGE_URL = BASE + "%E8%A3%85%E5%82%99%E5%A4%89%E6%9B%B4"  # 装備変更
GOUSEI_URL = BASE + "%E8%A3%85%E5%82%99%E5%90%88%E6%88%90"  # 装備合成

FIELDS = ["id", "name", "part", "rarity", "tier", "defense_raw", "defense_base",
          "defense_event", "effect_text", "colour_affinity", "how_obtained",
          "enhance_cap", "upgrade_levels", "image_url", "source_page",
          "data_status", "notes"]


def fetch(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "text/html"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read()


def do_fetch(pairs):
    for i, (url, out) in enumerate(pairs):
        if i:
            time.sleep(2)
        try:
            body = fetch(url)
        except urllib.error.HTTPError as e:
            print(f"STOP HTTP {e.code} {url}")
            sys.exit(1)
        head = body[:4000].lower()
        if b"just a moment" in head or b"cf-challenge" in head:
            print(f"STOP challenge page {url}")
            sys.exit(1)
        with open(out, "wb") as f:
            f.write(body)
        print(f"OK {len(body)} bytes -> {out}")


def text_of(cell):
    # wiki line breaks inside a cell are not spaces: join without separator
    return "".join(cell.stripped_strings)


def norm_obtained(s):
    s = re.sub(r"(?<=話)(?=イベント)", " / ", s)
    s = re.sub(r"(?<=\))(?=イベント)", " / ", s)
    s = re.sub(r"(?<=\))(?=ギルド)", " ", s)
    return s


def parse_change_table():
    from bs4 import BeautifulSoup
    with open(os.path.join(RAW, "armors-equipment-change.html"), "rb") as f:
        soup = BeautifulSoup(f.read(), "html.parser")
    tables = soup.find(id="content").find_all("table")
    armor_table = tables[2]  # header: 部位 防具名 防御力 入手方法
    rows = []
    carry = {}  # column -> [text, rows still covered] for rowspan cells
    for tr in armor_table.find_all("tr")[1:]:
        cells = iter(tr.find_all(["td", "th"]))
        vals = []
        for col in range(4):
            if col in carry:  # covered by a rowspan from an earlier row
                text, left = carry[col]
                vals.append(text)
                if left <= 1:
                    del carry[col]
                else:
                    carry[col][1] = left - 1
                continue
            cell = next(cells)
            text = text_of(cell)
            span = int(cell.get("rowspan", 1))
            if span > 1:
                carry[col] = [text, span - 1]
            vals.append(text)
        part, name, defense, obtained = vals
        rows.append({"part": part, "name": name, "defense": defense,
                     "obtained": norm_obtained(obtained)})
    return rows


def split_defense(d):
    """'3%(5%)' -> ('3%', '5%'); '(2%)' -> ('', '2%'); '2％' -> ('2％', '')."""
    base = re.match(r"\s*(\d+\s*[%％])", d)
    event = re.search(r"\((\d+\s*[%％])\)", d)
    return (base.group(1) if base else ""), (event.group(1) if event else "")


# Draft armor data from 装備合成 (raw/weapons-gousei.html, 防具 section).
# Transcribed as printed (page is an admitted draft "たたき台"). Empty = not given.
# (name, part, tier heading, DEF base, enhance cap, level info, effect text)
GOUSEI_ARMORS = [
    ("若鹿の胴衣", "胴", "通常", "4%", "+2",
     "+1: 1000 EXP (cum 1000), value 5%; +2: EXP/value not recorded", ""),
    ("流浪囚人の胴衣", "胴", "覚醒", "9%", "+1", "+1: 200000 EXP", ""),
    ("黄昏の戦装の胴衣", "胴", "覚醒?", "8%", "+2",
     "+1: 20000 EXP (cum 20000); +2: 20000 EXP (cum not recorded)",
     "軽装強化 +3%; 重装耐性 -1.5%"),
    ("拘衣・天ノ装", "胴", "覚醒?", "8%", "+2",
     "+1: 20000 EXP (cum 20000) -> 9%; +2: 180000 EXP (cum 200000) -> 10%", ""),
    ("流浪囚人の脚衣", "脚", "覚醒?", "9%", "+1", "+1: 200000 EXP",
     "魔装強化 +3%; 軽装耐性 -1.5%"),
    ("拘衣・地ノ装", "脚", "覚醒?", "8%", "+2",
     "+1: 20000 EXP (cum 20000) -> 9%; +2: 180000 EXP (cum 200000) -> 10%", ""),
    ("ナビコぐるみ", "背", "通常", "2%", "+1", "+1: 10000 EXP; +1 value not recorded", ""),
    ("プレゼント大袋", "背", "強化", "2%", "+1", "+1: 50000 EXP; +1 value not recorded", ""),
    ("黒魔獣の爪翼", "背", "覚醒", "3%", "+1", "+1: 200000 EXP", ""),
]


def build_rows():
    out, index = [], {}

    def add(name, part):
        key = (name, part)
        if key not in index:
            index[key] = len(out)
            out.append({f: "" for f in FIELDS} | {"name": name, "part": part,
                                                  "how_obtained": []})
        return out[index[key]]

    for r in parse_change_table():
        base, event = split_defense(r["defense"])
        row = add(r["name"], r["part"])
        row.update(defense_raw=r["defense"], defense_base=base, defense_event=event,
                   source_page=CHANGE_URL, data_status="wiki 装備変更 (防具 table)")
        if r["obtained"] and r["obtained"] not in row["how_obtained"]:
            row["how_obtained"].append(r["obtained"])

    for name, part, tier, d_base, cap, levels, effect in GOUSEI_ARMORS:
        existing = (name, part) in index
        row = add(name, part)
        row.update(tier=tier, enhance_cap=cap, upgrade_levels=levels,
                   effect_text=effect or row["effect_text"])
        if existing:
            row["defense_base"] = row["defense_base"] or d_base
            row["data_status"] = "wiki 装備変更 + 装備合成 draft"
            row["notes"] = "tier/cap/levels from 装備合成 draft"
        else:
            row.update(defense_raw=d_base, defense_base=d_base,
                       source_page=GOUSEI_URL,
                       data_status="装備合成 draft only (not in 装備変更 list)")
            row["notes"] = "name/value from draft; DEF shown as base value only"
        if not row["source_page"]:
            row["source_page"] = GOUSEI_URL
    return out


def do_parse():
    rows = build_rows()
    path = os.path.join(HERE, "og-armors.csv")
    with open(path, "w", encoding="utf-8-sig", newline="") as f:
        w = csv.DictWriter(f, fieldnames=FIELDS)
        w.writeheader()
        for i, r in enumerate(rows, 1):
            r["id"] = f"a-{i:03d}"
            r["how_obtained"] = " / ".join(r["how_obtained"])
            w.writerow({k: r.get(k, "") for k in FIELDS})
    print(f"wrote {len(rows)} rows -> {path}")


if __name__ == "__main__":
    if len(sys.argv) >= 2 and sys.argv[1] == "fetch":
        a = sys.argv[2:]
        do_fetch(list(zip(a[0::2], a[1::2])))
    elif len(sys.argv) == 2 and sys.argv[1] == "parse":
        do_parse()
    else:
        print(__doc__)
