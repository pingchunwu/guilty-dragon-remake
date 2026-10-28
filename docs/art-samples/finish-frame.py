"""Turns an img2img frame render back into a transparent frame PNG.
Usage: python finish-frame.py <template.png> <template-gems.png | -> <render.png> <out.png> ["x0 y0 x1 y1, ..."]
The optional last argument lists boxes (1024-px) where the render is thrown away and the template is shown instead.
Keeps the template's silhouette plus any bright gold the render added near the edges; the middle stays transparent."""
import sys
from PIL import Image, ImageChops, ImageDraw, ImageFilter

tpl, gems, render, out = sys.argv[1:5]
t = Image.open(tpl).convert("RGBA"); g = Image.open(gems).convert("RGBA") if gems != "-" else None; r = Image.open(render).convert("RGB").resize(t.size, Image.LANCZOS)
S = t.width
base = t.getchannel("A").filter(ImageFilter.MaxFilter(5))
# template shapes the render turned into dark background (e.g. lone leaves) are dropped; gems and the border keep everything
keep = Image.new("L", t.size, 0); d = ImageDraw.Draw(keep)
d.rectangle((0, 0, S, S), fill=255); d.rectangle((int(S * .03), int(S * .03), int(S * .97), int(S * .97)), fill=0)
for cx, cy, rad in ((122, 122, 128),):  # gem centres/radii in frame-template.py (1024 px); top-right gem sits under the badge
    d.ellipse([v * S // 1024 for v in (cx - rad, cy - rad, cx + rad, cy + rad)], fill=255)
lit = r.convert("L").point(lambda v: 255 if v > 70 else 0).filter(ImageFilter.MaxFilter(3))
base = ImageChops.multiply(base, ImageChops.lighter(lit, keep))
# ornament the render grew outside the template: bright pixels in a band along the edges, specks removed
grown = r.convert("L").point(lambda v: 255 if v > 95 else 0).filter(ImageFilter.MinFilter(5)).filter(ImageFilter.MaxFilter(7))
zone = Image.new("L", t.size, 255); ImageDraw.Draw(zone).rectangle((int(S * .2), int(S * .2), int(S * .8), int(S * .8)), fill=0)
alpha = ImageChops.lighter(base, ImageChops.multiply(grown, zone)).filter(ImageFilter.GaussianBlur(1))
res = r.convert("RGBA"); res.putalpha(alpha)
# img2img dulls the type colour: blend the template's border band back in so red stays red
band = Image.new("L", t.size, 0); d = ImageDraw.Draw(band); d.rectangle((0, 0, S, S), fill=255); d.rectangle((int(S * .025), int(S * .025), int(S * .975), int(S * .975)), fill=0)
res.paste(Image.blend(res.convert("RGB"), t.convert("RGB"), .7), (0, 0), ImageChops.multiply(band, t.getchannel("A")))
res.putalpha(alpha)
for box in filter(None, (sys.argv[5] if len(sys.argv) > 5 else "").split(",")):  # ornament cut on review
    m = Image.new("L", t.size, 0); ImageDraw.Draw(m).rectangle([int(v) * S // 1024 for v in box.split()], fill=255)
    res.paste(t, (0, 0), m)
if gems != "-": res.alpha_composite(g)  # crisp small gems back on top ("-" keeps the rendered ones)
res.save(out)
print("frame", out)
