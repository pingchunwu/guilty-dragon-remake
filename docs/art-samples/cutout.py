"""Turns raw comfy-parts.mjs output into transparent PNG parts.
Usage: python cutout.py <rawDir> <outDir>
frame-*: keeps the outer border band, hole in the middle.  gem/icon/star-*: flood-fills the black background from the edges, crops to the part."""
import sys, glob, os
from PIL import Image, ImageDraw, ImageFilter, ImageChops

raw, out = sys.argv[1:3]
os.makedirs(out, exist_ok=True)

BAND = {'N': .065, 'R': .075, 'SR': .09, 'SSR': .105, 'UR': .125}  # richer frames are thicker

def frame(im, rarity):
    w, h = im.size
    band = round(w * BAND[rarity])
    mask = Image.new("L", im.size, 255)
    ImageDraw.Draw(mask).rounded_rectangle((band, band, w - band, h - band), radius=round(w * 0.02), fill=0)
    im = im.convert("RGBA"); im.putalpha(mask.filter(ImageFilter.GaussianBlur(1.2)))
    return im

def keyed(im, tol=28):
    im = im.convert("RGB")
    # near-black pixels connected to the image edge are background
    near = im.convert("L").point(lambda v: 255 if v <= tol else 0)
    bg = near.convert("RGB")
    for xy in [(0, 0), (im.width - 1, 0), (0, im.height - 1), (im.width - 1, im.height - 1), (im.width // 2, 0), (im.width // 2, im.height - 1), (0, im.height // 2), (im.width - 1, im.height // 2)]:
        if bg.getpixel(xy) == (255, 255, 255): ImageDraw.floodfill(bg, xy, (255, 0, 0))
    r = bg.split()[0]; g = bg.split()[1]
    background = ImageChops.subtract(r, g)  # red-only pixels = flooded background
    alpha = ImageChops.invert(background.point(lambda v: 255 if v > 100 else 0)).filter(ImageFilter.GaussianBlur(.8))
    im = im.convert("RGBA"); im.putalpha(alpha)
    return im.crop(im.getbbox() or (0, 0, *im.size))

for f in sorted(glob.glob(os.path.join(raw, "*.png"))):
    name = os.path.basename(f)
    if name == "contact.png": continue
    im = Image.open(f)
    (frame(im, name.split('-')[1]) if name.startswith("frame") else keyed(im)).save(os.path.join(out, name))
    print("cut", name)
