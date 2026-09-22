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
- **`columnFocus`** (optional, per-step array, one entry per `groups` column): highlights that fixed grapheme in *every* word of that column, even when the word doesn't literally start with it (e.g. l01 step 2's first column starts with "ik", not "i" — but the column still means "i", so `columnFocus[0] = "i"`). Used by lessons 1–2 (Zoem Start), where every word is made purely of the letters being taught (i/k/m, then i/k/m/s) — the old approach of coloring the lesson-wide `focus` set inside every word would have colored 100% of every letter, so those two lessons instead say explicitly "this column = this letter" per `l.name`'s column order. Most lessons don't need this and just rely on the lesson-wide `focus` array.

## `pics.json`
Shared `word → emoji` map. The emoji pops up on a word *after* the child has tapped/heard it (hint, not spoiler). Only add concrete nouns whose emoji is unambiguous; leave names and nonsense words out.

144 of the 282 unique words across l01–l12 are covered (checked programmatically — diff the unique word list against this map's keys). The other 138 are deliberately uncovered, not missed: single-letter/digraph grapheme labels ("a", "sch", …), Dutch character names used in the story steps (rik, saar, kees, koos, kim, sem, sep, sim, ben, kris, pim), function words/abstract adjectives with no unambiguous single emoji (is, de, een, maar, klein, lang, vaak, …), and invented CVC reading-practice syllables with no dictionary meaning (mik, kik, sis, prak, spraak, …). When adding a new lesson, only add an emoji for a real concrete word that isn't already obviously covered by this policy.

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

(Lessons 1–2 use the sibling mechanism `columnFocus` instead of this one, since their column's *first word* isn't always the bare target letter — see `columnFocus` above, under **Schema**. Both ultimately just set `wordEl()`'s `focusOverride` parameter; pick whichever matches how the lesson's columns are actually structured.)

It also has a lesson-scoped **`hints`** map (`grapheme → short Vietnamese pronunciation tip`, e.g. `"g": "gừ trong cổ họng"`), rendered as small text under that letter's tile (`.w.has-hint`, in `wordEl()`/`leesbladscript.js`). Any lesson can define `hints`; `wordEl()` looks up `lesson().hints[word]` for every word it renders (including inside `story` steps), so it's not actually alfabet-only — just unused elsewhere so far. Keep each hint very short (a few words).

`cols` for "De medeklinkers" and "Bijzondere klanken" is **3** (not more) — with 4 stacked items per column now (letter + 3 words), narrower columns wrap longer example words (camera, aquarium, schrijven, …) too aggressively; 3 columns matches the width the normal worksheet lessons already use. `.w` also has `overflow-wrap: anywhere` and `.chars` has `flex-wrap: wrap` as a general safety net for any long word in any lesson.

## Known limitation
Browser TTS cannot produce isolated phonemes (a lone `k` is read as the letter name "ka") — this is why `sounds.json` exists. For a grapheme not covered there, letter-by-letter mode falls back to a silent visual highlight (no mispronounced audio), then the whole word is spoken by TTS. Use `say` to tweak a whole word if the voice mispronounces it, or add the grapheme to `sounds.json` for a real-voice clip.

## Known issue: TTS sometimes silent on iPad/iPadOS Chrome (unresolved)
Chrome on iPad/iOS runs on WKWebView — Apple's Safari speech engine, not Chromium's. That engine appears to drop `speechSynthesis.speak()` calls made too long after the user's tap, with no error — plausible cause: `readWord()`'s letter-by-letter ("hak") mode plays 2-3 real-voice `<audio>` clips (several real seconds) *before* calling TTS for the whole word, and `playSeq()` (the "▶"/"Lees alles" column/story playback) does the same across multiple words in a row.

**A "pre-queue the utterance, then pause()/resume() it later" workaround was tried and reverted the same day** (2026-09-22): calling `speechSynthesis.speak()` immediately (to catch the gesture) then `.pause()`ing it until it was actually time to be heard. It didn't reliably help and introduced a *worse*, intermittent regression — sometimes the paused utterance leaked through immediately, so the whole word's TTS played **at the same time as** its own letter-by-letter clips. Given that trade-off, the workaround was removed; `leesblad.html` is back to the simple, always-correct-when-it-works flow (`readWord()`/`playSeq()`/`speak()`/`utter()` with no pre-queueing). Two low-risk pieces were kept since they're simple and don't have the same failure mode: `utter()` calls `speechSynthesis.resume()` before speaking (iOS sometimes leaves the engine stuck paused after backgrounding), and a one-time silent (`volume=0`) utterance fires on the page's very first touch to try to "unlock" the engine early.

This means: **on iPad/iPadOS Chrome, a word's TTS (for any word not fully covered by a `sounds.json` clip) may sometimes not be audible**, particularly after a multi-clip letter breakdown or partway through a multi-word column/story playback. Real audio clips (`sounds.json`) are unaffected — they always play. If revisited: the next real debugging step is Safari's own Web Inspector, remote-connected from a Mac to the iPad, to see `speechSynthesis`'s actual internal state/errors rather than guessing from a headless-Chromium mock (which cannot reproduce this WebKit-specific behaviour at all — every "verification" in this project's git history for this bug was against a *mocked* `speechSynthesis`, never a real device).

## Deep-linking
`leesblad.html?lesson=<id>` opens that lesson directly (skips the tile picker), matching a lesson's own `"id"` field — e.g. `?lesson=r`, `?lesson=alfabet`. Add `&step=<n>` (1-based, matching the stepper's own numbering: "1. Woorden", "2. Verhaal", … including the auto-generated last "Spel" step) to jump straight to that step, e.g. `?lesson=r&step=2` opens the story step of lesson "r". An unknown `lesson` id is ignored (falls back to the normal tile picker, no error). Same convention as the rest of the app (`kids.html`, `vanstart.html`, `verbs.html`, … all read `?lesson=`) — see `data/plan/nl_plan_v1.json`'s `"deeplink"` fields for how the portal already builds these for other tools; leesblad isn't wired into that plan file yet.
