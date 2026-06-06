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
  srs:      'nl_srs_v3',             // flashcard SM-2 progress
  meta:     'nl_srs_meta_v3',        // streak / daily new-card count
  klanken:  'klanken-v1',            // phonetics completion flags
  verbs:    'nl_verbs_v3',           // verb trainer stats
  game:     'nl_game_progress_v1',   // game seen-words per chapter
  vol:      'nl_vocab_vol',          // TTS volume { v: 0-100, t: timestamp }
  num:      'nl_num_progress',       // number learning level/stars progress
  wheel:    'nl_wheel_pkgs',         // wheel-of-names question packages
  sentence: 'nl_sentence_v1',        // sentence-builder daily streak + XP
  vanstart: 'nl_vanstart_v1',        // VanStart lesson progress + streak
  theme:    'nl_portal_theme',       // portal colour theme { v, t }
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

    // Write merged data back for each key
    // Guard works for both objects ({}) and arrays ([]) — check length on whichever it is
    for (const [field, lsKey] of Object.entries(_SYNC_KEYS)) {
      const val = merged[field];
      if (val == null) continue;
      const hasContent = Array.isArray(val) ? val.length > 0 : Object.keys(val).length > 0;
      if (hasContent) localStorage.setItem(lsKey, JSON.stringify(val));
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

    // Apply synced theme if on the portal
    if (merged.theme && typeof merged.theme.v === 'string') {
      if (typeof applyTheme === 'function') applyTheme(merged.theme.v);
    }

    // Refresh word badges if function is available
    if (typeof updateWordBadges === 'function') updateWordBadges();

    // Refresh wheel packages if the wheel page is open
    if (typeof refreshWheelPackages === 'function') refreshWheelPackages();

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
function _getLangLabel() {
  const lang = window._i18nLang || localStorage.getItem('nl_ui_lang') || 'en';
  return lang === 'en' ? '🇳🇱 Nederlands' : '🇬🇧 English';
}

function _renderSyncUI() {
  const el = document.getElementById('sync-section');
  if (!el) return;

  if (!_user) {
    el.innerHTML = `
      <div class="sync-signin-row"><div id="g-signin-container" class="sync-gis-wrap"></div></div>
      <div class="sync-lang-row">
        <button class="sync-lang-pill" id="i18n-lang-btn">
          <span data-i18n="lang_switch">${_getLangLabel()}</span>
        </button>
      </div>`;
    if (window.google?.accounts?.id) _renderGISButton();
    document.getElementById('i18n-lang-btn')
      ?.addEventListener('click', () => { if (window.toggleLanguage) window.toggleLanguage(); });
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
          <button class="sync-dd-item sync-dd-lang" id="i18n-lang-btn">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
            <span data-i18n="lang_switch">${_getLangLabel()}</span>
          </button>
          ${_user.email === 'dqvn2002@gmail.com' ? `
          <button class="sync-dd-item sync-dd-admin" id="sync-admin-btn">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/></svg>
            Feedback Inbox
          </button>
          <button class="sync-dd-item sync-dd-users" id="sync-users-btn">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
            Active Users
          </button>` : ''}
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
  document.getElementById('i18n-lang-btn')
    ?.addEventListener('click', () => { dropdown.classList.remove('open'); if (window.toggleLanguage) window.toggleLanguage(); });
  document.getElementById('sync-admin-btn')
    ?.addEventListener('click', () => { dropdown.classList.remove('open'); if (window._openFeedbackAdmin) window._openFeedbackAdmin(); });
  document.getElementById('sync-users-btn')
    ?.addEventListener('click', () => { dropdown.classList.remove('open'); _openUserActivity(); });
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
  _SYNC_KEYS.num,
  _SYNC_KEYS.wheel,
  _SYNC_KEYS.sentence,  // sentence XP + streak
  _SYNC_KEYS.vanstart,  // VanStart lesson progress
  _SYNC_KEYS.theme,     // portal colour theme
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

// ═════════════════════════════════════════════════════════════════════════
// USER ACTIVITY PANEL
// ═════════════════════════════════════════════════════════════════════════

function _openUserActivity() {
  const panel = document.getElementById('ua-panel');
  if (!panel) return;
  panel.removeAttribute('aria-hidden');
  panel.classList.add('ua-panel--open');
  _fetchUsers();
}

function _closeUserActivity() {
  const panel = document.getElementById('ua-panel');
  if (!panel) return;
  panel.setAttribute('aria-hidden', 'true');
  panel.classList.remove('ua-panel--open');
}

async function _fetchUsers() {
  const list = document.getElementById('ua-list');
  if (!list) return;
  list.innerHTML = '<p class="ua-empty">Loading…</p>';

  if (!_token) { list.innerHTML = '<p class="ua-empty">Not signed in.</p>'; return; }

  try {
    const r = await fetch(SYNC_WORKER_URL + '/admin/users', {
      headers: { Authorization: 'Bearer ' + _token },
    });
    if (r.status === 403) { list.innerHTML = '<p class="ua-empty">Access denied.</p>'; return; }
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const { users } = await r.json();
    _renderUserList(users || []);
  } catch (e) {
    list.innerHTML = `<p class="ua-empty">Error: ${_esc(e.message)}</p>`;
  }
}

function _renderUserList(users) {
  const list    = document.getElementById('ua-list');
  const countEl = document.getElementById('ua-count');
  if (!list) return;

  if (countEl) countEl.textContent = `${users.length} user${users.length !== 1 ? 's' : ''}`;

  if (!users.length) {
    list.innerHTML = '<p class="ua-empty">No users found.</p>';
    return;
  }

  list.innerHTML = users.map(u => {
    const initials = (u.name || u.email || '?')
      .split(/\s+/).map(w => w[0] || '').join('').toUpperCase().slice(0, 2) || '?';
    const tz      = u.lastSync?.tz   ? `🕐 ${u.lastSync.tz}`   : '';
    const lang    = u.lastSync?.lang ? ` · ${u.lastSync.lang}` : '';
    const browser = (u.lastSync?.ua  || '').match(/^(\w+)/)?.[1] || '';
    const meta    = [tz + lang, browser].filter(Boolean).join(' · ');
    return `
      <div class="ua-card">
        <div class="ua-avatar-placeholder">${_esc(initials)}</div>
        <div class="ua-info">
          <div class="ua-name">${_esc(u.name || u.email)}</div>
          <div class="ua-email">${_esc(u.email)}</div>
          ${meta ? `<div class="ua-meta">${_esc(meta)}</div>` : ''}
        </div>
        <div class="ua-time">${u.syncedAt ? _relTime(u.syncedAt) : '—'}</div>
      </div>`;
  }).join('');
}

// ── Boot ──────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', _initSync);
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('ua-close')?.addEventListener('click', _closeUserActivity);
});
