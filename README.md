# Learn Dutch Words — Project Reference

A static web app for learning Dutch vocabulary and dialogues, deployed via GitHub Pages. No backend required — all state lives in `localStorage` and JSON data files.

---

## Pages

| File | Description |
|---|---|
| `index.html` | Main vocabulary learner — word table + flashcard game |
| `vanstart.html` | VanStart course vocabulary learner (same layout, separate TTS script) |
| `4000.html` | 4 000 most-common Dutch words — vocabulary table + TTS |
| `verbs.html` | Dutch Verb Trainer — conjugation study + quiz (OTT / OVT / VTT / OTTT) |
| `grammar.html` | Dutch grammar reference |
| `dialogues.html` | Dutch dialogue practice — YouTube embed + role-play + solo TTS mode |
| `klanken.html` | Dutch phonetics learner — categorised sounds, IPA, TTS wave, 6 example words |
| `kids.html` | Kids vocabulary practice — emoji picture cards, tap-to-hear TTS |
| `stories.html` | Dutch Storytime — interactive story reader (main entry) |
| `stories1–5.html` | Individual story lesson pages |
| `number.html` | Dutch number practice |
| `game.html` | Standalone legacy vocabulary quiz |
| `demo.html` | Scratch / demo page |

---

## Scripts

| File | Role |
|---|---|
| `assets/common.js` | Shared: voice selector, table render, menu toggle, hamburger, word badges, font-size control, active-lesson highlight, lazy `puter.js` loader |
| `assets/ttsscript.js` | `initPage()` config for `index.html` (main courses) |
| `assets/ttsvanstartscript.js` | `initPage()` config for `vanstart.html` |
| `assets/tts4kscript.js` | `initPage()` config for `4000.html` |
| `assets/game.js` | Multiple-choice vocabulary game (`#popup`) + Puter/GPT AI story generator |
| `assets/flashcard.js` | SM-2 spaced repetition flashcard engine |
| `assets/dlgscript.js` | Dialogue app logic — discovery, render, TTS flow, AES-GCM cache |
| `assets/kidsscript.js` | Kids lesson app — auto-discovers `lxx.json`, emoji tap-to-hear cards |
| `assets/klanken.js` | Dutch phonetics app — sidebar nav, TTS, progress, wave animation |
| `assets/verbs.js` | Verb trainer: lesson data, study cards, quiz, dark mode, font picker, wake lock |
| `assets/gapp.js` | Markdown chapter SPA (TOC, search, progress, TTS) |
| `assets/NoSleep.min.js` | Wake lock polyfill (used by `verbs.js`) |
| `assets/style.css` | Shared styles for `index.html` / `vanstart.html` / all common components |
| `assets/verbs.css` | Styles for `verbs.html` only |
| `assets/dlg.css` | Shared sidebar styles for `dialogues.html` and `kids.html` |
| `assets/kids.css` | Styles for `kids.html` |
| `assets/klanken.css` | Styles for `klanken.html` |
| `assets/gstyles.css` | Styles for the Markdown chapter SPA |

---

## Flashcard SRS — `assets/flashcard.js`

### localStorage keys
- `nl_srs_v3` — per-word progress (migrates from old `nl_flashcard_v2`)
- `nl_srs_meta_v3` — daily new-card count, streak, last study date
- `nl_fc_word_size` — flashcard word font size (rem)

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
  nextDue: 0,        // epoch ms (0 = not yet scheduled)
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

### Session building (4-tier priority)

```
Tier 1 — Struggling  : relearning / learning cards that are due (nextDue ≤ now or 0)
Tier 2 — New         : unseen words, up to NEW_PER_DAY (10) − todayNewCount
Tier 3 — Review      : review cards with interval < 21 days that are explicitly due (nextDue > 0)
Tier 4 — Mastered    : review cards with interval ≥ 21 days that are due — capped at MAX_MASTERED_PER_SESSION (3)
Fallback             : if nothing in tiers 1–4 → new words first, then non-mastered, then mastered
```

Key invariant: `nextDue === 0` is only treated as "due now" for `learning`/`relearning` states (means "requeue me"). Review/mastered cards with `nextDue: 0` (e.g. from data migration) are **not** shown as always-due.

Session sliced to `SESSION_SIZE = 20`.

### Badges

| Condition | Badge |
|---|---|
| state = new | New |
| state = learning | Learning |
| state = relearning | Relearn |
| review, interval < 21 | Review |
| review, interval ≥ 21 | Mastered |

### In-session requeue
Hard cards are re-inserted 2–4 positions ahead (max 2 requeues per card per session).

### Mastery progression (why 0% is normal at first)
A word only counts as **Mastered** when `state === 'review' && interval >= 21`. Minimum ~5 Good ratings over ~32 real calendar days:

| Day | Rating | Interval |
|---|---|---|
| 0 | New → Good | 1 day |
| 1 | Review → Good | 3 days |
| 4 | Review → Good | 8 days |
| 12 | Review → Good | 20 days |
| 32 | Review → Good | **50 days ✅ Mastered** |

### Auto-TTS flow on card flip
1. Card flips → English word spoken (450 ms after flip)
2. `DUTCH_SENTENCE_DELAY` (1000 ms) later → Dutch example sentence spoken
3. Unflipping → Dutch word re-read automatically (450 ms after unflip)

---

## Word Status Badges — `assets/common.js`

Small ghost-pill badges rendered top-right of each Dutch word cell in the vocabulary table. Reads `nl_srs_v3` from localStorage and maps each word's SM-2 state to a badge.

| Badge | Emoji | State |
|---|---|---|
| New | 🌟 | Word never studied in flashcards |
| Learn | 🧠 | `state === 'learning'` |
| Hard | 🥵 | `state === 'relearning'` (lapsed) |
| Review | 🔃 | `state === 'review'`, interval < 21 |
| Master | ✅ | `state === 'review'`, interval ≥ 21 (dimmed) |

- Updated on lesson load, flashcard close, and `storage` events (cross-tab sync)
- `opacity: 0.3; z-index: 0` — rendered behind Dutch word text
- Dutch word and IPA spans use `position: relative; z-index: 1` to stay above badge

### Key functions
```js
_wordBadge(st)        // maps SM-2 state → { icon, label, cls }
updateWordBadges()    // stamps badges on all .dutch-word cells for current chapter
```

---

## Font Size Control — `assets/common.js`

A− / A+ buttons in the header top-right (`.hdr-right` group, alongside the 👁️ hide-meaning button). Controls `.dutch-word` size via `--vocab-word-size` CSS variable.

```js
VOCAB_FS_STEPS  = [14, 18, 23, 28, 34, 42]   // px
VOCAB_FS_LABELS = ['Tiny','Small','Normal','Large','X-Large','Huge']
VOCAB_FS_KEY    = 'nl_vocab_fs'               // localStorage key (index)
```

Default: index 2 = 23 px. Persisted across page loads.

---

## Active Lesson Highlight — `assets/common.js`

`setActiveLesson(filename)` marks the current lesson in the left menu:
- Adds `.active-lesson` class to the matching `[data-file]` item
- Automatically opens that item's parent `.nested-list` group (closes others)
- Called on page load (restores from localStorage) and on every lesson click

CSS: blue left accent bar (desktop) + light blue background tint (mobile).

---

## Lazy Puter Loader — `assets/common.js`

`loadPuter()` lazy-loads `puter.js` (AI SDK) only when the user first clicks **Start Game** or **Flashcards Game**. Keeps the page fast — the heavy CDN script is never fetched unless needed.

```js
loadPuter()   // returns Promise, resolves once window.puter is ready
```

- Intercepts button clicks in capture phase, loads puter, then re-dispatches the click so `game.js` fires normally with `window.puter` available.
- CommonJS shim applied if `require` / `module` are undefined (plain browser environment).

---

## AI Story Generator — `assets/game.js`

After the multiple-choice game session, `generateStoryFromPuter()` calls `puter.ai.chat` (model `gpt-5.2`) to produce a 5-sentence Dutch story using the session's words, followed by an English translation in `[ … ]`.

- Dutch and English blocks are split at the `[` bracket and rendered with two `<br>` elements between them (safe DOM text nodes, no `innerHTML` with AI content).
- Falls back to plain `textContent` if the model omits the bracket.

---

## Verb Trainer — `verbs.html` / `assets/verbs.js`

### localStorage keys
- `nl_verbs_v3` — per-verb quiz stats `{ seen, correct }` keyed by infinitive
- `nl_verbs_theme` — `'light'` | `'dark'`
- `nl_verbs_font` — selected font key (e.g. `'nunito'`)
- `nl_fc_word_size` *(shared with flashcard)* — not used here; verb trainer uses `FS_STEPS`

### Constants
```js
SESS           = 7     // verbs per study session
QUIZ_N         = 15    // questions per quiz
LEARNED_THRESH = 0.2   // correct/seen ratio to count as "learned"
FS_STEPS       = [13, 15, 17, 19, 23, 28, 34]  // font sizes (px)
```

### Screens
```
Home → Study (7 verb cards) → Quiz (15 questions) → Results
Home → Browse All Verbs → verb detail card
```

### Study card layout
Each verb card shows four tense blocks in a 2×2 grid. Tense labels are vertical strips on the left of each block (`writing-mode: vertical-lr; transform: rotate(180deg)`), colored by tense:

| Class | Color | Tense |
|---|---|---|
| `.present` | Red | Onvoltooid tegenwoordige tijd (OTT) |
| `.past` | Blue | Onvoltooid verleden tijd (OVT) |
| `.perfect` | Green | Voltooid tegenwoordige tijd (VTT) |
| `.future` | Purple | Onvoltooid toekomende tijd (OTTT) |

Conjugation rows use CSS grid (`grid-template-columns: max-content 1fr`) for perfect column alignment regardless of pronoun length.

### Features
- Dark mode toggle (persisted) — default follows `prefers-color-scheme`
- Keep-screen-on (Wake Lock API) — enabled by default, synced between mobile top bar and sidebar
- Font picker — 18 options including language-learning and Dutch publishing fonts; Google Fonts loaded lazily
- A− / A+ font size control (sidebar + study card top bar)
- Left/right arrow keys navigate between study cards
- TTS reads full conjugation per tense (`ik werk, jij werkt, u werkt, …`)
- Learned count shown per lesson in sidebar (`X / Y learned`)
- Smooth card fade transition (180 ms opacity)
- Browse All Verbs back button returns to list view

---

## Dialogues — `dialogues.html` / `assets/dlgscript.js`

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
| Cache TTL | 7 days — silently re-fetches when stale + online; shows "🔄 bijgewerkt" toast |
| Keyboard | `Space`=Done, `R`=Repeat, `Esc`=close drawer |

---

## Klanken (Phonetics) — `klanken.html` / `assets/klanken.js`

### localStorage keys
- `klanken-v1` — per-sound completion flags `{ "catId:sndId": 1 }`
- `klanken-last` — last opened `{ catId, sndId }` — restored on next visit
- `klanken-voice` — selected TTS voice name
- `klanken-vol` — volume (0–1)

### Data layer
- File: `data/klanken/klanken.json`
- JSON shape:
```json
{
  "categories": [{
    "id": "short", "name": "Korte Klinkers", "nameVN": "...",
    "emoji": "🔴", "color": "#E53E3E", "bg": "#FFF5F5",
    "sounds": [{
      "id": "a", "spell": "a", "ipa": "/ɑ/",
      "tipVN": "Vietnamese pronunciation tip",
      "mouth": "mouth-shape description",
      "pool": [{ "w": "bad", "hl": "a", "m": "bồn tắm", "e": "🛁" }]
    }]
  }]
}
```
- `pool` — 20 example words per sound; 6 are picked randomly each visit
- `hl` — substring to highlight in the word (marks where the target sound appears)

### UI layout
```
body
├── #mob-bar          — mobile top bar: hamburger + current sound
├── #drawer-overlay
├── #sidebar          — sound navigation grouped by category
│   ├── voice selector + volume slider
│   ├── #sound-nav    — category groups with collapsible sound items
│   └── footer
└── #content
    ├── #welcome      — shown until a sound is selected
    └── #detail       — phoneme card + tip + examples + prev/next nav
```

### Detail card layout
```
detail-topbar     — category label + "N / total" counter
phoneme-card      — large spelling, IPA, 7-bar wave animation, ▶ Luister / 🐢 Langzaam buttons
tip-card          — Vietnamese pronunciation tip + mouth-shape hint
ex-row (3 cols)   — 6 random example words, tap to hear; highlighted phoneme underlined
bottom-nav        — ← Vorige / progress dots / Volgende → (fixed on mobile)
```

### Key behaviour
- **▶ Luister** — speaks the primary spelling at normal rate (0.88)
- **🐢 Langzaam** — speaks primary spelling then all 6 example words in sequence at 0.5 rate, 1.5 s gap
- Completing all sounds in a category triggers star-pop animation + "Geweldig!" toast
- Toast uses `opacity: 0 → 1` transition; text cleared 350 ms after fade-out so no ghost remains

---

## Kids — `kids.html` / `assets/kidsscript.js`

### Data layer
- Files: `data/kids/l01.json`, `l02.json`, … (auto-discovered, stops at first 404)
- JSON shape:
```json
{
  "title": "Klik en Luister! 🗣️",
  "name": "SL woorden",
  "subtitle": "Click on a picture to hear the Dutch word spoken slowly!",
  "words": [
    { "text": "slak", "emoji": "🐌" }
  ]
}
```

### UI layout
```
body
├── #mob-bar          — hamburger + current lesson name
├── #sidebar          — lesson list (bottom drawer on mobile)
└── #content
    ├── #welcome
    └── #view         — lesson title + emoji grid
```

### Key behaviour
- Tapping an emoji card speaks the Dutch word via Web Speech API (`nl-NL`) at slow rate
- Active card pulses with a scale animation while speaking
- Last-opened lesson restored from `localStorage` key `kids_last_lesson`
- Lessons are generated from card-sheet images using the workflow in `data/kids/README.md`

---

## CSS conventions — `assets/style.css`

- Mobile breakpoint: `@media (max-width: 768px)`
- Left menu width: `270px` (mobile drawer) / `160px` (desktop panel)
- Desktop layout: `body` flex-column → `header` + `.container` (flex-row, `flex:1`, `overflow:hidden`) → `.left-menu` + `.table-container`
- `.left-menu` desktop: `display:flex; flex-direction:column; overflow:hidden` — stretches full height; second `.spacer` gets `flex:1` so file-list fills space and footer stays at bottom
- `.table-container`: `flex:1; min-height:0; overflow-y:auto`
- Table → glassmorphism card layout on mobile (`display:block`, `backdrop-filter:blur(14px)`)
- `100dvh` used throughout to fix iOS Safari chrome clipping
- `--vocab-word-size` CSS variable controls `.dutch-word` font size (set by A−/A+ in header)
- `.hdr-right`: absolute top-right flex group in `<header>` containing A−, A+, 👁️ buttons
- `.active-lesson`: left blue accent bar + bold text on active menu item; mobile adds background tint
- `.word-badge`: `position:absolute; top:4px; right:5px; opacity:0.3; z-index:0` — ghost pill behind Dutch word text

---

## Data files

### Vocabulary — `data/vocabularies/`
Loaded by the `curPage` / `currentPage` localStorage key.

| Prefix | Series |
|---|---|
| `ch01`–`ch18` | Main course chapters |
| `core01`–`core10` | Core vocabulary |
| `thema01`–`thema08` | Thematic lessons |
| `sp02`–`sp27` | Speaking practice |
| `sw02`–`sw42` | Speaking & writing |
| `4000` | 4 000 most-common words |
| `pn_th` | PN/TH thematic set |

JSON shape per word:
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

### Phonetics — `data/klanken/klanken.json`
Single file. See Klanken section above for shape.

### Kids — `data/kids/lxx.json`
`l01`–`l05` currently. See Kids section above for shape.
Add new lessons by creating the next `lxx.json`; the app discovers them automatically.

---

## Owner
Quang, Nguyen Dang — dqvn2002@gmail.com
