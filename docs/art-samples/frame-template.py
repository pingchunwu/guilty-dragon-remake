"""Draws the UR frame layout as flat shapes; ComfyUI (comfy-frame.mjs) then renders the metal detail.
Usage: python frame-template.py <type> <outDir> [N|R|SR|SSR|UR]  ->  template-<type>[-<rarity>].png and ...-gems.png
(RGBA, art hole transparent; UR keeps the unsuffixed names). Lower rarities drop layers and use plainer metal.
Layout follows the reference cards: thin bevelled border in the type colour; big faceted gem top-left in a clawed gold
bezel with a scroll curling down the left edge; a thick wavy gold crest across the top with hanging curls, leaves and a
row of small gems, ending in a round gem top-right; a large gold curl with a gem at bottom-right."""
import sys, os, math
from PIL import Image, ImageDraw, ImageFilter, ImageChops

t, out = sys.argv[1:3]
R = sys.argv[3] if len(sys.argv) > 3 else "UR"
r = ["N", "R", "SR", "SSR", "UR"].index(R)  # tier: each step adds layers on top of the one below
K = 2; S = 1024 * K  # supersampled, downscaled at the end
COL = {"heavy": ((240, 80, 70), (130, 12, 16)), "light": ((110, 230, 110), (8, 96, 34)), "magic": ((110, 170, 255), (16, 54, 160))}[t]
# trim by tier: plain type colour (N), bronze (R), silver (SR), gold (SSR, UR); light, mid, shadow
GOLD = [(tuple(min(255, c + 90) for c in COL[0]), COL[0], COL[1]), ((240, 196, 150), (168, 104, 56), (70, 36, 14)),
        ((252, 252, 255), (172, 178, 192), (64, 68, 80))][r] if r < 3 else ((255, 244, 190), (222, 176, 76), (110, 70, 18))
DARK = (48, 26, 6)

def solid(c): return Image.new("RGB", (S, S), c)
def mask(): m = Image.new("L", (S, S), 0); return m, ImageDraw.Draw(m)

def gold_tex():
    g = Image.new("RGB", (1, S))
    for y in range(S):
        v = .5 + .5 * math.sin(y / S * math.pi * 22)
        g.putpixel((0, y), tuple(round(GOLD[2][i] + (GOLD[0][i] - GOLD[2][i]) * (.4 + .6 * v)) for i in range(3)))
    return g.resize((S, S))
GT = gold_tex()

img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
def fill(m, rim=5):
    # dark rim gives img2img a clear edge to keep; light/shade offsets fake a bevel
    if rim: img.paste(solid(DARK), (0, 0), m.filter(ImageFilter.MaxFilter(rim * K + 1)))
    img.paste(GT, (0, 0), m)
    img.paste(solid(GOLD[0]), (0, 0), ImageChops.subtract(m, ImageChops.offset(m, 3 * K, 3 * K)).filter(ImageFilter.GaussianBlur(K)))
    img.paste(solid(GOLD[2]), (0, 0), ImageChops.subtract(m, ImageChops.offset(m, -3 * K, -3 * K)).filter(ImageFilter.GaussianBlur(K)))

def stroke(pts, w0, w1):
    m, d = mask()
    for i, (x, y) in enumerate(pts):
        w = (w0 + (w1 - w0) * i / max(1, len(pts) - 1)) / 2
        d.ellipse((x - w, y - w, x + w, y + w), fill=255)
    return m

def spiral(cx, cy, r0, turns, a0, direction=1, n=260):
    return [(cx + r0 * (1 - .92 * i / n) * math.cos(a0 + direction * turns * 2 * math.pi * i / n),
             cy + r0 * (1 - .92 * i / n) * math.sin(a0 + direction * turns * 2 * math.pi * i / n)) for i in range(n)]

def leaf(cx, cy, length, angle, width):
    m, d = mask(); pts = []
    for i in range(41):
        f = i / 40; pts.append((f * length, width * math.sin(f * math.pi) * (1 - .3 * f)))
    pts += [(x, -y) for x, y in reversed(pts)]
    ca, sa = math.cos(angle), math.sin(angle)
    d.polygon([(cx + x * ca - y * sa, cy + x * sa + y * ca) for x, y in pts], fill=255)
    return m

# 1. border: dark edge, bevelled type-colour band (bright core), gold inner bevel
b = 32 * K
m, d = mask(); d.rectangle((0, 0, S, S), fill=255); d.rectangle((b, b, S - b, S - b), fill=0); img.paste(solid((20, 14, 8)), (0, 0), m)
for i, f in enumerate((.15, .45, .8, .45)):
    inset = 3 * K + i * 4 * K
    m, d = mask(); d.rectangle((inset, inset, S - inset, S - inset), fill=255); d.rectangle((b - 8 * K - i * K, b - 8 * K - i * K, S - b + 8 * K + i * K, S - b + 8 * K + i * K), fill=0)
    img.paste(solid(tuple(round(COL[1][j] + (COL[0][j] - COL[1][j]) * f) for j in range(3))), (0, 0), m)
# white sheen drifting diagonally across the coloured band, so it reads pearly/mysterious instead of flat
sh = Image.new("L", (256, 256)); sh.putdata([round(255 * .85 * (.5 + .5 * math.sin((x + y * .6) / 256 * math.pi * 3.2 + .7 * math.sin(y / 40))) ** 2.2) for y in range(256) for x in range(256)])
m, d = mask(); d.rectangle((3 * K, 3 * K, S - 3 * K, S - 3 * K), fill=255); d.rectangle((b - 8 * K, b - 8 * K, S - b + 8 * K, S - b + 8 * K), fill=0)
sheen = (0, 0, .35, .65, 1)[r]
if sheen: img.paste(solid((250, 255, 250)), (0, 0), ImageChops.multiply(m, sh.resize((S, S), Image.BICUBIC).point(lambda v: v * sheen)))
m, d = mask(); d.rectangle((b - 8 * K, b - 8 * K, S - b + 8 * K, S - b + 8 * K), fill=255); d.rectangle((b, b, S - b, S - b), fill=0); fill(m, rim=2)

# 2. top crest: thick wavy band, engraved swirls, trim, hanging curls and leaves
x0, x1 = 150 * K, S
def base(x):
    f = (x - x0) / (x1 - x0); return (96 - 34 * f) * K + 9 * K * math.sin(f * math.pi * 5)
top = b - 6 * K
if r >= 2:
    m, d = mask(); d.polygon([(x0, top), (x1, top)] + [(x, base(x)) for x in range(x1, x0 - 1, -4)], fill=255); fill(m)
    # engraved relief inside the band: paired C-scrolls with a groove line, so img2img has structure to carve
    for i in range(8):
        f = (i + .5) / 8; x = x0 + (x1 - x0) * f; h = base(x) - top
        for side in (-1, 1):
            sc = spiral(x + side * h * .4, top + h * .5, h * .36, 1.25, math.pi if side < 0 else 0, side)
            img.paste(solid(DARK), (0, 0), stroke(sc, 8 * K, 3 * K))
            img.paste(solid(GOLD[0]), (0, 0), stroke([(px - K, py - K) for px, py in sc], 4 * K, 1.5 * K))
    groove = [(x, base(x) - 7 * K) for x in range(x0 + 60 * K, S - 30 * K, 2)]
    img.paste(solid(DARK), (0, 0), stroke(groove, 5 * K, 3 * K))
    fill(stroke([(x, base(x) + 10 * K) for x in range(x0 + 30 * K, S - 50 * K, 2)], 7 * K, 4 * K))
if r >= 3:
    for i, f in enumerate((.08, .26, .44, .62, .8)):
        x = x0 + (x1 - x0) * f; y = base(x) + 10 * K
        fill(stroke(spiral(x, y + 18 * K, 21 * K - i * K, 1.4, -math.pi / 2, 1 if i % 2 else -1), 9 * K, 2.5 * K))
        fill(leaf(x + 14 * K, y + 4 * K, 34 * K, .5 if i % 2 else 2.6, 8 * K))

# 3. left scroll down from the big gem: stem, two curls, a leaf
if r >= 1:
    fill(stroke([(46 * K + 12 * K * math.sin(i / 70 * math.pi), (212 + i * 2.6) * K) for i in range(70)], 28 * K, 14 * K))
    fill(stroke(spiral(90 * K, 420 * K, 58 * K, 1.6, math.pi, -1), 20 * K, 4 * K))
if r >= 2:
    fill(stroke(spiral(118 * K, 250 * K, 26 * K, 1.3, math.pi, 1), 10 * K, 3 * K))
    fill(leaf(60 * K, 300 * K, 60 * K, .9, 12 * K))

# 4. bottom-right: big curl, stems up the right edge and along the bottom edge, leaves
if r >= 1: fill(stroke(spiral(918 * K, 918 * K, 92 * K, 1.7, 0, 1), 28 * K, 5 * K))
if r >= 2:
  fill(stroke([(S - 42 * K - 8 * K * math.sin(i / 60 * math.pi), (700 + i * 3) * K) for i in range(60)], 12 * K, 24 * K))
  fill(stroke([((700 + i * 3) * K, S - 42 * K - 8 * K * math.sin(i / 60 * math.pi)) for i in range(60)], 10 * K, 22 * K))
  if r < 4: fill(leaf(860 * K, 820 * K, 70 * K, -2.2, 14 * K)); fill(leaf(820 * K, 870 * K, 60 * K, 2.6, 12 * K))

# 5. luxury layers (UR): pearl row on the trim, a pendant under the crest centre, filigree down the right edge,
#    and a second gold hairline inside the border
if r >= 4:
    PX = x0 + (x1 - x0) * .44
    for x in range(x0 + 60 * K, S - 80 * K, 26 * K):
        if abs(x - PX) > 40 * K:
            y = base(x) + 10 * K; m, d = mask(); d.ellipse((x - 6 * K, y - 6 * K, x + 6 * K, y + 6 * K), fill=255); fill(m, rim=2)
    py = base(PX) + 10 * K
    fill(stroke([(PX, py), (PX, py + 22 * K)], 8 * K, 5 * K))
    for side in (-1, 1):
        fill(stroke(spiral(PX + side * 26 * K, py + 9 * K, 19 * K, 1.3, math.pi if side > 0 else 0, -side), 11 * K, 3 * K))
        fill(leaf(PX, py + 3 * K, 46 * K, math.pi / 2 + side * 1.1, 9 * K))
    fill(stroke([(S - 46 * K - 10 * K * math.sin(i / 50 * math.pi), (100 + i * 2.6) * K) for i in range(50)], 22 * K, 10 * K))
    fill(stroke(spiral(S - 96 * K, 260 * K, 40 * K, 1.5, 0, 1), 14 * K, 3 * K))
    fill(leaf(S - 60 * K, 190 * K, 54 * K, 2.4, 11 * K))
if r >= 3: m, d = mask(); d.rectangle((b + 6 * K, b + 6 * K, S - b - 6 * K, S - b - 6 * K), outline=255, width=3 * K); fill(m, rim=1)

def gem(cx, cy, r, ring, claws=0, reach=2.1):
    for i in range(claws):  # sunburst claws around the bezel
        a = 2 * math.pi * i / claws + math.pi / claws
        p = [(cx + (r + ring * .6) * math.cos(a - .18), cy + (r + ring * .6) * math.sin(a - .18)),
             (cx + (r + ring * reach) * math.cos(a), cy + (r + ring * reach) * math.sin(a)),
             (cx + (r + ring * .6) * math.cos(a + .18), cy + (r + ring * .6) * math.sin(a + .18))]
        m, d = mask(); d.polygon(p, fill=255); fill(m, rim=3)
    m, d = mask(); d.ellipse((cx - r - ring, cy - r - ring, cx + r + ring, cy + r + ring), fill=255); fill(m)
    m, d = mask(); d.ellipse((cx - r - ring * .45, cy - r - ring * .45, cx + r + ring * .45, cy + r + ring * .45), outline=255, width=max(2, int(ring * .18)))
    img.paste(solid(GOLD[2]), (0, 0), m)
    hi = tuple(min(255, c + 110) for c in COL[0]); lo = tuple(c // 2 for c in COL[1])
    m, d = mask(); d.ellipse((cx - r, cy - r, cx + r, cy + r), fill=255); img.paste(solid(lo), (0, 0), m)
    n = 16
    for i in range(n):
        a0, a1 = 2 * math.pi * i / n, 2 * math.pi * (i + 1) / n
        for r_in, r_out, k in ((.62, .97, 0), (.35, .62, 1)):
            p = [(cx + r_in * r * math.cos(a0 + k * math.pi / n), cy + r_in * r * math.sin(a0 + k * math.pi / n)),
                 (cx + r_out * r * math.cos(a0), cy + r_out * r * math.sin(a0)), (cx + r_out * r * math.cos(a1), cy + r_out * r * math.sin(a1))]
            m, d = mask(); d.polygon(p, fill=255)
            light = .5 + .5 * math.cos((a0 + a1) / 2 + 2.3 + k)
            img.paste(solid(tuple(round(l + (h - l) * light) for l, h in zip(lo, hi if k else COL[0]))), (0, 0), m)
    p = [(cx + .36 * r * math.cos(2 * math.pi * i / 8), cy + .36 * r * math.sin(2 * math.pi * i / 8)) for i in range(8)]
    m, d = mask(); d.polygon(p, fill=255); img.paste(solid(hi), (0, 0), m)
    m, d = mask(); d.ellipse((cx - .55 * r, cy - .66 * r, cx - .1 * r, cy - .36 * r), fill=255)
    img.paste(solid((255, 255, 255)), (0, 0), m.filter(ImageFilter.GaussianBlur(3 * K)))

gem(122 * K, 122 * K, (62, 70, 78, 84, 88)[r] * K, (14, 16, 18, 19, 20)[r] * K, claws=(0, 0, 8, 10, 16)[r], reach=3.4 if r >= 4 else 2.1)  # big gem; UR gets a long sunburst
if r >= 3: gem(966 * K, 58 * K, 32 * K, 11 * K, claws=8)  # round gem, top-right (under the badge)

def small_gems():
    if r < 3: return
    for f in (.2, .36, .52, .68):
        x = x0 + (x1 - x0) * f; gem(x, (top + base(x)) / 2, 11 * K, 5 * K)
    gem(918 * K, 918 * K, 20 * K, 7 * K)
small_gems()
sfx = "" if R == "UR" else f"-{R}"
img.resize((1024, 1024), Image.LANCZOS).save(os.path.join(out, f"template-{t}{sfx}.png"))
img = Image.new("RGBA", (S, S), (0, 0, 0, 0)); small_gems()  # img2img melts small gems, so they are pasted back afterwards
img.resize((1024, 1024), Image.LANCZOS).save(os.path.join(out, f"template-{t}{sfx}-gems.png"))
print("template", t)
