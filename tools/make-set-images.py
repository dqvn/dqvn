#!/usr/bin/env python
"""Generate pictures for word sets that photos explain badly: months, seasons, colours.

  months   a 6x2 year grid (colour-coded by season) with the target month highlighted
  seasons  four season tiles with the target season highlighted + its months
  colours  a plain colour swatch

Every lesson spelling gets its own file (e.g. "zomer", "zomer, de", "de zomer"), because
images.json is keyed by the exact Dutch string. Writes 256x192 JPEGs to assets/img/words/
and updates data/images.json.

    python tools/make-set-images.py

Needs Pillow and the Windows Arial fonts (falls back to PIL's built-in font).
"""
import json
import os
import re
import unicodedata

from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
DIR = os.path.join(ROOT, "assets", "img", "words")
VOC = os.path.join(ROOT, "data", "vocabularies")
JSON_FILE = os.path.join(ROOT, "data", "images.json")
W, H = 256, 192

# season index: 0 winter, 1 spring, 2 summer, 3 autumn   (strong colour, light tint, dark ink)
SEASON_COL = [("#2563eb", "#dbeafe", "#1e3a8a"), ("#16a34a", "#dcfce7", "#14532d"),
              ("#f59e0b", "#fef3c7", "#78350f"), ("#b45309", "#fde8d0", "#7c2d12")]

MONTHS = [  # dutch, abbreviation, english, season
    ("januari", "jan", "January", 0), ("februari", "feb", "February", 0), ("maart", "mrt", "March", 1),
    ("april", "apr", "April", 1), ("mei", "mei", "May", 1), ("juni", "jun", "June", 2),
    ("juli", "jul", "July", 2), ("augustus", "aug", "August", 2), ("september", "sep", "September", 3),
    ("oktober", "okt", "October", 3), ("november", "nov", "November", 3), ("december", "dec", "December", 0),
]
SEASONS = [  # dutch, abbreviation, english, season index, months
    ("winter", "win", "Winter", 0, "dec - feb"), ("lente", "len", "Spring", 1, "mrt - mei"),
    ("zomer", "zom", "Summer", 2, "jun - aug"), ("herfst", "her", "Autumn", 3, "sep - nov"),
]
COLOURS = {  # dutch -> (english, hex)
    "rood": ("Red", "#dc2626"), "blauw": ("Blue", "#2563eb"), "groen": ("Green", "#16a34a"),
    "geel": ("Yellow", "#facc15"), "oranje": ("Orange", "#f97316"), "zwart": ("Black", "#111827"),
    "wit": ("White", "#ffffff"), "grijs": ("Grey", "#9ca3af"), "bruin": ("Brown", "#8b5a2b"),
    "roze": ("Pink", "#f472b6"), "paars": ("Purple", "#9333ea"),
}


def font(bold, size):
    for name in (("arialbd.ttf" if bold else "arial.ttf"), ("calibrib.ttf" if bold else "calibri.ttf")):
        try:
            return ImageFont.truetype(name, size)
        except OSError:
            pass
    return ImageFont.load_default()


def slug(s):
    s = unicodedata.normalize("NFD", s)
    s = "".join(c for c in s if not unicodedata.combining(c)).lower()
    return re.sub(r"[^a-z0-9]+", "-", s).strip("-") or "word"


def centered(d, text, y, f, fill):
    d.text(((W - d.textlength(text, font=f)) / 2, y), text, fill=fill, font=f)


def fit_font(d, text, max_w, size, bold=True):
    f = font(bold, size)
    while d.textlength(text, font=f) > max_w and size > 16:
        size -= 2
        f = font(bold, size)
    return f


def month_card(idx):
    dutch, _, english, _ = MONTHS[idx]
    im = Image.new("RGB", (W, H), "#f8fafc")
    d = ImageDraw.Draw(im)
    cw, ch, gx, gy = 36, 28, 4, 5
    x0 = (W - (6 * cw + 5 * gx)) // 2
    for i, (_, ab, _, s) in enumerate(MONTHS):
        strong, tint, ink = SEASON_COL[s]
        on = i == idx
        x, y = x0 + (i % 6) * (cw + gx), 14 + (i // 6) * (ch + gy)
        d.rounded_rectangle([x, y, x + cw, y + ch], radius=6, fill=strong if on else tint)
        f = font(True, 13)
        d.text((x + (cw - d.textlength(ab, font=f)) / 2, y + 6), ab, fill="white" if on else ink, font=f)
    centered(d, dutch, 84, fit_font(d, dutch, W - 24, 38), "#0f172a")
    centered(d, english, 140, font(False, 20), "#475569")
    return im


def season_card(idx):
    dutch, _, english, s, months = SEASONS[idx]
    im = Image.new("RGB", (W, H), "#f8fafc")
    d = ImageDraw.Draw(im)
    tw, th, gap = 56, 34, 6
    x0 = (W - (4 * tw + 3 * gap)) // 2
    for i, (_, ab, _, si, _) in enumerate(SEASONS):
        strong, tint, ink = SEASON_COL[si]
        on = i == idx
        x = x0 + i * (tw + gap)
        d.rounded_rectangle([x, 18, x + tw, 18 + th], radius=8, fill=strong if on else tint)
        f = font(True, 14)
        d.text((x + (tw - d.textlength(ab, font=f)) / 2, 18 + 9), ab, fill="white" if on else ink, font=f)
    centered(d, dutch, 72, fit_font(d, dutch, W - 24, 40), SEASON_COL[s][2])
    centered(d, english + "  (" + months + ")", 126, font(False, 19), "#475569")
    return im


def colour_card(name):
    english, hexv = COLOURS[name]
    im = Image.new("RGB", (W, H), "white")
    d = ImageDraw.Draw(im)
    d.rounded_rectangle([14, 12, W - 14, 124], radius=16, fill=hexv, outline="#cbd5e1", width=2)
    centered(d, name, 130, fit_font(d, name, W - 24, 30), "#0f172a")
    return im


def clean(dutch):
    c = re.sub(r"^(de|het|een)\s+", "", dutch.strip().lower())
    return re.split(r"[,(-]", c)[0].strip()


# collect every lesson spelling that belongs to one of the sets
keys = {}
for fn in sorted(os.listdir(VOC)):
    if not fn.endswith(".json"):
        continue
    try:
        data = json.load(open(os.path.join(VOC, fn), encoding="utf-8"))
    except Exception:
        continue
    if isinstance(data, list):
        for e in data:
            if isinstance(e, dict) and e.get("dutch"):
                keys.setdefault(e["dutch"], clean(e["dutch"]))

month_names = [m[0] for m in MONTHS]
season_names = [s[0] for s in SEASONS]
with open(JSON_FILE, encoding="utf-8") as fh:
    images = json.load(fh)

made = 0
for key, c in keys.items():
    if c in month_names:
        im = month_card(month_names.index(c))
    elif c in season_names:
        im = season_card(season_names.index(c))
    elif c in COLOURS:
        im = colour_card(c)
    else:
        continue
    rel = "assets/img/words/" + slug(key) + ".jpg"
    im.save(os.path.join(ROOT, rel), "JPEG", quality=88, optimize=True)
    images[key] = [rel]
    made += 1
    print(f"{key:28} -> {rel}")

with open(JSON_FILE, "w", encoding="utf-8") as fh:
    json.dump(images, fh, ensure_ascii=False, indent=1)
    fh.write("\n")
print(made, "pictures")
