#!/usr/bin/env node
/* For words with no picture yet, search Wikimedia Commons (free, no key) with
 * the hand-written search phrase in data/image-hints.json and add the best
 * photo's URL to data/images.json.
 *
 *   node tools/search-word-images.mjs            # all words that have a "q" hint
 *   node tools/search-word-images.mjs --lesson ch05
 *
 * Only words WITHOUT an images.json entry are touched. Afterwards run
 * tools/download-word-images.mjs to store the new photos locally.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Paths below are relative to the repo root, whatever folder you run this from.
process.chdir(path.join(path.dirname(fileURLToPath(import.meta.url)), '..'));

const HINTS = 'data/image-hints.json';
const OUT   = 'data/images.json';
const API   = 'https://commons.wikimedia.org/w/api.php';
const UA    = 'dqvn-vocab-images/1.0 (personal language-learning project)';
const sleep = ms => new Promise(r => setTimeout(r, ms));

const args   = process.argv.slice(2);
const li     = args.indexOf('--lesson');
const lesson = li >= 0 ? args[li + 1] : null;

const hints = JSON.parse(fs.readFileSync(HINTS, 'utf8'));
let only = null;
if (lesson) only = new Set(JSON.parse(fs.readFileSync(`data/vocabularies/${lesson}.json`, 'utf8')).map(e => e.dutch));

// Re-read right before work AND right before writing, so a concurrent
// download-word-images run isn't clobbered.
const have = JSON.parse(fs.readFileSync(OUT, 'utf8'));
const todo = Object.entries(hints).filter(([w, h]) => h.q && !have[w]?.length && (!only || only.has(w)));
console.log(`${todo.length} words to search`);

async function search(q) {
  const url = `${API}?action=query&format=json&generator=search&gsrnamespace=6&gsrlimit=8` +
    `&gsrsearch=${encodeURIComponent(q + ' filetype:bitmap')}` +
    `&prop=imageinfo&iiprop=url%7Csize%7Cmime&iiurlwidth=500`;
  for (let attempt = 1; attempt <= 6; attempt++) {
    const res = await fetch(url, { headers: { 'User-Agent': UA } });
    if (res.ok) {
      const pages = Object.values((await res.json()).query?.pages || {}).sort((a, b) => a.index - b.index);
      for (const p of pages) {
        const ii = p.imageinfo?.[0];
        // real photos only: jpeg/png, reasonably big, not a tiny icon
        if (ii && /^image\/(jpeg|png)$/.test(ii.mime) && ii.width >= 600 && ii.height >= 400 && ii.thumburl) return ii.thumburl.split('?')[0];
      }
      return null;
    }
    if (res.status === 429 || res.status >= 500) { await sleep((Number(res.headers.get('retry-after')) || 15 * attempt) * 1000); continue; }
    return null;
  }
  return null;
}

const found = {};
let n = 0;
for (const [word, h] of todo) {
  const u = await search(h.q);
  if (u) found[word] = [u];
  console.log(`  ${++n}/${todo.length} ${u ? 'OK  ' : 'none'} ${word}  <- ${h.q}`);
  await sleep(700);
}

const fresh = JSON.parse(fs.readFileSync(OUT, 'utf8'));
let added = 0;
for (const [w, urls] of Object.entries(found)) if (!fresh[w]?.length) { fresh[w] = urls; added++; }
const sorted = Object.fromEntries(Object.keys(fresh).sort((a, b) => a.localeCompare(b)).map(k => [k, fresh[k]]));
fs.writeFileSync(OUT, JSON.stringify(sorted, null, 1) + '\n');
console.log(`added ${added} photo(s); ${todo.length - added} without a photo (they fall back to the emoji)`);
