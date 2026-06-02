'use strict';
/* ══════════════════════════════════════════════════════════════
   sync.js — Cloud sync via Cloudflare Worker + Upstash Redis
   Google Identity Services (GIS) for authentication.

   CONFIGURE THE TWO CONSTANTS BELOW after deploying the Worker.
══════════════════════════════════════════════════════════════ */

// ── Fill these in after deploying ────────────────────────────────────────
const SYNC_WORKER_URL  = 'https://nl-sync.itho.workers.dev';
const GOOGLE_CLIENT_ID = '813394172048-mn81bvhivheomlm3453on49f5gbp31so.apps.googleusercontent.com';

// ── localStorage keys ─────────────────────────────────────────────────────
const _KEY_USER    = 'fc_sync_user';         // { sub, name, email, picture }
const _KEY_TOKEN   = 'fc_sync_token';        // Google id_token (1 h expiry)
const _KEY_LAST    = 'fc_sync_last';         // ms timestamp of last successful sync

// Keys that are synced across devices (progress data)
const _SYNC_KEYS = {
  srs:     'nl_srs_v3',              // flashcard SM-2 progress
  meta:    'nl_srs_meta_v3',         // streak / daily new-card count
  klanken: 'klanken-v1',             // phonetics completion flags
  verbs:   'nl_verbs_v3',            // verb trainer stats
  game:    'nl_game_progress_v1',    // game seen-words per chapter
};

// ── Runtime state ─────────────────────────────────────────────────────────
let _user    = null;   // decoded user info
let _token   = null;   // current Google id_token
let _syncing = false;

// ═════════════════════════════════════════════════════════════════════════
// INIT — called automatically on DOMContentLoaded
// ═════════════════════════════════════════════════════════════════════════
function _initSync() {
  try {
    _user  = JSON.parse(localStorage.getItem(_KEY_USER) || 'null');
    _token = localStorage.getItem(_KEY_TOKEN);
  } catch {}

  _renderSyncUI();

  // If token is still valid, sync right now — no GIS round-trip needed
  if (_user && _tokenValid()) {
    syncNow(true);
    // Still load GIS in background so it can silently renew before expiry
    _loadGIS(_setupGISRenewalOnly);
    return;
  }

  // Token expired or missing: load GIS to renew (silently if user known, via button if not)
  _loadGIS(_setupGIS);
}

function _loadGIS(onReady) {
  if (window.google?.accounts?.id) { onReady(); return; }
  const s  = document.createElement('script');
  s.src    = 'https://accounts.google.com/gsi/client';
  s.async  = true;
  s.onload = onReady;
  document.head.appendChild(s);
}

function _setupGIS() {
  google.accounts.id.initialize({
    client_id:   GOOGLE_CLIENT_ID,
    callback:    _onCredential,
    auto_select: true,
  });

  if (_user) {
    // Known user with expired token — attempt SILENT renewal only, no popup
    google.accounts.id.prompt(n => {
      // If GIS cannot renew silently (browser policy, no session), fall back to
      // the ⋮ → Sync now button which will re-prompt on next manual click
    });
  }
  // Unknown user: sign-in button already rendered in menu — no auto-popup
}

function _setupGISRenewalOnly() {
  // Token still valid — just initialise GIS so it can renew in background
  google.accounts.id.initialize({
    client_id:   GOOGLE_CLIENT_ID,
    callback:    _onCredential,
    auto_select: true,
  });
}

// Check if stored token has at least 60 s remaining
function _tokenValid() {
  if (!_token) return false;
  try {
    const b64    = _token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = b64 + '='.repeat((4 - b64.length % 4) % 4);
    const bytes  = Uint8Array.from(atob(padded), c => c.charCodeAt(0));
    const { exp } = JSON.parse(new TextDecoder().decode(bytes));
    return exp > Math.floor(Date.now() / 1000) + 60;
  } catch { return false; }
}

// ═════════════════════════════════════════════════════════════════════════
// CREDENTIAL CALLBACK  (called by GIS on sign-in or silent renewal)
// ═════════════════════════════════════════════════════════════════════════
function _onCredential(response) {
  const jwt = response.credential;

  // Decode payload client-side (signature verified server-side by Worker)
  let payload;
  try {
    const b64    = jwt.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = b64 + '='.repeat((4 - b64.length % 4) % 4);
    const bytes  = Uint8Array.from(atob(padded), c => c.charCodeAt(0));
    payload      = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return;
  }

  _user  = { sub: payload.sub, name: payload.name, email: payload.email, picture: payload.picture };
  _token = jwt;

  try {
    localStorage.setItem(_KEY_USER,  JSON.stringify(_user));
    localStorage.setItem(_KEY_TOKEN, jwt);
  } catch {}

  _renderSyncUI();
  syncNow(/*silent=*/true);   // auto-sync immediately after sign-in / renewal
}

// ═════════════════════════════════════════════════════════════════════════
// SYNC
// ═════════════════════════════════════════════════════════════════════════
async function syncNow(silent = false) {
  if (_syncing || !_user || !_token) return;
  _syncing = true;
  _setSyncStatus('syncing');

  try {
    // Build payload from all syncable keys
    const payload = {};
    for (const [field, lsKey] of Object.entries(_SYNC_KEYS)) {
      payload[field] = _readJSON(lsKey, {});
    }

    const res = await fetch(SYNC_WORKER_URL + '/sync', {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': 'Bearer ' + _token,
      },
      body: JSON.stringify(payload),
    });

    // Token expired → re-prompt silently
    if (res.status === 401) {
      _token = null;
      localStorage.removeItem(_KEY_TOKEN);
      _setSyncStatus('idle');
      google.accounts.id.prompt(() => {});
      return;
    }

    if (!res.ok) throw new Error('HTTP ' + res.status);

    const merged = await res.json();

    // Write merged data back for each key (safe — flashcard.js reads at session start)
    for (const [field, lsKey] of Object.entries(_SYNC_KEYS)) {
      const val = merged[field];
      if (val && Object.keys(val).length) {
        localStorage.setItem(lsKey, JSON.stringify(val));
      }
    }

    // Refresh word badges if function is available
    if (typeof updateWordBadges === 'function') updateWordBadges();

    const now = Date.now();
    localStorage.setItem(_KEY_LAST, String(now));
    _setSyncStatus('ok', now);

    if (!silent) _syncToast('☁️ Synced successfully');

  } catch (err) {
    console.error('[sync]', err);
    _setSyncStatus('error');
  } finally {
    _syncing = false;
  }
}

// ═════════════════════════════════════════════════════════════════════════
// SIGN OUT
// ═════════════════════════════════════════════════════════════════════════
function _signOut() {
  if (window.google?.accounts?.id) google.accounts.id.disableAutoSelect();
  _user  = null;
  _token = null;
  localStorage.removeItem(_KEY_USER);
  localStorage.removeItem(_KEY_TOKEN);
  _renderSyncUI();
}

// ═════════════════════════════════════════════════════════════════════════
// UI RENDERING
// ═════════════════════════════════════════════════════════════════════════
function _renderSyncUI() {
  const el = document.getElementById('sync-section');
  if (!el) return;

  if (!_user) {
    el.innerHTML = `
      <div class="sync-row sync-signin-row">
        <button class="sync-signin-btn" id="sync-signin-btn">
          <svg class="sync-g-logo" viewBox="0 0 24 24" width="16" height="16">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.47 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
          </svg>
          Sign in to sync
        </button>
      </div>`;
    document.getElementById('sync-signin-btn')
      .addEventListener('click', () => google.accounts.id.prompt(() => {}));
    return;
  }

  const lastSync = parseInt(localStorage.getItem(_KEY_LAST) || '0', 10);
  const statusText = lastSync ? '☁️ Synced · ' + _relTime(lastSync) : '☁️ Not yet synced';

  el.innerHTML = `
    <div class="sync-card">
      <img class="sync-avatar" src="${_esc(_user.picture || '')}" alt=""
           onerror="this.style.display='none'">
      <div class="sync-info">
        <span class="sync-name">${_esc(_user.name || _user.email)}</span>
        <span class="sync-status" id="sync-last-lbl">${statusText}</span>
      </div>
      <div class="sync-menu-wrap">
        <button class="sync-menu-btn" id="sync-menu-btn" aria-label="Sync options">⋮</button>
        <div class="sync-dropdown" id="sync-dropdown">
          <button class="sync-dd-item" id="sync-now-btn">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M23 4v6h-6"/><path d="M1 20v-6h6"/><path d="M3.51 9a9 9 0 0114.36-3.36L23 10M1 14l5.13 4.36A9 9 0 0020.49 15"/></svg>
            Sync now
          </button>
          <button class="sync-dd-item sync-dd-signout" id="sync-signout-btn">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
            Sign out
          </button>
        </div>
      </div>
    </div>`;

  // Toggle dropdown
  const menuBtn  = document.getElementById('sync-menu-btn');
  const dropdown = document.getElementById('sync-dropdown');
  menuBtn.addEventListener('click', e => {
    e.stopPropagation();
    dropdown.classList.toggle('open');
  });
  // Close on outside click
  document.addEventListener('click', function _close() {
    dropdown.classList.remove('open');
    document.removeEventListener('click', _close);
  });

  document.getElementById('sync-now-btn')
    .addEventListener('click', () => { dropdown.classList.remove('open'); syncNow(false); });
  document.getElementById('sync-signout-btn')
    .addEventListener('click', () => { dropdown.classList.remove('open'); _signOut(); });
}

function _setSyncStatus(status, ts) {
  const lbl     = document.getElementById('sync-last-lbl');
  const syncBtn = document.getElementById('sync-now-btn');
  const card    = document.querySelector('.sync-card');

  if (!lbl) return;

  if (status === 'syncing') {
    lbl.textContent = '⏳ Syncing…';
    if (syncBtn) syncBtn.disabled = true;
    if (card)    card.classList.add('sync-card--busy');
  } else if (status === 'ok' && ts) {
    lbl.textContent = '☁️ Synced · ' + _relTime(ts);
    if (syncBtn) syncBtn.disabled = false;
    if (card)    card.classList.remove('sync-card--busy');
  } else if (status === 'error') {
    lbl.textContent = '⚠️ Sync failed';
    if (syncBtn) syncBtn.disabled = false;
    if (card)    card.classList.remove('sync-card--busy');
  }
}

// ═════════════════════════════════════════════════════════════════════════
// HELPERS
// ═════════════════════════════════════════════════════════════════════════
function _readJSON(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key) || 'null') || fallback; }
  catch { return fallback; }
}

function _relTime(ts) {
  const d = Date.now() - ts;
  if (d < 60_000)     return 'just now';
  if (d < 3_600_000)  return Math.floor(d / 60_000)    + ' min ago';
  if (d < 86_400_000) return Math.floor(d / 3_600_000) + ' hr ago';
  return Math.floor(d / 86_400_000) + 'd ago';
}

function _esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

function _syncToast(msg) {
  let el = document.getElementById('sync-toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'sync-toast';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.classList.add('sync-toast-show');
  clearTimeout(el._tid);
  el._tid = setTimeout(() => el.classList.remove('sync-toast-show'), 3000);
}

// ── Boot ──────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', _initSync);
