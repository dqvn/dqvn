# Learn Dutch Words — Project Reference

A static web app for learning Dutch (A2 level) deployed via GitHub Pages. No backend required — all state lives in `localStorage` and JSON data files. Cloud sync via Cloudflare Worker + Upstash Redis (optional, Google Sign-In required).

---

## Pages

| File | Description |
|---|---|
| `index.html` | **Portal / Home** — learning hub: hero + stats strip (streak, cards, klanken, verbs, XP), tool launcher grouped by A2 skill, progress cards, settings, plan comparison |
| `startnl.html` | Main vocabulary learner — word table + flashcard game + cloud sync (was `index.html`) |
| `vanstart.html` | VanStart course vocabulary learner (same layout as `startnl.html`, separate TTS script) |
| `4000.html` | 4 000 most-common Dutch words — vocabulary table + TTS |
| `verbs.html` | Dutch Verb Trainer — conjugation study + quiz (OTT / OVT / VTT / OTTT) |
| `grammar.html` | Dutch grammar reference |
| `dialogues.html` | Dutch dialogue practice — YouTube embed + role-play + solo TTS mode |
| `klanken.html` | Dutch phonetics learner — categorised sounds, IPA, TTS wave, 6 example words |
| `kids.html` | Kids vocabulary practice — emoji picture cards, tap-to-hear TTS |
| `stories.html` | Dutch Storytime — interactive story reader (kids/animated, main entry) |
| `stories2.html` | Korte Verhalen — 10 Dutch beginner short stories; paragraph TTS, vocabulary chips (click-to-hear), English translation toggle, completion tracking |
| `stories1–5.html` | Individual story lesson pages |
| `number.html` | Dutch Numbers Game — 5-level kids game (1–100); Learn / Listen / Quiz modes; star progress + cloud sync |
| `wheel.html` | Wheel of Names — spinning question-picker; user-managed packages; TTS on result; cloud sync |
| `rss.html` | Nieuws — reads live Dutch news from nu.nl via Worker proxy; word-tap translation popup; read-progress tracking |
| `podcast.html` | Podcast Luisteren — streams *Met het Oog op Morgen* (NPO Radio 1) via Worker proxy; in-page audio player; word-tap translation; listened-episode tracking |
| `sentence.html` | Zinnen Bouwen — A2 sentence-building game; two modes (⌨️ type / 🧩 drag-and-drop tiles); smart fuzzy scoring; daily 5-sentence streak; XP; cloud sync |
| `game.html` | Standalone legacy vocabulary quiz |
| `demo.html` | Scratch / demo page |

### Navigation structure

```
index.html (portal)
  └── tool cards (14 tools, 5 A2 skill groups)
        🏗️ Taalkennis     → startnl.html, vanstart.html, grammar.html,
                             verbs.html, kids.html, number.html
        📖 Leesvaardigheid → stories.html, stories2.html, rss.html
        🎧 Luistervaardigheid → klanken.html, podcast.html
        ✍️ Schrijfvaardigheid → sentence.html
        🗣️ Spreekvaardigheid  → dialogues.html, wheel.html
  └── "← Terug" / "← Terug naar Portaal" in all tool pages

Tool pages' back-links → index.html (portal)
```

---

## Portal — `index.html`

Single-page hub with inline CSS + JS (no external scripts except `sync.js`).

### Sections
| Section | Description |
|---|---|
| Sticky header | Dutch-flag emblem + "Leer Nederlands" brand + compact auth pill (sync.js) |
| Hero | `bg2.jpg` photo background with parallax scrim; personalized greeting; stats strip: 🔥 streak · 📚 cards · 🎵 klanken · 🔄 verbs |
| Taak van vandaag | Login-only. Smart daily suggestions scored from localStorage state + deep-links directly to the specific lesson/chapter/mode to study |
| **Leerpad** | Login-only. Reads `data/plan/nl_plan_v1.json` + `nl_learning_progress_v1`; shows active A1/A2 unit, per-task mastery status (✅/⬜), animated progress bar, deeplinks per task. Rendered by `renderLearningPath()` |
| Voortgang | 9 progress cards (Vocabulaire, Klanken, VanStart, Werkwoorden, Dialogen, Verhalen, Nieuws, Podcast, Zinnen Bouwen) — live from localStorage |
| Leertools | 14 tool cards grouped by **A2 exam skill**: 🏗️ Taalkennis (6) / 📖 Leesvaardigheid (3) / 🎧 Luistervaardigheid (2) / ✍️ Schrijfvaardigheid (1) / 🗣️ Spreekvaardigheid (2); group count badge is derived dynamically from the TOOLS array |
| Instellingen | Volume slider (`nl_vocab_vol`) + TTS speed slider (`nl_tts_rate`) |
| Binnenkort | Placeholder cards for future features |
| Waarom aanmelden? | Two plan cards: guest (features available) vs account (sync + CTA) |

### Background layering
```
Cards / text                     (z-index 1+)
body::before fixed scrim         (dark-warm → transparent → solid cream)
bg2.jpg  background-attachment:fixed  (parallax on desktop, scroll on mobile)
```

### Key functions
```js
renderDashboard()       // greeting + stats + today-tasks + leerpad + progress + plan CTA
renderTools()           // grouped tool cards (preserves TOOLS insertion order)
renderLearningPath()    // fetches nl_plan_v1.json, reads nl_learning_progress_v1, renders Leerpad section
computeTodayTasks()     // scores + deep-links candidates; VanStart href = ?lesson=<nextTarget>
renderTodayTasks()      // shows top-2 active tasks with deeplinks; hidden when logged out
updatePlanCTA()         // "Meld je gratis aan →" or "✓ Aangemeld als X" based on auth state
updateWordBadges()      // called by sync.js after sync — re-runs renderDashboard()
initVolume()            // reads nl_vocab_vol, writes on change
initSpeed()             // reads nl_tts_rate, writes on change
// Deep-link helpers (portal.js):
_vsTargetLesson()       // VanStart: stay on current lesson if unseen words; else advance
_vocabDeepTarget()      // Vocab: chapter with most due cards → review; else next unseen
_verbsWeakLesson()      // Verbs: lesson with lowest avg correct/seen ratio
_isTaskMastered()       // Reads existing localStorage keys to check plan task completion
_findActiveUnit()       // Walks plan levels/units to find first unit with incomplete required tasks
```

### Stats computed from localStorage
| Stat | Source |
|---|---|
| Streak | `nl_srs_meta_v3.streak` |
| Cards seen | Count non-new cards across all lessons in `nl_srs_v3` |
| Cards mastered | Count `state==='review' && interval>=21` in `nl_srs_v3` |
| Klanken done | Count truthy entries in `klanken-v1` |
| Verbs learned | Count verbs where `correct/seen > 0.2` in `nl_verbs_v3` |
| Dialogues done | Count keys in `nl_dlg_v1.stats` |
| RSS articles read | `nl_rss_v1.total` (target: 30) |
| Podcast episodes | `nl_podcast_v1.total` (target: 20) |
| Sentences today | `nl_sentence_v1.count` if `date === today` (daily goal: 5) |
| Sentence streak | `nl_sentence_v1.streak` (consecutive days reaching daily goal) |
| Sentence XP | `nl_sentence_v1.xp` (shown in Zinnen Bouwen progress card) |

---

## Asset directory layout

All shared files live under `assets/`, organised into three subdirectories:

```
assets/
  css/   style.css  sync.css  dlg.css  klanken.css  kids.css  verbs.css  gstyles.css
         wheel.css  podcast.css  sentence.css  portal.css  themes.css
  js/    common.js  sync.js  ttsscript.js  ttsvanstartscript.js  tts4kscript.js
         game.js  flashcard.js  dlgscript.js  kidsscript.js  klanken.js
         verbs.js  gapp.js  wheel.js  podcast.js  sentence.js  portal.js  NoSleep.min.js
  img/   bg.jpg  bg1.jpg  bg2.jpg  dutch.ico  no-image.jpg

data/
  vocabularies/   ch01–ch18  core01–10  thema01–08  sp02–sp27  sw02–sw52  sz02–sz19  ...
  dialogues/      c001–c120.json  (+ README.md)
  verbs/          manifest.json  v01.json  v02.json  ...
  kids/           l01–l07.json  (+ README.md)
  klanken/        klanken.json
  stories/        beginners.json
  plan/           nl_plan_v1.json   ← A0→A2 curriculum (15 units, 930 XP)
                  wheel_packages.json  ← Draairad A1/A2 preset question packs
```

All HTML files reference these subdirectory paths (e.g. `assets/css/style.css`, `assets/js/sync.js`, `assets/img/dutch.ico`).

---

## Scripts

| File | Role |
|---|---|
| `assets/js/common.js` | Shared: voice selector, table render, menu toggle, hamburger, word badges, font-size control, active-lesson highlight, lazy `puter.js` loader, `_getTTSRate()` helper. `initPage()` reads `?lesson=` (override last-saved position) and `?mode=review` (auto-triggers flashcard after XHR loads) |
| `assets/js/sync.js` | Cloud sync — Google Sign-In (GIS), Upstash Redis via Cloudflare Worker, smart auto-sync; syncs 9 keys including `nl_sentence_v1` |
| `assets/js/podcast.js` | Podcast page logic — loads episodes from Worker `/podcast`, localStorage cache (`nl_podcast_cache_v1`), audio player, listened tracking, word-tap translation popup |
| `assets/js/sentence.js` | Sentence-building game — file selector, queue with session persistence (`nl_sentence_session_v1`), fuzzy 5-layer scorer (Levenshtein), pointer-event drag-and-drop with FLIP animation, daily streak + XP |
| `assets/css/podcast.css` | Dark theme for `podcast.html` — episode accordion cards, native `<audio>` styling, progress strip, word-popup |
| `assets/css/sentence.css` | Dark theme for `sentence.html` — word-tile drag system (ghost, insert caret, FLIP), daily-strip dots, file sidebar, game card |
| `assets/js/ttsscript.js` | `initPage()` config for `startnl.html` (main courses) |
| `assets/js/ttsvanstartscript.js` | `initPage()` config for `vanstart.html` |
| `assets/js/tts4kscript.js` | `initPage()` config for `4000.html` |
| `assets/js/game.js` | Multiple-choice vocabulary game (`#popup`) + Puter/GPT AI story generator |
| `assets/js/flashcard.js` | SM-2 spaced repetition flashcard engine. Writes per-chapter mastery score to `nl_learning_progress_v1` via `_writePlanMastery()` after each card rating and on close |
| `assets/js/dlgscript.js` | Dialogue app logic — discovery, render, TTS flow, AES-GCM cache |
| `assets/js/kidsscript.js` | Kids lesson app — auto-discovers `lxx.json`, emoji tap-to-hear cards |
| `assets/js/klanken.js` | Dutch phonetics app — sidebar nav, TTS, progress, wave animation |
| `assets/js/verbs.js` | Verb trainer: lesson data, study cards, quiz, dark mode, font picker, wake lock. Reads `?lesson=<id>` and `?mode=study|quiz` URL params on init to deep-link from the Leerpad |
| `assets/js/gapp.js` | Markdown chapter SPA (TOC, search, progress, TTS) |
| `assets/js/NoSleep.min.js` | Wake lock polyfill (used by `verbs.js`) |
| `assets/css/style.css` | Shared styles for `startnl.html` / `vanstart.html` / all common components; includes `.al-home-btn` for launcher portal link |
| `assets/css/sync.css` | Sync section styles — top-of-menu bar design; three theme contexts: `.left-menu`, `#sidebar`, `.sidebar-dark` |
| `assets/css/verbs.css` | Styles for `verbs.html` only |
| `assets/css/dlg.css` | Shared sidebar styles for `dialogues.html` and `kids.html` |
| `assets/css/kids.css` | Styles for `kids.html` |
| `assets/css/klanken.css` | Styles for `klanken.html` |
| `assets/css/gstyles.css` | Styles for the Markdown chapter SPA |
| `assets/css/wheel.css` | Styles for `wheel.html` — dark theme, canvas wrap, spin button, result modal, package manager modal, sync drawer |
| `assets/js/wheel.js` | Wheel game logic — canvas drawing, spin animation (ease-out quartic), package CRUD, TTS, tick sound (Web Audio), confetti, sync drawer, MutationObserver avatar update. Loads A1/A2 preset packs from `data/plan/wheel_packages.json` via `_loadPresetPackages()` on startup |

---

## Cloud Sync — `assets/sync.js` + `worker/`

Multi-device progress sync via Cloudflare Worker (proxy) + Upstash Redis (store). Google Identity Services handles authentication — no password, no separate account.

### Architecture

```
Browser (GitHub Pages)
  │  Google Sign-In → id_token (JWT, 1 h expiry)
  │  POST /sync  { Authorization: Bearer <jwt>, payload }
  ▼
Cloudflare Worker  (worker/index.js)
  │  Verifies Google JWT (Web Crypto, RS256)
  │  Holds UPSTASH_URL + UPSTASH_TOKEN as encrypted env secrets
  │  Merges local + Redis data, writes back
  ▼
Upstash Redis   key: fc:{google_sub}
```

### Deployment

```bash
cd worker
wrangler secret put UPSTASH_URL
wrangler secret put UPSTASH_TOKEN
# Edit wrangler.toml [vars] GOOGLE_CLIENT_ID first, then:
wrangler deploy
# Paste the printed Worker URL into assets/sync.js → SYNC_WORKER_URL
```

Google Cloud Console: add your GitHub Pages origin to **Authorized JavaScript origins** (no trailing slash, no redirect URIs needed).

### localStorage keys synced

| Key | Content | Merge strategy |
|---|---|---|
| `nl_srs_v3` | Flashcard SM-2 progress | Per-word: highest `lastStudied` wins |
| `nl_srs_meta_v3` | Streak / daily new-card count | Most recent `lastStudyDate` wins; max streak |
| `klanken-v1` | Phonetics completion flags | Union — a completed sound is never un-completed |
| `nl_verbs_v3` | Verb trainer stats per verb | Per-verb: `max(seen)` + `max(correct)`; max streak |
| `nl_game_progress_v1` | Game seen-words per chapter | Union of word arrays per chapter |
| `nl_num_progress` | Number game level/stars progress | Per-level: `max(stars)` per mode; `learn` flag unioned |
| `nl_vocab_vol` | TTS volume `{ v: 0–100, t: timestamp }` | Most recent timestamp wins |
| `nl_wheel_pkgs` | Wheel question packages array | Union by package ID; more-items version wins |
| `nl_sentence_v1` | Sentence-builder streak, daily count, XP `{ date, count, streak, xp, lastGoalDate }` | Max XP; most-recent date wins for count; max streak with most-recent `lastGoalDate` |

Keys intentionally **not** synced (device-specific or ephemeral): `nl_tts_voice_v1`, `nl_tts_rate`, `nl_vocab_fs`, `nl_fc_word_size`, `nl_verbs_theme`, `nl_verbs_font`, `klanken-voice`, `klanken-vol`, `kids_tts_speed`. Cache keys (`nl_dlg_*`, `nl_podcast_cache_v1`, `nl_rss_*`) are also excluded. Session-resume key `nl_sentence_session_v1` (today's queue + position) is local-only. Podcast/RSS read-history (`nl_podcast_v1`, `nl_rss_v1`) is local-only.

**Learning-plan progress** (`nl_learning_progress_v1`) is also **not yet synced** — it is computed from other synced keys so it will auto-rebuild after a sync, but the active-unit pointer is local-only for now.

### Auto-sync triggers (no manual action needed)

1. **Page load** — syncs immediately if stored token is still valid (< 1 h old)
2. **After studying** — `localStorage.setItem` hook fires 15 s after any progress key is written (debounced; 3 min minimum gap between auto-syncs)
3. **Device comes back online** — fires on `navigator.online` transition
4. **Token renewal** — GIS silently renews the expired JWT; sync fires after renewal

`visibilitychange` intentionally excluded — fires on every tab/app switch, not a meaningful learning event.

### Token / session lifecycle

- First visit: "Sign in to sync" button in left menu; One Tap shown on click only
- Signed in: token stored in `fc_sync_token` (localStorage); valid 1 h
- On refresh within 1 h: token still valid → sync fires immediately, no Google prompt shown
- On refresh after 1 h: GIS silently renews (no popup) using `auto_select: true`; if renewal fails, ⋮ menu → Sync now re-prompts on next manual click
- Sign out: `google.accounts.id.disableAutoSelect()` + clear localStorage keys

### UI position

`#sync-section` is placed at the **top** of each sidebar/left-menu (above all content, below the logo). Three CSS theme contexts in `sync.css`:

| Context | Pages | Styling |
|---|---|---|
| `.left-menu #sync-section` | `startnl.html`, `vanstart.html`, `4000.html` | Light — matches `#lm-footer` |
| `#sidebar:not(.sidebar-dark) #sync-section` | `klanken.html` | Light sidebar divider |
| `.sidebar-dark #sync-section` | `dialogues.html`, `kids.html`, `verbs.html` | Dark — matches `#app-footer` |

`dialogues.html`, `kids.html`, `verbs.html` have `class="sidebar-dark"` on `<nav id="sidebar">`.

On `index.html` (portal) the section lives in `#portal-header` — styled as a compact auth pill via inline overrides.

On `wheel.html` the sync section lives inside a **right-side slide-in drawer** (`#sync-drawer`). A 36×36 px circular button in the top-right nav opens/closes it; the button swaps to the user's Google avatar (via `MutationObserver`) once signed in. The drawer uses `.sidebar-dark` context so sync card styling matches `dialogues.html`.

**Signed out:**
```
[ G  Sign in to sync ]
```

**Signed in:**
```
┌──────────────────────────────┐
│  [🖼]  Name               [⋮]│
│        ☁️ Synced · 2m ago    │
└──────────────────────────────┘
```
⋮ opens dropdown (opens **downward** — section is now at top): **Sync now** / **Sign out**.
Status: `⏳ Syncing…` → `☁️ Synced · Xs ago` → `⚠️ Sync failed` → `🔑 Tap to reconnect`.

---

## Flashcard SRS — `assets/flashcard.js`

### localStorage keys
- `nl_srs_v3` — per-word progress (migrates from old `nl_flashcard_v2`)
- `nl_srs_meta_v3` — daily new-card count, streak, last study date
- `nl_fc_word_size` — flashcard word font size (rem)
- `nl_learning_progress_v1` — learning-plan mastery scores written by `_writePlanMastery()`

### Mastery hook — `_writePlanMastery()`
Called from `rateCard()` and `closeFlashcard()`. Computes how many chapter cards are no longer in `new` state (= "seen"), and if the value changed by ≥5 pp or mastery state flipped, writes:
```js
nl_learning_progress_v1.tool_scores.flashcard[chapterId] = {
  seen_pct,    // 0.0–1.0 (seen / total)
  is_mastered, // true if seen_pct >= 0.80
  total, seen, date
}
```
The portal `renderLearningPath()` reads this to mark VanStart tasks green without re-scanning all cards.

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

### Back card layout
```
English meaning
Vietnamese
─────────────────
Dutch example sentence  (centered, Caveat font)
[ 🔊 Hear it ]           (same pill button as front; blue tint on white bg)
English translation      (small, muted)
```
The "Hear it" button on the back card uses `#fc-back .fc-speak-btn` CSS override for dark-on-light colours. `margin-top: auto` pins it to the bottom of the available space above the English translation.

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

- Intercepts button clicks in capture phase, loads puter, then re-dispatches the click so `game.js` fires normally with `window.puter` available.
- `_puterAvailable` flag (`null` / `true` / `false`) prevents an infinite loop when the corporate firewall blocks `js.puter.com` with `ERR_CERT_AUTHORITY_INVALID` — on failure the flag is set to `false` and subsequent clicks pass straight through to `game.js`.

---

## AI Story Generator — `assets/game.js`

After the multiple-choice game session, `generateStoryFromPuter()` calls `puter.ai.chat` (model `gpt-5.2`) to produce a 5-sentence Dutch story using the session's words, followed by an English translation in `[ … ]`.

- Dutch and English blocks are split at the `[` bracket and rendered with two `<br>` elements between them (safe DOM text nodes, no `innerHTML` with AI content).
- Falls back to plain `textContent` if the model omits the bracket.
- Skipped entirely (`if (window.puter)` guard) when puter failed to load.

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
└── #content          — flex column, min-height: 100dvh
    ├── #welcome      — shown until a sound is selected (flex: 1)
    └── #detail       — phoneme card + tip + examples + prev/next nav (flex: 1)
        └── .ex-row   — flex: 1, grows to fill remaining space; 3 cols on all screen sizes
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
- Toast: `opacity: 0→1` transition; text cleared 350 ms after fade-out (prevents ghost on mobile)
- Mobile layout: `#content` is flex column filling `100dvh`; example grid grows to fill leftover space

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

## Korte Verhalen — `stories2.html`

Beginner Dutch story reader. Self-contained HTML — no external CSS/JS besides Google Fonts.

### Data layer
- File: `data/stories/beginners.json` — array of 10 story objects (see Data files section)
- Loaded via `fetch` on page load

### UI layout
```
body
├── #overlay          — mobile drawer backdrop
├── #mob-bar          — mobile top bar: back-to-portal + title + hamburger
├── #sidebar          — frosted-glass left panel (slides in on mobile)
│   ├── back-to-portal link
│   ├── .sb-hdr       — title + story count
│   └── .sb-list      — numbered story items, green ✓ when completed
└── #main
    ├── #read-bar     — desktop: story title + reading time + A−/A+ + 🇬🇧 toggle + prev/next
    ├── #progress-bar — 2px orange scroll-progress line
    └── #content      — scrollable reading area
        ├── #welcome  — shown until a story is selected
        └── #story-view
            ├── sv-header   — badge + title + subtitle + 🇬🇧 toggle button
            ├── .story-text — paragraphs (.para), English lines (.para-en)
            ├── .vocab-wrap — clickable word chips (click → hear Dutch TTS)
            ├── .q-wrap     — collapsible comprehension questions
            └── .story-nav  — ◀ Vorig / Volgend ▶ buttons
    └── #tts-bar      — fixed bottom: story title + state + para-dots + controls
```

### Key features
| Feature | Detail |
|---|---|
| Paragraph TTS | Reads story paragraph-by-paragraph; active paragraph highlighted with orange left border; done paragraphs dimmed |
| Para-dots | Up to 12 progress dots in TTS bar showing current/done paragraphs |
| ⏮ / ⏭ | Jump back or forward one paragraph; resumes reading if playing |
| Speed cycle | 0.8× → 1.0× → 1.25× → 1.5× → 0.6× |
| Vocabulary | Click any word chip → hears Dutch word via TTS (`nl-NL`, rate 0.85) |
| English toggle | 🇬🇧 button shows/hides English translations paragraph-by-paragraph; state in `nl_s2_show_en` |
| Completion | Opening a story saves its ID to `nl_s2_done`; green ✓ in sidebar |
| Font size | A− / A+ in desktop read-bar adjusts story text size (`--font-sz` CSS var) |
| Reading progress | Scroll-driven orange gradient bar below read-bar |
| Mobile drawer | Hamburger → sidebar slides in over content with overlay backdrop |

### localStorage keys
| Key | Content |
|---|---|
| `nl_s2_done` | JSON array of completed story IDs |
| `nl_s2_show_en` | `'1'` if English translation is visible, `'0'` / absent if hidden |

---

## CSS conventions — `assets/css/style.css`

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

---

## Learning Path System — `data/plan/`

Duolingo-style A0→A2 curriculum. Two static JSON files drive the entire path; JavaScript reads them without any backend.

### `data/plan/nl_plan_v1.json`

Defines the full A1 + A2 curriculum. Structure:

```
meta              — version, daily_goal_minutes: 20, mastery_threshold: 0.80
mastery_checks    — named check types (flashcard_80pct, verb_quiz_80, stars_2plus, …)
levels[]
  └─ A1 (8 units, 370 XP, ~37 days)
  └─ A2 (7 units, 560 XP, ~49 days)
      └─ units[]
           └─ tasks[]  — id, tool, target, mastery_check, required, xp, deeplink
```

**VanStart lesson order:** A1 uses `core01–core10` (Core 2000 frequency words); A2 uses `thema01–thema08` (themed vocabulary).

**Mastery checks by tool:**

| Tool | Check type | Threshold |
|------|-----------|-----------|
| vanstart / vocab flashcard | `flashcard_80pct` | 80% of chapter cards not 'new' |
| verbs | `verb_quiz_80` | `totalCorrect / totalAnswered ≥ 0.80` |
| getallen | `stars_2plus` | Best stars ≥ 2 (≥ 70%) |
| klanken | `count_done` | N sounds marked done |
| sentence | `streak_days` | Daily goal met for N consecutive days |
| dialogues | `practiced_once` | `nl_dlg_v1.stats[id].count ≥ 1` |
| stories2 | `story_quiz_80` | N quizzes with `completed: true` |
| nieuws / podcast | `count_done` | `nl_rss_v1.total` / `nl_podcast_v1.total ≥ N` |

### `data/plan/wheel_packages.json`

Six preset Draairad question packs (3 A1, 3 A2) loaded by `wheel.js` on startup. See Wheel section.

### `nl_learning_progress_v1` (localStorage — not synced)

```js
{
  tool_scores: {
    flashcard: {
      "core01": { seen_pct: 0.85, is_mastered: true, total: 50, seen: 43, date: "2026-06-06" }
    }
  }
  // active_unit is derived dynamically by _findActiveUnit() each render — not stored
}
```

The progress key is intentionally thin: task mastery is **computed in real-time** from the existing tool storage keys (no duplication). The flashcard mastery score is the only pre-computed cache (written by `_writePlanMastery()` in `flashcard.js` to avoid scanning all cards on every portal render).

### Portal Leerpad section

Rendered by `renderLearningPath()` in `portal.js`:
1. `fetch('/dqvn/data/plan/nl_plan_v1.json')` — cached in module var `_planCache`
2. `_findActiveUnit(plan, prog)` — walks levels/units, returns first unit where not all required tasks pass `_isTaskMastered()`
3. Renders: level chip (A1🌱 / A2🌿) + unit card with progress bar + task rows with deeplinks
4. Optional tasks hidden in a `<details>` toggle

### Deep-link URL params (added to all tool pages)

| Tool | Param | Effect |
|------|-------|--------|
| `vanstart.html` / `startnl.html` | `?lesson=core01` | Loads specific lesson on init (overrides localStorage) |
| `vanstart.html` / `startnl.html` | `?mode=review` | Auto-opens flashcard after lesson loads (200 ms setTimeout) |
| `verbs.html` | `?lesson=v01` | Selects lesson by manifest ID |
| `verbs.html` | `?mode=study` | Auto-starts Study session after lesson loads |
| `verbs.html` | `?mode=quiz` | Auto-starts Quiz-only session |
| `klanken.html` | `?start=next` | Opens first sound where `isDone` is false |
| `wheel.html` | `?pkg=preset_a1_1` | (handled by existing import param logic) |

`computeTodayTasks()` in `portal.js` computes the appropriate deeplink for each "Taak van vandaag" card using:
- `_vsTargetLesson()` — VanStart: current lesson if unseen words remain; next lesson if all seen
- `_vocabDeepTarget()` — Vocab: chapter with most due cards + `&mode=review`; else first unseen chapter
- `_verbsWeakLesson()` — Verbs: lesson with lowest avg `correct/seen` ratio

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

### Stories — `data/stories/beginners.json`

Single JSON array of story objects. Loaded by `stories2.html` via `fetch`.

```json
{
  "id": 1,
  "title": "...",
  "subtitle": "...",
  "image_query": "...",
  "paragraphs": ["Dutch paragraph 1", "..."],
  "english_paragraphs": ["English translation 1", "..."],
  "vocabulary": [{ "nl": "...", "en": "..." }],
  "questions": ["Comprehension question 1?", "..."]
}
```

- `paragraphs` / `english_paragraphs` are parallel arrays — same index = same paragraph
- `image_query` is passed to Unsplash Source for the dynamic story background
- English translations are hidden by default; toggle state stored in `nl_s2_show_en`
- Completion tracking stored in `nl_s2_done` (array of read story IDs)

### Phonetics — `data/klanken/klanken.json`
Single file. See Klanken section above for shape.

### Kids — `data/kids/lxx.json`
`l01`–`l07` currently. All phonics-based (consonant clusters: SL, GL/KL, BL, VL/FL, ZW, etc.). See Kids section above for shape.
Add new lessons by creating the next `lxx.json`; the app discovers them automatically.

### Learning Plan — `data/plan/`
| File | Description |
|---|---|
| `nl_plan_v1.json` | Full A0→A2 curriculum — 2 levels, 15 units, 930 XP, ~86 days at 20 min/day |
| `wheel_packages.json` | 6 Draairad preset packs (3 A1 + 3 A2); loaded and merged by `wheel.js` on startup |

See the **Learning Path System** section above for full schema documentation.

---

## Number Learning Game — `number.html` / (inline JS)

Kids-oriented Dutch number learning app. Data source: `data/vocabularies/ch00.json` (101 entries, numbers 1–101 with English + Vietnamese translations).

### Levels

| Level | Range | Unlock condition |
|---|---|---|
| 1 | 1 – 10 | Always open |
| 2 | 11 – 20 | After Level 1 visited |
| 3 | 21 – 30 | After Level 2 visited |
| 4 | 31 – 50 | After Level 3 visited |
| 5 | 51 – 100 | After Level 4 visited |

### Modes per level

| Mode | Description |
|---|---|
| 📚 Leren | Flashcard carousel — numeral → Dutch word → English + Vietnamese; auto TTS; swipe or arrow keys |
| 👂 Luisteren | Hear Dutch TTS, tap the correct numeral from 4 choices |
| ✏️ Quiz | See the numeral, pick the Dutch word from 4 choices |

### Scoring
≥ 90% = ⭐⭐⭐ · ≥ 70% = ⭐⭐ · ≥ 40% = ⭐ · below = retry. Best score per mode persisted. Confetti on ≥ 2 stars.

### localStorage keys
| Key | Content |
|---|---|
| `nl_num_progress` | `{ "1": { learn: bool, listen: 0–3, quiz: 0–3 }, … }` — one entry per level |

---

## Wheel of Names — `wheel.html` / `assets/js/wheel.js` / `assets/css/wheel.css`

Classroom spinning-wheel question-picker. Teacher spins; a random item from the active package is selected, spoken aloud via TTS, and shown in a full-screen celebration popup.

### UI layout
```
body
├── #top-nav         — back link + title + sync avatar button (opens #sync-drawer)
├── #app
│   └── #main-layout (flex row on desktop)
│       ├── #wheel-col (flex:1)
│       │   └── #wheel-wrap — canvas + CSS triangle pointer
│       └── #list-col (320 px fixed)
│           ├── Actief pakket — package <select> + ⚙️ Beheer button
│           ├── #spin-btn — 🎲 Draaien! (full column width)
│           ├── Items list — colour-coded chips, inline add/delete
│           └── Recente picks — last 8 spun items with timestamps
├── #result-modal    — full-screen celebration overlay (shown after spin)
├── #pkg-modal       — package manager overlay
└── #sync-drawer     — right-side slide-in panel for sync/login
```

### Canvas wheel
- Drawn with Canvas 2D API; segments coloured from 8-colour palette cycling
- Pointer: CSS `border-top` triangle fixed at 12 o'clock above canvas
- Spin: ease-out quartic, 4–5.5 s, 6–12 full rotations; winner = segment under `−π/2` pointer angle
- Tick sound via Web Audio API (short tone per segment crossing)
- Scales to fill available viewport: `min(viewportWidth − 320 − 108, viewportHeight − 120)`; recomputes on `resize`

### Result modal
Shown over the full screen after the wheel stops. Contains:
- Segment-colour accent bar + ambient glow blob behind text
- Picked item text (`clamp(1.8rem → 3.4rem)`) coloured to match segment
- 2×2 button grid: 🔊 Herhaal · ✕ Verwijder · 🎲 Opnieuw · ✓ Klaar
- Confetti (50 particles) + auto TTS on open
- Backdrop click or Escape to dismiss

### Package management
- Packages stored as array in `nl_wheel_pkgs`; active package ID in `nl_wheel_active`
- Default package: 15 Dutch conversation questions (`Hoe gaat het?`, etc.)
- ⚙️ Beheer modal: create / edit (name + textarea, one item per line) / delete; max 50 items each
- Inline add (Enter or + button) and inline delete (hover ×) in the items list
- Spin history (last 8) stored in `nl_wheel_hist` (local only, not synced)

### Preset packages — `data/plan/wheel_packages.json`
On startup, `_loadPresetPackages()` fetches `data/plan/wheel_packages.json` and merges preset packages (marked `preset: true`) into the user's package list. Presets are not deletable via the UI. Current presets:
- **A1** — Groeten & Introductie · Familie & Dagelijks Leven · Vervoer & Stad
- **A2** — Werk & Opleiding · Wonen in Nederland · Nieuws & Meningen

### localStorage keys
| Key | Content |
|---|---|
| `nl_wheel_pkgs` | `[{ id, name, items[], preset? }]` — all packages including presets (synced) |
| `nl_wheel_active` | Active package `id` string (local only) |
| `nl_wheel_hist` | `[{ text, color, ts }]` — last 8 spun items (local only) |

### Sync drawer
`#sync-section` lives inside `#sync-drawer` (right-side panel, `transform: translateX(105%)` → `translateX(0)`). A `MutationObserver` on `#sync-section` updates the nav avatar button on login/logout. Context class: `.sidebar-dark`.

---

## RSS Nieuws — `rss.html` / `assets/js/rss.js`

Live Dutch news reader. Fetches `nu.nl` RSS via the Cloudflare Worker `/rss` endpoint (7-day Upstash Redis cache + 1-hour in-memory cache). Articles rendered as accordion cards; word selection triggers a translation popup (MyMemory API, session cache `_trCache`).

### localStorage keys
| Key | Content |
|---|---|
| `nl_rss_cache_v1` | Client-side article cache (1 h TTL) |
| `nl_rss_v1` | `{ read: [], total: 0 }` — read article GUIDs + total count |
| `nl_rss_fs` | Font-size step index (0–4) |

---

## Podcast Luisteren — `podcast.html` / `assets/js/podcast.js`

Dutch podcast player for *Met het Oog op Morgen* (NPO Radio 1). Episodes fetched from Worker `/podcast` endpoint which parses the NPO RSS 2.0 XML feed, extracts `<enclosure>` audio URLs and `<itunes:duration>`, and caches in Upstash Redis (`podcast:npo:moem:v1`, 7-day TTL). Native `<audio preload="none">` per episode; accordion expand collapses others and pauses audio.

### localStorage keys
| Key | Content |
|---|---|
| `nl_podcast_cache_v1` | Client-side episode cache (1 h TTL) |
| `nl_podcast_v1` | `{ listened: [], total: 0 }` — listened episode GUIDs + total count |
| `nl_podcast_fs` | Font-size step index (0–4) |

---

## Zinnen Bouwen — `sentence.html` / `assets/js/sentence.js`

A2 sentence-building game. Loads Dutch vocabulary from `data/vocabularies/*.json` (user-selectable file groups). Each session: 5 randomly queued sentences shown in English; learner types or drag-builds the Dutch sentence.

### Modes
| Mode | Description |
|---|---|
| ⌨️ Typen | Type the Dutch sentence; live feedback while typing; Enter to check |
| 🧩 Bouwen | Click shuffled word tiles into answer zone; drag to reorder; tiles are lowercased with punctuation stripped |

### Scoring algorithm (5 layers)
1. **Exact** — normalised strings match → ✅ 3 XP
2. **Levenshtein ≤ max(2, len÷12)** — minor typo → ✅ 2 XP (type mode only)
3. **Sorted word set match** — right words, wrong order → 🔄 hint
4. **≥ 60% fuzzy word match** — shows missing words → 🟡 hint
5. **Otherwise** → ❌ retry; reveal button after 3 failed attempts

### Drag-and-drop system
Pointer-event based (mouse + touch). Ghost clone lifts on drag. Glowing insert caret (`#insert-caret`) slides to show drop position with `transition: left 0.1s`. On drop: FLIP animation snaps tiles to final positions (`translate → identity, 0.24 s cubic-bezier`). Click-to-add / click-to-remove always available as fallback.

### localStorage keys
| Key | Content |
|---|---|
| `nl_sentence_v1` | `{ date, count, streak, xp, lastGoalDate }` — synced |
| `nl_sentence_session_v1` | `{ date, queue, qIdx }` — today's queue + position; survives refresh; cleared on file-selection change |
| `nl_sentence_sel` | Selected file IDs array |
| `nl_sentence_fs` | Font-size step index (0–4) |

### Worker endpoints (Cloudflare — `worker/index.js`)
| Endpoint | Description |
|---|---|
| `POST /sync` | Bidirectional merge of 9 progress keys including `sentence` |
| `GET /rss` | Proxies `nu.nl` RSS; 2-layer cache (memory + Redis) |
| `GET /podcast` | Proxies NPO RSS feed; regex XML parser; 2-layer cache (memory + Redis) |

---

## Owner
Quang, Nguyen Dang — dqvn2002@gmail.com
