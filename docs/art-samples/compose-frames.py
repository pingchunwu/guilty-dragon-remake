"""Builds the 15 rarity frames: a thin border in the card type's exact colour + gold ornaments from ComfyUI.
Usage: python compose-frames.py <rawDir> <partsDir>   (rawDir = comfy-parts.mjs output with orn-*.png; writes frame-<RARITY>-<type>.png to partsDir)
Richer rarity = more/larger ornament and brighter metal; N is a plain bronze-edged border."""
import sys, os
from PIL import Image, ImageDraw, ImageChops, ImageFilter

raw, parts = sys.argv[1:3]
S = 1024
COLOR = {"heavy": ((226, 66, 46), (110, 16, 10)), "light": ((70, 196, 98), (14, 70, 34)), "magic": ((82, 134, 245), (20, 48, 140))}
METAL = {"N": ((176, 132, 80), (104, 70, 34)), "R": ((232, 236, 244), (140, 146, 160)), "SR": ((250, 226, 150), (176, 128, 40)),
         "SSR": ((255, 240, 180), (200, 146, 40)), "UR": ((255, 250, 220), (214, 160, 50))}
EDGE = {"N": 26, "R": 28, "SR": 32, "SSR": 36, "UR": 40}
# (corner px, top-crest px width, bottom-crest px width)
ORN = {"N": (0, 0, 0), "R": (90, 0, 0), "SR": (130, 340, 0), "SSR": (170, 520, 300), "UR": (210, 700, 440)}
LINES = {"N": 0, "R": 0, "SR": 1, "SSR": 1, "UR": 2}  # inner gold hairlines: plain -> luxury

def vgrad(c1, c2, size=S):
    g = Image.new("RGB", (1, size))
    for y in range(size): g.putpixel((0, y), tuple(round(a + (b - a) * y / (size - 1)) for a, b in zip(c1, c2)))
    return g.resize((size, size))

def ring(box, radius, width):
    m = Image.new("L", (S, S), 0); d = ImageDraw.Draw(m)
    d.rounded_rectangle(box, radius=radius, fill=255)
    d.rounded_rectangle((box[0] + width, box[1] + width, box[2] - width, box[3] - width), radius=max(radius - width, 2), fill=0)
    return m

def lum_alpha(im):
    """Gold on black: brightness becomes opacity, so no flood fill is needed."""
    im = im.convert("RGB")
    a = im.convert("L").point(lambda v: 0 if v < 28 else min(255, (v - 28) * 10))
    out = im.convert("RGBA"); out.putalpha(a)
    return out

def orn(name, width, flip=False, crop=None):
    im = lum_alpha(Image.open(os.path.join(raw, name + ".png")))
    if crop: im = im.crop(crop(im.size))
    im = im.crop(im.getbbox() or (0, 0, *im.size))
    squash = .62 if crop is not quadrant else 1  # crests are flattened to ride the top edge
    im = im.resize((width, round(im.height * width / im.width * squash)), Image.LANCZOS)
    return im.transpose(Image.FLIP_TOP_BOTTOM) if flip else im

quadrant = lambda sz: (0, 0, sz[0] // 2, sz[1] // 2)           # corner motif = one quarter of a symmetric medallion
centre = lambda f: (lambda sz: (round(sz[0] * (1 - f) / 2), 0, round(sz[0] * (1 + f) / 2), sz[1]))
CENTRE = {"SR": .45, "SSR": .7, "UR": 1}

def build(rarity, t):
    out = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    e = EDGE[rarity]; metal = METAL[rarity]; c1, c2 = COLOR[t]
    metal_w = 7
    out.paste(vgrad(*metal), (0, 0), ring((0, 0, S - 1, S - 1), 22, e))               # whole border in metal ...
    inner = ring((metal_w, metal_w, S - 1 - metal_w, S - 1 - metal_w), 18, e - 2 * metal_w - 4)  # ... coloured band over it
    out.paste(vgrad(c1, c2), (0, 0), inner)
    for i in range(LINES[rarity]):
        o = e + 2 + i * 10
        out.paste(vgrad(*METAL["SR"]), (0, 0), ring((o, o, S - 1 - o, S - 1 - o), 12, 3))
    cr, top, bot = ORN[rarity]
    if cr:
        c = orn(f"orn-corner-{rarity}-1", cr, crop=quadrant)
        for flipx in (0, 1):
            for flipy in (0, 1):
                v = c.transpose(Image.FLIP_LEFT_RIGHT) if flipx else c
                v = v.transpose(Image.FLIP_TOP_BOTTOM) if flipy else v
                out.alpha_composite(v, (S - cr - 2 if flipx else 2, S - v.height - 2 if flipy else 2))
    if top:
        o = orn(f"orn-top-{rarity}-2", top, crop=centre(CENTRE[rarity])); out.alpha_composite(o, ((S - o.width) // 2, 0))
    if bot:
        o = orn(f"orn-top-{rarity}-2", bot, flip=True, crop=centre(CENTRE[rarity])); out.alpha_composite(o, ((S - o.width) // 2, S - o.height))
    if rarity == "UR":  # side crests, rotated, so only UR is ornate on all four edges
        side = orn("orn-top-UR-2", 300, crop=centre(.6))
        out.alpha_composite(side.rotate(90, expand=True), (0, (S - side.width) // 2))
        out.alpha_composite(side.rotate(-90, expand=True), (S - side.height, (S - side.width) // 2))
    return out

for r in ORN:
    for t in COLOR:
        build(r, t).save(os.path.join(parts, f"frame-{r}-{t}.png"))
        print("frame", r, t)
