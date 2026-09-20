# Leesblad Lessons – Generation Guide

One `lNN.json` per photographed reading sheet (leesblad). `leesblad.html` auto-discovers
`l01.json`, `l02.json`, … by probing until a 404 — drop the file in, nothing else to update.
File order = learning order (Zoem Start 1-3, then Groep 3 anker 1: r, e, v, p, n, ee, b, oo).

## Schema

```json
{
  "id": "r",                       // unique; key for progress in localStorage
  "name": "r",                     // fallback label
  "title": "Leesblad r",
  "source": "Groep 3 | leesblad anker 1 - r",
  "focus": ["r"],                  // new letter(s)/grapheme(s): big in header + tile, coloured in every word
  "highlight": false,              // optional – set false when every letter is "new" (Zoem 1-2)
  "say": { "mmm": "mmmm" },        // optional – TTS spelling override per word
  "steps": [
    { "type": "words", "title": "Lees de woorden", "cols": 3,
      "groups": [["rik","ris","raas"], ["raam","raak","raar"], ["rik","rim","raam"]] },
    { "type": "story", "title": "Lees het verhaal", "scene": "👦🧀👧",
      "lines": ["ik rik.", "kim, ik maak kaas."] },
    { "type": "words", "title": "Lees meer woorden", "cols": 3, "groups": [ … ] }
  ]
}
```

- **Steps mirror the paper**: top box → `words`, middle box → `story`, bottom box → `words`.
  A 4th step "Welk woord hoor je?" (listen → pick among look-alike words) is generated automatically from all words in the lesson.
- **`groups`** = one vertical column of the sheet, in reading order (row 1 left→right, then row 2 …). `cols` = columns per row on the sheet (3, or 4 on Zoem 2).
- **Read exactly as printed** (keep repeated words, "mmm", "sss"). Only punctuation spacing is normalised (`kim kaas ?` → `kim kaas?`).
- Story `lines`: one sentence per line; words are split on spaces, trailing punctuation is kept but not spoken. `scene` = decorative emoji standing in for the sheet's illustration.
- The big-letter panel of the Zoem sheets is not a step: it is `focus` shown in the header.

## `pics.json`
Shared `word → emoji` map. The emoji pops up on a word *after* the child has tapped/heard it (hint, not spoiler). Only add concrete nouns whose emoji is unambiguous; leave names and nonsense words out.

## Known limitation
Browser TTS cannot produce isolated phonemes (a lone `k` is read as the letter name "ka"). Letter-by-letter mode is therefore visual (each grapheme lights up in turn), followed by the whole word. Use `say` to tweak a word if the voice mispronounces it.
