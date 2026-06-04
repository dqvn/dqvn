'use strict';

/* ── Constants ────────────────────────────────────────────────── */
const PROGRESS_KEY = 'nl_sentence_v1';
const SEL_KEY      = 'nl_sentence_sel';
const FS_KEY       = 'nl_sentence_fs';
const DAILY_GOAL   = 5;
const MAX_ATTEMPTS = 3;
const FS_STEPS     = [.78, .88, 1.0, 1.12, 1.26];

/* Files grouped for the sidebar */
const FILE_GROUPS = [
  {
    id: 'core', label: 'Core vocabulaire', open: true,
    files: ['core01','core02','core03','core04','core05',
            'core06','core07','core08','core09','core10'],
  },
  {
    id: 'ch', label: 'Hoofdstukken', open: false,
    files: ['ch00','ch01','ch02','ch03','ch04','ch05','ch06',
            'ch07','ch08','ch09','ch10','ch11','ch12','ch13',
            'ch14','ch15','ch16','ch17','ch18'],
  },
  {
    id: 'thema', label: "Thema's", open: false,
    files: ['thema01','thema02','thema03','thema04',
            'thema05','thema06','thema07','thema08'],
  },
  {
    id: 'sp', label: 'Spreektaal', open: false,
    files: ['sp02','sp03','sp04','sp05','sp06','sp07','sp08','sp09','sp10',
            'sp11','sp12','sp13','sp14','sp15','sp16','sp17','sp18','sp19',
            'sp20','sp21','sp22','sp23','sp24','sp25','sp26','sp27'],
  },
];

/* ── State ─────────────────────────────────────────────────────── */
let allSentences  = [];
let queue         = [];
let qIdx          = 0;
let gameMode      = 'type';
let attempts      = 0;
let progress      = {};
let selectedFiles = new Set(['core01', 'core02']);
let bankWords     = [];   // [{word, used}] for build mode
let answerWords   = [];   // word strings currently in answer zone
let fsIdx         = 2;
let _fileCache    = {};
let _sessionXP    = 0;
let _sessionPerfect = 0;
let _drag         = null; // pointer-event drag state
let _sidebarOpen  = false;

/* ── Helpers ───────────────────────────────────────────────────── */
function readJSON(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; }
  catch { return fallback; }
}
function saveJSON(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch {}
}

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function yesterdayStr() {
  const d = new Date(Date.now() - 86_400_000);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function showToast(msg, ms = 2600) {
  const t = document.getElementById('_toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), ms);
}

/* ── Progress ──────────────────────────────────────────────────── */
function loadProgress() {
  const saved = readJSON(PROGRESS_KEY, null);
  const today = todayStr();
  const yest  = yesterdayStr();
  if (!saved) {
    progress = { date: today, count: 0, streak: 0, xp: 0, lastGoalDate: '' };
  } else if (saved.date === today) {
    progress = saved;
  } else {
    const streakAlive = saved.lastGoalDate === yest;
    progress = {
      date:         today,
      count:        0,
      streak:       streakAlive ? (saved.streak || 0) : 0,
      xp:           saved.xp || 0,
      lastGoalDate: saved.lastGoalDate || '',
    };
  }
  saveJSON(PROGRESS_KEY, progress);
}

function recordCorrect(xpEarned) {
  progress.count++;
  progress.xp = (progress.xp || 0) + xpEarned;
  _sessionXP += xpEarned;
  saveJSON(PROGRESS_KEY, progress);
  renderDailyStrip();

  if (progress.count === DAILY_GOAL) {
    markGoalReached();
  }
}

function markGoalReached() {
  if (progress.lastGoalDate === todayStr()) return; // already done today
  const yest = yesterdayStr();
  if (progress.lastGoalDate === yest) {
    progress.streak = (progress.streak || 0) + 1;
  } else if (!progress.lastGoalDate) {
    progress.streak = 1;
  } else {
    progress.streak = 1; // reset to 1 (today counts)
  }
  progress.lastGoalDate = todayStr();
  saveJSON(PROGRESS_KEY, progress);
}

/* ── Text normalisation & scoring ─────────────────────────────── */
function norm(s) {
  return s
    .toLowerCase()
    .normalize('NFC')
    .replace(/[.,!?;:'"()\-–«»]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function levenshtein(a, b) {
  const m = a.length, n = b.length;
  const dp = [];
  for (let i = 0; i <= m; i++) { dp[i] = [i]; }
  for (let j = 1; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i-1] === b[j-1]
        ? dp[i-1][j-1]
        : 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1]);
    }
  }
  return dp[m][n];
}

/*
 * Returns { grade, hint }
 * grade: 'perfect' | 'typo' | 'order' | 'close' | 'wrong' | 'empty'
 *
 * Algorithm:
 *  1. Exact match after normalisation → perfect
 *  2. Character-level Levenshtein ≤ max(2, len/12) → typo  (catches missing accent,
 *     swapped letter, extra space — common Dutch learner errors)
 *  3. Word-set sort match → order  (right words, wrong sequence)
 *  4. ≥60% word-level fuzzy matches → close  (shows which words are off)
 *  5. Otherwise → wrong
 *
 *  Threshold 1/12 ≈ 8% of length, e.g. 3 chars for a 36-char sentence.
 *  Word-level fuzzy: per-word levenshtein ≤ min(1, floor(wordlen/5)),
 *  so a 4-letter word tolerates 0 errors, 5+ letters tolerate 1 error.
 */
function scoreAnswer(input, target) {
  const ni = norm(input);
  const nt = norm(target);

  if (!ni) return { grade: 'empty' };
  if (ni === nt) return { grade: 'perfect' };

  const dist = levenshtein(ni, nt);
  const threshold = Math.max(2, Math.floor(nt.length / 12));
  if (dist <= threshold) return { grade: 'typo', dist };

  const iw = ni.split(' ').filter(Boolean);
  const tw = nt.split(' ').filter(Boolean);

  // Wrong order?
  if ([...iw].sort().join('|') === [...tw].sort().join('|')) {
    return { grade: 'order' };
  }

  // Fuzzy word match ratio
  let matched = 0;
  const used = new Array(tw.length).fill(false);
  for (const word of iw) {
    for (let j = 0; j < tw.length; j++) {
      if (!used[j]) {
        const tol = Math.min(1, Math.floor(tw[j].length / 5));
        if (levenshtein(word, tw[j]) <= tol) {
          matched++;
          used[j] = true;
          break;
        }
      }
    }
  }

  // Find missing words for hint
  const missing = tw.filter((_, j) => !used[j]);
  const ratio = matched / tw.length;
  if (ratio >= 0.6) return { grade: 'close', missing };

  return { grade: 'wrong' };
}

/* Build-mode: compare assembled words to target words (exact, ignoring punctuation) */
function scoreBuild(answerArr, target) {
  const normWords = t => norm(t).split(' ').filter(Boolean);
  const got    = answerArr.map(w => norm(w)).join(' ');
  const expect = normWords(target).join(' ');
  if (got === expect) return { grade: 'perfect' };

  // Allow 1-char difference per word for punctuation-stripped tile edge cases
  const dist = levenshtein(got, expect);
  if (dist <= Math.max(1, Math.floor(expect.length / 14))) return { grade: 'typo' };

  // Order?
  if ([...got.split(' ')].sort().join('|') === [...expect.split(' ')].sort().join('|')) {
    return { grade: 'order' };
  }
  return { grade: 'wrong' };
}

/* ── File loading ──────────────────────────────────────────────── */
async function fetchFile(filename) {
  if (_fileCache[filename]) return _fileCache[filename];
  try {
    const r = await fetch(`data/vocabularies/${filename}.json`);
    if (!r.ok) throw new Error(r.status);
    const data = await r.json();
    _fileCache[filename] = data;
    return data;
  } catch {
    return [];
  }
}

async function loadSelectedFiles() {
  showState('loading');
  allSentences = [];
  const files = [...selectedFiles];
  const results = await Promise.all(files.map(f => fetchFile(f)));
  const seen = new Set();
  for (const data of results) {
    for (const e of data) {
      if (e.dutchsentence && e.englishtranslate && e.dutch && !seen.has(e.dutchsentence)) {
        seen.add(e.dutchsentence);
        allSentences.push({
          dutch:     e.dutch,
          english:   e.english || '',
          sentence:  e.dutchsentence,
          translate: e.englishtranslate,
        });
      }
    }
  }
  updateSbCount();
  buildQueue();
  renderCurrentSentence();
}

function buildQueue() {
  if (allSentences.length === 0) { queue = []; qIdx = 0; return; }
  queue = shuffle(allSentences).slice(0, DAILY_GOAL);
  qIdx  = 0;
}

/* ── Game state helpers ────────────────────────────────────────── */
function showState(state) {
  document.getElementById('gc-loading').classList.toggle('hidden', state !== 'loading');
  document.getElementById('gc-empty'  ).classList.toggle('hidden', state !== 'empty');
  document.getElementById('gc-prompt' ).classList.toggle('hidden', state !== 'prompt');
  document.getElementById('gc-done'   ).classList.toggle('hidden', state !== 'done');
}

function renderCurrentSentence() {
  if (allSentences.length === 0) { showState('empty'); return; }

  // Already reached today's goal
  if (progress.count >= DAILY_GOAL && qIdx === 0 && queue.length > 0) {
    // allow continuing; just show the prompt
  }

  if (qIdx >= queue.length) {
    // Queue exhausted — goal may or may not be reached
    if (progress.count >= DAILY_GOAL) {
      showDone();
    } else {
      buildQueue();
    }
    return;
  }

  attempts = 0;
  _sessionPerfect = 0;
  showState('prompt');

  const item = queue[qIdx];
  document.getElementById('gc-num'   ).textContent = qIdx + 1;
  document.getElementById('gc-total' ).textContent = queue.length;
  document.getElementById('gc-english').textContent = item.translate;
  document.getElementById('gc-dutch' ).textContent  = item.dutch;
  document.getElementById('gc-trans' ).textContent  = item.english;

  // Mini-dot progress for this session queue
  renderMiniDots();

  // Reset result
  resetResult();
  updateRevealBtn();

  if (gameMode === 'type') {
    renderTypeMode();
  } else {
    renderBuildMode(item.sentence);
  }
}

function renderTypeMode() {
  document.getElementById('type-area' ).classList.remove('hidden');
  document.getElementById('build-area').classList.add('hidden');
  const inp = document.getElementById('type-input');
  inp.value = '';
  inp.className = '';
  document.getElementById('type-feedback').textContent = '';
  document.getElementById('type-feedback').className   = 'type-feedback';
  inp.focus();
}

function renderBuildMode(sentence) {
  document.getElementById('type-area' ).classList.add('hidden');
  document.getElementById('build-area').classList.remove('hidden');

  // Strip punctuation + lowercase each tile so position cues are removed
  const words = sentence.split(/\s+/)
    .map(w => w.replace(/^[.,!?;:'"()\-–«»]+|[.,!?;:'"()\-–«»]+$/g, '').toLowerCase())
    .filter(Boolean);
  bankWords   = shuffle(words).map(w => ({ w, used: false }));
  answerWords = [];
  renderWordBank();
  renderAnswerZone();
}

function renderWordBank() {
  const bank = document.getElementById('word-bank');
  bank.innerHTML = '';
  bankWords.forEach((item, i) => {
    if (item.used) return;
    const t = document.createElement('span');
    t.className   = 'tile tile-bank';
    t.textContent = item.w;
    initTileDrag(t, 'bank', i);
    bank.appendChild(t);
  });
}

function renderAnswerZone() {
  const zone = document.getElementById('answer-zone');
  const ph   = document.getElementById('answer-placeholder');
  zone.innerHTML = '';
  zone.appendChild(ph);
  ph.classList.toggle('hidden', answerWords.length > 0);
  zone.className = 'answer-zone';
  answerWords.forEach((w, i) => {
    const t = document.createElement('span');
    t.className   = 'tile tile-answer';
    t.textContent = w;
    initTileDrag(t, 'answer', i);
    zone.appendChild(t);
  });
}

/* Re-render answer zone with FLIP animation so tiles slide to new positions */
function renderAnswerZoneWithFlip() {
  const zone  = document.getElementById('answer-zone');
  // Snapshot current positions before re-render; handle duplicate words by order
  const snaps = [];
  zone.querySelectorAll('.tile-answer').forEach(t =>
    snaps.push({ word: t.textContent, rect: t.getBoundingClientRect(), used: false }));

  renderAnswerZone();

  zone.querySelectorAll('.tile-answer').forEach(t => {
    const snap = snaps.find(s => s.word === t.textContent && !s.used);
    if (!snap) return;
    snap.used = true;
    const r2 = t.getBoundingClientRect();
    const dx = snap.rect.left - r2.left;
    const dy = snap.rect.top  - r2.top;
    if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
    t.style.transition = 'none';
    t.style.transform  = `translate(${dx}px,${dy}px)`;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      t.style.transition = 'transform 0.24s cubic-bezier(0.2,0,0,1)';
      t.style.transform  = '';
    }));
  });
}

/* ── Click interactions (tap / click to add / remove) ─────────── */
function bankTileClick(i) {
  if (bankWords[i].used) return;
  bankWords[i].used = true;
  answerWords.push(bankWords[i].w);
  renderWordBank();
  renderAnswerZoneWithFlip();
}

function answerTileClick(i) {
  const w  = answerWords.splice(i, 1)[0];
  const bi = bankWords.findIndex(b => b.w === w && b.used);
  if (bi !== -1) bankWords[bi].used = false;
  else bankWords.push({ w, used: false });
  renderWordBank();
  renderAnswerZoneWithFlip();
}

/* ── Pointer-event drag system ──────────────────────────────────── */

/*
 * Drag design:
 *  • Detects drag vs tap via 5px movement threshold — taps still fire click
 *  • Ghost clone lifts off the tile and follows the pointer
 *  • A glowing insertion caret tracks the gap position in the answer zone
 *  • On drop: state update + FLIP animation snaps tiles to final positions
 *  • Works on mouse and touch (pointer events, touch-action:none via CSS)
 */
function initTileDrag(tile, type, idx) {
  let startX, startY, didDrag = false;

  tile.addEventListener('pointerdown', e => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    startX = e.clientX;
    startY = e.clientY;
    didDrag = false;

    const onMove = me => {
      if (_drag) return;
      if (Math.hypot(me.clientX - startX, me.clientY - startY) > 5) {
        didDrag = true;
        document.removeEventListener('pointermove', onMove);
        document.removeEventListener('pointerup',   onUp);
        startDrag(type, idx, tile, startX, startY);
      }
    };
    const onUp = () => document.removeEventListener('pointermove', onMove);
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup',   onUp, { once: true });
  });

  tile.addEventListener('click', () => {
    if (didDrag) { didDrag = false; return; }
    if (type === 'bank') bankTileClick(idx);
    else                 answerTileClick(idx);
  });
}

function startDrag(type, idx, tile, startX, startY) {
  const rect = tile.getBoundingClientRect();

  const ghost = document.createElement('span');
  ghost.id        = 'drag-ghost';
  ghost.className = 'tile ' + (type === 'bank' ? 'tile-bank' : 'tile-answer');
  ghost.textContent = tile.textContent;
  Object.assign(ghost.style, {
    width:  rect.width  + 'px',
    height: rect.height + 'px',
    left:   rect.left   + 'px',
    top:    rect.top    + 'px',
  });
  document.body.appendChild(ghost);
  requestAnimationFrame(() => {
    ghost.style.transform = 'scale(1.12) rotate(-2.5deg)';
    ghost.style.boxShadow = '0 18px 48px rgba(0,0,0,.65), 0 0 0 2px rgba(6,214,160,.4)';
  });

  tile.classList.add('is-drag-src');

  _drag = {
    type, srcIdx: idx, ghost,
    offX: startX - rect.left,
    offY: startY - rect.top,
    insertIdx: type === 'answer' ? idx : answerWords.length,
  };

  updateInsertCaret(_drag.insertIdx);
  document.addEventListener('pointermove', onDragMove, { passive: false });
  document.addEventListener('pointerup',   onDragEnd);
  document.addEventListener('pointercancel', onDragEnd);
}

function onDragMove(e) {
  if (!_drag) return;
  e.preventDefault();

  const cx = e.clientX, cy = e.clientY;
  _drag.ghost.style.left = (cx - _drag.offX) + 'px';
  _drag.ghost.style.top  = (cy - _drag.offY) + 'px';

  const zone  = document.getElementById('answer-zone');
  const zRect = zone.getBoundingClientRect();
  const over  = cx > zRect.left - 28 && cx < zRect.right  + 28
             && cy > zRect.top  - 28 && cy < zRect.bottom + 28;

  zone.classList.toggle('drag-over', over);

  if (over) {
    const idx = computeInsertIdx(cx);
    _drag.insertIdx = idx;
    updateInsertCaret(idx);
  } else {
    _drag.insertIdx = null;
    removeInsertCaret();
  }
}

function onDragEnd() {
  if (!_drag) return;
  document.removeEventListener('pointermove',  onDragMove);
  document.removeEventListener('pointerup',    onDragEnd);
  document.removeEventListener('pointercancel',onDragEnd);

  const { type, srcIdx, ghost, insertIdx } = _drag;

  removeInsertCaret();
  document.getElementById('answer-zone').classList.remove('drag-over');
  document.querySelectorAll('.is-drag-src').forEach(t => t.classList.remove('is-drag-src'));

  // Fade ghost out
  ghost.style.transition = 'opacity 0.15s ease, transform 0.15s ease';
  ghost.style.opacity    = '0';
  ghost.style.transform  = 'scale(0.88) rotate(0deg)';
  setTimeout(() => ghost.remove(), 160);

  // Apply state change
  if (insertIdx !== null) {
    if (type === 'bank') {
      bankWords[srcIdx].used = true;
      answerWords.splice(insertIdx, 0, bankWords[srcIdx].w);
    } else {
      const word = answerWords.splice(srcIdx, 1)[0];
      answerWords.splice(insertIdx, 0, word);
    }
  } else if (type === 'answer') {
    // Dropped outside → return to bank
    const w  = answerWords.splice(srcIdx, 1)[0];
    const bi = bankWords.findIndex(b => b.w === w && b.used);
    if (bi !== -1) bankWords[bi].used = false;
    else bankWords.push({ w, used: false });
  }

  _drag = null;
  renderWordBank();
  renderAnswerZoneWithFlip();
}

/* Returns the insertion index in the visible (non-src) tile list */
function computeInsertIdx(cursorX) {
  const zone  = document.getElementById('answer-zone');
  const tiles = [...zone.querySelectorAll('.tile-answer:not(.is-drag-src)')];
  for (let i = 0; i < tiles.length; i++) {
    const r = tiles[i].getBoundingClientRect();
    if (cursorX < r.left + r.width / 2) return i;
  }
  return tiles.length;
}

function updateInsertCaret(insertIdx) {
  const zone  = document.getElementById('answer-zone');
  let caret   = document.getElementById('insert-caret');
  if (!caret) {
    caret       = document.createElement('div');
    caret.id    = 'insert-caret';
    zone.appendChild(caret);
    caret.getBoundingClientRect(); // force layout so first transition fires
  }

  const tiles = [...zone.querySelectorAll('.tile-answer:not(.is-drag-src)')];
  const zRect = zone.getBoundingClientRect();
  let x;
  if (tiles.length === 0) {
    x = zone.offsetWidth / 2;
  } else if (insertIdx <= 0) {
    x = tiles[0].getBoundingClientRect().left - zRect.left - 4;
  } else if (insertIdx >= tiles.length) {
    const lr = tiles[tiles.length - 1].getBoundingClientRect();
    x = lr.right - zRect.left + 4;
  } else {
    const a = tiles[insertIdx - 1].getBoundingClientRect();
    const b = tiles[insertIdx    ].getBoundingClientRect();
    x = (a.right + b.left) / 2 - zRect.left;
  }
  caret.style.left = Math.max(2, x) + 'px';
}

function removeInsertCaret() {
  document.getElementById('insert-caret')?.remove();
}

/* ── Check answer ──────────────────────────────────────────────── */
function checkAnswer() {
  const item = queue[qIdx];
  let result;

  if (gameMode === 'type') {
    const inp = document.getElementById('type-input');
    const val = inp.value.trim();
    result = scoreAnswer(val, item.sentence);

    // Visual feedback on input
    inp.className = '';
    if (result.grade === 'perfect' || result.grade === 'typo') {
      inp.classList.add(result.grade === 'perfect' ? 'correct' : 'typo');
    } else if (result.grade !== 'empty') {
      inp.classList.add('wrong');
    }
  } else {
    if (answerWords.length === 0) { showToast('Voeg woorden toe aan je zin!'); return; }
    result = scoreBuild(answerWords, item.sentence);
  }

  if (result.grade === 'empty') {
    showToast('Typ eerst een zin!');
    return;
  }

  const correct = result.grade === 'perfect' || result.grade === 'typo';

  if (correct) {
    const xp = result.grade === 'perfect' ? 3 : 2;
    if (result.grade === 'perfect') _sessionPerfect++;
    showResult(result, item.sentence, xp);
    recordCorrect(xp);
    if (gameMode === 'build') highlightAnswerZone('correct');
  } else {
    attempts++;
    updateRevealBtn();
    showResult(result, item.sentence, 0);
    if (gameMode === 'build') highlightAnswerZone('wrong');
  }
}

function highlightAnswerZone(cls) {
  const z = document.getElementById('answer-zone');
  z.className = 'answer-zone ' + cls;
  setTimeout(() => { z.className = 'answer-zone'; }, 900);
}

function showResult(result, target, xpEarned) {
  const el     = document.getElementById('gc-result');
  const msgEl  = document.getElementById('result-msg');
  const ansEl  = document.getElementById('result-answer');
  const btnEl  = document.getElementById('btn-next');

  el.classList.remove('hidden');

  const grades = {
    perfect: { cls: 'correct', msg: '✅ Uitstekend! Perfecte zin!',         xp: `+${xpEarned} XP` },
    typo:    { cls: 'typo',    msg: '✅ Bijna perfect — kleine typfout!',    xp: `+${xpEarned} XP` },
    order:   { cls: 'order',   msg: '🔄 Goede woorden, verkeerde volgorde!', xp: '' },
    close:   { cls: 'close',   msg: '🟡 Bijna! Controleer ontbrekende woorden.', xp: '' },
    wrong:   { cls: 'wrong',   msg: '❌ Niet correct — probeer opnieuw!',    xp: '' },
    skip:    { cls: 'skip',    msg: '→ Overgeslagen',                        xp: '' },
  };

  const g = grades[result.grade] || grades.wrong;
  msgEl.className   = 'result-msg ' + g.cls;
  msgEl.textContent = g.xp ? `${g.msg}  ${g.xp}` : g.msg;

  if (result.grade === 'perfect' || result.grade === 'typo') {
    ansEl.innerHTML = `Jouw zin klopt! <b>${target}</b>`;
    btnEl.classList.remove('hidden');
  } else if (result.grade === 'skip') {
    ansEl.innerHTML = `Correct antwoord: <b>${target}</b>`;
    btnEl.classList.remove('hidden');
  } else {
    // Mistake feedback
    if (result.grade === 'close' && result.missing?.length) {
      ansEl.innerHTML = `Ontbrekende woorden: <b>${result.missing.join(', ')}</b>`;
    } else if (result.grade === 'order') {
      ansEl.innerHTML = 'Zet de woorden in de juiste volgorde.';
    } else {
      ansEl.innerHTML = 'Probeer het opnieuw — lees de Engelse zin goed.';
    }
    btnEl.classList.add('hidden');
    // Let user try again (only hide check button briefly to prevent spam)
  }
}

function resetResult() {
  document.getElementById('gc-result').classList.add('hidden');
  document.getElementById('btn-next').classList.add('hidden');
  // Reset type input
  const inp = document.getElementById('type-input');
  inp.className = '';
  inp.value = '';
  document.getElementById('type-feedback').textContent = '';
  document.getElementById('type-feedback').className   = 'type-feedback';
}

function updateRevealBtn() {
  document.getElementById('btn-reveal').classList.toggle('hidden', attempts < MAX_ATTEMPTS);
}

function revealAnswer() {
  const item = queue[qIdx];
  showResult({ grade: 'skip' }, item.sentence, 0);
  document.getElementById('btn-next').classList.remove('hidden');
}

function skipSentence() {
  const item = queue[qIdx];
  showResult({ grade: 'skip' }, item.sentence, 0);
  document.getElementById('btn-next').classList.remove('hidden');
}

function nextSentence() {
  qIdx++;
  resetResult();
  if (qIdx >= queue.length) {
    if (progress.count >= DAILY_GOAL) {
      showDone();
    } else {
      buildQueue();
      renderCurrentSentence();
    }
  } else {
    renderCurrentSentence();
  }
}

function showDone() {
  showState('done');
  document.getElementById('done-xp'     ).textContent = _sessionXP;
  document.getElementById('done-streak' ).textContent = progress.streak;
  document.getElementById('done-perfect').textContent = _sessionPerfect;
}

function continueSession() {
  _sessionXP      = 0;
  _sessionPerfect = 0;
  buildQueue();
  renderCurrentSentence();
}

/* ── Live typing feedback (type mode) ─────────────────────────── */
function onTypeInput(inp) {
  const fbEl = document.getElementById('type-feedback');
  const val  = inp.value.trim();
  if (!val) { fbEl.textContent = ''; fbEl.className = 'type-feedback'; inp.className = ''; return; }

  const item = queue[qIdx];
  if (!item) return;
  const r = scoreAnswer(val, item.sentence);
  if (r.grade === 'perfect' || r.grade === 'typo') {
    fbEl.textContent = r.grade === 'perfect' ? '✓ Perfect!' : '✓ Bijna goed';
    fbEl.className   = `type-feedback ${r.grade === 'perfect' ? 'correct' : 'typo'}`;
    inp.className    = r.grade === 'perfect' ? 'correct' : 'typo';
  } else {
    fbEl.textContent = '';
    fbEl.className   = 'type-feedback';
    inp.className    = '';
  }
}

function onTypeKey(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    checkAnswer();
  }
}

/* ── UI rendering ──────────────────────────────────────────────── */
function renderDailyStrip() {
  document.getElementById('str-streak').textContent = progress.streak || 0;
  document.getElementById('str-count' ).textContent = Math.min(progress.count, DAILY_GOAL);

  const dots = document.getElementById('strip-dots');
  dots.innerHTML = '';
  for (let i = 0; i < DAILY_GOAL; i++) {
    const d = document.createElement('div');
    d.className = 'sdot' + (i < progress.count ? ' done' : '');
    dots.appendChild(d);
  }
}

function renderMiniDots() {
  const el = document.getElementById('gc-mini-dots');
  el.innerHTML = '';
  for (let i = 0; i < queue.length; i++) {
    const d = document.createElement('div');
    let cls = 'mdot';
    if (i < qIdx) cls += ' done';
    else if (i === qIdx) cls += ' current';
    d.className = cls;
    el.appendChild(d);
  }
}

/* ── Mode switch ───────────────────────────────────────────────── */
function setMode(m) {
  gameMode = m;
  document.getElementById('btn-type' ).classList.toggle('active', m === 'type');
  document.getElementById('btn-build').classList.toggle('active', m === 'build');
  resetResult();
  if (queue.length > 0 && qIdx < queue.length) {
    const item = queue[qIdx];
    if (m === 'type') {
      renderTypeMode();
    } else {
      renderBuildMode(item.sentence);
    }
  }
}

/* ── Font size ─────────────────────────────────────────────────── */
function changeFontSize(dir) {
  fsIdx = Math.min(FS_STEPS.length - 1, Math.max(0, fsIdx + dir));
  document.documentElement.style.setProperty('--art-fs', FS_STEPS[fsIdx] + 'rem');
  saveJSON(FS_KEY, fsIdx);
}

/* ── Sidebar ───────────────────────────────────────────────────── */
function openSidebar() {
  document.getElementById('sidebar'   ).classList.add('open');
  document.getElementById('sb-backdrop').classList.add('open');
  _sidebarOpen = true;
}
function closeSidebar() {
  document.getElementById('sidebar'   ).classList.remove('open');
  document.getElementById('sb-backdrop').classList.remove('open');
  _sidebarOpen = false;
}

function renderFileGroups() {
  const saved = readJSON(SEL_KEY, null);
  if (saved) selectedFiles = new Set(saved);

  const container = document.getElementById('file-groups');
  container.innerHTML = '';

  FILE_GROUPS.forEach(group => {
    const wrap = document.createElement('div');
    wrap.className = 'fg-group';

    const header = document.createElement('div');
    header.className = 'fg-header';
    header.innerHTML = `
      <span class="fg-arrow ${group.open ? 'open' : ''}">▶</span>
      <span class="fg-label">${group.label}</span>
      <button class="fg-check-all" data-gid="${group.id}">Alles</button>
    `;
    header.querySelector('.fg-arrow').addEventListener('click', () => toggleGroup(group.id));
    header.querySelector('.fg-check-all').addEventListener('click', e => {
      e.stopPropagation();
      toggleGroupAll(group.id, true);
    });
    wrap.appendChild(header);

    const filesDiv = document.createElement('div');
    filesDiv.className = `fg-files${group.open ? '' : ' closed'}`;
    filesDiv.id = `fg-${group.id}`;

    group.files.forEach(f => {
      const row = document.createElement('div');
      row.className = 'fc-row';
      const chk = document.createElement('div');
      chk.className = 'fc-check' + (selectedFiles.has(f) ? ' checked' : '');
      chk.id = `fc-${f}`;
      const lbl = document.createElement('span');
      lbl.className = 'fc-name';
      lbl.textContent = f + '.json';
      row.appendChild(chk);
      row.appendChild(lbl);
      row.addEventListener('click', () => toggleFile(f));
      filesDiv.appendChild(row);
    });

    wrap.appendChild(filesDiv);
    container.appendChild(wrap);
  });

  updateSbCount();
}

function toggleGroup(groupId) {
  const el    = document.getElementById(`fg-${groupId}`);
  const arrow = el?.previousElementSibling?.querySelector('.fg-arrow');
  if (!el) return;
  el.classList.toggle('closed');
  if (arrow) arrow.classList.toggle('open', !el.classList.contains('closed'));
}

function toggleGroupAll(groupId, forceOn) {
  const group = FILE_GROUPS.find(g => g.id === groupId);
  if (!group) return;
  const allSelected = group.files.every(f => selectedFiles.has(f));
  if (allSelected && !forceOn) {
    group.files.forEach(f => { selectedFiles.delete(f); document.getElementById(`fc-${f}`)?.classList.remove('checked'); });
  } else {
    group.files.forEach(f => { selectedFiles.add(f);    document.getElementById(`fc-${f}`)?.classList.add('checked'); });
  }
  updateSbCount();
}

function toggleFile(f) {
  if (selectedFiles.has(f)) {
    selectedFiles.delete(f);
    document.getElementById(`fc-${f}`)?.classList.remove('checked');
  } else {
    selectedFiles.add(f);
    document.getElementById(`fc-${f}`)?.classList.add('checked');
  }
  updateSbCount();
}

function selectAllFiles() {
  FILE_GROUPS.forEach(g => toggleGroupAll(g.id, true));
}
function selectNoFiles() {
  FILE_GROUPS.forEach(g => g.files.forEach(f => {
    selectedFiles.delete(f);
    document.getElementById(`fc-${f}`)?.classList.remove('checked');
  }));
  updateSbCount();
}

function updateSbCount() {
  const el = document.getElementById('sb-count');
  if (el) el.textContent = `${selectedFiles.size} bestand${selectedFiles.size !== 1 ? 'en' : ''}`;
}

async function applyFileSelection() {
  saveJSON(SEL_KEY, [...selectedFiles]);
  closeSidebar();
  _sessionXP      = 0;
  _sessionPerfect = 0;
  await loadSelectedFiles();
}

/* ── Sync drawer passthrough ───────────────────────────────────── */
function toggleSyncDrawer() {
  const d = document.getElementById('sync-drawer');
  const b = document.getElementById('sync-backdrop');
  const open = d.classList.toggle('open');
  b.classList.toggle('open', open);
}
function closeSyncDrawer() {
  document.getElementById('sync-drawer' ).classList.remove('open');
  document.getElementById('sync-backdrop').classList.remove('open');
}

/* ── Init ──────────────────────────────────────────────────────── */
async function init() {
  // Font size
  fsIdx = readJSON(FS_KEY, 2);
  fsIdx = Math.min(FS_STEPS.length - 1, Math.max(0, fsIdx));
  document.documentElement.style.setProperty('--art-fs', FS_STEPS[fsIdx] + 'rem');

  // Progress
  loadProgress();
  renderDailyStrip();

  // File sidebar
  renderFileGroups();

  // Load default selected files
  await loadSelectedFiles();
}

document.addEventListener('DOMContentLoaded', init);
