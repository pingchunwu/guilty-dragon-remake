"""UR finish: an iridescent rainbow sheen on the bright metal and border, plus a few star glints, so UR reads shinier than SSR gold.
Usage: python holo.py <finished frame.png> <out.png>"""
import sys, math
from PIL import Image, ImageChops, ImageDraw, ImageFilter

src, out = sys.argv[1:3]
f = Image.open(src).convert("RGBA"); S = f.width
rgb = f.convert("RGB")
# diagonal rainbow, a couple of hue cycles across the card
h = Image.new("HSV", (256, 256)); h.putdata([(round((x + y) * 1.2) % 256, 210, 255) for y in range(256) for x in range(256)])
rainbow = h.convert("RGB").resize((S, S), Image.BICUBIC)
# only highlights pick up colour, so gold stays gold in the shadows
mask = ImageChops.multiply(rgb.convert("L").point(lambda v: max(0, v - 105) * 2.4), f.getchannel("A")).point(lambda v: v * .85)
rgb = Image.composite(ImageChops.screen(rgb, rainbow), rgb, mask.filter(ImageFilter.GaussianBlur(1)))
# star glints: thin cross + soft glow (1024-px coordinates)
glow = Image.new("L", (S, S), 0); d = ImageDraw.Draw(glow)
for cx, cy, r in ((92, 88, 46), (300, 40, 26), (620, 36, 22), (994, 300, 24), (40, 470, 22), (960, 960, 30), (520, 992, 18)):
    cx, cy, r = (v * S // 1024 for v in (cx, cy, r))
    d.polygon([(cx - r, cy), (cx, cy - r * .08), (cx + r, cy), (cx, cy + r * .08)], fill=255)
    d.polygon([(cx, cy - r), (cx + r * .08, cy), (cx, cy + r), (cx - r * .08, cy)], fill=255)
    d.ellipse((cx - r * .18, cy - r * .18, cx + r * .18, cy + r * .18), fill=255)
glow = ImageChops.lighter(glow, glow.filter(ImageFilter.GaussianBlur(S / 300)).point(lambda v: min(255, v * 3)))
rgb.paste((255, 255, 255), (0, 0), glow)
res = rgb.convert("RGBA"); res.putalpha(ImageChops.lighter(f.getchannel("A"), glow))
res.save(out)
print("holo", out)
