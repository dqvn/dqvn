# Dutch Verb Data

This folder contains Dutch verb conjugation data used by the **Verb Trainer** (`verbs.html`).

## Files

| File | Purpose |
|------|---------|
| `manifest.json` | Lesson index — lists all lesson files in display order |
| `v01.json` | Lesson 1: Core Dutch Verbs 01 |
| `v02.json` | Lesson 2: Core Dutch Verbs 02 |

## manifest.json schema

```json
[
  {
    "id":       "v01",
    "title":    "Lesson 1",
    "subtitle": "Core Dutch Verbs 01",
    "file":     "v01.json"
  }
]
```

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique identifier — also used as the `localStorage` key |
| `title` | string | Short label shown in sidebar (e.g. "Lesson 1") |
| `subtitle` | string | Longer description shown in sidebar and home screen |
| `file` | string | Filename relative to this folder |

## Verb entry schema

Each lesson file is a JSON array of verb objects:

```json
{
  "infinitive":  "aanbieden",
  "translation": "to offer",
  "type":        "separable / irregular (strong)",

  "present_ott": {
    "ik":             "bied aan",
    "jij":            "biedt aan",
    "hij_zij_het":    "biedt aan",
    "wij_jullie_zij": "bieden aan"
  },
  "past_ovt": {
    "ik_jij_hij_zij_het": "bood aan",
    "wij_jullie_zij":     "boden aan"
  },
  "present_perfect_vtt": {
    "auxiliary":      "hebben",
    "past_participle": "aangeboden"
  },
  "past_perfect_vvt": {
    "auxiliary":      "had/hadden",
    "past_participle": "aangeboden"
  },
  "future_ottt": {
    "ik":             "zal aanbieden",
    "wij_jullie_zij": "zullen aanbieden"
  }
}
```

### Field reference

| Field | Description |
|-------|-------------|
| `infinitive` | Base form of the verb |
| `translation` | English meaning |
| `type` | Verb class — see types below |
| `present_ott` | Present tense (Onvoltooid Tegenwoordige Tijd) |
| `past_ovt` | Simple past (Onvoltooid Verleden Tijd) |
| `present_perfect_vtt` | Present perfect (Voltooid Tegenwoordige Tijd) |
| `past_perfect_vvt` | Past perfect (Voltooid Verleden Tijd) |
| `future_ottt` | Future (Onvoltooid Toekomende Tijd) |

### Verb types

| Type string | Meaning |
|-------------|---------|
| `regular (weak)` | Regular verb — past tense with **-te / -den** |
| `irregular (strong)` | Irregular verb — vowel change in past tense |
| `separable / irregular (strong)` | Separable prefix verb with strong conjugation |
| `separable / regular (weak)` | Separable prefix verb with weak conjugation |
| `modal` | Modal auxiliary (kunnen, mogen, moeten …) |

### Auxiliary verbs

`auxiliary` in `present_perfect_vtt` / `past_perfect_vvt` is one of:

- `"hebben"` — action verbs that don't imply movement/change of state
- `"zijn"` — motion/state-change verbs
- `"hebben / zijn"` — both are accepted (e.g. *bewegen*)

## Adding a new lesson

1. Create `vXX.json` (e.g. `v03.json`) with an array of verb objects following the schema above.
2. Add an entry to `manifest.json`:
   ```json
   { "id": "v03", "title": "Lesson 3", "subtitle": "Core Dutch Verbs 03", "file": "v03.json" }
   ```
3. The Verb Trainer will pick it up automatically on next page load.
