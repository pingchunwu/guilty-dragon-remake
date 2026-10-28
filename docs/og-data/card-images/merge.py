"""Merge results/batch-*.csv with ../og-cards.csv into og-card-images.csv and gallery.html."""
import csv, glob, json, urllib.parse

SITE_IMAGES = ("/FrontPage/::ref/", "/%3AHeader/::ref/")  # wiki chrome, not card art

cards = list(csv.DictReader(open("../og-cards.csv", encoding="utf-8-sig")))
rows = sorted((r for f in glob.glob("results/batch-*.csv") for r in csv.DictReader(open(f, encoding="utf-8"))),
              key=lambda r: int(r["id"]))
assert len(rows) == len(cards) == 733

out = []
for r, c in zip(rows, cards):
    assert r["name"] == c["name"], (r["id"], r["name"], c["name"])
    urls = [u for u in r["image_urls"].split("|") if u and not any(s in u for s in SITE_IMAGES)]
    header_first = r["image_urls"] and not r["image_urls"].split("|")[0] in urls
    out.append({
        "id": int(r["id"]), "colour": c["colour"], "rarity": c["rarity"], "name": c["name"],
        "pow_initial": c["pow_initial"], "pow_max": c["pow_max"], "draw": c["draw"], "skill": c["skill"],
        "image_url": urls[0] if urls else "",
        "extra_image_urls": "|".join(urls[1:]),
        # size was measured on the first image, which was the site header for some rows
        "width": "" if header_first else r["width"], "height": "" if header_first else r["height"],
        "status": "ok" if urls else "missing", "page_url": r["page_url"],
    })

with open("og-card-images.csv", "w", encoding="utf-8-sig", newline="") as f:
    w = csv.DictWriter(f, fieldnames=list(out[0]))
    w.writeheader(); w.writerows(out)

extra_name = lambda u: urllib.parse.unquote(u.split("::ref/")[1].split("?")[0])
tpl = open("gallery.template.html", encoding="utf-8").read()
data = [{**o, "extras": [[u, extra_name(u)] for u in o["extra_image_urls"].split("|") if u]} for o in out]
open("gallery.html", "w", encoding="utf-8").write(tpl.replace("/*DATA*/[]", json.dumps(data, ensure_ascii=False)))

ok = sum(o["status"] == "ok" for o in out)
print(f"{ok} with image, {len(out) - ok} missing, {sum(bool(o['extra_image_urls']) for o in out)} with extra art")
