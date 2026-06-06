'use strict';

/* ─── Tools manifest ─────────────────────────────────────────── */
/* Tools ordered by A2 exam skill — Taalkennis (foundation) first, then the
   four examined skills: Lezen · Luisteren · Schrijven · Spreken            */
const TOOLS = [
  /* ── Taalkennis: vocabulary & grammar that underpin all four skills ── */
  { href:'/dqvn/startnl',   icon:'📖', nl:'Vocabulaire',    en:'Woordenlijst & flashcards',             color:'#2563eb', badge:'Actief', group:'🏗️ Taalkennis'        },
  { href:'/dqvn/vanstart',  icon:'🚀', nl:'VanStart',       en:'NT2 beginnerscursus',                   color:'#059669', badge:'Actief', group:'🏗️ Taalkennis'        },
  { href:'/dqvn/grammar',   icon:'📚', nl:'Grammatica',     en:'Regels & uitleg',                       color:'#b45309',                 group:'🏗️ Taalkennis'        },
  { href:'/dqvn/verbs',     icon:'🔄', nl:'Werkwoorden',    en:'Vervoeging oefenen',                    color:'#dc2626', badge:'Actief', group:'🏗️ Taalkennis'        },
  { href:'/dqvn/kids',      icon:'🧒', nl:'Kids',           en:'Kinderen woordenschat',                 color:'#16a34a', badge:'Nieuw',  group:'🏗️ Taalkennis'        },
  { href:'/dqvn/number',    icon:'🔢', nl:'Getallen',       en:'Leer tellen van 1 tot 100',             color:'#ea580c', badge:'Nieuw',  group:'🏗️ Taalkennis'        },

  /* ── Leesvaardigheid: read & understand Dutch texts ─────────────── */
  { href:'/dqvn/stories',   icon:'📕', nl:'Kinderverhalen', en:'Interactieve verhalen voor kinderen',   color:'#6A67CE',                 group:'📖 Leesvaardigheid'   },
  { href:'/dqvn/stories2',  icon:'📖', nl:'Korte Verhalen', en:'10 beginnersverhalen met woordenschat', color:'#7c3aed', badge:'Nieuw',  group:'📖 Leesvaardigheid'   },
  { href:'/dqvn/rss',       icon:'📰', nl:'Nieuws',         en:'Lees echt Nederlands nieuws',           color:'#0891b2', badge:'Nieuw',  group:'📖 Leesvaardigheid'   },

  /* ── Luistervaardigheid: understand spoken Dutch ─────────────────── */
  { href:'/dqvn/klanken',   icon:'🎵', nl:'Klanken',        en:'Uitspraak & Nederlandse klanken',       color:'#7c3aed', badge:'Actief', group:'🎧 Luistervaardigheid' },
  { href:'/dqvn/podcast',   icon:'🎧', nl:'Podcast',        en:'Met het Oog op Morgen – NPO Radio 1',   color:'#9b5de5', badge:'Nieuw',  group:'🎧 Luistervaardigheid' },

  /* ── Schrijfvaardigheid: write correct Dutch sentences ───────────── */
  { href:'/dqvn/sentence',  icon:'✏️', nl:'Zinnen Bouwen',  en:'Schrijf & bouw Nederlandse zinnen',     color:'#06d6a0', badge:'Nieuw',  group:'✍️ Schrijfvaardigheid' },

  /* ── Spreekvaardigheid: speak & have conversations in Dutch ─────── */
  { href:'/dqvn/dialogues', icon:'💬', nl:'Dialogen',       en:'Gespreksoefening met rolverdeling',     color:'#0891b2',                 group:'🗣️ Spreekvaardigheid' },
  { href:'/dqvn/wheel',     icon:'🎡', nl:'Draairad',       en:'Willekeurige spreekvragen',             color:'#9b5de5', badge:'Nieuw',  group:'🗣️ Spreekvaardigheid' },
];

/* ─── Helpers ─────────────────────────────────────────────────── */
function readJSON(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; }
  catch { return fallback; }
}

/* ─── VanStart lesson helpers ────────────────────────────────── */
const _VS_LESSONS = [
  'thema01','thema02','thema03','thema04','thema05','thema06','thema07','thema08',
  'core01', 'core02', 'core03', 'core04', 'core05', 'core06', 'core07', 'core08',
  'core09', 'core10',
];
const _VS_TOTAL = _VS_LESSONS.length; // 18

function _vsLabel(id) {
  if (!id) return null;
  const m = id.match(/^(thema|core)(\d+)$/);
  if (!m) return id;
  return (m[1] === 'thema' ? 'Thema ' : 'Core ') + parseInt(m[2], 10);
}
function _vsIdx(id) { return _VS_LESSONS.indexOf(id || ''); }

/* ─── Vocab chapter order (mirrors ttsscript.js fileNames) ─────── */
const _VOCAB_CHAPTERS = [
  'ch01','ch03','ch02','ch04','ch05','ch06','ch07','ch08','ch09','ch10',
  'ch11','ch12','ch13','ch14','ch15','ch16','ch17','ch18',
  'sp02','sp03','sp04','sp05','sp06','sp07','sp08','sp09','sp10','sp11',
  'sp12','sp13','sp14','sp15','sp16','sp17','sp18','sp19','sp20','sp21',
  'sp22','sp23','sp24','sp25','sp26','sp27',
  'sw02','sw05','sw07','sw09','sw10','sw12','sw13','sw14','sw15','sw16',
  'sw17','sw18','sw19','sw20','sw21','sw22','sw23','sw24','sw25','sw26',
  'sw27','sw28','sw29','sw30','sw31','sw32','sw33','sw34','sw35','sw36',
  'sw37','sw38','sw39','sw40','sw41','sw42','sw43','sw44','sw45','sw46',
  'sw47','sw48','sw49','sw50','sw51','sw52',
  'sz02','sz03','sz04','sz05','sz06','sz07','sz08','sz09','sz10','sz11',
  'sz12','sz13','sz14','sz15','sz16','sz17','sz18','sz19',
];

/* ─── Deep-link target helpers ──────────────────────────────────── */

/* True when every word in the lesson has been seen at least once in SRS */
function _lessonAllSeen(lessonId, srs) {
  const ch = srs[lessonId];
  if (!ch || typeof ch !== 'object') return false;
  const words = Object.values(ch);
  return words.length > 0 && words.every(s => s?.state && s.state !== 'new');
}

/* VanStart: stay on current lesson if still unseen words; else advance */
function _vsTargetLesson(lastLesson, vsIdx, srs) {
  if (!lastLesson) return _VS_LESSONS[0];
  if (_lessonAllSeen(lastLesson, srs) && vsIdx < _VS_TOTAL - 1) return _VS_LESSONS[vsIdx + 1];
  return lastLesson;
}

/* Vocab: chapter with most due cards first; else first chapter with unseen words */
function _vocabDeepTarget(srs, now) {
  let bestCh = null, bestDue = 0;
  for (const [chId, chData] of Object.entries(srs)) {
    if (!chData || typeof chData !== 'object') continue;
    let due = 0;
    for (const s of Object.values(chData)) {
      if (s?.nextDue > 0 && s.nextDue <= now) due++;
    }
    if (due > bestDue) { bestDue = due; bestCh = chId; }
  }
  if (bestCh) return { lesson: bestCh, review: true };

  for (const chId of _VOCAB_CHAPTERS) {
    const chData = srs[chId];
    if (!chData) return { lesson: chId, review: false };
    if (Object.values(chData).some(s => !s?.state || s.state === 'new'))
      return { lesson: chId, review: false };
  }
  return { lesson: null, review: false };
}

/* Verbs: lesson with the lowest average correct/seen ratio */
function _verbsWeakLesson(verbsStore) {
  const lessons = verbsStore?.lessons || {};
  let weakId = null, lowestAvg = Infinity;
  for (const [id, ld] of Object.entries(lessons)) {
    if (!ld?.verbStats || typeof ld.verbStats !== 'object') continue;
    const stats = Object.values(ld.verbStats);
    if (!stats.length) continue;
    const avg = stats.reduce((s, vs) => s + (vs.correct || 0) / Math.max(vs.seen || 1, 1), 0) / stats.length;
    if (avg < lowestAvg) { lowestAvg = avg; weakId = id; }
  }
  return weakId;
}

/* ─── Personalized greeting ──────────────────────────────────── */
function applyGreeting() {
  const h    = new Date().getHours();
  const time = h < 6 ? 'Goedenacht' : h < 12 ? 'Goedemorgen' : h < 18 ? 'Goedemiddag' : 'Goedenavond';
  const user = readJSON('fc_sync_user', null);
  const first = user?.name?.split(/[\s,]+/)?.[0] || '';
  const greet = first ? `${time}, ${first}! 👋` : `${time}! 👋`;
  document.getElementById('portal-greeting').textContent = greet;
  if (first) {
    document.getElementById('portal-sub').textContent =
      `Welkom terug, ${first}. Ga verder waar je gebleven bent.`;
  }
}

/* ─── Stats computation ──────────────────────────────────────── */
function computeStats() {
  /* Flashcards */
  const meta    = readJSON('nl_srs_meta_v3', {});
  const srs     = readJSON('nl_srs_v3', {});
  let cardsSeen = 0, cardsMastered = 0;
  for (const ch of Object.values(srs)) {
    if (!ch || typeof ch !== 'object') continue;
    for (const st of Object.values(ch)) {
      if (!st?.state) continue;
      if (st.state !== 'new') cardsSeen++;
      if (st.state === 'review' && (st.interval || 0) >= 21) cardsMastered++;
    }
  }

  /* Klanken */
  const klanken      = readJSON('klanken-v1', {});
  const klankenDone  = Object.values(klanken).filter(Boolean).length;
  const KLANKEN_TOTAL = 48;

  /* Verbs */
  const verbsData  = readJSON('nl_verbs_v3', {});
  let verbsLearned = 0, verbsSeen = 0;
  for (const lesson of Object.values(verbsData)) {
    if (!lesson?.verbStats) continue;
    for (const vs of Object.values(lesson.verbStats)) {
      verbsSeen++;
      if ((vs.correct || 0) / Math.max(vs.seen || 1, 1) > 0.2) verbsLearned++;
    }
  }
  const VERBS_TOTAL = Math.max(verbsSeen, 60);

  /* Dialogues */
  const dlg      = readJSON('nl_dlg_v1', {});
  const dlgDone  = Object.keys(dlg.stats || {}).length;
  const dlgStreak = dlg.streak?.days || 0;
  const DLG_TOTAL = 20;

  /* Stories2 quiz */
  const s2quiz     = readJSON('nl_s2_quiz_v1', {});
  const s2quizDone = Object.values(s2quiz).filter(q => q.completed).length;
  const S2_TOTAL   = 15;

  /* RSS news reading */
  const rssData    = readJSON('nl_rss_v1', { read: [], total: 0 });
  const rssRead    = rssData.total || (rssData.read?.length || 0);
  const RSS_TARGET = 30;

  /* Podcast listening */
  const podData       = readJSON('nl_podcast_v1', { listened: [], total: 0 });
  const podListened   = podData.total || (podData.listened?.length || 0);
  const PODCAST_TARGET = 20;

  /* Sentence building */
  const sentData       = readJSON('nl_sentence_v1', { count: 0, streak: 0, xp: 0, date: '' });
  const today          = new Date().toISOString().slice(0, 10);
  const sentToday      = sentData.date === today ? (sentData.count || 0) : 0;
  const sentStreak     = sentData.streak || 0;
  const SENT_GOAL      = 5;

  /* VanStart NT2 course */
  const vsData       = readJSON('nl_vanstart_v1', {});
  const vsLastLesson = vsData.lastLesson || null;
  const vsStreak     = vsData.streak     || 0;
  const vsIdx        = _vsIdx(vsLastLesson);
  const vsPct        = vsLastLesson && vsIdx >= 0
    ? Math.min(100, Math.round((vsIdx + 1) / _VS_TOTAL * 100))
    : 0;

  return {
    streak:     meta.streak        || 0,
    cardsSeen,  cardsMastered,
    klankenDone, KLANKEN_TOTAL,
    verbsLearned, VERBS_TOTAL,
    dlgDone, dlgStreak, DLG_TOTAL,
    s2quizDone, S2_TOTAL,
    rssRead, RSS_TARGET,
    podListened, PODCAST_TARGET,
    sentToday, sentStreak, SENT_GOAL,
    sentXP:       sentData.xp || 0,
    vsLastLesson, vsStreak, vsPct, vsIdx,
    vsStudiedToday: (vsData.lastDate || '') === today,
  };
}

/* ─── Render stats strip ─────────────────────────────────────── */
function renderStats(s) {
  document.getElementById('sv-streak').textContent  = s.streak;
  document.getElementById('sv-cards').textContent   = s.cardsSeen;
  document.getElementById('sv-klanken').textContent = s.klankenDone;
  document.getElementById('sv-verbs').textContent   = s.verbsLearned;
}

/* ─── Render progress cards ──────────────────────────────────── */
function renderProgress(s) {
  const vocabPct   = s.cardsSeen    > 0 ? Math.min(100, Math.round(s.cardsMastered  / Math.max(s.cardsSeen,    1) * 100)) : 0;
  const klankenPct = Math.min(100, Math.round(s.klankenDone  / s.KLANKEN_TOTAL  * 100));
  const verbsPct   = Math.min(100, Math.round(s.verbsLearned / s.VERBS_TOTAL    * 100));
  const dlgPct     = Math.min(100, Math.round(s.dlgDone      / s.DLG_TOTAL      * 100));

  const cards = [
    {
      href: '/dqvn/startnl', icon: '📖', color: '#2563eb',
      nl: 'Vocabulaire',
      pct: vocabPct,
      detail: s.cardsSeen > 0
        ? `${s.cardsMastered} beheerst &nbsp;·&nbsp; ${s.cardsSeen} gezien`
        : 'Nog niet begonnen — start de flashcards!',
    },
    {
      href: '/dqvn/klanken', icon: '🎵', color: '#7c3aed',
      nl: 'Klanken',
      pct: klankenPct,
      detail: s.klankenDone > 0
        ? `${s.klankenDone} van ~${s.KLANKEN_TOTAL} klanken geoefend`
        : 'Nog niet begonnen — leer de uitspraak!',
    },
    {
      href: '/dqvn/vanstart', icon: '🚀', color: '#059669',
      nl: 'VanStart',
      pct: s.vsPct,
      detail: s.vsLastLesson
        ? `Les ${s.vsIdx + 1}/${_VS_TOTAL} · ${_vsLabel(s.vsLastLesson)}${s.vsStreak > 1 ? ` &nbsp;·&nbsp; 🔥 ${s.vsStreak} dagen` : ''}`
        : 'Nog niet begonnen — start de NT2 cursus!',
    },
    {
      href: '/dqvn/sentence', icon: '✏️', color: '#06d6a0',
      nl: 'Zinnen Bouwen',
      pct: Math.min(100, Math.round((s.sentToday || 0) / (s.SENT_GOAL || 5) * 100)),
      detail: (s.sentToday || 0) > 0
        ? `${s.sentToday}/5 vandaag${s.sentToday >= s.SENT_GOAL ? ' 🎉' : ' 🔔'}${s.sentStreak > 0 ? ` &nbsp;·&nbsp; 🔥 ${s.sentStreak} dagen` : ''} &nbsp;·&nbsp; ⭐ ${s.sentXP} XP`
        : `Nog niet begonnen — schrijf 5 zinnen per dag!${s.sentXP > 0 ? ` &nbsp;·&nbsp; ⭐ ${s.sentXP} XP totaal` : ''}`,
    },
    {
      href: '/dqvn/verbs', icon: '🔄', color: '#dc2626',
      nl: 'Werkwoorden',
      pct: verbsPct,
      detail: s.verbsLearned > 0
        ? `${s.verbsLearned} werkwoorden geleerd`
        : 'Nog niet begonnen — oefen werkwoorden!',
    },
    {
      href: '/dqvn/dialogues', icon: '💬', color: '#0891b2',
      nl: 'Dialogen',
      pct: dlgPct,
      detail: s.dlgDone > 0
        ? `${s.dlgDone} dialogen geoefend${s.dlgStreak > 1 ? ' &nbsp;·&nbsp; 🔥 ' + s.dlgStreak + ' dagen' : ''}`
        : 'Nog niet begonnen — oefen gesprekken!',
    },
    {
      href: '/dqvn/stories2', icon: '📖', color: '#8b5cf6',
      nl: 'Verhalen',
      pct: Math.min(100, Math.round((s.s2quizDone || 0) / (s.S2_TOTAL || 10) * 100)),
      detail: (s.s2quizDone || 0) > 0
        ? `${s.s2quizDone} van ${s.S2_TOTAL} quizzen voltooid`
        : 'Nog niet begonnen — lees korte verhalen!',
    },
    {
      href: '/dqvn/rss', icon: '📰', color: '#0891b2',
      nl: 'Nieuws',
      pct: Math.min(100, Math.round((s.rssRead || 0) / (s.RSS_TARGET || 30) * 100)),
      detail: (s.rssRead || 0) > 0
        ? `${s.rssRead} artikelen gelezen${s.rssRead >= s.RSS_TARGET ? ' — doel bereikt! 🎉' : ` van ${s.RSS_TARGET}`}`
        : 'Nog niet begonnen — lees echt nieuws!',
    },
    {
      href: '/dqvn/podcast', icon: '🎧', color: '#9b5de5',
      nl: 'Podcast',
      pct: Math.min(100, Math.round((s.podListened || 0) / (s.PODCAST_TARGET || 20) * 100)),
      detail: (s.podListened || 0) > 0
        ? `${s.podListened} afleveringen beluisterd${s.podListened >= s.PODCAST_TARGET ? ' — doel bereikt! 🎉' : ` van ${s.PODCAST_TARGET}`}`
        : 'Nog niet begonnen — luister naar podcasts!',
    },
  ];

  document.getElementById('prog-grid').innerHTML = cards.map(c => `
    <a class="prog-card" href="${c.href}">
      <div class="prog-card-top">
        <div class="prog-icon-wrap" style="background:${c.color}18">${c.icon}</div>
        <span class="prog-title">${c.nl}</span>
        <span class="prog-pct">${c.pct}%</span>
      </div>
      <div class="prog-track">
        <div class="prog-fill" id="pf-${c.nl.toLowerCase()}" style="background:${c.color};width:0%"></div>
      </div>
      <div class="prog-detail">${c.detail}</div>
    </a>
  `).join('');

  /* Animate bars after next paint */
  requestAnimationFrame(() => requestAnimationFrame(() => {
    cards.forEach(c => {
      const el = document.getElementById('pf-' + c.nl.toLowerCase());
      if (el) el.style.width = c.pct + '%';
    });
  }));
}

/* ─── Render tools grid ──────────────────────────────────────── */
function renderTools() {
  /* Group tools preserving insertion order */
  const groups = {};
  TOOLS.forEach(t => { (groups[t.group] ??= []).push(t); });

  const numTools = TOOLS.length;
  const numCats  = Object.keys(groups).length;
  const badge = document.getElementById('tools-badge');
  if (badge) badge.textContent = `${numTools} tools · ${numCats} categorieën`;

  const cardHtml = t => `
    <a class="tool-card" href="${t.href}" style="--tc:${t.color}">
      <div class="tc-icon">${t.icon}</div>
      <div class="tc-name">${t.nl}</div>
      <div class="tc-desc">${t.en}</div>
      ${t.badge === 'Actief' ? `<div class="tc-pill tc-pill-active">Actief</div>` : ''}
      ${t.badge === 'Nieuw'  ? `<div class="tc-pill tc-pill-new">Nieuw</div>`    : ''}
    </a>`;

  document.getElementById('tools-container').innerHTML =
    Object.entries(groups).map(([grp, tools]) => `
      <div class="tools-group">
        <div class="tools-group-lbl">${grp}</div>
        <div class="tools-grid">${tools.map(cardHtml).join('')}</div>
      </div>
    `).join('');
}

/* ─── Volume control ─────────────────────────────────────────── */
function initVolume() {
  const slider = document.getElementById('vol-slider');
  const label  = document.getElementById('vol-val');
  let vol = 70;
  try {
    const stored = JSON.parse(localStorage.getItem('nl_vocab_vol') || 'null');
    if (stored?.v != null) vol = stored.v;
  } catch {}
  slider.value      = vol;
  label.textContent = vol + '%';
  slider.addEventListener('input', () => {
    const v = +slider.value;
    label.textContent = v + '%';
    try { localStorage.setItem('nl_vocab_vol', JSON.stringify({ v, t: Date.now() })); } catch {}
  });
}

/* ─── TTS speed control ──────────────────────────────────────── */
function initSpeed() {
  const slider = document.getElementById('speed-slider');
  const label  = document.getElementById('speed-val');
  let rate = 0.8;
  try {
    const stored = parseFloat(localStorage.getItem('nl_tts_rate'));
    if (!isNaN(stored)) rate = Math.min(1.5, Math.max(0.5, stored));
  } catch {}
  slider.value      = rate;
  label.textContent = rate.toFixed(2) + '×';
  slider.addEventListener('input', () => {
    const v = parseFloat(slider.value);
    label.textContent = v.toFixed(2) + '×';
    try { localStorage.setItem('nl_tts_rate', String(v)); } catch {}
  });
}

/* ─── Scroll reveal ──────────────────────────────────────────── */
function initReveal() {
  const els = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver(entries => {
      entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('visible'); io.unobserve(e.target); } });
    }, { threshold: 0.08 });
    els.forEach(el => io.observe(el));
  } else {
    els.forEach(el => el.classList.add('visible'));
  }
}

/* ─── Year ───────────────────────────────────────────────────── */
document.getElementById('pf-year').textContent = '© ' + new Date().getFullYear();

/* ─── Today's Tasks ─────────────────────────────────────────── */
function _daysBetween(dateStr, todayStr) {
  try { return Math.floor((new Date(todayStr) - new Date(dateStr)) / 86400000); }
  catch { return 999; }
}

function computeTodayTasks() {
  const today = new Date().toISOString().slice(0, 10);
  const hour  = new Date().getHours();
  const now   = Date.now();

  const meta       = readJSON('nl_srs_meta_v3', {});
  const srs        = readJSON('nl_srs_v3', {});
  const verbsStore = readJSON('nl_verbs_v3', {});
  const dlg        = readJSON('nl_dlg_v1', {});
  const sent       = readJSON('nl_sentence_v1', {});
  const klanken    = readJSON('klanken-v1', {});
  const vsData     = readJSON('nl_vanstart_v1', {});

  /* SRS: due + seen */
  let cardsDue = 0, cardsSeen = 0;
  for (const ch of Object.values(srs)) {
    if (!ch || typeof ch !== 'object') continue;
    for (const st of Object.values(ch)) {
      if (!st?.state || st.state === 'new') continue;
      cardsSeen++;
      if (st.nextDue > 0 && st.nextDue <= now) cardsDue++;
    }
  }
  const fcStreak        = meta.streak || 0;
  const fcReviewedToday = meta.todayDate === today;

  /* Verbs */
  const verbsLastStudy    = verbsStore.lastStudy || null;
  const verbsStreak       = verbsStore.streak || 0;
  const verbsStudiedToday = verbsLastStudy === today;
  const verbsGap          = _daysBetween(verbsLastStudy, today);

  /* Dialogues */
  const dlgStreak         = dlg.streak?.days || 0;
  const dlgLastDate       = dlg.streak?.lastDate || null;
  const dlgPracticedToday = dlgLastDate === today;
  const dlgGap            = _daysBetween(dlgLastDate, today);

  /* Sentences */
  const sentCount    = sent.date === today ? (sent.count || 0) : 0;
  const sentStreak   = sent.streak || 0;
  const sentGoalDone = (sent.lastGoalDate || '') === today;
  const SENT_GOAL    = 5;

  /* Klanken */
  const klankenDone   = Object.values(klanken).filter(Boolean).length;
  const KLANKEN_TOTAL = 48;

  const isBeginner  = cardsSeen < 10;
  const isMorning   = hour >= 6  && hour < 12;
  const isAfternoon = hour >= 12 && hour < 18;
  const isEvening   = hour >= 18 && hour < 23;

  const candidates = [];

  /* VANSTART — always a candidate; suppressed only when the full course is done */
  {
    const vsLastLesson   = vsData.lastLesson || null;
    const vsStreak       = vsData.streak     || 0;
    const vsStudiedToday = (vsData.lastDate || '') === today;
    const vsGap          = _daysBetween(vsData.lastDate || null, today);
    const hasStarted     = !!vsLastLesson;
    const vsCourseIdx    = _vsIdx(vsLastLesson);
    const vsCompleted    = hasStarted && vsCourseIdx >= _VS_TOTAL - 1;

    if (!vsCompleted) {
      /* Deep-link: stay on current lesson if unseen words remain; else next lesson */
      const vsTarget = _vsTargetLesson(vsLastLesson, vsCourseIdx, srs);

      let score = (isBeginner || !hasStarted) ? 80 : 35;
      let reason, urgency = 'normal';

      if (vsStudiedToday) {
        score -= 40;
        reason = `${_vsLabel(vsLastLesson) || 'VanStart'} geoefend vandaag`;
      } else if (hasStarted) {
        if (vsStreak > 0) {
          score += 18; reason = `Bewaar je ${vsStreak}-daagse reeks!`; urgency = 'streak';
        } else if (vsGap >= 3) {
          score += 14; reason = `${vsGap} dagen niet geoefend · ${_vsLabel(vsLastLesson)}`;
        } else {
          reason = `Verder met ${_vsLabel(vsTarget)}`;
        }
      } else {
        score = 80; reason = 'Start je NT2 cursus — de basis!'; urgency = 'foundational';
      }
      if (isMorning) score += 5;

      candidates.push({
        id: 'vanstart', href: `/dqvn/vanstart?lesson=${vsTarget}`, icon: '🚀', nl: 'VanStart',
        color: '#059669', score, reason, urgency,
        done: vsStudiedToday, progress: null,
      });
    }
  }

  /* KLANKEN — foundational; scored high for beginners */
  {
    const pct = klankenDone / KLANKEN_TOTAL;
    let score = isBeginner ? 65 : (klankenDone === 0 ? 45 : 18);
    let reason = klankenDone === 0
      ? 'Leer de Nederlandse klanken — basis van uitspraak!'
      : `${klankenDone} van ${KLANKEN_TOTAL} klanken geoefend`;
    if (klankenDone < 12) score += 10;
    if (pct > 0.8)        score -= 15;
    if (isMorning)        score += 4;
    candidates.push({
      id: 'klanken', href: '/dqvn/klanken?start=next', icon: '🎵', nl: 'Klanken',
      color: '#7c3aed', score, reason,
      urgency: klankenDone === 0 ? 'foundational' : 'normal', done: false, progress: null,
    });
  }

  /* VOCABULAIRE — only meaningful for non-beginners */
  if (!isBeginner) {
    /* Deep-link: chapter with most due cards; else first chapter with unseen words */
    const vocabTarget = _vocabDeepTarget(srs, now);

    let score = 22, reason = 'Oefen je woordenschat', urgency = 'normal';
    if (cardsDue > 0) {
      score += 52;
      reason = `${cardsDue} kaart${cardsDue !== 1 ? 'en' : ''} wacht${cardsDue === 1 ? '' : 'en'} op herhaling`;
      urgency = 'due';
    }
    if (fcStreak > 0 && !fcReviewedToday) {
      score += 20;
      if (urgency === 'normal') { reason = `Bewaar je ${fcStreak}-daagse reeks!`; urgency = 'streak'; }
    }
    if (cardsDue > 10)                    score += 8;
    if (fcReviewedToday && cardsDue === 0) score -= 45;
    if (isMorning)                         score += 5;

    const vocabHref = vocabTarget.lesson
      ? `/dqvn/startnl?lesson=${vocabTarget.lesson}${vocabTarget.review ? '&mode=review' : ''}`
      : '/dqvn/startnl';
    candidates.push({
      id: 'vocab', href: vocabHref, icon: '📖', nl: 'Vocabulaire',
      color: '#2563eb', score, reason, urgency,
      done: fcReviewedToday && cardsDue === 0, progress: null,
    });
  }

  /* ZINNEN BOUWEN */
  {
    let score = 18, reason = 'Schrijf 5 Nederlandse zinnen vandaag',
        urgency = 'normal', progress = null;
    if (sentCount > 0 && !sentGoalDone) {
      score += 38;
      reason = `${sentCount}/${SENT_GOAL} zinnen vandaag — ga verder!`;
      urgency = 'inprog';
      progress = { cur: sentCount, max: SENT_GOAL };
    } else if (!sentGoalDone) {
      score += 22;
      if (sentStreak > 0) {
        score += 15;
        reason = `Bewaar je ${sentStreak}-daagse schrijfreeks!`;
        urgency = 'streak';
      }
    }
    if (sentGoalDone) score -= 50;
    if (isEvening)    score += 7;
    if (isMorning)    score += 4;
    candidates.push({
      id: 'sentence', href: '/dqvn/sentence', icon: '✏️', nl: 'Zinnen Bouwen',
      color: '#06d6a0', score, reason, urgency,
      done: sentGoalDone, progress,
    });
  }

  /* WERKWOORDEN */
  {
    /* Deep-link: lesson with lowest avg correct/seen ratio */
    const weakVerbLesson = _verbsWeakLesson(verbsStore);

    let score = 14, reason = 'Oefen werkwoordvervoeging', urgency = 'normal';
    if (!verbsStudiedToday) {
      score += 18;
      if (verbsStreak > 0)  { score += 18; reason = `Bewaar je ${verbsStreak}-daagse reeks!`; urgency = 'streak'; }
      if (verbsGap >= 3 && urgency === 'normal') { score += 15; reason = `${verbsGap} dagen niet geoefend`; }
      if (!verbsLastStudy)  { score += 8;  reason = 'Probeer werkwoorden — essentieel voor NT2!'; }
    } else {
      score -= 28;
    }
    if (isAfternoon) score += 5;
    candidates.push({
      id: 'verbs',
      href: weakVerbLesson ? `/dqvn/verbs?lesson=${weakVerbLesson}&mode=study` : '/dqvn/verbs',
      icon: '🔄', nl: 'Werkwoorden',
      color: '#dc2626', score, reason, urgency,
      done: verbsStudiedToday, progress: null,
    });
  }

  /* DIALOGEN */
  {
    let score = 13, reason = 'Oefen een gesprek in het Nederlands', urgency = 'normal';
    if (!dlgPracticedToday) {
      score += 16;
      if (dlgStreak > 0) { score += 18; reason = `Bewaar je ${dlgStreak}-daagse gespreksreeks!`; urgency = 'streak'; }
      if (dlgGap >= 3 && urgency === 'normal') { score += 12; reason = `${dlgGap} dagen niet geoefend`; }
    } else {
      score -= 30;
    }
    if (isEvening) score += 7;
    candidates.push({
      id: 'dialogues', href: '/dqvn/dialogues', icon: '💬', nl: 'Dialogen',
      color: '#0891b2', score, reason, urgency,
      done: dlgPracticedToday, progress: null,
    });
  }

  /* Sort descending by score */
  candidates.sort((a, b) => b.score - a.score);

  /* Pick top-2 from different skill categories for diversity */
  const catOf = {
    vanstart: 'basis', klanken: 'uitspraak', vocab: 'basis',
    verbs: 'grammatica', sentence: 'schrijven', dialogues: 'spreken',
  };
  const [first, ...rest] = candidates;
  let second = rest.find(c => catOf[c.id] !== catOf[first.id]) || rest[0] || null;

  return [first, second].filter(Boolean);
}

function renderTodayTasks() {
  const user = readJSON('fc_sync_user', null);
  const wrap = document.getElementById('today-tasks-wrap');
  if (!wrap) return;
  if (!user) { wrap.hidden = true; return; }
  wrap.hidden = false;

  const tasks = computeTodayTasks();
  const grid  = document.getElementById('today-tasks-grid');
  const activeTasks = tasks.filter(t => !t.done);

  if (activeTasks.length === 0) {
    const first = user.name?.split(/[\s,]+/)[0] || '';
    grid.innerHTML = `
      <div class="today-done-card">
        <div class="today-done-ico">🎉</div>
        <div class="today-done-text">Goed bezig${first ? ', ' + first : ''}! Prioriteiten voor vandaag klaar.</div>
        <div class="today-done-sub">Je bent op schema — blijf elke dag een beetje oefenen.</div>
      </div>`;
    return;
  }

  const urgLabel = { streak:'🔥 Reeks bewaren', due:'⏰ Kaarten klaar', inprog:'▶ Bezig', foundational:'🏗 Basis', normal:null };
  const urgCls   = { streak:'today-urg-streak', due:'today-urg-due', inprog:'today-urg-inprog', foundational:'today-urg-found', normal:null };

  grid.innerHTML = activeTasks.map(t => {
    const urg     = urgLabel[t.urgency];
    const urgHtml = urg ? `<span class="today-urgency ${urgCls[t.urgency]}">${urg}</span>` : '';
    const miniBar = t.progress
      ? `<div class="today-mini-track"><div class="today-mini-fill" id="tmf-${t.id}" style="background:${t.color}"></div></div>`
      : '';
    return `
      <a class="today-card" href="${t.href}" style="--tc:${t.color}">
        <div class="today-icon-wrap" style="background:${t.color}18">${t.icon}</div>
        <div class="today-body">
          <div class="today-name">${t.nl}</div>
          <div class="today-reason">${t.reason}</div>
          ${urgHtml}${miniBar}
        </div>
        <div class="today-arrow">›</div>
      </a>`;
  }).join('');

  requestAnimationFrame(() => requestAnimationFrame(() => {
    activeTasks.forEach(t => {
      if (!t.progress) return;
      const el = document.getElementById('tmf-' + t.id);
      if (el) el.style.width = Math.round(t.progress.cur / t.progress.max * 100) + '%';
    });
  }));
}

/* ─── Dashboard entry point ──────────────────────────────────── */
function renderDashboard() {
  applyGreeting();
  const s = computeStats();
  renderStats(s);
  renderTodayTasks();
  renderProgress(s);
  updatePlanCTA();
}

/* ─── Plan CTA — updates based on login state ───────────────── */
function updatePlanCTA() {
  const btn = document.getElementById('plan-cta-btn');
  if (!btn) return;
  const user = readJSON('fc_sync_user', null);
  if (user) {
    const first = user.name?.split(/[\s,]+/)[0] || user.email || '';
    btn.textContent = `✓ Aangemeld als ${first}`;
    btn.className = 'plan-cta plan-cta-done';
  } else {
    btn.textContent = 'Meld je gratis aan →';
    btn.className = 'plan-cta plan-cta-accent';
    btn.onclick = () => {
      if (window.google?.accounts?.id) {
        google.accounts.id.prompt(() => {});
      } else {
        /* GIS not loaded yet — scroll to the header sign-in widget */
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    };
  }
}

/* Called by sync.js after a successful cloud sync — refresh stats */
function updateWordBadges() { renderDashboard(); }

/* Called by sync.js when login state changes — show/hide today's tasks */
function onSyncUserChange() { renderTodayTasks(); updatePlanCTA(); }

/* ─── Theme picker ──────────────────────────────────────────── */
const THEMES = [
  { id:'orange', name:'Oranje (standaard)', swatch:'linear-gradient(135deg,#b45309,#f97316)' },
  { id:'blue',   name:'Oceaan',             swatch:'linear-gradient(135deg,#1d4ed8,#38bdf8)' },
  { id:'green',  name:'Natuur',             swatch:'linear-gradient(135deg,#15803d,#4ade80)' },
  { id:'purple', name:'Amethist',           swatch:'linear-gradient(135deg,#6d28d9,#c084fc)' },
  { id:'rose',   name:'Roos',               swatch:'linear-gradient(135deg,#be185d,#fb7185)' },
  { id:'amber',  name:'Goud',               swatch:'linear-gradient(135deg,#92400e,#fbbf24)' },
  { id:'dark',   name:'Nacht',              swatch:'linear-gradient(135deg,#1e293b,#6366f1)' },
];

function applyTheme(id) {
  document.documentElement.setAttribute('data-theme', id === 'orange' ? '' : id);
  const wrap = document.getElementById('theme-swatches');
  if (wrap) wrap.querySelectorAll('.theme-swatch').forEach(
    btn => btn.classList.toggle('active', btn.dataset.themeId === id)
  );
}

function initTheme() {
  const raw   = readJSON('nl_portal_theme', {});
  const saved = raw?.v || 'orange';
  applyTheme(saved);
  const wrap = document.getElementById('theme-swatches');
  THEMES.forEach(t => {
    const btn = document.createElement('button');
    btn.className        = 'theme-swatch' + (t.id === saved ? ' active' : '');
    btn.title            = t.name;
    btn.dataset.themeId  = t.id;
    btn.style.background = t.swatch;
    btn.onclick = () => {
      applyTheme(t.id);
      try { localStorage.setItem('nl_portal_theme', JSON.stringify({ v: t.id, t: Date.now() })); } catch {}
      wrap.querySelectorAll('.theme-swatch').forEach(s => s.classList.remove('active'));
      btn.classList.add('active');
      if (typeof syncNow === 'function') syncNow(true);
    };
    wrap.appendChild(btn);
  });
}

/* ─── Boot ───────────────────────────────────────────────────── */
renderTools();
renderDashboard();
initVolume();
initSpeed();
initTheme();
initReveal();
