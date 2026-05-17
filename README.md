# Learn Dutch Words — Project Reference

A static web app for learning Dutch vocabulary and dialogues, deployed via GitHub Pages. No backend required — all state lives in `localStorage` and JSON data files.

---

## Pages

| File | Description |
|---|---|
| `index.html` | Main vocabulary learner — word table + flashcard game |
| `vanstart.html` | VanStart course vocabulary learner (same layout, separate TTS script) |
| `grammar.html` | Dutch grammar reference |
| `dialogues.html` | Dutch dialogue practice — YouTube embed + role-play + solo TTS mode |

---

## Scripts

| File | Role |
|---|---|
| `assets/common.js` | Shared: voice selector, group menu toggle, hamburger, table render, iOS voice polling fallback |
| `assets/ttsscript.js` | TTS for `index.html` (main courses) |
| `assets/ttsvanstartscript.js` | TTS for `vanstart.html` |
| `assets/game.js` | Multiple-choice vocabulary game (`#popup`) |
| `assets/flashcard.js` | SM-2 spaced repetition flashcard engine |
| `assets/style.css` | Shared styles across all pages |

---

## Flashcard SRS — `assets/flashcard.js`

### localStorage keys
- `nl_srs_v3` — per-word progress (migrates from old `nl_flashcard_v2`)
- `nl_srs_meta_v3` — daily new-card count, streak, last study date

### States (SM-2)
```
new → learning → review → relearning (lapse) → review
```

### Per-word record
```js
{
  state: 'new' | 'learning' | 'review' | 'relearning',
  interval: 0,       // days until next review
  ease: 2.5,         // multiplier, range 1.3–4.0
  nextDue: 0,        // epoch ms
  lapses: 0,
  reps: 0,
  seen: 0,
  lastStudied: 0
}
```

### Rating rules

| Current state | Rating | Outcome |
|---|---|---|
| new / learning | Hard | → learning, requeue in session, count new |
| new / learning | Good | → review, interval=1 day, count new |
| new / learning | Easy | → review, interval=4 days, ease+0.10, count new |
| relearning | Hard | requeue (max 2×) |
| relearning | Good/Easy | → review, nextDue = interval days |
| review | Hard | LAPSE → relearning, ease−0.20, interval÷2 |
| review | Good | interval = max(interval+1, round(interval×ease)) |
| review | Easy | ease+0.10, interval = max(interval+1, round(interval×ease×1.3)) |

### Session building
1. All due `review` / `relearning` / `learning` cards (shuffled)
2. New cards up to daily budget (`NEW_PER_DAY=10 − todayNewCount`)
3. Fallback: shuffle all if nothing is due
4. Slice to `SESSION_SIZE=20`

### Badges
| interval | badge |
|---|---|
| state=new | New |
| state=learning | Learning |
| state=relearning | Relearn |
| review, interval < 21 | Review |
| review, interval ≥ 21 | Mastered |

### In-session requeue
Hard cards are re-inserted 2–4 positions ahead (max 2 requeues per card per session).

### Mastery progression (why 0% is normal at first)
A word only counts as **Mastered** when `state === 'review' && interval >= 21`. The interval grows by multiplying by the ease factor (default 2.5) on each Good rating — but cards only reappear after their `nextDue` date, so mastery requires real calendar days:

| Day | Rating | Interval |
|---|---|---|
| 0 | New → Good | 1 day |
| 1 | Review → Good | 3 days |
| 4 | Review → Good | 8 days |
| 12 | Review → Good | 20 days |
| 32 | Review → Good | **50 days ✅ Mastered** |

Minimum ~5 Good ratings over ~32 days before a word reaches Mastered. Study daily; rate Easy on words you know instantly to grow intervals faster.

### Auto-TTS flow on card flip
1. Card flips → English word spoken via `speakEngText` (450ms after flip)
2. `DUTCH_SENTENCE_DELAY` (1000ms) later → Dutch example sentence spoken via `speakText`
3. Unflipping → Dutch word re-read automatically (450ms after unflip)

### Hide-meaning toggle
`#hide-meaning-btn` in `<header>` (top-right, position:absolute). Click toggles 👁️ ↔ 🙈, hides/shows `.hide-text` spans (English, Vietnamese, sample translation). Resets to 👁️ on lesson change. Driven by `hideMeaning` boolean + `hideMeaningBtn` in `common.js`.

---

## Dialogues — `dialogues.html`

### Data layer
- Files: `data/dialogues/<prefix><3-digit>.json` (e.g. `c001.json`)
- Discovery: JS probes `a001`→`e999` per prefix, stops at first 404
- JSON shape:
```json
{
  "dialogue_title": "...",
  "language": "Dutch",
  "video_url": "https://www.youtube.com/shorts/...",
  "roles": { "A": "Verkoper", "B": "Klant" },
  "conversation": [
    { "role": "A", "text": "...", "translation": "..." }
  ]
}
```

### UI layout
```
body
├── #mob-bar          — mobile top bar: hamburger + title + search icon
├── #drawer-overlay   — mobile backdrop
├── #sidebar          — desktop: 272px left panel · mobile: bottom drawer (75dvh)
│   ├── .sb-drag-handle
│   ├── #sb-search    — live filter by id or title
│   └── #dlg-list
└── #content
    ├── #main → #view
    │   ├── .card#hdr  — embed + title + role buttons + TTS toggle + speed
    │   └── .card      — #conv-list
    └── #tts-bar       — sticky bottom, solo TTS mode only
```

### Key features
| Feature | Detail |
|---|---|
| Role selection | Color-coded (A=blue, B=orange, C=green, D=purple, E=teal) |
| Group mode | My role shown; other roles show animated `...` |
| Solo TTS mode | Web Speech API `nl-NL`; speeds 🐢🚶🏃 |
| TTS flow | TTS reads other roles → green "Done" button → advance |
| Repeat | 🔁 replays last TTS line |
| Dialogue cache | IDs plaintext (`nl_dlg_ids_1`), content AES-256-GCM encrypted (`nl_dlg_enc_1`) |
| Cache TTL | 7 days — if cache age > 7 days and `navigator.onLine`, `_backgroundRefresh` silently re-fetches all files and shows "🔄 bijgewerkt" toast |
| Encryption | PBKDF2 (60k iter, SHA-256) key derivation; key cached in memory |
| Keyboard | `Space`=Done, `R`=Repeat, `Esc`=close drawer |
| Celebration | Compact overlay with "Nog een keer" / ✕ |

### JS state
```js
current       // loaded dialogue object
myRole        // selected role key ("A"–"E")
soloMode      // boolean TTS mode
ttsSpeed      // float speech rate (default 0.88)
lastTTSLine   // index of last TTS line (for repeat)
tts           // { active, line, waitUser }
```

---

## CSS conventions
- Mobile breakpoint: `@media (max-width: 768px)`
- Left menu width: `270px` (mobile drawer) / `160px` (desktop panel)
- Desktop layout: `body` flex-column → `header` + `.container` (flex-row, `flex:1`, `overflow:hidden`) → `.left-menu` + `.table-container`
- `.left-menu` desktop: `display:flex; flex-direction:column; overflow:hidden` — stretches full height; second `.spacer` gets `flex:1` so file-list fills space and footer stays at bottom
- `.table-container`: `flex:1; min-height:0; overflow-y:auto` — fills remaining width/height without hardcoded `dvh`
- Table → glassmorphism card layout on mobile (`display:block`, `backdrop-filter:blur(14px)`)
- `100dvh` (dynamic viewport) used throughout to fix iOS Safari chrome clipping
- Hamburger button shifts to `left: calc(270px − 44px − 10px)` when menu is open on mobile
- Header: desktop `padding:14px 20px 10px`, `h1:1.9rem`, `h3:0.95rem`; mobile `padding:4px 12px 2px`, `h1:1.05rem`, `h3:0.7rem`; `position:relative` to anchor `.hdr-toggle-btn`
- `.fc-sentence-speak-btn`: `min-width/height:44px`, `padding:10px`, `font-size:1.4rem` (Apple minimum touch target)

---

## Data files
- Vocabulary: `data/<chapter>.json` (loaded by `currentPage` localStorage key)
- JSON shape per word:
```json
{
  "dutch": "hallo",
  "english": "hello",
  "vietnamese": "xin chào",
  "pronunciation": { "ipa": "ɦɑˈloː", "phonetic": "hah-low" },
  "dutchsentence": "Hallo, hoe gaat het?",
  "englishtranslate": "Hello, how are you?"
}
```

---

## Owner
Quang, Nguyen Dang — dqvn2002@gmail.com
