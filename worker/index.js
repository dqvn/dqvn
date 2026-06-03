/**
 * nl-sync — Cloudflare Worker
 *
 * POST /sync
 *   Authorization: Bearer <google-id-token>
 *   Body: {
 *     srs:     nl_srs_v3       — flashcard SM-2 progress
 *     meta:    nl_srs_meta_v3  — streak / daily counts
 *     klanken: klanken-v1      — phonetics completion flags
 *     verbs:   nl_verbs_v3     — verb trainer stats
 *     game:    nl_game_progress_v1 — seen words per chapter
 *   }
 *
 * Returns: same five fields merged
 *
 * Secrets (set via: wrangler secret put <NAME>)
 *   UPSTASH_URL   — full REST URL
 *   UPSTASH_TOKEN — Upstash REST token
 *
 * Plain vars (wrangler.toml [vars])
 *   GOOGLE_CLIENT_ID — your OAuth client ID
 */

const CORS_HEADERS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

const REDIS_TTL = 90 * 86400; // 90 days

export default {
  async fetch(request, env) {
    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    const url = new URL(request.url);
    if (url.pathname !== '/sync') return reply({ error: 'Not found' }, 404);
    if (request.method !== 'POST') return reply({ error: 'Method not allowed' }, 405);

    // ── Auth ─────────────────────────────────────────────────────────────
    const auth = request.headers.get('Authorization') || '';
    if (!auth.startsWith('Bearer ')) return reply({ error: 'Unauthorized' }, 401);

    let user;
    try {
      user = await verifyGoogleJWT(auth.slice(7), env.GOOGLE_CLIENT_ID);
    } catch (e) {
      return reply({ error: 'Invalid token: ' + e.message }, 401);
    }

    // ── Body ──────────────────────────────────────────────────────────────
    let body;
    try { body = await request.json(); }
    catch { return reply({ error: 'Invalid JSON' }, 400); }

    const {
      srs:     localSRS     = {},
      meta:    localMeta    = {},
      klanken: localKlanken = {},
      verbs:   localVerbs   = {},
      game:    localGame    = {},
      vol:     localVol     = null,
      num:     localNum     = {},
      wheel:   localWheel   = [],
      device:  clientDevice = null,
    } = body;

    // ── Redis read ────────────────────────────────────────────────────────
    const key    = `fc:${user.sub}`;
    const stored = await redisGet(env.UPSTASH_URL, env.UPSTASH_TOKEN, key);

    // ── Merge all five blobs ──────────────────────────────────────────────
    const mergedSRS     = mergeSRS    (localSRS,     stored?.srs     || {});
    const mergedMeta    = mergeMeta   (localMeta,    stored?.meta    || {});
    const mergedKlanken = mergeKlanken(localKlanken, stored?.klanken || {});
    const mergedVerbs   = mergeVerbs  (localVerbs,   stored?.verbs   || {});
    const mergedGame    = mergeGame   (localGame,     stored?.game    || {});
    const mergedVol     = mergeVol    (localVol,      stored?.vol     || null);
    const mergedNum     = mergeNum    (localNum,      stored?.num     || {});
    const mergedWheel   = mergeWheel  (localWheel,    stored?.wheel   || []);

    // ── Redis write ───────────────────────────────────────────────────────
    // Keep a rolling log of the last 5 device syncs
    const prevSyncs  = stored?.syncLog || [];
    const syncEntry  = {
      at:     Date.now(),
      name:   user.name,
      email:  user.email,
      sub:    user.sub,
      ua:     clientDevice?.ua   || null,
      tz:     clientDevice?.tz   || null,
      lang:   clientDevice?.lang || null,
    };
    const syncLog = [syncEntry, ...prevSyncs].slice(0, 5);

    await redisSet(
      env.UPSTASH_URL, env.UPSTASH_TOKEN, key,
      {
        srs: mergedSRS, meta: mergedMeta,
        klanken: mergedKlanken, verbs: mergedVerbs, game: mergedGame,
        vol: mergedVol, num: mergedNum, wheel: mergedWheel,
        owner: { sub: user.sub, email: user.email, name: user.name },
        syncedAt: Date.now(),
        syncLog,
      },
      REDIS_TTL
    );

    return reply({
      srs: mergedSRS, meta: mergedMeta,
      klanken: mergedKlanken, verbs: mergedVerbs, game: mergedGame,
      vol: mergedVol, num: mergedNum, wheel: mergedWheel,
    });
  },
};

// ── Upstash REST helpers ──────────────────────────────────────────────────

async function redisGet(url, token, key) {
  const res = await fetch(`${url}/get/${encodeURIComponent(key)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const { result } = await res.json();
  if (!result) return null;
  try { return JSON.parse(result); } catch { return null; }
}

async function redisSet(url, token, key, value, ex) {
  await fetch(`${url}/`, {
    method:  'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body:    JSON.stringify(['SET', key, JSON.stringify(value), 'EX', ex]),
  });
}

// ── Google JWT verification (Web Crypto, no deps) ─────────────────────────

async function verifyGoogleJWT(token, clientId) {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('Malformed JWT');

  const [rawHeader, rawPayload, rawSig] = parts;

  function decodeB64url(s) {
    const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
    const pad  = b64 + '='.repeat((4 - b64.length % 4) % 4);
    const bin  = atob(pad);
    return new Uint8Array([...bin].map(c => c.charCodeAt(0)));
  }

  const header  = JSON.parse(new TextDecoder().decode(decodeB64url(rawHeader)));
  const payload = JSON.parse(new TextDecoder().decode(decodeB64url(rawPayload)));
  const now     = Math.floor(Date.now() / 1000);

  if (payload.exp < now)       throw new Error('Token expired');
  if (payload.aud !== clientId) throw new Error('Wrong audience');
  if (payload.iss !== 'accounts.google.com' && payload.iss !== 'https://accounts.google.com') {
    throw new Error('Wrong issuer');
  }

  // Fetch Google public keys (Cloudflare caches by CDN headers automatically)
  const jwksRes = await fetch('https://www.googleapis.com/oauth2/v3/certs');
  const { keys } = await jwksRes.json();
  const jwk = keys.find(k => k.kid === header.kid);
  if (!jwk) throw new Error('Signing key not found');

  const cryptoKey = await crypto.subtle.importKey(
    'jwk', jwk,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false, ['verify']
  );

  const data  = new TextEncoder().encode(`${rawHeader}.${rawPayload}`);
  const sig   = decodeB64url(rawSig);
  const valid = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', cryptoKey, sig, data);
  if (!valid) throw new Error('Signature invalid');

  return {
    sub:     payload.sub,
    email:   payload.email,
    name:    payload.name,
    picture: payload.picture,
  };
}

// ── SRS merge: per-word, highest lastStudied wins ─────────────────────────

function mergeSRS(local, remote) {
  if (!remote || !Object.keys(remote).length) return local;
  if (!local  || !Object.keys(local).length)  return remote;

  const merged     = {};
  const allChapters = new Set([...Object.keys(local), ...Object.keys(remote)]);

  for (const chId of allChapters) {
    const chL = local[chId]  || {};
    const chR = remote[chId] || {};

    if (!Object.keys(chL).length) { merged[chId] = chR; continue; }
    if (!Object.keys(chR).length) { merged[chId] = chL; continue; }

    const chM     = {};
    const allWords = new Set([...Object.keys(chL), ...Object.keys(chR)]);

    for (const word of allWords) {
      if (word === '_totals') continue;
      const wL = chL[word], wR = chR[word];
      if (!wR) { chM[word] = wL; continue; }
      if (!wL) { chM[word] = wR; continue; }
      chM[word] = (wL.lastStudied || 0) >= (wR.lastStudied || 0) ? wL : wR;
    }

    // _totals: field-wise max so all-time counts only go up
    const tL = chL._totals || {}, tR = chR._totals || {};
    if (tL.seen || tR.seen) {
      chM._totals = {
        seen:        Math.max(tL.seen        || 0, tR.seen        || 0),
        hard:        Math.max(tL.hard        || 0, tR.hard        || 0),
        good:        Math.max(tL.good        || 0, tR.good        || 0),
        easy:        Math.max(tL.easy        || 0, tR.easy        || 0),
        lastStudied: Math.max(tL.lastStudied || 0, tR.lastStudied || 0),
      };
    }

    merged[chId] = chM;
  }

  return merged;
}

// ── Klanken merge: union of completion flags { "cat:snd": 1 } ────────────

function mergeKlanken(local, remote) {
  if (!remote || !Object.keys(remote).length) return local;
  if (!local  || !Object.keys(local).length)  return remote;
  return { ...remote, ...local }; // union: 1 from either side is kept
}

// ── Verbs merge: per-verb max(seen, correct) inside each lesson ───────────

function mergeVerbs(local, remote) {
  if (!remote || remote.version !== 3) return local;
  if (!local  || local.version  !== 3) return remote;

  const mergedLessons = {};
  const allLessons = new Set([
    ...Object.keys(local.lessons  || {}),
    ...Object.keys(remote.lessons || {}),
  ]);

  for (const lessonId of allLessons) {
    const lL = local.lessons?.[lessonId]  || {};
    const lR = remote.lessons?.[lessonId] || {};

    const mergedStats = {};
    const allVerbs = new Set([
      ...Object.keys(lL.verbStats || {}),
      ...Object.keys(lR.verbStats || {}),
    ]);
    for (const verb of allVerbs) {
      const vL = lL.verbStats?.[verb] || { seen: 0, correct: 0 };
      const vR = lR.verbStats?.[verb] || { seen: 0, correct: 0 };
      mergedStats[verb] = {
        seen:    Math.max(vL.seen    || 0, vR.seen    || 0),
        correct: Math.max(vL.correct || 0, vR.correct || 0),
      };
    }

    mergedLessons[lessonId] = {
      sessions:      Math.max(lL.sessions      || 0, lR.sessions      || 0),
      totalCorrect:  Math.max(lL.totalCorrect  || 0, lR.totalCorrect  || 0),
      totalAnswered: Math.max(lL.totalAnswered || 0, lR.totalAnswered || 0),
      verbStats: mergedStats,
    };
  }

  // Base from most recently active device, then overlay merged lessons
  const base = (local.lastStudy || '') >= (remote.lastStudy || '') ? local : remote;
  return {
    ...base,
    streak:  Math.max(local.streak || 0, remote.streak || 0),
    lessons: mergedLessons,
  };
}

// ── Game merge: union of seen-word arrays per chapter ─────────────────────

function mergeGame(local, remote) {
  if (!remote || !Object.keys(remote).length) return local;
  if (!local  || !Object.keys(local).length)  return remote;

  const merged = { ...remote };
  for (const [ch, words] of Object.entries(local)) {
    if (!merged[ch]) { merged[ch] = words; continue; }
    merged[ch] = [...new Set([...merged[ch], ...words])];
  }
  return merged;
}

// ── Vol merge: most recently changed value wins ───────────────────────────

function mergeVol(local, remote) {
  if (!remote) return local;
  if (!local)  return remote;
  return (local?.t || 0) >= (remote?.t || 0) ? local : remote;
}

// ── Meta merge: most-recently-active device wins, take max streak ─────────

function mergeMeta(local, remote) {
  if (!remote || !Object.keys(remote).length) return local;
  if (!local  || !Object.keys(local).length)  return remote;

  const base = (local.lastStudyDate || '') >= (remote.lastStudyDate || '')
    ? local : remote;

  return {
    ...base,
    streak: Math.max(local.streak || 0, remote.streak || 0),
  };
}

// ── Num merge: per-level best stars + union of learn flags ───────────────

function mergeNum(local, remote) {
  if (!remote || !Object.keys(remote).length) return local;
  if (!local  || !Object.keys(local).length)  return remote;

  const merged = { ...remote };
  for (const [levelId, lv] of Object.entries(local)) {
    const rv = remote[levelId] || {};
    merged[levelId] = {
      learn:  (lv.learn  || rv.learn  || false),
      listen: Math.max(lv.listen || 0, rv.listen || 0),
      quiz:   Math.max(lv.quiz   || 0, rv.quiz   || 0),
    };
  }
  return merged;
}

// ── Wheel merge: union of packages by ID; more-items version wins ─────────

function mergeWheel(local, remote) {
  if (!Array.isArray(remote) || remote.length === 0) return Array.isArray(local) ? local : [];
  if (!Array.isArray(local)  || local.length  === 0) return remote;

  const byId = new Map();
  for (const pkg of remote) {
    if (pkg?.id) byId.set(pkg.id, pkg);
  }
  for (const pkg of local) {
    if (!pkg?.id) continue;
    const existing = byId.get(pkg.id);
    // Keep the package that has more items (proxy for "most recently edited")
    if (!existing || (pkg.items?.length || 0) >= (existing.items?.length || 0)) {
      byId.set(pkg.id, pkg);
    }
  }
  return [...byId.values()];
}

// ── Response helper ───────────────────────────────────────────────────────

function reply(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
}
