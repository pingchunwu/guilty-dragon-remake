# Lift shadows/midtones of picked images so restyling starts from a brighter frame.
import sys
from PIL import Image, ImageEnhance
src, dst = sys.argv[1], sys.argv[2]
im = Image.open(src).convert("RGB")
lut = [round(255 * (i / 255) ** (1 / 1.45)) for i in range(256)]
im = im.point(lut * 3)
im = ImageEnhance.Color(im).enhance(1.1)
im.save(dst)
