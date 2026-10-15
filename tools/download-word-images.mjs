#!/usr/bin/env node
/* Download the remote images listed in data/images.json into assets/img/words/
 * and rewrite the entries to local paths.
 *
 *   node tools/download-word-images.mjs
 *
 * Safe to re-run: entries that are already local paths are skipped, and files
 * already on disk are reused. Progress is saved every 100 downloads, so an
 * interrupted run loses nothing.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Paths below are relative to the repo root, whatever folder you run this from.
process.chdir(path.join(path.dirname(fileURLToPath(import.meta.url)), '..'));

// Wikimedia thumbnails can be served at any width: ask for a smaller one than
// the 500px stored in images.json (thumbs show at ~100px, the viewer at <=320px).
const WIDTH = 330;   // Wikimedia only serves standard widths (250, 330, 500, 960 ...); 320 gives HTTP 400
const JSON_FILE = 'data/images.json';
const DIR       = 'assets/img/words';
const UA        = 'dqvn-vocab-images/1.0 (personal language-learning project)';

const images = JSON.parse(fs.readFileSync(JSON_FILE, 'utf8'));
fs.mkdirSync(DIR, { recursive: true });

const slug = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'word';

const save = () => fs.writeFileSync(JSON_FILE, JSON.stringify(images, null, 1) + '\n');
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function download(url, file) {
  for (let attempt = 1; attempt <= 6; attempt++) {
    const res = await fetch(url, { headers: { 'User-Agent': UA } });
    if (res.ok) { fs.writeFileSync(file, Buffer.from(await res.arrayBuffer())); return true; }
    if (res.status === 429 || res.status >= 500) {
      const wait = (Number(res.headers.get('retry-after')) || 15 * attempt) * 1000;
      console.warn(`  HTTP ${res.status}, retrying in ${wait / 1000}s`);
      await sleep(wait);
      continue;
    }
    console.warn('  skip', res.status, url);
    return false;
  }
  return false;
}

const claimed = new Map();
// Reserve names of images already downloaded in an earlier run, so a resumed
// run can't hand the same filename to a different word.
for (const [word, urls] of Object.entries(images))
  for (const u of urls) if (!/^https?:/.test(u)) claimed.set(path.basename(u), word);
let done = 0, failed = 0, n = 0;
const total = Object.values(images).flat().filter(u => /^https?:/.test(u)).length;
console.log(`${total} remote images to download`);

for (const [word, urls] of Object.entries(images)) {
  for (let i = 0; i < urls.length; i++) {
    if (!/^https?:/.test(urls[i])) continue;
    const ext  = (path.extname(new URL(urls[i]).pathname).toLowerCase().match(/^\.(jpe?g|png|webp|gif|svg)$/) || ['.jpg'])[0];
    // Different Dutch keys can slug to the same name (e.g. two "uur" entries):
    // each filename is claimed by the first word that asks for it.
    const base = slug(word) + (i ? '-' + (i + 1) : '');
    let name = base, k = 2;
    while (claimed.has(name + ext) && claimed.get(name + ext) !== word) name = base + '-' + k++;
    claimed.set(name + ext, word);
    const file = path.join(DIR, name + ext);
    if (await download(urls[i].replace(/_unscaled$/, '').replace(/\/\d+px-/, `/${WIDTH}px-`), file)) {
      images[word][i] = `${DIR}/${name}${ext}`;
      done++;
    } else failed++;
    if (++n % 100 === 0) { save(); console.log(`  ${n}/${total} (${failed} failed)`); }
    await sleep(250);
  }
}
save();
console.log(`downloaded ${done}, failed ${failed} (failed ones keep their remote URL)`);
