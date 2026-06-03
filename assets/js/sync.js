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
  vol:     'nl_vocab_vol',           // TTS volume { v: 0-100, t: timestamp }
};

// ── Runtime state ─────────────────────────────────────────────────────────
let _user          = null;   // decoded user info
let _token         = null;   // current Google id_token
let _syncing       = false;
let _activityTimer = null;

const _AUTO_SYNC_MIN_GAP   = 3 * 60_000; // auto-sync at most once per 3 min
const _POST_STUDY_DEBOUNCE = 15_000;     // wait 15 s after last write — session "settled"

// ═════════════════════════════════════════════════════════════════════════
// INIT — called automatically on DOMContentLoaded
// ═════════════════════════════════════════════════════════════════════════
function _initSync() {
  try {
    _user  = JSON.parse(localStorage.getItem(_KEY_USER) || 'null');
    _token = localStorage.getItem(_KEY_TOKEN);
  } catch {}

  _renderSyncUI();

  // Token still valid — sync now, schedule renewal before it expires, no GIS prompt needed
  if (_user && _tokenValid()) {
    syncNow(true);
    _scheduleTokenRenewal();
    _loadGIS(_setupGISRenewalOnly);   // register callback so renewal fires into _onCredential
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
    // Known user, expired token — try silent renewal.
    // If GIS cannot renew silently (browser policy, no session, cooldown),
    // show a non-intrusive reconnect hint rather than a popup.
    google.accounts.id.prompt(n => {
      if (n.isNotDisplayed() || n.isSkippedMoment() || n.isDismissedMoment()) {
        _setSyncStatus('needs-reauth');
      }
    });
  } else {
    // First-time sign-in: render the official GIS button (works on mobile Chrome too)
    _renderGISButton();
  }
}

function _setupGISRenewalOnly() {
  // Token still valid — just initialise GIS so it can renew in background
  google.accounts.id.initialize({
    client_id:   GOOGLE_CLIENT_ID,
    callback:    _onCredential,
    auto_select: true,
  });
}

function _renderGISButton() {
  const container = document.getElementById('g-signin-container');
  if (!container) return;
  google.accounts.id.renderButton(container, {
    type:  'standard',
    theme: 'outline',
    size:  'large',
    text:  'signin_with',
    logo_alignment: 'left',
    width: container.offsetWidth || 210,
  });
}

// Proactive token renewal — fires 5 min before the JWT expires.
// As long as the user has any page open, the token stays fresh without any UI.
let _renewalTimer = null;
function _scheduleTokenRenewal() {
  clearTimeout(_renewalTimer);
  if (!_token) return;
  try {
    const b64    = _token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = b64 + '='.repeat((4 - b64.length % 4) % 4);
    const bytes  = Uint8Array.from(atob(padded), c => c.charCodeAt(0));
    const { exp } = JSON.parse(new TextDecoder().decode(bytes));
    const delay = (exp - 300) * 1000 - Date.now(); // 5 min before expiry
    if (delay <= 0) return;
    _renewalTimer = setTimeout(() => {
      if (window.google?.accounts?.id) google.accounts.id.prompt(() => {});
    }, delay);
  } catch {}
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
  syncNow(/*silent=*/true);
  _scheduleTokenRenewal();   // keep token fresh; avoids needing to re-auth on next page
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

    // Attach device fingerprint so the blob tracks who synced from where
    payload.device = {
      ua:   navigator.userAgent,
      tz:   Intl.DateTimeFormat().resolvedOptions().timeZone,
      lang: navigator.language,
    };

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

    // Apply synced volume to whichever slider exists on this page
    if (merged.vol && typeof merged.vol.v === 'number') {
      const v = merged.vol.v;
      // startnl.html / vanstart.html / 4000.html
      const s1 = document.getElementById('volume-control');
      const l1 = document.getElementById('volume-value');
      if (s1) s1.value = v;
      if (l1) l1.textContent = `${v}%`;
      // klanken.html / dialogues.html
      const s2 = document.getElementById('vol-slider');
      const l2 = document.getElementById('vol-val');
      if (s2) { s2.value = v; s2.style.setProperty('--vp', v + '%'); }
      if (l2) l2.textContent = `${v}%`;
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
  _user  = null;
  _token = null;
  localStorage.removeItem(_KEY_USER);
  localStorage.removeItem(_KEY_TOKEN);

  if (window.google?.accounts?.id) {
    // disableAutoSelect prevents silent re-sign-in after explicit sign-out
    google.accounts.id.disableAutoSelect();
    // Re-initialize with auto_select:false so renderButton is ready for a fresh login.
    // Without this re-init, GIS stays in "signed-out" state and button clicks are silently ignored.
    google.accounts.id.initialize({
      client_id:   GOOGLE_CLIENT_ID,
      callback:    _onCredential,
      auto_select: false,
    });
  }

  _renderSyncUI();         // renders #g-signin-container
  _renderGISButton();      // paints button with freshly re-initialized GIS
}

// ═════════════════════════════════════════════════════════════════════════
// UI RENDERING
// ═════════════════════════════════════════════════════════════════════════
function _renderSyncUI() {
  const el = document.getElementById('sync-section');
  if (!el) return;

  if (!_user) {
    el.innerHTML = `<div class="sync-signin-row"><div id="g-signin-container" class="sync-gis-wrap"></div></div>`;
    // Render immediately if GIS is already loaded, otherwise _setupGIS() will call it
    if (window.google?.accounts?.id) _renderGISButton();
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
  } else if (status === 'needs-reauth') {
    // Silent renewal failed — show a tap-to-reconnect hint, no popup
    lbl.textContent = '🔑 Tap to reconnect';
    lbl.style.cursor = 'pointer';
    lbl.title = 'Session expired — tap to sign in again';
    lbl.onclick = () => {
      lbl.textContent = '⏳ Reconnecting…';
      lbl.onclick = null;
      lbl.style.cursor = '';
      if (window.google?.accounts?.id) google.accounts.id.prompt(() => {});
    };
    if (card) card.classList.remove('sync-card--busy');
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

// ═════════════════════════════════════════════════════════════════════════
// AUTO-SYNC TRIGGERS — fires only at meaningful learning moments
// ═════════════════════════════════════════════════════════════════════════

// Progress-only keys — changes here mean real learning happened.
// vol excluded: a volume tweak is not worth an immediate network call.
const _PROGRESS_KEY_SET = new Set([
  _SYNC_KEYS.srs,
  _SYNC_KEYS.meta,
  _SYNC_KEYS.klanken,
  _SYNC_KEYS.verbs,
  _SYNC_KEYS.game,
]);

// 1. After a study session ends.
//    Watches progress keys only. The 15 s debounce collapses a burst of
//    card ratings / sound completions into ONE sync event. The min-gap
//    prevents re-firing during a long uninterrupted session.
(function _installStorageHook() {
  const _orig = localStorage.setItem.bind(localStorage);

  localStorage.setItem = function(key, value) {
    _orig(key, value);
    if (!_PROGRESS_KEY_SET.has(key) || !_user || !_token) return;

    clearTimeout(_activityTimer);
    _activityTimer = setTimeout(() => {
      const lastSync = parseInt(localStorage.getItem(_KEY_LAST) || '0', 10);
      if (Date.now() - lastSync < _AUTO_SYNC_MIN_GAP) return;
      syncNow(true);
    }, _POST_STUDY_DEBOUNCE);
  };
})();

// 2. Device comes back online — push progress made while offline.
window.addEventListener('online', () => {
  if (_user && _tokenValid()) syncNow(true);
});

// visibilitychange removed: fires on every tab-switch and phone app-switch
// (dozens per hour during normal use) — not a meaningful learning boundary.

// ── Boot ──────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', _initSync);
