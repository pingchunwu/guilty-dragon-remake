"""Fetch Guilty Dragon wiki equipment pages (weapons only) into raw/ and parse them.

Usage:
    python crawl-weapons.py fetch     # download pages not yet in raw/ (2s between requests)
    python crawl-weapons.py parse     # parse raw/*.html into og-weapons.csv (no network)

Stops immediately on 403/429/challenge pages; does not try to bypass them.
No weapon image URLs exist on the equipment pages (no <img> tags), so no image step is included.
"""
import csv
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
RAW = os.path.join(HERE, "raw")
IMG_DIR = os.path.join(HERE, "images", "weapons")
BASE = "https://wikiwiki.jp/guildra/"
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/124.0 Safari/537.36")
DELAY = 2.0

PAGES = {
    "weapons-equipment.html": "装備",
    "weapons-henkou.html": "装備変更",
    "weapons-gousei.html": "装備合成",
    "weapons-kaitai.html": "装備解体",
    "weapons-skill.html": "スキル",
    "weapons-skill-list.html": "スキル別一覧",
}

SRC_HENKOU = BASE + urllib.parse.quote("装備変更")
SRC_GOUSEI = BASE + urllib.parse.quote("装備合成")
COLOURS = ("重装", "軽装", "魔装")
CSV_COLUMNS = [
    "id", "name", "colour", "rarity", "grade", "attack_raw", "pow_base",
    "pow_in_parentheses", "pow_levels", "acquisition", "effect_text",
    "image_url", "source_page", "notes",
]

CHALLENGE_MARKERS = ("cf-chl", "challenge-platform", "Just a moment", "captcha")


class Blocked(Exception):
    pass


def _get(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept-Language": "ja"})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            status = r.status
            body = r.read()
    except urllib.error.HTTPError as e:
        if e.code in (403, 429, 503):
            raise Blocked(f"HTTP {e.code} for {url}")
        raise
    text = body.decode("utf-8", errors="replace")
    if any(m in text[:5000] for m in CHALLENGE_MARKERS):
        raise Blocked(f"challenge page for {url}")
    return status, body


def fetch_all():
    os.makedirs(RAW, exist_ok=True)
    first = True
    for fname, page in PAGES.items():
        path = os.path.join(RAW, fname)
        if os.path.exists(path):
            continue
        if not first:
            time.sleep(DELAY)
        first = False
        url = BASE + urllib.parse.quote(page)
        try:
            _, body = _get(url)
        except Blocked as e:
            print("STOP:", e)
            sys.exit(2)
        with open(path, "wb") as f:
            f.write(body)
        print("saved", fname, len(body), "bytes")


def _load(fname):
    from bs4 import BeautifulSoup
    with open(os.path.join(RAW, fname), encoding="utf-8") as f:
        soup = BeautifulSoup(f.read(), "html.parser")
    return soup.find(id="content") or soup.body


def expand_table(table):
    """Return the table as a grid of strings, repeating rowspan/colspan cells."""
    grid, pending = [], {}
    for tr in table.find_all("tr"):
        cells = tr.find_all(["td", "th"])
        row, col, ci = [], 0, 0
        while True:
            if col in pending:
                txt, rem = pending.pop(col)
                row.append(txt)
                if rem > 1:
                    pending[col] = (txt, rem - 1)
                col += 1
                continue
            if ci >= len(cells):
                break
            c = cells[ci]
            ci += 1
            txt = " ".join(c.get_text(" ", strip=True).split())
            rs = int(c.get("rowspan", 1) or 1)
            cs = int(c.get("colspan", 1) or 1)
            for _ in range(cs):
                row.append(txt)
                if rs > 1:
                    pending[col] = (txt, rs - 1)
                col += 1
        grid.append(row)
    return grid


def parse_attack(raw):
    """Split a 攻撃力 cell like '300(1100)', '(1300)', '300(700?)' into (base, parenthesised)."""
    m = re.fullmatch(r"\s*(\d+)?\s*\((\d+)\??\)\s*", raw)
    if m:
        return (m.group(1) or ""), m.group(2)
    m = re.fullmatch(r"\s*(\d+)\s*", raw)
    if m:
        return m.group(1), ""
    return "", ""  # unexpected shape: keep attack_raw only


def parse_weapons_henkou():
    body = _load("weapons-henkou.html")
    table = [t for t in body.find_all("table") if "攻撃力" in t.get_text()][0]
    rows, colour = [], ""
    for r in expand_table(table)[1:]:
        if len(r) != 4:
            raise ValueError(f"unexpected row shape: {r}")
        colour_cell, name, attack, acq = r
        if colour_cell in COLOURS:
            colour = colour_cell
        if colour_cell not in COLOURS and colour_cell != colour:
            raise ValueError(f"colour drift at {name}: {colour_cell}")
        base, paren = parse_attack(attack)
        note = "wiki value marked with ? (uncertain)" if "?" in attack else ""
        rows.append({
            "name": name, "colour": colour, "attack_raw": attack,
            "pow_base": base, "pow_in_parentheses": paren,
            "acquisition": acq, "source_page": SRC_HENKOU,
            "notes": note,
        })
    return rows


def parse_weapons_gousei():
    """Weapon enhancement tables (only three weapons are listed on 装備合成)."""
    body = _load("weapons-gousei.html")
    lines = [l.strip() for l in body.get_text("\n", strip=True).split("\n")]
    rows = []
    tables = [t for t in body.find_all("table") if expand_table(t)[0][:2] == ["強化", "POW"]]
    weapon_tables = tables[:3]  # 通常 / 強化 / 覚醒 weapon tables precede the armour tables
    head_lines = [i for i, l in enumerate(lines)
                  if re.match(r"^(重装|軽装|魔装)：", l) and not l.startswith("防具")]
    if len(head_lines) != len(weapon_tables):
        raise ValueError(f"weapon header count {len(head_lines)} != tables {len(weapon_tables)}")
    for idx, (li, t) in enumerate(zip(head_lines, weapon_tables)):
        colour, name = re.match(r"^(重装|軽装|魔装)：(.+)$", lines[li]).groups()
        grade = [l for l in lines[:li] if l in ("通常", "強化", "覚醒")][-1]
        levels = []
        for r in expand_table(t)[1:]:
            lvl, pow_ = r[0] or "base", r[1]
            if pow_:
                levels.append(f"{lvl}={pow_}")
        rows.append({
            "name": name, "colour": colour, "grade": grade,
            "attack_raw": "", "pow_base": levels[0].split("=")[1] if levels else "",
            "pow_levels": "; ".join(levels), "acquisition": "",
            "source_page": SRC_GOUSEI,
            "notes": "Listed only as an enhancement table on 装備合成; no 攻撃力 row or acquisition on 装備変更/装備解体",
        })
    return rows


def write_csv(all_rows):
    for i, r in enumerate(all_rows, 1):
        r["id"] = f"w-{i:03d}"
        r.setdefault("rarity", "")
        r.setdefault("grade", "")
        r.setdefault("pow_levels", "")
        r.setdefault("effect_text", "")
        r.setdefault("image_url", "")
    path = os.path.join(HERE, "og-weapons.csv")
    with open(path, "w", encoding="utf-8-sig", newline="") as f:
        w = csv.DictWriter(f, fieldnames=CSV_COLUMNS, extrasaction="ignore")
        w.writeheader()
        w.writerows(all_rows)
    return path, len(all_rows)


def parse_all():
    rows = parse_weapons_henkou()
    gousei = parse_weapons_gousei()
    # the 装備合成 weapons are not in the 装備変更 table; add them as extra rows
    rows.extend(gousei)
    path, n = write_csv(rows)
    print("wrote", path, n, "rows")


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "fetch"
    if cmd == "fetch":
        fetch_all()
    elif cmd == "parse":
        parse_all()
    else:
        print("unknown command", cmd)
        sys.exit(1)
