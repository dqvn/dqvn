/* Flashcard game — SM-2 spaced repetition for Dutch vocabulary */
(function () {
  'use strict';

  const FC_KEY       = 'nl_srs_v3';
  const FC_META_KEY  = 'nl_srs_meta_v3';
  const SESSION_SIZE = 20;
  const NEW_PER_DAY  = 10;
  const MIN_EASE     = 1.3;
  const MAX_EASE     = 4.0;
  const DEF_EASE     = 2.5;
  const DAY          = 86400000;

  /* ── State ──────────────────────────────────────────────────────────────── */
  const fc = {
    cards: [], index: 0, flipped: false,
    stats: { hard: 0, good: 0, easy: 0, total: 0 },
    chapterId: '', progress: {}, meta: {},
    sessionRequeues: {},
    ttsSeq: 0,
    touchStartX: 0, touchStartY: 0, isDragging: false,
  };

  /* ── Helpers ────────────────────────────────────────────────────────────── */
  function $id(id) { return document.getElementById(id); }

  function shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function getTodayDate() {
    return new Date().toISOString().slice(0, 10);
  }

  function blankState() {
    return { state: 'new', interval: 0, ease: DEF_EASE, nextDue: 0, lapses: 0, reps: 0, seen: 0, lastStudied: 0 };
  }

  function migrateState(raw) {
    if (!raw) return null;
    if (raw.state) return raw;
    // Old box format: { box, streak, seen, nextDue, lastStudied }
    const BOX_STATE    = ['new', 'learning', 'review', 'review'];
    const BOX_INTERVAL = [0, 1, 3, 7];
    return {
      state:       BOX_STATE[raw.box]    || 'new',
      interval:    BOX_INTERVAL[raw.box] || 0,
      ease:        DEF_EASE,
      nextDue:     raw.nextDue     || 0,
      lapses:      0,
      reps:        raw.streak      || 0,
      seen:        raw.seen        || 0,
      lastStudied: raw.lastStudied || 0,
    };
  }

  function badgeFor(st) {
    if (st.state === 'new')        return { label: 'New',      cls: 'fc-badge-new'    };
    if (st.state === 'learning')   return { label: 'Learning', cls: 'fc-badge-review' };
    if (st.state === 'relearning') return { label: 'Relearn',  cls: 'fc-badge-hard'   };
    if ((st.interval || 0) >= 21)  return { label: 'Mastered', cls: 'fc-badge-master' };
    return { label: 'Review', cls: 'fc-badge-review' };
  }

  /* ── Storage ────────────────────────────────────────────────────────────── */
  function loadProgress() {
    try {
      const v3 = localStorage.getItem(FC_KEY);
      if (v3) return JSON.parse(v3);
      // Migrate from v2
      const v2raw = localStorage.getItem('nl_flashcard_v2');
      if (v2raw) {
        const old = JSON.parse(v2raw);
        const migrated = {};
        for (const [chId, ch] of Object.entries(old)) {
          migrated[chId] = {};
          for (const [word, s] of Object.entries(ch)) {
            if (word === '_totals') { migrated[chId]._totals = s; continue; }
            migrated[chId][word] = migrateState(s) || blankState();
          }
        }
        return migrated;
      }
      return {};
    } catch { return {}; }
  }

  function saveProgress() {
    try { localStorage.setItem(FC_KEY, JSON.stringify(fc.progress)); }
    catch (e) { console.warn('FC: could not save progress', e); }
  }

  function loadMeta() {
    try { return JSON.parse(localStorage.getItem(FC_META_KEY) || '{}'); }
    catch { return {}; }
  }

  function saveMeta() {
    try { localStorage.setItem(FC_META_KEY, JSON.stringify(fc.meta)); }
    catch (e) { console.warn('FC: could not save meta', e); }
  }

  function getTodayNewCount() {
    if (fc.meta.todayDate !== getTodayDate()) return 0;
    return fc.meta.newToday || 0;
  }

  function _countNewCard() {
    const today = getTodayDate();
    if (fc.meta.todayDate !== today) { fc.meta.todayDate = today; fc.meta.newToday = 0; }
    fc.meta.newToday = (fc.meta.newToday || 0) + 1;
    saveMeta();
  }

  function updateStreak() {
    const today     = getTodayDate();
    if (fc.meta.lastStudyDate === today) return; // already logged today
    const yesterday = new Date(Date.now() - DAY).toISOString().slice(0, 10);
    fc.meta.streak  = fc.meta.lastStudyDate === yesterday ? (fc.meta.streak || 0) + 1 : 1;
    fc.meta.lastStudyDate = today;
    if (fc.meta.todayDate !== today) { fc.meta.todayDate = today; fc.meta.newToday = 0; }
    saveMeta();
  }

  /* ── Session building ───────────────────────────────────────────────────── */
  function buildSession() {
    const now       = Date.now();
    const ch        = fc.progress[fc.chapterId] || {};
    const newBudget = Math.max(0, NEW_PER_DAY - getTodayNewCount());

    const all = (wordList || []).map(w => {
      const raw = ch[w.dutch];
      return { ...w, _s: raw ? (migrateState(raw) || blankState()) : blankState() };
    });
    if (!all.length) return [];

    const dueCards = all.filter(c =>
      (c._s.state === 'review' || c._s.state === 'relearning' || c._s.state === 'learning') &&
      (c._s.nextDue === 0 || c._s.nextDue <= now)
    );

    const newCards = all.filter(c => c._s.state === 'new').slice(0, newBudget);

    let session = [...shuffle(dueCards), ...shuffle(newCards)];
    if (!session.length) session = shuffle(all); // fallback: nothing due, show all

    return session.slice(0, SESSION_SIZE);
  }

  function chapterStats() {
    const now = Date.now();
    const ch  = fc.progress[fc.chapterId] || {};
    const all = wordList || [];

    const mastered = all.filter(w => {
      const s = ch[w.dutch];
      return s && s.state === 'review' && (s.interval || 0) >= 21;
    }).length;

    const learning = all.filter(w => {
      const s = ch[w.dutch];
      return s && s.state && (s.state === 'learning' || s.state === 'relearning' ||
        (s.state === 'review' && (s.interval || 0) < 21));
    }).length;

    const due = all.filter(w => {
      const s = ch[w.dutch];
      return s && s.state !== 'new' && s.nextDue > 0 && s.nextDue <= now;
    }).length;

    const newCount = all.filter(w => !ch[w.dutch] || !ch[w.dutch].state || ch[w.dutch].state === 'new').length;

    return { mastered, learning, newCount, total: all.length, due };
  }

  /* ── Open / Close ───────────────────────────────────────────────────────── */
  function openFlashcard() {
    $id('flashcard-popup').style.display = 'flex';
    document.body.style.overflow = 'hidden';

    if (!wordList || !wordList.length) {
      showWaiting();
      const deadline = Date.now() + 8000;
      const poll = setInterval(() => {
        if (wordList && wordList.length) { clearInterval(poll); startGame(); }
        else if (Date.now() > deadline) {
          clearInterval(poll);
          $id('fc-word').textContent = '⚠️';
          $id('fc-hint').textContent = 'Please pick a lesson from the menu first.';
        }
      }, 250);
      return;
    }
    startGame();
  }

  function showWaiting() {
    $id('fc-chapter-stats').textContent = 'Loading lesson…';
    $id('fc-session-count').textContent = '…';
    $id('fc-word').textContent = '⏳';
    $id('fc-ipa').textContent = '';
    $id('fc-phonetic').textContent = '';
    $id('fc-hint').textContent = 'Loading vocabulary…';
    $id('fc-front').style.display = '';
    $id('fc-back').classList.remove('fc-visible');
    $id('fc-actions').style.opacity = '0';
    $id('fc-actions').style.pointerEvents = 'none';
    $id('fc-complete').style.display = 'none';
    $id('fc-scene').style.display = 'flex';
  }

  function startGame() {
    fc.chapterId       = localStorage.getItem('currentPage') || 'default';
    fc.progress        = loadProgress();
    fc.meta            = loadMeta();
    fc.stats           = { hard: 0, good: 0, easy: 0, total: 0 };
    fc.sessionRequeues = {};
    fc.index           = 0;
    fc.flipped         = false;
    fc.cards           = buildSession();
    updateStreak();
    $id('fc-actions').style.opacity = '0';
    $id('fc-actions').style.pointerEvents = 'none';
    $id('fc-complete').style.display = 'none';
    $id('fc-scene').style.display = 'flex';
    refreshHeader();
    renderCard();
  }

  function closeFlashcard() {
    $id('flashcard-popup').style.display = 'none';
    document.body.style.overflow = '';
    fc.ttsSeq++;
    window.speechSynthesis && window.speechSynthesis.cancel();
  }

  /* ── Header / progress ──────────────────────────────────────────────────── */
  function refreshHeader() {
    const s   = chapterStats();
    const pct = s.total ? Math.round((s.mastered / s.total) * 100) : 0;
    const duePart = s.due > 0 ? ` · ${s.due} due` : '';
    $id('fc-chapter-stats').textContent =
      `${s.newCount} new · ${s.learning} learning · ${s.mastered}/${s.total} mastered${duePart}`;
    $id('fc-overall-bar').style.width = pct + '%';
    $id('fc-overall-pct').textContent = pct + '%';
  }

  /* ── Card rendering ─────────────────────────────────────────────────────── */
  function renderCard() {
    const card = fc.cards[fc.index];
    if (!card) { showComplete(); return; }

    const pct = Math.round((fc.index / fc.cards.length) * 100);
    $id('fc-session-bar').style.width = pct + '%';
    $id('fc-session-count').textContent = `${fc.index + 1} / ${fc.cards.length}`;

    const { label, cls } = badgeFor(card._s);
    const badge = $id('fc-box-badge');
    badge.textContent = label;
    badge.className = 'fc-box-badge ' + cls;

    $id('fc-word').textContent = card.dutch;
    $id('fc-ipa').textContent = card.pronunciation?.ipa ? `/${card.pronunciation.ipa}/` : '';
    $id('fc-phonetic').textContent = card.pronunciation?.phonetic || '';
    $id('fc-english').textContent = card.english || '';
    $id('fc-vietnamese').textContent = card.vietnamese || '';
    $id('fc-sentence-nl').textContent = card.dutchsentence || '';
    $id('fc-sentence-en').textContent = card.englishtranslate || '';

    $id('fc-front').style.display = '';
    $id('fc-back').classList.remove('fc-visible');
    fc.flipped = false;
    $id('fc-speak-btn').classList.remove('fc-speaking');

    const el = $id('fc-card');
    el.classList.remove('fc-shake', 'fc-exit-left', 'fc-exit-right', 'fc-exit-up');
    el.classList.add('fc-enter');
    setTimeout(() => el.classList.remove('fc-enter'), 500);

    const remaining = fc.cards.length - fc.index - 1;
    const scene = $id('fc-scene');
    scene.classList.remove('fc-stack-0', 'fc-stack-1', 'fc-stack-2');
    scene.classList.add(remaining >= 2 ? 'fc-stack-2' : remaining === 1 ? 'fc-stack-1' : 'fc-stack-0');

    fc.ttsSeq++;
    const seq = fc.ttsSeq;
    setTimeout(() => {
      if (seq !== fc.ttsSeq) return;
      if (typeof speakText === 'function') speakText(card.dutch);
    }, 400);
  }

  /* ── Flip ───────────────────────────────────────────────────────────────── */
  function flipCard() {
    if (fc.flipped) return;
    const el = $id('fc-card');
    el.classList.add('fc-flip-out');
    setTimeout(() => {
      el.classList.remove('fc-flip-out');
      $id('fc-front').style.display = 'none';
      $id('fc-back').classList.add('fc-visible');
      el.classList.add('fc-flip-in');
      setTimeout(() => el.classList.remove('fc-flip-in'), 220);
    }, 200);

    fc.flipped = true;
    setTimeout(() => {
      $id('fc-actions').style.opacity = '1';
      $id('fc-actions').style.pointerEvents = 'auto';
    }, 380);

    const card = fc.cards[fc.index];
    fc.ttsSeq++;
    const seq = fc.ttsSeq;
    setTimeout(() => {
      if (seq !== fc.ttsSeq) return;
      if (typeof speakEngText === 'function') speakEngText(card.english);
    }, 450);
  }

  function unflipCard() {
    if (!fc.flipped) return;
    fc.flipped = false;
    fc.ttsSeq++;
    window.speechSynthesis && window.speechSynthesis.cancel();
    $id('fc-actions').style.opacity = '0';
    $id('fc-actions').style.pointerEvents = 'none';

    const el = $id('fc-card');
    el.classList.add('fc-flip-out');
    setTimeout(() => {
      el.classList.remove('fc-flip-out');
      $id('fc-back').classList.remove('fc-visible');
      $id('fc-front').style.display = '';
      el.classList.add('fc-flip-in');
      setTimeout(() => el.classList.remove('fc-flip-in'), 220);
    }, 200);
  }

  /* ── Requeue ────────────────────────────────────────────────────────────── */
  function requeueCard(card) {
    const key = card.dutch;
    fc.sessionRequeues[key] = (fc.sessionRequeues[key] || 0) + 1;
    if (fc.sessionRequeues[key] > 2) return; // max 2 requeues per card per session
    const pos = Math.min(fc.index + 2 + Math.floor(Math.random() * 3), fc.cards.length);
    const freshSt = { ...blankState(), ...(fc.progress[fc.chapterId]?.[key] || {}) };
    fc.cards.splice(pos, 0, { ...card, _s: freshSt });
  }

  /* ── Rating (SM-2) ──────────────────────────────────────────────────────── */
  function rateCard(rating) {
    if (!fc.flipped) return;
    const card = fc.cards[fc.index];
    const key  = card.dutch;

    if (!fc.progress[fc.chapterId]) fc.progress[fc.chapterId] = {};
    const rawSt = fc.progress[fc.chapterId][key] || card._s;
    const st    = { ...(rawSt.state ? rawSt : (migrateState(rawSt) || blankState())) };

    st.seen        = (st.seen || 0) + 1;
    st.lastStudied = Date.now();
    const wasNew   = st.state === 'new';

    if (st.state === 'new' || st.state === 'learning') {
      if (rating === 'hard') {
        st.state   = 'learning';
        st.nextDue = 0;
        fc.progress[fc.chapterId][key] = st;
        if (wasNew) _countNewCard();
        requeueCard({ ...card, _s: { ...st } });
      } else if (rating === 'good') {
        st.state    = 'review';
        st.interval = 1;
        st.reps     = (st.reps || 0) + 1;
        st.nextDue  = Date.now() + DAY;
        fc.progress[fc.chapterId][key] = st;
        if (wasNew) _countNewCard();
      } else { // easy
        st.state    = 'review';
        st.interval = 4;
        st.ease     = Math.min(MAX_EASE, st.ease + 0.10);
        st.reps     = (st.reps || 0) + 1;
        st.nextDue  = Date.now() + 4 * DAY;
        fc.progress[fc.chapterId][key] = st;
        if (wasNew) _countNewCard();
      }

    } else if (st.state === 'relearning') {
      if (rating === 'hard') {
        st.nextDue = 0;
        fc.progress[fc.chapterId][key] = st;
        requeueCard({ ...card, _s: { ...st } });
      } else { // good or easy — graduate back to review
        st.state   = 'review';
        st.reps    = (st.reps || 0) + 1;
        st.nextDue = Date.now() + Math.max(1, st.interval) * DAY;
        if (rating === 'easy') st.ease = Math.min(MAX_EASE, st.ease + 0.05);
        fc.progress[fc.chapterId][key] = st;
      }

    } else { // review
      st.reps = (st.reps || 0) + 1;
      if (rating === 'hard') {
        // LAPSE → relearning
        st.state    = 'relearning';
        st.ease     = Math.max(MIN_EASE, st.ease - 0.20);
        st.interval = Math.max(1, Math.round(st.interval / 2));
        st.lapses   = (st.lapses || 0) + 1;
        st.nextDue  = 0;
        fc.progress[fc.chapterId][key] = st;
        requeueCard({ ...card, _s: { ...st } });
      } else if (rating === 'good') {
        const next  = Math.max(st.interval + 1, Math.round(st.interval * st.ease));
        st.interval = next;
        st.nextDue  = Date.now() + next * DAY;
        fc.progress[fc.chapterId][key] = st;
      } else { // easy
        st.ease     = Math.min(MAX_EASE, st.ease + 0.10);
        const next  = Math.max(st.interval + 1, Math.round(st.interval * st.ease * 1.3));
        st.interval = next;
        st.nextDue  = Date.now() + next * DAY;
        fc.progress[fc.chapterId][key] = st;
      }
    }

    // Chapter-level all-time totals
    const t = fc.progress[fc.chapterId]._totals || { seen: 0, hard: 0, good: 0, easy: 0 };
    t.seen    = (t.seen  || 0) + 1;
    t[rating] = (t[rating] || 0) + 1;
    t.lastStudied = Date.now();
    fc.progress[fc.chapterId]._totals = t;

    fc.stats[rating]++;
    fc.stats.total++;
    saveProgress();
    refreshHeader();

    $id('fc-actions').style.pointerEvents = 'none';

    const el = $id('fc-card');
    if (rating === 'hard') {
      el.classList.add('fc-exit-left');
      flashOverlay('rgba(220,38,38,0.18)');
      setTimeout(() => { el.classList.remove('fc-exit-left'); advance(); }, 450);
    } else if (rating === 'good') {
      el.classList.add('fc-exit-up');
      flashOverlay('rgba(22,163,74,0.15)');
      setTimeout(() => { el.classList.remove('fc-exit-up'); advance(); }, 450);
    } else {
      el.classList.add('fc-exit-right');
      flashOverlay('rgba(234,179,8,0.18)');
      burstConfetti(false);
      setTimeout(() => { el.classList.remove('fc-exit-right'); advance(); }, 450);
    }
  }

  function advance() {
    fc.index++;
    $id('fc-actions').style.opacity = '0';
    $id('fc-actions').style.pointerEvents = 'none';
    if (fc.index >= fc.cards.length) showComplete();
    else renderCard();
  }

  /* ── Flash overlay ──────────────────────────────────────────────────────── */
  function flashOverlay(color) {
    const ov = $id('fc-flash-overlay');
    ov.style.background = color;
    ov.style.opacity = '1';
    setTimeout(() => { ov.style.opacity = '0'; }, 300);
  }

  /* ── Confetti ───────────────────────────────────────────────────────────── */
  const COLORS = ['#00698f','#1cb508','#f9c74f','#f94144','#90e0ef','#c77dff','#ff6b6b','#43aa8b'];

  function burstConfetti(isBig) {
    const layer = $id('fc-confetti-layer');
    layer.innerHTML = '';
    const count = isBig ? 90 : 45;
    for (let i = 0; i < count; i++) {
      const p = document.createElement('div');
      const isCircle = Math.random() > 0.5;
      if (isBig) {
        p.className = 'fc-conf fc-conf-fall';
        p.style.cssText = `
          left:${Math.random() * 100}%;top:-16px;
          background:${COLORS[i % COLORS.length]};
          width:${6 + Math.random() * 8}px;height:${6 + Math.random() * 14}px;
          border-radius:${isCircle ? '50%' : '2px'};
          animation-delay:${Math.random() * 1.8}s;
          --rot:${Math.random() * 720 - 360}deg;
          --flip:${Math.random() > 0.5 ? 1 : -1};
        `;
      } else {
        p.className = 'fc-conf fc-conf-burst';
        const angle = Math.random() * 360;
        const dist  = 70 + Math.random() * 160;
        p.style.cssText = `
          left:50%;top:40%;
          background:${COLORS[i % COLORS.length]};
          width:${5 + Math.random() * 7}px;height:${5 + Math.random() * 12}px;
          border-radius:${isCircle ? '50%' : '2px'};
          --a:${angle}deg;--d:${dist}px;
          animation-delay:${Math.random() * 0.12}s;
        `;
      }
      layer.appendChild(p);
    }
    setTimeout(() => { layer.innerHTML = ''; }, isBig ? 4000 : 1400);
  }

  /* ── Session complete ───────────────────────────────────────────────────── */
  function showComplete() {
    $id('fc-scene').style.display = 'none';
    $id('fc-actions').style.opacity = '0';
    $id('fc-actions').style.pointerEvents = 'none';

    const { hard, good, easy, total } = fc.stats;
    const pct    = total ? Math.round(((good + easy) / total) * 100) : 0;
    const trophy = pct >= 80 ? '🏆' : pct >= 50 ? '🌟' : '💪';
    const s      = chapterStats();
    const ovPct  = s.total ? Math.round((s.mastered / s.total) * 100) : 0;

    const streakLine = (fc.meta.streak || 0) > 1
      ? `<div class="fc-res-streak">🔥 ${fc.meta.streak}-day streak!</div>`
      : '';

    const now = Date.now();
    const ch  = fc.progress[fc.chapterId] || {};
    const dueTomorrow = (wordList || []).filter(w => {
      const ws = ch[w.dutch];
      return ws && ws.nextDue > now && ws.nextDue <= now + DAY;
    }).length;
    const nextLine = dueTomorrow > 0
      ? `<div class="fc-res-next">📅 ${dueTomorrow} card${dueTomorrow > 1 ? 's' : ''} due tomorrow</div>`
      : '';

    const t = fc.progress[fc.chapterId]?._totals || {};
    const allTimeLine = t.seen
      ? `<div class="fc-res-alltime">
           <span class="fc-res-alltime-lbl">📚 All-time this chapter</span>
           <span>${t.seen} reviews &nbsp;·&nbsp; 😰 ${t.hard||0} &nbsp;😊 ${t.good||0} &nbsp;🤩 ${t.easy||0}</span>
         </div>`
      : '';

    $id('fc-complete').innerHTML = `
      <div class="fc-res-trophy">${trophy}</div>
      <h2 class="fc-res-title">Session Complete!</h2>
      <p class="fc-res-subtitle">${pct}% recalled correctly</p>
      ${streakLine}
      <div class="fc-res-grid">
        <div class="fc-res-stat" style="--clr:#dc2626">
          <span class="fc-res-num">${hard}</span><span class="fc-res-lbl">Hard</span>
        </div>
        <div class="fc-res-stat" style="--clr:#16a34a">
          <span class="fc-res-num">${good}</span><span class="fc-res-lbl">Good</span>
        </div>
        <div class="fc-res-stat" style="--clr:#ca8a04">
          <span class="fc-res-num">${easy}</span><span class="fc-res-lbl">Easy</span>
        </div>
      </div>
      <div class="fc-res-mastery">
        <div class="fc-res-mastery-lbl">Chapter Mastery</div>
        <div class="fc-res-bar-bg">
          <div class="fc-res-bar" id="fc-res-bar-fill" style="width:0%"></div>
        </div>
        <div class="fc-res-mastery-pct">${ovPct}%</div>
      </div>
      ${allTimeLine}
      ${nextLine}
      <div class="fc-res-actions">
        <button class="fc-res-btn fc-res-restart">🔄 Study Again</button>
        <button class="fc-res-btn fc-res-done">✓ Done</button>
      </div>
    `;
    $id('fc-complete').style.display = 'flex';

    $id('fc-complete').querySelector('.fc-res-restart').onclick = restartSession;
    $id('fc-complete').querySelector('.fc-res-done').onclick    = closeFlashcard;

    requestAnimationFrame(() => requestAnimationFrame(() => {
      const bar = $id('fc-res-bar-fill');
      if (bar) bar.style.width = ovPct + '%';
    }));

    setTimeout(() => burstConfetti(true), 150);
  }

  function restartSession() {
    $id('fc-complete').style.display = 'none';
    startGame();
  }

  /* ── Keyboard ───────────────────────────────────────────────────────────── */
  function onKey(e) {
    if ($id('flashcard-popup').style.display === 'none') return;
    if (e.key === 'Escape') { closeFlashcard(); return; }
    if (!fc.flipped) {
      if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); flipCard(); }
    } else {
      if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); unflipCard(); }
      if (e.key === 'ArrowLeft')  rateCard('hard');
      if (e.key === 'ArrowUp')    rateCard('good');
      if (e.key === 'ArrowRight') rateCard('easy');
    }
  }

  /* ── Speak ──────────────────────────────────────────────────────────────── */
  function speakCurrent() {
    const card = fc.cards[fc.index];
    if (!card) return;
    const btn = $id('fc-speak-btn');
    btn.classList.add('fc-speaking');
    fc.ttsSeq++;
    const seq = fc.ttsSeq;
    if (typeof speakText === 'function') speakText(card.dutch);
    setTimeout(() => { if (fc.ttsSeq === seq) btn.classList.remove('fc-speaking'); }, 1800);
  }

  function speakSentence() {
    const card = fc.cards[fc.index];
    if (!card || !card.dutchsentence) return;
    const btn = $id('fc-sentence-speak-btn');
    btn.classList.add('fc-speaking');
    fc.ttsSeq++;
    const seq = fc.ttsSeq;
    if (typeof speakText === 'function') speakText(card.dutchsentence);
    setTimeout(() => { if (fc.ttsSeq === seq) btn.classList.remove('fc-speaking'); }, 4000);
  }

  /* ── Drag-to-rate ───────────────────────────────────────────────────────── */
  function createDragIndicator() {
    const el = document.createElement('div');
    el.id = 'fc-drag-indicator';
    el.innerHTML = '<span id="fc-drag-label"></span>';
    $id('fc-card').appendChild(el);
  }

  function updateCardDrag(dx, dy) {
    const el     = $id('fc-card');
    const clampY = Math.min(0, dy);
    const rot    = dx * 0.07;
    el.style.transition = 'none';
    el.style.transform  = `translateX(${dx}px) translateY(${clampY}px) rotate(${rot}deg)`;

    const absDx = Math.abs(dx), absClampY = Math.abs(clampY);
    let dir = null, dist = 0;
    if (absDx >= absClampY) {
      dist = absDx;
      dir  = dx < -20 ? 'hard' : dx > 20 ? 'easy' : null;
    } else {
      dist = absClampY;
      dir  = dy < -20 ? 'good' : null;
    }
    showDragIndicator(dir, dist);
  }

  function snapBackCard() {
    const el = $id('fc-card');
    el.style.transition = 'transform 0.4s cubic-bezier(0.34,1.56,0.64,1)';
    el.style.transform  = '';
    showDragIndicator(null, 0);
    setTimeout(() => { el.style.transition = ''; }, 420);
  }

  function showDragIndicator(dir, dist) {
    const ind = $id('fc-drag-indicator');
    const lbl = $id('fc-drag-label');
    if (!dir || dist < 20) { ind.style.opacity = '0'; return; }
    ind.style.opacity = String(Math.min(0.95, (dist - 20) / 80));
    ind.dataset.dir   = dir;
    lbl.textContent   = dir === 'hard' ? '😰 Hard' : dir === 'easy' ? '🤩 Easy' : '😊 Good';
  }

  /* ── Touch / swipe ──────────────────────────────────────────────────────── */
  function onTouchStart(e) {
    fc.touchStartX = e.touches[0].clientX;
    fc.touchStartY = e.touches[0].clientY;
    fc.isDragging  = false;
  }

  function onTouchMove(e) {
    const dx   = e.touches[0].clientX - fc.touchStartX;
    const dy   = e.touches[0].clientY - fc.touchStartY;
    const absDx = Math.abs(dx), absDy = Math.abs(dy);

    if (absDx > 4 || (fc.isDragging && absDy > 4)) e.preventDefault();
    if (!fc.isDragging && (absDx > 8 || absDy > 8)) fc.isDragging = true;
    if (fc.isDragging) {
      updateCardDrag(dx, dy);
      if (!fc.flipped) showDragIndicator(null, 0);
    }
  }

  function onTouchEnd(e) {
    const dx   = e.changedTouches[0].clientX - fc.touchStartX;
    const dy   = e.changedTouches[0].clientY - fc.touchStartY;
    const absDx = Math.abs(dx), absDy = Math.abs(dy);

    if (fc.isDragging) {
      fc.isDragging = false;
      showDragIndicator(null, 0);
      const el = $id('fc-card');
      el.style.transition = '';
      el.style.transform  = '';

      if (fc.flipped) {
        const isHoriz = absDx >= absDy;
        if (isHoriz && absDx > 100)     rateCard(dx < 0 ? 'hard' : 'easy');
        else if (!isHoriz && dy < -100) rateCard('good');
        else                            snapBackCard();
      } else {
        snapBackCard();
      }
      return;
    }

    // Pure tap — suppress synthetic mouse click via preventDefault
    if (absDx < 12 && absDy < 12) {
      e.preventDefault();
      if (!fc.flipped) {
        if (e.target.closest('#fc-speak-btn')) speakCurrent();
        else flipCard();
      } else {
        if (e.target.closest('#fc-sentence-speak-btn')) speakSentence();
        else unflipCard();
      }
    }
  }

  /* ── Init ───────────────────────────────────────────────────────────────── */
  document.addEventListener('DOMContentLoaded', () => {
    createDragIndicator();
    $id('flashcard-btn').addEventListener('click', openFlashcard);
    $id('fc-close-btn').addEventListener('click', closeFlashcard);
    $id('fc-card').addEventListener('click', () => fc.flipped ? unflipCard() : flipCard());
    $id('fc-speak-btn').addEventListener('click', e => { e.stopPropagation(); speakCurrent(); });
    $id('fc-sentence-speak-btn').addEventListener('click', e => { e.stopPropagation(); speakSentence(); });
    $id('fc-hard-btn').addEventListener('click', () => rateCard('hard'));
    $id('fc-good-btn').addEventListener('click', () => rateCard('good'));
    $id('fc-easy-btn').addEventListener('click', () => rateCard('easy'));

    const scene = $id('fc-scene');
    scene.addEventListener('touchstart', onTouchStart, { passive: true });
    scene.addEventListener('touchmove',  onTouchMove,  { passive: false });
    scene.addEventListener('touchend',   onTouchEnd,   { passive: false });

    document.addEventListener('keydown', onKey);

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') saveProgress();
    });
    window.addEventListener('beforeunload', saveProgress);
  });
})();
