#!/usr/bin/env node
/* Work through the ⚑ image reports copied from the portal feedback inbox ("Kopieer JSON").
 *
 *   1) save the copied JSON to a file, e.g. reports.json
 *   2) see what was reported and which replacement photos Commons offers:
 *        node tools/apply-image-reports.mjs reports.json
 *   3) either swap a word's picture for a candidate (see replace-word-image.mjs):
 *        node tools/replace-word-image.mjs --word "<dutch>" --title "File:..."
 *      or drop the picture so the word falls back to its emoji:
 *        node tools/apply-image-reports.mjs reports.json --drop [--min 2]
 *
 * --drop removes the word's entry from data/images.json, deletes the file in
 * assets/img/words/ and removes the hint's search phrase (so a pipeline re-run does not
 * fetch the same kind of photo again). --min N only handles words reported at least N times.
 * Only files that look like assets/img/words/<name>.jpg are ever deleted.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

process.chdir(path.join(path.dirname(fileURLToPath(import.meta.url)), '..'));

const argv = process.argv.slice(2);
const mi = argv.indexOf('--min');
const file = argv.find((a, i) => !a.startsWith('--') && (mi < 0 || i !== mi + 1));
if (!file) { console.error('Usage: see the header of this file'); process.exit(1); }
const min = +(argv[argv.indexOf('--min') + 1] || 1) || 1;
const drop = argv.includes('--drop');

const reports = JSON.parse(fs.readFileSync(file, 'utf8')).filter(r => r.word && (r.reports || 1) >= min);
const images = JSON.parse(fs.readFileSync('data/images.json', 'utf8'));
const hints  = JSON.parse(fs.readFileSync('data/image-hints.json', 'utf8'));
const SAFE = /^assets\/img\/words\/[\w.-]+\.jpg$/;
const UA = { 'User-Agent': 'dqvn-vocab-images/1.0 (personal language-learning project)' };

async function candidates(q) {
  const url = 'https://commons.wikimedia.org/w/api.php?format=json&action=query&generator=search&gsrnamespace=6&gsrlimit=8'
    + `&gsrsearch=${encodeURIComponent(q + ' filetype:bitmap')}&prop=imageinfo&iiprop=size`;
  const res = await fetch(url, { headers: UA });
  if (!res.ok) return [`(HTTP ${res.status})`];
  const pages = Object.values((await res.json()).query?.pages || {}).sort((a, b) => a.index - b.index);
  return pages.map(p => `${p.title} (${p.imageinfo?.[0]?.width}x${p.imageinfo?.[0]?.height})`);
}

let dropped = 0;
for (const r of reports) {
  const cur = images[r.word];
  console.log(`\n${r.word}  [${r.english || ''}]  ${r.lesson || ''}  x${r.reports || 1}  ${cur ? cur[0] : '(no photo now)'}`);
  if (r.kind && r.kind !== 'photo') console.log('  drawn card — fix it in tools/make-*-images.py instead');
  if (drop) {
    if (!cur) continue;
    for (const u of cur) if (SAFE.test(u) && fs.existsSync(u)) fs.rmSync(u);
    delete images[r.word];
    if (hints[r.word]) delete hints[r.word].q;
    dropped++;
    console.log('  dropped → emoji ' + (hints[r.word]?.e || '(none!)'));
  } else {
    const q = hints[r.word]?.q || r.english || r.word;
    for (const c of await candidates(q)) console.log('  ' + c);
    await new Promise(ok => setTimeout(ok, 1500));   // Commons rate-limits quickly
  }
}
if (drop) {
  fs.writeFileSync('data/images.json', JSON.stringify(images, null, 1) + '\n');
  fs.writeFileSync('data/image-hints.json', JSON.stringify(hints, null, 1) + '\n');
  console.log(`\n${dropped} picture(s) dropped`);
}
