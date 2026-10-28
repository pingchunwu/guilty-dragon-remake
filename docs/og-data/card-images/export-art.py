"""Export generated card art (<dir>/art/<card id>.png) to the game as 512 px webp."""
import glob, os, sys
from PIL import Image

src, dst = sys.argv[1], "../../../apps/web/public/cards"
os.makedirs(dst, exist_ok=True)
for f in glob.glob(f"{src}/art/og-*.png"):
    Image.open(f).convert("RGB").resize((512, 512), Image.LANCZOS).save(
        f"{dst}/{os.path.basename(f)[:-4]}.webp", quality=85)
print(len(os.listdir(dst)), "cards in", dst)
