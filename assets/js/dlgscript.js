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
const DEFAULT_FONT = 1.15;   // rem — conversation text size until the user picks their own
let ttsSpeed = 0.88, lastTTSLine = -1, convFontSize = DEFAULT_FONT, ttsVolume = 1;
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
    convFontSize = Math.min(1.6, Math.max(0.72, size));
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
async function loadSession() {
    const s = STORE.get();
    if (!s.dialogueId) return;
    let d = dialogues.find(x => x.id === s.dialogueId);

    // Stub (summary-only) or missing — try quick cache first (zero crypto cost)
    if (!d || !d.conversation) {
        const quick = QUICK_CACHE.get();
        if (quick && quick.id === s.dialogueId && quick.conversation) {
            d = quick;
            const idx = dialogues.findIndex(x => x.id === s.dialogueId);
            if (idx >= 0) dialogues[idx] = d; else dialogues.push(d);
        }
    }

    // Still missing or no conversation — decrypt from encrypted cache
    if (!d || !d.conversation) {
        const cached = await DCACHE.get(s.dialogueId);
        if (cached) {
            d = { id: s.dialogueId, ...cached };
            const idx = dialogues.findIndex(x => x.id === s.dialogueId);
            if (idx >= 0) dialogues[idx] = d; else dialogues.push(d);
        } else {
            d = await fetchOne(s.dialogueId);   // cold start: not among the first chunk yet
            if (!d) return;
        }
    }

    loadDialogue(d, /* skipSave */ true);

    if (s.role && d.roles[s.role]) pickRole(s.role, /* skipSave */ true);

    if (s.speed) {
        ttsSpeed = s.speed;
        document.querySelectorAll('.spd-btn').forEach(b =>
            b.classList.toggle('spd-on', parseFloat(b.dataset.spd) === s.speed)
        );
    }

    if (s.volume != null) applyVolume(s.volume);

    if (s.soloMode) {
        soloMode = true;
        document.getElementById('tts-toggle').checked = true;
        document.getElementById('tts-bar').style.display = 'flex';
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
/* Lower-case + strip accents so "cafe" finds "café" and "oke" finds "oké" */
const fold = s => String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

/* First conversation line (Dutch text or English translation) containing the query */
function findLineMatch(d, q) {
    if (!d.conversation || !q) return null;
    const nq = fold(q);
    for (const line of d.conversation) {
        if (fold(line.text).includes(nq))        return { text: line.text,        raw: line.text };
        if (fold(line.translation).includes(nq)) return { text: line.translation, raw: line.translation };
    }
    return null;
}

function filterDialogues(query) {
    if (!query) return dialogues;
    const q = fold(query);
    return dialogues.filter(d =>
        fold(d.id).includes(q) ||
        fold(d.dialogue_title).includes(q) ||
        !!findLineMatch(d, query)       // also search the conversation transcript
    );
}

/* Short snippet around the match, with the match highlighted (escaped HTML) */
function matchSnippet(d, query) {
    const q = (query || '').trim();
    if (!q || fold(d.id).includes(fold(q)) || fold(d.dialogue_title).includes(fold(q))) return '';
    const m = findLineMatch(d, q);
    if (!m) return '';
    const folded = fold(m.text);
    // fold() can change length (accents), so only highlight when positions line up
    const i = folded.length === m.text.length ? folded.indexOf(fold(q)) : -1;
    let html;
    if (i < 0) {
        html = esc(m.text.length > 70 ? m.text.slice(0, 70) + '…' : m.text);
    } else {
        const start = Math.max(0, i - 25), end = Math.min(m.text.length, i + q.length + 35);
        html = (start > 0 ? '…' : '') + esc(m.text.slice(start, i)) +
               '<mark>' + esc(m.text.slice(i, i + q.length)) + '</mark>' +
               esc(m.text.slice(i + q.length, end)) + (end < m.text.length ? '…' : '');
    }
    return `<div class="dlg-snip">${html}</div>`;
}

/* ════════════════════════════════════════════════════
   QUICK CACHE  –  last-open dialogue stored as plain JSON.
   No crypto cost — allows instant render on page refresh.
   Updated after every successful background decryption.
   ════════════════════════════════════════════════════ */
const QUICK_CACHE = (() => {
    const KEY = 'nl_dlg_qk_v1';
    return {
        get()  { try { return JSON.parse(localStorage.getItem(KEY)); } catch { return null; } },
        set(d) { try { if (d && d.conversation) localStorage.setItem(KEY, JSON.stringify(d)); } catch {} },
        clear(){ try { localStorage.removeItem(KEY); } catch {} }
    };
})();

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
            try {
                const raw = JSON.parse(localStorage.getItem(IDS_KEY));
                if (!raw) return { ids: null, cachedAt: 0, summaries: [] };
                if (Array.isArray(raw)) return { ids: raw, cachedAt: 0, summaries: [] }; // old format
                return { summaries: [], ...raw }; // ensure summaries present
            } catch { return { ids: null, cachedAt: 0, summaries: [] }; }
        },
        // summaries = [{id, dialogue_title}] — stored plaintext so sidebar renders without decryption
        setIds(ids, summaries) {
            try {
                localStorage.setItem(IDS_KEY, JSON.stringify({
                    ids,
                    cachedAt: Date.now(),
                    summaries: summaries || ids.map(id => ({ id })),
                }));
            } catch { }
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

        /* Encrypt many at once and write localStorage a single time (set() rewrites the whole blob). */
        async setMany(list) {
            try {
                const store = _load();
                const enc = await Promise.all(list.map(d => CRYPTO.encrypt(stripId(d))));
                list.forEach((d, i) => { store[d.id] = enc[i]; });
                localStorage.setItem(DATA_KEY, JSON.stringify(store));
            } catch { }
        },

        clear() {
            try { localStorage.removeItem(IDS_KEY); localStorage.removeItem(DATA_KEY); } catch { }
        }
    };
})();

/* Dialogue object without the runtime-added `id` (cache stores the raw file content) */
function stripId(d) { const { id, ...rest } = d; return rest; }

/* Fetch a single dialogue file on demand (deep-link / saved session not loaded yet) */
async function fetchOne(id) {
    try {
        const r = await fetch(`data/dialogues/${id}.json`);
        if (!r.ok) return null;
        const full = { id, ...(await r.json()) };
        const idx = dialogues.findIndex(x => x.id === id);
        if (idx >= 0) dialogues[idx] = full; else dialogues.push(full);
        return full;
    } catch { return null; }
}

/* ════════════════════════════════════════════════════
   FILE DISCOVERY  –  cache-first, network fallback
   ════════════════════════════════════════════════════ */
// const CACHE_TTL = 60 * 60 * 1000; // 1 hour in ms
const CACHE_TTL = 2 * 24 * 60 * 60 * 1000; // 2 days in ms

async function discover() {
    if (location.protocol === 'file:')
        document.getElementById('file-notice').style.display = 'inline-flex';

    /* Warm crypto key now so the first on-demand decrypt is fast. */
    CRYPTO.warmup().catch(() => {});

    const { ids: cachedIds, cachedAt, summaries } = DCACHE.getIds();
    const isStale = !cachedAt || (Date.now() - cachedAt > CACHE_TTL);

    if (cachedIds && cachedIds.length > 0 && summaries && summaries.length > 0) {
        /* ── Instant path: return sidebar-ready summaries immediately.
           Full dialogue content is decrypted lazily in the background.  ── */
        _warmAllFromCache(cachedIds, isStale).catch(() => {});
        return summaries;   // [{id, dialogue_title}] — no decryption needed
    }

    if (cachedIds && cachedIds.length > 0) {
        /* ── Fast path (old cache format without summaries): decrypt all. ── */
        const found = [];
        for (const id of cachedIds) {
            const d = await DCACHE.get(id);
            if (d) found.push({ id, ...d });
        }
        if (found.length > 0) {
            // Rebuild index with summaries so the next refresh is instant
            DCACHE.setIds(
                found.map(f => f.id),
                found.map(f => ({ id: f.id, dialogue_title: f.dialogue_title }))
            );
            if (isStale && navigator.onLine) _backgroundRefresh(found).catch(() => {});
            else _checkForNew(cachedIds, found).catch(() => {});
            return found;
        }
        DCACHE.clear();
    }

    /* ── Slow path: nothing cached — show the first dialogues at once, load the rest in the background. ── */
    return _fetchAll(true);
}

/* Decrypt all cached dialogues in the background, progressively upgrading the
   in-memory `dialogues` array from stubs to full objects.                     */
async function _warmAllFromCache(cachedIds, isStale) {
    const found = [];
    for (const id of cachedIds) {
        const d = await DCACHE.get(id);
        if (!d) continue;
        const full = { id, ...d };
        found.push(full);

        // Replace the stub (summary-only entry) with the full object
        const idx = dialogues.findIndex(x => x.id === id);
        if (idx >= 0) dialogues[idx] = full;
        else dialogues.push(full);

        // Upgrade current: full re-render only if we had a stub, otherwise silent refresh
        if (current && current.id === id) {
            if (!current.conversation) {
                current = full;
                loadDialogue(full, /* skipSave */ true);
            } else {
                current = full;
                QUICK_CACHE.set(full); // keep quick cache in sync with freshly-decrypted data
            }
        }
    }

    if (!found.length) return;

    // Re-render sidebar with full data (completion badges are now accurate)
    renderSidebar(filterDialogues(searchInput.value.trim()));

    if (isStale && navigator.onLine) _backgroundRefresh(found).catch(() => {});
    else _checkForNew(cachedIds, found).catch(() => {});
}

const FIRST_CHUNK = 10;   // dialogues shown right away on a cold start
const FETCH_BATCH = 12;   // files requested in parallel per round

/* Fetch ids p+from .. p+(from+size-1) in parallel; stops at the first missing file. */
async function _probe(p, from, size) {
    const res = await Promise.all(Array.from({ length: size }, (_, i) => {
        const id = p + String(from + i).padStart(3, '0');
        return fetch(`data/dialogues/${id}.json`)
            .then(r => r.ok ? r.json().then(d => ({ id, ...d })) : null)
            .catch(() => null);
    }));
    const hit = [];
    for (const x of res) { if (!x) return { hit, more: false }; hit.push(x); }
    return { hit, more: true };
}

/* progressive = true : resolve as soon as the first FIRST_CHUNK dialogues are in hand;
   the rest keep loading in the background (appended to the returned array, sidebar
   re-rendered per batch, cache written once at the end).
   progressive = false: resolve with everything.                                   */
async function _fetchAll(progressive = false) {
    const prefixes = ['a', 'b', 'c', 'd', 'e'];
    const found    = [];
    const open     = [];                       // prefixes that may still have more files

    for (let i = 0; i < prefixes.length; i++) {
        const p = prefixes[i];
        if (progressive && found.length >= FIRST_CHUNK) { open.push({ p, next: 1 }); continue; }
        const { hit, more } = await _probe(p, 1, progressive ? FIRST_CHUNK - found.length : FETCH_BATCH);
        found.push(...hit);
        if (more) open.push({ p, next: 1 + hit.length });
    }

    const finish = async () => {
        for (const s of open) {
            for (let more = true; more && s.next <= 200; ) {
                const r = await _probe(s.p, s.next, FETCH_BATCH);
                found.push(...r.hit);
                s.next += FETCH_BATCH;
                more = r.more;
                if (progressive) {
                    if (dialogues !== found) dialogues = found;
                    dlgLoadingMore = true;
                    renderSidebar(filterDialogues(searchInput.value.trim()));
                }
            }
        }
        dlgLoadingMore = false;
        if (found.length) {
            await DCACHE.setMany(found);
            DCACHE.setIds(
                found.map(f => f.id),
                found.map(f => ({ id: f.id, dialogue_title: f.dialogue_title }))
            );
        }
        if (progressive) renderSidebar(filterDialogues(searchInput.value.trim()));
        return found;
    };

    if (!progressive) return finish();
    dlgLoadingMore = open.length > 0;
    finish().catch(() => { dlgLoadingMore = false; });
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
        DCACHE.setIds(
            all.map(f => f.id),
            all.map(f => ({ id: f.id, dialogue_title: f.dialogue_title }))
        );
        dialogues = all;
        renderSidebar(all);
        showToast(`🆕 ${newFound.length} nieuwe dialoog${newFound.length > 1 ? 'en' : ''} gevonden!`);
    }
}

/* Full background refresh when cache is stale (> 7 days). Serves existing
   data immediately; replaces it silently once the fresh fetch completes. */
async function _backgroundRefresh(currentFound) {
    try {
        DCACHE.clear();
        const fresh = await _fetchAll(); // _fetchAll now stores summaries too
        if (!fresh.length) return;
        dialogues = fresh;
        renderSidebar(filterDialogues(searchInput.value.trim()));
        showToast('🔄 Inhoud bijgewerkt / Content refreshed');
    } catch { /* no internet or fetch error — keep serving stale cache */ }
}

/* ════════════════════════════════════════════════════
   SIDEBAR RENDER  –  includes completion badges
   ════════════════════════════════════════════════════ */
let dlgLoadingMore = false;   // true while the remaining dialogues stream in after a cold start

function renderSidebar(list) {
    const el = document.getElementById('dlg-list');
    const more = dlgLoadingMore
        ? `<div class="sb-load-more"><div class="spin"></div> Meer dialogen laden… (${dialogues.length})</div>` : '';
    if (!list.length) {
        el.innerHTML = dlgLoadingMore ? more : '<div class="sb-no-results">Geen resultaten / No results</div>';
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
              ${matchSnippet(d, searchInput.value)}
            </div>`;
    }).join('') + more;
    el.querySelectorAll('.dlg-item').forEach(item =>
        item.addEventListener('click', () => {
            const d = dialogues.find(x => x.id === item.dataset.id);
            if (d) { loadDialogue(d); closeDrawer(); }
        })
    );
    const active = el.querySelector('.dlg-item.active');
    if (active && !dlgLoadingMore) active.scrollIntoView({ block: 'nearest' });
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

    if (ytPanelOpen && ytId(d.video_url)) {
        // Panel stays open — just swap the video and title
        const vid = ytId(d.video_url);
        document.getElementById('yt-panel-body').innerHTML =
            `<iframe src="https://www.youtube.com/embed/${vid}?rel=0" allow="accelerometer;autoplay;clipboard-write;encrypted-media;gyroscope;picture-in-picture;fullscreen" allowfullscreen></iframe>`;
        document.getElementById('yt-panel-title').textContent = d.dialogue_title;
    } else if (ytPanelOpen) {
        closeYtPanel();
        setYtWrap(d.video_url);
    } else {
        setYtWrap(d.video_url);
    }

    renderRoles(d.roles);
    document.getElementById('tts-toggle').checked = false;
    document.getElementById('tts-bar').style.display  = 'none';
    renderConv();

    if (!skipSave) {
        if (d.conversation) QUICK_CACHE.set(d);
        saveSession();
    }
}

/* ════════════════════════════════════════════════════
   VIDEO POP-OUT PANEL
   ════════════════════════════════════════════════════ */
let ytPanelOpen = false;

const POP_BTN_HTML = `<button id="yt-pop-btn" title="Open video panel / Zwevend scherm"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18M3 9h6"/></svg> Bekijk video</button>`;

function setYtWrap(videoUrl) {
    const wrap = document.getElementById('yt-wrap');
    const vid  = ytId(videoUrl);
    wrap.innerHTML = vid
        ? `<iframe src="https://www.youtube.com/embed/${vid}?rel=0" allow="accelerometer;autoplay;clipboard-write;encrypted-media;gyroscope;picture-in-picture;fullscreen" allowfullscreen></iframe>${POP_BTN_HTML}`
        : `<div id="yt-ph"><svg viewBox="0 0 24 24" width="36" height="36" fill="currentColor"><path d="M8 5v14l11-7z"/></svg><span>Geen video</span></div>`;
}

function openYtPanel() {
    if (window.innerWidth <= 700) return;  // desktop only
    if (!current) return;
    const vid = ytId(current.video_url);
    if (!vid) return;
    document.getElementById('yt-panel-body').innerHTML =
        `<iframe src="https://www.youtube.com/embed/${vid}?rel=0" allow="accelerometer;autoplay;clipboard-write;encrypted-media;gyroscope;picture-in-picture;fullscreen" allowfullscreen></iframe>`;
    document.getElementById('yt-panel-title').textContent = current.dialogue_title;
    document.getElementById('yt-wrap').innerHTML =
        `<div id="yt-ph"><svg viewBox="0 0 24 24" width="36" height="36" fill="currentColor"><path d="M8 5v14l11-7z"/></svg><span>📺 Zijpaneel</span></div>`;
    document.getElementById('yt-panel').classList.add('open');
    document.body.classList.add('yt-panel-open');
    ytPanelOpen = true;
}

function closeYtPanel() {
    document.getElementById('yt-panel').classList.remove('open');
    document.body.classList.remove('yt-panel-open');
    document.getElementById('yt-panel-body').innerHTML = '';
    ytPanelOpen = false;
    if (current) setYtWrap(current.video_url);
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
          <button class="c-flag" data-line="${i}" title="Fout in deze regel? Meld het.
Something wrong in this line? Report it." aria-label="Fout melden in regel ${i + 1}">⚠️<span class="c-flag-t">Fout?</span></button>
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
        show('btn-start'); hide('btn-done'); hide('btn-repeat'); hide('btn-stop'); hide('btn-resume');
        setWave(false); resetProg();
        setMsg(myRole ? 'Klaar — klik ▶ Start' : 'Selecteer eerst een rol ↑');
    } else {
        document.getElementById('tts-bar').style.display  = 'none';
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
    speakPreview(line.text, waveEl || document.createElement('div'), myRole);
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
    speak(line.text, line.role).then(() => { if (tts.active) { setWave(false); setMsg(''); } });
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
        await speak(line.text, line.role);
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
    speakPreview(line.text, textEl.parentElement.querySelector('.c-wave'), line.role);
});

function speakPreview(text, waveEl, role) {
    if (tts.active && !tts.waitUser) return;  // don't interrupt active TTS
    document.querySelectorAll('.c-wave.playing').forEach(w => w.classList.remove('playing'));
    speechSynthesis.cancel();
    if (!waveEl) return;
    waveEl.classList.add('playing');
    const cfg  = ttsConfigForRole(role);
    const rate = ttsConfigForRole(role) === ttsB ? Math.max(0.1, ttsSpeed - 0.2) : ttsSpeed;
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'nl-NL'; u.rate = rate; u.pitch = cfg.pitch; u.volume = ttsVolume;
    if (cfg.voice) u.voice = cfg.voice;
    u.onend = u.onerror = () => waveEl.classList.remove('playing');
    speechSynthesis.speak(u);
}

/* ════════════════════════════════════════════════════
   SPEECH SYNTHESIS  –  two independent TTS instances
   ttsA  →  even-index roles (A, C, E): browser default nl voice, pitch 1, full speed
   ttsB  →  odd-index  roles (B, D):    second nl voice when available (else same voice
            at pitch 0.8); always 0.2 slower than the current speed setting.
   ════════════════════════════════════════════════════ */
const ttsA = { voice: null, pitch: 1 };
const ttsB = { voice: null, pitch: 1 };

function loadVoices() {
    const vs = speechSynthesis.getVoices();
    const nl = vs.filter(v => v.lang === 'nl-NL' || v.lang === 'nl-BE' || v.lang.startsWith('nl'));
    if (!nl.length) return;

    ttsA.voice = nl[0];
    ttsA.pitch = 1;

    ttsB.voice = nl[1] || nl[0];               // second voice if browser has one
    ttsB.pitch = nl.length > 1 ? 1 : 0.8;      // lower pitch only when sharing voice

    console.log('[TTS A]', ttsA.voice?.name, '| [TTS B]', ttsB.voice?.name,
                nl.length > 1 ? '(distinct voice)' : '(shared voice, pitch 0.8)');
}
speechSynthesis.addEventListener('voiceschanged', loadVoices);
loadVoices();

function ttsConfigForRole(roleKey) {
    const roles = current ? Object.keys(current.roles) : [];
    return roles.indexOf(roleKey) % 2 === 0 ? ttsA : ttsB;
}

function speak(text, role) {
    return new Promise(resolve => {
        speechSynthesis.cancel();
        const cfg  = ttsConfigForRole(role);
        const rate = role && ttsConfigForRole(role) === ttsB
                     ? Math.max(0.1, ttsSpeed - 0.2)
                     : ttsSpeed;
        const u = new SpeechSynthesisUtterance(text);
        u.lang = 'nl-NL'; u.rate = rate; u.pitch = cfg.pitch; u.volume = ttsVolume;
        if (cfg.voice) u.voice = cfg.voice;
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
    const icons = ['reload-ico', 'sb-reload-ico'].map(id => document.getElementById(id)).filter(Boolean);
    const btns  = ['mob-reload-btn', 'sb-reload-btn'].map(id => document.getElementById(id)).filter(Boolean);
    icons.forEach(i => i.classList.add('spinning'));
    btns.forEach(b => { b.disabled = true; });
    try {
        DCACHE.clear();
        QUICK_CACHE.clear();
        const found = await _fetchAll();
        dialogues = found;
        renderSidebar(found);
        showToast('✅ Inhoud bijgewerkt / Content refreshed');
    } catch {
        showToast('❌ Ophalen mislukt / Fetch failed');
    } finally {
        icons.forEach(i => i.classList.remove('spinning'));
        btns.forEach(b => { b.disabled = false; });
    }
}

/* ════════════════════════════════════════════════════
   WAKE LOCK
   ════════════════════════════════════════════════════ */
const WAKE = (() => {
    let sentinel = null;
    let wanted   = false;
    const btn    = () => document.getElementById('mob-wake-btn');

    async function acquire() {
        if (!('wakeLock' in navigator)) return;
        try {
            sentinel = await navigator.wakeLock.request('screen');
            sentinel.addEventListener('release', () => { sentinel = null; });
            btn().classList.add('wake-on');
        } catch { /* denied or not supported */ }
    }

    async function release() {
        if (sentinel) { await sentinel.release(); sentinel = null; }
        btn().classList.remove('wake-on');
    }

    // Re-acquire after tab becomes visible (browser releases lock on hide)
    document.addEventListener('visibilitychange', () => {
        if (wanted && document.visibilityState === 'visible') acquire();
    });

    return {
        async init(on) {
            wanted = on;
            if (wanted) await acquire();
            else btn().classList.remove('wake-on');
        },
        async toggle() {
            if (!('wakeLock' in navigator)) {
                showToast('⚠️ Niet ondersteund in deze browser / Not supported');
                return;
            }
            wanted = !wanted;
            STORE.patch({ wakeLock: wanted });
            if (wanted) {
                await acquire();
                showToast('☀️ Scherm blijft aan / Screen stays on');
            } else {
                await release();
                showToast('💤 Scherm time-out weer actief / Screen timeout restored');
            }
        }
    };
})();

/* ════════════════════════════════════════════════════
   INIT
   ════════════════════════════════════════════════════ */
/* ════════════════════════════════════════════════════
   REPORT AN ISSUE  (anonymous → worker POST /feedback, type "bug")
   The admin sees it in the portal feedback inbox with a link back here.
   ════════════════════════════════════════════════════ */
const REPORT_URL = 'https://nl-sync.itho.workers.dev/feedback';
const REPORT_KEY = 'nl_dlg_report_last';
const REPORT_GAP = 5 * 60 * 1000;   // mirrors the worker's per-IP rate limit
let reportLine = -1;                // -1 = whole dialogue

function openReport(line) {
    if (!current) return;
    reportLine = line;
    const ln = current.conversation[line];
    document.getElementById('rep-ctx').innerHTML = ln
        ? `<b>${esc(current.id)} · regel ${line + 1} · ${esc(ln.role)}</b><br>${esc(ln.text)}<br><em>${esc(ln.translation)}</em>`
        : `<b>Hele dialoog</b> · ${esc(current.id)} · ${esc(current.dialogue_title)}`;
    document.getElementById('rep-note').value = '';
    document.querySelectorAll('.rep-cat').forEach(b => b.classList.toggle('on', b.dataset.cat === (ln ? 'Tekst' : 'Rol')));
    const send = document.getElementById('rep-send');
    send.disabled = false; send.textContent = '📨 Verstuur melding';
    const ov = document.getElementById('rep-overlay');
    ov.classList.add('open'); ov.removeAttribute('aria-hidden');
    setTimeout(() => document.getElementById('rep-note').focus(), 80);
}

function closeReport() {
    const ov = document.getElementById('rep-overlay');
    ov.classList.remove('open'); ov.setAttribute('aria-hidden', 'true');
}

async function sendReport() {
    if (!current) return;
    let last = 0;
    try { last = parseInt(localStorage.getItem(REPORT_KEY) || '0', 10); } catch {}
    if (Date.now() - last < REPORT_GAP) { showToast('Wacht even — je kunt eenmaal per 5 minuten een melding sturen.'); return; }

    const cat   = document.querySelector('.rep-cat.on')?.dataset.cat || 'Anders';
    const note  = document.getElementById('rep-note').value.trim();
    const ln    = current.conversation[reportLine];
    const where = ln ? `${current.id} · regel ${reportLine + 1} · ${ln.role}` : `${current.id} · hele dialoog`;
    const message = [`[${where}] ${cat}${note ? ': ' + note : ''}`,
                     ln ? `NL: ${ln.text}` : '', ln ? `EN: ${ln.translation}` : '']
                    .filter(Boolean).join('\n').slice(0, 500);
    const q = `?id=${encodeURIComponent(current.id)}` + (ln ? `&line=${reportLine}` : '');

    const btn = document.getElementById('rep-send');
    btn.disabled = true; btn.textContent = '⏳';
    try {
        const r = await fetch(REPORT_URL, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ type: 'bug', message, env: {
                url:     location.pathname + q,
                browser: (navigator.userAgent || '').slice(0, 80),
                screen:  `${screen.width}×${screen.height}`,
                lang:    navigator.language || '',
            } }),
        });
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `HTTP ${r.status}`);
        try { localStorage.setItem(REPORT_KEY, String(Date.now())); } catch {}
        closeReport();
        showToast('✅ Bedankt! Je melding is verstuurd. / Thanks, report sent.');
    } catch (e) {
        btn.disabled = false; btn.textContent = '📨 Verstuur melding';
        showToast('Kon melding niet versturen: ' + e.message, 5000);
    }
}

document.getElementById('rep-btn').addEventListener('click', () => openReport(-1));
document.getElementById('conv-list').addEventListener('click', e => {
    const f = e.target.closest('.c-flag');
    if (f) openReport(parseInt(f.dataset.line, 10));
});
document.getElementById('rep-cats').addEventListener('click', e => {
    const b = e.target.closest('.rep-cat');
    if (!b) return;
    document.querySelectorAll('.rep-cat').forEach(x => x.classList.toggle('on', x === b));
});
document.getElementById('rep-close').addEventListener('click', closeReport);
document.getElementById('rep-overlay').addEventListener('click', e => { if (e.target === e.currentTarget) closeReport(); });
document.getElementById('rep-send').addEventListener('click', sendReport);
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeReport(); });

(async () => {
    const yr = new Date().getFullYear();
    document.getElementById('year').textContent = yr;
    document.getElementById('year-mob').textContent = yr;
    document.getElementById('mob-reload-btn').addEventListener('click', forceReload);

    // Video pop-out panel — event delegation works after innerHTML rebuilds
    document.getElementById('yt-wrap').addEventListener('click', e => {
        if (e.target.closest('#yt-pop-btn')) openYtPanel();
    });
    document.getElementById('yt-panel-close').addEventListener('click', closeYtPanel);
    document.getElementById('sb-reload-btn').addEventListener('click', forceReload);
    document.getElementById('mob-wake-btn').addEventListener('click', () => WAKE.toggle());
    const savedWake = STORE.get().wakeLock;
    WAKE.init(savedWake !== false);   // default ON unless explicitly saved as false
    // A/A± buttons: remember the size as the user's own choice (fontCustom) so it survives reloads
    const setFont = size => { applyFontSize(size); STORE.patch({ fontCustom: true }); saveSession(); };
    document.getElementById('fs-down').addEventListener('click', () => setFont(convFontSize - 0.08));
    document.getElementById('fs-up').addEventListener('click',   () => setFont(convFontSize + 0.08));
    // Apply the saved size (or the bigger default) before any dialogue renders
    { const st = STORE.get(); applyFontSize(st.fontCustom && st.fontSize ? st.fontSize : DEFAULT_FONT); }

    const volSlider = document.getElementById('vol-slider');
    volSlider.addEventListener('input', () => {
        applyVolume(volSlider.value / 100);
        saveSession();
        try { localStorage.setItem('nl_vocab_vol', JSON.stringify({ v: parseInt(volSlider.value), t: Date.now() })); } catch {}
    });
    // Prefer shared volume key over session-stored value
    try {
        const sharedVol = JSON.parse(localStorage.getItem('nl_vocab_vol'));
        if (sharedVol && typeof sharedVol.v === 'number') { applyVolume(sharedVol.v / 100); }
        else applyVolume(ttsVolume);
    } catch { applyVolume(ttsVolume); }
    // Phase 1 — instant: discover() returns summaries from localStorage (no decryption).
    // The sidebar renders immediately; full content decrypts in the background.
    const found = await discover();
    dialogues   = found;
    updateStreak();

    const saved = STORE.get();
    renderSidebar(found);   // always render sidebar first — may be stubs, that's fine

    const urlId = new URLSearchParams(location.search).get('id');
    if (urlId) {
        // Deep-link: open the requested dialogue, ignoring saved session
        let d = dialogues.find(x => x.id === urlId);
        if (!d || !d.conversation) {
            const cached = await DCACHE.get(urlId);
            if (cached) {
                d = { id: urlId, ...cached };
                const idx = dialogues.findIndex(x => x.id === urlId);
                if (idx >= 0) dialogues[idx] = d; else dialogues.push(d);
            }
        }
        if (!d || !d.conversation) d = await fetchOne(urlId);   // cold start: not among the first chunk yet
        if (d && d.conversation) {
            loadDialogue(d);
            // Admin deep-link from the issue inbox: &line=N scrolls to the reported line
            const ln = parseInt(new URLSearchParams(location.search).get('line'), 10);
            if (!isNaN(ln)) setTimeout(() => { scrollToLine(ln); document.getElementById(`cl-${ln}`)?.classList.add('is-flagged'); }, 300);
        }
    } else if (saved.dialogueId) {
        // Phase 2a — restore last session: decrypt just the last-open dialogue on demand
        await loadSession();
    } else if (found.length) {
        // Phase 2b — no saved session: decrypt and open the first dialogue
        let first = found[0];
        if (!first.conversation) {
            const cached = await DCACHE.get(first.id);
            if (cached) {
                first = { id: first.id, ...cached };
                dialogues[0] = first;
            }
        }
        if (first.conversation) loadDialogue(first);
    }

    // Auto-open video panel on desktop if the loaded dialogue has a video
    if (current && ytId(current.video_url)) openYtPanel();
})();
