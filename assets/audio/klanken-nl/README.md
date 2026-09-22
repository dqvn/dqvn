# klanken-nl/

Local real-voice recordings of individual Dutch sounds (vowels, diphthongs, and
a few consonants that differ from English), used by `leesblad.html` as a 🔊
button next to the header letters — Web Speech API cannot say an isolated
sound correctly on its own.

Not committed to the repo (see `.gitignore`); `data/leesblad/sounds.json` maps
grapheme → filename here. Missing files just make that grapheme's button not
appear — everything else keeps working on TTS as before.

| File            | Grapheme(s)    | Example word |
|-----------------|----------------|--------------|
| `a.mp3`         | a              | man          |
| `aa.mp3`        | aa             | maan         |
| `b.mp3`         | b              | (Forvo clip) |
| `c.mp3`         | c              | (Forvo clip) |
| `d.mp3`         | d              | de           |
| `e.mp3`         | e (short)      | pen          |
| `ee.mp3`        | ee             | been         |
| `e_schwa.mp3`   | e (unstressed) | de           |
| `f.mp3`         | f              | (Forvo clip) |
| `ch_g.mp3`      | ch, g          | (Forvo clip) |
| `h.mp3`         | h              | (Forvo clip) |
| `i.mp3`         | i (short)      | vis          |
| `ie.mp3`        | ie             | fiets        |
| `j.mp3`         | j              | (Forvo clip) |
| `k.mp3`         | k              | ka           |
| `l.mp3`         | l              | leer         |
| `m.mp3`         | m              | (Forvo clip) |
| `n.mp3`         | n              | (Forvo clip) |
| `ng.mp3`        | ng             | (Forvo clip) |
| `nk.mp3`        | nk             | inkt         |
| `o.mp3`         | o (short)      | vlot         |
| `oo.mp3`        | oo             | vloot        |
| `p.mp3`         | p              | (Forvo clip) |
| `q.mp3`         | q              | (Forvo clip) |
| `r.mp3`         | r              | (Forvo clip) |
| `s.mp3`         | s              | (Forvo clip) |
| `sch.mp3`       | sch            | (Forvo clip) |
| `schr.mp3`      | schr           | schrik       |
| `t.mp3`         | t              | (Forvo clip) |
| `u.mp3`         | u (short)      | (Forvo clip) |
| `uu.mp3`        | uu             | uur          |
| `uw.mp3`        | uw             | uw           |
| `au_ou.mp3`     | au, ou         | blauw / touw |
| `ei_ij.mp3`     | ei, ij         | feit / mijt  |
| `eu.mp3`        | eu             | beuk         |
| `oe.mp3`        | oe             | boek         |
| `ui.mp3`        | ui             | buik         |
| `v.mp3`         | v              | (Forvo clip) |
| `w.mp3`         | w              | (Forvo clip) |
| `x.mp3`         | x              | (Forvo clip) |
| `y.mp3`         | y              | (Forvo clip) |
| `z.mp3`         | z              | (Forvo clip) |

All 26 letters of the Dutch alphabet now have a clip. Most were sourced from
the per-letter sections of `DutchPronunciation.html` (id="B", id="Ishort",
id="NG", …), one native word example per letter/cluster; the ones marked
"Forvo clip" were later swapped in from user-supplied Forvo recordings.
`kn` and `wr` were removed by request (fall back to TTS).
