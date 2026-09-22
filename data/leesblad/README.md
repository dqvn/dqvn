# Leesblad Lessons – Generation Guide

One `lNN.json` per photographed reading sheet (leesblad). `leesblad.html` auto-discovers
`l01.json`, `l02.json`, … by probing until a 404 — drop the file in, nothing else to update.
File order = learning order (Zoem Start 1-3, then Groep 3 anker 1: r, e, v, p, n, ee, b, oo).
`l12.json` ("Alfabet") is a synthetic capstone lesson (not a scanned sheet) reviewing every
letter/klank taught so far — see its own note near the bottom of this file.

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

## `sounds.json`
`grapheme → local mp3 filename` (files live in `assets/audio/klanken-nl/`, gitignored — see that folder's own README, which lists every clip). Covers **all 26 letters of the alphabet** plus the long vowels/tweeklanken (aa, ee, oo, uu, ie) and special clusters (ch/g, ng, nk, sch, schr, ei/ij, eu, oe, ui, au/ou, uw). `kn` and `wr` were intentionally removed (fall back to TTS).

`chunk(word)` (in `leesbladscript.js`) must know about every multi-letter grapheme used anywhere, including these consonant clusters — its `DIGRAPHS` list is checked **longest-first** (`schr` before `sch` before `ch`) so a word like "sch" isn't mis-split into s+c+h. If you add a new multi-letter grapheme to `sounds.json` that isn't already in that list, add it there too, or letter-by-letter playback will spell it out wrong before recovering on the final whole-word clip.

Real audio is preferred over TTS everywhere a grapheme in this map is about to be spoken, automatically, no toggle needed:
- Header: a `focus` grapheme with a clip becomes a 🔊 button next to the big letters.
- **Letter-by-letter ("hak") word playback**: each chunk with a clip plays its real sound instead of a silent timed highlight.
- **Whole "word" is itself a grapheme** (lesson 1/2 use bare letters as words: "i", "k", "m", "s") — its own clip plays instead of TTS mispronouncing the isolated letter.
- Quiz ("Welk woord hoor je?"): same rule, since quiz targets are drawn from the same word list.

A grapheme/word missing from the map (real multi-letter words, mostly) falls back to TTS as before. If a clip 404s (e.g. on a machine without `assets/audio/klanken-nl/`), that lookup fails silently and TTS is used instead — no change needed when adding new lessons unless the new focus grapheme should also get a clip.

## `l12.json` — "Alfabet" (capstone lesson)
Not a scanned worksheet: a synthetic review lesson placed last (highest number) so it appears at the end of the tile list. Four `words` steps in academic order for groep 3 — klinkers (a e i o u) → lange klinkers (aa ee ie oo uu) → medeklinkers a-z (b…z) → bijzondere klanken (ch, ng, nk, sch, schr, ei/ij, eu, oe, ui, au/ou, uw). Each `group` = one grapheme **plus 3 real-word examples** (e.g. `["a", "bal", "kat", "tas"]`): the grapheme itself plays straight from `sounds.json` (no TTS), the 3 example words are ordinary vocabulary read by TTS (deliberately none of them equal a `sounds.json` key, and none repeats the grapheme itself — checked programmatically when authoring). The auto-generated 4th step ("Welk woord hoor je?") reviews the whole alphabet as a listening quiz.

**`"highlightFirstOfGroup": true`** — a generic `renderWords()` option (any lesson can set it): instead of the usual lesson-wide `focus` list, each *column*'s own first item (`g[0]`, i.e. the grapheme) is used as that column's highlight target for every word rendered in it, via `wordEl(word, focusOverride)`'s optional 2nd parameter. So "circus" under grapheme "c" gets both its c's coloured, "vrijdag" under "ij" gets just the "ij" chunk coloured, etc. — this is what makes the target sound jump out inside each example word. Superseds `highlight`/`focus` for that lesson entirely (l12 no longer sets `highlight: false`, it's moot once `highlightFirstOfGroup` is on).

It also has a lesson-scoped **`hints`** map (`grapheme → short Vietnamese pronunciation tip`, e.g. `"g": "gừ trong cổ họng"`), rendered as small text under that letter's tile (`.w.has-hint`, in `wordEl()`/`leesbladscript.js`). Any lesson can define `hints`; `wordEl()` looks up `lesson().hints[word]` for every word it renders (including inside `story` steps), so it's not actually alfabet-only — just unused elsewhere so far. Keep each hint very short (a few words).

`cols` for "De medeklinkers" and "Bijzondere klanken" is **3** (not more) — with 4 stacked items per column now (letter + 3 words), narrower columns wrap longer example words (camera, aquarium, schrijven, …) too aggressively; 3 columns matches the width the normal worksheet lessons already use. `.w` also has `overflow-wrap: anywhere` and `.chars` has `flex-wrap: wrap` as a general safety net for any long word in any lesson.

## Known limitation
Browser TTS cannot produce isolated phonemes (a lone `k` is read as the letter name "ka") — this is why `sounds.json` exists. For a grapheme not covered there, letter-by-letter mode falls back to a silent visual highlight (no mispronounced audio), then the whole word is spoken by TTS. Use `say` to tweak a whole word if the voice mispronounces it, or add the grapheme to `sounds.json` for a real-voice clip.
