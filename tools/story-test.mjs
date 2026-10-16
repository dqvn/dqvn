#!/usr/bin/env node
/* Try the Worker's POST /story with random vocabulary, the way game.js does.
 *
 *   node tools/story-test.mjs                  # 10 random words from a random lesson
 *   node tools/story-test.mjs thema03          # …from data/vocabularies/thema03.json
 *   node tools/story-test.mjs core01 10        # 10 words
 *   WORKER_URL=http://localhost:8787 node tools/story-test.mjs     # e.g. wrangler dev
 *   WORDS="huis,fiets,de vriendschap" node tools/story-test.mjs     # fixed words
 *
 * Prints the words sent, the story, and which words the story seems to use
 * (approximate: looks for each word's stem, ignoring de/het/een). Counts against
 * the Worker's per-IP limit (1 request / 10 s, 40 / day).
 */
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const WORKER = process.env.WORKER_URL || 'https://nl-sync.itho.workers.dev';
const dir    = join(dirname(fileURLToPath(import.meta.url)), '..', 'data', 'vocabularies');

const count   = Number(process.argv[3]) || 10;
const size    = name => { try { return JSON.parse(readFileSync(join(dir, name + '.json'), 'utf8')).length; } catch { return 0; } };
const lessons = readdirSync(dir).filter(f => f.endsWith('.json')).map(f => f.slice(0, -5));
// a random lesson must have at least `count` words (the game's story uses 10 words)
const big     = lessons.filter(l => size(l) >= count);
const lesson  = process.argv[2] || (big.length ? big : lessons)[Math.floor(Math.random() * (big.length ? big : lessons).length)];

const list = JSON.parse(readFileSync(join(dir, lesson + '.json'), 'utf8')).filter(w => w?.dutch);
const pick = [...list].sort(() => Math.random() - 0.5).slice(0, Math.min(count, list.length));
// same transform as game.js generateStory(); WORDS="a,b,c" overrides it (to compare models on the same input)
const words = process.env.WORDS ? process.env.WORDS.split(',').map(w => w.trim()) : pick.map(w => w.dutch.split(',')[0].trim());

console.log(`Lesson ${lesson} — ${words.length} random words:\n  ${words.join(' | ')}\n`);

const t0  = Date.now();
const res = await fetch(WORKER + '/story', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ words }),
});
const body = await res.json().catch(() => ({}));
console.log(`POST ${WORKER}/story → HTTP ${res.status} in ${Date.now() - t0} ms`);
if (!res.ok) { console.log(body); process.exit(1); }

console.log('\n' + body.story + '\n');

const story = body.story.toLowerCase();
const used = [], missing = [];
for (const w of words) {
  const forms = w.toLowerCase().split(/\s+-\s+|\s*\/\s*/)
    .map(f => f.replace(/\(.*?\)/g, '').replace(/^(de|het|een)\s+/, '').replace(/[!?.]/g, '').trim()).filter(Boolean);
  (forms.some(f => story.includes(f)) ? used : missing).push(w);
}
console.log(`Words used: ${used.length}/${words.length}` + (missing.length ? `   missing: ${missing.join(' | ')}` : ''));
const dutch = body.story.split('[')[0];
const nWords = dutch.trim().split(/\s+/).filter(Boolean).length;
console.log(`Dutch story: ${nWords} words (max 50)${nWords > 50 ? '  ← TOO LONG' : ''} · total ${body.story.length} chars (cap 1200)`);
