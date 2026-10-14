# Workflow: add a new dialogue JSON (`cNNN.json`)

_Updated 2026-10-14._ Goal: video link → transcript → `cNNN.json`, with Claude doing the formatting.

## 0. One-time: create placeholder files for a new batch

PowerShell:

```powershell
101..120 | ForEach-Object { Set-Content -Path ("c{0:D3}.json" -f $_) -Value "{}" }
```

- An empty `{}` file is a placeholder. The next free slot is the first file that is still `{}`.
- `dialogues.html` discovers `c001`…`c200` automatically (prefixes a–e); there is no index to edit.

## 1. Get the transcript (you do this part)

Claude cannot do this step: YouTube blocks its requests (IP block / HTTP 429 after ~2 videos), and the tactiq page builds the transcript with JavaScript, so a plain fetch only sees a landing page. Use your own browser:

1. Open the link below, replacing `VIDEO_ID` (e.g. `8xUhDES_Ag4`):

   ```
   https://tactiq.io/tools/run/youtube_transcript?yt=https%3A%2F%2Fwww.youtube.com%2Fshorts%2FVIDEO_ID
   ```

2. Copy the whole result. The `# tactiq.io …` header, title, URL and timestamped lines are fine; Claude strips them.
3. Paste it to Claude, one video per message, in list order.

Alternatives: youtubetotranscript.com, or YouTube's "Show transcript" in the description.

## 2. What to send Claude

Just paste the transcript. The header gives the title and video ID.

- Optional first line: `continue`, `next`, or a file number like `c150` to force which file to use.
- If the title or ID is missing, add the video link or its `#number` from your list.
- Claude writes to the next free file (c121 → c122 → …) and says which file it used.

## 3. What Claude does

File: `data/dialogues/cNNN.json`, 2-space indent, UTF-8, validated with `json.load`.

```json
{
  "dialogue_title": "<video title, emoji and '| channel' suffix removed>",
  "language": "Dutch",
  "video_url": "https://www.youtube.com/shorts/<ID>",
  "roles": { "A": "<role>", "B": "<role>" },
  "conversation": [
    { "role": "A", "text": "…", "translation": "…" }
  ]
}
```

- **URL:** always `https://…/shorts/<ID>`.
- **Roles:** A = whoever speaks first. Role names in Dutch (Klant, Ober, Dokter, Agent …). Use `Sofie (Patiënt)` style for named characters. A third role `C` is allowed when a third voice exists (the app supports A, B, C …).
- **Speakers:** captions have no speaker labels and lines run together (`"…mee. Ja, het moet…"`). Claude splits turns from the meaning; A/B usually alternate. Guesses are flagged in the reply — check them against the video.
- **Cleanup:**
  - drop timestamps and markers like `[zucht]`, `[gelach]`, `[muziek]`, `[snakt naar adem]`
  - drop stray trailing letters/characters (`H`, `M.`, `y`, Japanese characters)
  - drop the channel outro ("Laat het weten in de reacties")
- **Caption errors seen so far:** vooraf→veraf, glazens→glazen, rijes→rij E, vide→vijfde, tramvier→tram 4, Sopie→Sophie, deuner→döner, bezborgen→bezorgen, "Pomp VI"→"pomp 6", dus→uw, voorttaan→voortaan. If a fix is a guess, Claude says so.
- **Punctuation:** capitals, `?`/`!`, commas. Prices as `€15` / `€12,50` in Dutch and `€12.50` in English.
- **Translation:** natural English, one per line.
- **Truncated captions** (ends mid-word): keep the last complete line and tell you.
- **Not a dialogue** (grammar lesson such as c152): one role `A`, or alternate A/B as an exercise; one sentence per line. Tell Claude which you prefer.
- **Titles must be unique:** if two files share a title, Claude renames the new one (e.g. "Bij de Bakker" → "Bij de Bakker – Brood Kopen").

## 4. Checks after each batch

Ask Claude: _"check duplicates"_.

- every file parses as JSON
- video IDs are unique across all `cNNN.json` (and new links are not already used)
- titles are unique

Last check: 160 files, 160 distinct video IDs.

## 5. Learner feedback loop

`dialogues.html` has a ⚑ button on every line and a "Fout melden" button for the whole dialogue. Reports land in the portal feedback inbox (type `bug`) as `[c121 · regel 5 · A] …` with a link that opens `dialogues.html?id=c121&line=4` (line highlighted). Fix the JSON, done.

Limit: 1 report per IP per 5 minutes (worker rate limit).

## 6. Status

c121–c160 created from tactiq transcripts. Not committed yet.

---

## Original prompt

Kept for use in any other AI tool; Claude in this project does not need it.

```text
Task: Extract the transcript from the following YouTube video and format it into a structured JSON object for language learning.

Video URL: www.youtube.com/shorts/<ID>

JSON Requirements:
Include dialogue_title, language, and video_url.
Roles: Identify the speakers and map them to keys "A" and "B" in a roles object.
Conversation Array: Create a conversation list where each object contains:
  "role": (A or B)
  "text": The original Dutch text.
  "translation": A natural English translation.
Cleanup:
  Remove all timestamps and technical markers (like [00:00:00]).
  Correct any obvious transcription errors from the auto-captions.
  Ensure proper Dutch punctuation (capitalization, question marks).
Formatting: Provide only the JSON code block.
```

Why this prompt works:

- **Role mapping** forces the AI to distinguish between speakers instead of listing lines.
- **Correction instruction** fixes auto-transcripts that lack punctuation/capitals ("goedemiddag" vs "Goedemiddag!").
- **Translation** asks for a natural meaning, not word-for-word.
- **"Only JSON"** avoids chatter, so it can be pasted straight into a file.
