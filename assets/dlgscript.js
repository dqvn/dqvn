'use strict';

/* ─── Role colours (A B C D E) ─── */
const RC = ['#2563eb', '#e85d04', '#16a34a', '#9333ea', '#0891b2'];
function roleColor(key) {
    if (!current) return RC[0];
    const idx = Object.keys(current.roles).indexOf(key);
    return RC[idx >= 0 ? idx % RC.length : 0];
}

/* ─── Runtime state ─── */
let dialogues = [], current = null, myRole = null, soloMode = false;
let ttsSpeed = 0.88, lastTTSLine = -1, convFontSize = 0.92, ttsVolume = 1;
const tts = { active: false, line: 0, waitUser: false };

/* ─── Utility ─── */
const esc       = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
const today     = () => new Date().toISOString().slice(0, 10);
const yesterday = () => { const d = new Date(); d.setDate(d.getDate() - 1); return d.toISOString().slice(0, 10); };

function ytId(url) {
    if (!url) return null;
    const m = url.match(/(?:shorts\/|v=|youtu\.be\/)([A-Za-z0-9_-]{11})/);
    return m ? m[1] : null;
}

/* ════════════════════════════════════════════════════
   PERSISTENCE  –  localStorage key: nl_dlg_v1
   Schema:
   {
     dialogueId: 'c001',   // last open dialogue
     role:       'A',      // last selected role
     soloMode:   false,    // was TTS mode on?
     ttsLine:    0,        // TTS progress (line index)
     speed:      0.88,     // playback speed preference
     stats: {              // per-dialogue history
       'c001': { count: 3, lastDate: '2025-05-05' }
     },
     streak: { days: 3, lastDate: '2025-05-05' }
   }
   ════════════════════════════════════════════════════ */
const STORE = {
    KEY: 'nl_dlg_v1',
    get()    { try { return JSON.parse(localStorage.getItem(this.KEY)) || {}; } catch { return {}; } },
    set(v)   { try { localStorage.setItem(this.KEY, JSON.stringify(v)); } catch { } },
    patch(p) { this.set({ ...this.get(), ...p }); }
};

/* Save current UI state (called after any meaningful change) */
function applyFontSize(size) {
    convFontSize = Math.min(1.4, Math.max(0.72, size));
    document.getElementById('conv-list').style.setProperty('--fs', convFontSize + 'rem');
}

function applyVolume(v) {
    ttsVolume = Math.min(1, Math.max(0, v));
    const slider = document.getElementById('vol-slider');
    if (!slider) return;
    slider.value = Math.round(ttsVolume * 100);
    slider.style.backgroundSize = Math.round(ttsVolume * 100) + '% 100%';
    document.getElementById('vol-ctrl').classList.toggle('muted', ttsVolume === 0);
}

function saveSession() {
    STORE.patch({
        dialogueId: current ? current.id : null,
        role:       myRole,
        soloMode,
        ttsLine:    tts.line,
        speed:      ttsSpeed,
        fontSize:   convFontSize,
        volume:     ttsVolume
    });
}

/* Record one completed run of the current dialogue */
function saveCompletion() {
    if (!current) return;
    const s     = STORE.get();
    const stats = s.stats || {};
    const entry = stats[current.id] || { count: 0 };
    entry.count++;
    entry.lastDate = today();
    stats[current.id] = entry;
    STORE.patch({ stats });
}

/* Update daily streak counter */
function updateStreak() {
    const s      = STORE.get();
    const streak = s.streak || { days: 0, lastDate: null };
    const t      = today();
    const last   = streak.lastDate;
    if      (last === t)         { /* already counted today – no change */ }
    else if (last === yesterday()) { streak.days = (streak.days || 0) + 1; streak.lastDate = t; }
    else                           { streak.days = 1; streak.lastDate = t; }
    STORE.patch({ streak });
    renderStreak(streak.days);
}

/* Render the streak pill in the sidebar */
function renderStreak(days) {
    const el = document.getElementById('sb-streak');
    if (!el) return;
    if (days > 1) {
        el.textContent = `🔥 ${days} dagen op rij`;
        el.style.display = '';
    } else {
        el.style.display = 'none';
    }
}

/* ── Toast notification ── */
function showToast(msg, duration = 4000) {
    const t = document.getElementById('toast');
    if (!t) return;
    document.getElementById('toast-msg').textContent = msg;
    t.classList.add('show');
    clearTimeout(t._tid);
    t._tid = setTimeout(() => t.classList.remove('show'), duration);
}

/* ── Resume TTS from a saved line ── */
function showResume(line) {
    if (!current) return;
    const total = current.conversation.length;
    const pct   = Math.round((line / total) * 100);
    const btn   = document.getElementById('btn-resume');
    if (!btn) return;
    btn.textContent = `⏩  Verder vanaf zin ${line + 1} / ${total}  (${pct}%)`;
    show('btn-resume');
    hide('btn-start');
    renderConv(line, line);
    setTimeout(() => scrollToLine(line), 400);
}

/* ── Restore previous session on page load ── */
function loadSession() {
    const s = STORE.get();
    if (!s.dialogueId) return;
    const d = dialogues.find(x => x.id === s.dialogueId);
    if (!d) return;

    loadDialogue(d, /* skipSave */ true);

    if (s.role && d.roles[s.role]) pickRole(s.role, /* skipSave */ true);

    if (s.speed) {
        ttsSpeed = s.speed;
        document.querySelectorAll('.spd-btn').forEach(b =>
            b.classList.toggle('spd-on', parseFloat(b.dataset.spd) === s.speed)
        );
    }

    if (s.fontSize) applyFontSize(s.fontSize);
    if (s.volume != null) applyVolume(s.volume);

    if (s.soloMode) {
        soloMode = true;
        document.getElementById('tts-toggle').checked = true;
        document.getElementById('tts-bar').style.display = 'flex';
        document.getElementById('speed-row').style.display = 'flex';
        show('btn-start'); hide('btn-done'); hide('btn-repeat'); hide('btn-stop');
        setWave(false); resetProg();
        setMsg(s.role ? 'Klaar — klik ▶ Start' : 'Selecteer eerst een rol ↑');
    }

    if (s.ttsLine > 0 && s.soloMode && s.role) showResume(s.ttsLine);

    // Welcome-back toast with streak info
    const name       = d.dialogue_title.length > 28 ? d.dialogue_title.slice(0, 28) + '…' : d.dialogue_title;
    const streakDays = (STORE.get().streak || {}).days || 0;
    const streakPart = streakDays > 1 ? ` · 🔥 ${streakDays} dagen op rij!` : '';
    showToast(`👋 Welkom terug! "${name}"${streakPart}`);
}

/* ════════════════════════════════════════════════════
   DRAWER  (mobile sidebar)
   ════════════════════════════════════════════════════ */
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
document.getElementById('mob-search-btn').addEventListener('click', () => {
    openDrawer();
    setTimeout(() => document.getElementById('search-input').focus(), 320);
});

/* ════════════════════════════════════════════════════
   SEARCH / FILTER
   ════════════════════════════════════════════════════ */
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

/* ════════════════════════════════════════════════════
   CRYPTO  –  AES-256-GCM with PBKDF2 key derivation.
   Prevents casual localStorage inspection via DevTools.
   The key is derived from a passphrase embedded in this
   file; anyone who reads the source can find it, so this
   is obfuscation, not a hard security boundary.
   ════════════════════════════════════════════════════ */
const CRYPTO = (() => {
    /* Change either string to invalidate all cached data. */
    const _P  = 'nl-§oef-32·★xK9';
    const _S  = 'dlg-salt-v1';
    const ENC = new TextEncoder();
    const DEC = new TextDecoder();
    let   _k  = null;          // key cached for the lifetime of the page

    async function _key() {
        if (_k) return _k;
        const raw = await crypto.subtle.importKey(
            'raw', ENC.encode(_P), 'PBKDF2', false, ['deriveKey']
        );
        _k = await crypto.subtle.deriveKey(
            { name: 'PBKDF2', salt: ENC.encode(_S), iterations: 60_000, hash: 'SHA-256' },
            raw,
            { name: 'AES-GCM', length: 256 },
            false,
            ['encrypt', 'decrypt']
        );
        return _k;
    }

    const _b64enc = buf => btoa(String.fromCharCode(...new Uint8Array(buf)));
    const _b64dec = b64 => Uint8Array.from(atob(b64), c => c.charCodeAt(0));

    return {
        /* Warm the derived key in background so first encrypt/decrypt is instant. */
        warmup() { return _key(); },

        async encrypt(obj) {
            const k  = await _key();
            const iv = crypto.getRandomValues(new Uint8Array(12));
            const ct = await crypto.subtle.encrypt(
                { name: 'AES-GCM', iv }, k, ENC.encode(JSON.stringify(obj))
            );
            /* Prepend 12-byte IV to ciphertext, encode as base64. */
            const out = new Uint8Array(12 + ct.byteLength);
            out.set(iv, 0);
            out.set(new Uint8Array(ct), 12);
            return _b64enc(out.buffer);
        },

        async decrypt(b64) {
            const k   = await _key();
            const buf = _b64dec(b64);
            const pt  = await crypto.subtle.decrypt(
                { name: 'AES-GCM', iv: buf.slice(0, 12) }, k, buf.slice(12)
            );
            return JSON.parse(DEC.decode(pt));
        }
    };
})();

/* ════════════════════════════════════════════════════
   DCACHE  –  encrypted dialogue cache in localStorage.
   IDs list stored plaintext (not sensitive).
   Dialogue JSON stored encrypted (AES-256-GCM).
   ════════════════════════════════════════════════════ */
const DCACHE = (() => {
    const IDS_KEY  = 'nl_dlg_ids_1';
    const DATA_KEY = 'nl_dlg_enc_1';

    function _load() {
        try { return JSON.parse(localStorage.getItem(DATA_KEY)) || {}; } catch { return {}; }
    }

    return {
        getIds() {
            try { return JSON.parse(localStorage.getItem(IDS_KEY)); } catch { return null; }
        },
        setIds(ids) {
            try { localStorage.setItem(IDS_KEY, JSON.stringify(ids)); } catch { }
        },
        has(id) { return !!_load()[id]; },

        async get(id) {
            try {
                const enc = _load()[id];
                return enc ? await CRYPTO.decrypt(enc) : null;
            } catch { return null; }   /* bad entry → treat as cache miss */
        },

        async set(id, data) {
            try {
                const store = _load();
                store[id]   = await CRYPTO.encrypt(data);
                localStorage.setItem(DATA_KEY, JSON.stringify(store));
            } catch { }
        },

        clear() {
            try { localStorage.removeItem(IDS_KEY); localStorage.removeItem(DATA_KEY); } catch { }
        }
    };
})();

/* ════════════════════════════════════════════════════
   FILE DISCOVERY  –  cache-first, network fallback
   ════════════════════════════════════════════════════ */
async function discover() {
    if (location.protocol === 'file:')
        document.getElementById('file-notice').style.display = 'inline-flex';

    /* Warm crypto key in background so subsequent ops are instant. */
    CRYPTO.warmup().catch(() => {});

    const cachedIds = DCACHE.getIds();

    if (cachedIds && cachedIds.length > 0) {
        /* ── Fast path: load all from encrypted cache ── */
        const found = [];
        for (const id of cachedIds) {
            const d = await DCACHE.get(id);
            if (d) found.push({ id, ...d });
        }
        if (found.length > 0) {
            /* Background: silently check for new files beyond what we cached. */
            _checkForNew(cachedIds, found).catch(() => {});
            return found;
        }
        /* All cache entries failed (e.g. key changed) — fall through to network. */
        DCACHE.clear();
    }

    /* ── Slow path: fetch from network, encrypt & cache ── */
    return _fetchAll();
}

async function _fetchAll() {
    const prefixes = ['a', 'b', 'c', 'd', 'e'];
    const found    = [];
    for (const p of prefixes) {
        for (let n = 1; n <= 200; n++) {
            const id = p + String(n).padStart(3, '0');
            try {
                const r = await fetch(`data/dialogues/${id}.json`);
                if (!r.ok) break;
                const d = await r.json();
                await DCACHE.set(id, d);        /* cache encrypted */
                found.push({ id, ...d });
            } catch { break; }
        }
    }
    if (found.length) DCACHE.setIds(found.map(f => f.id));
    return found;
}

/* Check for new files added after the last cache build. Runs silently. */
async function _checkForNew(knownIds, currentFound) {
    /* Find the highest number per prefix in the known list. */
    const highestByPrefix = {};
    knownIds.forEach(id => {
        const p = id[0], n = parseInt(id.slice(1), 10);
        highestByPrefix[p] = Math.max(highestByPrefix[p] || 0, n);
    });

    const newFound = [];
    for (const [p, last] of Object.entries(highestByPrefix)) {
        for (let n = last + 1; n <= last + 10; n++) {
            const id = p + String(n).padStart(3, '0');
            try {
                const r = await fetch(`data/dialogues/${id}.json`);
                if (!r.ok) break;
                const d = await r.json();
                await DCACHE.set(id, d);
                newFound.push({ id, ...d });
            } catch { break; }
        }
    }

    if (newFound.length) {
        const all = [...currentFound, ...newFound];
        DCACHE.setIds(all.map(f => f.id));
        dialogues = all;
        renderSidebar(all);
        showToast(`🆕 ${newFound.length} nieuwe dialoog${newFound.length > 1 ? 'en' : ''} gevonden!`);
    }
}

/* ════════════════════════════════════════════════════
   SIDEBAR RENDER  –  includes completion badges
   ════════════════════════════════════════════════════ */
function renderSidebar(list) {
    const el = document.getElementById('dlg-list');
    if (!list.length) {
        el.innerHTML = '<div class="sb-no-results">Geen resultaten / No results</div>';
        return;
    }
    const stats = STORE.get().stats || {};
    el.innerHTML = list.map(d => {
        const entry = stats[d.id];
        // Show up to 5 filled dots then "+N" for overflow
        let badge = '';
        if (entry && entry.count > 0) {
            const dots  = '●'.repeat(Math.min(entry.count, 5));
            const extra = entry.count > 5 ? `<span class="dlg-badge-extra">+${entry.count - 5}</span>` : '';
            badge = `<span class="dlg-badge" title="${entry.count}× voltooid">${dots}${extra}</span>`;
        }
        return `
            <div class="dlg-item${current && current.id === d.id ? ' active' : ''}" data-id="${esc(d.id)}">
              <div class="dlg-id">${esc(d.id)}</div>
              <div class="dlg-name-row">
                <span class="dlg-name">${esc(d.dialogue_title)}</span>
                ${badge}
              </div>
            </div>`;
    }).join('');
    el.querySelectorAll('.dlg-item').forEach(item =>
        item.addEventListener('click', () => {
            const d = dialogues.find(x => x.id === item.dataset.id);
            if (d) { loadDialogue(d); closeDrawer(); }
        })
    );
    const active = el.querySelector('.dlg-item.active');
    if (active) active.scrollIntoView({ block: 'nearest' });
}

/* ════════════════════════════════════════════════════
   LOAD DIALOGUE
   ════════════════════════════════════════════════════ */
function setTitle(text) {
    const el = document.getElementById('dlg-title');
    el.classList.remove('scrolling');
    el.innerHTML = `<span>${text.replace(/</g, '&lt;')}</span>`;
    requestAnimationFrame(() => {
        // Temporarily force nowrap so we can measure the true text width
        el.style.whiteSpace = 'nowrap';
        const ovf = el.scrollWidth - el.clientWidth;
        el.style.whiteSpace = '';
        if (ovf > 4) {
            el.style.setProperty('--title-ovf', `-${ovf}px`);
            el.classList.add('scrolling');
        }
    });
}

function loadDialogue(d, skipSave = false) {
    stopTTS();
    current = d; myRole = null; soloMode = false;

    renderSidebar(filterDialogues(searchInput.value.trim()));
    document.getElementById('mob-cur').textContent = d.dialogue_title;
    document.getElementById('welcome').style.display = 'none';
    document.getElementById('view').style.display    = 'flex';
    setTitle(d.dialogue_title);
    document.getElementById('dlg-lang').textContent  = d.language || 'Nederlands';

    const wrap = document.getElementById('yt-wrap');
    const vid  = ytId(d.video_url);
    wrap.innerHTML = vid
        ? `<iframe src="https://www.youtube.com/embed/${vid}?rel=0" allow="accelerometer;autoplay;clipboard-write;encrypted-media;gyroscope;picture-in-picture" allowfullscreen></iframe>`
        : `<div id="yt-ph"><svg viewBox="0 0 24 24" width="36" height="36" fill="currentColor"><path d="M8 5v14l11-7z"/></svg><span>No video</span></div>`;

    renderRoles(d.roles);
    document.getElementById('tts-toggle').checked = false;
    document.getElementById('tts-bar').style.display  = 'none';
    document.getElementById('speed-row').style.display = 'none';
    renderConv();

    if (!skipSave) saveSession();
}

/* ════════════════════════════════════════════════════
   ROLES
   ════════════════════════════════════════════════════ */
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

function pickRole(role, skipSave = false) {
    myRole = myRole === role ? null : role;
    const color = roleColor(role);
    document.querySelectorAll('.role-btn').forEach(btn => {
        const sel = myRole && btn.dataset.role === myRole;
        btn.classList.toggle('sel', sel);
        btn.style.background = sel ? color : '';
        const keyEl = btn.querySelector('.rb-key');
        if (keyEl) keyEl.style.color = sel ? '#fff' : roleColor(btn.dataset.role);
    });
    renderConv();
    if (soloMode) setMsg(myRole ? 'Klaar — klik ▶ Start' : 'Selecteer eerst een rol ↑');
    if (!skipSave) saveSession();
}

/* ════════════════════════════════════════════════════
   CONVERSATION RENDER
   ════════════════════════════════════════════════════ */
const WAVE_HTML = '<div class="c-wave"><span></span><span></span><span></span><span></span><span></span></div>';

function renderConv(activeLine = -1, doneUpTo = -1) {
    if (!current) return;
    const conv = current.conversation;
    document.getElementById('conv-list').innerHTML = conv.map((line, i) => {
        const color  = roleColor(line.role);
        const isMyL  = myRole && line.role === myRole;
        const isDone = i < doneUpTo;
        const isAct  = i === activeLine;
        const cls    = ['c-line', isAct ? 'is-active' : isDone ? 'is-done' : isMyL ? 'is-mine' : '']
                        .filter(Boolean).join(' ');
        const showFull = !myRole || isMyL || isAct || isDone;
        const body = showFull
            ? `<div class="c-text">${esc(line.text)}</div><div class="c-trans">${esc(line.translation)}</div>${WAVE_HTML}`
            : `<div class="c-wait"><div class="c-dots"><span></span><span></span><span></span></div><span>${esc(current.roles[line.role] || line.role)} aan het woord…</span></div>`;
        return `<div class="${cls}" id="cl-${i}">
          <div class="c-badge" style="background:${color}" title="${esc(current.roles[line.role] || line.role)}">${esc(line.role)}</div>
          <div class="c-body">${body}</div>
        </div>`;
    }).join('');
}

/* Live DOM update during TTS (avoids scroll-jump from full re-render) */
function updateConv(activeLine) {
    if (!current) return;
    current.conversation.forEach((line, i) => {
        const el = document.getElementById(`cl-${i}`);
        if (!el) return;
        const isDone = i < activeLine, isAct = i === activeLine, isMyL = myRole && line.role === myRole;
        el.classList.remove('is-active', 'is-done', 'is-mine');
        if (isAct)       el.classList.add('is-active');
        else if (isDone) el.classList.add('is-done');
        else if (isMyL)  el.classList.add('is-mine');
        if ((isAct || isDone) && el.querySelector('.c-wait')) {
            el.querySelector('.c-body').innerHTML =
                `<div class="c-text">${esc(line.text)}</div><div class="c-trans">${esc(line.translation)}</div>${WAVE_HTML}`;
        }
    });
}

/* ════════════════════════════════════════════════════
   TTS MODE TOGGLE
   ════════════════════════════════════════════════════ */
document.getElementById('tts-toggle').addEventListener('change', e => {
    soloMode = e.target.checked;
    if (soloMode) {
        document.getElementById('tts-bar').style.display  = 'flex';
        document.getElementById('speed-row').style.display = 'flex';
        show('btn-start'); hide('btn-done'); hide('btn-repeat'); hide('btn-stop'); hide('btn-resume');
        setWave(false); resetProg();
        setMsg(myRole ? 'Klaar — klik ▶ Start' : 'Selecteer eerst een rol ↑');
    } else {
        document.getElementById('tts-bar').style.display  = 'none';
        document.getElementById('speed-row').style.display = 'none';
        stopTTS();
    }
    saveSession();
});

/* Speed buttons */
document.querySelectorAll('.spd-btn').forEach(btn =>
    btn.addEventListener('click', () => {
        document.querySelectorAll('.spd-btn').forEach(b => b.classList.remove('spd-on'));
        btn.classList.add('spd-on');
        ttsSpeed = parseFloat(btn.dataset.spd);
        saveSession();
    })
);

/* ════════════════════════════════════════════════════
   TTS CONTROLS
   ════════════════════════════════════════════════════ */
document.getElementById('btn-start').addEventListener('click',  () => startTTS(0));
document.getElementById('btn-resume').addEventListener('click', () => startTTS(STORE.get().ttsLine || 0));
document.getElementById('btn-stop').addEventListener('click',    stopTTS);
document.getElementById('btn-repeat').addEventListener('click',  repeatLast);
document.getElementById('btn-preview').addEventListener('click', previewMyLine);
function previewMyLine() {
    if (!tts.waitUser || !current) return;
    const line = current.conversation[tts.line];
    if (!line) return;
    const lineEl = document.getElementById('cl-' + tts.line);
    const waveEl = lineEl ? lineEl.querySelector('.c-wave') : null;
    speakPreview(line.text, waveEl || document.createElement('div'));
}
document.getElementById('btn-done').addEventListener('click',   userDone);
document.getElementById('btn-again').addEventListener('click', () => {
    document.getElementById('celebrate').classList.remove('on');
    startTTS(0);
});
document.getElementById('btn-cel-close').addEventListener('click', () => {
    document.getElementById('celebrate').classList.remove('on');
});

function startTTS(fromLine = 0) {
    if (!myRole) { alert('Selecteer eerst een rol! / Please select a role first!'); return; }
    if (!current) return;
    tts.active = true; tts.line = fromLine; tts.waitUser = false; lastTTSLine = -1;
    hide('btn-start'); hide('btn-resume');
    show('btn-stop'); hide('btn-repeat'); hide('btn-done'); hide('btn-preview');
    renderConv(fromLine, fromLine);
    runStep();
}

function stopTTS() {
    tts.active = false; tts.waitUser = false;
    speechSynthesis.cancel();
    hide('btn-done'); hide('btn-repeat'); hide('btn-preview'); hide('btn-resume');
    show('btn-start'); hide('btn-stop');
    setWave(false); resetProg();
    setMsg('Gestopt');
    document.getElementById('tts-top').classList.remove('spk');
    STORE.patch({ ttsLine: 0 });          // wipe progress on manual stop
    if (current) renderConv();
}

function userDone() {
    if (!tts.waitUser) return;
    tts.waitUser = false;
    hide('btn-done'); hide('btn-preview');
    advanceTTS();
}

function repeatLast() {
    if (lastTTSLine < 0 || !current) return;
    const line = current.conversation[lastTTSLine];
    if (!line) return;
    setWave(true);
    setMsg(`↩ ${current.roles[line.role] || line.role}…`);
    speak(line.text).then(() => { if (tts.active) { setWave(false); setMsg(''); } });
}

async function runStep() {
    if (!tts.active || !current) return;
    const conv = current.conversation;

    if (tts.line >= conv.length) {
        // ── Dialogue complete ──
        tts.active = false;
        setWave(false); setProg(1); updateConv(conv.length);
        hide('btn-done'); hide('btn-stop'); hide('btn-repeat'); hide('btn-preview'); hide('btn-resume');
        show('btn-start');
        setMsg('🎉 Klaar!');
        document.getElementById('tts-top').classList.remove('spk');
        saveCompletion();
        STORE.patch({ ttsLine: 0 });
        renderSidebar(filterDialogues(searchInput.value.trim())); // refresh completion dots
        setTimeout(() => document.getElementById('celebrate').classList.add('on'), 600);
        return;
    }

    const line = conv[tts.line];
    setProg(tts.line / conv.length);
    updateConv(tts.line);
    scrollToLine(tts.line);

    if (line.role === myRole) {
        // ── User's turn ──
        tts.waitUser = true;
        setWave(false);
        document.getElementById('tts-top').classList.remove('spk');
        setMsg(`Jouw beurt als ${current.roles[myRole] || myRole}! 🎤`);
        show('btn-done');
        show('btn-preview');
        if (lastTTSLine >= 0) show('btn-repeat');
    } else {
        // ── TTS speaks ──
        tts.waitUser = false;
        hide('btn-done');
        hide('btn-preview');
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
    STORE.patch({ ttsLine: tts.line });   // persist progress after every line
    setTimeout(runStep, 500);
}

function scrollToLine(i) {
    const el = document.getElementById(`cl-${i}`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

/* ════════════════════════════════════════════════════
   CLICK-TO-LISTEN  (event delegation on #conv-list)
   ════════════════════════════════════════════════════ */
document.getElementById('conv-list').addEventListener('click', e => {
    const textEl = e.target.closest('.c-text');
    if (!textEl) return;
    const lineEl = textEl.closest('.c-line');
    if (!lineEl || !current) return;
    const idx = parseInt(lineEl.id.replace('cl-', ''), 10);
    if (isNaN(idx)) return;
    const line = current.conversation[idx];
    if (!line) return;
    speakPreview(line.text, textEl.parentElement.querySelector('.c-wave'));
});

function speakPreview(text, waveEl) {
    if (tts.active && !tts.waitUser) return;  // don't interrupt active TTS
    document.querySelectorAll('.c-wave.playing').forEach(w => w.classList.remove('playing'));
    speechSynthesis.cancel();
    if (!waveEl) return;
    waveEl.classList.add('playing');
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'nl-NL'; u.rate = ttsSpeed; u.pitch = 1; u.volume = ttsVolume;
    if (nlVoice) u.voice = nlVoice;
    u.onend = u.onerror = () => waveEl.classList.remove('playing');
    speechSynthesis.speak(u);
}

/* ════════════════════════════════════════════════════
   SPEECH SYNTHESIS
   ════════════════════════════════════════════════════ */
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
        u.lang = 'nl-NL'; u.rate = ttsSpeed; u.pitch = 1; u.volume = ttsVolume;
        if (nlVoice) u.voice = nlVoice;
        u.onend = resolve; u.onerror = resolve;
        speechSynthesis.speak(u);
    });
}

/* ════════════════════════════════════════════════════
   UI HELPERS
   ════════════════════════════════════════════════════ */
const setMsg    = m  => { document.getElementById('tts-msg').textContent = m; };
const setWave   = on => { document.getElementById('wave').classList.toggle('on', on); };
const setProg   = r  => { document.getElementById('prog-bar').style.width = Math.round(r * 100) + '%'; };
const resetProg = () => { document.getElementById('prog-bar').style.width = '0%'; };

// Explicit display values — avoids reverting to CSS display:none when style='' is set
const SHOW_AS = {
    'btn-done':    'block',
    'btn-start':   'block',
    'btn-resume':  'block',
    'btn-repeat':  'flex',
    'btn-preview': 'flex',
    'btn-stop':    'flex'
};
const show = id => { document.getElementById(id).style.display = SHOW_AS[id] || 'flex'; };
const hide = id => { document.getElementById(id).style.display = 'none'; };

/* ════════════════════════════════════════════════════
   KEYBOARD SHORTCUTS
   ════════════════════════════════════════════════════ */
document.addEventListener('keydown', e => {
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;
    if (e.code === 'Space' && tts.waitUser) { e.preventDefault(); userDone(); }
    if (e.key.toLowerCase() === 'h' && tts.waitUser) previewMyLine();
    if (e.key.toLowerCase() === 'r' && tts.active) repeatLast();
    if (e.key === 'Escape') closeDrawer();
});

/* ════════════════════════════════════════════════════
   FORCE RELOAD
   ════════════════════════════════════════════════════ */
async function forceReload() {
    const ico = document.getElementById('reload-ico');
    const btn = document.getElementById('mob-reload-btn');
    ico.classList.add('spinning');
    btn.disabled = true;
    try {
        DCACHE.clear();
        const found = await _fetchAll();
        dialogues = found;
        renderSidebar(found);
        showToast('✅ Inhoud bijgewerkt / Content refreshed');
    } catch {
        showToast('❌ Ophalen mislukt / Fetch failed');
    } finally {
        ico.classList.remove('spinning');
        btn.disabled = false;
    }
}

/* ════════════════════════════════════════════════════
   INIT
   ════════════════════════════════════════════════════ */
(async () => {
    const yr = new Date().getFullYear();
    document.getElementById('year').textContent = yr;
    document.getElementById('year-mob').textContent = yr;
    document.getElementById('mob-reload-btn').addEventListener('click', forceReload);
    document.getElementById('fs-down').addEventListener('click', () => { applyFontSize(convFontSize - 0.08); saveSession(); });
    document.getElementById('fs-up').addEventListener('click',   () => { applyFontSize(convFontSize + 0.08); saveSession(); });

    const volSlider = document.getElementById('vol-slider');
    volSlider.addEventListener('input', () => { applyVolume(volSlider.value / 100); saveSession(); });
    applyVolume(ttsVolume);
    const found = await discover();
    dialogues   = found;
    updateStreak();             // count today's visit for streak

    const saved = STORE.get();
    if (saved.dialogueId) {
        renderSidebar(found);   // show badges before session restore
        loadSession();          // restore last session
    } else {
        renderSidebar(found);
        if (found.length) loadDialogue(found[0]);
    }
})();
