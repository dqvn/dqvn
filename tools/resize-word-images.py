#!/usr/bin/env python
"""Shrink every picture in assets/img/words/ to one uniform size.

Each image is center-cropped to a 4:3 box, resized to WIDTH x HEIGHT and saved
as a JPEG (transparent PNGs are flattened onto white). data/images.json is
updated to the new file names (a .png becomes a .jpg).

    python tools/resize-word-images.py              # 256x192, quality 80
    python tools/resize-word-images.py --width 320  # height follows (4:3)

Safe to re-run: files that are already the target size and .jpg are skipped.
The originals are overwritten; if you ever want them back, run
tools/download-word-images.mjs again (after restoring remote URLs in
images.json from git).

Needs Pillow:  python -m pip install pillow
"""
import argparse
import json
import os
import sys

from PIL import Image, ImageOps

ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
DIR = os.path.join(ROOT, "assets", "img", "words")
JSON_FILE = os.path.join(ROOT, "data", "images.json")

ap = argparse.ArgumentParser()
ap.add_argument("--width", type=int, default=256)
ap.add_argument("--quality", type=int, default=80)
args = ap.parse_args()
W = args.width
H = round(W * 3 / 4)


# Sources that will look worse after the resize are reported at the end:
#   low-res  = smaller than the target on either side (gets scaled UP -> soft/blurry)
#   crops    = the 4:3 center crop throws away more than CROP_WARN of the picture
CROP_WARN = 0.55   # a normal 3:4 portrait photo already loses 44%; only flag the extreme ones
warnings = []


def check_source(name, w, h):
    if w < W or h < H:
        warnings.append((0, f"low-res  {w}x{h}  {name}"))
    ar = w / h
    lost = 1 - min(ar, W / H) / max(ar, W / H)
    if lost > CROP_WARN:
        warnings.append((1, f"crops {lost:.0%}  {w}x{h}  {name}"))


def process(path):
    """Return the new file name (basename), or None if the image can't be read."""
    base, ext = os.path.splitext(path)
    new = base + ".jpg"
    try:
        with Image.open(path) as im:
            if ext.lower() == ".jpg" and im.size == (W, H):
                return os.path.basename(path)          # already done
            im = ImageOps.exif_transpose(im)           # respect camera rotation
            check_source(os.path.basename(path), im.width, im.height)
            if im.mode in ("RGBA", "LA", "P"):
                im = im.convert("RGBA")
                bg = Image.new("RGB", im.size, (255, 255, 255))
                bg.paste(im, mask=im.split()[-1])
                im = bg
            else:
                im = im.convert("RGB")
            # fit() = scale to cover the W x H box, then crop the overflow equally
            # from both sides (centering=(0.5, 0.5) -> true center crop)
            im = ImageOps.fit(im, (W, H), Image.LANCZOS, centering=(0.5, 0.5))
            tmp = new + ".tmp"
            im.save(tmp, format="JPEG", quality=args.quality, optimize=True, progressive=True)
    except Exception as e:
        print("  cannot read", os.path.basename(path), "-", e)
        return None
    if path != new:
        os.remove(path)
    os.replace(tmp, new)
    return os.path.basename(new)


renamed = {}
files = sorted(os.listdir(DIR))
before = sum(os.path.getsize(os.path.join(DIR, f)) for f in files)
for n, f in enumerate(files, 1):
    out = process(os.path.join(DIR, f))
    if out:
        renamed[f] = out
    if n % 500 == 0:
        print(f"  {n}/{len(files)}")

with open(JSON_FILE, encoding="utf-8") as fh:
    images = json.load(fh)
for urls in images.values():
    for i, u in enumerate(urls):
        name = os.path.basename(u)
        if u.startswith("assets/img/words/") and name in renamed:
            urls[i] = "assets/img/words/" + renamed[name]
with open(JSON_FILE, "w", encoding="utf-8") as fh:
    json.dump(images, fh, ensure_ascii=False, indent=1)
    fh.write("\n")

if warnings:
    print(f"\n{len(warnings)} source(s) worth a look before committing (shown on the page as 256x{H}):")
    for _, line in sorted(warnings)[:60]:
        print("  " + line)
    if len(warnings) > 60:
        print(f"  ... and {len(warnings) - 60} more")

after = sum(os.path.getsize(os.path.join(DIR, f)) for f in os.listdir(DIR))
print(f"{len(renamed)}/{len(files)} images -> {W}x{H} jpg; {before/1e6:.0f} MB -> {after/1e6:.0f} MB")
