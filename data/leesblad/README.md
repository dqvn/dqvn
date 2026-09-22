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

## `sounds.json`
`grapheme → local mp3 filename` (files live in `assets/audio/klanken-nl/`, gitignored — see that folder's own README, which lists every clip). Covers all single Dutch letters except c/q/x/y (foreign/rare) plus the digraphs used in these lessons (aa, ee, oo, uu, ie, oe, eu, ui, ei/ij, au/ou, ch, ng, sch, schr, kn, nk, uw, wr).

Real audio is preferred over TTS everywhere a grapheme in this map is about to be spoken, automatically, no toggle needed:
- Header: a `focus` grapheme with a clip becomes a 🔊 button next to the big letters.
- **Letter-by-letter ("hak") word playback**: each chunk with a clip plays its real sound instead of a silent timed highlight.
- **Whole "word" is itself a grapheme** (lesson 1/2 use bare letters as words: "i", "k", "m", "s") — its own clip plays instead of TTS mispronouncing the isolated letter.
- Quiz ("Welk woord hoor je?"): same rule, since quiz targets are drawn from the same word list.

A grapheme/word missing from the map (real multi-letter words, mostly) falls back to TTS as before. If a clip 404s (e.g. on a machine without `assets/audio/klanken-nl/`), that lookup fails silently and TTS is used instead — no change needed when adding new lessons unless the new focus grapheme should also get a clip.

## Known limitation
Browser TTS cannot produce isolated phonemes (a lone `k` is read as the letter name "ka") — this is why `sounds.json` exists. For a grapheme not covered there, letter-by-letter mode falls back to a silent visual highlight (no mispronounced audio), then the whole word is spoken by TTS. Use `say` to tweak a whole word if the voice mispronounces it, or add the grapheme to `sounds.json` for a real-voice clip.
