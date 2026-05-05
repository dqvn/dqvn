'use strict';

/* ─── Role colours (A B C D E) ─── */
const RC = ['#2563eb', '#e85d04', '#16a34a', '#9333ea', '#0891b2'];
function roleColor(key) {
    if (!current) return RC[0];
    const idx = Object.keys(current.roles).indexOf(key);
    return RC[idx >= 0 ? idx % RC.length : 0];
}

/* ─── State ─── */
let dialogues = [], current = null, myRole = null, soloMode = false;
let ttsSpeed = 0.88, lastTTSLine = -1;
const tts = { active: false, line: 0, waitUser: false };

/* ─── Utility ─── */
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function ytId(url) {
    if (!url) return null;
    const m = url.match(/(?:shorts\/|v=|youtu\.be\/)([A-Za-z0-9_-]{11})/);
    return m ? m[1] : null;
}

/* ─── Drawer (mobile sidebar) ─── */
function openDrawer() {
    document.getElementById('sidebar').classList.add('open');
    document.getElementById('drawer-overlay').classList.add('on');
    document.body.style.overflow = 'hidden';
}
function closeDrawer() {
    document.getElementById('sidebar').classList.remove('open');
    document.getElementById('drawer-overlay').classList.remove('on');
    document.body.style.overflow = '';
}

document.getElementById('mob-menu-btn').addEventListener('click', openDrawer);
document.getElementById('drawer-overlay').addEventListener('click', closeDrawer);

/* Search toggle button on mob-bar focuses the search input in the drawer */
document.getElementById('mob-search-btn').addEventListener('click', () => {
    openDrawer();
    setTimeout(() => document.getElementById('search-input').focus(), 320);
});

/* ─── Search / filter ─── */
const searchInput = document.getElementById('search-input');
const searchClear = document.getElementById('search-clear');

searchInput.addEventListener('input', () => {
    const q = searchInput.value.trim();
    searchClear.style.display = q ? 'block' : 'none';
    renderSidebar(filterDialogues(q));
});

searchClear.addEventListener('click', () => {
    searchInput.value = '';
    searchClear.style.display = 'none';
    searchInput.focus();
    renderSidebar(dialogues);
});

function filterDialogues(query) {
    if (!query) return dialogues;
    const q = query.toLowerCase();
    return dialogues.filter(d =>
        d.id.toLowerCase().includes(q) ||
        d.dialogue_title.toLowerCase().includes(q)
    );
}

/* ─── File discovery ─── */
async function discover() {
    const prefixes = ['a', 'b', 'c', 'd', 'e'];
    const found = [];
    if (location.protocol === 'file:') {
        document.getElementById('file-notice').style.display = 'inline-flex';
    }
    for (const p of prefixes) {
        for (let n = 1; n <= 200; n++) {
            const id = p + String(n).padStart(3, '0');
            try {
                const r = await fetch(`data/dialogues/${id}.json`);
                if (!r.ok) break;
                const d = await r.json();
                found.push({ id, ...d });
            } catch { break; }
        }
    }
    return found;
}

/* ─── Sidebar render ─── */
function renderSidebar(list) {
    const el = document.getElementById('dlg-list');
    if (!list.length) {
        el.innerHTML = '<div class="sb-no-results">Geen resultaten / No results</div>';
        return;
    }
    el.innerHTML = list.map(d => `
        <div class="dlg-item${current && current.id === d.id ? ' active' : ''}" data-id="${esc(d.id)}">
          <div class="dlg-id">${esc(d.id)}</div>
          <div class="dlg-name">${esc(d.dialogue_title)}</div>
        </div>`).join('');
    el.querySelectorAll('.dlg-item').forEach(item =>
        item.addEventListener('click', () => {
            const d = dialogues.find(x => x.id === item.dataset.id);
            if (d) { loadDialogue(d); closeDrawer(); }
        })
    );
}

/* ─── Load dialogue ─── */
function loadDialogue(d) {
    stopTTS();
    current = d; myRole = null; soloMode = false;

    // Keep search results but update active state
    const q = searchInput.value.trim();
    renderSidebar(filterDialogues(q));

    // Update mobile top bar label
    document.getElementById('mob-cur').textContent = d.dialogue_title;

    document.getElementById('welcome').style.display = 'none';
    document.getElementById('view').style.display = 'flex';

    document.getElementById('dlg-title').textContent = d.dialogue_title;
    document.getElementById('dlg-lang').textContent = d.language || 'Nederlands';

    // Video
    const wrap = document.getElementById('yt-wrap');
    const vid = ytId(d.video_url);
    wrap.innerHTML = vid
        ? `<iframe src="https://www.youtube.com/embed/${vid}?rel=0" allow="accelerometer;autoplay;clipboard-write;encrypted-media;gyroscope;picture-in-picture" allowfullscreen></iframe>`
        : `<div id="yt-ph"><svg viewBox="0 0 24 24" width="36" height="36" fill="currentColor"><path d="M8 5v14l11-7z"/></svg><span>No video</span></div>`;

    renderRoles(d.roles);
    document.getElementById('tts-toggle').checked = false;
    document.getElementById('tts-bar').style.display = 'none';
    document.getElementById('speed-row').style.display = 'none';
    renderConv();
}

/* ─── Roles ─── */
function renderRoles(roles) {
    const grid = document.getElementById('roles-grid');
    grid.innerHTML = Object.entries(roles).map(([k, name], i) => `
        <div class="role-btn" data-role="${esc(k)}">
          <div class="rb-key" style="color:${RC[i % RC.length]}">${esc(k)}</div>
          <div class="rb-name">${esc(name)}</div>
        </div>`).join('');
    grid.querySelectorAll('.role-btn').forEach(btn =>
        btn.addEventListener('click', () => pickRole(btn.dataset.role))
    );
}

function pickRole(role) {
    myRole = role;
    const color = roleColor(role);
    document.querySelectorAll('.role-btn').forEach(btn => {
        const sel = btn.dataset.role === role;
        btn.classList.toggle('sel', sel);
        btn.style.background = sel ? color : '';
    });
    renderConv();
    if (soloMode) setMsg('Klaar — klik ▶ Start');
}

/* ─── Conversation render ─── */
function renderConv(activeLine = -1, doneUpTo = -1) {
    if (!current) return;
    const conv = current.conversation;

    document.getElementById('conv-list').innerHTML = conv.map((line, i) => {
        const color = roleColor(line.role);
        const isMyL = myRole && line.role === myRole;
        const isDone = i < doneUpTo;
        const isAct = i === activeLine;

        const cls = ['c-line',
            isAct ? 'is-active' : isDone ? 'is-done' : isMyL ? 'is-mine' : ''
        ].filter(Boolean).join(' ');

        const showFull = !myRole || isMyL || isAct || isDone;
        const body = showFull
            ? `<div class="c-text">${esc(line.text)}</div><div class="c-trans">${esc(line.translation)}</div>`
            : `<div class="c-wait"><div class="c-dots"><span></span><span></span><span></span></div>
               <span>${esc(current.roles[line.role] || line.role)} aan het woord…</span></div>`;

        return `<div class="${cls}" id="cl-${i}">
          <div class="c-badge" style="background:${color}" title="${esc(current.roles[line.role] || line.role)}">${esc(line.role)}</div>
          <div class="c-body">${body}</div>
        </div>`;
    }).join('');
}

/* Live update during TTS (no full re-render → no scroll jump) */
function updateConv(activeLine) {
    if (!current) return;
    current.conversation.forEach((line, i) => {
        const el = document.getElementById(`cl-${i}`);
        if (!el) return;
        const isDone = i < activeLine;
        const isAct = i === activeLine;
        const isMyL = myRole && line.role === myRole;

        el.classList.remove('is-active', 'is-done', 'is-mine');
        if (isAct)       el.classList.add('is-active');
        else if (isDone) el.classList.add('is-done');
        else if (isMyL)  el.classList.add('is-mine');

        if ((isAct || isDone) && el.querySelector('.c-wait')) {
            el.querySelector('.c-body').innerHTML =
                `<div class="c-text">${esc(line.text)}</div><div class="c-trans">${esc(line.translation)}</div>`;
        }
    });
}

/* ─── TTS mode toggle ─── */
document.getElementById('tts-toggle').addEventListener('change', e => {
    soloMode = e.target.checked;
    const bar = document.getElementById('tts-bar');
    const spRow = document.getElementById('speed-row');
    if (soloMode) {
        bar.style.display = 'flex';
        spRow.style.display = 'flex';
        show('btn-start');
        hide('btn-done');
        hide('btn-repeat');
        hide('btn-stop');
        setWave(false);
        resetProg();
        setMsg(myRole ? 'Klaar — klik ▶ Start' : 'Selecteer eerst een rol ↑');
    } else {
        bar.style.display = 'none';
        spRow.style.display = 'none';
        stopTTS();
    }
});

/* Speed buttons */
document.querySelectorAll('.spd-btn').forEach(btn =>
    btn.addEventListener('click', () => {
        document.querySelectorAll('.spd-btn').forEach(b => b.classList.remove('spd-on'));
        btn.classList.add('spd-on');
        ttsSpeed = parseFloat(btn.dataset.spd);
    })
);

/* ─── TTS controls ─── */
document.getElementById('btn-start').addEventListener('click', startTTS);
document.getElementById('btn-stop').addEventListener('click', stopTTS);
document.getElementById('btn-repeat').addEventListener('click', repeatLast);
document.getElementById('btn-done').addEventListener('click', userDone);
document.getElementById('btn-again').addEventListener('click', () => {
    document.getElementById('celebrate').classList.remove('on');
    startTTS();
});
document.getElementById('btn-cel-close').addEventListener('click', () => {
    document.getElementById('celebrate').classList.remove('on');
});

function startTTS() {
    if (!myRole) { alert('Selecteer eerst een rol! / Please select a role first!'); return; }
    if (!current) return;
    tts.active = true; tts.line = 0; tts.waitUser = false; lastTTSLine = -1;
    hide('btn-start');
    show('btn-stop');
    hide('btn-repeat');
    hide('btn-done');
    renderConv(0, 0);
    runStep();
}

function stopTTS() {
    tts.active = false; tts.waitUser = false;
    speechSynthesis.cancel();
    hide('btn-done');
    hide('btn-repeat');
    show('btn-start');
    hide('btn-stop');
    setWave(false); resetProg();
    setMsg('Gestopt');
    document.getElementById('tts-top').classList.remove('spk');
    if (current) renderConv();
}

function userDone() {
    if (!tts.waitUser) return;
    tts.waitUser = false;
    hide('btn-done');
    advanceTTS();
}

function repeatLast() {
    if (lastTTSLine < 0 || !current) return;
    const line = current.conversation[lastTTSLine];
    if (!line) return;
    setWave(true);
    setMsg(`↩ ${current.roles[line.role] || line.role}…`);
    speak(line.text).then(() => {
        if (!tts.active) return;
        setWave(false);
        setMsg('');
    });
}

async function runStep() {
    if (!tts.active || !current) return;
    const conv = current.conversation;

    if (tts.line >= conv.length) {
        tts.active = false;
        setWave(false);
        setProg(1);
        updateConv(conv.length);
        hide('btn-done');
        hide('btn-stop');
        hide('btn-repeat');
        show('btn-start');
        setMsg('🎉 Klaar!');
        document.getElementById('tts-top').classList.remove('spk');
        setTimeout(() => document.getElementById('celebrate').classList.add('on'), 600);
        return;
    }

    const line = conv[tts.line];
    setProg(tts.line / conv.length);
    updateConv(tts.line);
    scrollToLine(tts.line);

    if (line.role === myRole) {
        // User's turn
        tts.waitUser = true;
        setWave(false);
        document.getElementById('tts-top').classList.remove('spk');
        setMsg(`Jouw beurt als ${current.roles[myRole] || myRole}! 🎤`);
        show('btn-done');
        if (lastTTSLine >= 0) show('btn-repeat');
    } else {
        // TTS speaks
        tts.waitUser = false;
        hide('btn-done');
        document.getElementById('tts-top').classList.add('spk');
        setMsg(`${current.roles[line.role] || line.role} 🔊`);
        setWave(true);
        lastTTSLine = tts.line;
        await speak(line.text);
        if (!tts.active) return;
        setWave(false);
        document.getElementById('tts-top').classList.remove('spk');
        show('btn-repeat');
        advanceTTS();
    }
}

function advanceTTS() {
    if (!tts.active) return;
    tts.line++;
    setTimeout(runStep, 500);
}

function scrollToLine(i) {
    const el = document.getElementById(`cl-${i}`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

/* ─── Speech Synthesis ─── */
let nlVoice = null;
function loadVoices() {
    const vs = speechSynthesis.getVoices();
    nlVoice = vs.find(v => v.lang === 'nl-NL') || vs.find(v => v.lang === 'nl-BE')
           || vs.find(v => v.lang.startsWith('nl')) || null;
}
speechSynthesis.addEventListener('voiceschanged', loadVoices);
loadVoices();

function speak(text) {
    return new Promise(resolve => {
        speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(text);
        u.lang = 'nl-NL'; u.rate = ttsSpeed; u.pitch = 1;
        if (nlVoice) u.voice = nlVoice;
        u.onend = resolve; u.onerror = resolve;
        speechSynthesis.speak(u);
    });
}

/* ─── UI helpers ─── */
const setMsg    = m  => { document.getElementById('tts-msg').textContent = m; };
const setWave   = on => { document.getElementById('wave').classList.toggle('on', on); };
const setProg   = r  => { document.getElementById('prog-bar').style.width = Math.round(r * 100) + '%'; };
const resetProg = () => { document.getElementById('prog-bar').style.width = '0%'; };
// Explicit display values per element (avoids CSS display:none fallback via style='')
const SHOW_AS = { 'btn-done': 'block', 'btn-start': 'block', 'btn-repeat': 'flex', 'btn-stop': 'flex' };
const show = id => { document.getElementById(id).style.display = SHOW_AS[id] || 'flex'; };
const hide = id => { document.getElementById(id).style.display = 'none'; };

/* ─── Keyboard shortcuts ─── */
document.addEventListener('keydown', e => {
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;
    if (e.code === 'Space' && tts.waitUser) { e.preventDefault(); userDone(); }
    if (e.key.toLowerCase() === 'r' && tts.active) repeatLast();
    if (e.key === 'Escape') closeDrawer();
});

/* ─── Init ─── */
(async () => {
    const found = await discover();
    dialogues = found;
    renderSidebar(found);
    if (found.length) loadDialogue(found[0]);
})();
