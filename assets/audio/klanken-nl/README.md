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
| `b.mp3`         | b              | bel           |
| `d.mp3`         | d              | de           |
| `e.mp3`         | e (short)      | pen          |
| `ee.mp3`        | ee             | been         |
| `e_schwa.mp3`   | e (unstressed) | de           |
| `f.mp3`         | f              | fiets        |
| `ch_g.mp3`      | ch, g          | lach         |
| `h.mp3`         | h              | haak         |
| `i.mp3`         | i (short)      | vis          |
| `ie.mp3`        | ie             | fiets        |
| `j.mp3`         | j              | ja           |
| `k.mp3`         | k              | ka           |
| `kn.mp3`        | kn             | knie         |
| `l.mp3`         | l              | leer         |
| `m.mp3`         | m              | maat         |
| `n.mp3`         | n              | naar         |
| `ng.mp3`        | ng             | lang         |
| `nk.mp3`        | nk             | inkt         |
| `o.mp3`         | o (short)      | vlot         |
| `oo.mp3`        | oo             | vloot        |
| `p.mp3`         | p              | pa           |
| `r.mp3`         | r              | raam         |
| `s.mp3`         | s              | sok          |
| `sch.mp3`       | sch            | schaal       |
| `schr.mp3`      | schr           | schrik       |
| `t.mp3`         | t              | tand         |
| `u.mp3`         | u (short)      | bus          |
| `uu.mp3`        | uu             | uur          |
| `uw.mp3`        | uw             | uw           |
| `au_ou.mp3`     | au, ou         | blauw / touw |
| `ei_ij.mp3`     | ei, ij         | feit / mijt  |
| `eu.mp3`        | eu             | beuk         |
| `oe.mp3`        | oe             | boek         |
| `ui.mp3`        | ui             | buik         |
| `v.mp3`         | v              | vak          |
| `w.mp3`         | w              | waar         |
| `wr.mp3`        | wr             | wrede        |
| `z.mp3`         | z              | zaad         |

All 21 single Dutch letters now have a clip except **c, q, x, y** (foreign/rare
spellings, not part of the leesblad lessons). Source: the per-letter sections
of `DutchPronunciation.html` (id="B", id="Ishort", id="NG", …), one native
word example per letter/cluster.
