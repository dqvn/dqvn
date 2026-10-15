#!/usr/bin/env node
/* Build data/images.json: { "<dutch word>": ["<image url>", ...] }
 *
 * Looks each word up by its ENGLISH meaning on English Wikipedia (free, no API
 * key) and keeps the page's lead-image thumbnail. Disambiguation pages are
 * skipped, so abstract words ("however", "one") mostly end up with no image —
 * that is intended (a wrong picture is worse than none).
 *
 * Existing entries in images.json are never overwritten, so you can hand-edit
 * the file (fix a wrong URL, add a 2nd/3rd URL) and re-run safely.
 *
 * Usage (from repo root):
 *   node tools/fetch-word-images.mjs core01 core02      # specific lessons
 *   node tools/fetch-word-images.mjs --all              # every lesson with "dutch"
 *   add --refresh to re-fetch words that already have an entry
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Paths below are relative to the repo root, whatever folder you run this from.
process.chdir(path.join(path.dirname(fileURLToPath(import.meta.url)), '..'));

const VOC = 'data/vocabularies';
const OUT = 'data/images.json';
const API = 'https://en.wikipedia.org/w/api.php';
const UA  = 'dqvn-vocab-images/1.0 (personal language-learning project)';

const args    = process.argv.slice(2);
const refresh = args.includes('--refresh');
const all     = args.includes('--all');
let lessons   = args.filter(a => !a.startsWith('--'));
if (all) lessons = fs.readdirSync(VOC).filter(f => f.endsWith('.json')).map(f => f.slice(0, -5));
if (!lessons.length) { console.error('Give lesson ids (e.g. core01) or --all'); process.exit(1); }

const images = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : {};

/** "to walk" / "the cat (animal)" / "cat, kitten" -> "walk" / "cat" / "cat" */
function query(english) {
  let s = String(english || '').toLowerCase().trim();
  s = s.replace(/\(.*?\)/g, ' ').split(/[,;/]/)[0].replace(/^(to|the|a|an)\s+/, '').replace(/\s+/g, ' ').trim();
  return s && s.split(' ').length <= 3 ? s : '';
}

const words = new Map();   // dutch -> english query
for (const id of lessons) {
  const file = path.join(VOC, id + '.json');
  if (!fs.existsSync(file)) { console.warn('skip (missing):', id); continue; }
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!Array.isArray(data)) continue;
  for (const e of data) {
    if (!e?.dutch || !e?.english) continue;
    if (images[e.dutch] && !refresh) continue;
    const q = query(e.english);
    if (q) words.set(e.dutch, q);
  }
}
console.log(`${words.size} words to look up in ${lessons.length} lesson(s)`);

const titles = [...new Set(words.values())];
const found  = new Map();   // english query -> thumbnail url

for (let i = 0; i < titles.length; i += 50) {
  const batch = titles.slice(i, i + 50);
  const url = `${API}?action=query&format=json&redirects=1&prop=pageimages%7Cpageprops&piprop=thumbnail&pithumbsize=400&pilimit=50&ppprop=disambiguation&titles=${encodeURIComponent(batch.join('|'))}`;
  let res;
  for (let attempt = 1; ; attempt++) {
    res = await fetch(url, { headers: { 'User-Agent': UA } });
    if (res.ok) break;
    if ((res.status === 429 || res.status >= 500) && attempt <= 6) {
      const wait = (Number(res.headers.get('retry-after')) || 15 * attempt) * 1000;
      console.warn(`  HTTP ${res.status}, retrying in ${wait / 1000}s`);
      await new Promise(r => setTimeout(r, wait));
      continue;
    }
    console.error('HTTP', res.status); process.exit(1);
  }
  const q = (await res.json()).query || {};

  // title as sent -> final page title (follow normalisation + redirects)
  const hop = {};
  for (const n of q.normalized || []) hop[n.from] = n.to;
  const redir = {};
  for (const r of q.redirects || []) redir[r.from] = r.to;
  const pages = {};
  for (const p of Object.values(q.pages || {})) pages[p.title] = p;

  for (const t of batch) {
    let cur = hop[t] || t;
    cur = redir[cur] || cur;
    const p = pages[cur] || pages[t.charAt(0).toUpperCase() + t.slice(1)];
    if (p && !p.pageprops?.disambiguation && p.thumbnail?.source) found.set(t, p.thumbnail.source.split('?')[0]);
  }
  console.log(`  ${Math.min(i + 50, titles.length)}/${titles.length}`);
  await new Promise(r => setTimeout(r, 1500));
}

let added = 0;
for (const [dutch, en] of words) {
  const u = found.get(en);
  if (u) { images[dutch] = [u]; added++; }
}

const sorted = Object.fromEntries(Object.keys(images).sort((a, b) => a.localeCompare(b)).map(k => [k, images[k]]));
fs.writeFileSync(OUT, JSON.stringify(sorted, null, 1) + '\n');
console.log(`added ${added}, no image for ${words.size - added}; total ${Object.keys(sorted).length} -> ${OUT}`);
