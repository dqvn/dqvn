'use strict';

// Leesblad – tap-to-hear reading sheets. Lessons live in data/leesblad/lNN.json
// (auto-discovered like data/kids); pics.json maps word → emoji shown after reading it.
(function () {

  const BASE      = 'data/leesblad/';
  const PROG_KEY  = 'nl_leesblad_v1';        // { <lesson.id>: { seen:[bool], stars:0-3 } }
  const PREF_KEY  = 'nl_leesblad_prefs';     // { rate, hak }
  const VOICE_KEY = 'nl_tts_voice_v1';       // shared with kids.html / vanstart.html (plain string)
  const RATES     = [0.35, 0.5, 0.75];
  const QUIZ_LEN  = 6;
  const DIGRAPHS  = ['aa', 'ee', 'oo', 'uu', 'ie', 'oe', 'eu', 'ui', 'ij', 'ou', 'au', 'ei'];
  const STEP_META = { words: ['🔤', 'Woorden'], story: ['📖', 'Verhaal'], game: ['🎯', 'Spel'] };

  const $ = id => document.getElementById(id);
  const el = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls)  n.className = cls;
    if (text) n.textContent = text;
    return n;
  };
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.random() * (i + 1) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const lsGet = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k)); return v ?? d; } catch { return d; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };

  // ── State ────────────────────────────────────────────────────────
  let lessons = [];
  let pics    = {};
  let cur     = -1;      // lesson index
  let stepIdx = 0;
  let prefs   = Object.assign({ rate: 0.5, hak: true }, lsGet(PREF_KEY, {}));
  let prog    = lsGet(PROG_KEY, {});
  let runId   = 0;       // bumped on every new speech action → older async loops stop
  let activeBtn = null;  // play button currently showing "Stop"
  let voice   = null;

  const lesson   = () => lessons[cur];
  const allSteps = l => l.steps.concat([{ type: 'game', title: 'Welk woord hoor je?' }]);
  const progOf   = l => prog[l.id] || (prog[l.id] = { seen: [], stars: 0 });
  const saveProg = () => lsSet(PROG_KEY, prog);

  // ── Text helpers ─────────────────────────────────────────────────
  // Split a word into graphemes so "kaas" → k · aa · s (the unit a child reads).
  function chunk(word) {
    const out = [];
    for (let i = 0; i < word.length;) {
      const two = word.substr(i, 2);
      if (DIGRAPHS.includes(two)) { out.push(two); i += 2; }
      else { out.push(word[i]); i++; }
    }
    return out;
  }

  const uniqueWords = l => [...new Set(
    l.steps.filter(s => s.type === 'words').flatMap(s => s.groups.flat())
  )];

  // ── TTS ──────────────────────────────────────────────────────────
  function pickVoice() {
    const voices = window.speechSynthesis.getVoices();
    let saved = null;
    try { saved = localStorage.getItem(VOICE_KEY); } catch {}
    return (saved && voices.find(v => v.name === saved))
        || voices.find(v => v.name.includes('Microsoft Colette Online') && v.lang === 'nl-NL')
        || voices.find(v => v.name.includes('Google Nederlands') && v.lang === 'nl-NL')
        || voices.find(v => v.lang === 'nl-NL')
        || voices.find(v => v.lang === 'nl-BE')
        || voices.find(v => v.lang.startsWith('nl'))
        || null;
  }

  function populateVoices() {
    const sel = $('tts-voice-select');
    const dutch = window.speechSynthesis.getVoices().filter(v => v.lang.startsWith('nl'));
    voice = pickVoice();
    sel.innerHTML = '';
    if (!dutch.length) {
      const o = el('option', '', 'Geen Nederlandse stem gevonden'); o.disabled = true; sel.append(o);
      return;
    }
    dutch.forEach(v => {
      const o = el('option', '', `${v.lang === 'nl-BE' ? '🇧🇪' : '🇳🇱'} ${v.localService ? '💻' : '☁️'} ${v.name}`);
      o.value = v.name; sel.append(o);
    });
    if (voice) { sel.value = voice.name; $('tts-name').textContent = '🔊 ' + voice.name; }
  }

  // Resolves when the utterance ends (or errors/cancels/times out) — never rejects.
  function utter(text, rate) {
    return new Promise(resolve => {
      if (!('speechSynthesis' in window)) { resolve(); return; }
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'nl-NL'; u.rate = rate; u.pitch = 1.1; u.volume = 1;
      if (voice) u.voice = voice;
      let done = false;
      const fin = () => { if (done) return; done = true; clearTimeout(guard); resolve(); };
      const guard = setTimeout(fin, 3000 + text.length * 250 / rate);   // some engines never fire onend
      u.onend = fin; u.onerror = fin;
      window.speechSynthesis.speak(u);
    });
  }

  const sayText = w => (lessons[cur] && lessons[cur].say && lessons[cur].say[w]) || w;

  // Stop everything that is playing and clear all highlights.
  function cancelAll() {
    runId++;
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    document.querySelectorAll('.speaking').forEach(n => n.classList.remove('speaking'));
    document.querySelectorAll('.ch.on').forEach(n => n.classList.remove('on'));
    setPlaying(null);
  }
  const startRun = () => { cancelAll(); return runId; };

  function setPlaying(btn) {
    if (activeBtn) {
      activeBtn.textContent = activeBtn.dataset.idle;
      activeBtn.classList.remove('stop');
    }
    activeBtn = btn;
    if (btn) {
      btn.dataset.idle = btn.dataset.idle || btn.textContent;
      btn.textContent = '⏹ Stop';
      btn.classList.add('stop');
    }
  }

  // Sound a word out grapheme by grapheme (visual), then say it. Returns false if cancelled.
  async function readWord(node, id, hak) {
    const word = node.dataset.word;
    node.classList.add('speaking');
    const chunks = node.querySelectorAll('.ch');
    if (hak && chunks.length > 1) {
      const ms = Math.min(700, Math.max(260, 220 / prefs.rate));
      for (const c of chunks) {
        c.classList.add('on');
        await wait(ms);
        c.classList.remove('on');
        if (id !== runId) return false;
      }
    }
    if (id !== runId) return false;
    await utter(sayText(word), prefs.rate);
    if (id !== runId) return false;
    node.classList.remove('speaking');
    node.classList.add('revealed');
    return true;
  }

  async function playSeq(nodes, btn) {
    const id = startRun();
    setPlaying(btn);
    for (const n of nodes) {
      const r = n.getBoundingClientRect();
      if (r.top < 90 || r.bottom > window.innerHeight - 20) n.scrollIntoView({ block: 'center', behavior: 'smooth' });
      if (!(await readWord(n, id, false))) return;
      await wait(250);
      if (id !== runId) return;
    }
    setPlaying(null);
  }

  // ── Word button ──────────────────────────────────────────────────
  function wordEl(word) {
    const focus = lesson().focus || [];
    const b = el('button', 'w');
    b.type = 'button';
    b.dataset.word = word;
    chunk(word).forEach(c => b.append(el('span', 'ch' + (focus.includes(c) ? ' f' : ''), c)));
    if (pics[word]) {
      const p = el('span', 'pic', pics[word]);
      p.setAttribute('aria-hidden', 'true');
      b.append(p);
    }
    b.addEventListener('click', () => readWord(b, startRun(), prefs.hak));
    return b;
  }

  const playBtn = (label, cls) => { const b = el('button', 'play-btn ' + (cls || ''), label); b.type = 'button'; b.dataset.idle = label; return b; };

  // ── Step renderers ───────────────────────────────────────────────
  function renderWords(step, body) {
    const tools = el('div', 'block-tools');
    const all = playBtn('▶ Lees alles');
    tools.append(all);

    const grid = el('div', 'cols');
    grid.style.setProperty('--cols', step.cols || 3);
    grid.dataset.cols = step.cols || 3;
    step.groups.forEach(g => {
      const col = el('div', 'col');
      const words = g.map(wordEl);
      const p = playBtn('▶', 'small');
      p.setAttribute('aria-label', 'Lees deze kolom');
      p.addEventListener('click', () => activeBtn === p ? cancelAll() : playSeq(words, p));
      col.append(p, ...words);
      grid.append(col);
    });
    all.addEventListener('click', () => activeBtn === all ? cancelAll() : playSeq([...grid.querySelectorAll('.w')], all));
    body.append(tools, grid);
  }

  function renderStory(step, body) {
    if (step.scene) body.append(el('div', 'scene', step.scene));

    const tools = el('div', 'block-tools');
    const along = playBtn('▶ Lees mee');
    tools.append(along);

    const story = el('div', 'story');
    step.lines.forEach(text => {
      const line = el('div', 'line');
      const say = el('button', 'line-say', '🔊');
      say.type = 'button';
      say.setAttribute('aria-label', 'Lees deze zin voor');
      say.addEventListener('click', async () => {
        const id = startRun();
        line.classList.add('speaking');
        await utter(text, prefs.rate);
        if (id === runId) line.classList.remove('speaking');
      });
      const words = el('div', 'words');
      text.split(/\s+/).forEach(tok => {
        const m = tok.match(/^([^\p{L}]*)(\p{L}+)([^\p{L}]*)$/u);
        if (!m) return;
        words.append(wordEl(m[2]));
        if (m[3]) words.append(el('span', 'punct', m[3]));
      });
      line.append(say, words);
      story.append(line);
    });
    along.addEventListener('click', () => activeBtn === along ? cancelAll() : playSeq([...story.querySelectorAll('.w')], along));
    body.append(tools, story);
  }

  // "Welk woord hoor je?" – hear a word, pick it among look-alike words.
  function renderGame(body) {
    const pool = uniqueWords(lesson());
    let qs = shuffle(pool).slice(0, Math.min(QUIZ_LEN, pool.length));
    let qi = 0, errors = 0, locked = false;

    const distractors = (t, n) => {
      const tc = chunk(t);
      return pool.filter(w => w !== t).map(w => {
        const c = chunk(w);
        let s = Math.random() * 1.5;
        if (c[0] === tc[0]) s += 2;
        if (c.length === tc.length) s += 1;
        if (c[c.length - 1] === tc[tc.length - 1]) s += 1;
        return { w, s };
      }).sort((a, b) => b.s - a.s).slice(0, n).map(o => o.w);
    };

    function question() {
      body.innerHTML = '';
      locked = false;
      const target = qs[qi];
      const hear = () => { startRun(); utter(sayText(target), prefs.rate); };

      const box = el('div', 'quiz');
      box.append(el('div', 'quiz-count', `Vraag ${qi + 1} / ${qs.length}`));
      const h = el('button', 'quiz-hear', '🔊');
      h.type = 'button'; h.setAttribute('aria-label', 'Luister opnieuw');
      h.addEventListener('click', hear);
      box.append(h, el('div', 'quiz-q', 'Tik op het woord dat je hoort'));

      const choices = el('div', 'choices');
      shuffle([target, ...distractors(target, 2)]).forEach(w => {
        const c = el('button', 'choice');
        c.type = 'button';
        chunk(w).forEach(g => c.append(el('span', '', g)));
        c.addEventListener('click', async () => {
          if (locked) return;
          const id = startRun();
          if (w === target) {
            locked = true;
            c.classList.add('right');
            await utter(sayText(w), prefs.rate);
            if (id !== runId) return;
            await wait(350);
            if (id !== runId) return;
            qi++;
            qi < qs.length ? question() : result();
          } else {
            errors++;
            c.classList.add('wrong'); c.disabled = true;
            await utter(sayText(w), prefs.rate);           // let the child hear what they picked…
            if (id !== runId) return;
            await wait(300);
            if (id === runId) await utter(sayText(target), prefs.rate);   // …then the right one again
          }
        });
        choices.append(c);
      });
      box.append(choices);
      body.append(box);
      setTimeout(() => { if (body.contains(box) && !locked) hear(); }, 350);
    }

    function result() {
      const stars = errors === 0 ? 3 : errors <= 2 ? 2 : 1;
      const p = progOf(lesson());
      p.stars = Math.max(p.stars, stars);
      saveProg();

      body.innerHTML = '';
      const box = el('div', 'result');
      const s = el('div', 'stars');
      for (let i = 1; i <= 3; i++) s.append(el('span', i <= stars ? 'star-on' : 'star-off', '★'));
      box.append(s, el('h3', '', stars === 3 ? 'Super goed! 🎉' : stars === 2 ? 'Goed gedaan! 👍' : 'Mooi geprobeerd! 💪'),
                 el('p', '', errors ? `${errors} × een ander woord gekozen` : 'Alles in één keer goed!'));
      const row = el('div', 'btn-row');
      const again = el('button', 'nav-big', '🔁 Nog een keer'); again.type = 'button';
      again.addEventListener('click', () => { qs = shuffle(pool).slice(0, Math.min(QUIZ_LEN, pool.length)); qi = 0; errors = 0; question(); });
      row.append(again);
      box.append(row);
      body.append(box);
      utter('Goed zo!', prefs.rate);
    }

    question();
  }

  // ── Screens ──────────────────────────────────────────────────────
  function show(name) {
    document.querySelectorAll('.screen').forEach(s => s.classList.toggle('active', s.id === 'screen-' + name));
    window.scrollTo(0, 0);
  }

  const isDone = l => {
    const p = prog[l.id];
    return !!p && p.stars > 0 && l.steps.every((_, i) => p.seen[i]);
  };

  function renderHome() {
    cancelAll();
    const grid = $('tile-grid');
    grid.innerHTML = '';
    if (!lessons.length) { grid.append(el('div', 'loading', 'Geen bladen gevonden')); return; }
    lessons.forEach((l, i) => {
      const t = el('button', 'tile' + (isDone(l) ? ' done' : ''));
      t.type = 'button';
      const letters = (l.focus || [l.name]).join(' ');
      t.append(el('div', 'tile-letters' + (letters.length > 3 ? ' long' : ''), letters), el('div', 'tile-sub', 'Blad ' + (i + 1)));
      const stars = el('div', 'tile-stars');
      const n = (prog[l.id] || {}).stars || 0;
      for (let k = 1; k <= 3; k++) stars.append(el('span', k <= n ? 'star-on' : 'star-off', '★'));
      t.append(stars);
      t.addEventListener('click', () => openLesson(i));
      grid.append(t);
    });
    show('home');
  }

  function openLesson(i, step = 0) {
    cur = i;
    $('big-letters').textContent = (lesson().focus || [lesson().name]).join(' ');
    show('lesson');
    setStep(step);
  }

  function setStep(s) {
    cancelAll();
    const l = lesson(), steps = allSteps(l), last = steps.length - 1;
    stepIdx = Math.max(0, Math.min(s, last));
    const step = steps[stepIdx];

    if (step.type !== 'game') {
      const p = progOf(l);
      if (!p.seen[stepIdx]) { p.seen[stepIdx] = true; saveProg(); }
    }

    const bar = $('stepper');
    bar.innerHTML = '';
    steps.forEach((st, i) => {
      const [ico, label] = STEP_META[st.type];
      const b = el('button', 'step-pill' + (i === stepIdx ? ' active' : '') + ((prog[l.id] || { seen: [] }).seen[i] ? ' seen' : ''));
      b.type = 'button'; b.setAttribute('role', 'tab'); b.setAttribute('aria-selected', i === stepIdx);
      b.append(el('span', 'ico', ico), el('span', '', `${i + 1}. ${label}`));
      b.addEventListener('click', () => setStep(i));
      bar.append(b);
    });

    $('step-title').textContent = step.title;
    const body = $('step-body');
    body.innerHTML = '';
    if (step.type === 'words') renderWords(step, body);
    else if (step.type === 'story') renderStory(step, body);
    else renderGame(body);

    $('btn-prev').disabled = stepIdx === 0;
    const next = $('btn-next');
    next.textContent = stepIdx < last ? 'Volgende ▶' : (cur < lessons.length - 1 ? 'Volgend blad ▶' : 'Klaar 🎉');
    window.scrollTo(0, 0);
  }

  // ── Controls ─────────────────────────────────────────────────────
  $('btn-home').addEventListener('click', renderHome);
  $('btn-prev').addEventListener('click', () => setStep(stepIdx - 1));
  $('btn-next').addEventListener('click', () => {
    if (stepIdx < allSteps(lesson()).length - 1) setStep(stepIdx + 1);
    else if (cur < lessons.length - 1) openLesson(cur + 1);
    else renderHome();
  });

  function applySpeed() {
    $('speed').querySelectorAll('button').forEach(b =>
      b.classList.toggle('on', Math.abs(parseFloat(b.dataset.rate) - prefs.rate) < 0.01));
  }
  $('speed').addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    prefs.rate = parseFloat(b.dataset.rate);
    lsSet(PREF_KEY, prefs);
    applySpeed();
    utter('Hoi!', prefs.rate);   // audible feedback for the new speed
  });
  if (!RATES.some(r => Math.abs(r - prefs.rate) < 0.01)) prefs.rate = 0.5;
  applySpeed();

  const settings = $('settings'), gear = $('btn-settings');
  gear.addEventListener('click', e => {
    e.stopPropagation();
    settings.hidden = !settings.hidden;
    gear.setAttribute('aria-expanded', String(!settings.hidden));
  });
  document.addEventListener('click', e => {
    if (!settings.hidden && !settings.contains(e.target)) { settings.hidden = true; gear.setAttribute('aria-expanded', 'false'); }
  });
  $('opt-hak').checked = !!prefs.hak;
  $('opt-hak').addEventListener('change', e => { prefs.hak = e.target.checked; lsSet(PREF_KEY, prefs); });
  $('tts-voice-select').addEventListener('change', e => {
    try { localStorage.setItem(VOICE_KEY, e.target.value); } catch {}
    voice = pickVoice();
    $('tts-name').textContent = '🔊 ' + (voice ? voice.name : 'Stem');
    utter('Hallo!', prefs.rate);
  });

  document.addEventListener('visibilitychange', () => { if (document.hidden) cancelAll(); });
  window.addEventListener('pagehide', cancelAll);

  // ── Voices (async load, same fallbacks as kids.html) ─────────────
  if ('speechSynthesis' in window) {
    populateVoices();
    window.speechSynthesis.addEventListener('voiceschanged', populateVoices);
    let tries = 0;
    const poll = setInterval(() => {
      if (window.speechSynthesis.getVoices().some(v => v.lang.startsWith('nl')) || ++tries >= 20) {
        clearInterval(poll); populateVoices();
      }
    }, 500);
    document.addEventListener('touchstart', () => { window.speechSynthesis.getVoices(); setTimeout(populateVoices, 200); }, { once: true });
  }

  // ── Init: probe l01.json, l02.json … until 404 ───────────────────
  (async function init() {
    try {
      pics = await fetch(BASE + 'pics.json').then(r => r.ok ? r.json() : {}).catch(() => ({}));
      for (let n = 1; ; n++) {
        const r = await fetch(`${BASE}l${String(n).padStart(2, '0')}.json`).catch(() => null);
        if (!r || !r.ok) break;
        lessons.push(await r.json());
      }
      renderHome();
    } catch (err) {
      $('tile-grid').textContent = 'Fout: ' + err.message;
    }
  }());

}());
