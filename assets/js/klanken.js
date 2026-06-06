'use strict';
/* ══════════════════════════════════════════════════════
   klanken.js  –  Dutch phonetics learning app logic
   Data is loaded from data/klanken.json at startup.
══════════════════════════════════════════════════════ */

/* ── State ── */
let DATA = null;
const state = { catIdx: -1, sndIdx: -1, shown: [] };

function pickRandom(arr, n) {
  return [...arr].sort(() => Math.random() - 0.5).slice(0, n);
}

/* ── Progress ── */
let progress = {};
function loadProg() { try { progress = JSON.parse(localStorage.getItem('klanken-v1') || '{}'); } catch {} }
function saveProg() { localStorage.setItem('klanken-v1', JSON.stringify(progress)); }
function setDone(catId, sndId) { progress[catId + ':' + sndId] = 1; saveProg(); }
function isDone(catId, sndId)  { return !!progress[catId + ':' + sndId]; }

/* ── Volume ── */
let volume = 1.0;
const _VOL_KEY = 'nl_vocab_vol'; // shared key used by all pages

function initVolume() {
  // Prefer shared key; fall back to legacy klanken-vol for existing users
  let pct;
  try {
    const shared = JSON.parse(localStorage.getItem(_VOL_KEY));
    if (shared && typeof shared.v === 'number') {
      pct = shared.v;
    } else {
      const legacy = parseFloat(localStorage.getItem('klanken-vol'));
      pct = isNaN(legacy) ? 100 : Math.round(legacy * 100);
    }
  } catch { pct = 100; }
  volume = pct / 100;
  const slider = document.getElementById('vol-slider');
  const label  = document.getElementById('vol-val');
  if (slider) { slider.value = pct; slider.style.setProperty('--vp', pct + '%'); }
  if (label)  label.textContent = pct + '%';
}

function setVolume(val) {
  volume = parseInt(val) / 100;
  document.getElementById('vol-val').textContent = val + '%';
  document.getElementById('vol-slider').style.setProperty('--vp', val + '%');
  localStorage.setItem('klanken-vol', volume); // legacy compat
  try { localStorage.setItem(_VOL_KEY, JSON.stringify({ v: parseInt(val), t: Date.now() })); } catch {}
}

/* ── TTS ── */
let dutchVoice = null;

function initTTS() {
  const v = speechSynthesis.getVoices();
  if (v.length) populateVoices();
  speechSynthesis.onvoiceschanged = populateVoices;
}

function populateVoices() {
  const all   = speechSynthesis.getVoices();
  const dutch = all.filter(v => v.lang.startsWith('nl'));
  const list  = dutch.length ? dutch : all;
  const saved = localStorage.getItem('klanken-voice');
  const sel   = document.getElementById('voice-select');

  if (!list.length) {
    sel.innerHTML = '<option disabled>Geen stemmen gevonden</option>';
    document.getElementById('no-voice').classList.add('show');
    return;
  }

  sel.innerHTML = list.map(v => `<option value="${v.name}">${v.name} (${v.lang})</option>`).join('');

  const preferred = list.find(v => v.name === saved)
    || list.find(v => v.lang === 'nl-NL') || list[0];
  dutchVoice = preferred;
  sel.value  = preferred.name;
  document.getElementById('no-voice').classList.toggle('show', dutch.length === 0);
}

function selectVoice(name) {
  dutchVoice = speechSynthesis.getVoices().find(v => v.name === name) || dutchVoice;
  localStorage.setItem('klanken-voice', name);
  speak('Hallo! Luister naar mijn stem.', 0.88);
}

function speak(text, rate, onEnd) {
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang   = 'nl-NL';
  if (dutchVoice) u.voice = dutchVoice;
  u.rate   = rate || 0.88;
  u.pitch  = 1.05;
  u.volume = volume;
  setWave(true);
  u.onend = u.onerror = () => { setWave(false); if (onEnd) onEnd(); };
  speechSynthesis.speak(u);
}

function setWave(on) {
  document.querySelectorAll('.wave').forEach(w => w.classList.toggle('playing', on));
}

function speakSequence(words, rate, gap) {
  speechSynthesis.cancel();
  setWave(true);
  let i = 0;
  function next() {
    if (i >= words.length) { setWave(false); return; }
    const u = new SpeechSynthesisUtterance(words[i++]);
    u.lang = 'nl-NL';
    if (dutchVoice) u.voice = dutchVoice;
    u.rate = rate; u.pitch = 1.05; u.volume = volume;
    u.onend  = () => { if (i >= words.length) setWave(false); else setTimeout(next, gap); };
    u.onerror = () => setWave(false);
    speechSynthesis.speak(u);
  }
  next();
}

/* ── Sidebar sound nav ── */
function renderSoundNav() {
  document.getElementById('sound-nav').innerHTML = DATA.categories.map((cat, ci) => {
    const items = cat.sounds.map((s, si) => {
      const active = (ci === state.catIdx && si === state.sndIdx);
      const done   = isDone(cat.id, s.id);
      return `
        <div class="sb-sound-item${active ? ' active' : ''}"
             id="sbi-${ci}-${si}"
             style="--sbi-c:${cat.color};--sbi-bg:${cat.bg}"
             onclick="openSound(${ci},${si})">
          <span class="sb-spell" style="color:${cat.color}">${s.spell}</span>
          <span class="sb-ipa">${s.ipa}</span>
          ${done ? `<span class="sb-star" style="color:${cat.color}">★</span>` : ''}
        </div>`;
    }).join('');
    return `
      <div class="sb-cat-group" id="sbg-${ci}">
        <div class="sb-cat-hdr" onclick="toggleCat(${ci})">
          <div class="sb-cat-dot" style="background:${cat.color}"></div>
          <span class="sb-cat-name">${cat.emoji} ${cat.name}</span>
          <span class="sb-chevron">▾</span>
        </div>
        <div class="sb-cat-items">${items}</div>
      </div>`;
  }).join('');
}

function toggleCat(ci) {
  document.getElementById(`sbg-${ci}`).classList.toggle('collapsed');
}

/* ── Open sound ── */
function openSound(ci, si) {
  state.catIdx = ci;
  state.sndIdx = si;
  document.querySelectorAll('.sb-sound-item').forEach(el => el.classList.remove('active'));
  const item = document.getElementById(`sbi-${ci}-${si}`);
  if (item) { item.classList.add('active'); item.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }
  const cat = DATA.categories[ci];
  const snd = cat.sounds[si];
  document.getElementById('mob-cur').textContent = `🎵 ${snd.spell} — ${cat.name}`;
  // Persist so next session reopens here
  localStorage.setItem('klanken-last', JSON.stringify({ catId: cat.id, sndId: snd.id }));
  closeMobileDrawer();
  renderDetail();
  document.getElementById('welcome').style.display = 'none';
  document.getElementById('detail').classList.add('show');
}

/* ── Render detail ── */
function renderDetail() {
  const cat   = DATA.categories[state.catIdx];
  const snd   = cat.sounds[state.sndIdx];
  const total = cat.sounds.length;
  const si    = state.sndIdx;

  function hl(word, ph) {
    const i = word.toLowerCase().indexOf(ph.toLowerCase());
    if (i < 0) return word;
    return word.slice(0, i) + `<span class="hl">${word.slice(i, i + ph.length)}</span>` + word.slice(i + ph.length);
  }

  const dots = cat.sounds.map((_, i) => {
    let c = 'prog-dot';
    if (i < si || isDone(cat.id, cat.sounds[i].id)) c += ' done';
    if (i === si) c += ' current';
    return `<div class="${c}" style="--cc:${cat.color}"></div>`;
  }).join('');

  state.shown = pickRandom(snd.pool, 6);
  const exCards = state.shown.map(ex => `
    <div class="ex-card" style="--cc:${cat.color};--cc-bg:${cat.bg}"
         onclick="speakEx(event,'${ex.w}')">
      <span class="ex-emoji">${ex.e}</span>
      <div class="ex-word">${hl(ex.w, ex.hl)}</div>
      <div class="ex-meaning">${ex.m}</div>
    </div>`).join('');

  const isLast = si === total - 1;

  document.getElementById('detail').innerHTML = `
    <div class="detail-topbar">
      <div class="detail-cat-lbl">
        <span>${cat.emoji}</span> ${cat.name}
        <span style="color:var(--muted);font-weight:600;font-size:12px"> — ${cat.nameVN}</span>
      </div>
      <span class="detail-counter">${si + 1} / ${total}</span>
    </div>
    <div class="phoneme-card" style="--cc:${cat.color};--cc-bg:${cat.bg}">
      <div class="phoneme-spelling">${snd.spell}</div>
      <div class="phoneme-ipa">${snd.ipa}</div>
      <div class="wave">
        <div class="wave-bar"></div><div class="wave-bar"></div>
        <div class="wave-bar"></div><div class="wave-bar"></div>
        <div class="wave-bar"></div><div class="wave-bar"></div>
        <div class="wave-bar"></div>
      </div>
      <div class="play-row">
        <button class="play-btn btn-main" style="background:${cat.color}" onclick="playMain()">▶ Luister</button>
        <button class="play-btn btn-slow" style="color:${cat.color};border-color:${cat.color};background:${cat.bg}" onclick="playSlow()">🐢 Langzaam</button>
      </div>
    </div>
    <div class="tip-card" style="--cc:${cat.color};border-left-color:${cat.color}">
      <div class="tip-label">🇻🇳 Gợi ý phát âm</div>
      <div class="tip-main">${snd.tipVN}</div>
      <div class="tip-mouth">👄 ${snd.mouth}</div>
    </div>
    <div class="ex-label">Ví dụ từ — Voorbeeldwoorden (nhấp để nghe)</div>
    <div class="ex-row" style="--cc:${cat.color};--cc-bg:${cat.bg}">${exCards}</div>
    <div class="bottom-nav">
      <button class="nav-btn" ${si === 0 ? 'disabled' : ''} onclick="moveSnd(-1)">← Vorige</button>
      <div class="prog-dots">${dots}</div>
      <button class="nav-btn btn-next" style="background:${cat.color}" onclick="moveSnd(1)">
        ${isLast ? '✓ Klaar!' : 'Volgende →'}
      </button>
    </div>`;
}

/* ── TTS actions ── */
function playMain() {
  const snd = DATA.categories[state.catIdx].sounds[state.sndIdx];
  speak(snd.spell.split(' / ')[0].trim(), 0.88);
}

function playSlow() {
  const snd = DATA.categories[state.catIdx].sounds[state.sndIdx];
  const primary = snd.spell.split(' / ')[0].trim();
  speakSequence([primary, ...state.shown.map(e => e.w)], 0.5, 1500);
}

function speakEx(evt, word) {
  const card = evt.currentTarget;
  speechSynthesis.cancel();
  speak(word, 0.82, () => card.classList.remove('playing'));
  card.classList.add('playing');
}

/* ── Navigation ── */
function moveSnd(delta) {
  const cat  = DATA.categories[state.catIdx];
  const next = state.sndIdx + delta;
  if (delta > 0) setDone(cat.id, cat.sounds[state.sndIdx].id);
  if (next >= cat.sounds.length) {
    renderSoundNav();
    popStars();
    toast('🎉 Geweldig! Alle klanken in deze categorie geleerd!');
    return;
  }
  if (next < 0) return;
  openSound(state.catIdx, next);
}

/* ── Mobile drawer ── */
function openMobileDrawer() {
  document.getElementById('sidebar').classList.add('open');
  document.getElementById('drawer-overlay').classList.add('show');
}
function closeMobileDrawer() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('drawer-overlay').classList.remove('show');
}

/* ── Effects ── */
function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => { el.textContent = ''; }, 350); // clear after fade-out
  }, 3400);
}

function popStars() {
  const g = ['⭐', '🌟', '✨', '🎉', '🏆', '🌈', '🎊'];
  for (let i = 0; i < 10; i++) {
    setTimeout(() => {
      const s = document.createElement('div');
      s.className  = 'star-pop';
      s.textContent = g[i % g.length];
      s.style.cssText = `left:${15 + Math.random() * 70}vw;top:${20 + Math.random() * 50}vh`;
      document.body.appendChild(s);
      setTimeout(() => s.remove(), 950);
    }, i * 90);
  }
}

/* ══════════════════════════════════════════════════════
   BOOT — fetch data then initialise
══════════════════════════════════════════════════════ */
async function init() {
  try {
    const res = await fetch('data/klanken/klanken.json');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    DATA = await res.json();
  } catch (err) {
    console.error('Kan klanken.json niet laden:', err);
    document.getElementById('welcome').innerHTML =
      '<div class="welcome-logo">⚠️</div><h2>Fout bij laden</h2>' +
      '<p>Start de app via een lokale webserver:<br><code>npx serve .</code></p>';
    return;
  }
  loadProg();
  initTTS();
  initVolume();
  renderSoundNav();

  /* Deep-link: ?start=next opens the first sound not yet marked done */
  if (new URLSearchParams(location.search).get('start') === 'next') {
    let opened = false;
    outer: for (let ci = 0; ci < DATA.categories.length; ci++) {
      const cat = DATA.categories[ci];
      for (let si = 0; si < cat.sounds.length; si++) {
        if (!isDone(cat.id, cat.sounds[si].id)) {
          openSound(ci, si);
          opened = true;
          break outer;
        }
      }
    }
    if (!opened) restoreLastSound(); /* all complete — fall back to last visited */
  } else {
    restoreLastSound();
  }

  document.getElementById('mob-menu-btn').addEventListener('click', openMobileDrawer);
  document.getElementById('drawer-overlay').addEventListener('click', closeMobileDrawer);
}

function restoreLastSound() {
  try {
    const saved = JSON.parse(localStorage.getItem('klanken-last'));
    if (!saved) return;
    const ci = DATA.categories.findIndex(c => c.id === saved.catId);
    if (ci < 0) return;
    const si = DATA.categories[ci].sounds.findIndex(s => s.id === saved.sndId);
    if (si < 0) return;
    openSound(ci, si);
  } catch {}
}

init();
