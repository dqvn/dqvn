'use strict';

/* ══════════════════════════════════════════════════════
   common.js  –  shared logic for index.html / vanstart.html
   Page-specific config is injected via initPage(config).
   ══════════════════════════════════════════════════════ */

/* ── TTS constants ── */
const TTSName    = 'Google Nederlands';
const TTSLang    = 'nl-NL';
const TTSLangENG = 'en-US';

/* ── Page config (set by initPage) ── */
let _storageKey   = 'curPage';
let _intervalTime = 12000;
let _fileNames    = [];
let _groupTitles  = new Map();

/* ── DOM references ── */
const tableBody           = document.getElementById('word-list-body');
const hideMeaningCheckbox = document.getElementById('hide-meaning');
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
hideMeaningCheckbox.addEventListener('change', () => {
    const hide = hideMeaningCheckbox.checked;
    document.querySelectorAll('.hide-text').forEach(el => {
        el.style.display = hide ? 'none' : 'initial';
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

// Footer year
document.getElementById('year').textContent = new Date().getFullYear();

// Reload voices when browser fires voiceschanged
window.speechSynthesis.onvoiceschanged = () => {
    googleNederlandsVoice = getPreferredVoice();
    console.log('[TTS] voice loaded:', googleNederlandsVoice?.name);
};

/* ══════════════════════════════════════════════════════
   FUNCTIONS
   ══════════════════════════════════════════════════════ */

function getPreferredVoice() {
    const voices = window.speechSynthesis.getVoices();
    return voices.find(v => v.name.includes('Microsoft Colette Online') && v.lang === 'nl-NL')
        || voices.find(v => v.name.includes('Google Nederlands')        && v.lang === 'nl-NL')
        || voices.find(v => v.lang === 'nl-NL')
        || null;
}

function speakText(text) {
    if (window.speechSynthesis.speaking) window.speechSynthesis.cancel();
    window.speechSynthesis.resume();

    const voices = window.speechSynthesis.getVoices();
    if (!voices.length) {
        document.getElementById('tts-name').textContent = 'No voices available!';
        return;
    }
    if (!googleNederlandsVoice) {
        googleNederlandsVoice =
            voices.find(v => v.name === TTSName && v.lang === TTSLang) ||
            voices.find(v => v.lang === TTSLang);
    }

    try {
        const speech = new SpeechSynthesisUtterance();
        if (googleNederlandsVoice) {
            speech.voice = googleNederlandsVoice;
            document.getElementById('tts-name').textContent = googleNederlandsVoice.name;
        }
        speech.lang   = TTSLang;
        speech.rate   = 0.8;
        speech.pitch  = 1;
        speech.volume = volumeControl.value / 100;
        speech.text   = text.replaceAll("'", '');
        speech.onerror = e => console.error('[TTS] error:', e.error);
        window.speechSynthesis.speak(speech);
    } catch (e) {
        console.error('[TTS] error:', e);
    }
}

function speakEngText(text) {
    const speech  = new SpeechSynthesisUtterance();
    speech.text   = text.replaceAll("'", '');
    speech.rate   = 0.9;
    speech.volume = volumeControl.value / 100;
    speech.voice  = window.speechSynthesis.getVoices()[0];
    window.speechSynthesis.speak(speech);
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
            <span style="font-size:.8em;">/${word.pronunciation?.ipa || ''}/ ~ /${word.pronunciation?.phonetic || ''}/</span>
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

    // Reset hide-meaning checkbox state (listener is wired once at the top)
    hideMeaningCheckbox.checked = false;
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
        document.querySelectorAll('.nested-list').forEach(l => l.classList.remove('open'));
        li.querySelector('.nested-list').classList.toggle('open');
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
