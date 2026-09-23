'use strict';

/* rss.html word-popup add-on: a 🔤 "Spel" button next to the existing 🔊
 * "Horen" button plays the tapped word letter-by-letter with the same
 * real-voice mp3 clips used in leesblad.html (data/leesblad/sounds.json +
 * assets/audio/klanken-nl/ — local-only/gitignored; missing on a machine
 * without that folder just silently falls back to a timed pause per letter),
 * then reads the whole word via plain speechSynthesis (same voice/rate as
 * the existing wordSpeak() in rss.js).
 *
 * Isolated on purpose: this reads rss.js's `_wpWord` (a plain top-level
 * `let`, so it's shared across classic <script> tags on the same page, the
 * same way rss.js already reads sync.js's SYNC_WORKER_URL) and only touches
 * #wp-word's own contents — rss.js itself is never edited.
 */
(function () {
  const SND_BASE = 'assets/audio/klanken-nl/';
  // Same list as leesblad.html / vanstart-spell.js's chunk() — longest-first
  // so "schr"/"sch" win over their shorter prefixes at the same position.
  const DIGRAPHS = ['schr', 'sch', 'aa', 'ee', 'oo', 'uu', 'ie', 'oe', 'eu', 'ui', 'ij', 'ou', 'au', 'ei', 'ch', 'ng', 'nk', 'uw'];

  let soundsPromise = null;
  function loadSounds() {
    if (!soundsPromise) soundsPromise = fetch('data/leesblad/sounds.json').then(r => r.ok ? r.json() : {}).catch(() => ({}));
    return soundsPromise;
  }

  function chunk(word) {
    const out = [];
    for (let i = 0; i < word.length;) {
      const hit = DIGRAPHS.find(d => word.startsWith(d, i));
      if (hit) { out.push(hit); i += hit.length; }
      else { out.push(word[i]); i++; }
    }
    return out;
  }

  function playClip(file) {
    return new Promise(resolve => {
      const a = new Audio(SND_BASE + file);
      a.volume = 1;
      a.addEventListener('ended', () => resolve(true));
      a.addEventListener('error', () => resolve(false));
      a.play().catch(() => resolve(false));
    });
  }

  const wait = ms => new Promise(r => setTimeout(r, ms));

  function getTTSRate() {
    try {
      const r = parseFloat(localStorage.getItem('nl_tts_rate') || '0.8');
      return isNaN(r) ? 0.8 : Math.min(1.5, Math.max(0.5, r));
    } catch { return 0.8; }
  }

  // Resolves once the utterance ends (or errors/times out) — never rejects,
  // same guarded pattern as leesblad/vanstart's TTS helpers.
  function speakAsync(text, rate) {
    return new Promise(resolve => {
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'nl-NL';
      u.rate = rate;
      let done = false;
      const fin = () => { if (done) return; done = true; clearTimeout(guard); resolve(); };
      const guard = setTimeout(fin, 3000 + text.length * 250 / rate);
      u.onend = fin; u.onerror = fin;
      speechSynthesis.speak(u);
    });
  }

  let runId = 0;
  async function wordSpell() {
    if (!_wpWord) return;
    const id = ++runId;
    if (speechSynthesis.speaking) speechSynthesis.cancel();

    const btn = document.getElementById('wp-spell-btn');
    const wordEl = document.getElementById('wp-word');
    btn?.classList.add('spelling');

    // Same restore-no-matter-what pattern as vanstart-spell.js: #wp-word
    // temporarily shows one <span> per grapheme so the current one can be
    // highlighted, then always goes back to the plain original text.
    const originalHTML = wordEl ? wordEl.innerHTML : null;
    const restore = () => { if (wordEl && originalHTML !== null) wordEl.innerHTML = originalHTML; };

    const sounds = await loadSounds();
    if (id !== runId) return;

    // Same article/plural trimming as vanstart-spell.js, in case a selected
    // phrase happens to include one ("de bus" etc.) — harmless no-op for a
    // plain single word, which is what a news-article word-tap usually is.
    const spellSource = _wpWord
      .replace(/^\s*(de|het)\s+/i, '')
      .split(/\s*[-,]\s*/)[0];
    const letters = spellSource.toLowerCase().replace(/[^a-zà-ÿ ]/g, '');
    const graphemes = chunk(letters);

    const chSpans = [];
    if (wordEl) {
      wordEl.innerHTML = '';
      graphemes.forEach(g => {
        const span = document.createElement('span');
        span.className = 'vs-ch';
        span.textContent = g;
        wordEl.appendChild(span);
        chSpans.push(span);
      });
    }

    for (let i = 0; i < graphemes.length; i++) {
      if (id !== runId) { restore(); return; }
      const span = chSpans[i];
      span?.classList.add('on');
      const file = sounds[graphemes[i]];
      if (file) await playClip(file);
      else await wait(260);   // no clip for this grapheme — small beat instead
      span?.classList.remove('on');
      if (id !== runId) { restore(); return; }
    }
    await wait(450);   // short pause between the spelled-out letters and the whole word
    if (id !== runId) { restore(); return; }

    wordEl?.classList.add('vs-speaking');
    await speakAsync(_wpWord, getTTSRate());
    wordEl?.classList.remove('vs-speaking');
    restore();
    if (id === runId) btn?.classList.remove('spelling');
  }

  window.wordSpell = wordSpell;
})();
