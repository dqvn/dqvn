'use strict';

/* ── Constants ───────────────────────────────────────────── */
// SYNC_WORKER_URL is declared by sync.js (loaded before this script)
const RSS_ENDPOINT = SYNC_WORKER_URL + '/rss';
const CACHE_KEY = 'nl_rss_cache_v1';
const READ_KEY = 'nl_rss_v1';
const FS_KEY = 'nl_rss_fs';
const CACHE_TTL = 60 * 60_000;  // 1 hour before background refresh
const FS_STEPS = [.78, .88, 1.0, 1.12, 1.26];  // rem values for --art-fs

/* ── State ───────────────────────────────────────────────── */
let articles = [];
let readGuids = new Set();
let expanded = new Set();
let fsIdx = 2;  // default: 1.0rem

/* ── Storage helpers ─────────────────────────────────────── */
function readJSON(k, fb) {
    try { return JSON.parse(localStorage.getItem(k)) ?? fb; } catch { return fb; }
}

function loadReadState() {
    const d = readJSON(READ_KEY, { read: [], total: 0 });
    readGuids = new Set(Array.isArray(d.read) ? d.read : []);
}

function saveReadState() {
    const prev = readJSON(READ_KEY, { total: 0 });
    const arr = [...readGuids];
    const total = Math.max(prev.total || 0, arr.length);
    try { localStorage.setItem(READ_KEY, JSON.stringify({ read: arr, total })); } catch { }
}

function markOneRead(id) {
    if (readGuids.has(id)) return false;
    readGuids.add(id);
    const prev = readJSON(READ_KEY, { total: 0 });
    const total = (prev.total || 0) + 1;
    try {
        localStorage.setItem(READ_KEY, JSON.stringify({ read: [...readGuids], total }));
    } catch { }
    return true;
}

/* ── Article ID ──────────────────────────────────────────── */
function artId(a) { return a.guid || a.link || a.title || ''; }

/* ── Strip HTML ──────────────────────────────────────────── */
function stripHTML(html) {
    const d = document.createElement('div');
    d.innerHTML = html || '';
    return (d.textContent || '').replace(/\s+/g, ' ').trim();
}

/* ── HTML escape ─────────────────────────────────────────── */
function escH(s) {
    return String(s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/* ── Relative time ───────────────────────────────────────── */
function relTime(dateStr) {
    const d = new Date(dateStr);
    if (isNaN(d)) return '';
    const diff = Date.now() - d.getTime();
    if (diff < 60_000) return 'zojuist';
    if (diff < 3_600_000) return Math.floor(diff / 60_000) + ' min geleden';
    if (diff < 86_400_000) return Math.floor(diff / 3_600_000) + ' uur geleden';
    return d.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' });
}

/* ── Category color map ──────────────────────────────────── */
const CAT_COLORS = {
    sport: '#06d6a0',
    economie: '#f59e0b',
    binnenland: '#e85d04',
    buitenland: '#9b5de5',
    entertainment: '#ef476f',
    film: '#ec4899',
    muziek: '#a855f7',
    tech: '#3b82f6',
    gezondheid: '#22c55e',
    wetenschap: '#60a5fa',
    natuur: '#10b981',
    reizen: '#14b8a6',
};

function catColor(cat) {
    if (!cat) return '#64748b';
    const key = cat.toLowerCase();
    for (const [k, v] of Object.entries(CAT_COLORS)) {
        if (key.includes(k)) return v;
    }
    return '#64748b';
}

/* ── Fetch RSS feed (via Cloudflare Worker /rss) ────────── */
async function fetchFeed(silent = false) {
    const btn = document.getElementById('refresh-btn');
    btn.classList.add('spinning');

    if (!silent) {
        const st = document.getElementById('feed-status');
        st.style.display = '';
        st.innerHTML = `<span class="status-ico spinning">⟳</span><div class="status-txt">Nieuws laden…</div>`;
    }

    try {
        const res = await fetch(RSS_ENDPOINT);
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const data = await res.json();
        if (data.status !== 'ok' || !data.items?.length) throw new Error('Empty feed');

        articles = data.items;
        try {
            localStorage.setItem(CACHE_KEY, JSON.stringify({ items: articles, at: Date.now() }));
        } catch { }

        render();
        document.getElementById('feed-status').style.display = 'none';
        updateFeedTimestamp();
    } catch (err) {
        if (!silent) {
            document.getElementById('feed-status').innerHTML =
                `<span class="status-ico">⚠️</span>
           <div class="status-txt">Kan nieuws niet laden.<br>Controleer je verbinding.</div>
           <button class="status-retry" onclick="refreshFeed()">↺ &nbsp;Probeer opnieuw</button>`;
        } else if (!articles.length) {
            document.getElementById('feed-status').innerHTML =
                `<span class="status-ico">⚠️</span>
           <div class="status-txt">Geen nieuws beschikbaar.</div>
           <button class="status-retry" onclick="refreshFeed()">↺ &nbsp;Probeer opnieuw</button>`;
        }
    } finally {
        btn.classList.remove('spinning');
    }
}

function refreshFeed() { fetchFeed(false); }

function updateFeedTimestamp() {
    const el = document.getElementById('feed-updated');
    if (el) el.textContent = 'Bijgewerkt ' + new Date().toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' });
}

/* ── Render all articles ─────────────────────────────────── */
function render() {
    updateProgress();
    const list = document.getElementById('article-list');
    list.innerHTML = articles.map((a, i) => cardHTML(a, i)).join('');
    updateNavAvatar();
}

function updateProgress() {
    const readInFeed = articles.filter(a => readGuids.has(artId(a))).length;
    const total = articles.length;
    const pct = total ? Math.min(100, Math.round(readInFeed / total * 100)) : 0;

    document.getElementById('stat-read').textContent = readInFeed;
    document.getElementById('stat-total').textContent = total || '—';
    document.getElementById('stat-pct').textContent = pct + '%';
    document.getElementById('prog-fill').style.width = pct + '%';
}

/* ── Article card HTML ───────────────────────────────────── */
function cardHTML(a, i) {
    const id = artId(a);
    const isRead = readGuids.has(id);
    const isExp = expanded.has(i);

    /* Category: nu.nl uses paths like "sport/voetbal" — take last segment */
    const rawCat = (a.categories?.[0] || '');
    const cat = rawCat.split('/').filter(Boolean).pop() || '';
    const color = catColor(cat);

    const desc = stripHTML(a.description || a.content || '').slice(0, 280);
    const time = relTime(a.pubDate);
    const link = escH(a.link || '#');

    return `
      <div class="art-card${isRead ? ' is-read' : ''}${isExp ? ' expanded' : ''}" id="ac-${i}">
        <div class="art-head" onclick="toggleExpand(${i})">
          <div class="art-toprow">
            ${cat ? `<span class="art-cat" style="background:${color}">${escH(cat)}</span>` : ''}
            ${time ? `<span class="art-time">${escH(time)}</span>` : ''}
            ${isRead ? `<span class="art-read-badge">✓ Gelezen</span>` : ''}
          </div>
          <h3 class="art-title">${escH(a.title || '')}</h3>
          <div class="art-chevron">▼</div>
        </div>
        <div class="art-body">
          <div class="art-body-inner">
            <div class="art-body-hdr">
              <p class="art-body-title" onmouseup="wordAction(event)">${escH(a.title || '')}</p>
              <span class="art-collapse-btn" onclick="toggleExpand(${i})" title="Inklappen">▲</span>
            </div>
            ${desc ? `<p class="art-desc" onmouseup="wordAction(event)">${escH(desc)}${desc.length >= 280 ? '…' : ''}</p>` : ''}
            <div class="art-actions">
              <button class="art-btn" onclick="speakArt(${i})" title="Hoor de tekst in het Nederlands">
                🔊 Voorlezen
              </button>
              <a class="art-btn art-btn-open"
                 href="${link}" target="_blank" rel="noopener"
                 onclick="handleOpen(event,${i})">
                ↗ Open artikel
              </a>
              <button class="art-btn${isRead ? ' art-btn-done' : ''}"
                      id="rbtn-${i}" onclick="toggleRead(${i})">
                ${isRead ? '✓ Gelezen' : '☐ Markeer gelezen'}
              </button>
            </div>
          </div>
        </div>
      </div>`;
}

/* ── Expand / collapse ───────────────────────────────────── */
function toggleExpand(i) {
    const card = document.getElementById('ac-' + i);
    if (!card) return;
    if (expanded.has(i)) {
        expanded.delete(i);
        card.classList.remove('expanded');
    } else {
        // Collapse every other open card (accordion behaviour)
        expanded.forEach(idx => {
            document.getElementById('ac-' + idx)?.classList.remove('expanded');
        });
        expanded.clear();
        expanded.add(i);
        card.classList.add('expanded');
    }
}

/* ── Mark read toggle ────────────────────────────────────── */
function toggleRead(i) {
    const a = articles[i];
    if (!a) return;
    const id = artId(a);
    if (readGuids.has(id)) {
        readGuids.delete(id);
        saveReadState();
    } else {
        markOneRead(id);
    }
    // Re-render just this card and update progress
    const card = document.getElementById('ac-' + i);
    const isRead = readGuids.has(id);
    if (card) {
        card.classList.toggle('is-read', isRead);
        // Update read badge
        const toprow = card.querySelector('.art-toprow');
        const badge = toprow?.querySelector('.art-read-badge');
        if (isRead && !badge) {
            toprow.insertAdjacentHTML('beforeend', `<span class="art-read-badge">✓ Gelezen</span>`);
        } else if (!isRead && badge) {
            badge.remove();
        }
        // Update button
        const btn = document.getElementById('rbtn-' + i);
        if (btn) {
            btn.textContent = isRead ? '✓ Gelezen' : '☐ Markeer gelezen';
            btn.classList.toggle('art-btn-done', isRead);
        }
    }
    // Keep card expanded after action
    if (!expanded.has(i)) {
        expanded.add(i);
        card?.classList.add('expanded');
    }
    updateProgress();
}

/* ── Auto-mark read when opening external link ───────────── */
function handleOpen(e, i) {
    const a = articles[i];
    if (!a) return;
    const id = artId(a);
    if (!readGuids.has(id)) {
        markOneRead(id);
        const card = document.getElementById('ac-' + i);
        if (card) {
            card.classList.add('is-read');
            const toprow = card.querySelector('.art-toprow');
            if (toprow && !toprow.querySelector('.art-read-badge')) {
                toprow.insertAdjacentHTML('beforeend', `<span class="art-read-badge">✓ Gelezen</span>`);
            }
            const btn = document.getElementById('rbtn-' + i);
            if (btn) { btn.textContent = '✓ Gelezen'; btn.classList.add('art-btn-done'); }
        }
        updateProgress();
    }
}

/* ── TTS ─────────────────────────────────────────────────── */
function speakArt(i) {
    const a = articles[i];
    if (!a) return;
    if (speechSynthesis.speaking) speechSynthesis.cancel();
    const text = stripHTML(a.title + '. ' + (a.description || '')).slice(0, 500);
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = 'nl-NL';
    try {
        const rate = parseFloat(localStorage.getItem('nl_tts_rate') || '0.8');
        utter.rate = isNaN(rate) ? 0.8 : Math.min(1.5, Math.max(0.5, rate));
    } catch { }
    speechSynthesis.speak(utter);
}

/* ── Font size ───────────────────────────────────────────── */
function initFontSize() {
    const saved = parseInt(localStorage.getItem(FS_KEY), 10);
    if (!isNaN(saved) && saved >= 0 && saved < FS_STEPS.length) fsIdx = saved;
    _applyFs();
}

function changeFontSize(dir) {
    fsIdx = Math.max(0, Math.min(FS_STEPS.length - 1, fsIdx + dir));
    _applyFs();
    try { localStorage.setItem(FS_KEY, String(fsIdx)); } catch { }
}

function _applyFs() {
    document.documentElement.style.setProperty('--art-fs', FS_STEPS[fsIdx] + 'rem');
    document.getElementById('fs-down').disabled = fsIdx === 0;
    document.getElementById('fs-up').disabled = fsIdx === FS_STEPS.length - 1;
}

/* ── Sync drawer ─────────────────────────────────────────── */
function toggleSyncDrawer() {
    const open = document.getElementById('sync-drawer').classList.toggle('open');
    document.getElementById('sync-backdrop').classList.toggle('open', open);
}
function closeSyncDrawer() {
    document.getElementById('sync-drawer').classList.remove('open');
    document.getElementById('sync-backdrop').classList.remove('open');
}

/* ── Sync nav avatar ─────────────────────────────────────── */
function updateNavAvatar() {
    const btn = document.getElementById('sync-nav-btn');
    if (!btn) return;   // sync-nav-btn removed; sync.js handles avatar display
    const user = readJSON('fc_sync_user', null);
    if (user?.picture) {
        btn.innerHTML = `<img src="${escH(user.picture)}" alt="">`;
    }
}

/* Called by sync.js after a successful cloud sync */
function updateWordBadges() { updateNavAvatar(); }

/* ── Toast ───────────────────────────────────────────────── */
function toast(msg, dur = 2200) {
    const el = document.getElementById('_toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(el._t);
    el._t = setTimeout(() => el.classList.remove('show'), dur);
}

/* ── Word-action popup ───────────────────────────────────── */
let _wpWord = '';
const _trCache = {};   // word → translated string, survives popup close

async function fetchTranslation(word) {
    const el = document.getElementById('wp-trans');
    if (_trCache[word] !== undefined) {
        el.textContent = _trCache[word] || '—';
        el.className = _trCache[word] ? 'wp-trans ready' : 'wp-trans';
        return;
    }
    el.textContent = '⏳ vertalen…';
    el.className = 'wp-trans';
    try {
        const res = await fetch(
            `https://api.mymemory.translated.net/get?q=${encodeURIComponent(word)}&langpair=nl|en`
        );
        const data = await res.json();
        const tr = data?.responseData?.translatedText?.trim();
        if (tr && tr.toLowerCase() !== word.toLowerCase()) {
            _trCache[word] = tr;
            el.textContent = tr;
            el.className = 'wp-trans ready';
        } else {
            _trCache[word] = '';
            el.textContent = '—';
            el.className = 'wp-trans';
        }
    } catch {
        el.textContent = 'niet beschikbaar';
        el.className = 'wp-trans err';
    }
}

function wordAction(event) {
    event.stopPropagation();
    // Capture coordinates now; defer selection read so browser finalises
    // word-select (dblclick) or drag-select before we inspect it
    const cx = event.clientX;
    const cy = event.clientY;
    requestAnimationFrame(() => {
        const sel = (window.getSelection()?.toString() ?? '').trim();
        const word = sel.replace(/^[^a-zA-ZÀ-ÿ]+|[^a-zA-ZÀ-ÿ'-]+$/g, '').trim();
        if (!word) return;
        _wpWord = word;

        const popup = document.getElementById('word-popup');
        document.getElementById('wp-word').textContent = word;
        document.getElementById('wp-copy-btn').textContent = '📋 Kopiëren';

        // Measure off-screen then position near cursor / selection end
        popup.style.visibility = 'hidden';
        popup.style.left = '-9999px';
        popup.style.top = '-9999px';
        popup.classList.add('show');

        const pw = popup.offsetWidth;
        const ph = popup.offsetHeight;
        const gap = 12;
        let x = cx + gap;
        let y = cy + gap;
        if (x + pw > window.innerWidth - gap) x = cx - pw - gap;
        if (y + ph > window.innerHeight - gap) y = cy - ph - gap;

        popup.style.left = Math.max(gap, x) + 'px';
        popup.style.top = Math.max(gap, y) + 'px';
        popup.style.visibility = '';

        fetchTranslation(word);

        setTimeout(() => {
            document.addEventListener('click', _wpOutsideClick);
        }, 0);
    });
}

function _wpOutsideClick(e) {
    if (!document.getElementById('word-popup').contains(e.target)) {
        closeWordPopup();
    }
}

function closeWordPopup() {
    document.getElementById('word-popup').classList.remove('show');
    document.removeEventListener('click', _wpOutsideClick);
}

function wordSpeak() {
    if (!_wpWord) return;
    if (speechSynthesis.speaking) speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(_wpWord);
    u.lang = 'nl-NL';
    try {
        const r = parseFloat(localStorage.getItem('nl_tts_rate') || '0.8');
        u.rate = isNaN(r) ? 0.8 : Math.min(1.5, Math.max(0.5, r));
    } catch { }
    speechSynthesis.speak(u);
}

async function wordCopy() {
    if (!_wpWord) return;
    try {
        await navigator.clipboard.writeText(_wpWord);
        const btn = document.getElementById('wp-copy-btn');
        btn.textContent = '✓ Gekopieerd';
        setTimeout(() => { btn.textContent = '📋 Kopiëren'; }, 1400);
    } catch { }
}

/* ── Boot ────────────────────────────────────────────────── */
async function init() {
    initFontSize();
    loadReadState();

    const cached = readJSON(CACHE_KEY, null);
    if (cached?.items?.length) {
        articles = cached.items;
        render();
        document.getElementById('feed-status').style.display = 'none';
        if (cached.at) {
            updateFeedTimestamp();
            if (Date.now() - cached.at > CACHE_TTL) fetchFeed(true);
        }
    } else {
        await fetchFeed(false);
    }
}

init();