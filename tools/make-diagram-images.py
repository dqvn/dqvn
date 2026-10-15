#!/usr/bin/env python
"""Draw small diagram cards for words a photo can't explain.

  prepositions  ball + box diagrams (op, in, onder, boven, achter, voor, tussen, ...)
  ordinals      a row of numbered circles with the n-th highlighted (zesde ... tiende)
  pronouns      stick figures: who is meant (ik, jij, hij, zij, wij, jullie, ze/hen, u, het)
  opposites     the word's quality drawn next to its opposite (klein/groot, lang/kort, ...)

Only words that currently have NO picture in data/images.json (and no emoji hint) are
drawn, so existing photos are never overwritten. Each lesson spelling gets its own
256x192 JPEG in assets/img/words/ and an entry in data/images.json.

    python tools/make-diagram-images.py            # draw the missing ones
    python tools/make-diagram-images.py --force    # redraw even if a picture exists
    python tools/make-diagram-images.py --list     # just list what would be drawn

Needs Pillow and the Windows Arial fonts (falls back to PIL's built-in font).
"""
import json
import os
import re
import sys
import unicodedata

from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
VOC = os.path.join(ROOT, "data", "vocabularies")
JSON_FILE = os.path.join(ROOT, "data", "images.json")
HINTS_FILE = os.path.join(ROOT, "data", "image-hints.json")
W, H = 256, 192
DIAG_H = 122   # diagram area: y 0..DIAG_H, text below

BLUE, ORANGE, GREY, LGREY, INK, SUB = "#2563eb", "#f97316", "#94a3b8", "#e2e8f0", "#0f172a", "#475569"
PINK, GREEN, BG = "#ec4899", "#16a34a", "#f8fafc"


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


def clean(dutch):
    c = re.sub(r"^(de|het|een)\s+", "", dutch.strip().lower())
    return re.split(r"[,(]", c)[0].strip()


def fit(d, text, max_w, size, bold=True, lo=14):
    f = font(bold, size)
    while d.textlength(text, font=f) > max_w and size > lo:
        size -= 2
        f = font(bold, size)
    return f


def caption(d, dutch, english):
    f = fit(d, dutch, W - 20, 34)
    d.text(((W - d.textlength(dutch, font=f)) / 2, 124), dutch, fill=INK, font=f)
    eng = re.split(r"[/(]", english)[0].strip()[:30]
    f2 = fit(d, eng, W - 20, 18, bold=False)
    d.text(((W - d.textlength(eng, font=f2)) / 2, 164), eng, fill=SUB, font=f2)


# ───────────────────────── drawing primitives ─────────────────────────
def ball(d, cx, cy, r=12, fill=ORANGE):
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=fill, outline="#c2410c", width=2)


def box(d, x0, y0, x1, y1, fill=BLUE, outline="#1e3a8a"):
    d.rounded_rectangle([x0, y0, x1, y1], radius=6, fill=fill, outline=outline, width=2)


def arrow(d, x0, y0, x1, y1, fill=INK, w=4, head=11):
    import math
    d.line([x0, y0, x1, y1], fill=fill, width=w)
    a = math.atan2(y1 - y0, x1 - x0)
    for s in (-0.5, 0.5):
        d.line([x1, y1, x1 - head * math.cos(a + s), y1 - head * math.sin(a + s)], fill=fill, width=w)


def dashed(d, x0, y0, x1, y1, fill=GREY, w=3, step=8):
    import math
    L = math.hypot(x1 - x0, y1 - y0)
    n = max(1, int(L // step))
    for i in range(0, n, 2):
        t0, t1 = i / n, min(1, (i + 1) / n)
        d.line([x0 + (x1 - x0) * t0, y0 + (y1 - y0) * t0, x0 + (x1 - x0) * t1, y0 + (y1 - y0) * t1], fill=fill, width=w)


def ground(d, y=100):
    d.line([20, y, W - 20, y], fill=GREY, width=3)


# ───────────────────────── prepositions ─────────────────────────
def prep(kind, d):
    cx, base = 128, 100   # box sits on the ground line
    bx0, bx1, by0 = cx - 36, cx + 36, base - 44
    ground(d, base)
    if kind == "op":
        box(d, bx0, by0, bx1, base); ball(d, cx, by0 - 12)
    elif kind == "boven":
        box(d, bx0, by0 + 20, bx1, base); ball(d, cx, by0 - 8); arrow(d, cx, by0 + 6, cx, by0 + 16, GREY, 3, 8)
    elif kind == "beneden":
        box(d, bx0, by0 - 8, bx1, base - 28); ball(d, cx, base - 12)
    elif kind in ("in", "binnen"):
        d.rounded_rectangle([bx0, by0, bx1, base], 6, fill="#dbeafe", outline="#1e3a8a", width=3)
        ball(d, cx, base - 14)
    elif kind == "buiten":
        d.rounded_rectangle([bx0 - 30, by0, bx1 - 30, base], 6, fill="#dbeafe", outline="#1e3a8a", width=3)
        ball(d, bx1 + 14, base - 12)
    elif kind == "achter":
        ball(d, cx + 34, base - 20, 14); box(d, bx0 - 20, by0 + 6, bx1 - 22, base)
    elif kind == "voor":
        box(d, bx0, by0, bx1, base - 4); ball(d, cx + 4, base - 12 + 2)
        ball(d, cx + 4, base - 10)
    elif kind == "tussen":
        box(d, 40, by0, 90, base); box(d, 166, by0, 216, base); ball(d, 128, base - 12)
        arrow(d, 112, base - 12, 98, base - 12, GREY, 3, 8); arrow(d, 144, base - 12, 158, base - 12, GREY, 3, 8)
    elif kind == "bij":
        box(d, bx0 - 24, by0, bx1 - 24, base); ball(d, bx1 - 4, base - 12)
    elif kind == "langs":
        box(d, 50, by0, 206, base - 10, fill="#dbeafe")
        dashed(d, 30, base + 6, 226, base + 6); ball(d, 150, base + 2, 9); arrow(d, 170, base + 2, 216, base + 2, INK, 4, 10)
    elif kind == "door":
        box(d, 40, 14, 100, base - 10); box(d, 156, 14, 216, base - 10)
        d.rectangle([100, 10, 156, base - 6], fill=BG)
        arrow(d, 20, 62, 236, 62, ORANGE, 6, 16)
    elif kind == "tegen":
        box(d, 150, 18, 176, base, fill=GREY, outline="#475569"); ball(d, 138, base - 12)
        arrow(d, 98, base - 12, 124, base - 12, INK, 4, 10)
    elif kind == "naar":
        ball(d, 52, base - 12); box(d, 160, by0, 220, base)
        arrow(d, 74, base - 12, 150, base - 12, INK, 5, 12)
    elif kind == "uit":
        d.rounded_rectangle([40, by0, 112, base], 6, fill="#dbeafe", outline="#1e3a8a", width=3)
        ball(d, 192, base - 12); arrow(d, 100, base - 22, 168, base - 12, INK, 5, 12)
    elif kind == "van":
        box(d, 40, by0, 100, base); ball(d, 196, base - 12); arrow(d, 112, base - 12, 172, base - 12, INK, 5, 12)
    elif kind == "met":
        box(d, 70, by0 + 6, 130, base); ball(d, 168, base - 12)
        d.text((136, base - 42), "+", fill=INK, font=font(True, 34))
    elif kind == "dichtbij":
        ball(d, 108, 60, 16, BLUE); ball(d, 142, 60, 16, ORANGE)
    elif kind == "ver":
        ball(d, 36, 60, 14, BLUE); ball(d, 220, 60, 14, ORANGE)
        dashed(d, 56, 60, 200, 60, INK, 4, 10)


PREP = {"op": "op", "in": "in", "onder": "onder", "boven": "boven", "beneden": "beneden", "achter": "achter",
        "voor": "voor", "tussen": "tussen", "bij": "bij", "binnen": "binnen", "buiten": "buiten", "langs": "langs",
        "door": "door", "tegen": "tegen", "naar": "naar", "uit": "uit", "van": "van", "met": "met",
        "dichtbij": "dichtbij", "ver": "ver", "verre": "ver"}


def prep_under(d):  # onder: ball below a raised box
    ground(d, 100)
    box(d, 92, 28, 164, 66)
    ball(d, 128, 88)


# ───────────────────────── ordinals ─────────────────────────
ORD = {"eerste": 1, "tweede": 2, "derde": 3, "vierde": 4, "vijfde": 5, "zesde": 6, "zevende": 7,
       "achtste": 8, "negende": 9, "tiende": 10}


def ordinal(n, d):
    r, gap = 10, 4
    x0 = (W - (10 * 2 * r + 9 * gap)) // 2 + r
    f = font(True, 12)
    for i in range(10):
        cx, cy = x0 + i * (2 * r + gap), 28
        on = i + 1 == n
        d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=ORANGE if on else (BLUE if i + 1 < n else LGREY))
        t = str(i + 1)
        d.text((cx - d.textlength(t, font=f) / 2, cy - 7), t, fill="white" if (on or i + 1 < n) else GREY, font=f)
    big = font(True, 54)
    t = f"{n}e"
    d.text(((W - d.textlength(t, font=big)) / 2, 50), t, fill=ORANGE, font=big)


def next_card(d):
    for i in range(4):
        x = 28 + i * 52
        box(d, x, 44, x + 40, 84, fill=BLUE if i == 1 else (ORANGE if i == 2 else LGREY),
            outline="#1e3a8a" if i == 1 else ("#c2410c" if i == 2 else GREY))
    arrow(d, 98, 104, 128, 104, INK, 4, 10)
    d.text((86, 18), "nu", fill=BLUE, font=font(True, 18))
    d.text((124, 18), "volgende", fill=ORANGE, font=font(True, 18))


# ───────────────────────── pronouns ─────────────────────────
def person(d, cx, cy, color, kind="m", s=1.0, tie=False):
    hr = int(11 * s)
    d.ellipse([cx - hr, cy - hr, cx + hr, cy + hr], fill=color)
    top, bot = cy + hr + 2, cy + hr + int(34 * s)
    if kind == "f":
        d.polygon([(cx, top), (cx - int(16 * s), bot), (cx + int(16 * s), bot)], fill=color)
    else:
        d.rounded_rectangle([cx - int(12 * s), top, cx + int(12 * s), bot], radius=5, fill=color)
    if tie:
        d.polygon([(cx - 4, top + 2), (cx + 4, top + 2), (cx, top + 16)], fill="white")


def pronoun(kind, d):
    me, other = GREY, GREY
    if kind == "ik":
        person(d, 128, 34, ORANGE, "m", 1.2)
        d.polygon([(128, 112), (116, 100), (140, 100)], fill=ORANGE)   # points at themselves
    elif kind == "jij":
        person(d, 70, 44, GREY, "m"); person(d, 186, 44, ORANGE, "m"); arrow(d, 98, 62, 154, 62, INK, 3, 9)
    elif kind == "u":
        person(d, 70, 44, GREY, "m"); person(d, 186, 44, ORANGE, "m", tie=True); arrow(d, 98, 62, 154, 62, INK, 3, 9)
    elif kind == "hij":
        person(d, 128, 38, BLUE, "m", 1.2)
    elif kind == "zij":
        person(d, 128, 38, PINK, "f", 1.2)
    elif kind == "wij":
        person(d, 80, 40, ORANGE); person(d, 128, 40, ORANGE); person(d, 176, 40, ORANGE)
        d.rounded_rectangle([54, 26, 202, 112], 14, outline=ORANGE, width=3)
    elif kind == "jullie":
        person(d, 40, 50, GREY); arrow(d, 62, 66, 104, 66, INK, 3, 9)
        for x in (136, 176, 216):
            person(d, x, 44, ORANGE)
    elif kind == "zij_pl":
        person(d, 40, 50, GREY); arrow(d, 62, 66, 100, 66, INK, 3, 9)
        person(d, 140, 44, BLUE, "m"); person(d, 182, 44, PINK, "f"); person(d, 224, 44, BLUE, "m")
    elif kind == "het":
        box(d, 92, 30, 164, 100, fill=GREEN, outline="#14532d")
        d.text((112, 44), "het", fill="white", font=font(True, 30))


# base word (and every lesson spelling) -> card kind
PRON = {"ik": "ik", "mij": "ik", "me": "ik", "mijn": "ik",
        "jij": "jij", "je": "jij", "jou": "jij", "jouw": "jij", "u": "u", "uw": "u",
        "hij": "hij", "hem": "hij", "zij": "zij", "ze": "zij", "haar": "zij",
        "wij": "wij", "we": "wij", "ons": "wij", "onze": "wij", "jullie": "jullie",
        "hen": "zij_pl", "hun": "zij_pl", "het": "het"}


# ───────────────────────── opposites ─────────────────────────
def pair(kind, side, d):
    """side 0 = target is the first word of the pair, 1 = second. Highlight the target."""
    a, b = ORANGE if side == 0 else LGREY, ORANGE if side == 1 else LGREY
    ol_a = "#c2410c" if side == 0 else GREY
    ol_b = "#c2410c" if side == 1 else GREY
    if kind == "klein-groot":
        d.ellipse([40, 62, 80, 102], fill=a, outline=ol_a, width=2); d.ellipse([112, 14, 214, 116], fill=b, outline=ol_b, width=2)
    elif kind == "kort-lang":
        d.rounded_rectangle([28, 34, 90, 54], 8, fill=a, outline=ol_a, width=2)
        d.rounded_rectangle([28, 74, 228, 94], 8, fill=b, outline=ol_b, width=2)
    elif kind == "dun-dik":
        d.rounded_rectangle([24, 36, 232, 44], 4, fill=a, outline=ol_a, width=2)
        d.rounded_rectangle([24, 68, 232, 100], 10, fill=b, outline=ol_b, width=2)
    elif kind == "laag-hoog":
        ground(d, 114)
        d.rounded_rectangle([60, 78, 100, 114], 4, fill=a, outline=ol_a, width=2)
        d.rounded_rectangle([156, 12, 196, 114], 4, fill=b, outline=ol_b, width=2)
    elif kind == "smal-breed":
        d.rounded_rectangle([40, 28, 70, 100], 6, fill=a, outline=ol_a, width=2)
        d.rounded_rectangle([104, 28, 224, 100], 6, fill=b, outline=ol_b, width=2)
    elif kind == "ondiep-diep":
        for (x0, depth, fill, ol) in ((24, 24, a, ol_a), (136, 90, b, ol_b)):
            d.rectangle([x0, 14, x0 + 96, 114], outline=INK, width=3)
            d.rectangle([x0 + 2, 114 - depth, x0 + 94, 112], fill="#93c5fd" if fill == ORANGE else "#e0f2fe")
            d.line([x0 + 2, 114 - depth, x0 + 94, 114 - depth], fill=BLUE if fill == ORANGE else GREY, width=3)
        # highlight frame
        x0 = 24 if side == 0 else 136
        d.rectangle([x0 - 4, 10, x0 + 100, 118], outline=ORANGE, width=3)
    elif kind == "weinig-veel":
        import random
        random.seed(3)
        for (x0, n, col, ol) in ((20, 3, a, ol_a), (112, 18, b, ol_b)):
            for i in range(n):
                cx = x0 + 14 + (i % 6) * 18 if n > 6 else x0 + 24 + i * 24
                cy = 30 + (i // 6) * 22 if n > 6 else 64
                d.ellipse([cx - 7, cy - 7, cx + 7, cy + 7], fill=col, outline=ol, width=2)
    elif kind == "leeg-vol":
        for (cx, filled, col, ol) in ((72, False, a, ol_a), (184, True, b, ol_b)):
            d.polygon([(cx - 30, 14), (cx + 30, 14), (cx + 22, 110), (cx - 22, 110)], outline=ol if col != LGREY else GREY, fill=None, width=3)
            if filled:
                d.polygon([(cx - 29, 30), (cx + 29, 30), (cx + 22, 108), (cx - 22, 108)], fill="#93c5fd")
    elif kind == "warm-heet":
        pass
    elif kind == "goedkoop-duur":
        for (x0, t, col, ol) in ((22, "€1", a, ol_a), (136, "€999", b, ol_b)):
            d.rounded_rectangle([x0, 30, x0 + 98, 90], 10, fill=col, outline=ol, width=2)
            d.ellipse([x0 + 10, 54, x0 + 22, 66], fill=BG)
            f = fit(d, t, 70, 28)
            d.text((x0 + 30, 44), t, fill=INK if col == LGREY else "white", font=f)
    elif kind == "dichtbij-ver":
        for (y, dist, col, ol) in ((36, 30, a, ol_a), (84, 160, b, ol_b)):
            x1 = 40
            d.ellipse([x1 - 12, y - 12, x1 + 12, y + 12], fill=BLUE)
            d.ellipse([x1 + dist - 12 + 20, y - 12, x1 + dist + 12 + 20, y + 12], fill=col, outline=ol, width=2)
            dashed(d, x1 + 14, y, x1 + dist + 6, y, GREY, 3, 8)
    elif kind == "nat-droog":
        if side == 0:
            for (cx, cy) in ((70, 54), (128, 76), (186, 50)):
                d.polygon([(cx, cy - 26), (cx - 14, cy + 4), (cx + 14, cy + 4)], fill=BLUE)
                d.ellipse([cx - 14, cy - 8, cx + 14, cy + 20], fill=BLUE)
        else:
            d.ellipse([88, 22, 168, 102], fill="#facc15", outline="#a16207", width=3)
            import math
            for k in range(12):
                an = k * math.pi / 6
                d.line([128 + 50 * math.cos(an), 62 + 50 * math.sin(an), 128 + 62 * math.cos(an), 62 + 62 * math.sin(an)], fill="#f59e0b", width=4)
    elif kind == "zwaar-licht":
        pass


def thermometer(level, d):
    # cold (left, small) vs target (right)
    for (cx, lv, col) in ((72, 0.15, "#60a5fa"), (184, level, "#ef4444")):
        d.rounded_rectangle([cx - 10, 8, cx + 10, 90], 10, outline=INK, width=3, fill="white")
        d.ellipse([cx - 20, 84, cx + 20, 124], fill=col, outline=INK, width=3)
        top = 90 - int(70 * lv)
        d.rectangle([cx - 5, top, cx + 5, 96], fill=col)
    d.text((58, 100), "", fill=INK)


def balance(d, side):
    # tilted beam: target side is the heavy one (lower) for "zwaar"
    d.polygon([(128, 108), (112, 122), (144, 122)], fill=GREY)
    d.line([128, 108, 128, 56], fill=GREY, width=4)
    d.line([64, 40, 192, 72], fill=INK, width=5)   # left high, right low
    d.rectangle([158, 72, 226, 100], fill=ORANGE, outline="#c2410c", width=2)
    d.text((176, 76), "kg", fill="white", font=font(True, 18))
    d.ellipse([56, 20, 80, 44], fill=LGREY, outline=GREY, width=2)


# words -> (kind, side)
OPP = {
    "klein": ("klein-groot", 0), "groot": ("klein-groot", 1), "kort": ("kort-lang", 0), "lang": ("kort-lang", 1),
    "dun": ("dun-dik", 0), "dik": ("dun-dik", 1), "laag": ("laag-hoog", 0), "hoog": ("laag-hoog", 1),
    "smal": ("smal-breed", 0), "breed": ("smal-breed", 1), "ondiep": ("ondiep-diep", 0), "diep": ("ondiep-diep", 1),
    "weinig": ("weinig-veel", 0), "veel": ("weinig-veel", 1), "leeg": ("leeg-vol", 0), "vol": ("leeg-vol", 1),
    "goedkoop": ("goedkoop-duur", 0), "duur": ("goedkoop-duur", 1), "dichtbij": None, "ver": None,
    "nat": ("nat-droog", 0), "droog": ("nat-droog", 1), "warm": "warm", "heet": "heet", "zwaar": "zwaar",
}


# ───────────────────────── dispatch ─────────────────────────
def render(base, english, dutch):
    im = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(im)
    if base in PREP:
        prep(PREP[base], d)
    elif base == "onder":
        prep_under(d)
    elif base in ORD:
        ordinal(ORD[base], d)
    elif base == "volgende":
        next_card(d)
    elif base in PRON:
        pronoun(PRON[base], d)
    elif base in OPP and isinstance(OPP[base], tuple):
        pair(*OPP[base][:1], OPP[base][1], d)
    elif base in OPP and OPP[base] in ("warm", "heet", "zwaar"):
        {"warm": lambda: thermometer(0.6, d), "heet": lambda: thermometer(0.95, d), "zwaar": lambda: balance(d, 1)}[OPP[base]]()
    else:
        return None
    caption(d, dutch, english)
    return im


def main():
    force = "--force" in sys.argv
    list_only = "--list" in sys.argv
    images = json.load(open(JSON_FILE, encoding="utf-8"))
    hints = json.load(open(HINTS_FILE, encoding="utf-8")) if os.path.exists(HINTS_FILE) else {}
    entries = {}
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
                    entries.setdefault(e["dutch"], e.get("english", ""))
    made = 0
    for dutch, english in entries.items():
        if not force and (images.get(dutch) or hints.get(dutch, {}).get("e")):
            continue
        # "zij, ze (plural)" style spellings flag plural "they"
        base = clean(dutch)
        if re.search(r"plural|\bthey\b|\bthem\b|\btheir\b", english, re.I) and not re.search(r"\bshe\b", english, re.I) and base in ("zij", "ze", "hen", "hun"):
            im_base = "hen"
        else:
            im_base = base
        im = render(im_base if im_base != "hen" else "hen", english, dutch)
        if im is None:
            continue
        rel = "assets/img/words/" + slug(dutch) + ".jpg"
        if list_only:
            print(f"{dutch:28} {english[:30]}")
            continue
        im.save(os.path.join(ROOT, rel), "JPEG", quality=88, optimize=True)
        images[dutch] = [rel]
        made += 1
        print(f"{dutch:28} -> {rel}")
    if not list_only:
        json.dump(images, open(JSON_FILE, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
        open(JSON_FILE, "a", encoding="utf-8").write("\n")
        print(made, "pictures")


if __name__ == "__main__":
    main()
