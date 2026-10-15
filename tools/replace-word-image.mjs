#!/usr/bin/env node
/* Replace the picture of one or more words with a chosen Wikimedia Commons file.
 *
 *   1) find candidates (prints "index  File:Title.jpg"):
 *        node tools/replace-word-image.mjs --search "glass of water"
 *   2) swap the picture (downloads it, center-crops to the standard size):
 *        node tools/replace-word-image.mjs --word "water" --word "water, het" --title "File:Glass of water ouside.jpg"
 *
 * --word is the Dutch word exactly as it appears in data/vocabularies (repeatable).
 * The picture is written over the word's existing file in assets/img/words/ (or a new
 * <slug>.jpg is created) and data/images.json is updated. Run the same --title for each
 * form of a word that should share the picture. Needs Pillow (see resize-word-images.py).
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(ROOT);

const API = 'https://commons.wikimedia.org/w/api.php';
const UA  = { 'User-Agent': 'dqvn-vocab-images/1.0 (personal language-learning project)' };
const WIDTH = 330;   // Wikimedia only serves standard thumbnail widths

const argv = process.argv.slice(2);
const flag = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : null; };
const all  = (n) => argv.flatMap((a, i) => (a === n ? [argv[i + 1]] : []));
const slug = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'word';

async function api(params) {
  const res = await fetch(`${API}?format=json&action=query&${params}`, { headers: UA });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return (await res.json()).query?.pages || {};
}

const q = flag('--search');
if (q) {
  const pages = Object.values(await api(`generator=search&gsrnamespace=6&gsrlimit=15&gsrsearch=${encodeURIComponent(q + ' filetype:bitmap')}&prop=imageinfo&iiprop=size%7Cmime`))
    .sort((a, b) => a.index - b.index);
  pages.forEach((p, i) => console.log(String(i).padStart(2), p.title, `(${p.imageinfo?.[0]?.width}x${p.imageinfo?.[0]?.height})`));
  process.exit(0);
}

const words = all('--word');
let title = flag('--title');
if (!words.length || !title) { console.error('Usage: see the header of this file (--search "<query>" | --word "<dutch>" ... --title "File:...")'); process.exit(1); }
if (!/^File:/i.test(title)) title = 'File:' + title;

const info = Object.values(await api(`titles=${encodeURIComponent(title)}&prop=imageinfo&iiprop=url%7Cmime&iiurlwidth=${WIDTH}`))[0]?.imageinfo?.[0];
if (!info?.thumburl) { console.error('File not found on Commons:', title); process.exit(1); }
const res = await fetch(info.thumburl.split('?')[0], { headers: UA });
if (!res.ok) { console.error('Download failed, HTTP', res.status); process.exit(1); }
const bytes = Buffer.from(await res.arrayBuffer());

const images = JSON.parse(fs.readFileSync('data/images.json', 'utf8'));
for (const w of words) {
  const cur = (images[w] || []).find(u => !/^https?:/.test(u));
  // always a .jpg after resizing; if the old file had another extension, replace it
  const rel = cur ? cur.replace(/\.\w+$/, '.jpg') : `assets/img/words/${slug(w)}.jpg`;
  if (cur && cur !== rel && fs.existsSync(cur)) fs.rmSync(cur);
  fs.mkdirSync(path.dirname(rel), { recursive: true });
  fs.writeFileSync(rel, bytes);   // raw download; the resize step below turns it into the standard size
  images[w] = [rel];
  console.log(`${w}  ->  ${rel}`);
}
fs.writeFileSync('data/images.json', JSON.stringify(images, null, 1) + '\n');

const py = spawnSync('python', ['tools/resize-word-images.py'], { stdio: 'inherit' });
process.exit(py.status ?? 1);
