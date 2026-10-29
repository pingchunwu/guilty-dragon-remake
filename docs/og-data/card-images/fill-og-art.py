"""Placeholder art: every engine card without generated art gets its OG picture (frame cut off) as
apps/web/public/cards/<card id>.webp. Run from this folder. OG downloads are cached in og-all/."""
import csv, io, json, os, time, urllib.request
from PIL import Image, ImageFilter, ImageOps

OUT = "../../../apps/web/public/cards"
T = {"重装": "heavy", "軽装": "light", "魔装": "magic"}
wiki = {(r["name"], T[r["colour"]]): r for r in csv.DictReader(open("og-card-images.csv", encoding="utf-8-sig"))}
os.makedirs("og-all", exist_ok=True)

def og_crop(im):  # same cut as pilot/crop.py: drop the OG border, orb and stars
    w, h = im.size
    s, x, y = int(w * .82), int(w * .09), int(h * .12)
    im = im.crop((x, y, x + s, y + s)).resize((1024, 1024), Image.LANCZOS)
    patch = ImageOps.mirror(im.crop((230, 0, 460, 190))).filter(ImageFilter.GaussianBlur(14))
    im.paste(patch, (0, 0))
    return im.resize((512, 512), Image.LANCZOS)

done = skipped = 0
for c in json.load(open("engine-cards.json", encoding="utf-8")):
    dst = f"{OUT}/{c['id']}.webp"
    r = wiki[(c["name"], c["type"])]
    if os.path.exists(dst) or not r["image_url"]:
        skipped += 1
        continue
    src = f"og-all/{r['id']}.webp"
    if not os.path.exists(src):
        req = urllib.request.Request(r["image_url"], headers={"User-Agent": "Mozilla/5.0"})
        open(src, "wb").write(urllib.request.urlopen(req, timeout=30).read())
        time.sleep(2)  # be gentle with the wiki CDN
    og_crop(Image.open(src).convert("RGB")).save(dst, quality=85)
    done += 1
    if done % 50 == 0:
        print(done, "done", flush=True)
print(f"{done} filled, {skipped} skipped (already have art or no OG image)")
