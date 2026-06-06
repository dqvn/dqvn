'use strict';

/* ─── Tools manifest ─────────────────────────────────────────── */
/* Tools ordered by A2 exam skill — Taalkennis (foundation) first, then the
   four examined skills: Lezen · Luisteren · Schrijven · Spreken            */
const TOOLS = [
  /* ── Taalkennis: vocabulary & grammar that underpin all four skills ── */
  { href:'/dqvn/startnl',   icon:'📖', nl:'Vocabulaire',    nameEn:'Vocabulary',        en:'Woordenlijst & flashcards',             descEn:'Word list & flashcards',              color:'#2563eb', badge:'Actief', group:'🏗️ Taalkennis'        },
  { href:'/dqvn/vanstart',  icon:'🚀', nl:'VanStart',       nameEn:'VanStart',          en:'NT2 beginnerscursus',                   descEn:'NT2 beginner course',                 color:'#059669', badge:'Actief', group:'🏗️ Taalkennis'        },
  { href:'/dqvn/grammar',   icon:'📚', nl:'Grammatica',     nameEn:'Grammar',           en:'Regels & uitleg',                       descEn:'Rules & explanations',                color:'#b45309',                 group:'🏗️ Taalkennis'        },
  { href:'/dqvn/verbs',     icon:'🔄', nl:'Werkwoorden',    nameEn:'Verbs',             en:'Vervoeging oefenen',                    descEn:'Conjugation practice',                color:'#dc2626', badge:'Actief', group:'🏗️ Taalkennis'        },
  { href:'/dqvn/kids',      icon:'🧒', nl:'Kids',           nameEn:'Kids',              en:'Kinderen woordenschat',                 descEn:"Children's vocabulary",               color:'#16a34a', badge:'Nieuw',  group:'🏗️ Taalkennis'        },
  { href:'/dqvn/number',    icon:'🔢', nl:'Getallen',       nameEn:'Numbers',           en:'Leer tellen van 1 tot 100',             descEn:'Learn to count from 1 to 100',        color:'#ea580c', badge:'Nieuw',  group:'🏗️ Taalkennis'        },

  /* ── Leesvaardigheid: read & understand Dutch texts ─────────────── */
  { href:'/dqvn/stories',   icon:'📕', nl:'Kinderverhalen', nameEn:"Children's Stories",en:'Interactieve verhalen voor kinderen',   descEn:'Interactive stories for children',    color:'#6A67CE',                 group:'📖 Leesvaardigheid'   },
  { href:'/dqvn/stories2',  icon:'📖', nl:'Korte Verhalen', nameEn:'Short Stories',     en:'10 beginnersverhalen met woordenschat', descEn:'10 beginner stories with vocabulary', color:'#7c3aed', badge:'Nieuw',  group:'📖 Leesvaardigheid'   },
  { href:'/dqvn/rss',       icon:'📰', nl:'Nieuws',         nameEn:'News',              en:'Lees echt Nederlands nieuws',           descEn:'Read real Dutch news',                color:'#0891b2', badge:'Nieuw',  group:'📖 Leesvaardigheid'   },

  /* ── Luistervaardigheid: understand spoken Dutch ─────────────────── */
  { href:'/dqvn/klanken',   icon:'🎵', nl:'Klanken',        nameEn:'Sounds',            en:'Uitspraak & Nederlandse klanken',       descEn:'Pronunciation & Dutch sounds',        color:'#7c3aed', badge:'Actief', group:'🎧 Luistervaardigheid' },
  { href:'/dqvn/podcast',   icon:'🎧', nl:'Podcast',        nameEn:'Podcast',           en:'Met het Oog op Morgen – NPO Radio 1',   descEn:'Met het Oog op Morgen – NPO Radio 1', color:'#9b5de5', badge:'Nieuw',  group:'🎧 Luistervaardigheid' },

  /* ── Schrijfvaardigheid: write correct Dutch sentences ───────────── */
  { href:'/dqvn/sentence',  icon:'✏️', nl:'Zinnen Bouwen',  nameEn:'Build Sentences',   en:'Schrijf & bouw Nederlandse zinnen',     descEn:'Write & build Dutch sentences',       color:'#06d6a0', badge:'Nieuw',  group:'✍️ Schrijfvaardigheid' },

  /* ── Spreekvaardigheid: speak & have conversations in Dutch ─────── */
  { href:'/dqvn/dialogues', icon:'💬', nl:'Dialogen',       nameEn:'Dialogues',         en:'Gespreksoefening met rolverdeling',     descEn:'Conversation practice with roles',    color:'#0891b2',                 group:'🗣️ Spreekvaardigheid' },
  { href:'/dqvn/wheel',     icon:'🎡', nl:'Draairad',       nameEn:'Spin Wheel',        en:'Willekeurige spreekvragen',             descEn:'Random speaking questions',           color:'#9b5de5', badge:'Nieuw',  group:'🗣️ Spreekvaardigheid' },
];

/* ─── Helpers ─────────────────────────────────────────────────── */
function readJSON(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; }
  catch { return fallback; }
}

/* i18n: picks Dutch or English string based on UI language.
   window._i18nLang is set synchronously by i18n.js before any JS runs,
   so _pt() is safe to call at boot time even before the locale JSON loads. */
const _pt = (nl, en) => window._i18nLang === 'en' ? en : nl;

/* Tool-group label translations (Dutch → English) */
const _groupEn = {
  '🏗️ Taalkennis':         '🏗️ Language Skills',
  '📖 Leesvaardigheid':    '📖 Reading Skills',
  '🎧 Luistervaardigheid': '🎧 Listening Skills',
  '✍️ Schrijfvaardigheid': '✍️ Writing Skills',
  '🗣️ Spreekvaardigheid':  '🗣️ Speaking Skills',
};

const _LEVEL_NAMES_EN = {
  A1: 'Dutch Beginners',
  A2: 'Basic Communication',
};

const _UNIT_TITLES_EN = {
  'A1-U1': 'Pronunciation & Phonics',
  'A1-U2': 'First Words',
  'A1-U3': 'Greetings & Conversation',
  'A1-U4': 'Numbers & Time',
  'A1-U5': 'Family & Home',
  'A1-U6': 'Food & Shopping',
  'A1-U7': 'Transport & City',
  'A1-U8': 'A1 Completion',
  'A2-U1': 'Verbs & Expansion',
  'A2-U2': 'Thematic Vocabulary 1',
  'A2-U3': 'Health & Daily Life',
  'A2-U4': 'Living in the Netherlands',
  'A2-U5': 'Communication & Media',
  'A2-U6': 'Extended Vocabulary',
  'A2-U7': 'A2 Exam Preparation',
};

const _TODAY_TOOL_NAME_EN = {
  vanstart:  'VanStart',
  klanken:   'Sounds',
  vocab:     'Vocabulary',
  sentence:  'Build Sentences',
  verbs:     'Verbs',
  dialogues: 'Dialogues',
};

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
  const time = h < 6  ? _pt('Goedenacht',   'Good night')
             : h < 12 ? _pt('Goedemorgen',  'Good morning')
             : h < 18 ? _pt('Goedemiddag',  'Good afternoon')
             :           _pt('Goedenavond',  'Good evening');
  const user  = readJSON('fc_sync_user', null);
  const first = user?.name?.split(/[\s,]+/)?.[0] || '';
  const greet = first ? `${time}, ${first}! 👋` : `${time}! 👋`;
  document.getElementById('portal-greeting').textContent = greet;
  if (first) {
    document.getElementById('portal-sub').textContent = _pt(
      `Welkom terug, ${first}. Ga verder waar je gebleven bent.`,
      `Welcome back, ${first}. Continue where you left off.`
    );
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

  /* Game — total unique words seen across all chapters */
  const gameData  = readJSON('nl_game_progress_v1', {});
  const gameWords = Object.values(gameData).reduce((sum, arr) => sum + (Array.isArray(arr) ? arr.length : 0), 0);

  /* Numbers — levels with at least one star */
  const numData   = readJSON('nl_num_progress', {});
  const numLevels = Object.values(numData).filter(lp => lp && Math.max(lp.listen || 0, lp.quiz || 0) >= 1).length;

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
    gameWords, numLevels,
  };
}

/* ─── Render stats strip ─────────────────────────────────────── */
function renderStats(s) {
  document.getElementById('sv-streak').textContent  = s.streak;
  document.getElementById('sv-cards').textContent   = s.cardsSeen;
  document.getElementById('sv-klanken').textContent = s.klankenDone;
  document.getElementById('sv-verbs').textContent   = s.verbsLearned;
  document.getElementById('sv-sent').textContent    = s.sentXP;
  document.getElementById('sv-vs').textContent      = s.vsPct + '%';
  document.getElementById('sv-game').textContent    = s.gameWords;
  document.getElementById('sv-num').textContent     = s.numLevels;
}

/* ─── Render progress cards ──────────────────────────────────── */
function renderProgress(s) {
  const vocabPct   = s.cardsSeen    > 0 ? Math.min(100, Math.round(s.cardsMastered  / Math.max(s.cardsSeen,    1) * 100)) : 0;
  const klankenPct = Math.min(100, Math.round(s.klankenDone  / s.KLANKEN_TOTAL  * 100));
  const verbsPct   = Math.min(100, Math.round(s.verbsLearned / s.VERBS_TOTAL    * 100));
  const dlgPct     = Math.min(100, Math.round(s.dlgDone      / s.DLG_TOTAL      * 100));

  const _streak = (n) => _pt(` &nbsp;·&nbsp; 🔥 ${n} dagen`, ` &nbsp;·&nbsp; 🔥 ${n} days`);
  const _notStarted = (nl, en) => _pt(nl, en);

  const cards = [
    {
      href: '/dqvn/startnl', icon: '📖', color: '#2563eb',
      nl: _pt('Vocabulaire', 'Vocabulary'),
      pct: vocabPct,
      detail: s.cardsSeen > 0
        ? _pt(`${s.cardsMastered} beheerst &nbsp;·&nbsp; ${s.cardsSeen} gezien`,
              `${s.cardsMastered} mastered &nbsp;·&nbsp; ${s.cardsSeen} seen`)
        : _notStarted('Nog niet begonnen — start de flashcards!',
                      'Not started yet — start the flashcards!'),
    },
    {
      href: '/dqvn/klanken', icon: '🎵', color: '#7c3aed',
      nl: _pt('Klanken', 'Sounds'),
      pct: klankenPct,
      detail: s.klankenDone > 0
        ? _pt(`${s.klankenDone} van ~${s.KLANKEN_TOTAL} klanken geoefend`,
              `${s.klankenDone} of ~${s.KLANKEN_TOTAL} sounds practiced`)
        : _notStarted('Nog niet begonnen — leer de uitspraak!',
                      'Not started yet — learn pronunciation!'),
    },
    {
      href: '/dqvn/vanstart', icon: '🚀', color: '#059669',
      nl: 'VanStart',
      pct: s.vsPct,
      detail: s.vsLastLesson
        ? _pt(`Les ${s.vsIdx + 1}/${_VS_TOTAL} · ${_vsLabel(s.vsLastLesson)}${s.vsStreak > 1 ? _streak(s.vsStreak) : ''}`,
              `Lesson ${s.vsIdx + 1}/${_VS_TOTAL} · ${_vsLabel(s.vsLastLesson)}${s.vsStreak > 1 ? _streak(s.vsStreak) : ''}`)
        : _notStarted('Nog niet begonnen — start de NT2 cursus!',
                      'Not started yet — start the NT2 course!'),
    },
    {
      href: '/dqvn/sentence', icon: '✏️', color: '#06d6a0',
      nl: _pt('Zinnen Bouwen', 'Build Sentences'),
      pct: Math.min(100, Math.round((s.sentToday || 0) / (s.SENT_GOAL || 5) * 100)),
      detail: (s.sentToday || 0) > 0
        ? _pt(`${s.sentToday}/5 vandaag${s.sentToday >= s.SENT_GOAL ? ' 🎉' : ' 🔔'}${s.sentStreak > 0 ? _streak(s.sentStreak) : ''} &nbsp;·&nbsp; ⭐ ${s.sentXP} XP`,
              `${s.sentToday}/5 today${s.sentToday >= s.SENT_GOAL ? ' 🎉' : ' 🔔'}${s.sentStreak > 0 ? _streak(s.sentStreak) : ''} &nbsp;·&nbsp; ⭐ ${s.sentXP} XP`)
        : _notStarted(
            `Nog niet begonnen — schrijf 5 zinnen per dag!${s.sentXP > 0 ? ` &nbsp;·&nbsp; ⭐ ${s.sentXP} XP totaal` : ''}`,
            `Not started yet — write 5 sentences per day!${s.sentXP > 0 ? ` &nbsp;·&nbsp; ⭐ ${s.sentXP} XP total` : ''}`
          ),
    },
    {
      href: '/dqvn/verbs', icon: '🔄', color: '#dc2626',
      nl: _pt('Werkwoorden', 'Verbs'),
      pct: verbsPct,
      detail: s.verbsLearned > 0
        ? _pt(`${s.verbsLearned} werkwoorden geleerd`, `${s.verbsLearned} verbs learned`)
        : _notStarted('Nog niet begonnen — oefen werkwoorden!',
                      'Not started yet — practice verbs!'),
    },
    {
      href: '/dqvn/dialogues', icon: '💬', color: '#0891b2',
      nl: _pt('Dialogen', 'Dialogues'),
      pct: dlgPct,
      detail: s.dlgDone > 0
        ? _pt(`${s.dlgDone} dialogen geoefend${s.dlgStreak > 1 ? ' &nbsp;·&nbsp; 🔥 ' + s.dlgStreak + ' dagen' : ''}`,
              `${s.dlgDone} dialogues practiced${s.dlgStreak > 1 ? ' &nbsp;·&nbsp; 🔥 ' + s.dlgStreak + ' days' : ''}`)
        : _notStarted('Nog niet begonnen — oefen gesprekken!',
                      'Not started yet — practice conversations!'),
    },
    {
      href: '/dqvn/stories2', icon: '📖', color: '#8b5cf6',
      nl: _pt('Verhalen', 'Stories'),
      pct: Math.min(100, Math.round((s.s2quizDone || 0) / (s.S2_TOTAL || 10) * 100)),
      detail: (s.s2quizDone || 0) > 0
        ? _pt(`${s.s2quizDone} van ${s.S2_TOTAL} quizzen voltooid`,
              `${s.s2quizDone} of ${s.S2_TOTAL} quizzes completed`)
        : _notStarted('Nog niet begonnen — lees korte verhalen!',
                      'Not started yet — read short stories!'),
    },
    {
      href: '/dqvn/rss', icon: '📰', color: '#0891b2',
      nl: _pt('Nieuws', 'News'),
      pct: Math.min(100, Math.round((s.rssRead || 0) / (s.RSS_TARGET || 30) * 100)),
      detail: (s.rssRead || 0) > 0
        ? _pt(`${s.rssRead} artikelen gelezen${s.rssRead >= s.RSS_TARGET ? ' — doel bereikt! 🎉' : ` van ${s.RSS_TARGET}`}`,
              `${s.rssRead} articles read${s.rssRead >= s.RSS_TARGET ? ' — goal reached! 🎉' : ` of ${s.RSS_TARGET}`}`)
        : _notStarted('Nog niet begonnen — lees echt nieuws!',
                      'Not started yet — read real news!'),
    },
    {
      href: '/dqvn/podcast', icon: '🎧', color: '#9b5de5',
      nl: 'Podcast',
      pct: Math.min(100, Math.round((s.podListened || 0) / (s.PODCAST_TARGET || 20) * 100)),
      detail: (s.podListened || 0) > 0
        ? _pt(`${s.podListened} afleveringen beluisterd${s.podListened >= s.PODCAST_TARGET ? ' — doel bereikt! 🎉' : ` van ${s.PODCAST_TARGET}`}`,
              `${s.podListened} episodes listened${s.podListened >= s.PODCAST_TARGET ? ' — goal reached! 🎉' : ` of ${s.PODCAST_TARGET}`}`)
        : _notStarted('Nog niet begonnen — luister naar podcasts!',
                      'Not started yet — listen to podcasts!'),
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
  if (badge) badge.textContent = _pt(
    `${numTools} tools · ${numCats} categorieën`,
    `${numTools} tools · ${numCats} categories`
  );

  const badgeActive = _pt('Actief', 'Active');
  const badgeNew    = _pt('Nieuw',  'New');

  const cardHtml = t => `
    <a class="tool-card" href="${t.href}" style="--tc:${t.color}">
      <div class="tc-icon">${t.icon}</div>
      <div class="tc-name">${_pt(t.nl, t.nameEn || t.nl)}</div>
      <div class="tc-desc">${_pt(t.en, t.descEn || t.en)}</div>
      ${t.badge === 'Actief' ? `<div class="tc-pill tc-pill-active">${badgeActive}</div>` : ''}
      ${t.badge === 'Nieuw'  ? `<div class="tc-pill tc-pill-new">${badgeNew}</div>`    : ''}
    </a>`;

  document.getElementById('tools-container').innerHTML =
    Object.entries(groups).map(([grp, tools]) => `
      <div class="tools-group">
        <div class="tools-group-lbl">${_pt(grp, _groupEn[grp] || grp)}</div>
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

/* ─── Learning Path (Leerpad) ────────────────────────────────── */
const PLAN_PROGRESS_KEY = 'nl_learning_progress_v1';
let _planCache = null; // in-memory cache for plan JSON

async function _fetchPlan() {
  if (_planCache) return _planCache;
  try {
    const r = await fetch('/dqvn/data/plan/nl_plan_v1.json');
    if (!r.ok) throw new Error('plan fetch failed');
    _planCache = await r.json();
    return _planCache;
  } catch { return null; }
}

function _readPlanProgress() {
  try { return JSON.parse(localStorage.getItem(PLAN_PROGRESS_KEY) || '{}'); }
  catch { return {}; }
}

function _savePlanProgress(prog) {
  try { localStorage.setItem(PLAN_PROGRESS_KEY, JSON.stringify(prog)); } catch {}
}

/* Check if a plan task is mastered based on its mastery_check type */
function _isTaskMastered(task, prog) {
  const today = new Date().toISOString().slice(0, 10);
  const fc    = (prog.tool_scores?.flashcard) || {};
  const srs   = readJSON('nl_srs_v3', {});
  const now   = Date.now();

  switch (task.mastery_check) {

    case 'flashcard_80pct': {
      const chId  = task.target?.lesson_id;
      /* Prefer the dedicated mastery score written by flashcard.js */
      if (fc[chId]?.is_mastered) return true;
      /* Fall back: count non-new cards from raw SRS data */
      const ch    = srs[chId] || {};
      const words = Object.values(ch).filter(s => s && typeof s === 'object' && s.state);
      const seen  = words.filter(s => s.state !== 'new').length;
      return words.length > 0 && seen / words.length >= 0.80;
    }

    case 'verb_quiz_80': {
      const verbsStore = readJSON('nl_verbs_v3', {});
      const lesId  = task.target?.lesson_id;
      const ld     = verbsStore?.lessons?.[lesId];
      if (!ld?.totalAnswered) return false;
      return ld.totalCorrect / ld.totalAnswered >= 0.80;
    }

    case 'stars_2plus': {
      const numProg = readJSON('nl_num_progress', {});
      const lvlId   = task.target?.level_id;
      const lp      = numProg[lvlId];
      if (!lp) return false;
      return Math.max(lp.listen || 0, lp.quiz || 0) >= 2;
    }

    case 'count_done': {
      const tool  = task.tool;
      const count = task.target?.count || 0;
      if (tool === 'klanken') {
        const kd = readJSON('klanken-v1', {});
        return Object.values(kd).filter(Boolean).length >= count;
      }
      if (tool === 'sentence') {
        const sd = readJSON('nl_sentence_v1', {});
        return (sd.streak || 0) >= (task.target?.days || count);
      }
      if (tool === 'nieuws') {
        const rd = readJSON('nl_rss_v1', { total: 0 });
        return (rd.total || rd.read?.length || 0) >= count;
      }
      if (tool === 'podcast') {
        const pd = readJSON('nl_podcast_v1', { total: 0 });
        return (pd.total || pd.listened?.length || 0) >= count;
      }
      if (tool === 'draairad') {
        const pkgId = task.target?.pkg_id;
        const hist  = readJSON('nl_wheel_hist', []);
        return hist.filter(h => !pkgId || h.pkg === pkgId).length >= count;
      }
      return false;
    }

    case 'streak_days': {
      const sd = readJSON('nl_sentence_v1', {});
      return (sd.streak || 0) >= (task.target?.days || 1);
    }

    case 'story_quiz_80': {
      const s2 = readJSON('nl_s2_quiz_v1', {});
      const done = Object.values(s2).filter(q => q?.completed).length;
      return done >= (task.target?.count || 1);
    }

    case 'practiced_once': {
      const tool = task.tool;
      if (tool === 'dialogues') {
        const dlgId = task.target?.dialogue_id;
        const dlg   = readJSON('nl_dlg_v1', {});
        return (dlg.stats?.[dlgId]?.count || 0) >= 1;
      }
      if (tool === 'kids') {
        const last = localStorage.getItem('kids_last_lesson') || '';
        return last.includes(task.target?.lesson_id || 'l01');
      }
      if (tool === 'stories') {
        const s = readJSON('nl_s2_quiz_v1', {});
        return Object.keys(s).length > 0;
      }
      return false;
    }

    default: return false;
  }
}

/* Find the active unit: first unit whose required tasks are NOT all mastered */
function _findActiveUnit(plan, prog) {
  for (const level of (plan.levels || [])) {
    for (const unit of (level.units || [])) {
      const required = unit.tasks.filter(t => t.required);
      const allDone  = required.length > 0 && required.every(t => _isTaskMastered(t, prog));
      if (!allDone) return { level, unit };
    }
  }
  return null; // all done
}

const LEVEL_COLORS = { A1: '#059669', A2: '#7c3aed' };
const TOOL_ICONS   = {
  vanstart: '🚀', vocab: '📖', klanken: '🎵', getallen: '🔢',
  verbs: '🔄', sentence: '✏️', dialogues: '💬', draairad: '🎡',
  kids: '🧒', stories: '📕', stories2: '📖', nieuws: '📰',
  podcast: '🎧', grammar: '📚',
};

async function renderLearningPath() {
  const user = readJSON('fc_sync_user', null);
  const wrap = document.getElementById('leerpad-wrap');
  if (!wrap) return;
  if (!user) { wrap.hidden = true; return; }
  wrap.hidden = false;

  const content = document.getElementById('leerpad-content');
  const badge   = document.getElementById('leerpad-badge');

  content.innerHTML = `<div style="color:var(--text-3);font-size:.8rem;padding:12px 0">${_pt('Leerpad laden…', 'Loading learning path…')}</div>`;

  const plan = await _fetchPlan();
  if (!plan) {
    content.innerHTML = `<div style="color:var(--text-3);font-size:.8rem;padding:12px 0">${_pt('Leerpad niet beschikbaar.', 'Learning path unavailable.')}</div>`;
    return;
  }

  const prog   = _readPlanProgress();
  const active = _findActiveUnit(plan, prog);

  if (!active) {
    content.innerHTML = `
      <div class="lp-reward-banner">
        <div class="lp-reward-badge">🏆</div>
        <div>
          <div class="lp-reward-title">${_pt('A2 Voltooid!', 'A2 Completed!')}</div>
          <div class="lp-reward-msg">${_pt('Je hebt het volledige leerpad afgerond. Proficiat!', "You've completed the full learning path. Congratulations!")}</div>
        </div>
      </div>`;
    if (badge) badge.textContent = _pt('Voltooid', 'Completed');
    return;
  }

  const { level, unit } = active;
  const color     = LEVEL_COLORS[level.id] || '#ea580c';
  const required  = unit.tasks.filter(t => t.required);
  const optional  = unit.tasks.filter(t => !t.required);
  const doneCount = required.filter(t => _isTaskMastered(t, prog)).length;
  const pct       = required.length ? Math.round(doneCount / required.length * 100) : 0;

  const unitTitleT = _pt(unit.title, _UNIT_TITLES_EN[unit.id] || unit.title);
  const levelNameT = _pt(level.name, _LEVEL_NAMES_EN[level.id] || level.name);
  if (badge) badge.textContent = `${level.cefr} · ${unitTitleT}`;

  const levelCls = `lp-${level.id.toLowerCase()}`;

  const taskRow = (task) => {
    const done   = _isTaskMastered(task, prog);
    const icon   = TOOL_ICONS[task.tool] || '📌';
    const status = done ? '✅' : (task.required ? '⬜' : '○');
    const cls    = done ? 'lp-done' : (task.required ? 'lp-active' : '');
    return `
      <a class="lp-task ${cls}" href="${task.deeplink || '#'}">
        <span class="lp-task-icon">${icon}</span>
        <span class="lp-task-body">
          <span class="lp-task-title">${task.title}</span>
          <span class="lp-task-hint">${task.mastery_hint || task.description || ''}</span>
        </span>
        <span class="lp-task-status">${status}</span>
      </a>`;
  };

  const optHtml = optional.length ? `
    <details class="lp-optional-toggle">
      <summary>${_pt(
        `+ ${optional.length} optionele taak${optional.length !== 1 ? 'en' : ''}`,
        `+ ${optional.length} optional task${optional.length !== 1 ? 's' : ''}`
      )}</summary>
      ${optional.map(taskRow).join('')}
    </details>` : '';

  /* ── Today's tasks — filtered to current unit's tools only ── */
  // Only show tasks whose tool appears in the current leerpad unit (nl_plan_v1).
  // Vocab-SRS, verbs, sentence-builder etc. from other units are intentionally excluded.
  const unitTools   = new Set(unit.tasks.map(t => t.tool));
  const todayTasks  = computeTodayTasks().filter(t => unitTools.has(t.id));
  const activeTasks = todayTasks.filter(t => !t.done);
  const urgLabel = {
    streak:       _pt('🔥 Reeks bewaren', '🔥 Keep streak'),
    due:          _pt('⏰ Kaarten klaar', '⏰ Cards ready'),
    inprog:       _pt('▶ Bezig',          '▶ In progress'),
    foundational: _pt('🏗 Basis',         '🏗 Foundation'),
    normal: null,
  };
  const urgCls = { streak:'today-urg-streak', due:'today-urg-due', inprog:'today-urg-inprog', foundational:'today-urg-found', normal: null };

  let todayHtml = '';
  if (todayTasks.length > 0) {
    if (activeTasks.length === 0) {
      const first = user.name?.split(/[\s,]+/)[0] || '';
      todayHtml = `
        <div class="today-done-card">
          <div class="today-done-ico">🎉</div>
          <div class="today-done-text">${_pt(
            `Goed bezig${first ? ', ' + first : ''}! Sessietaken voor vandaag klaar.`,
            `Well done${first ? ', ' + first : ''}! Today's session tasks are complete.`
          )}</div>
          <div class="today-done-sub">${_pt(
            'Je bent op schema — kom morgen terug voor de volgende stap.',
            "You're on track — come back tomorrow for the next step."
          )}</div>
        </div>`;
    } else {
      todayHtml = `<div class="today-grid">${activeTasks.map(t => {
        const urg     = urgLabel[t.urgency];
        const urgHtml = urg ? `<span class="today-urgency ${urgCls[t.urgency]}">${urg}</span>` : '';
        const miniBar = t.progress
          ? `<div class="today-mini-track"><div class="today-mini-fill" id="tmf-${t.id}" style="background:${t.color}"></div></div>`
          : '';
        return `
          <a class="today-card" href="${t.href}" style="--tc:${t.color}">
            <div class="today-icon-wrap" style="background:${t.color}18">${t.icon}</div>
            <div class="today-body">
              <div class="today-name">${_pt(t.nl, _TODAY_TOOL_NAME_EN[t.id] || t.nl)}</div>
              <div class="today-reason">${t.reason}</div>
              ${urgHtml}${miniBar}
            </div>
            <div class="today-arrow">›</div>
          </a>`;
      }).join('')}</div>`;
    }
  }

  content.innerHTML = todayHtml + `
    <div class="lp-level-chip ${levelCls}">${level.icon} ${levelNameT} — ${unitTitleT}</div>
    <div class="lp-unit-card" style="--lp-color:${color}">
      <div class="lp-unit-head">
        <div class="lp-unit-icon">${unit.icon}</div>
        <div class="lp-unit-meta">
          <div class="lp-unit-title">${unitTitleT}</div>
          <div class="lp-unit-sub">${_pt(`~${unit.estimated_days} dagen`, `~${unit.estimated_days} days`)} · ${unit.description}</div>
        </div>
        <span class="lp-unit-pct">${pct}%</span>
      </div>
      <div class="lp-track"><div class="lp-fill" id="lp-fill" style="width:0%;background:${color}"></div></div>
      ${required.map(taskRow).join('')}
      ${optHtml}
    </div>`;

  /* Animate progress bars after paint */
  requestAnimationFrame(() => requestAnimationFrame(() => {
    const fill = document.getElementById('lp-fill');
    if (fill) fill.style.width = pct + '%';
    activeTasks.forEach(t => {
      if (!t.progress) return;
      const el = document.getElementById('tmf-' + t.id);
      if (el) el.style.width = Math.round(t.progress.cur / t.progress.max * 100) + '%';
    });
  }));
}

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
        reason = _pt(`${_vsLabel(vsLastLesson) || 'VanStart'} geoefend vandaag`,
                     `${_vsLabel(vsLastLesson) || 'VanStart'} practiced today`);
      } else if (hasStarted) {
        if (vsStreak > 0) {
          score += 18;
          reason = _pt(`Bewaar je ${vsStreak}-daagse reeks!`, `Keep your ${vsStreak}-day streak!`);
          urgency = 'streak';
        } else if (vsGap >= 3) {
          score += 14;
          reason = _pt(`${vsGap} dagen niet geoefend · ${_vsLabel(vsLastLesson)}`,
                       `${vsGap} days not practiced · ${_vsLabel(vsLastLesson)}`);
        } else {
          reason = _pt(`Verder met ${_vsLabel(vsTarget)}`, `Continue with ${_vsLabel(vsTarget)}`);
        }
      } else {
        score = 80;
        reason = _pt('Start je NT2 cursus — de basis!', 'Start your NT2 course — the foundation!');
        urgency = 'foundational';
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
      ? _pt('Leer de Nederlandse klanken — basis van uitspraak!',
            'Learn Dutch sounds — the foundation of pronunciation!')
      : _pt(`${klankenDone} van ${KLANKEN_TOTAL} klanken geoefend`,
            `${klankenDone} of ${KLANKEN_TOTAL} sounds practiced`);
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

    let score = 22, reason = _pt('Oefen je woordenschat', 'Practice your vocabulary'), urgency = 'normal';
    if (cardsDue > 0) {
      score += 52;
      reason = _pt(
        `${cardsDue} kaart${cardsDue !== 1 ? 'en' : ''} wacht${cardsDue === 1 ? '' : 'en'} op herhaling`,
        `${cardsDue} card${cardsDue !== 1 ? 's' : ''} waiting for review`
      );
      urgency = 'due';
    }
    if (fcStreak > 0 && !fcReviewedToday) {
      score += 20;
      if (urgency === 'normal') {
        reason = _pt(`Bewaar je ${fcStreak}-daagse reeks!`, `Keep your ${fcStreak}-day streak!`);
        urgency = 'streak';
      }
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
    let score = 18,
        reason  = _pt('Schrijf 5 Nederlandse zinnen vandaag', 'Write 5 Dutch sentences today'),
        urgency = 'normal', progress = null;
    if (sentCount > 0 && !sentGoalDone) {
      score += 38;
      reason = _pt(`${sentCount}/${SENT_GOAL} zinnen vandaag — ga verder!`,
                   `${sentCount}/${SENT_GOAL} sentences today — keep going!`);
      urgency = 'inprog';
      progress = { cur: sentCount, max: SENT_GOAL };
    } else if (!sentGoalDone) {
      score += 22;
      if (sentStreak > 0) {
        score += 15;
        reason = _pt(`Bewaar je ${sentStreak}-daagse schrijfreeks!`,
                     `Keep your ${sentStreak}-day writing streak!`);
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

    let score = 14, reason = _pt('Oefen werkwoordvervoeging', 'Practice verb conjugation'), urgency = 'normal';
    if (!verbsStudiedToday) {
      score += 18;
      if (verbsStreak > 0) {
        score += 18;
        reason = _pt(`Bewaar je ${verbsStreak}-daagse reeks!`, `Keep your ${verbsStreak}-day streak!`);
        urgency = 'streak';
      }
      if (verbsGap >= 3 && urgency === 'normal') {
        score += 15;
        reason = _pt(`${verbsGap} dagen niet geoefend`, `${verbsGap} days not practiced`);
      }
      if (!verbsLastStudy) {
        score += 8;
        reason = _pt('Probeer werkwoorden — essentieel voor NT2!', 'Try verbs — essential for NT2!');
      }
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
    let score = 13, reason = _pt('Oefen een gesprek in het Nederlands', 'Practice a conversation in Dutch'), urgency = 'normal';
    if (!dlgPracticedToday) {
      score += 16;
      if (dlgStreak > 0) {
        score += 18;
        reason = _pt(`Bewaar je ${dlgStreak}-daagse gespreksreeks!`, `Keep your ${dlgStreak}-day conversation streak!`);
        urgency = 'streak';
      }
      if (dlgGap >= 3 && urgency === 'normal') {
        score += 12;
        reason = _pt(`${dlgGap} dagen niet geoefend`, `${dlgGap} days not practiced`);
      }
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
  renderTools();
  renderLearningPath();
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
    btn.textContent = _pt(`✓ Aangemeld als ${first}`, `✓ Signed in as ${first}`);
    btn.className = 'plan-cta plan-cta-done';
  } else {
    btn.textContent = _pt('Meld je gratis aan →', 'Sign up for free →');
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

/* Called by sync.js when login state changes — refresh leerpad + plan CTA */
function onSyncUserChange() { renderLearningPath(); updatePlanCTA(); }

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

/* ─── TTS English toggle ─────────────────────────────────────── */
function initTTSEnToggle() {
  const cb  = document.getElementById('tts-en-toggle');
  const lbl = document.getElementById('tts-en-val');
  if (!cb) return;

  let enabled = false;
  try {
    const s = JSON.parse(localStorage.getItem('nl_tts_en') || 'null');
    if (s?.v === true) enabled = true;
  } catch {}

  cb.checked = enabled;
  if (lbl) lbl.textContent = enabled ? 'On' : 'Off';

  cb.addEventListener('change', () => {
    const on = cb.checked;
    if (lbl) lbl.textContent = on ? 'On' : 'Off';
    try { localStorage.setItem('nl_tts_en', JSON.stringify({ v: on, t: Date.now() })); } catch {}
    if (typeof syncNow === 'function') syncNow(true);
  });
}

/* ─── Progress info panel toggle ────────────────────────────── */
function toggleProgInfo() {
  const panel = document.getElementById('prog-info');
  const btn   = document.getElementById('prog-info-btn');
  const open  = panel.classList.toggle('hidden');
  btn.style.opacity = open ? '' : '1';
}

/* ─── Boot ───────────────────────────────────────────────────── */
renderDashboard();
initVolume();
initSpeed();
initTheme();
initTTSEnToggle();
initReveal();

/* ─── Feedback System ────────────────────────────────────────── */
(function () {
  'use strict';

  /* ── Config ── */
  const _W     = typeof SYNC_WORKER_URL !== 'undefined'
                 ? SYNC_WORKER_URL
                 : 'https://nl-sync.itho.workers.dev';
  const _isOwner = () => { try { return JSON.parse(localStorage.getItem('fc_sync_user') || 'null')?.isAdmin === true; } catch { return false; } };
  const _RL_MS = 5 * 60 * 1000;
  const _PER   = 10;

  /* ── State ── */
  let _fbType   = 'general';
  let _allItems = [];
  let _filter   = '';
  let _page     = 1;

  /* ── Helpers ── */
  function _$ (id) { return document.getElementById(id); }
  function _env() {
    const user = readJSON('fc_sync_user', null);
    const prog = readJSON('nl_learning_progress_v1', {});
    const meta = readJSON('nl_srs_meta_v3', {});
    return {
      url:          location.pathname,
      browser:      (navigator.userAgent || '').slice(0, 80),
      screen:       `${screen.width}×${screen.height}`,
      lang:         navigator.language || '',
      logged_in:    !!user,
      active_level: prog.active_level || null,
      active_unit:  prog.active_unit  || null,
      streak:       meta.streak || 0,
    };
  }

  function _relTime(ts) {
    const s = (Date.now() - ts) / 1000;
    if (s < 60)    return 'zonet';
    if (s < 3600)  return `${Math.floor(s / 60)} min geleden`;
    if (s < 86400) return `${Math.floor(s / 3600)} uur geleden`;
    if (s < 172800) return 'gisteren';
    if (s < 604800) return `${Math.floor(s / 86400)} dagen geleden`;
    return new Date(ts).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' });
  }

  function _confetti() {
    const anchor = _$('fb-confetti-anchor');
    if (!anchor) return;
    const colors = ['#AE1C28', '#ffffff', '#21468B'];
    for (let i = 0; i < 24; i++) {
      const p = document.createElement('span');
      p.className = 'fb-cp';
      p.style.cssText = [
        `left:${20 + Math.random() * 60}%`,
        `background:${colors[i % 3]}`,
        `animation-delay:${(Math.random() * 0.4).toFixed(2)}s`,
        `animation-duration:${(0.7 + Math.random() * 0.5).toFixed(2)}s`,
        `width:${6 + Math.random() * 6}px`,
        `height:${6 + Math.random() * 6}px`,
        `border-radius:${Math.random() > 0.5 ? '50%' : '2px'}`,
      ].join(';');
      anchor.appendChild(p);
      setTimeout(() => p.remove(), 1400);
    }
  }

  /* ── Feedback Modal ── */
  function openModal() {
    _$('fb-overlay').removeAttribute('aria-hidden');
    _$('fb-overlay').classList.add('fb-overlay--open');
    _$('fb-success').hidden = true;
    _$('fb-text').value = '';
    _$('fb-chars').textContent = '0 / 500';
    _$('fb-submit').disabled = false;
    _$('fb-submit').textContent = 'Verstuur →';
    setTimeout(() => _$('fb-text')?.focus(), 120);
  }

  function closeModal() {
    _$('fb-overlay').setAttribute('aria-hidden', 'true');
    _$('fb-overlay').classList.remove('fb-overlay--open');
  }

  async function submitFeedback() {
    const msg = (_$('fb-text')?.value || '').trim();
    if (!msg) { _$('fb-text')?.focus(); return; }

    const last = parseInt(localStorage.getItem('nl_feedback_last') || '0');
    if (Date.now() - last < _RL_MS) {
      alert('Wacht even — je kunt eenmaal per 5 minuten feedback sturen.');
      return;
    }

    const btn = _$('fb-submit');
    btn.disabled = true;
    btn.textContent = '⏳';

    try {
      const r = await fetch(`${_W}/feedback`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ type: _fbType, message: msg, env: _env() }),
      });
      if (!r.ok) throw new Error((await r.json()).error || `HTTP ${r.status}`);

      localStorage.setItem('nl_feedback_last', String(Date.now()));

      _$('fb-text').closest('.fb-textarea') && (_$('fb-text').style.display = 'none');
      _$('fb-foot')?.style && (_$('fb-foot').style.display = 'none');
      _$('fb-types').style.display = 'none';

      const user  = readJSON('fc_sync_user', null);
      const first = user?.name?.split(/[\s,]+/)[0] || '';
      _$('fb-success-msg').textContent = first
        ? `🎉 Dankjewel, ${first}! Je feedback is verstuurd.`
        : '🎉 Dankjewel voor je feedback!';
      _$('fb-success').hidden = false;
      _confetti();
      setTimeout(closeModal, 3200);
    } catch (e) {
      btn.disabled = false;
      btn.textContent = 'Verstuur →';
      alert('Kon feedback niet versturen: ' + e.message);
    } finally {
      setTimeout(() => {
        if (_$('fb-text')) _$('fb-text').style.display = '';
        if (_$('fb-foot')) _$('fb-foot').style.display = '';
        if (_$('fb-types')) _$('fb-types').style.display = '';
      }, 3500);
    }
  }

  /* ── Owner badge + notification ── */
  async function checkOwnerBadge() {
    if (!_isOwner()) return;
    const token = localStorage.getItem('fc_sync_token');
    if (!token) return;

    try {
      const r = await fetch(`${_W}/feedback/badge`, { headers: { Authorization: `Bearer ${token}` } });
      if (!r.ok) return;
      const { unseen } = await r.json();
      if (unseen <= 0) return;

      const badge = _$('fb-badge');
      if (badge) { badge.textContent = unseen; badge.hidden = false; }

      const toast = document.createElement('div');
      toast.className = 'fb-notif';
      toast.innerHTML = `
        <span class="fb-notif-ico">📬</span>
        <div class="fb-notif-body">
          <strong>${unseen} nieuwe feedback${unseen > 1 ? 'berichten' : 'bericht'}</strong>
          <span>Klik om de inbox te bekijken</span>
        </div>
        <button class="fb-notif-close" aria-label="Sluiten">×</button>`;
      document.body.appendChild(toast);

      toast.addEventListener('click', e => {
        if (!e.target.closest('.fb-notif-close')) openAdmin();
        toast.remove();
      });
      toast.querySelector('.fb-notif-close').addEventListener('click', e => {
        e.stopPropagation(); toast.remove();
      });
      setTimeout(() => toast?.isConnected && toast.remove(), 10000);
    } catch { /* fail silently */ }
  }

  /* ── Admin Panel ── */
  function openAdmin() {
    _$('fb-admin').removeAttribute('aria-hidden');
    _$('fb-admin').classList.add('fb-admin--open');
    if (_allItems.length === 0) loadAdmin();
  }
  window._openFeedbackAdmin = openAdmin;

  function closeAdmin() {
    _$('fb-admin').setAttribute('aria-hidden', 'true');
    _$('fb-admin').classList.remove('fb-admin--open');
  }

  async function loadAdmin() {
    const token = localStorage.getItem('fc_sync_token');
    if (!token) { _$('fba-list').innerHTML = '<p class="fba-empty">Niet aangemeld als eigenaar.</p>'; return; }

    _$('fba-list').innerHTML = '<p class="fba-empty">Laden…</p>';
    try {
      const r = await fetch(`${_W}/feedback`, { headers: { Authorization: `Bearer ${token}` } });
      if (r.status === 403) { _$('fba-list').innerHTML = '<p class="fba-empty">Geen toegang.</p>'; return; }
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const { items } = await r.json();
      _allItems = items || [];
      const badge = _$('fb-badge');
      if (badge) badge.hidden = true;
      renderAdmin();
    } catch (e) {
      _$('fba-list').innerHTML = `<p class="fba-empty">Fout: ${e.message}</p>`;
    }
  }

  function _filtered() {
    return _filter ? _allItems.filter(i => i.type === _filter) : _allItems;
  }

  function renderAdmin() {
    const items    = _filtered();
    const total    = _allItems.length;
    const todayPfx = new Date().toISOString().slice(0, 10);
    const todayN   = _allItems.filter(i => (i.date || '').startsWith(todayPfx)).length;
    const counts   = { bug: 0, idea: 0, general: 0 };
    _allItems.forEach(i => { if (counts[i.type] !== undefined) counts[i.type]++; });

    _$('fba-stats').innerHTML = [
      `<span class="fba-st">Totaal <b>${total}</b></span>`,
      `<span class="fba-st">Vandaag <b>${todayN}</b></span>`,
      `<span class="fba-st fba-bug">🐛 ${counts.bug}</span>`,
      `<span class="fba-st fba-idea">💡 ${counts.idea}</span>`,
      `<span class="fba-st fba-gen">💬 ${counts.general}</span>`,
    ].join('');

    const start = (_page - 1) * _PER;
    const page  = items.slice(start, start + _PER);

    if (!page.length) {
      _$('fba-list').innerHTML = '<p class="fba-empty">Geen feedback gevonden.</p>';
      _$('fba-pager').innerHTML = '';
      return;
    }

    _$('fba-list').innerHTML = page.map(item => {
      const typeIcon  = item.type === 'bug' ? '🐛' : item.type === 'idea' ? '💡' : '💬';
      const typeClass = `fba-card fba-${item.type}`;
      const chips = [
        item.env?.browser  ? `<span class="fba-chip">${item.env.browser.split('/')[0]}</span>` : '',
        item.env?.screen   ? `<span class="fba-chip">${item.env.screen}</span>` : '',
        item.env?.logged_in? `<span class="fba-chip">🔑</span>` : '',
        item.env?.active_level ? `<span class="fba-chip">📚 ${item.env.active_level}</span>` : '',
        item.env?.streak   ? `<span class="fba-chip">🔥 ${item.env.streak}</span>` : '',
      ].filter(Boolean).join('');
      return `
        <div class="${typeClass}">
          <div class="fba-card-hd">
            <span>${typeIcon} <b>${item.type}</b></span>
            <span class="fba-time">${_relTime(item.ts)}</span>
          </div>
          <p class="fba-msg">${item.message.replace(/</g, '&lt;')}</p>
          ${chips ? `<div class="fba-chips">${chips}</div>` : ''}
        </div>`;
    }).join('');

    const pages = Math.ceil(items.length / _PER);
    if (pages <= 1) { _$('fba-pager').innerHTML = ''; return; }
    _$('fba-pager').innerHTML = `
      <button class="fba-pg" id="fba-prev" ${_page <= 1 ? 'disabled' : ''}>←</button>
      <span>${_page} / ${pages}</span>
      <button class="fba-pg" id="fba-next" ${_page >= pages ? 'disabled' : ''}>→</button>`;
    _$('fba-prev')?.addEventListener('click', () => { _page--; renderAdmin(); });
    _$('fba-next')?.addEventListener('click', () => { _page++; renderAdmin(); });
  }

  /* ── First-visit callout ── */
  function initCallout() {
    const SEEN_KEY = 'nl_fb_callout_seen';
    if (localStorage.getItem(SEEN_KEY)) return;

    const callout = _$('fb-callout');
    if (!callout) return;

    let autoTimer;

    function dismissCallout() {
      clearTimeout(autoTimer);
      callout.classList.remove('fb-callout--in');
      callout.classList.add('fb-callout--out');
      setTimeout(() => { callout.hidden = true; }, 300);
      try { localStorage.setItem(SEEN_KEY, '1'); } catch {}
    }

    /* Show after 3 s */
    setTimeout(() => {
      callout.hidden = false;
      requestAnimationFrame(() => requestAnimationFrame(() => {
        callout.classList.add('fb-callout--in');
      }));
      autoTimer = setTimeout(dismissCallout, 7000);
    }, 3000);

    _$('fb-callout-close').addEventListener('click', dismissCallout);
    /* Also mark as seen when the user actually clicks the FAB */
    _$('fb-btn').addEventListener('click', dismissCallout, { once: true });
  }

  /* ── Boot ── */
  document.addEventListener('DOMContentLoaded', function () {
    _$('fb-btn').addEventListener('click', function () {
      if (_isOwner() && !_$('fb-badge').hidden) {
        openAdmin();
      } else {
        openModal();
      }
    });

    _$('fb-close').addEventListener('click', closeModal);
    _$('fb-overlay').addEventListener('click', e => { if (e.target === e.currentTarget) closeModal(); });
    _$('fb-admin-close').addEventListener('click', closeAdmin);

    _$('fb-types').addEventListener('click', e => {
      const btn = e.target.closest('.fb-type');
      if (!btn) return;
      _fbType = btn.dataset.type;
      _$('fb-types').querySelectorAll('.fb-type').forEach(b => b.classList.toggle('active', b === btn));
    });

    _$('fb-text').addEventListener('input', e => {
      _$('fb-chars').textContent = `${e.target.value.length} / 500`;
    });

    _$('fb-text').addEventListener('keydown', e => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) submitFeedback();
    });
    _$('fb-submit').addEventListener('click', submitFeedback);

    _$('fba-filters').addEventListener('click', e => {
      const btn = e.target.closest('.fba-f');
      if (!btn) return;
      _filter = btn.dataset.filter || '';
      _page   = 1;
      _$('fba-filters').querySelectorAll('.fba-f').forEach(b => b.classList.toggle('active', b === btn));
      renderAdmin();
    });

    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') { closeModal(); closeAdmin(); }
    });

    initCallout();
    setTimeout(checkOwnerBadge, 800);
  });

  /* Extend onSyncUserChange to also refresh the owner badge after login */
  const _origSCU = onSyncUserChange;
  window.onSyncUserChange = function () {
    _origSCU();
    setTimeout(checkOwnerBadge, 400);
  };

})();
