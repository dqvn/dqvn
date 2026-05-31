'use strict';

// ── Elements ─────────────────────────────────────────────────────
const sidebar  = document.getElementById('sidebar');
const overlay  = document.getElementById('drawer-overlay');
const dlgList  = document.getElementById('dlg-list');
const welcome  = document.getElementById('welcome');
const view     = document.getElementById('view');
const mobCur   = document.getElementById('mob-cur');

// ── Lesson cache (file path → parsed JSON data) ───────────────────
const lessonCache = {};
const KIDS_LESSON_KEY = 'kids_last_lesson';

// ── Auto-discover lxx.json files by probing until 404 ────────────
async function discoverLessons() {
  const lessons = [];
  let n = 1;
  while (true) {
    const slug = 'l' + String(n).padStart(2, '0');         // l01, l02 …
    const file = 'data/kids/' + slug + '.json';
    try {
      const r = await fetch(file);
      if (!r.ok) break;
      const data = await r.json();
      lessonCache[file] = data;
      lessons.push({ id: slug.toUpperCase(), file, name: data.name || data.title || slug.toUpperCase() });
      n++;
    } catch {
      break;
    }
  }
  return lessons;
}

// ── Build sidebar list ────────────────────────────────────────────
function buildSidebar(lessons) {
  dlgList.innerHTML = '';
  if (!lessons.length) {
    dlgList.innerHTML = '<div class="sb-no-results">Geen lessen gevonden</div>';
    return;
  }
  lessons.forEach(lesson => {
    const item = document.createElement('div');
    item.className = 'dlg-item';
    item.innerHTML = `
      <div class="dlg-id">${lesson.id}</div>
      <div class="dlg-name-row"><div class="dlg-name">${lesson.name}</div></div>
    `;
    item.addEventListener('click', () => loadLesson(lesson, item));
    dlgList.appendChild(item);
  });
}

// ── Load a lesson ─────────────────────────────────────────────────
function loadLesson(lesson, itemEl) {
  dlgList.querySelectorAll('.dlg-item').forEach(i => i.classList.remove('active'));
  itemEl.classList.add('active');
  mobCur.textContent = lesson.name;
  try { localStorage.setItem(KIDS_LESSON_KEY, lesson.file); } catch {}
  closeSidebar();

  const cached = lessonCache[lesson.file];
  if (cached) {
    renderLesson(cached);
    return;
  }
  fetch(lesson.file)
    .then(r => { if (!r.ok) throw new Error('Kan ' + lesson.file + ' niet laden'); return r.json(); })
    .then(data => { lessonCache[lesson.file] = data; renderLesson(data); })
    .catch(err => {
      document.getElementById('lesson-title').textContent = 'Fout!';
      document.getElementById('lesson-subtitle').textContent = err.message;
      document.getElementById('vocab-grid').innerHTML = '';
      welcome.style.display = 'none';
      view.style.display = 'flex';
    });
}

// ── Render lesson data ────────────────────────────────────────────
function renderLesson(data) {
  document.getElementById('lesson-title').textContent = data.title;
  document.getElementById('lesson-subtitle').textContent = data.subtitle || '';

  const grid = document.getElementById('vocab-grid');
  grid.innerHTML = '';
  data.words.forEach(item => {
    const card = document.createElement('div');
    card.className = 'k-card';
    card.onclick = () => speak(item.text);
    card.innerHTML = `
      <div class="k-emoji">${item.emoji}</div>
      <div class="k-word">${item.text}</div>
    `;
    grid.appendChild(card);
  });

  welcome.style.display = 'none';
  view.style.display = 'flex';
}

// ── Init: discover lessons → build sidebar → auto-load first ─────
(async function init() {
  try {
    const lessons = await discoverLessons();
    buildSidebar(lessons);
    if (lessons.length) {
      const saved = localStorage.getItem(KIDS_LESSON_KEY);
      const target = saved ? lessons.find(l => l.file === saved) : null;
      const lesson = target || lessons[0];
      const idx    = target ? lessons.indexOf(target) : 0;
      const item   = dlgList.querySelectorAll('.dlg-item')[idx];
      loadLesson(lesson, item);
    }
  } catch (err) {
    dlgList.innerHTML = `<div class="sb-no-results">${err.message}</div>`;
  }
}());

// ── TTS voice management (same key + logic as vanstart.html) ─────
const TTS_VOICE_KEY = 'nl_tts_voice_v1';
let selectedVoice = null;

function getPreferredVoice() {
  const voices = window.speechSynthesis.getVoices();
  const saved  = localStorage.getItem(TTS_VOICE_KEY);
  if (saved) { const m = voices.find(v => v.name === saved); if (m) return m; }
  return voices.find(v => v.name.includes('Microsoft Colette Online') && v.lang === 'nl-NL')
      || voices.find(v => v.name.includes('Google Nederlands')        && v.lang === 'nl-NL')
      || voices.find(v => v.lang === 'nl-NL')
      || voices.find(v => v.lang === 'nl-BE')
      || voices.find(v => v.lang.startsWith('nl'))
      || null;
}

function _populateVoiceSelector() {
  const sel = document.getElementById('tts-voice-select');
  if (!sel) return;
  const dutch = window.speechSynthesis.getVoices().filter(v => v.lang.startsWith('nl'));
  const saved = localStorage.getItem(TTS_VOICE_KEY);
  sel.innerHTML = '';
  if (!dutch.length) {
    const opt = document.createElement('option');
    opt.textContent = 'No Dutch voices found'; opt.disabled = true;
    sel.appendChild(opt); return;
  }
  dutch.forEach(v => {
    const opt = document.createElement('option');
    opt.value = v.name;
    opt.textContent = `${v.lang === 'nl-BE' ? '🇧🇪' : '🇳🇱'} ${v.localService ? '💻' : '☁️'} ${v.name}`;
    sel.appendChild(opt);
  });
  const preferred = getPreferredVoice();
  sel.value = saved && dutch.find(v => v.name === saved) ? saved
            : (preferred ? preferred.name : dutch[0].name);
  _applyVoiceFromSelector();
}

function _applyVoiceFromSelector() {
  const sel = document.getElementById('tts-voice-select');
  if (!sel || !sel.value) return;
  const found = window.speechSynthesis.getVoices().find(v => v.name === sel.value);
  if (found) {
    selectedVoice = found;
    const nameEl = document.getElementById('tts-name');
    if (nameEl) nameEl.textContent = found.name;
  }
}

// Init: sync attempt + voiceschanged + polling fallback + iOS touchstart
selectedVoice = getPreferredVoice();
_populateVoiceSelector();

window.speechSynthesis.addEventListener('voiceschanged', () => {
  selectedVoice = getPreferredVoice();
  _populateVoiceSelector();
});

(function _pollForVoices() {
  let tries = 0;
  const t = setInterval(() => {
    const dutch = window.speechSynthesis.getVoices().filter(v => v.lang.startsWith('nl'));
    if (dutch.length || ++tries >= 20) {
      clearInterval(t);
      if (dutch.length) { selectedVoice = getPreferredVoice(); _populateVoiceSelector(); }
    }
  }, 500);
}());

document.addEventListener('touchstart', function _iosProbe() {
  window.speechSynthesis.getVoices();
  setTimeout(_populateVoiceSelector, 200);
}, { once: true });

document.getElementById('tts-voice-select').addEventListener('change', function () {
  localStorage.setItem(TTS_VOICE_KEY, this.value);
  _applyVoiceFromSelector();
  speak('Hallo!');
});

// ── TTS speak ─────────────────────────────────────────────────────
function speak(text) {
  if (!('speechSynthesis' in window)) { alert('Your browser does not support speech synthesis.'); return; }
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang   = 'nl-NL';
  u.rate   = 0.7;
  u.pitch  = 1.2;
  u.volume = 1;
  if (selectedVoice) u.voice = selectedVoice;
  window.speechSynthesis.speak(u);
}

// ── Mobile sidebar ────────────────────────────────────────────────
function openSidebar()  { sidebar.classList.add('open');    overlay.classList.add('on'); }
function closeSidebar() { sidebar.classList.remove('open'); overlay.classList.remove('on'); }

document.getElementById('mob-menu-btn').addEventListener('click', openSidebar);
overlay.addEventListener('click', closeSidebar);

// Footer year
const yearEl = document.getElementById('year');
if (yearEl) yearEl.textContent = '© ' + new Date().getFullYear();
