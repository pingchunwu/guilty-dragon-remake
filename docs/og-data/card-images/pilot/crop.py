# Cuts the OG frame (border, orb, stars) off each OG image and upscales the art to a 1024 square for img2img.
import glob, os
from PIL import Image, ImageFilter, ImageOps
for f in glob.glob("og/*.webp"):
    im = Image.open(f).convert("RGB"); w, h = im.size
    s = int(w * .82); x, y = int(w * .09), int(h * .12)
    im = im.crop((x, y, x + s, y + s)).resize((1024, 1024), Image.LANCZOS)
    # hide the top-left orb: paste a blurred mirror of the strip to its right
    bw, bh = 230, 190
    patch = ImageOps.mirror(im.crop((bw, 0, 2 * bw, bh))).filter(ImageFilter.GaussianBlur(14))
    im.paste(patch, (0, 0))
    im.save("og-crop/" + os.path.basename(f)[:-5] + ".png")
