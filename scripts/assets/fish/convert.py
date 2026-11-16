import os, sys
import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage

SRC, OUT = sys.argv[1], sys.argv[2]
WIDTH = 640
TOLERANCE = 22
WORK = 900
SEAL = 3
SEAL_FOR = {}
SMALL_PART = 0.03
TOLERANCE_FOR = {}
FLIP = set(sys.argv[3].split(",")) if len(sys.argv) > 3 and sys.argv[3] else set()

def paper_map(rgb):
    h, w, _ = rgb.shape
    ph, pw = max(4, h // 12), max(4, w // 12)
    corner = lambda ys, xs: np.median(rgb[ys, xs].reshape(-1, 3), axis=0)
    tl, tr = corner(slice(0, ph), slice(0, pw)), corner(slice(0, ph), slice(w - pw, w))
    bl, br = corner(slice(h - ph, h), slice(0, pw)), corner(slice(h - ph, h), slice(w - pw, w))
    u = np.linspace(0, 1, w)[None, :, None]
    v = np.linspace(0, 1, h)[:, None, None]
    return (tl * (1 - u) + tr * u) * (1 - v) + (bl * (1 - u) + br * u) * v

def cut_out(image, slug):
    work = image.convert("RGB")
    scale = WORK / work.width
    small = work.resize((WORK, max(1, round(work.height * scale))), Image.LANCZOS).filter(ImageFilter.MedianFilter(5))
    rgb = np.asarray(small).astype(np.float32)
    ink = np.linalg.norm(rgb - paper_map(rgb), axis=2) > TOLERANCE_FOR.get(slug, TOLERANCE)
    ink = ndimage.binary_opening(ink, iterations=1)
    pieces, n = ndimage.label(ink)
    if n > 1:
        areas = ndimage.sum(ink, pieces, range(1, n + 1))
        ink = np.isin(pieces, 1 + np.flatnonzero(areas >= SMALL_PART * areas.max()))
    seal = SEAL_FOR.get(slug, SEAL)
    margin = seal * 3
    padded = np.pad(ink, margin)
    sealed = ndimage.binary_dilation(padded, iterations=seal)
    open_water, _ = ndimage.label(~sealed)
    rim = np.unique(np.concatenate([open_water[0], open_water[-1], open_water[:, 0], open_water[:, -1]]))
    outside = ndimage.binary_dilation(np.isin(open_water, rim[rim > 0]), iterations=seal + 1)
    subject = ndimage.binary_fill_holes(~outside)[margin:-margin, margin:-margin]
    parts, count = ndimage.label(subject)
    if count == 0:
        return work.convert("RGBA")
    sizes = ndimage.sum(subject, parts, range(1, count + 1))
    keep = parts == (1 + int(np.argmax(sizes)))
    alpha = Image.fromarray((keep * 255).astype(np.uint8)).resize(work.size, Image.LANCZOS).filter(ImageFilter.GaussianBlur(1.2))
    out = work.convert("RGBA")
    out.putalpha(alpha)
    return out.crop(alpha.point(lambda v: 255 if v > 24 else 0).getbbox())

os.makedirs(OUT, exist_ok=True)
for name in sorted(os.listdir(SRC)):
    path = os.path.join(SRC, name)
    if os.path.getsize(path) < 20000:
        print("skip", name)
        continue
    slug = os.path.splitext(name)[0]
    image = cut_out(Image.open(path), slug)
    if slug in FLIP:
        image = image.transpose(Image.FLIP_LEFT_RIGHT)
    image = image.resize((WIDTH, max(1, round(image.height * WIDTH / image.width))), Image.LANCZOS)
    image.save(os.path.join(OUT, slug + ".webp"), quality=84)
    print("ok", slug, image.size)
