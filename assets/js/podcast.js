'use strict';

/* ── Constants ───────────────────────────────────────────── */
const PODCAST_ENDPOINT = SYNC_WORKER_URL + '/podcast';
const CACHE_KEY = 'nl_podcast_cache_v1';
const LISTENED_KEY = 'nl_podcast_v1';
const FS_KEY = 'nl_podcast_fs';
const CACHE_TTL = 60 * 60_000;   // 1 hour
const FS_STEPS = [.78, .88, 1.0, 1.12, 1.26];
const LISTEN_TARGET = 20;            // episodes for 100% dashboard progress

/* ── State ───────────────────────────────────────────────── */
let episodes = [];
let listenedGuids = new Set();
let expanded = new Set();
let fsIdx = 2;
let _nowPlaying = -1;  // index of currently playing episode

/* ── Storage helpers ─────────────────────────────────────── */
function readJSON(k, fb) {
    try { return JSON.parse(localStorage.getItem(k)) ?? fb; } catch { return fb; }
}

function loadListenState() {
    const d = readJSON(LISTENED_KEY, { listened: [], total: 0 });
    listenedGuids = new Set(Array.isArray(d.listened) ? d.listened : []);
}

function saveListenState() {
    const prev = readJSON(LISTENED_KEY, { total: 0 });
    const arr = [...listenedGuids];
    const total = Math.max(prev.total || 0, arr.length);
    try { localStorage.setItem(LISTENED_KEY, JSON.stringify({ listened: arr, total })); } catch { }
}

function markOneListened(id) {
    if (listenedGuids.has(id)) return false;
    listenedGuids.add(id);
    const prev = readJSON(LISTENED_KEY, { total: 0 });
    const total = (prev.total || 0) + 1;
    try {
        localStorage.setItem(LISTENED_KEY, JSON.stringify({ listened: [...listenedGuids], total }));
    } catch { }
    return true;
}

/* ── Episode ID ──────────────────────────────────────────── */
function epId(ep) { return ep.guid || ep.link || ep.title || ''; }

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

/* ── Duration display ────────────────────────────────────── */
function fmtDuration(dur) {
    if (!dur) return '';
    // dur may be "HH:MM:SS" or "MM:SS" or plain seconds
    if (/^\d+$/.test(dur)) {
        const s = parseInt(dur, 10);
        const h = Math.floor(s / 3600);
        const m = Math.floor((s % 3600) / 60);
        const ss = s % 60;
        return h > 0
            ? `${h}:${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}`
            : `${m}:${String(ss).padStart(2, '0')}`;
    }
    return dur; // already formatted
}

/* ── Fetch feed (via Cloudflare Worker /podcast) ─────────── */
async function fetchFeed(silent = false) {
    const btn = document.getElementById('refresh-btn');
    btn.classList.add('spinning');

    if (!silent) {
        const st = document.getElementById('feed-status');
        st.style.display = '';
        st.innerHTML = `<span class="status-ico spinning">⟳</span><div class="status-txt">Afleveringen laden…</div>`;
    }

    try {
        const res = await fetch(PODCAST_ENDPOINT);
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const data = await res.json();
        if (data.status !== 'ok' || !data.items?.length) throw new Error('Empty feed');

        episodes = data.items;
        try {
            localStorage.setItem(CACHE_KEY, JSON.stringify({ items: episodes, at: Date.now() }));
        } catch { }

        render();
        document.getElementById('feed-status').style.display = 'none';
        updateFeedTimestamp();
    } catch (err) {
        if (!silent) {
            document.getElementById('feed-status').innerHTML =
                `<span class="status-ico">⚠️</span>
           <div class="status-txt">Kan afleveringen niet laden.<br>Controleer je verbinding.</div>
           <button class="status-retry" onclick="refreshFeed()">↺ &nbsp;Probeer opnieuw</button>`;
        } else if (!episodes.length) {
            document.getElementById('feed-status').innerHTML =
                `<span class="status-ico">⚠️</span>
           <div class="status-txt">Geen afleveringen beschikbaar.</div>
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

/* ── Render all episodes ─────────────────────────────────── */
function render() {
    updateProgress();
    const list = document.getElementById('episode-list');
    list.innerHTML = episodes.map((ep, i) => cardHTML(ep, i)).join('');
    updateNavAvatar();
}

function updateProgress() {
    const listenedInFeed = episodes.filter(ep => listenedGuids.has(epId(ep))).length;
    const total = episodes.length;
    const pct = total ? Math.min(100, Math.round(listenedInFeed / total * 100)) : 0;

    document.getElementById('stat-listened').textContent = listenedInFeed;
    document.getElementById('stat-total').textContent = total || '—';
    document.getElementById('stat-pct').textContent = pct + '%';
    document.getElementById('prog-fill').style.width = pct + '%';
}

/* ── Episode card HTML ───────────────────────────────────── */
function cardHTML(ep, i) {
    const id = epId(ep);
    const isListened = listenedGuids.has(id);
    const isExp = expanded.has(i);

    const desc = stripHTML(ep.description || '').slice(0, 300);
    const time = relTime(ep.pubDate);
    const dur = fmtDuration(ep.duration || '');
    const epNum = ep.episode ? `Afl. ${ep.episode}` : '';
    const audioUrl = escH(ep.audioUrl || '');
    const link = escH(ep.link || '#');

    return `
      <div class="art-card${isListened ? ' is-listened' : ''}${isExp ? ' expanded' : ''}" id="ac-${i}">
        <div class="art-head" onclick="toggleExpand(${i})">
          <div class="art-toprow">
            ${epNum ? `<span class="art-cat" style="background:#9b5de5">${escH(epNum)}</span>` : ''}
            ${dur ? `<span class="art-dur">⏱ ${escH(dur)}</span>` : ''}
            ${time ? `<span class="art-time">${escH(time)}</span>` : ''}
            ${isListened ? `<span class="art-read-badge">✓ Beluisterd</span>` : ''}
          </div>
          <h3 class="art-title">${escH(ep.title || '')}</h3>
          <div class="art-chevron">▼</div>
        </div>
        <div class="art-body">
          <div class="art-body-inner">
            <div class="art-body-hdr">
              <p class="art-body-title" onmouseup="wordAction(event)">${escH(ep.title || '')}</p>
              <span class="art-collapse-btn" onclick="toggleExpand(${i})" title="Inklappen">▲</span>
            </div>
            ${desc ? `<p class="art-desc" onmouseup="wordAction(event)">${escH(desc)}${desc.length >= 300 ? '…' : ''}</p>` : ''}
            ${audioUrl ? `
              <div class="ep-player">
                <div class="ep-player-label">🎙️ Luisterfragment</div>
                <audio id="ep-audio-${i}"
                       src="${audioUrl}"
                       controls
                       preload="none"
                       onended="episodeEnded(${i})"
                       onplay="episodePlaying(${i})"
                       class="ep-audio"></audio>
              </div>` : ''}
            <div class="art-actions">
              <button class="art-btn" onclick="speakEpTitle(${i})" title="Hoor de titel in het Nederlands">
                🔊 Voorlezen
              </button>
              ${link !== '#' ? `
                <a class="art-btn art-btn-open"
                   href="${link}" target="_blank" rel="noopener">
                  ↗ Open pagina
                </a>` : ''}
              <button class="art-btn${isListened ? ' art-btn-done' : ''}"
                      id="rbtn-${i}" onclick="toggleListened(${i})">
                ${isListened ? '✓ Beluisterd' : '☐ Markeer beluisterd'}
              </button>
            </div>
          </div>
        </div>
      </div>`;
}

/* ── Expand / collapse (accordion) ──────────────────────── */
function toggleExpand(i) {
    const card = document.getElementById('ac-' + i);
    if (!card) return;
    if (expanded.has(i)) {
        // Pause audio if playing
        const audio = document.getElementById('ep-audio-' + i);
        if (audio && !audio.paused) audio.pause();
        expanded.delete(i);
        card.classList.remove('expanded');
    } else {
        // Collapse every other open card and pause their audio
        expanded.forEach(idx => {
            document.getElementById('ac-' + idx)?.classList.remove('expanded');
            const a = document.getElementById('ep-audio-' + idx);
            if (a && !a.paused) a.pause();
        });
        expanded.clear();
        expanded.add(i);
        card.classList.add('expanded');
    }
}

/* ── Audio events ────────────────────────────────────────── */
function episodePlaying(i) {
    // Pause any other playing audio
    if (_nowPlaying !== -1 && _nowPlaying !== i) {
        const prev = document.getElementById('ep-audio-' + _nowPlaying);
        if (prev && !prev.paused) prev.pause();
    }
    _nowPlaying = i;
}

function episodeEnded(i) {
    _nowPlaying = -1;
    // Auto-mark as listened when episode finishes
    const ep = episodes[i];
    if (!ep) return;
    const id = epId(ep);
    if (!listenedGuids.has(id)) {
        markOneListened(id);
        updateCardListened(i, true);
        updateProgress();
        toast('🎧 Aflevering beluisterd!');
    }
}

/* ── Toggle listened ─────────────────────────────────────── */
function toggleListened(i) {
    const ep = episodes[i];
    if (!ep) return;
    const id = epId(ep);
    if (listenedGuids.has(id)) {
        listenedGuids.delete(id);
        saveListenState();
        updateCardListened(i, false);
    } else {
        markOneListened(id);
        updateCardListened(i, true);
    }
    if (!expanded.has(i)) {
        expanded.add(i);
        document.getElementById('ac-' + i)?.classList.add('expanded');
    }
    updateProgress();
}

function updateCardListened(i, isListened) {
    const card = document.getElementById('ac-' + i);
    if (!card) return;
    card.classList.toggle('is-listened', isListened);
    const toprow = card.querySelector('.art-toprow');
    const badge = toprow?.querySelector('.art-read-badge');
    if (isListened && !badge) {
        toprow.insertAdjacentHTML('beforeend', `<span class="art-read-badge">✓ Beluisterd</span>`);
    } else if (!isListened && badge) {
        badge.remove();
    }
    const btn = document.getElementById('rbtn-' + i);
    if (btn) {
        btn.textContent = isListened ? '✓ Beluisterd' : '☐ Markeer beluisterd';
        btn.classList.toggle('art-btn-done', isListened);
    }
}

/* ── TTS for title ───────────────────────────────────────── */
function speakEpTitle(i) {
    const ep = episodes[i];
    if (!ep) return;
    if (speechSynthesis.speaking) speechSynthesis.cancel();
    const text = stripHTML(ep.title + '. ' + (ep.description || '')).slice(0, 400);
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

function updateNavAvatar() {
    const btn = document.getElementById('sync-nav-btn');
    if (!btn) return;   // sync-nav-btn removed; sync.js handles avatar display
    const user = readJSON('fc_sync_user', null);
    if (user?.picture) {
        btn.innerHTML = `<img src="${escH(user.picture)}" alt="">`;
    }
}

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
const _trCache = {};

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
    loadListenState();

    const cached = readJSON(CACHE_KEY, null);
    if (cached?.items?.length) {
        episodes = cached.items;
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