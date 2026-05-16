/* Flashcard game — spaced repetition for Dutch vocabulary */
(function () {
  'use strict';

  const FC_KEY = 'nl_flashcard_v2';
  const SESSION_SIZE = 20;
  const NEW_LIMIT = 7;

  /* ── State ──────────────────────────────────────────────────────────────── */
  const fc = {
    cards: [], index: 0, flipped: false,
    stats: { hard: 0, good: 0, easy: 0, total: 0 },
    chapterId: '', progress: {}, ttsSeq: 0,
    touchStartX: 0, touchStartY: 0,
  };

  /* ── Helpers ────────────────────────────────────────────────────────────── */
  function shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function loadProgress() {
    try { return JSON.parse(localStorage.getItem(FC_KEY) || '{}'); }
    catch { return {}; }
  }

  function saveProgress() {
    localStorage.setItem(FC_KEY, JSON.stringify(fc.progress));
  }

  function $id(id) { return document.getElementById(id); }

  /* ── Session building ───────────────────────────────────────────────────── */
  function buildSession() {
    const ch = fc.progress[fc.chapterId] || {};
    const all = (wordList || []).map(w => ({
      ...w,
      _s: ch[w.dutch] || { box: 0, streak: 0, seen: 0 }
    }));
    if (!all.length) return [];

    const byBox = [0, 1, 2, 3].map(b => shuffle(all.filter(c => c._s.box === b)));
    // Blend: NEW_LIMIT new, rest from box1+2, sprinkle mastered
    let session = [
      ...byBox[0].slice(0, NEW_LIMIT),
      ...byBox[1].slice(0, 8),
      ...byBox[2].slice(0, 5),
      ...byBox[3].slice(0, 2),
    ];
    if (!session.length) session = shuffle(all);
    return shuffle(session).slice(0, SESSION_SIZE);
  }

  function chapterStats() {
    const ch = fc.progress[fc.chapterId] || {};
    const all = wordList || [];
    const mastered = all.filter(w => (ch[w.dutch]?.box || 0) >= 3).length;
    const learning = all.filter(w => [1, 2].includes(ch[w.dutch]?.box || 0)).length;
    return { mastered, learning, newCount: all.length - mastered - learning, total: all.length };
  }

  /* ── Open / Close ───────────────────────────────────────────────────────── */
  function openFlashcard() {
    $id('flashcard-popup').style.display = 'flex';
    document.body.style.overflow = 'hidden';

    if (!wordList || !wordList.length) {
      showWaiting();
      const deadline = Date.now() + 8000;
      const poll = setInterval(() => {
        if (wordList && wordList.length) {
          clearInterval(poll);
          startGame();
        } else if (Date.now() > deadline) {
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
    fc.chapterId = localStorage.getItem('currentPage') || 'default';
    fc.progress = loadProgress();
    fc.stats = { hard: 0, good: 0, easy: 0, total: 0 };
    fc.index = 0;
    fc.flipped = false;
    fc.cards = buildSession();
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
    const s = chapterStats();
    const pct = s.total ? Math.round((s.mastered / s.total) * 100) : 0;
    $id('fc-chapter-stats').textContent =
      `${s.newCount} new · ${s.learning} learning · ${s.mastered}/${s.total} mastered`;
    $id('fc-overall-bar').style.width = pct + '%';
    $id('fc-overall-pct').textContent = pct + '%';
  }

  /* ── Card rendering ─────────────────────────────────────────────────────── */
  const BOX_LABEL = ['New', 'Hard', 'Review', 'Mastered'];
  const BOX_CLASS = ['fc-badge-new', 'fc-badge-hard', 'fc-badge-review', 'fc-badge-master'];

  function renderCard() {
    const card = fc.cards[fc.index];
    if (!card) { showComplete(); return; }

    // Session bar
    const pct = Math.round((fc.index / fc.cards.length) * 100);
    $id('fc-session-bar').style.width = pct + '%';
    $id('fc-session-count').textContent = `${fc.index + 1} / ${fc.cards.length}`;

    // Box badge
    const box = card._s.box;
    const badge = $id('fc-box-badge');
    badge.textContent = BOX_LABEL[box] || 'New';
    badge.className = 'fc-box-badge ' + (BOX_CLASS[box] || 'fc-badge-new');

    // Front content
    $id('fc-word').textContent = card.dutch;
    $id('fc-ipa').textContent = card.pronunciation?.ipa ? `/${card.pronunciation.ipa}/` : '';
    $id('fc-phonetic').textContent = card.pronunciation?.phonetic || '';

    // Back content
    $id('fc-english').textContent = card.english || '';
    $id('fc-vietnamese').textContent = card.vietnamese || '';
    $id('fc-sentence-nl').textContent = card.dutchsentence || '';
    $id('fc-sentence-en').textContent = card.englishtranslate || '';

    // Show front, hide back
    $id('fc-front').style.display = '';
    $id('fc-back').classList.remove('fc-visible');
    fc.flipped = false;

    // Animate card in
    const el = $id('fc-card');
    el.classList.remove('fc-shake', 'fc-exit-left', 'fc-exit-right', 'fc-exit-up');
    el.classList.add('fc-enter');
    setTimeout(() => el.classList.remove('fc-enter'), 500);

    // Speak Dutch word
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
    // Half-flip out
    el.classList.add('fc-flip-out');
    setTimeout(() => {
      el.classList.remove('fc-flip-out');
      $id('fc-front').style.display = 'none';
      $id('fc-back').classList.add('fc-visible');
      el.classList.add('fc-flip-in');
      setTimeout(() => el.classList.remove('fc-flip-in'), 220);
    }, 200);

    fc.flipped = true;

    // Show action buttons
    setTimeout(() => {
      $id('fc-actions').style.opacity = '1';
      $id('fc-actions').style.pointerEvents = 'auto';
    }, 380);

    // Speak English
    const card = fc.cards[fc.index];
    fc.ttsSeq++;
    const seq = fc.ttsSeq;
    setTimeout(() => {
      if (seq !== fc.ttsSeq) return;
      if (typeof speakEngText === 'function') speakEngText(card.english);
    }, 450);
  }

  /* ── Rating ─────────────────────────────────────────────────────────────── */
  function rateCard(rating) {
    if (!fc.flipped) return;
    const card = fc.cards[fc.index];

    // Update spaced repetition state
    if (!fc.progress[fc.chapterId]) fc.progress[fc.chapterId] = {};
    const st = { ...(fc.progress[fc.chapterId][card.dutch] || { box: 0, streak: 0, seen: 0 }) };
    st.seen = (st.seen || 0) + 1;

    if (rating === 'hard') {
      st.box = 1; st.streak = 0;
    } else if (rating === 'good') {
      st.box = Math.min(2, (st.box || 0) + 1);
      st.streak = (st.streak || 0) + 1;
    } else {
      st.box = 3;
      st.streak = (st.streak || 0) + 2;
    }

    fc.progress[fc.chapterId][card.dutch] = st;
    fc.stats[rating]++;
    fc.stats.total++;
    saveProgress();
    refreshHeader();

    // Disable buttons during animation
    $id('fc-actions').style.pointerEvents = 'none';

    const el = $id('fc-card');
    if (rating === 'hard') {
      el.classList.add('fc-shake');
      flashOverlay('rgba(220,38,38,0.15)');
      setTimeout(() => { el.classList.remove('fc-shake'); advance(); }, 650);
    } else if (rating === 'good') {
      el.classList.add('fc-exit-up');
      flashOverlay('rgba(22,163,74,0.15)');
      setTimeout(() => { el.classList.remove('fc-exit-up'); advance(); }, 480);
    } else {
      el.classList.add('fc-exit-right');
      flashOverlay('rgba(234,179,8,0.18)');
      burstConfetti(false);
      setTimeout(() => { el.classList.remove('fc-exit-right'); advance(); }, 520);
    }
  }

  function advance() {
    fc.index++;
    $id('fc-actions').style.opacity = '0';
    $id('fc-actions').style.pointerEvents = 'none';
    if (fc.index >= fc.cards.length) showComplete();
    else renderCard();
  }

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
        const dist = 70 + Math.random() * 160;
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
    const pct = total ? Math.round(((good + easy) / total) * 100) : 0;
    const trophy = pct >= 80 ? '🏆' : pct >= 50 ? '🌟' : '💪';
    const s = chapterStats();
    const ovPct = s.total ? Math.round((s.mastered / s.total) * 100) : 0;

    $id('fc-complete').innerHTML = `
      <div class="fc-res-trophy">${trophy}</div>
      <h2 class="fc-res-title">Session Complete!</h2>
      <p class="fc-res-subtitle">${pct}% recalled correctly</p>
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
      <div class="fc-res-actions">
        <button class="fc-res-btn fc-res-restart">🔄 Study Again</button>
        <button class="fc-res-btn fc-res-done">✓ Done</button>
      </div>
    `;
    $id('fc-complete').style.display = 'flex';

    // Wire buttons
    $id('fc-complete').querySelector('.fc-res-restart').onclick = restartSession;
    $id('fc-complete').querySelector('.fc-res-done').onclick = closeFlashcard;

    // Animate mastery bar
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
      if (e.key === 'ArrowLeft')  rateCard('hard');
      if (e.key === 'ArrowUp')    rateCard('good');
      if (e.key === 'ArrowRight') rateCard('easy');
    }
  }

  /* ── Touch / swipe ──────────────────────────────────────────────────────── */
  function onTouchStart(e) {
    fc.touchStartX = e.touches[0].clientX;
    fc.touchStartY = e.touches[0].clientY;
  }

  function onTouchEnd(e) {
    const dx = e.changedTouches[0].clientX - fc.touchStartX;
    const dy = e.changedTouches[0].clientY - fc.touchStartY;
    const absDx = Math.abs(dx), absDy = Math.abs(dy);

    // Short tap → flip
    if (absDx < 12 && absDy < 12) {
      if (!fc.flipped) flipCard();
      return;
    }
    if (!fc.flipped) return;
    if (absDx > absDy) {
      if (dx < -60) rateCard('hard');
      else if (dx > 60) rateCard('easy');
    } else {
      if (dy < -60) rateCard('good');
    }
  }

  /* ── Init ───────────────────────────────────────────────────────────────── */
  document.addEventListener('DOMContentLoaded', () => {
    $id('flashcard-btn').addEventListener('click', openFlashcard);
    $id('fc-close-btn').addEventListener('click', closeFlashcard);
    $id('fc-card').addEventListener('click', flipCard);
    $id('fc-hard-btn').addEventListener('click', () => rateCard('hard'));
    $id('fc-good-btn').addEventListener('click', () => rateCard('good'));
    $id('fc-easy-btn').addEventListener('click', () => rateCard('easy'));

    const scene = $id('fc-scene');
    scene.addEventListener('touchstart', onTouchStart, { passive: true });
    scene.addEventListener('touchend', onTouchEnd, { passive: true });

    document.addEventListener('keydown', onKey);
  });
})();
