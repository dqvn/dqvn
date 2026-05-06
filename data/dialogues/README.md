# 🇳🇱 Dialoog Oefenen — User Guide

Dutch dialogue practice tool. Open `dialogues.html` in a browser (best served via a local web server such as `npx serve .`).

---

## Getting started

1. **Select a dialogue** from the left menu (desktop) or tap ☰ (mobile).
2. **Pick your role** — click one of the colour-coded role buttons (A, B, C …).
3. **Read along** in Group mode, or enable **Solo Practice** to let TTS read the other roles aloud.

---

## The interface

### Sidebar / dialogue list
- Shows all available dialogues with their ID (`c001`, `c002` …) and title.
- Filled dots **●●●** next to a title count how many times you have completed that dialogue (up to 5 dots, then `+N`).
- A daily **streak** counter appears at the top of the sidebar when you visit on consecutive days.
- Use the **search box** to filter by ID or title keywords.
- The **⟳ reload button** (top-right of the mobile bar) clears the local cache and re-fetches all dialogue files fresh from the server.

### Mobile top bar (mobile only)
| Button | Purpose |
|---|---|
| ☰ Hamburger | Opens the dialogue list drawer |
| 🔍 Search | Opens the drawer and focuses the search input |
| ☀️ Wake lock | Keeps the screen on while practising — glows amber when active. On by default; tap to toggle. Persisted across sessions. |
| ⟳ Reload | Clears local cache and re-fetches all dialogues from the server |

### Header card
| Control | Purpose |
|---|---|
| **Role buttons** (A / B / C …) | Select the role you will read. Click the same button again to deselect (shows all lines). |
| **Solo Practice toggle** | Activates TTS mode. The app reads the other role(s) aloud; you read your own lines. |
| **🐢 🚶 🏃 speed buttons** | Sets TTS playback speed (slow / normal / fast). Always visible — affects both Solo Practice and click-to-listen. |
| **A− / A+** | Decreases or increases the conversation text size. |
| **Volume slider** | Controls TTS speaker volume (0 – 100 %). The speaker icon dims when muted. |

### Conversation area
- **Your role lines** are highlighted with an orange border.
- **Other roles** show animated `···` dots until TTS reaches them (Solo Practice mode).
- **Click any Dutch sentence** to hear it spoken aloud at the current speed and volume. The inline wave animation plays while speaking.
- Lines dim after TTS has passed them.

### TTS sticky bar (Solo Practice only)
| Element | Meaning |
|---|---|
| Progress bar | Thin orange bar at the top — shows how far through the dialogue you are. |
| Wave + status text | Pulses orange while TTS is speaking. |
| 🔊 Hear my line button | Appears on **your turn only** — lets TTS read your line aloud so you can hear and learn pronunciation before speaking it yourself. Tap as many times as needed. |
| 🔁 Repeat button | Replays the last TTS line (the other role's previous sentence). |
| ⏹ Stop button | Stops TTS and resets to the beginning. |
| **✅ Klaar! — Done** | Green pulsing button — tap when you have finished your own line to advance. |
| **▶ Start Solo Practice** | Begins the session from line 1. |
| **⏩ Verder vanaf zin X / Y** | Resumes a previously interrupted session from where you left off. |

### Keyboard shortcuts
| Key | Action |
|---|---|
| `Space` | Done — same as tapping the green Done button |
| `H` | Hear my line — TTS reads your current line (only active on your turn) |
| `R` | Repeat — replays the last TTS line (the other role's sentence) |
| `Esc` | Close the mobile sidebar drawer |

---

## Session persistence

The app automatically saves your state in the browser's **localStorage** every time you make a change:

- Last open dialogue, selected role, Solo Practice on/off
- TTS position within a dialogue (resume on next visit)
- TTS speed, text size, and volume
- Wake lock on/off preference
- Completion count and last-completed date per dialogue
- Daily streak

All dialogue content is also **cached** locally (AES-256-GCM encrypted) so it loads instantly on repeat visits without a network request.  
To force a fresh download, tap the **⟳** reload button in the mobile top bar.

---

## Dialogue JSON format

Each dialogue is a single `.json` file stored in this folder.

```json
{
  "dialogue_title": "IJs Kopen – Nederlands Gesprek bij de IJssalon",
  "language": "Dutch",
  "video_url": "https://www.youtube.com/shorts/o9UWHar-gp4",
  "roles": {
    "A": "Verkoper (Vendor)",
    "B": "Klant (Customer)"
  },
  "conversation": [
    { "role": "A", "text": "Goedemiddag! Wat wilt u?", "translation": "Good afternoon! What would you like?" },
    { "role": "B", "text": "Ik wil graag een ijsje.", "translation": "I would like an ice cream." }
  ]
}
```

### Field reference

| Field | Required | Description |
|---|---|---|
| `dialogue_title` | ✅ | Display name shown in the sidebar and header |
| `language` | ✅ | Language label shown as a badge (`"Dutch"`) |
| `video_url` | optional | Full YouTube Shorts URL — embedded as a vertical player in the header |
| `roles` | ✅ | Object mapping role keys (`"A"`, `"B"`, …) to display names |
| `conversation` | ✅ | Ordered array of lines — see below |

### Conversation line

| Field | Required | Description |
|---|---|---|
| `role` | ✅ | Must match a key in `roles` |
| `text` | ✅ | Dutch sentence spoken aloud by TTS |
| `translation` | optional | English gloss shown in italic below the Dutch line |

---

## Naming convention & discovery

Files follow the pattern **`<prefix><3-digit-number>.json`**:

```
c001.json  c002.json  …  c080.json
d001.json  d002.json  …
```

The app discovers files automatically by probing each prefix (`a` through `e`) sequentially from `001` upward and stopping at the first missing number — **no manifest file is needed**.

### Adding a new dialogue

1. Name the file following the convention: next number after the last existing file in the series (e.g. `c081.json`).
2. Fill in the JSON using the schema above.
3. Place the file in this folder (`data/dialogues/`).
4. Tap **⟳ Reload** in the app (or clear browser cache) — the new dialogue appears in the sidebar automatically.

### Adding a new prefix series

To start a `d` series, create `d001.json`. The app will discover it on the next reload.  
Supported prefixes out of the box: `a` `b` `c` `d` `e`.

---

## Role colours

Up to **5 roles** per dialogue are supported with distinct colours:

| Key | Default colour |
|---|---|
| A | Blue |
| B | Orange |
| C | Green |
| D | Purple |
| E | Teal |

Role names can be anything — include both Dutch and English for clarity, e.g. `"Verkoper (Vendor)"`.

---

## Running locally

```bash
# Option 1 — Node
npx serve .

# Option 2 — Python
python -m http.server 8080
```

Then open `http://localhost:3000/dialogues.html` (or whichever port is shown).

> Opening `dialogues.html` directly as a `file://` URL works but may trigger browser CORS restrictions that prevent JSON loading. A local server is recommended.

---

## Technical notes

| Topic | Detail |
|---|---|
| No build step | Pure HTML + CSS + JS — edit files directly |
| TTS engine | Web Speech API (`nl-NL`); role A/C/E → male voice, role B/D → female voice; pitch fallback when only one Dutch voice is available |
| Wake Lock API | Prevents screen sleep on mobile; supported in Chrome, Edge, Brave (not Firefox) |
| Cache encryption | AES-256-GCM via Web Crypto API; PBKDF2 key derivation (60 000 iterations) |
| Viewport | Uses `100dvh` (dynamic) — correct on iOS Safari with browser chrome |
| Browser support | Any modern browser (Chrome, Edge, Firefox, Safari) |
