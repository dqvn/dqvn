#!/usr/bin/env python
"""Draw example cards for grammar words (werkwoord, voorzetsel, perfectum, ...).

Each card shows a short Dutch example with the relevant part highlighted, the word and its
English meaning underneath. Only words that have no photo file yet are drawn (the emoji hint
is ignored — a card explains these words better). Never overwrites an existing photo.

    python tools/make-grammar-images.py          # draw the missing ones
    python tools/make-grammar-images.py --list   # just list them

Needs Pillow; reuses the helpers of make-diagram-images.py.
"""
import importlib.util
import json
import os
import sys

from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location("diag", os.path.join(HERE, "make-diagram-images.py"))
dg = importlib.util.module_from_spec(spec)
spec.loader.exec_module(dg)

# term -> lines; a line is a list of (text, highlighted) parts
def L(*parts):
    return [(p[1:], True) if p.startswith("*") else (p, False) for p in parts]

CARDS = {
    "werkwoord": [L("Ik ", "*lees", " een boek.")],
    "voorzetsel": [L("De kat zit ", "*op", " de stoel.")],
    "prepositie": [L("De kat zit ", "*op", " de stoel.")],
    "infinitief": [L("*lopen"), L("*eten"), L("*slapen")],
    "substantief": [L("De ", "*hond", " blaft.")],
    "comparatief": [L("groot  →  ", "*groter")],
    "superlatief": [L("groot  →  ", "*grootst")],
    "diminutief": [L("huis  →  ", "*huisje")],
    "medeklinker": [L("*b  c  d  f  g  h"), L("a  e  i  o  u")],
    "tegenwoordige tijd": [L("Ik ", "*werk", " nu.")],
    "perfectum": [L("Ik ", "*heb", " ", "*gewerkt", ".")],
    "imperfectum": [L("Ik ", "*werkte", " gisteren.")],
    "participium": [L("*ge", "werkt")],
    "adverbium": [L("Hij loopt ", "*snel", ".")],
    "passief": [L("De brief ", "*wordt", " ", "*geschreven", ".")],
    "hoofdzin": [L("*Ik blijf thuis", ".")],
    "bijzin": [L("…omdat ", "*het regent", ".")],
    "imperatief": [L("*Kom", " hier!")],
    "antoniem": [L("*groot", "  ↔  ", "*klein")],
    "komma": [L("Ja", "*,", " dat klopt.")],
    "accent": [L("caf", "*é", ",  ", "*één")],
    "tussenwoord": [L("*Ach", ", jammer!")],
    "artikel": [L("*de", " man"), L("*het", " huis")],
    "zin": [L("*Ik woon in Utrecht.")],
}


def draw_card(lines, d):
    n = len(lines)
    size = 26 if n == 1 else 30 if n == 2 else 22
    fn, fb = dg.font(False, size), dg.font(True, size)
    while size > 14 and max(sum(d.textlength(t, font=fb if h else fn) for t, h in ln) for ln in lines) > dg.W - 24:
        size -= 2
        fn, fb = dg.font(False, size), dg.font(True, size)
    gap = size + 10
    y = (dg.DIAG_H - gap * n) / 2 + 4
    d.rounded_rectangle([8, 8, dg.W - 8, dg.DIAG_H - 6], radius=10, fill="white", outline=dg.LGREY, width=2)
    for ln in lines:
        x = (dg.W - sum(d.textlength(t, font=fb if h else fn) for t, h in ln)) / 2
        for t, h in ln:
            f = fb if h else fn
            d.text((x, y), t, fill=dg.ORANGE if h else dg.INK, font=f)
            x += d.textlength(t, font=f)
        y += gap


def main():
    list_only = "--list" in sys.argv
    images = json.load(open(dg.JSON_FILE, encoding="utf-8"))
    entries = {}
    for fn in sorted(os.listdir(dg.VOC)):
        if not fn.endswith(".json"):
            continue
        try:
            data = json.load(open(os.path.join(dg.VOC, fn), encoding="utf-8"))
        except Exception:
            continue
        if isinstance(data, list):
            for e in data:
                if isinstance(e, dict) and e.get("dutch"):
                    entries.setdefault(e["dutch"], e.get("english", ""))
    made = 0
    for dutch, english in entries.items():
        base = dg.clean(dutch)
        if base not in CARDS or any(os.path.exists(os.path.join(dg.ROOT, u)) for u in images.get(dutch, [])):
            continue
        if list_only:
            print(f"{dutch:34} {english[:30]}")
            continue
        im = Image.new("RGB", (dg.W, dg.H), dg.BG)
        d = ImageDraw.Draw(im)
        draw_card(CARDS[base], d)
        dg.caption(d, dutch, english)
        rel = "assets/img/words/" + dg.slug(dutch) + ".jpg"
        im.save(os.path.join(dg.ROOT, rel), "JPEG", quality=88, optimize=True)
        images[dutch] = [rel]
        made += 1
        print(f"{dutch:34} -> {rel}")
    if not list_only:
        json.dump(images, open(dg.JSON_FILE, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
        open(dg.JSON_FILE, "a", encoding="utf-8").write("\n")
        print(made, "pictures")


if __name__ == "__main__":
    main()
