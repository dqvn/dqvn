#!/usr/bin/env node
/* Image coverage report for the VanStart vocabulary lessons.
 *
 *   node tools/check-word-images.mjs                  # per-lesson table + totals + problems
 *   node tools/check-word-images.mjs --missing        # also list every word with no photo
 *   node tools/check-word-images.mjs --missing --lesson ch05
 *   node tools/check-word-images.mjs --nothing        # only words with no photo AND no emoji
 *
 * For each word (entry with a "dutch" field in data/vocabularies/*.json):
 *   photo = data/images.json has a path whose file exists on disk
 *   emoji = no photo, but data/image-hints.json has an "e"
 *   none  = neither
 * Problems reported: images.json paths pointing to missing files, entries that
 * are still remote http(s) URLs, and files in assets/img/words/ nothing uses.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Paths below are relative to the repo root, whatever folder you run this from.
process.chdir(path.join(path.dirname(fileURLToPath(import.meta.url)), '..'));

const VOC = 'data/vocabularies';
const IMG_DIR = 'assets/img/words';
const args = process.argv.slice(2);
const listMissing = args.includes('--missing') || args.includes('--nothing');
const onlyNothing = args.includes('--nothing');
const li = args.indexOf('--lesson');
const onlyLesson = li >= 0 ? args[li + 1] : null;

const read = f => (fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : {});
const images = read('data/images.json');
const hints  = read('data/image-hints.json');

const used = new Set();
const brokenPaths = [], remote = [];
for (const [word, urls] of Object.entries(images)) {
  for (const u of urls) {
    if (/^https?:/.test(u)) remote.push(word);
    else if (fs.existsSync(u)) used.add(path.basename(u));
    else brokenPaths.push(`${word} -> ${u}`);
  }
}
const hasPhoto = w => (images[w] || []).some(u => !/^https?:/.test(u) && fs.existsSync(u));

const lessons = fs.readdirSync(VOC).filter(f => f.endsWith('.json')).map(f => f.slice(0, -5)).sort();
const rows = [];
const total = { words: 0, photo: 0, emoji: 0, none: 0 };
const seenWords = new Set();   // a word repeated in several lessons counts once in "unique"
let uniquePhoto = 0, uniqueAny = 0;

for (const id of lessons) {
  if (onlyLesson && id !== onlyLesson) continue;
  let data;
  try { data = JSON.parse(fs.readFileSync(path.join(VOC, id + '.json'), 'utf8')); } catch { continue; }
  if (!Array.isArray(data) || !data.some(e => e?.dutch)) continue;   // other formats (e.g. 4000.json)

  const r = { id, words: 0, photo: 0, emoji: 0, none: 0, missing: [] };
  for (const e of data) {
    if (!e?.dutch) continue;
    r.words++;
    const w = e.dutch;
    let state;
    if (hasPhoto(w)) state = 'photo';
    else if (hints[w]?.e) state = 'emoji';
    else state = 'none';
    r[state]++;
    if (state !== 'photo' && (!onlyNothing || state === 'none')) r.missing.push(`${w}  (${e.english})${state === 'emoji' ? '  [emoji ' + hints[w].e + ']' : ''}`);
    if (!seenWords.has(w)) { seenWords.add(w); if (state === 'photo') uniquePhoto++; if (state !== 'none') uniqueAny++; }
  }
  for (const k of ['words', 'photo', 'emoji', 'none']) total[k] += r[k];
  rows.push(r);
}

const pct = (n, d) => (d ? Math.round((100 * n) / d) + '%' : '-').padStart(4);
console.log('lesson   words  photo  emoji  none   covered');
for (const r of rows) {
  console.log(`${r.id.padEnd(8)} ${String(r.words).padStart(5)}  ${String(r.photo).padStart(5)}  ${String(r.emoji).padStart(5)}  ${String(r.none).padStart(4)}   ${pct(r.photo + r.emoji, r.words)}`);
}
console.log('-'.repeat(48));
console.log(`${'TOTAL'.padEnd(8)} ${String(total.words).padStart(5)}  ${String(total.photo).padStart(5)}  ${String(total.emoji).padStart(5)}  ${String(total.none).padStart(4)}   ${pct(total.photo + total.emoji, total.words)}`);
console.log(`unique Dutch words: ${seenWords.size}; with photo ${uniquePhoto}, with photo or emoji ${uniqueAny}`);

if (listMissing) {
  for (const r of rows) if (r.missing.length) console.log(`\n${r.id} (${r.missing.length}):\n  ` + r.missing.join('\n  '));
}

const orphans = fs.existsSync(IMG_DIR) ? fs.readdirSync(IMG_DIR).filter(f => !used.has(f)) : [];
if (brokenPaths.length || remote.length || orphans.length) {
  console.log('\nProblems:');
  if (brokenPaths.length) console.log(`  ${brokenPaths.length} images.json path(s) point to a missing file, e.g. ${brokenPaths.slice(0, 3).join('; ')}`);
  if (remote.length) console.log(`  ${remote.length} entr${remote.length === 1 ? 'y is' : 'ies are'} still remote URLs (run tools/download-word-images.mjs)`);
  if (orphans.length) console.log(`  ${orphans.length} file(s) in ${IMG_DIR} not used by images.json, e.g. ${orphans.slice(0, 3).join(', ')}`);
} else console.log('\nNo problems found.');
