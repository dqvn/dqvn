
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
    const colW = desktop
        ? Math.max(320, window.innerWidth - 320 - 28 - 32 - 24)
        : window.innerWidth - 32;

    const r = Math.floor(colW / 2) - 10;
    canvas.width  = colW;
    // 24 px of headroom above the wheel rim for the pointer triangle to overlap
    canvas.height = r + 24;

    // Fixed pointer size that reads well at any canvas width
    const ptr = document.getElementById('wheel-pointer');
    ptr.style.borderLeftWidth  = '14px';
    ptr.style.borderRightWidth = '14px';
    ptr.style.borderTopWidth   = '26px';

    drawWheel();
}

function drawWheel() {
    const ctx = canvas.getContext('2d');
    const items = getActiveItems();
    const n  = items.length;
    const cx = canvas.width / 2;
    // Center sits at the canvas bottom edge — only the top semicircle is visible
    const cy = canvas.height;
    const r  = cx - 10;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (n === 0) {
        ctx.beginPath();
        ctx.arc(cx, cy, r, Math.PI, 2 * Math.PI);
        ctx.fillStyle = 'rgba(255,255,255,.04)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,.14)';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.fillStyle = 'rgba(241,245,249,.35)';
        ctx.font = `700 15px Nunito, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('Voeg items toe →', cx, cy - r * 0.5);
        _drawDecorations(ctx, cx, cy, r);
        return;
    }

    const segArc   = (2 * Math.PI) / n;
    // Perpendicular arc height available per segment (at ~55% of radius)
    const arcH     = r * 0.55 * segArc;
    // Base font: size the text to fill roughly 2 lines of that height.
    // arcH / 2.9 gives lh = fs*1.45 ≈ arcH/2 → 2 lines fit comfortably.
    // Capped at r*0.07 so text never dwarfs the segment on a very wide wheel.
    const baseFs   = Math.max(10, Math.min(r * 0.07, arcH / 2.9));
    const textMaxW = r - 38;

    for (let i = 0; i < n; i++) {
        const startAng = rotation + i * segArc;
        const endAng   = startAng + segArc;
        const color    = COLORS[i % COLORS.length];

        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.arc(cx, cy, r, startAng, endAng);
        ctx.closePath();
        ctx.fillStyle = color;
        ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,.28)';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(startAng + segArc / 2);
        ctx.textAlign    = 'right';
        ctx.textBaseline = 'middle';
        ctx.fillStyle    = '#fff';
        ctx.shadowColor  = 'rgba(0,0,0,.55)';
        ctx.shadowBlur   = 4;

        const text    = items[i];
        // Shrink font for longer items; floor at 72% of baseFs so it stays legible
        const overLen = Math.max(0, text.length - 14);
        const fs      = Math.max(Math.round(baseFs * 0.72),
                                 Math.round(baseFs) - Math.floor(overLen / 5));
        const lh      = fs * 1.45;
        ctx.font      = `800 ${fs}px Nunito, sans-serif`;

        const words = text.split(' ');
        const lines = [];
        let cur = '';
        for (const w of words) {
            const test = cur ? cur + ' ' + w : w;
            if (ctx.measureText(test).width <= textMaxW) {
                cur = test;
            } else {
                if (cur) lines.push(cur);
                cur = ctx.measureText(w).width > textMaxW
                    ? w.slice(0, Math.max(1, Math.floor(w.length * textMaxW / ctx.measureText(w).width))) + '…'
                    : w;
            }
        }
        if (cur) lines.push(cur);

        const maxLines = Math.min(5, Math.max(1, Math.floor(arcH / lh)));
        const vis      = lines.slice(0, maxLines);
        const totalH   = (vis.length - 1) * lh;
        vis.forEach((line, j) => {
            ctx.fillText(line, r - 16, j * lh - totalH / 2);
        });

        ctx.restore();
    }

    _drawDecorations(ctx, cx, cy, r);
}

function _drawDecorations(ctx, cx, cy, r) {
    // Inner rim (top arc only)
    ctx.beginPath();
    ctx.arc(cx, cy, r, Math.PI, 2 * Math.PI);
    ctx.strokeStyle = 'rgba(255,255,255,.22)';
    ctx.lineWidth = 3;
    ctx.shadowBlur = 0;
    ctx.stroke();

    // Outer glow ring
    ctx.beginPath();
    ctx.arc(cx, cy, r + 6, Math.PI, 2 * Math.PI);
    ctx.strokeStyle = 'rgba(255,209,102,.65)';
    ctx.lineWidth   = 6;
    ctx.shadowColor = 'rgba(255,209,102,.8)';
    ctx.shadowBlur  = 18;
    ctx.stroke();
    ctx.shadowBlur  = 0;

    // Second outer ring (deep blue — like reference image border)
    ctx.beginPath();
    ctx.arc(cx, cy, r + 14, Math.PI, 2 * Math.PI);
    ctx.strokeStyle = 'rgba(30,100,200,.55)';
    ctx.lineWidth   = 8;
    ctx.shadowColor = 'rgba(60,140,255,.5)';
    ctx.shadowBlur  = 12;
    ctx.stroke();
    ctx.shadowBlur  = 0;

    // LED dots along the outer rim
    const numLEDs = Math.max(16, Math.floor(r * Math.PI / 18));
    for (let i = 0; i <= numLEDs; i++) {
        const a  = Math.PI + (i / numLEDs) * Math.PI;   // π→2π = left→top→right
        const lx = cx + (r + 22) * Math.cos(a);
        const ly = cy + (r + 22) * Math.sin(a);
        if (ly >= cy) continue;   // skip any dot below canvas edge

        const bright = i % 3 === 0;
        ctx.beginPath();
        ctx.arc(lx, ly, bright ? 5 : 3.5, 0, 2 * Math.PI);
        ctx.fillStyle   = bright ? '#ffd166' : 'rgba(255,255,255,.9)';
        ctx.shadowColor = bright ? '#ffd166' : '#93c5fd';
        ctx.shadowBlur  = bright ? 12 : 7;
        ctx.fill();
    }
    ctx.shadowBlur = 0;

    // Center hub (top half only — bottom is off-canvas)
    ctx.beginPath();
    ctx.arc(cx, cy, 28, Math.PI, 2 * Math.PI);
    ctx.fillStyle = '#0f172a';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,.28)';
    ctx.lineWidth   = 2;
    ctx.stroke();

    ctx.font          = '16px sans-serif';
    ctx.textAlign     = 'center';
    ctx.textBaseline  = 'middle';
    ctx.fillStyle     = '#fff';
    ctx.fillText('🎲', cx, cy - 14);

    // Bottom fade — blends the canvas edge into the page background
    const fade = ctx.createLinearGradient(0, cy - 44, 0, cy);
    fade.addColorStop(0, 'rgba(15,23,42,0)');
    fade.addColorStop(1, 'rgba(15,23,42,1)');
    ctx.fillStyle = fade;
    ctx.fillRect(0, cy - 44, canvas.width, 44);
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

/* ── Share / Import ─────────────────────────────────────── */
let _pendingImport = null;

// URL-safe base64 encode (handles full UTF-8)
function _encodePkg(pkg) {
    const json  = JSON.stringify({ name: pkg.name, items: pkg.items });
    const bytes = new TextEncoder().encode(json);
    let bin = '';
    bytes.forEach(b => bin += String.fromCharCode(b));
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function _decodePkg(str) {
    const b64    = str.replace(/-/g, '+').replace(/_/g, '/');
    const padded = b64 + '='.repeat((4 - b64.length % 4) % 4);
    const bin    = atob(padded);
    const bytes  = Uint8Array.from(bin, c => c.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes));
}

function sharePkg() {
    const pkg = getActivePkg();
    if (!pkg || pkg.items.length === 0) { showToast('Pakket is leeg — voeg eerst items toe'); return; }
    const url = `${location.origin}${location.pathname}?pkg=${_encodePkg(pkg)}`;
    document.getElementById('share-pkg-name').textContent = pkg.name;
    const inp = document.getElementById('share-url-input');
    inp.value = url;
    document.getElementById('share-modal').classList.remove('hidden');
    setTimeout(() => { inp.select(); }, 120);
}

function closeShareModal() {
    document.getElementById('share-modal').classList.add('hidden');
}

function copyShareUrl() {
    const url = document.getElementById('share-url-input').value;
    navigator.clipboard?.writeText(url)
        .then(() => showToast('📋 Link gekopieerd!'))
        .catch(() => {
            const inp = document.getElementById('share-url-input');
            inp.select(); document.execCommand('copy');
            showToast('📋 Link gekopieerd!');
        });
}

function shareViaWhatsApp() {
    const url = document.getElementById('share-url-input').value;
    window.open(`https://wa.me/?text=${encodeURIComponent(url)}`, '_blank');
}

function shareViaEmail() {
    const pkg  = getActivePkg();
    const url  = document.getElementById('share-url-input').value;
    const subj = encodeURIComponent(`Draairad pakket: ${pkg?.name ?? ''}`);
    const body = encodeURIComponent(`Open deze link om het pakket te importeren:\n${url}`);
    location.href = `mailto:?subject=${subj}&body=${body}`;
}

function shareViaNative() {
    const pkg = getActivePkg();
    const url = document.getElementById('share-url-input').value;
    if (navigator.share) {
        navigator.share({ title: `Draairad: ${pkg?.name ?? ''}`, url }).catch(() => {});
    } else {
        copyShareUrl();
    }
}

function _checkImportParam() {
    const encoded = new URLSearchParams(location.search).get('pkg');
    if (!encoded) return;

    // Remove param immediately so refreshing doesn't re-prompt
    history.replaceState(null, '', location.pathname);

    try {
        const data = _decodePkg(encoded);
        if (!data?.name || !Array.isArray(data.items) || data.items.length === 0) return;

        _pendingImport = { name: data.name, items: data.items.slice(0, MAX_ITEMS) };

        document.getElementById('import-pkg-name').textContent  = data.name;
        document.getElementById('import-pkg-count').textContent =
            `${_pendingImport.items.length} item${_pendingImport.items.length !== 1 ? 's' : ''}`;

        const preview = _pendingImport.items.slice(0, 6);
        document.getElementById('import-preview').innerHTML =
            preview.map(t => `<div class="import-item">• ${_esc(t)}</div>`).join('') +
            (data.items.length > 6
                ? `<div class="import-more">…en ${data.items.length - 6} meer</div>`
                : '');

        document.getElementById('import-modal').classList.remove('hidden');
    } catch { /* malformed URL param — silently ignore */ }
}

function confirmImport() {
    if (!_pendingImport) return;
    const pkg = { id: 'pkg_' + Date.now(), name: _pendingImport.name, items: _pendingImport.items };
    packages.push(pkg);
    activePkgId = pkg.id;
    try { localStorage.setItem(ACTIVE_KEY, activePkgId); } catch {}
    savePackages();
    renderPkgSelect();
    renderItemsList();
    drawWheel();
    _pendingImport = null;
    document.getElementById('import-modal').classList.add('hidden');
    showToast(`✓ "${pkg.name}" geïmporteerd! (${pkg.items.length} items)`);
}

function cancelImport() {
    _pendingImport = null;
    document.getElementById('import-modal').classList.add('hidden');
}

/* ── Persistence ────────────────────────────────────────── */
function savePackages() {
    try { localStorage.setItem(PKGS_KEY, JSON.stringify(packages)); } catch { }
    if (typeof scheduleAutoSync === 'function') scheduleAutoSync();
}

// Called by sync.js after a successful sync so the UI reflects server-merged packages
function refreshWheelPackages() {
    let saved;
    try { saved = JSON.parse(localStorage.getItem(PKGS_KEY) || 'null'); } catch {}
    if (!Array.isArray(saved) || saved.length === 0) return;

    packages = saved;
    if (!packages.find(p => p.id === 'default')) packages.unshift(DEFAULT_PKG);

    // Keep current active package if it still exists; otherwise fall back to first
    if (!packages.find(p => p.id === activePkgId)) {
        activePkgId = packages[0].id;
        try { localStorage.setItem(ACTIVE_KEY, activePkgId); } catch {}
    }

    renderPkgSelect();
    renderItemsList();
    drawWheel();
}

/* ── Preset package loader ───────────────────────────────── */
async function _loadPresetPackages() {
    try {
        const r = await fetch('/dqvn/data/plan/wheel_packages.json');
        if (!r.ok) return;
        const data = await r.json();
        if (!Array.isArray(data.packages)) return;

        let changed = false;
        for (const preset of data.packages) {
            /* Merge: add if missing, update items if already present as preset */
            const existing = packages.find(p => p.id === preset.id);
            if (!existing) {
                packages.push(preset);
                changed = true;
            } else if (existing.preset) {
                existing.name  = preset.name;
                existing.items = preset.items;
                changed = true;
            }
        }
        if (changed) {
            savePackages();
            renderPkgSelect();
            drawWheel();
        }
    } catch { /* fail silently — presets are optional */ }
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
    _checkImportParam();

    /* Load A1/A2 preset question packs in the background */
    _loadPresetPackages();
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
function toggleWheelInfo() {
  const panel = document.getElementById('wheel-info');
  const btn   = document.getElementById('wheel-info-btn');
  const open  = panel.classList.toggle('hidden');
  btn.style.opacity = open ? '' : '1';
}

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
    if (e.key === 'Escape') { hideResult(); closePkgModal(); closeSyncDrawer(); closeShareModal(); }
});

/* ── Backdrop clicks close their respective modals ───────── */
document.getElementById('result-modal').addEventListener('click', e => {
    if (e.target === e.currentTarget) hideResult();
});
document.getElementById('pkg-modal').addEventListener('click', e => {
    if (e.target === e.currentTarget) closePkgModal();
});
document.getElementById('share-modal').addEventListener('click', e => {
    if (e.target === e.currentTarget) closeShareModal();
});

init();

/* Watch #sync-section for login/logout to update the nav avatar */
new MutationObserver(_updateSyncNavBtn)
    .observe(document.getElementById('sync-section'), { childList: true, subtree: true });
_updateSyncNavBtn();
