
'use strict';

/* ── Constants ─────────────────────────────────────────── */
const PKGS_KEY = 'nl_wheel_pkgs';
const ACTIVE_KEY = 'nl_wheel_active';
const HIST_KEY = 'nl_wheel_hist';
const MAX_HIST = 8;
const MAX_ITEMS = 50;

const COLORS = [
    '#e85d04', '#ffd166', '#06d6a0', '#118ab2',
    '#ef476f', '#9b5de5', '#f77f00', '#2ec4b6',
];

const DEFAULT_PKG = {
    id: 'default',
    name: 'Dagelijkse vragen 🇳🇱',
    items: [
        'Hoe gaat het?',
        'Hoe heet je?',
        'Waar kom je vandaan?',
        'Waar woon je?',
        'Wat doe je?',
        'Hoe oud ben je?',
        'Spreek je Nederlands?',
        'Wat is je hobby?',
        'Heb je een huisdier?',
        'Wat eet je graag?',
        'Wanneer slaap je?',
        'Wat vind je leuk?',
        'Ben je getrouwd?',
        'Heb je kinderen?',
        'Wat is je favoriete kleur?',
    ],
};

/* ── State ─────────────────────────────────────────────── */
let packages = [];
let activePkgId = null;
let spinHistory = [];
let spinning = false;
let rotation = 0;       // current wheel angle (radians)
let winnerIdx = -1;      // index of last selected item
let editingId = null;    // null = creating new package
let _lastSeg = -1;      // for tick sound
let _audioCtx = null;    // lazy Web Audio context
let _spinAF = null;    // rAF handle

/* ── Canvas ─────────────────────────────────────────────── */
const canvas = document.getElementById('wheel-canvas');

function resizeCanvas() {
    const desktop = window.innerWidth > 680;
    let size;

    if (desktop) {
        // Width: full viewport minus list col (320), gap (28), side padding (32+24)
        const availW = window.innerWidth - 320 - 28 - 32 - 24;
        // Height: viewport minus fixed nav (56), layout padding-top (20), bottom breathing room (44)
        // Sync section is in the side drawer (not inline), spin button is in the right column —
        // so the wheel column height is essentially the full viewport content area.
        const availH = window.innerHeight - 56 - 20 - 44;
        size = Math.max(Math.min(availW, availH), 300);
    } else {
        size = Math.min(window.innerWidth - 32, 380);
    }

    canvas.width = size;
    canvas.height = size;

    // Scale pointer triangle proportionally to canvas
    const half = Math.round(size * 0.034);
    const tall = Math.round(size * 0.068);
    const ptr = document.getElementById('wheel-pointer');
    ptr.style.borderLeftWidth = half + 'px';
    ptr.style.borderRightWidth = half + 'px';
    ptr.style.borderTopWidth = tall + 'px';

    drawWheel();
}

function drawWheel() {
    const ctx = canvas.getContext('2d');
    const items = getActiveItems();
    const n = items.length;
    const cx = canvas.width / 2;
    const cy = canvas.height / 2;
    const r = Math.min(cx, cy) - 6;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (n === 0) {
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, 2 * Math.PI);
        ctx.fillStyle = 'rgba(255,255,255,.04)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,.14)';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.fillStyle = 'rgba(241,245,249,.35)';
        ctx.font = `700 14px Nunito, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('Voeg items toe →', cx, cy);
        return;
    }

    const segArc = (2 * Math.PI) / n;
    const fontSize = Math.max(9, Math.min(14, 14 - n * 0.12));

    for (let i = 0; i < n; i++) {
        const startAng = rotation + i * segArc;
        const endAng = startAng + segArc;
        const color = COLORS[i % COLORS.length];

        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.arc(cx, cy, r, startAng, endAng);
        ctx.closePath();
        ctx.fillStyle = color;
        ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,.3)';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(startAng + segArc / 2);
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#fff';
        ctx.font = `800 ${fontSize}px Nunito, sans-serif`;
        ctx.shadowColor = 'rgba(0,0,0,.5)';
        ctx.shadowBlur = 3;
        const maxLen = n <= 6 ? 26 : n <= 12 ? 20 : 15;
        const label = items[i].length > maxLen ? items[i].slice(0, maxLen - 1) + '…' : items[i];
        ctx.fillText(label, r - 12, 0);
        ctx.restore();
    }

    // Rim ring
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, 2 * Math.PI);
    ctx.strokeStyle = 'rgba(255,255,255,.18)';
    ctx.lineWidth = 3;
    ctx.stroke();

    // Center cap
    ctx.beginPath();
    ctx.arc(cx, cy, 24, 0, 2 * Math.PI);
    ctx.fillStyle = '#0f172a';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,.22)';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.font = '16px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#fff';
    ctx.fillText('🎲', cx, cy + 1);
}

/* ── Spin ───────────────────────────────────────────────── */
function spin() {
    const items = getActiveItems();
    if (spinning) return;
    if (items.length < 2) {
        showToast('Voeg minimaal 2 items toe om te draaien! 🎡');
        return;
    }

    closeResultModal();
    spinning = true;
    winnerIdx = -1;
    document.getElementById('spin-btn').disabled = true;
    canvas.classList.add('spinning');

    const startRot = rotation;
    const totalSpin = (2 * Math.PI) * (6 + Math.random() * 6);
    const duration = 3600 + Math.random() * 1800;
    const startTime = performance.now();
    _lastSeg = -1;

    function frame(now) {
        const elapsed = now - startTime;
        const t = Math.min(elapsed / duration, 1);
        const eased = 1 - Math.pow(1 - t, 4);

        rotation = startRot + totalSpin * eased;
        drawWheel();
        _checkTick(items.length);

        if (t < 1) {
            _spinAF = requestAnimationFrame(frame);
            return;
        }

        // Done
        rotation = rotation % (2 * Math.PI);
        spinning = false;
        canvas.classList.remove('spinning');
        document.getElementById('spin-btn').disabled = false;

        const segArc = (2 * Math.PI) / items.length;
        const norm = ((-Math.PI / 2 - rotation) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
        winnerIdx = Math.floor(norm / segArc) % items.length;
        _showResult(items[winnerIdx], winnerIdx);
    }

    _spinAF = requestAnimationFrame(frame);
}

function _checkTick(n) {
    if (!n) return;
    const segArc = (2 * Math.PI) / n;
    const norm = ((-Math.PI / 2 - rotation) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
    const seg = Math.floor(norm / segArc) % n;
    if (seg !== _lastSeg) { _lastSeg = seg; playTick(); }
}

function _showResult(text, idx) {
    const color = COLORS[idx % COLORS.length];
    document.getElementById('rcard-text').textContent = text;
    document.getElementById('rcard-text').style.color = color;
    document.getElementById('rcard-bar').style.background = color;
    document.getElementById('rcard-glow').style.background = color;

    const modal = document.getElementById('result-modal');
    modal.classList.remove('hidden');
    const card = modal.querySelector('.rcard');
    card.style.animation = 'none';
    requestAnimationFrame(() => { card.style.animation = ''; });

    addHistory(text, idx);
    speak(text);
    launchConfetti();

    // Copy picked item to clipboard automatically
    navigator.clipboard?.writeText(text)
        .then(() => showToast('📋 Gekopieerd naar klembord'))
        .catch(() => {});
}

function closeResultModal() {
    document.getElementById('result-modal').classList.add('hidden');
}

function speakResult() {
    speak(document.getElementById('rcard-text').textContent);
}

function closeResultAndSpin() {
    closeResultModal();
    winnerIdx = -1;
    setTimeout(spin, 80);
}

function removeWinner() {
    const pkg = getActivePkg();
    if (!pkg || winnerIdx < 0 || winnerIdx >= pkg.items.length) return;
    pkg.items.splice(winnerIdx, 1);
    winnerIdx = -1;
    savePackages();
    renderItemsList();
    drawWheel();
    closeResultModal();
    if (pkg.items.length === 0) showToast('Pakket is leeg! Voeg nieuwe items toe.');
}

function hideResult() {
    closeResultModal();
    winnerIdx = -1;
}

/* ── History ────────────────────────────────────────────── */
function addHistory(text, idx) {
    spinHistory.unshift({ text, color: COLORS[idx % COLORS.length], ts: Date.now() });
    if (spinHistory.length > MAX_HIST) spinHistory.pop();
    try { localStorage.setItem(HIST_KEY, JSON.stringify(spinHistory)); } catch { }
    renderHistory();
}

function renderHistory() {
    const list = document.getElementById('history-list');
    if (!spinHistory.length) {
        list.innerHTML = '<div class="empty-msg">Nog geen draaien…</div>';
        return;
    }
    list.innerHTML = spinHistory.map(h => `
      <div class="hist-item">
        <div class="hist-dot" style="background:${h.color}"></div>
        <div class="hist-text">${_esc(h.text)}</div>
        <div class="hist-time">${_relTime(h.ts)}</div>
      </div>`).join('');
}

/* ── Package helpers ────────────────────────────────────── */
function getActivePkg() { return packages.find(p => p.id === activePkgId) ?? packages[0] ?? null; }
function getActiveItems() { return getActivePkg()?.items ?? []; }

function selectPackage(id) {
    activePkgId = id;
    try { localStorage.setItem(ACTIVE_KEY, id); } catch { }
    closeResultModal();
    winnerIdx = -1;
    renderItemsList();
    drawWheel();
}

function renderPkgSelect() {
    const sel = document.getElementById('pkg-select');
    sel.innerHTML = packages.map(p =>
        `<option value="${_esc(p.id)}" ${p.id === activePkgId ? 'selected' : ''}>${_esc(p.name)}</option>`
    ).join('');
}

function renderItemsList() {
    const items = getActiveItems();
    document.getElementById('item-count').textContent = items.length;
    const list = document.getElementById('items-list');
    if (!items.length) {
        list.innerHTML = '<div class="empty-msg">Geen items — voeg er een toe hieronder!</div>';
        return;
    }
    list.innerHTML = items.map((item, i) => `
      <div class="item-chip">
        <div class="chip-dot" style="background:${COLORS[i % COLORS.length]}"></div>
        <div class="chip-text" title="${_esc(item)}">${_esc(item)}</div>
        <button class="chip-del" onclick="deleteInlineItem(${i})" title="Verwijderen">×</button>
      </div>`).join('');
}

function addInlineItem() {
    const input = document.getElementById('add-item-input');
    const text = input.value.trim();
    if (!text) return;
    const pkg = getActivePkg();
    if (!pkg) { showToast('Selecteer eerst een pakket'); return; }
    if (pkg.items.length >= MAX_ITEMS) { showToast(`Max. ${MAX_ITEMS} items per pakket`); return; }
    pkg.items.push(text);
    input.value = '';
    savePackages();
    renderItemsList();
    drawWheel();
    input.focus();
}

function deleteInlineItem(idx) {
    const pkg = getActivePkg();
    if (!pkg) return;
    pkg.items.splice(idx, 1);
    if (winnerIdx === idx) { winnerIdx = -1; closeResultModal(); }
    savePackages();
    renderItemsList();
    drawWheel();
}

/* ── Package CRUD ───────────────────────────────────────── */
function openPkgModal() {
    document.getElementById('pkg-editor').classList.add('hidden');
    renderModalPkgList();
    document.getElementById('pkg-modal').classList.remove('hidden');
}

function closePkgModal() {
    document.getElementById('pkg-modal').classList.add('hidden');
    document.getElementById('pkg-editor').classList.add('hidden');
    editingId = null;
    renderPkgSelect();
    renderItemsList();
    drawWheel();
}

function renderModalPkgList() {
    document.getElementById('modal-pkg-list').innerHTML = packages.map(p => `
      <div class="modal-pkg-row ${p.id === activePkgId ? 'is-active' : ''}">
        <div class="mpkg-icon">${p.id === 'default' ? '🇳🇱' : '📋'}</div>
        <div class="mpkg-info">
          <div class="mpkg-name">${_esc(p.name)}</div>
          <div class="mpkg-count">${p.items.length} item${p.items.length !== 1 ? 's' : ''}</div>
        </div>
        <div class="mpkg-acts">
          <button class="mpkg-btn" onclick="editPackage('${_esc(p.id)}')">✏️ Bewerk</button>
          ${p.id !== 'default'
            ? `<button class="mpkg-btn danger" onclick="deletePackage('${_esc(p.id)}')">✕</button>`
            : ''}
        </div>
      </div>`).join('');
}

function editPackage(id) {
    editingId = id;
    const pkg = packages.find(p => p.id === id);
    if (!pkg) return;
    document.getElementById('editor-name').value = pkg.name;
    document.getElementById('editor-items').value = pkg.items.join('\n');
    document.getElementById('pkg-editor').classList.remove('hidden');
    document.getElementById('editor-name').focus();
    document.getElementById('pkg-editor').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function newPackage() {
    editingId = null;
    document.getElementById('editor-name').value = '';
    document.getElementById('editor-items').value = '';
    document.getElementById('pkg-editor').classList.remove('hidden');
    document.getElementById('editor-name').focus();
    document.getElementById('pkg-editor').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function saveEdit() {
    const name = document.getElementById('editor-name').value.trim();
    const raw = document.getElementById('editor-items').value;
    const items = raw.split('\n').map(s => s.trim()).filter(Boolean).slice(0, MAX_ITEMS);

    if (!name) { showToast('Geef het pakket een naam'); return; }
    if (!items.length) { showToast('Voeg minimaal 1 item toe'); return; }

    if (editingId) {
        const pkg = packages.find(p => p.id === editingId);
        if (pkg) { pkg.name = name; pkg.items = items; }
    } else {
        const np = { id: 'pkg_' + Date.now(), name, items };
        packages.push(np);
        activePkgId = np.id;
        try { localStorage.setItem(ACTIVE_KEY, activePkgId); } catch { }
    }

    savePackages();
    document.getElementById('pkg-editor').classList.add('hidden');
    editingId = null;
    renderModalPkgList();
    showToast('✓ Pakket opgeslagen!');
}

function cancelEdit() {
    document.getElementById('pkg-editor').classList.add('hidden');
    editingId = null;
}

function deletePackage(id) {
    if (!confirm('Pakket verwijderen? Dit kan niet ongedaan worden gemaakt.')) return;
    packages = packages.filter(p => p.id !== id);
    if (activePkgId === id) {
        activePkgId = packages[0]?.id ?? null;
        try { if (activePkgId) localStorage.setItem(ACTIVE_KEY, activePkgId); } catch { }
    }
    savePackages();
    renderModalPkgList();
    showToast('Pakket verwijderd');
}

/* ── Persistence ────────────────────────────────────────── */
function savePackages() {
    try { localStorage.setItem(PKGS_KEY, JSON.stringify(packages)); } catch { }
    if (typeof scheduleAutoSync === 'function') scheduleAutoSync();
}

/* ── Boot ───────────────────────────────────────────────── */
function init() {
    let saved;
    try { saved = JSON.parse(localStorage.getItem(PKGS_KEY) || 'null'); } catch { }

    if (Array.isArray(saved) && saved.length > 0) {
        packages = saved;
        if (!packages.find(p => p.id === 'default')) packages.unshift(DEFAULT_PKG);
    } else {
        packages = [{ ...DEFAULT_PKG, items: [...DEFAULT_PKG.items] }];
        savePackages();
    }

    const savedActive = localStorage.getItem(ACTIVE_KEY);
    activePkgId = packages.find(p => p.id === savedActive)?.id ?? packages[0].id;

    try { spinHistory = JSON.parse(localStorage.getItem(HIST_KEY) || '[]'); } catch { }
    if (!Array.isArray(spinHistory)) spinHistory = [];

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    renderPkgSelect();
    renderItemsList();
    renderHistory();

    document.fonts.ready.then(() => drawWheel());
}

/* ── TTS ─────────────────────────────────────────────────── */
function speak(text) {
    if (!window.speechSynthesis) return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'nl-NL'; u.rate = 0.85;
    speechSynthesis.speak(u);
}

/* ── Tick sound ──────────────────────────────────────────── */
function playTick() {
    try {
        if (!_audioCtx) _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = _audioCtx.createOscillator();
        const g = _audioCtx.createGain();
        osc.connect(g); g.connect(_audioCtx.destination);
        osc.frequency.value = 800 + Math.random() * 300;
        g.gain.setValueAtTime(0.07, _audioCtx.currentTime);
        g.gain.exponentialRampToValueAtTime(0.001, _audioCtx.currentTime + 0.04);
        osc.start(_audioCtx.currentTime);
        osc.stop(_audioCtx.currentTime + 0.04);
    } catch { }
}

/* ── Confetti ────────────────────────────────────────────── */
function launchConfetti() {
    const root = document.createElement('div');
    root.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:9999;overflow:hidden';
    for (let i = 0; i < 50; i++) {
        const p = document.createElement('div');
        const s = 5 + Math.random() * 8;
        p.style.cssText = `
        position:absolute;top:-14px;
        left:${Math.random() * 100}%;
        background:${COLORS[i % COLORS.length]};
        width:${s}px;height:${s}px;
        border-radius:${Math.random() > .5 ? '50%' : '2px'};
        animation:cfall ${.85 + Math.random() * 1.4}s ${Math.random() * .5}s linear forwards;
      `;
        root.appendChild(p);
    }
    document.body.appendChild(root);
    setTimeout(() => root.remove(), 3400);
}

/* ── Helpers ─────────────────────────────────────────────── */
function _esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function _relTime(ts) {
    const d = Date.now() - ts;
    if (d < 60_000) return 'zojuist';
    if (d < 3_600_000) return Math.floor(d / 60_000) + 'm';
    if (d < 86_400_000) return Math.floor(d / 3_600_000) + 'u';
    return Math.floor(d / 86_400_000) + 'd';
}

function showToast(msg) {
    let t = document.getElementById('_toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(t._t);
    t._t = setTimeout(() => t.classList.remove('show'), 3200);
}

/* ── Sync drawer ────────────────────────────────────────── */
function toggleSyncDrawer() {
    document.getElementById('sync-drawer').classList.contains('open')
        ? closeSyncDrawer() : openSyncDrawer();
}

function openSyncDrawer() {
    document.getElementById('sync-drawer').classList.add('open');
    document.getElementById('sync-backdrop').classList.add('open');
}

function closeSyncDrawer() {
    document.getElementById('sync-drawer').classList.remove('open');
    document.getElementById('sync-backdrop').classList.remove('open');
}

/* Update the nav button to show user avatar once logged in */
function _updateSyncNavBtn() {
    const btn = document.getElementById('sync-nav-btn');
    if (!btn) return;
    try {
        const u = JSON.parse(localStorage.getItem('fc_sync_user') || 'null');
        if (u?.picture) {
            btn.innerHTML = `<img src="${_esc(u.picture)}" alt="" onerror="this.parentElement.innerHTML='☁️'">`;
            btn.style.border = '2px solid var(--teal)';
        } else {
            btn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`;
            btn.style.border = '';
        }
    } catch { }
}

/* ── Keyboard shortcuts ──────────────────────────────────── */
document.addEventListener('keydown', e => {
    if (e.target.closest('input, textarea, select')) return;
    if (e.code === 'Space') { e.preventDefault(); spin(); }
    if (e.key === 'Escape') { hideResult(); closePkgModal(); closeSyncDrawer(); }
});

/* ── Backdrop clicks close their respective modals ───────── */
document.getElementById('result-modal').addEventListener('click', e => {
    if (e.target === e.currentTarget) hideResult();
});
document.getElementById('pkg-modal').addEventListener('click', e => {
    if (e.target === e.currentTarget) closePkgModal();
});

init();

/* Watch #sync-section for login/logout to update the nav avatar */
new MutationObserver(_updateSyncNavBtn)
    .observe(document.getElementById('sync-section'), { childList: true, subtree: true });
_updateSyncNavBtn();
