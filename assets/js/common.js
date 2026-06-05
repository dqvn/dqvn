'use strict';

/* ══════════════════════════════════════════════════════
   common.js  –  shared logic for startnl.html / vanstart.html
   Page-specific config is injected via initPage(config).
   ══════════════════════════════════════════════════════ */

/* ══════════════════════════════════════════════════════
   APP LAUNCHER CONFIG
   To add a new tool: append one object here. Nothing else.
   Fields: id, label, icon, href, desc, group, color
   ══════════════════════════════════════════════════════ */
const APPS = [
  { id:'vocab',     label:'Vocabulaire', icon:'📖', href:'/startnl',      desc:'Woordenlijst & flashcards',      group:'📚 Woordenschat', color:'#2563eb' },
  { id:'vanstart',  label:'VanStart',    icon:'🚀', href:'/vanstart',     desc:'NT2 beginnerscursus',            group:'📚 Woordenschat', color:'#059669' },
  { id:'kids',      label:'Kids',        icon:'🧒', href:'/kids',         desc:'Kinderen woordenschat',          group:'📚 Woordenschat', color:'#16a34a' },
  { id:'stories',   label:'Verhalen',    icon:'📕', href:'/stories',      desc:'Leer door verhalen te lezen',    group:'📚 Woordenschat', color:'#6A67CE' },
  { id:'klanken',   label:'Klanken',     icon:'🎵', href:'/klanken',      desc:'Nederlandse uitspraak leren',   group:'🎙️ Uitspreken',   color:'#7c3aed' },
  { id:'dialogues', label:'Dialogues',   icon:'💬', href:'/dialogues',    desc:'Gespreks oefening met TTS',     group:'🎙️ Uitspreken',   color:'#0891b2' },
  { id:'grammar',   label:'Grammar',     icon:'📚', href:'/grammar',      desc:'Grammatica regels & uitleg',    group:'📖 Grammatica',   color:'#b45309' },
  { id:'verbs',     label:'Verbs',       icon:'🔄', href:'/verbs',        desc:'Nederlandse werkwoorden',       group:'📖 Grammatica',   color:'#dc2626' },
];

function openLauncher() {
  const el = document.getElementById('app-launcher');
  if (!el) return;
  el.classList.remove('al-hidden');
  document.body.style.overflow = 'hidden';
  el.querySelector('.al-close-btn')?.focus();
}
function closeLauncher() {
  const el = document.getElementById('app-launcher');
  if (!el) return;
  el.classList.add('al-hidden');
  document.body.style.overflow = '';
}

function initAppLauncher() {
  const body = document.getElementById('al-body');
  if (!body) return;

  const page = location.pathname.replace(/^\//, '').replace(/\.html$/, '') || '';

  /* Group apps by their 'group' key, preserving insertion order */
  const groups = {};
  APPS.forEach(app => { (groups[app.group] ??= []).push(app); });

  /* Portal home link at the top */
  const homeHtml = `
    <div class="al-home-row">
      <a href="/" class="al-home-btn${page === '' ? ' al-current' : ''}">
        🏠&nbsp; Terug naar Portaal
      </a>
    </div>`;

  body.innerHTML = homeHtml + Object.entries(groups).map(([grp, apps]) => `
    <div class="al-group-label">${grp}</div>
    <div class="al-cards">
      ${apps.map(app => `
        <a href="${app.href}" class="al-card${page === app.href ? ' al-current' : ''}"
           style="--ac:${app.color}" title="${app.desc}">
          <span class="al-card-icon">${app.icon}</span>
          <div class="al-card-name">${app.label}</div>
          <div class="al-card-desc">${app.desc}</div>
        </a>`).join('')}
    </div>`).join('');

  /* Sync button count badge */
  const badge = document.querySelector('.lm-launcher-count');
  if (badge) badge.textContent = APPS.length;

  /* Close on Escape */
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeLauncher(); }, { once: false });
}

/* ── TTS constants ── */
const TTSName        = 'Google Nederlands';
const TTSLang        = 'nl-NL';
const TTSLangENG     = 'en-US';
const TTS_VOICE_KEY  = 'nl_tts_voice_v1';

/* ── Page config (set by initPage) ── */
let _storageKey   = 'curPage';
let _intervalTime = 12000;
let _fileNames    = [];
let _groupTitles  = new Map();

/* ── Volume ── */
const VOL_KEY = 'nl_vocab_vol';

function _initVolume() {
    try {
        const saved = JSON.parse(localStorage.getItem(VOL_KEY));
        if (saved && typeof saved.v === 'number') {
            if (volumeControl) volumeControl.value = saved.v;
            const lbl = document.getElementById('volume-value');
            if (lbl) lbl.textContent = `${saved.v}%`;
        }
    } catch {}
}

/* ── Vocabulary font-size control ── */
const VOCAB_FS_STEPS  = [14, 18, 23, 28, 34, 42];
const VOCAB_FS_LABELS = ['Tiny', 'Small', 'Normal', 'Large', 'X-Large', 'Huge'];
const VOCAB_FS_KEY    = 'nl_vocab_fs';
let   _vocabFsIdx     = 2; // default: Normal (23 px)

function applyVocabFontSize(idx) {
    _vocabFsIdx = Math.max(0, Math.min(VOCAB_FS_STEPS.length - 1, idx));
    document.documentElement.style.setProperty('--vocab-word-size', VOCAB_FS_STEPS[_vocabFsIdx] + 'px');
    const lbl = document.getElementById('lm-fs-val');
    if (lbl) lbl.textContent = VOCAB_FS_LABELS[_vocabFsIdx];
    const dec = document.getElementById('lm-fs-dec');
    const inc = document.getElementById('lm-fs-inc');
    if (dec) dec.disabled = _vocabFsIdx === 0;
    if (inc) inc.disabled = _vocabFsIdx === VOCAB_FS_STEPS.length - 1;
    try { localStorage.setItem(VOCAB_FS_KEY, String(_vocabFsIdx)); } catch {}
}

/* ── DOM references ── */
const tableBody           = document.getElementById('word-list-body');
const hideMeaningBtn      = document.getElementById('hide-meaning-btn');
let   hideMeaning         = false;
const volumeControl       = document.getElementById('volume-control');
const playStopButton      = document.getElementById('playStopButton');

/* ── Runtime state ── */
const recentNumbers = [];
let wordList              = [];
let googleNederlandsVoice = null;
let isPlaying             = false;
let currentInterval       = null;

/* ══════════════════════════════════════════════════════
   EVENT LISTENERS  (wired once, not per reloadTable call)
   ══════════════════════════════════════════════════════ */

volumeControl?.addEventListener('input', () => {
    const val = parseInt(volumeControl.value, 10);
    const lbl = document.getElementById('volume-value');
    if (lbl) lbl.textContent = `${val}%`;
    try { localStorage.setItem(VOL_KEY, JSON.stringify({ v: val, t: Date.now() })); } catch {}
});

playStopButton?.addEventListener('click', () => {
    if (!isPlaying) startSpelling(); else stopSpelling();
});

// Hide-meaning toggle — registered once here, not inside reloadTable
hideMeaningBtn.addEventListener('click', () => {
    hideMeaning = !hideMeaning;
    hideMeaningBtn.textContent = hideMeaning ? '🙈' : '👁️';
    hideMeaningBtn.classList.toggle('hdr-toggle-btn--active', hideMeaning);
    document.querySelectorAll('.hide-text').forEach(el => {
        el.style.display = hideMeaning ? 'none' : '';
    });
});

// Toggle sidebar menu
(function setupToggleMenu() {
    const toggleButton = document.getElementById('toggle-menu-button');
    const container    = document.querySelector('.container');
    if (!toggleButton || !container) return;
    const icon = toggleButton.querySelector('.icon');

    // Backdrop for mobile drawer
    const backdrop = document.createElement('div');
    backdrop.classList.add('mobile-menu-backdrop');
    container.appendChild(backdrop);

    const isMobile = () => window.innerWidth <= 768;

    function setMenuState(hidden) {
        container.classList.toggle('menu-hidden', hidden);
        icon.innerHTML = hidden ? '▶' : '☰';
        toggleButton.setAttribute('aria-expanded', String(!hidden));
    }

    // On mobile: start with menu closed; on desktop: start open
    setMenuState(isMobile());

    backdrop.addEventListener('click', () => setMenuState(true));

    toggleButton.addEventListener('click', () => {
        setMenuState(!container.classList.contains('menu-hidden'));
    });
})();

// NoSleep — keep screen on
document.addEventListener('DOMContentLoaded', () => {
    const noSleep = new NoSleep();
    noSleep.enable();

    // Font size init
    const savedFs = parseInt(localStorage.getItem(VOCAB_FS_KEY));
    applyVocabFontSize(isNaN(savedFs) ? 2 : savedFs);
    document.getElementById('lm-fs-dec')?.addEventListener('click', () => applyVocabFontSize(_vocabFsIdx - 1));
    document.getElementById('lm-fs-inc')?.addEventListener('click', () => applyVocabFontSize(_vocabFsIdx + 1));
});

// Start game button — also closes the mobile drawer before the popup opens
document.getElementById('start-button')?.addEventListener('click', () => {
    if (window.innerWidth <= 768) {
        const container = document.querySelector('.container');
        const icon      = document.querySelector('.toggle-menu-button .icon');
        if (container) {
            container.classList.add('menu-hidden');
            if (icon) icon.innerHTML = '▶';
        }
    }
    showQuestion();
});

// Footer year — use optional chaining; the #year element was removed from HTML
const _lmYear = document.getElementById('lm-year');
if (_lmYear) _lmYear.textContent = new Date().getFullYear();

/* ── Voice initialisation ──────────────────────────────────────────────────
   Firefox / Safari return voices synchronously on the first getVoices() call.
   Chrome loads them asynchronously and fires 'voiceschanged'.
   iOS Safari may not expose voices at all until the first user gesture.
   Strategy:
     1. Try sync population immediately (works on Firefox / Safari desktop).
     2. Listen for voiceschanged (works on Chrome / Android).
     3. Poll every 500 ms for up to 10 s as a fallback (iOS Safari).
     4. Re-probe on first touchstart (iOS requires a user gesture).
   ──────────────────────────────────────────────────────────────────────────── */
googleNederlandsVoice = getPreferredVoice();
_populateVoiceSelector();

const _voicesReadyPromise = (() => {
    if (window.speechSynthesis.getVoices().length) return Promise.resolve();
    return new Promise(resolve => {
        window.speechSynthesis.addEventListener('voiceschanged', resolve, { once: true });
        setTimeout(resolve, 3000);
    });
})();

// voiceschanged fires on Chrome / Android
window.speechSynthesis.addEventListener('voiceschanged', () => {
    googleNederlandsVoice = getPreferredVoice();
    _populateVoiceSelector();
    console.log('[TTS] voice ready:', googleNederlandsVoice?.name);
});

// Polling fallback — catches iOS Safari where voiceschanged is unreliable
(function _pollForVoices() {
    let tries = 0;
    const timer = setInterval(() => {
        const dutch = window.speechSynthesis.getVoices().filter(v => v.lang.startsWith('nl'));
        if (dutch.length || ++tries >= 20) {
            clearInterval(timer);
            if (dutch.length) {
                googleNederlandsVoice = getPreferredVoice();
                _populateVoiceSelector();
            }
        }
    }, 500);
}());

// iOS: voices become available after first user gesture — re-probe on first touch
document.addEventListener('touchstart', function _iosVoiceProbe() {
    window.speechSynthesis.getVoices();       // prod the API
    setTimeout(_populateVoiceSelector, 200);  // slight delay for browser to respond
}, { once: true });

// Chrome silently pauses TTS when the tab goes to the background; resume on focus
document.addEventListener('visibilitychange', () => {
    if (!document.hidden && window.speechSynthesis.paused) {
        window.speechSynthesis.resume();
    }
});

/* ══════════════════════════════════════════════════════
   FUNCTIONS
   ══════════════════════════════════════════════════════ */

function getPreferredVoice() {
    const voices = window.speechSynthesis.getVoices();
    const saved  = localStorage.getItem(TTS_VOICE_KEY);
    if (saved) {
        const match = voices.find(v => v.name === saved);
        if (match) return match;
    }
    return voices.find(v => v.name.includes('Microsoft Colette Online') && v.lang === 'nl-NL')
        || voices.find(v => v.name.includes('Google Nederlands')        && v.lang === 'nl-NL')
        || voices.find(v => v.lang === 'nl-NL')
        || voices.find(v => v.lang === 'nl-BE')
        || voices.find(v => v.lang.startsWith('nl'))
        || null;
}

/* ── TTS voice selector ────────────────────────────────────────────────────
   Populates #tts-voice-select with all Dutch voices found in the system,
   restores any saved preference from localStorage, and wires up the
   change handler to save + apply the selection immediately.
   ──────────────────────────────────────────────────────────────────────── */
function _populateVoiceSelector() {
    const sel = document.getElementById('tts-voice-select');
    if (!sel) return;

    const all    = window.speechSynthesis.getVoices();
    const dutch  = all.filter(v => v.lang.startsWith('nl'));
    const saved  = localStorage.getItem(TTS_VOICE_KEY);

    sel.innerHTML = '';

    if (!dutch.length) {
        const opt = document.createElement('option');
        opt.textContent = 'No Dutch voices found';
        opt.disabled = true;
        sel.appendChild(opt);
        return;
    }

    dutch.forEach(v => {
        const opt   = document.createElement('option');
        opt.value   = v.name;
        const flag  = v.lang === 'nl-BE' ? '🇧🇪' : '🇳🇱';
        const local = v.localService ? '💻' : '☁️';
        opt.textContent = `${flag} ${local} ${v.name}`;
        sel.appendChild(opt);
    });

    // Restore saved or fall back to auto-preferred
    const preferred = getPreferredVoice();
    sel.value = saved && dutch.find(v => v.name === saved) ? saved
              : (preferred ? preferred.name : dutch[0].name);

    _applyVoiceFromSelector();
}

function _applyVoiceFromSelector() {
    const sel = document.getElementById('tts-voice-select');
    if (!sel || !sel.value) return;
    const voices = window.speechSynthesis.getVoices();
    const found  = voices.find(v => v.name === sel.value);
    if (found) {
        googleNederlandsVoice = found;
        const nameEl = document.getElementById('tts-name');
        if (nameEl) nameEl.textContent = found.name;
    }
}

/* ── Lazy-load puter.js (AI) only when a game actually opens ─────────────
   Keeps the page fast: puter (~heavy CDN script) is never fetched unless
   the user clicks Start Game or Flashcards Game.
   loadPuter() returns a Promise that resolves once window.puter is ready.
   ─────────────────────────────────────────────────────────────────────── */
let _puterPromise   = null;
let _puterAvailable = null; // null=unknown, true=loaded, false=blocked/unavailable

function loadPuter() {
    if (window.puter)          return Promise.resolve();  // already loaded
    if (_puterAvailable===false) return Promise.reject(new Error('puter unavailable'));
    if (_puterPromise)          return _puterPromise;     // load in progress

    // puter.js needs a CommonJS shim in plain browser environments
    if (typeof require === 'undefined') {
        window.require = mod => window[mod] || {};
        if (typeof module === 'undefined') window.module = { exports: {} };
    }

    _puterPromise = new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = 'https://js.puter.com/v2/';
        s.onload  = () => { _puterAvailable = true;  resolve(); };
        s.onerror = () => { _puterAvailable = false; reject(new Error('puter.js blocked or unavailable')); };
        document.head.appendChild(s);
    });

    return _puterPromise;
}

// Wire up selector change — save + apply + preview
document.addEventListener('DOMContentLoaded', () => {
    _initVolume();
    const sel = document.getElementById('tts-voice-select');
    if (sel) {
        sel.addEventListener('change', () => {
            localStorage.setItem(TTS_VOICE_KEY, sel.value);
            _applyVoiceFromSelector();
            speakText('Hallo, dit is een test.');
        });
    }
    initAppLauncher();

    // Intercept game buttons in capture phase so puter.js is loaded first.
    // Once loaded we re-dispatch the click — game.js's bubble-phase handler
    // then fires normally with window.puter already available.
    ['start-button', 'flashcard-btn'].forEach(id => {
        const btn = document.getElementById(id);
        if (!btn) return;

        btn.addEventListener('click', async e => {
            if (window.puter || _puterAvailable === false) return; // loaded or known-blocked — let game.js handle
            e.stopImmediatePropagation();       // block game.js for now

            const textEl = btn.querySelector('.button-text');
            const orig   = textEl?.textContent ?? '';
            if (textEl) textEl.textContent = 'Laden…';
            btn.disabled = true;

            try   { await loadPuter(); }
            catch { /* puter unavailable — game.js will handle gracefully */ }

            btn.disabled = false;
            if (textEl) textEl.textContent = orig;
            btn.click();                        // re-dispatch; puter now present
        }, true /* capture phase, runs before game.js */);
    });
});

/* Maximum ms to wait for a single utterance to finish before moving on.
   Guards against the Chrome bug where onend never fires. */
const TTS_MAX_MS    = 20000;
const TTS_RATE_KEY  = 'nl_tts_rate';   // shared speed setting (0.5 – 1.5, default 0.8)

function _getTTSRate() {
    try {
        const v = parseFloat(localStorage.getItem(TTS_RATE_KEY));
        return isNaN(v) ? 0.8 : Math.min(1.5, Math.max(0.5, v));
    } catch { return 0.8; }
}

function _buildUtterance(text, lang, rate, pitch) {
    const speech  = new SpeechSynthesisUtterance();
    speech.text   = text.replaceAll("'", '');
    speech.lang   = lang;
    speech.rate   = rate;
    speech.pitch  = pitch;
    speech.volume = volumeControl ? volumeControl.value / 100 : 0.7;
    return speech;
}

function speakText(text) {
    if (window.speechSynthesis.speaking) window.speechSynthesis.cancel();
    window.speechSynthesis.resume();

    const voices = window.speechSynthesis.getVoices();
    if (!voices.length) {
        document.getElementById('tts-name').textContent = 'Voices loading…';
        return;
    }
    if (!googleNederlandsVoice) googleNederlandsVoice = getPreferredVoice();

    const speech = _buildUtterance(text, TTSLang, _getTTSRate(), 1);
    if (googleNederlandsVoice) {
        speech.voice = googleNederlandsVoice;
        document.getElementById('tts-name').textContent = googleNederlandsVoice.name;
    }
    speech.onerror = e => { if (e.error !== 'canceled') console.error('[TTS] error:', e.error); };
    try { window.speechSynthesis.speak(speech); } catch (e) { console.error('[TTS] speak failed:', e); }
}

function speakEngText(text) {
    if (window.speechSynthesis.speaking) window.speechSynthesis.cancel();
    window.speechSynthesis.resume();
    const speech = _buildUtterance(text, TTSLangENG, 0.9, 1);
    const voices = window.speechSynthesis.getVoices();
    if (voices.length) speech.voice = voices[0];
    speech.onerror = e => { if (e.error !== 'canceled') console.error('[TTS] error:', e.error); };
    try { window.speechSynthesis.speak(speech); } catch (e) { console.error('[TTS] speak failed:', e); }
}

/* ── Promise-based TTS ─────────────────────────────────────────────────────
   Awaits _voicesReadyPromise so Chrome async voice loading never causes a
   silent skip.  A TTS_MAX_MS timeout guards against the Chrome bug where
   onend never fires (tab backgrounded, cloud voice network issue, etc.).
   Both onend and onerror (including 'canceled') always resolve the promise
   so the caller is never permanently suspended.
   ──────────────────────────────────────────────────────────────────────── */
async function speakTextAsync(text) {
    await _voicesReadyPromise;                        // wait for Chrome async voice load
    if (!googleNederlandsVoice) googleNederlandsVoice = getPreferredVoice();

    if (window.speechSynthesis.speaking) window.speechSynthesis.cancel();
    window.speechSynthesis.resume();

    const voices = window.speechSynthesis.getVoices();
    if (!voices.length) return;                       // still no voices — skip silently

    return new Promise(resolve => {
        const speech = _buildUtterance(text, TTSLang, _getTTSRate(), 1);
        if (googleNederlandsVoice) {
            speech.voice = googleNederlandsVoice;
            document.getElementById('tts-name').textContent = googleNederlandsVoice.name;
        }

        const guard = setTimeout(() => {
            console.warn('[TTS] utterance timed out — forcing next step');
            window.speechSynthesis.cancel();
            resolve();
        }, TTS_MAX_MS);

        const done = () => { clearTimeout(guard); resolve(); };
        speech.onend   = done;
        speech.onerror = (e) => {
            if (e.error !== 'canceled') console.error('[TTS] error:', e.error);
            clearTimeout(guard);
            resolve();
        };
        try { window.speechSynthesis.speak(speech); }
        catch (e) { console.error('[TTS] speak failed:', e); clearTimeout(guard); resolve(); }
    });
}

async function speakEngTextAsync(text) {
    await _voicesReadyPromise;

    if (window.speechSynthesis.speaking) window.speechSynthesis.cancel();
    window.speechSynthesis.resume();

    return new Promise(resolve => {
        const speech = _buildUtterance(text, TTSLangENG, 0.9, 1);
        const voices = window.speechSynthesis.getVoices();
        if (voices.length) speech.voice = voices[0];

        const guard = setTimeout(() => { window.speechSynthesis.cancel(); resolve(); }, TTS_MAX_MS);
        const done  = () => { clearTimeout(guard); resolve(); };
        speech.onend   = done;
        speech.onerror = () => { clearTimeout(guard); resolve(); };
        try { window.speechSynthesis.speak(speech); }
        catch (e) { clearTimeout(guard); resolve(); }
    });
}

function loadJsonData(filename, callback) {
    localStorage.setItem(_storageKey, filename);
    localStorage.setItem('fc-lesson', filename); // unified key read by flashcard.js
    const xhr = new XMLHttpRequest();
    xhr.open('GET', `data/vocabularies/${filename}.json`, true);
    xhr.onload = function () {
        if (xhr.status === 200) {
            const data = JSON.parse(xhr.responseText);
            wordList = data;
            callback(data);
        } else {
            console.error('[JSON] load error:', xhr.status, filename);
        }
    };
    xhr.send();
}

/* ══════════════════════════════════════════════════════
   WORD STATUS BADGES (flashcard SM-2 progress → table)
   ══════════════════════════════════════════════════════ */
function _wordBadge(st) {
    if (!st)                              return { icon: '🌟', label: 'New',    cls: 'wb-new'      };
    if (st.state === 'relearning')        return { icon: '🥵', label: 'Hard',   cls: 'wb-hard'     };
    if (st.state === 'learning')          return { icon: '🧠', label: 'Learn',  cls: 'wb-learning' };
    if ((st.interval || 0) >= 21)        return { icon: '✅', label: 'Master', cls: 'wb-mastered' };
    return                                       { icon: '🔃', label: 'Review', cls: 'wb-review'   };
}

function updateWordBadges() {
    try {
        const allProg = JSON.parse(localStorage.getItem('nl_srs_v3') || '{}');
        const chId    = localStorage.getItem('fc-lesson') || 'default';
        const chProg  = allProg[chId] || {};

        document.querySelectorAll('.dutch-word').forEach(el => {
            const td = el.closest('td');
            if (!td) return;
            td.querySelectorAll('.word-badge').forEach(b => b.remove());

            const word = el.textContent.trim();
            const ws   = chProg[word];
            const { icon, label, cls } = _wordBadge(ws);

            const badge = document.createElement('span');
            badge.className = `word-badge ${cls}`;
            badge.title = `Flashcard: ${label}`;
            badge.innerHTML = `<span class="wb-icon">${icon}</span><span class="wb-lbl">${label}</span>`;
            td.appendChild(badge);
        });
    } catch(e) { console.warn('[badges]', e); }
}

// Refresh badges when flashcard session saves progress (same tab)
window.addEventListener('storage', e => {
    if (e.key === 'nl_srs_v3') updateWordBadges();
});

function reloadTable(data) {
    recentNumbers.length = 0;
    tableBody.innerHTML  = '';

    data.forEach((word, index) => {
        const row = document.createElement('tr');
        row.innerHTML = `
          <td>${index + 1}</td>
          <td onclick="speakText('${word.dutch?.replace(/'/g, '')}')">
            <span class="dutch-word" data-index="${index}">${word.dutch}</span><br/>
            <span class="ipa-text" style="font-size:.8em;">/${word.pronunciation?.ipa || ''}/ ~ /${word.pronunciation?.phonetic || ''}/</span>
          </td>
          <td onclick="speakEngText('${word.english?.replace(/'/g, '')}')">
            <span class="hide-text">${word.english}</span>
          </td>
          <td onclick="speakText('${word.dutchsentence?.replace(/'/g, '')}')">
            <span>${word.dutchsentence}</span><br/>
            <span class="hide-text" style="color:#3f3838ff;opacity:.3">${word.englishtranslate}</span>
          </td>
          <td><span class="hide-text" style="font-size:.7em">${word.vietnamese?.replace(/'/g, '')}</span></td>`;
        tableBody.appendChild(row);
    });

    // Spacer rows so the last items scroll comfortably to the top
    for (let i = 0; i < 100; i++) {
        const row = document.createElement('tr');
        row.innerHTML = '<td></td><td></td><td></td><td></td><td></td>';
        tableBody.appendChild(row);
    }

    // Reset hide-meaning state when a new lesson loads
    hideMeaning = false;
    hideMeaningBtn.textContent = '👁️';
    hideMeaningBtn.classList.remove('hdr-toggle-btn--active');
    document.querySelectorAll('.hide-text').forEach(el => { el.style.display = ''; });

    updateWordBadges();
}

function startSpelling() {
    isPlaying = true;
    if (playStopButton) playStopButton.innerHTML = '<div class="icon"></div><span>Stop</span>';
    spellNextWord();
}

function stopSpelling() {
    isPlaying = false;
    if (playStopButton) playStopButton.innerHTML = '<div class="icon"></div><span>Play</span>';
    clearTimeout(currentInterval);   // was clearInterval in original — fixed
}

function spellNextWord() {
    const idx     = getNewRandomNumberCSPRNG(0, wordList.length - 1, recentNumbers);
    const wordNL  = wordList[idx].dutch;
    const sample  = wordList[idx].dutchsentence;
    const rowPrev = tableBody.children[idx === 0 ? 0 : idx - 1];
    const rowMain = tableBody.children[idx];

    recentNumbers.push(idx);
    if (recentNumbers.length > wordList.length * 0.9) recentNumbers.shift();

    Array.from(tableBody.children).forEach(r => r.classList.remove('highlighted-row'));
    rowPrev.scrollIntoView({ block: 'start' });
    rowMain.classList.add('highlighted-row');

    speakText(wordNL);
    setTimeout(() => speakText(sample), 3500);

    if (isPlaying) currentInterval = setTimeout(spellNextWord, _intervalTime);
}

function getRandomNumberCSPRNG(min, max) {
    const arr = new Uint32Array(1);
    window.crypto.getRandomValues(arr);
    return (arr[0] % (max - min + 1)) + min;
}

function getNewRandomNumberCSPRNG(min, max, exclude) {
    const arr = new Uint32Array(1);
    let n;
    do {
        window.crypto.getRandomValues(arr);
        n = (arr[0] % (max - min + 1)) + min;
    } while (exclude.includes(n));
    return n;
}

function setActiveLesson(filename) {
    document.querySelectorAll('#file-list [data-file]').forEach(el => {
        const isActive = el.dataset.file === filename;
        el.classList.toggle('active-lesson', isActive);
        if (isActive) {
            // ensure the parent group is open
            const nested = el.closest('.nested-list');
            if (nested) {
                document.querySelectorAll('.nested-list').forEach(l => l.classList.remove('open'));
                nested.classList.add('open');
            }
        }
    });
}

function createGroup(groupKey, files) {
    const li    = document.createElement('li');
    const title = document.createElement('div');
    title.classList.add('group-title');
    title.textContent = _groupTitles.get(groupKey) || groupKey;
    title.addEventListener('click', () => {
        const nested = li.querySelector('.nested-list');
        const wasOpen = nested.classList.contains('open');
        document.querySelectorAll('.nested-list').forEach(l => l.classList.remove('open'));
        if (!wasOpen) nested.classList.add('open');
    });

    const ul = document.createElement('ul');
    ul.classList.add('nested-list');
    files.forEach(file => {
        const item = document.createElement('li');
        item.dataset.file = file;
        item.textContent = file;
        item.addEventListener('click', () => {
            loadJsonData(file, reloadTable);
            document.getElementById('chapter').innerHTML = `(You are learning in ${file})`;
            setActiveLesson(file);
        });
        ul.appendChild(item);
    });

    li.appendChild(title);
    li.appendChild(ul);
    return li;
}

function createLeftMenu() {
    const container    = document.getElementById('file-list');
    const groupedFiles = {};
    [..._fileNames].sort().forEach(file => {
        const key = file.substring(0, 2);
        if (!groupedFiles[key]) groupedFiles[key] = [];
        groupedFiles[key].push(file);
    });
    for (const key in groupedFiles) {
        container.appendChild(createGroup(key, groupedFiles[key]));
    }
}

/* ══════════════════════════════════════════════════════
   initPage  –  called by each page-specific script
   ══════════════════════════════════════════════════════ */
function initPage(config) {
    _fileNames    = config.fileNames;
    _groupTitles  = config.groupTitles;
    _storageKey   = config.storageKey;
    _intervalTime = config.intervalTime;

    const currentPage = localStorage.getItem(_storageKey) || _fileNames[0];
    createLeftMenu();
    setActiveLesson(currentPage);
    loadJsonData(currentPage, reloadTable);
    document.getElementById('chapter').innerHTML = `(${currentPage})`;
}
