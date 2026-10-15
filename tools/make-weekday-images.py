#!/usr/bin/env python
"""Generate the pictures for the weekday words (maandag ... zondag).

Photos of "Monday" are meaningless, so each word gets a small week-strip card:
the seven days Ma-Zo in a row with the target day highlighted (weekend days use
a different colour), the Dutch name in the middle and the English name below.
Writes 256x192 JPEGs into assets/img/words/ and updates data/images.json.

    python tools/make-weekday-images.py

Needs Pillow and the Windows Arial fonts (falls back to PIL's built-in font).
"""
import json
import os
import re
import unicodedata

from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
DIR = os.path.join(ROOT, "assets", "img", "words")
JSON_FILE = os.path.join(ROOT, "data", "images.json")
W, H = 256, 192

DAYS = [  # (dutch, abbreviation, english)
    ("maandag", "Ma", "Monday"), ("dinsdag", "Di", "Tuesday"), ("woensdag", "Wo", "Wednesday"),
    ("donderdag", "Do", "Thursday"), ("vrijdag", "Vr", "Friday"), ("zaterdag", "Za", "Saturday"),
    ("zondag", "Zo", "Sunday"),
]
# images.json keys that should show each day's card (the lesson spelling can differ)
KEYS = {"zaterdag": ["zaterdag", "de zaterdag - zaterdagen"]}


def font(bold, size):
    for name in (("arialbd.ttf" if bold else "arial.ttf"), "calibrib.ttf" if bold else "calibri.ttf"):
        try:
            return ImageFont.truetype(name, size)
        except OSError:
            pass
    return ImageFont.load_default()


def slug(s):
    s = unicodedata.normalize("NFD", s)
    s = "".join(c for c in s if not unicodedata.combining(c)).lower()
    return re.sub(r"[^a-z0-9]+", "-", s).strip("-") or "word"


def card(idx):
    dutch, _, english = DAYS[idx]
    im = Image.new("RGB", (W, H), "#f8fafc")
    d = ImageDraw.Draw(im)
    cell, gap = 30, 4
    x0 = (W - (7 * cell + 6 * gap)) // 2
    for i, (_, ab, _) in enumerate(DAYS):
        weekend = i >= 5
        base = "#fed7aa" if weekend else "#dbeafe"
        ink = "#9a3412" if weekend else "#1e40af"
        fill, txt = (("#ea580c" if weekend else "#2563eb"), "white") if i == idx else (base, ink)
        x = x0 + i * (cell + gap)
        d.rounded_rectangle([x, 22, x + cell, 22 + 34], radius=7, fill=fill)
        f = font(True, 15)
        tw = d.textlength(ab, font=f)
        d.text((x + (cell - tw) / 2, 30), ab, fill=txt, font=f)
    # big Dutch name
    size = 38
    f = font(True, size)
    while d.textlength(dutch, font=f) > W - 24 and size > 18:
        size -= 2
        f = font(True, size)
    tw = d.textlength(dutch, font=f)
    d.text(((W - tw) / 2, 82), dutch, fill="#0f172a", font=f)
    # English name
    f2 = font(False, 20)
    tw = d.textlength(english, font=f2)
    d.text(((W - tw) / 2, 140), english, fill="#475569", font=f2)
    return im


with open(JSON_FILE, encoding="utf-8") as fh:
    images = json.load(fh)

for idx, (dutch, _, _) in enumerate(DAYS):
    rel = "assets/img/words/" + slug(dutch) + ".jpg"
    card(idx).save(os.path.join(ROOT, rel), "JPEG", quality=88, optimize=True)
    for key in KEYS.get(dutch, [dutch]):
        images[key] = ["assets/img/words/" + slug(key) + ".jpg" if key != dutch else rel]
        if key != dutch:   # extra spelling -> its own copy so each key keeps a unique file
            card(idx).save(os.path.join(ROOT, images[key][0]), "JPEG", quality=88, optimize=True)
    print(dutch, "->", rel)

with open(JSON_FILE, "w", encoding="utf-8") as fh:
    json.dump(images, fh, ensure_ascii=False, indent=1)
    fh.write("\n")
