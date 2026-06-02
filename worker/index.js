/**
 * nl-sync — Cloudflare Worker
 *
 * POST /sync
 *   Authorization: Bearer <google-id-token>
 *   Body: { srs: {...nl_srs_v3...}, meta: {...nl_srs_meta_v3...} }
 *
 * Returns: { srs, meta }  (merged result written back to Upstash)
 *
 * Secrets (set via: wrangler secret put <NAME>)
 *   UPSTASH_URL   — full REST URL, e.g. https://excited-shark-39701.upstash.io
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

    const { srs: localSRS = {}, meta: localMeta = {} } = body;

    // ── Redis read ────────────────────────────────────────────────────────
    const key    = `fc:${user.sub}`;
    const stored = await redisGet(env.UPSTASH_URL, env.UPSTASH_TOKEN, key);

    const remoteSRS  = stored?.srs  || {};
    const remoteMeta = stored?.meta || {};

    // ── Merge ─────────────────────────────────────────────────────────────
    const mergedSRS  = mergeSRS(localSRS, remoteSRS);
    const mergedMeta = mergeMeta(localMeta, remoteMeta);

    // ── Redis write ───────────────────────────────────────────────────────
    await redisSet(
      env.UPSTASH_URL, env.UPSTASH_TOKEN, key,
      { srs: mergedSRS, meta: mergedMeta, syncedAt: Date.now() },
      REDIS_TTL
    );

    return reply({ srs: mergedSRS, meta: mergedMeta });
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

// ── Response helper ───────────────────────────────────────────────────────

function reply(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
}
