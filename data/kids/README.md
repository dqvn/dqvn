# Kids Lesson Files – Generation Guide

## How to generate the next `lxx.json` from an image

### 1. Determine the filename
Scan existing files in `data/kids/` matching `l[0-9][0-9].json`.
The next file is the highest number + 1, zero-padded to 2 digits.
Example: if `l04.json` exists, create `l05.json`.

### 2. Read the words from the image
The physical card sheet shows words grouped by Dutch consonant cluster (e.g. **sl-**, **gl-**, **kl-**, **vl-**, **fl-**, **bl-**).
Read every word exactly as printed — do not correct spelling (the sheet may have handwritten corrections; use the final written version).

### 3. JSON template

```json
{
  "title": "Klik en Luister! 🗣️",
  "name": "<cluster> woorden",
  "subtitle": "Nhấn vào hình để nghe tiếng Hà Lan đọc chậm nhé!",
  "words": [
    { "text": "<dutch-word>", "emoji": "<best-matching-emoji>" }
  ]
}
```

| Field      | Value                                          | Notes                                      |
|------------|------------------------------------------------|--------------------------------------------|
| `title`    | `"Klik en Luister! 🗣️"`                       | Always the same — shown in content header  |
| `name`     | e.g. `"SL woorden"` or `"VL & FL woorden"`    | Short label shown in the sidebar           |
| `subtitle` | `"Nhấn vào hình để nghe tiếng Hà Lan đọc chậm nhé!"` | Always the same Vietnamese instruction |
| `words`    | Array of `{ "text", "emoji" }` objects         | One entry per card on the sheet            |

### 4. Emoji selection rules
- Pick the single emoji that best represents the word visually.
- For **verbs** (infinitives ending in `-en`): choose an action emoji (e.g. `blazen` → 💨, `vliegen` → ✈️).
- For **abstract/hard words**: pick the closest metaphor (e.g. `glad` = slippery → 🧊, `blind` → 🦯).
- Avoid repeating the same emoji within a file if possible.
- No emoji? Use a generic related symbol rather than leaving it blank.

### 5. Word order
Keep the same left-to-right, top-to-bottom reading order as the cards appear on the sheet.
The grid in the app is always **4 columns on desktop / 2 columns on mobile** — group words in rows of 3 or 4 to match the physical sheet layout.

### 6. `name` field convention
| Cards on sheet        | `name` value          |
|-----------------------|-----------------------|
| Only one cluster      | `"XX woorden"`        |
| Two clusters          | `"XX & YY woorden"`   |
| Three or more         | `"XX, YY & ZZ woorden"` |

### 7. No other files need updating
`kidsscript.js` auto-discovers all `lxx.json` files by probing sequentially until a 404.
Simply dropping the new file into `data/kids/` is enough — no manifest, no JS changes.

---

## Existing lessons

| File       | `name`            | Clusters       |
|------------|-------------------|----------------|
| `l01.json` | SL woorden        | sl-            |
| `l02.json` | GL & KL woorden   | gl-, kl-       |
| `l03.json` | VL & FL woorden   | vl-, fl-       |
| `l04.json` | BL woorden        | bl-            |
