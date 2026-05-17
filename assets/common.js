'use strict';

/* ══════════════════════════════════════════════════════
   common.js  –  shared logic for index.html / vanstart.html
   Page-specific config is injected via initPage(config).
   ══════════════════════════════════════════════════════ */

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

volumeControl.addEventListener('input', () => {
    document.getElementById('volume-value').textContent = `${volumeControl.value}%`;
});

playStopButton.addEventListener('click', () => {
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
});

// Start game button — also closes the mobile drawer before the popup opens
document.getElementById('start-button').addEventListener('click', () => {
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

// Wire up selector change — save + apply + preview
document.addEventListener('DOMContentLoaded', () => {
    const sel = document.getElementById('tts-voice-select');
    if (!sel) return;
    sel.addEventListener('change', () => {
        localStorage.setItem(TTS_VOICE_KEY, sel.value);
        _applyVoiceFromSelector();
        speakText('Hallo, dit is een test.');
    });
});

/* Maximum ms to wait for a single utterance to finish before moving on.
   Guards against the Chrome bug where onend never fires. */
const TTS_MAX_MS = 20000;

function _buildUtterance(text, lang, rate, pitch) {
    const speech  = new SpeechSynthesisUtterance();
    speech.text   = text.replaceAll("'", '');
    speech.lang   = lang;
    speech.rate   = rate;
    speech.pitch  = pitch;
    speech.volume = volumeControl.value / 100;
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

    const speech = _buildUtterance(text, TTSLang, 0.8, 1);
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
        const speech = _buildUtterance(text, TTSLang, 0.8, 1);
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
}

function startSpelling() {
    isPlaying = true;
    playStopButton.innerHTML = '<div class="icon"></div><span>Stop</span>';
    spellNextWord();
}

function stopSpelling() {
    isPlaying = false;
    playStopButton.innerHTML = '<div class="icon"></div><span>Play</span>';
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
        item.textContent = file;
        item.addEventListener('click', () => {
            loadJsonData(file, reloadTable);
            document.getElementById('chapter').innerHTML = `(You are learning in ${file})`;
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
    loadJsonData(currentPage, reloadTable);
    document.getElementById('chapter').innerHTML = `(${currentPage})`;
}
