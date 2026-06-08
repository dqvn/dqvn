/* Dutch Verb Trainer — game logic */
'use strict';

/* ─────────────────────────────────────────────────────────────────────────────
   CONSTANTS & STATE
───────────────────────────────────────────────────────────────────────────── */
const SESS           = 7;    /* verbs per study session */
const QUIZ_N         = 15;   /* questions per quiz */
const LEARNED_THRESH = 0.2;  /* min accuracy to count a verb as "learned" */
const STORE_KEY      = 'nl_verbs_v3';
const THEME_KEY      = 'nl_verbs_theme';
const FONT_KEY       = 'nl_verbs_font';

/* Each entry: { stack: CSS font-family string, google: Google Fonts family param or null } */
const VERB_FONTS = {
  /* ── System (no download) ── */
  sans:        { stack: "system-ui, 'Segoe UI', sans-serif",                         google: null },
  serif:       { stack: "Georgia, 'Times New Roman', serif",                          google: null },
  mono:        { stack: "Consolas, 'Courier New', monospace",                         google: null },
  palatino:    { stack: "'Palatino Linotype', Palatino, 'Book Antiqua', serif",       google: null },
  /* ── Language-learning / linguistics ── */
  gentium:     { stack: "'Gentium Plus', serif",                                      google: 'Gentium+Plus' },
  charis:      { stack: "'Charis SIL', serif",                                        google: 'Charis+SIL' },
  lexend:      { stack: "'Lexend', sans-serif",                                       google: 'Lexend' },
  atkinson:    { stack: "'Atkinson Hyperlegible', sans-serif",                        google: 'Atkinson+Hyperlegible' },
  /* ── Classic / Dutch & European publishing ── */
  garamond:    { stack: "'EB Garamond', serif",                                       google: 'EB+Garamond' },
  baskerville: { stack: "'Libre Baskerville', serif",                                 google: 'Libre+Baskerville' },
  crimson:     { stack: "'Crimson Text', serif",                                      google: 'Crimson+Text' },
  playfair:    { stack: "'Playfair Display', serif",                                  google: 'Playfair+Display' },
  lora:        { stack: "'Lora', serif",                                              google: 'Lora' },
  /* ── Modern / screen-optimised ── */
  merri:       { stack: "'Merriweather', serif",                                      google: 'Merriweather' },
  sourceserif: { stack: "'Source Serif 4', serif",                                    google: 'Source+Serif+4' },
  ibmplex:     { stack: "'IBM Plex Serif', serif",                                    google: 'IBM+Plex+Serif' },
  noto:        { stack: "'Noto Serif', serif",                                        google: 'Noto+Serif' },
  opensans:    { stack: "'Open Sans', sans-serif",                                    google: 'Open+Sans' },
  nunito:      { stack: "'Nunito', sans-serif",                                       google: 'Nunito' },
};
const CONF_COLORS = ['#e74c3c','#3b82f6','#10b981','#8b5cf6','#f59e0b','#ec4899','#06b6d4','#84cc16'];

const FS_STEPS  = [13, 15, 17, 19, 23, 28, 34];
const FS_LABELS = ['Small', 'Normal', 'Large', 'X-Large', 'XX-Large', 'Huge', 'Max'];

const st = {
  manifest:      [],
  currentLesson: null,
  all:           [],
  session:       [],
  studyIdx:      0,
  questions:     [],
  qIdx:          0,
  correct:       0,
  streak:        0,
  bestStreak:    0,
  store:         null,
  ttsSeq:        0,
  sidebarOpen:   false,
  studyOrigin:   'home', /* 'home' | 'list' — controls where study-back goes */
};

/* ─────────────────────────────────────────────────────────────────────────────
   HELPERS
───────────────────────────────────────────────────────────────────────────── */
const $  = id => document.getElementById(id);
const el = (tag, cls, html) => {
  const e = document.createElement(tag);
  if (cls)  e.className = cls;
  if (html) e.innerHTML = html;
  return e;
};

function shuffle(a) {
  const b = [...a];
  for (let i = b.length - 1; i > 0; i--) {
    const j = 0 | Math.random() * (i + 1);
    [b[i], b[j]] = [b[j], b[i]];
  }
  return b;
}

function show(id) {
  ['s-home','s-study','s-quiz','s-results','s-list'].forEach(s => {
    const e = $(s);
    if (s === id) { e.classList.add('active'); e.scrollTop = 0; }
    else e.classList.remove('active');
  });
  /* Sync mobile top bar */
  const onHome = id === 's-home';
  const mobBack = $('mob-back'), mobHam = $('hamburger');
  if (mobBack) mobBack.style.display = onHome ? 'none' : 'flex';
  if (mobHam)  mobHam.style.display  = onHome ? 'flex'  : 'none';
  const screenTitles = { 's-study': '📖 Study', 's-quiz': '🎯 Quiz', 's-results': '🏆 Results', 's-list': '📚 Browse' };
  $('mob-cur').textContent = onHome
    ? (st.currentLesson ? (st.currentLesson.subtitle || st.currentLesson.title) : 'Dutch Verb Trainer')
    : (screenTitles[id] || '');
}

/* ─────────────────────────────────────────────────────────────────────────────
   STORAGE  —  multi-layer defence against corruption / quota / private mode
───────────────────────────────────────────────────────────────────────────── */
function mkStore() {
  return { version: 3, streak: 0, lastStudy: null, lastLesson: null, lessons: {}, fsIndex: 1 };
}

function mkLessonData() {
  return { sessions: 0, totalCorrect: 0, totalAnswered: 0, verbStats: {} };
}

function readStore() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return mkStore();
    const obj = JSON.parse(raw);
    if (!obj || typeof obj !== 'object' || obj.version !== 3) return mkStore();
    if (!obj.lessons || typeof obj.lessons !== 'object') obj.lessons = {};
    if (typeof obj.streak !== 'number') obj.streak = 0;
    return obj;
  } catch {
    return mkStore();
  }
}

function writeStore() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(st.store));
  } catch (e) {
    const isQuota = e && (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED');
    if (isQuota) {
      try {
        /* Prune verbStats to free space, keep session counters */
        Object.values(st.store.lessons).forEach(l => { l.verbStats = {}; });
        localStorage.setItem(STORE_KEY, JSON.stringify(st.store));
      } catch { /* storage fully unavailable — continue silently */ }
    }
    /* SecurityError (private browsing with quota 0) — ignore */
  }
}

function applyFontSize(idx) {
  idx = Math.max(0, Math.min(FS_STEPS.length - 1, idx));
  st.store.fsIndex = idx;
  $('content').style.fontSize = FS_STEPS[idx] + 'px';
  const lbl = $('sb-fs-lbl');
  if (lbl) lbl.textContent = FS_LABELS[idx];
  document.querySelectorAll('.fs-pill-dec').forEach(b => { b.disabled = idx === 0; });
  document.querySelectorAll('.fs-pill-inc').forEach(b => { b.disabled = idx === FS_STEPS.length - 1; });
  const sbDec = $('sb-fs-dec'), sbInc = $('sb-fs-inc');
  if (sbDec) sbDec.disabled = idx === 0;
  if (sbInc) sbInc.disabled = idx === FS_STEPS.length - 1;
  writeStore();
}

function getLessonData() {
  const id = st.currentLesson?.id;
  if (!id) return mkLessonData();
  if (!st.store.lessons[id] || typeof st.store.lessons[id] !== 'object') {
    st.store.lessons[id] = mkLessonData();
  }
  const d = st.store.lessons[id];
  /* Guard against partial corruption of sub-fields */
  if (typeof d.sessions      !== 'number') d.sessions      = 0;
  if (typeof d.totalCorrect  !== 'number') d.totalCorrect  = 0;
  if (typeof d.totalAnswered !== 'number') d.totalAnswered = 0;
  if (!d.verbStats || typeof d.verbStats !== 'object') d.verbStats = {};
  return d;
}

/* ─────────────────────────────────────────────────────────────────────────────
   TTS
───────────────────────────────────────────────────────────────────────────── */
let _voices = [];
if (window.speechSynthesis) {
  _voices = speechSynthesis.getVoices();
  speechSynthesis.addEventListener('voiceschanged', () => {
    _voices = speechSynthesis.getVoices();
    populateVoiceSelect(); /* refresh dropdown when browser loads async voices */
  });
}

function speak(text) {
  if (!window.speechSynthesis || !text) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'nl-NL';
  u.rate = 0.88;
  /* Prefer stored voice name; fall back to any Dutch voice */
  let v = st.store?.ttsVoice
    ? _voices.find(x => x.name === st.store.ttsVoice)
    : null;
  if (!v) v = _voices.find(x => x.lang.startsWith('nl')) || _voices.find(x => x.lang === 'nl-NL');
  if (v) u.voice = v;
  speechSynthesis.speak(u);
}

function populateVoiceSelect() {
  const sel = $('tts-voice-select');
  if (!sel) return;
  const dutch = _voices.filter(v => v.lang.startsWith('nl'));
  if (!dutch.length) {
    sel.innerHTML = '<option value="">No Dutch voices found</option>';
    return;
  }
  const saved  = st.store?.ttsVoice;
  /* Use saved name if still available; otherwise default to first Dutch voice */
  const active = dutch.find(v => v.name === saved) ? saved : dutch[0].name;
  sel.innerHTML = dutch.map(v => {
    /* Strip " - Language (Country)" suffix from Microsoft voice names */
    const label = v.name.replace(/ - [^-]+$/, '');
    return `<option value="${v.name}"${v.name === active ? ' selected' : ''}>${label}</option>`;
  }).join('');
  /* Auto-persist the resolved voice if it changed */
  if (st.store && active !== saved) {
    st.store.ttsVoice = active;
    writeStore();
  }
}

/* ─────────────────────────────────────────────────────────────────────────────
   THEME
───────────────────────────────────────────────────────────────────────────── */
const _loadedFonts = new Set();
function loadGoogleFont(family) {
  if (!family || _loadedFonts.has(family)) return;
  _loadedFonts.add(family);
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = `https://fonts.googleapis.com/css2?family=${family}:ital,wght@0,400;0,700;1,400&display=swap`;
  document.head.appendChild(link);
}

function applyVerbFont(key) {
  const font = VERB_FONTS[key] || VERB_FONTS.sans;
  if (font.google) loadGoogleFont(font.google);
  document.documentElement.style.setProperty('--verb-font', font.stack);
  const sel = $('sb-font-sel');
  if (sel) sel.value = key;
  try { localStorage.setItem(FONT_KEY, key); } catch {}
}

function applyTheme(dark) {
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
  const btn = $('sb-theme-tog');
  if (btn) btn.classList.toggle('on', dark);
  try { localStorage.setItem(THEME_KEY, dark ? 'dark' : 'light'); } catch {}
}

/* ─────────────────────────────────────────────────────────────────────────────
   WAKE LOCK  (keeps screen on while studying)
───────────────────────────────────────────────────────────────────────────── */
let _wakeLock = null;

function syncWakeButtons(on) {
  $('mob-wake-btn').classList.toggle('wake-on', on);
  const sb = $('sb-wake-tog');
  if (sb) sb.classList.toggle('on', on);
}

async function acquireWakeLock() {
  if (!('wakeLock' in navigator)) { syncWakeButtons(false); return; }
  try {
    _wakeLock = await navigator.wakeLock.request('screen');
    syncWakeButtons(true);
    _wakeLock.addEventListener('release', () => {
      _wakeLock = null;
      syncWakeButtons(false);
    });
  } catch { syncWakeButtons(false); }
}

function toggleWakeLock() {
  if (!('wakeLock' in navigator)) return;
  if (_wakeLock) { _wakeLock.release(); }
  else { acquireWakeLock(); }
}

/* Re-acquire after page visibility restored (iOS releases it on tab switch) */
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && _wakeLock === null
      && $('mob-wake-btn').classList.contains('wake-on')) {
    acquireWakeLock();
  }
});

/* ─────────────────────────────────────────────────────────────────────────────
   SIDEBAR
───────────────────────────────────────────────────────────────────────────── */
function toggleSidebar(force) {
  const open = force !== undefined ? force : !st.sidebarOpen;
  st.sidebarOpen = open;
  $('sidebar').classList.toggle('open', open);
  $('drawer-overlay').classList.toggle('on', open);
}

function lessonAccClass(ld) {
  if (!ld || !ld.totalAnswered) return 'new';
  const acc = ld.totalCorrect / ld.totalAnswered;
  if (acc >= 0.8) return 'good';
  if (acc >= 0.5) return 'ok';
  return 'weak';
}

function lessonAccLabel(ld) {
  if (!ld || !ld.totalAnswered) return 'New';
  return Math.round(ld.totalCorrect / ld.totalAnswered * 100) + '%';
}

function renderSidebar() {
  const list = $('lesson-list');
  if (!st.manifest.length) {
    list.innerHTML = '<div class="sb-err">No lessons found.</div>';
    return;
  }
  list.innerHTML = st.manifest.map(lesson => {
    const ld          = st.store.lessons[lesson.id];
    const cls         = lessonAccClass(ld);
    const lbl         = lessonAccLabel(ld);
    const active      = st.currentLesson?.id === lesson.id ? ' active' : '';
    const verbStats   = ld?.verbStats || {};
    const learnedCount = Object.values(verbStats).filter(s => s.correct / Math.max(s.seen, 1) > LEARNED_THRESH).length;
    const total       = lesson.verbCount;
    const meta        = total
      ? `${learnedCount} / ${total} learned`
      : learnedCount > 0 ? `${learnedCount} learned` : '';
    return `
      <div class="lesson-item${active}" data-id="${lesson.id}">
        <div class="lesson-num">${lesson.title}</div>
        <div class="lesson-title-row">
          <span class="lesson-title">${lesson.subtitle || lesson.title}</span>
          <span class="lesson-acc ${cls}">${lbl}</span>
        </div>
        <div class="lesson-meta">${meta}</div>
      </div>`;
  }).join('');

  list.querySelectorAll('.lesson-item').forEach(item => {
    item.addEventListener('click', () => {
      const lesson = st.manifest.find(l => l.id === item.dataset.id);
      if (lesson) selectLesson(lesson);
      toggleSidebar(false);
    });
  });

  const sk = st.store.streak || 0;
  $('sb-streak').textContent = sk > 0 ? `🔥 ${sk}-day streak` : '';
  $('ft-year').textContent   = new Date().getFullYear();
}

/* ─────────────────────────────────────────────────────────────────────────────
   MANIFEST LOADING
───────────────────────────────────────────────────────────────────────────── */
async function loadManifest() {
  /* Primary: manifest.json */
  try {
    const r = await fetch('data/verbs/manifest.json');
    if (r.ok) {
      const data = await r.json();
      if (Array.isArray(data) && data.length) { st.manifest = data; return; }
    }
  } catch {}

  /* Fallback: parallel HEAD probes v01..v20 */
  const probes = Array.from({ length: 20 }, async (_, i) => {
    const n = String(i + 1).padStart(2, '0');
    try {
      const r = await fetch(`data/verbs/v${n}.json`, { method: 'HEAD' });
      return r.ok ? { id: `v${n}`, title: `Lesson ${i + 1}`, subtitle: `Dutch Verbs ${i + 1}`, file: `v${n}.json` } : null;
    } catch { return null; }
  });
  const results = await Promise.all(probes);
  st.manifest = results.filter(Boolean);
}

/* ─────────────────────────────────────────────────────────────────────────────
   LESSON SELECTION
───────────────────────────────────────────────────────────────────────────── */
async function selectLesson(lesson) {
  st.currentLesson = lesson;
  $('mob-cur').textContent = lesson.subtitle || lesson.title;
  renderSidebar();

  /* Show loading */
  $('home-welcome').style.display = 'flex';
  $('home-lesson').style.display  = 'none';
  $('home-welcome').innerHTML = `<div class="flag">⏳</div><h2>Loading ${lesson.title}…</h2>`;
  show('s-home');

  try {
    const r = await fetch(`data/verbs/${lesson.file}`);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const data = await r.json();
    if (!Array.isArray(data) || !data.length) throw new Error('Empty data');
    st.all = data;

    lesson.verbCount = data.length;  /* update sidebar meta */
    st.store.lastLesson = lesson.id;
    writeStore();

    renderSidebar();
    renderHome();
  } catch {
    $('home-welcome').style.display = 'flex';
    $('home-lesson').style.display  = 'none';
    $('home-welcome').innerHTML = `
      <div class="flag">⚠️</div>
      <h2>Could not load ${lesson.title}</h2>
      <p>Make sure you are running via a local server, not <code>file://</code></p>
      <a href="/" style="color:var(--acc)">← Back to main</a>`;
  }
}

/* ─────────────────────────────────────────────────────────────────────────────
   HOME SCREEN
───────────────────────────────────────────────────────────────────────────── */
function renderHome() {
  show('s-home');

  if (!st.currentLesson || !st.all.length) {
    $('home-welcome').style.display = 'flex';
    $('home-welcome').innerHTML = `
      <div class="flag">🇳🇱</div>
      <h2>Dutch Verb Trainer</h2>
      <p>Select a lesson from the menu to start practising conjugations.</p>
      <p class="mob-hint">Tap ☰ above to open the lesson menu.</p>`;
    $('home-lesson').style.display = 'none';
    return;
  }

  $('home-welcome').style.display = 'none';
  $('home-lesson').style.display  = ''; /* let CSS control: flex (base) or grid (≥1280px) */

  const hintEl = $('home-hint');
  if (hintEl) hintEl.textContent = `${SESS} verbs per session · ${QUIZ_N} quiz questions · keyboard shortcuts`;

  const ld  = getLessonData();
  const ans = ld.totalAnswered || 0;
  const acc = ans ? Math.round(ld.totalCorrect / ans * 100) : 0;
  const sk  = st.store.streak || 0;

  $('home-lesson-hdr').innerHTML = `
    <div class="home-lesson-num">${st.currentLesson.title}</div>
    <div class="home-lesson-title">${st.currentLesson.subtitle || st.currentLesson.title}</div>
    <div class="home-lesson-count">${st.all.length} verbs available</div>
  `;

  $('home-stats').innerHTML = `
    <div class="hstat"><div class="hstat-num">${ld.sessions}</div><div class="hstat-lbl">Sessions</div></div>
    <div class="hstat"><div class="hstat-num">${acc}%</div><div class="hstat-lbl">Accuracy</div></div>
    <div class="hstat"><div class="hstat-num">${sk > 0 ? '🔥' + sk : '–'}</div><div class="hstat-lbl">Streak</div></div>
    <div class="hstat"><div class="hstat-num">${st.all.length}</div><div class="hstat-lbl">Verbs</div></div>
  `;
}

/* ─────────────────────────────────────────────────────────────────────────────
   SESSION BUILDING  (prioritise verbs with low accuracy / never seen)
───────────────────────────────────────────────────────────────────────────── */
function buildSession() {
  const vs     = getLessonData().verbStats;
  const scored = st.all.map(v => {
    const s     = vs[v.infinitive];
    const score = s ? s.correct / Math.max(s.seen, 1) : -1;
    return { v, score };
  });
  scored.sort((a, b) => a.score !== b.score ? a.score - b.score : Math.random() - 0.5);
  st.session = shuffle(scored.slice(0, SESS).map(x => x.v));
}

/* ─────────────────────────────────────────────────────────────────────────────
   TYPE BADGE
───────────────────────────────────────────────────────────────────────────── */
function typeBadge(type) {
  const t = (type || '').toLowerCase();
  let cls = 'irr', icon = '⚡';
  if (t.includes('separable'))                          { cls = 'sep';   icon = '🔧'; }
  else if (t.includes('regular') && !t.includes('ir')) { cls = 'reg';   icon = '📝'; }
  else if (t.includes('modal'))                         { cls = 'modal'; icon = '🎛️'; }
  return `<span class="vtype ${cls}">${icon} ${type}</span>`;
}

/* ─────────────────────────────────────────────────────────────────────────────
   STUDY SCREEN
───────────────────────────────────────────────────────────────────────────── */
function startStudy() {
  st.studyIdx = 0;
  st.studyOrigin = 'home';
  show('s-study');
  const c = $('study-container');
  c.style.opacity = '0';
  renderStudyCard();
  requestAnimationFrame(() => { c.style.opacity = '1'; });
}

function renderStudyCard() {
  const verb  = st.session[st.studyIdx];
  const total = st.session.length;
  const pct   = Math.round((st.studyIdx / total) * 100);

  $('study-pbar').style.width    = pct + '%';
  $('study-counter').textContent = `${st.studyIdx + 1} / ${total}`;

  const dotsEl = $('study-dots');
  dotsEl.innerHTML = '';
  st.session.forEach((_, i) => {
    dotsEl.appendChild(el('div', i < st.studyIdx ? 'dot done' : i === st.studyIdx ? 'dot active' : 'dot'));
  });

  function tblock(cls, label, rows, extraTts) {
    const rowsHtml = rows.map(([p, f]) => f
      ? `<div class="trow"><span class="tpron">${p}</span><span class="tform">${f}</span></div>`
      : '').join('');
    const ttsVal = extraTts || rows
      .filter(([, f]) => f)
      .flatMap(([p, f]) => p.split('/').map(pr => `${pr.trim()} ${f}`))
      .join(', ');
    const lm = label.match(/^([^(]+?)\s*(\([^)]+\))?$/);
    const labelHtml = `<div class="tlabel-inner"><span class="tlabel-name">${lm[1].trim()}</span>${lm[2] ? `<span class="tlabel-abbr">${lm[2]}</span>` : ''}</div>`;
    return `
      <div class="tblock">
        <div class="tlabel ${cls}">${labelHtml}</div>
        <div class="tblock-body">
          <button class="tts-btn tts-tense-btn"
            onclick="event.stopPropagation();speak('${ttsVal.replace(/'/g, "\\'")}')">🔊</button>
          <div class="trows">${rowsHtml}</div>
        </div>
      </div>`;
  }

  const v = verb;
  $('study-container').innerHTML = `
    <div class="vcard" id="vcard">
      <div class="vhero">
        <div class="vhero-left">
          <div class="vinfinitive">${v.infinitive}</div>
          <div class="vtranslation">${v.translation}</div>
          ${typeBadge(v.type)}
        </div>
        <div class="vhero-tts">
          <button class="tts-btn" onclick="speak('${v.infinitive.replace(/'/g, "\\'")}')">🔊 Infinitive</button>
          <button class="tts-btn" onclick="speak('${(v.present_ott?.ik || '').replace(/'/g, "\\'")}')">🔊 ik ${v.present_ott?.ik || ''}</button>
        </div>
      </div>
      <div class="tgrid">
        ${tblock('present', 'Present (OTT)', [
          ['ik',              v.present_ott?.ik],
          ['jij / u',         v.present_ott?.jij],
          ['hij/zij/het',     v.present_ott?.hij_zij_het],
          ['wij/jullie/zij',  v.present_ott?.wij_jullie_zij],
        ])}
        ${tblock('past', 'Past (OVT)', [
          ['ik / jij / hij',  v.past_ovt?.ik_jij_hij_zij_het],
          ['wij/jullie/zij',  v.past_ovt?.wij_jullie_zij],
        ])}
        ${tblock('perfect', 'Present Perfect (VTT)', [
          ['auxiliary',   v.present_perfect_vtt?.auxiliary],
          ['past part.',  v.present_perfect_vtt?.past_participle],
        ], (v.present_perfect_vtt?.auxiliary || '') + ' ' + (v.present_perfect_vtt?.past_participle || ''))}
        ${tblock('future', 'Future (OTTT)', [
          ['ik',             v.future_ottt?.ik],
          ['wij/jullie/zij', v.future_ottt?.wij_jullie_zij],
        ])}
      </div>
      <div class="vfooter">
        <span style="font-size:0.78rem;color:var(--muted)">${st.studyIdx + 1} of ${total} verbs</span>
        <div class="vfooter-btns">
          ${st.studyIdx > 0 ? `<button class="btn btn-secondary btn-sm" id="prev-btn">← Prev</button>` : ''}
          <button class="btn btn-primary btn-sm" id="next-btn">
            ${st.studyIdx < total - 1 ? 'Next →' : '🎯 Start Quiz'}
          </button>
        </div>
      </div>
    </div>`;

  st.ttsSeq++;
  const seq = st.ttsSeq;
  setTimeout(() => { if (st.ttsSeq === seq) speak(v.infinitive); }, 420);

  const fadeToCard = fn => {
    const c = $('study-container');
    c.style.opacity = '0';
    setTimeout(() => { fn(); requestAnimationFrame(() => { c.style.opacity = '1'; }); }, 180);
  };

  $('next-btn').onclick = () => {
    fadeToCard(() => {
      st.studyIdx++;
      if (st.studyIdx >= st.session.length) { buildQuiz(); startQuiz(); }
      else renderStudyCard();
    });
  };

  const prevBtn = $('prev-btn');
  if (prevBtn) prevBtn.onclick = () => fadeToCard(() => { st.studyIdx--; renderStudyCard(); });

  if ($('study-container')._kh) document.removeEventListener('keydown', $('study-container')._kh);
  const kh = e => {
    if (document.querySelector('.screen.active')?.id !== 's-study') return;
    if (e.key === ' ' || e.key === 'Enter' || e.key === 'ArrowRight') { e.preventDefault(); $('next-btn').click(); }
    if (e.key === 'ArrowLeft' && $('prev-btn')) { e.preventDefault(); $('prev-btn').click(); }
  };
  $('study-container')._kh = kh;
  document.addEventListener('keydown', kh);
}

/* ─────────────────────────────────────────────────────────────────────────────
   QUIZ — QUESTION GENERATORS
───────────────────────────────────────────────────────────────────────────── */
function wrongForms(correct, getter, n = 3) {
  return [...new Set(
    shuffle(st.all).map(getter).filter(f => f && f.trim() !== correct.trim())
  )].slice(0, n);
}

function opts(correct, wrongs) {
  const pool   = [correct, ...wrongs];
  const extras = ['hebben', 'zijn', '–', '(none)'];
  while (pool.length < 4) pool.push(extras[pool.length - 1]);
  return shuffle(pool.slice(0, 4));
}

function qPresentIk(v) {
  const cor = v.present_ott?.ik; if (!cor) return null;
  const wr  = wrongForms(cor, x => x.present_ott?.ik); if (wr.length < 2) return null;
  return {
    tag: 'Present Tense', tts: cor,
    q:   `"I ${v.translation.replace(/^to /, '')}" — complete with the present tense:`,
    ctx: `<span class="nl">ik ___</span> &nbsp;·&nbsp; ${v.infinitive}`,
    correct: cor, options: opts(cor, wr),
    explain: `ik → <strong>${cor}</strong> (present / OTT)`,
  };
}

function qPresentWij(v) {
  const cor = v.present_ott?.wij_jullie_zij; if (!cor) return null;
  const wr  = wrongForms(cor, x => x.present_ott?.wij_jullie_zij); if (wr.length < 2) return null;
  return {
    tag: 'Present Tense (wij)', tts: cor,
    q:   `Present tense — wij / jullie / zij form of "${v.infinitive}":`,
    ctx: `<span class="nl">wij ___</span>`,
    correct: cor, options: opts(cor, wr),
    explain: `wij/jullie/zij → <strong>${cor}</strong>`,
  };
}

function qPastIk(v) {
  const cor = v.past_ovt?.ik_jij_hij_zij_het; if (!cor) return null;
  const wr  = wrongForms(cor, x => x.past_ovt?.ik_jij_hij_zij_het); if (wr.length < 2) return null;
  return {
    tag: 'Past Tense (OVT)', tts: cor,
    q:   `Past tense (OVT) of "${v.infinitive}" — ik / hij form:`,
    ctx: `${v.translation}`,
    correct: cor, options: opts(cor, wr),
    explain: `ik/jij/hij → <strong>${cor}</strong> (past / OVT)`,
  };
}

function qPastParticiple(v) {
  const cor = v.present_perfect_vtt?.past_participle; if (!cor) return null;
  const wr  = wrongForms(cor, x => x.present_perfect_vtt?.past_participle); if (wr.length < 2) return null;
  return {
    tag: 'Past Participle', tts: cor,
    q:   `What is the voltooid deelwoord (past participle) of "${v.infinitive}"?`,
    ctx: `${v.translation}`,
    correct: cor, options: opts(cor, wr),
    explain: `past participle → <strong>${cor}</strong>`,
  };
}

function qAuxiliary(v) {
  const aux = v.present_perfect_vtt?.auxiliary || ''; if (!aux) return null;
  const hasH = aux.toLowerCase().includes('hebben');
  const hasZ = aux.toLowerCase().includes('zijn');
  let cor;
  if (hasH && hasZ) cor = 'hebben / zijn';
  else if (hasH)    cor = 'hebben';
  else              cor = 'zijn';
  const allOpts = cor === 'hebben / zijn'
    ? shuffle(['hebben / zijn', 'hebben', 'zijn', 'worden']).slice(0, 4)
    : shuffle([cor, cor === 'hebben' ? 'zijn' : 'hebben', 'worden', 'zullen']).slice(0, 4);
  return {
    tag: 'Auxiliary Verb',
    q:   `Which auxiliary verb is used with "${v.infinitive}" in the present perfect?`,
    ctx: `<span class="nl">ik ___ ${v.present_perfect_vtt?.past_participle || '...'}</span>`,
    correct: cor, options: allOpts,
    explain: `${v.infinitive} uses <strong>${cor}</strong> → ik ${hasZ && !hasH ? 'ben' : 'heb'} ${v.present_perfect_vtt?.past_participle || '...'}`,
  };
}

function qTenseId(v) {
  const tenses = [
    { label: 'Present (OTT)',         form: v.present_ott?.ik },
    { label: 'Past (OVT)',            form: v.past_ovt?.ik_jij_hij_zij_het },
    { label: 'Present Perfect (VTT)', form: `${v.present_perfect_vtt?.auxiliary} ${v.present_perfect_vtt?.past_participle}` },
    { label: 'Future (OTTT)',         form: v.future_ottt?.ik },
  ].filter(t => t.form && t.form.trim() !== 'undefined undefined');
  if (tenses.length < 3) return null;
  const chosen = tenses[0 | Math.random() * tenses.length];
  const wrongs = shuffle(tenses.filter(t => t.label !== chosen.label).map(t => t.label));
  return {
    tag: 'Tense Recognition',
    q:   `Which tense is this form of "${v.infinitive}"?`,
    ctx: `<span class="nl">${chosen.form}</span>`,
    correct: chosen.label, options: opts(chosen.label, wrongs),
    explain: `<strong>${chosen.form}</strong> = ${chosen.label}`,
  };
}

const QGENS = [qPresentIk, qPresentWij, qPastIk, qPastParticiple, qAuxiliary, qTenseId];

/* ─────────────────────────────────────────────────────────────────────────────
   BUILD QUIZ
───────────────────────────────────────────────────────────────────────────── */
function buildQuiz() {
  const qs        = [];
  const genCycle  = shuffle([...QGENS, ...QGENS, ...QGENS]);
  const verbCycle = [...st.session, ...shuffle(st.session)];
  for (let i = 0; i < QUIZ_N * 3 && qs.length < QUIZ_N; i++) {
    const v = verbCycle[i % verbCycle.length];
    const g = genCycle[i % genCycle.length];
    try { const q = g(v); if (q) qs.push({ ...q, verb: v.infinitive }); } catch {}
  }
  st.questions = shuffle(qs).slice(0, QUIZ_N);
}

/* ─────────────────────────────────────────────────────────────────────────────
   QUIZ SCREEN
───────────────────────────────────────────────────────────────────────────── */
function startQuiz() {
  st.qIdx = 0; st.correct = 0; st.streak = 0; st.bestStreak = 0;
  show('s-quiz');
  renderQ();
}

function renderQ() {
  const q     = st.questions[st.qIdx];
  const total = st.questions.length;
  $('quiz-pbar').style.width  = Math.round(st.qIdx / total * 100) + '%';
  $('quiz-score').textContent = `${st.correct} / ${st.qIdx}`;

  const letters    = ['A', 'B', 'C', 'D'];
  const streakHtml = st.streak >= 2 ? `<span class="streak-pill">🔥${st.streak}</span>` : '';

  $('quiz-container').innerHTML = `
    <div class="qcard">
      <div class="qtag">${q.tag} &nbsp;·&nbsp; ${st.qIdx + 1}/${total} ${streakHtml}</div>
      <div class="qquestion">${q.q}</div>
      <div class="qctx">${q.ctx}</div>
      <div class="opts" id="opts">
        ${q.options.map((o, i) => `
          <button class="opt" data-val="${o.replace(/"/g, '&quot;')}">
            <div class="opt-letter">${letters[i]}</div>
            <span>${o}</span>
          </button>`).join('')}
      </div>
      <div class="qfeedback" id="qfb"></div>
      <button class="btn btn-primary qnext" id="qnext">
        ${st.qIdx < total - 1 ? 'Next →' : '🏆 Results'}
      </button>
    </div>`;

  if (q.tts) {
    st.ttsSeq++;
    const s = st.ttsSeq;
    setTimeout(() => { if (st.ttsSeq === s) speak(q.tts); }, 300);
  }

  $('opts').querySelectorAll('.opt').forEach(b =>
    b.addEventListener('click', () => answer(b.dataset.val, q)));
}

function answer(chosen, q) {
  const ok = chosen.trim().toLowerCase() === q.correct.trim().toLowerCase();
  if (ok) { st.correct++; st.streak++; if (st.streak > st.bestStreak) st.bestStreak = st.streak; }
  else st.streak = 0;

  /* Track per-verb accuracy in lesson-scoped store */
  const vs = getLessonData().verbStats;
  if (!vs[q.verb]) vs[q.verb] = { seen: 0, correct: 0 };
  vs[q.verb].seen++;
  if (ok) vs[q.verb].correct++;

  $('opts').querySelectorAll('.opt').forEach(b => {
    b.disabled = true;
    if (b.dataset.val.trim().toLowerCase() === q.correct.trim().toLowerCase()) b.classList.add('correct');
    else if (b.dataset.val === chosen) b.classList.add('wrong');
  });

  const fb = $('qfb');
  fb.className = `qfeedback show ${ok ? 'ok' : 'fail'}`;
  fb.innerHTML = ok
    ? `✅ Correct! ${q.explain}`
    : `❌ Correct answer: <strong>${q.correct}</strong><br><small>${q.explain}</small>`;

  if (ok && st.streak >= 3) burstConfetti(false);

  $('qnext').style.display = 'flex';
  $('qnext').onclick = () => { st.qIdx++; st.qIdx >= st.questions.length ? finishQuiz() : renderQ(); };
}

/* keyboard: 1-4 to pick, Enter/Space to continue */
document.addEventListener('keydown', e => {
  if ($('s-quiz').classList.contains('active')) {
    const btns = $('opts') ? [...$('opts').querySelectorAll('.opt:not([disabled])')] : [];
    const map  = { '1': 0, '2': 1, '3': 2, '4': 3, 'a': 0, 'b': 1, 'c': 2, 'd': 3 };
    if (e.key in map) btns[map[e.key]]?.click();
    if ((e.key === 'Enter' || e.key === ' ') && $('qnext')?.style.display !== 'none') {
      e.preventDefault(); $('qnext').click();
    }
  }
});

/* ─────────────────────────────────────────────────────────────────────────────
   RESULTS
───────────────────────────────────────────────────────────────────────────── */
function finishQuiz() {
  const total = st.questions.length;
  const pct   = Math.round(st.correct / total * 100);

  /* Update lesson-scoped progress */
  const ld = getLessonData();
  ld.sessions      = (ld.sessions || 0) + 1;
  ld.totalCorrect  = (ld.totalCorrect || 0) + st.correct;
  ld.totalAnswered = (ld.totalAnswered || 0) + total;

  /* Update global streak (not per-lesson) */
  const today = new Date().toISOString().slice(0, 10);
  const yest  = new Date(Date.now() - 864e5).toISOString().slice(0, 10);
  st.store.streak    = st.store.lastStudy === yest  ? (st.store.streak || 0) + 1
                     : st.store.lastStudy === today ? (st.store.streak || 1)
                     : 1;
  st.store.lastStudy = today;
  writeStore();

  const trophy = pct >= 90 ? '🏆' : pct >= 70 ? '🌟' : pct >= 50 ? '💪' : '📚';
  const title  = pct >= 90 ? 'Outstanding! 🎉' : pct >= 70 ? 'Great job!' : pct >= 50 ? 'Keep going!' : 'Practice makes perfect!';

  $('res-trophy').textContent = trophy;
  $('res-title').textContent  = title;
  $('res-score').textContent  = `${st.correct} / ${total}`;
  $('res-grid').innerHTML = `
    <div class="rstat"><div class="rstat-num" style="color:#10b981">${st.correct}</div><div class="rstat-lbl">Correct</div></div>
    <div class="rstat"><div class="rstat-num" style="color:#e74c3c">${total - st.correct}</div><div class="rstat-lbl">Wrong</div></div>
    <div class="rstat"><div class="rstat-num" style="color:#f59e0b">${st.bestStreak}🔥</div><div class="rstat-lbl">Best Streak</div></div>
    <div class="rstat"><div class="rstat-num" style="color:#667eea">${pct}%</div><div class="rstat-lbl">Accuracy</div></div>
  `;
  const sk = st.store.streak || 0;
  $('res-streak').innerHTML = sk > 1
    ? `<div class="streak-pill" style="font-size:1rem;padding:0.4rem 1rem">🔥 ${sk}-day streak!</div>`
    : '';

  renderSidebar(); /* refresh accuracy badges */
  show('s-results');
  if (pct >= 70) setTimeout(() => burstConfetti(true), 200);
}

/* ─────────────────────────────────────────────────────────────────────────────
   BROWSE
───────────────────────────────────────────────────────────────────────────── */
function renderList() {
  show('s-list');
  const vs = getLessonData().verbStats;
  $('list-grid').innerHTML = st.all.map((v, i) => {
    const s          = vs[v.infinitive];
    const acc        = s ? Math.round(s.correct / Math.max(s.seen, 1) * 100) : null;
    const badgeColor = acc === null ? '#94a3b8' : acc >= 80 ? '#10b981' : acc >= 50 ? '#f59e0b' : '#e74c3c';
    const badgeTxt   = acc === null ? 'New' : `${acc}%`;
    return `
      <div class="list-item" onclick="browseVerb(${i})">
        <div class="li-left">
          <div class="li-inf">${v.infinitive}</div>
          <div class="li-tr">${v.translation}</div>
        </div>
        <span class="li-badge" style="background:${badgeColor}22;color:${badgeColor}">${badgeTxt}</span>
      </div>`;
  }).join('');
}

function browseVerb(i) {
  st.session     = [st.all[i]];
  st.studyIdx    = 0;
  st.studyOrigin = 'list';
  show('s-study');
  renderStudyCard();
}

/* ─────────────────────────────────────────────────────────────────────────────
   CONFETTI
───────────────────────────────────────────────────────────────────────────── */
function burstConfetti(big) {
  const layer = $('confetti-layer');
  const n     = big ? 80 : 30;
  layer.innerHTML = '';
  for (let i = 0; i < n; i++) {
    const p  = document.createElement('div');
    const c  = CONF_COLORS[i % CONF_COLORS.length];
    const w  = 5 + Math.random() * 8;
    const h  = 5 + Math.random() * 13;
    const br = Math.random() > 0.5 ? '50%' : '2px';
    p.className = 'conf ' + (big ? 'conf-fall' : 'conf-burst');
    if (big) {
      p.style.cssText = `left:${Math.random()*100}%;top:-16px;background:${c};width:${w}px;height:${h}px;border-radius:${br};--rot:${Math.random()*720-360}deg;--dur:${1.2+Math.random()*1.2}s;--delay:${Math.random()*1.8}s`;
    } else {
      const a = Math.random() * Math.PI * 2, d = 80 + Math.random() * 140;
      p.style.cssText = `left:50%;top:40%;background:${c};width:${w}px;height:${h}px;border-radius:${br};--tx:${Math.cos(a)*d}px;--ty:${Math.sin(a)*d}px;--rot:${Math.random()*720}deg;--delay:${Math.random()*0.15}s`;
    }
    layer.appendChild(p);
  }
  setTimeout(() => { layer.innerHTML = ''; }, big ? 4500 : 1600);
}

/* ─────────────────────────────────────────────────────────────────────────────
   SEARCH
───────────────────────────────────────────────────────────────────────────── */
let _searchIdx      = null;   /* flat array of { verb, lessonId, lessonTitle } */
let _searchBuilding = false;
let _searchTimer    = null;

function getFormFields(v) {
  const fields = [
    { label: 'Infinitive',    value: v.infinitive },
    { label: 'Translation',   value: v.translation },
  ];
  const ott = v.present_ott || {};
  if (ott.ik)             fields.push({ label: 'Present ik',   value: ott.ik });
  if (ott.jij)            fields.push({ label: 'Present jij',  value: ott.jij });
  if (ott.hij_zij_het)    fields.push({ label: 'Present hij',  value: ott.hij_zij_het });
  if (ott.wij_jullie_zij) fields.push({ label: 'Present wij',  value: ott.wij_jullie_zij });
  const ovt = v.past_ovt || {};
  if (ovt.ik_jij_hij_zij_het) fields.push({ label: 'Past',      value: ovt.ik_jij_hij_zij_het });
  if (ovt.wij_jullie_zij)     fields.push({ label: 'Past wij',  value: ovt.wij_jullie_zij });
  const vtt = v.present_perfect_vtt || {};
  if (vtt.past_participle)    fields.push({ label: 'Past participle', value: vtt.past_participle });
  if (vtt.auxiliary)          fields.push({ label: 'Auxiliary',       value: vtt.auxiliary });
  const ottt = v.future_ottt || {};
  if (ottt.ik)             fields.push({ label: 'Future ik',  value: ottt.ik });
  if (ottt.wij_jullie_zij) fields.push({ label: 'Future wij', value: ottt.wij_jullie_zij });
  return fields;
}

async function buildSearchIndex() {
  if (_searchIdx || _searchBuilding || !st.manifest.length) return;
  _searchBuilding = true;
  try {
    const batches = await Promise.all(st.manifest.map(async lesson => {
      try {
        const r = await fetch(`data/verbs/${lesson.file}`);
        if (!r.ok) return [];
        const data = await r.json();
        if (!Array.isArray(data)) return [];
        return data.map(verb => ({ verb, lessonId: lesson.id, lessonTitle: lesson.title }));
      } catch { return []; }
    }));
    _searchIdx = batches.flat();
  } catch { _searchIdx = []; }
  _searchBuilding = false;
  /* If search box has text when index finishes, refresh results */
  const inp = $('sb-search-inp');
  if (inp && inp.value.trim()) activateSearch(inp.value);
  const mainInp = $('main-search-inp');
  if (mainInp && mainInp.value.trim()) activateMainSearch(mainInp.value);
}

function searchVerbs(query) {
  if (!_searchIdx || !query) return null; /* null = index not ready */
  const q = query.toLowerCase().trim();
  if (!q || q.length < 1) return [];

  const results = [];
  for (const entry of _searchIdx) {
    let bestScore = 0;
    let matchField = null;

    for (const field of getFormFields(entry.verb)) {
      if (!field.value) continue;
      const v = field.value.toLowerCase();
      let score = 0;
      if (v === q) {
        score = field.label === 'Infinitive' ? 100 : field.label === 'Translation' ? 60 : 80;
      } else if (v.startsWith(q)) {
        score = field.label === 'Infinitive' ? 75 : field.label === 'Translation' ? 35 : 55;
      } else if (v.includes(q) && q.length >= 2) {
        score = field.label === 'Infinitive' ? 50 : field.label === 'Translation' ? 20 : 35;
      }
      if (score > bestScore) { bestScore = score; matchField = field; }
    }

    if (bestScore > 0) results.push({ ...entry, score: bestScore, matchField });
  }

  return results.sort((a, b) => b.score - a.score).slice(0, 25);
}

function renderSearchResults(query, results) {
  const resEl  = $('sb-search-results');
  const listEl = $('lesson-list');
  const q      = query.trim();

  if (!q) {
    resEl.classList.remove('active');
    listEl.style.display = '';
    return;
  }

  listEl.style.display = 'none';
  resEl.classList.add('active');

  if (results === null) {
    resEl.innerHTML = '<div class="sr-building"><div class="spin"></div>Building index…</div>';
    return;
  }

  if (!results.length) {
    resEl.innerHTML = `<div class="sr-empty">No verbs found for "<strong>${q}</strong>"<br><small>Try infinitive, translation, or any conjugated form</small></div>`;
    return;
  }

  resEl.innerHTML = `
    <div class="sr-count">${results.length} result${results.length !== 1 ? 's' : ''}</div>
    ${results.map((r, idx) => {
      const { verb, lessonTitle, matchField } = r;
      const showMatch = matchField.label !== 'Infinitive';
      return `
        <div class="sr-item" data-idx="${idx}" role="button" tabindex="0">
          <div class="sr-top">
            <span class="sr-inf">${verb.infinitive}</span>
            <span class="sr-lesson-badge">${lessonTitle}</span>
          </div>
          <div class="sr-tr">${verb.translation}</div>
          ${showMatch ? `
          <div class="sr-match">
            <span class="sr-match-lbl">${matchField.label}:</span>
            <span class="sr-match-val">${matchField.value}</span>
          </div>` : ''}
        </div>`;
    }).join('')}`;

  resEl.querySelectorAll('.sr-item').forEach((item, idx) => {
    const open = async () => {
      const r      = results[idx];
      const lesson = st.manifest.find(l => l.id === r.lessonId);
      if (lesson && st.currentLesson?.id !== r.lessonId) {
        await selectLesson(lesson);
      }
      const vIdx = st.all.findIndex(v => v.infinitive === r.verb.infinitive);
      if (vIdx !== -1) {
        clearSearch();
        toggleSidebar(false);
        browseVerb(vIdx);
      }
    };
    item.addEventListener('click', open);
    item.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
  });
}

function clearSearch() {
  const inp = $('sb-search-inp');
  if (inp) inp.value = '';
  $('sb-search-clr').classList.remove('visible');
  $('sb-search-results').classList.remove('active');
  $('lesson-list').style.display = '';
}

function activateSearch(query) {
  clearTimeout(_searchTimer);
  const clrBtn = $('sb-search-clr');
  if (clrBtn) clrBtn.classList.toggle('visible', !!query.trim());
  if (!query.trim()) { renderSearchResults('', []); return; }
  /* Show building state immediately if index not ready */
  if (!_searchIdx) { renderSearchResults(query, null); return; }
  _searchTimer = setTimeout(() => renderSearchResults(query, searchVerbs(query)), 120);
}

/* ── Main-page search ── */
let _mainSearchTimer = null;

function renderMainSearchResults(query, results) {
  const resEl = $('main-search-results');
  if (!resEl) return;
  const q = query.trim();

  if (!q) { resEl.innerHTML = ''; return; }

  if (results === null) {
    resEl.innerHTML = '<div class="sr-building"><div class="spin"></div>Building index…</div>';
    return;
  }

  if (!results.length) {
    resEl.innerHTML = `<div class="sr-empty">No verbs found for "<strong>${q}</strong>"<br><small>Try infinitive, translation, or any conjugated form</small></div>`;
    return;
  }

  resEl.innerHTML = `
    <div class="sr-count">${results.length} result${results.length !== 1 ? 's' : ''}</div>
    ${results.map((r, idx) => {
      const { verb, lessonTitle, matchField } = r;
      const showMatch = matchField.label !== 'Infinitive';
      return `
        <div class="main-sr-item" data-idx="${idx}" role="button" tabindex="0">
          <div class="main-sr-top">
            <span class="main-sr-inf">${verb.infinitive}</span>
            <span class="main-sr-badge">${lessonTitle}</span>
          </div>
          <div class="main-sr-tr">${verb.translation}</div>
          ${showMatch ? `<div class="main-sr-match"><span class="main-sr-match-lbl">${matchField.label}:</span> <span class="main-sr-match-val">${matchField.value}</span></div>` : ''}
        </div>`;
    }).join('')}`;

  resEl.querySelectorAll('.main-sr-item').forEach((item, idx) => {
    const open = async () => {
      const r      = results[idx];
      const lesson = st.manifest.find(l => l.id === r.lessonId);
      if (lesson && st.currentLesson?.id !== r.lessonId) await selectLesson(lesson);
      const vIdx = st.all.findIndex(v => v.infinitive === r.verb.infinitive);
      if (vIdx !== -1) { clearMainSearch(); browseVerb(vIdx); }
    };
    item.addEventListener('click', open);
    item.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
  });
}

function clearMainSearch() {
  const inp = $('main-search-inp');
  if (inp) inp.value = '';
  const clr = $('main-search-clr');
  if (clr) clr.classList.remove('visible');
  const res = $('main-search-results');
  if (res) res.innerHTML = '';
}

function activateMainSearch(query) {
  clearTimeout(_mainSearchTimer);
  const clr = $('main-search-clr');
  if (clr) clr.classList.toggle('visible', !!query.trim());
  if (!query.trim()) { renderMainSearchResults('', []); return; }
  if (!_searchIdx) { renderMainSearchResults(query, null); return; }
  _mainSearchTimer = setTimeout(() => renderMainSearchResults(query, searchVerbs(query)), 120);
}

/* ─────────────────────────────────────────────────────────────────────────────
   WIRING
───────────────────────────────────────────────────────────────────────────── */
$('btn-start-study').onclick  = () => { buildSession(); startStudy(); };
$('btn-quiz-only').onclick    = () => { buildSession(); buildQuiz(); startQuiz(); };
$('btn-browse').onclick       = () => renderList();
$('study-back').onclick       = () => st.studyOrigin === 'list' ? renderList() : renderHome();
$('quiz-back').onclick        = renderHome;
$('list-back').onclick        = renderHome;
$('btn-retry').onclick        = () => { buildSession(); startStudy(); };
$('btn-review-again').onclick = () => { st.studyIdx = 0; show('s-study'); renderStudyCard(); };
$('hamburger').onclick        = () => toggleSidebar();
$('drawer-overlay').onclick   = () => toggleSidebar(false);
$('mob-back').onclick         = renderHome;
$('mob-wake-btn').onclick     = toggleWakeLock;
$('sb-wake-tog').addEventListener('click', toggleWakeLock);
$('sb-theme-tog').addEventListener('click', () => {
  applyTheme(document.documentElement.getAttribute('data-theme') !== 'dark');
});

$('sb-font-sel').addEventListener('change', e => applyVerbFont(e.target.value));
applyVerbFont(localStorage.getItem(FONT_KEY) || 'nunito');

/* Init theme — respect saved preference, fall back to system preference */
const _savedTheme   = localStorage.getItem(THEME_KEY);
const _prefersDark  = window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
applyTheme(_savedTheme ? _savedTheme === 'dark' : _prefersDark);
$('tts-voice-select').addEventListener('change', e => {
  st.store.ttsVoice = e.target.value;
  writeStore();
  speak('Hallo! Dit is mijn stem.');  /* preview the newly selected voice */
});
document.querySelectorAll('.fs-pill-dec').forEach(b => b.addEventListener('click', () => applyFontSize(st.store.fsIndex - 1)));
document.querySelectorAll('.fs-pill-inc').forEach(b => b.addEventListener('click', () => applyFontSize(st.store.fsIndex + 1)));
$('sb-fs-dec').onclick = () => applyFontSize(st.store.fsIndex - 1);
$('sb-fs-inc').onclick = () => applyFontSize(st.store.fsIndex + 1);

const _searchInp = $('sb-search-inp');
const _searchClr = $('sb-search-clr');
_searchInp.addEventListener('input',   e => activateSearch(e.target.value));
_searchInp.addEventListener('keydown', e => { if (e.key === 'Escape') { clearSearch(); _searchInp.blur(); } });
_searchClr.addEventListener('click',   () => { clearSearch(); _searchInp.focus(); });

const _mainInp = $('main-search-inp');
const _mainClr = $('main-search-clr');
if (_mainInp) {
  _mainInp.addEventListener('input',   e => activateMainSearch(e.target.value));
  _mainInp.addEventListener('keydown', e => { if (e.key === 'Escape') { clearMainSearch(); _mainInp.blur(); } });
}
if (_mainClr) _mainClr.addEventListener('click', () => { clearMainSearch(); _mainInp?.focus(); });

/* ─────────────────────────────────────────────────────────────────────────────
   INIT
───────────────────────────────────────────────────────────────────────────── */
st.store = readStore();
applyFontSize(typeof st.store.fsIndex === 'number' ? st.store.fsIndex : 1);
populateVoiceSelect(); /* handles browsers that return voices synchronously */

$('lesson-list').innerHTML = '<div class="sb-load"><div class="spin"></div> Loading lessons…</div>';
$('ft-year').textContent   = new Date().getFullYear();

(async () => {
  try {
    await loadManifest();
    if (!st.manifest.length) {
      $('lesson-list').innerHTML = '<div class="sb-err">No lesson files found. Make sure <code>data/verbs/manifest.json</code> exists and you are running via a local server.</div>';
      return;
    }
    renderSidebar();
    syncWakeButtons(true); /* optimistic — corrected to false by acquireWakeLock if unsupported */
    acquireWakeLock();
    buildSearchIndex(); /* background — populates _searchIdx for cross-lesson search */

    /* Deep-link: ?lesson=les2 overrides last-used lesson; ?mode=study|quiz auto-starts */
    const _urlP      = new URLSearchParams(location.search);
    const _urlLesson = _urlP.get('lesson');
    const _urlMode   = _urlP.get('mode');

    const lastId = _urlLesson || st.store.lastLesson;
    const target = (lastId && st.manifest.find(l => l.id === lastId)) || st.manifest[0];
    await selectLesson(target);

    if      (_urlMode === 'study') { buildSession(); startStudy(); }
    else if (_urlMode === 'quiz')  { buildSession(); buildQuiz(); startQuiz(); }
  } catch {
    $('lesson-list').innerHTML = '<div class="sb-err">Failed to load lessons. Open via a local server (e.g. <code>npx serve .</code>).</div>';
  }
})();
