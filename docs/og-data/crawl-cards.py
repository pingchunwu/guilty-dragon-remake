"""wikiwiki guildra ユニット早見表 -> og-cards.csv. The page holds one stats table per colour, so one request
(cached at raw/index.html; delete it to refetch). Run: python -X utf8 crawl-cards.py"""
import re, os, csv, html, time, urllib.request as r
D = os.path.dirname(os.path.abspath(__file__)); P = os.path.join(D, 'raw', 'index.html')
URL = 'https://wikiwiki.jp/guildra/%E3%83%A6%E3%83%8B%E3%83%83%E3%83%88%E6%97%A9%E8%A6%8B%E8%A1%A8'
COL = {'heavy': '重装', 'light': '軽装', 'magic': '魔装'}
if not os.path.exists(P):
    os.makedirs(os.path.dirname(P), exist_ok=True)
    b = r.urlopen(r.Request(URL, headers={'User-Agent': 'Mozilla/5.0'}), timeout=60).read()
    assert b'captcha' not in b.lower(), 'blocked'
    open(P, 'wb').write(b)
h = open(P, encoding='utf-8').read()
cell = lambda s: html.unescape(re.sub(r'<[^>]+>', '', s)).strip()
rows, bad = [], []
for k, cn in COL.items():
    m = re.search(rf'name ="{k}">.*?<table>(.*?)</table>', h, re.S)
    for tr in re.findall(r'<tr>(.*?)</tr>', m.group(1), re.S)[1:]:
        c = [cell(x) for x in re.findall(r'<td[^>]*>(.*?)</td>', tr, re.S)]
        if len(c) < 6 or not c[1]: bad.append((cn, c)); continue
        rows.append([cn, c[0], c[1], c[2], c[3], c[4], c[5], '', URL + '#' + k])
with open(os.path.join(D, 'og-cards.csv'), 'w', encoding='utf-8-sig', newline='') as f:
    w = csv.writer(f); w.writerow('colour rarity name pow_initial pow_max draw skill skill_level_max source_url'.split()); w.writerows(rows)
from collections import Counter
for (a, b), n in sorted(Counter((x[0], x[1]) for x in rows).items()): print(a, b, n)
print('total', len(rows), 'unparsed', bad)
