/**
 * nl-sync — Cloudflare Worker
 * Deployed: https://nl-sync.itho.workers.dev
 *
 * Routes: GET /rss · GET /podcast · POST /sync
 * Shared utilities and constants live in common.js.
 *
 * Secrets  : UPSTASH_URL, UPSTASH_TOKEN  (wrangler secret put <NAME>)
 * Variables: GOOGLE_CLIENT_ID            (wrangler.toml [vars])
 */

import {
  corsHeaders,
  REDIS_TTL,
  FEED_USER_AGENT, FEED_CDN_TTL,
  RSS_FEED_URL, RSS_CACHE_KEY, RSS_MAX, RSS_FETCH_TTL, RSS_REDIS_TTL,
  PODCAST_FEED_URL, PODCAST_CACHE_KEY, PODCAST_MAX, PODCAST_FETCH_TTL, PODCAST_REDIS_TTL,
  reply,
  redisGet, redisSet,
  verifyGoogleJWT,
  srsEncode, srsDecode,
  mergeSRS, mergeMeta, mergeKlanken, mergeVerbs, mergeGame,
  mergeVol, mergeNum, mergeWheel, mergeSentence,
  rssIsVideo, rssSortTrim, rssParseItems,
  podcastParseItems,
} from './common.js';

// Module-level in-memory caches — survive within a warm isolate
let _rssMemCache     = null;
let _podcastMemCache = null;

// ── Endpoint handlers ─────────────────────────────────────────────────────────

/**
 * GET /rss
 * Proxies nu.nl RSS feed with a 2-layer cache:
 *   1. Module-level memory (warm isolate, zero-latency)
 *   2. Upstash Redis key RSS_CACHE_KEY (7-day TTL)
 * Falls back to stale cache on upstream failure.
 * Returns: { status, items: [...], fetchedAt }
 */
async function handleRSS(env, origin) {
  // 1. Try fetching fresh items from nu.nl (with timeout)
  let freshItems = null;
  try {
    const ctrl  = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), RSS_FETCH_TTL);
    let upstream;
    try {
      upstream = await fetch(RSS_FEED_URL, {
        signal: ctrl.signal,
        headers: { 'User-Agent': FEED_USER_AGENT, 'Accept': 'application/rss+xml, application/xml, text/xml, */*' },
        cf: { cacheTtl: FEED_CDN_TTL, cacheEverything: true },
      });
    } finally {
      clearTimeout(timer);
    }
    if (upstream?.ok) {
      const xml = await upstream.text();
      freshItems = rssParseItems(xml).filter(item => !rssIsVideo(item));
    }
  } catch (_) { /* timeout or network error — fall through to cache */ }

  // 2. Load persisted cache (Redis, fallback to module-level memory)
  let persisted = _rssMemCache;
  if (!persisted && env?.UPSTASH_URL && env?.UPSTASH_TOKEN) {
    try { persisted = await redisGet(env.UPSTASH_URL, env.UPSTASH_TOKEN, RSS_CACHE_KEY); }
    catch (_) {}
  }
  if (!Array.isArray(persisted)) persisted = [];

  // 3. Merge, dedup by guid, sort newest-first, cap at RSS_MAX
  let items;
  if (freshItems?.length) {
    const freshGuids = new Set(freshItems.map(i => i.guid).filter(Boolean));
    const carried    = persisted.filter(i => i.guid && !freshGuids.has(i.guid));
    items = rssSortTrim([...freshItems, ...carried], RSS_MAX);

    // Persist asynchronously (don't block the response)
    _rssMemCache = items;
    if (env?.UPSTASH_URL && env?.UPSTASH_TOKEN) {
      redisSet(env.UPSTASH_URL, env.UPSTASH_TOKEN, RSS_CACHE_KEY, items, RSS_REDIS_TTL)
        .catch(() => {});
    }
  } else if (persisted.length) {
    // Upstream unavailable — serve stale cache
    items = persisted;
    _rssMemCache = items;
  } else {
    return reply({ error: 'RSS unavailable and no cached data' }, 503, origin);
  }

  return new Response(JSON.stringify({ status: 'ok', items, fetchedAt: Date.now() }), {
    headers: {
      'Content-Type':  'application/json',
      'Cache-Control': `public, max-age=${FEED_CDN_TTL}`,
      ...corsHeaders(origin),
    },
  });
}

/**
 * GET /podcast
 * Proxies NPO "Met het Oog op Morgen" RSS feed. Regex XML parser extracts
 * <enclosure> audio URL, <itunes:duration>, and <itunes:episode>.
 * Cache key: PODCAST_CACHE_KEY (7-day TTL).
 * Returns: { status, items: [...], fetchedAt }
 */
async function handlePodcast(env, origin) {
  // 1. Try fetching fresh episodes from NPO
  let freshItems = null;
  try {
    const ctrl  = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), PODCAST_FETCH_TTL);
    let upstream;
    try {
      upstream = await fetch(PODCAST_FEED_URL, {
        signal: ctrl.signal,
        headers: { 'User-Agent': FEED_USER_AGENT, 'Accept': 'application/rss+xml, application/xml, text/xml, */*' },
        cf: { cacheTtl: FEED_CDN_TTL, cacheEverything: true },
      });
    } finally {
      clearTimeout(timer);
    }
    if (upstream?.ok) {
      const xml = await upstream.text();
      freshItems = podcastParseItems(xml);
    }
  } catch (_) { /* timeout or network error — fall through to cache */ }

  // 2. Load persisted cache (Redis, fallback to module-level memory)
  let persisted = _podcastMemCache;
  if (!persisted && env?.UPSTASH_URL && env?.UPSTASH_TOKEN) {
    try { persisted = await redisGet(env.UPSTASH_URL, env.UPSTASH_TOKEN, PODCAST_CACHE_KEY); }
    catch (_) {}
  }
  if (!Array.isArray(persisted)) persisted = [];

  // 3. Merge, dedup by guid, sort newest-first, cap at PODCAST_MAX
  let items;
  if (freshItems?.length) {
    const freshGuids = new Set(freshItems.map(i => i.guid).filter(Boolean));
    const carried    = persisted.filter(i => i.guid && !freshGuids.has(i.guid));
    items = rssSortTrim([...freshItems, ...carried], PODCAST_MAX);

    _podcastMemCache = items;
    if (env?.UPSTASH_URL && env?.UPSTASH_TOKEN) {
      redisSet(env.UPSTASH_URL, env.UPSTASH_TOKEN, PODCAST_CACHE_KEY, items, PODCAST_REDIS_TTL)
        .catch(() => {});
    }
  } else if (persisted.length) {
    items = persisted;
    _podcastMemCache = items;
  } else {
    return reply({ error: 'Podcast feed unavailable and no cached data' }, 503, origin);
  }

  return new Response(JSON.stringify({ status: 'ok', items, fetchedAt: Date.now() }), {
    headers: {
      'Content-Type':  'application/json',
      'Cache-Control': `public, max-age=${FEED_CDN_TTL}`,
      ...corsHeaders(origin),
    },
  });
}

/**
 * POST /sync
 * Authorization: Bearer <google-id-token>
 * Verifies JWT (Web Crypto RS256), merges local + Redis blobs, writes back.
 * Redis key: fc:{google_sub}   TTL: 90 days
 *
 * Request body fields → localStorage key → merge strategy:
 *   srs      nl_srs_v3            per-word: highest lastStudied wins
 *   meta     nl_srs_meta_v3       most-recent lastStudyDate wins; max streak
 *   klanken  klanken-v1           union (completed sound never un-completed)
 *   verbs    nl_verbs_v3          per-verb: max(seen) + max(correct)
 *   game     nl_game_progress_v1  union of seen-word arrays per chapter
 *   vol      nl_vocab_vol         most-recent timestamp wins { v, t }
 *   num      nl_num_progress      per-level: max(stars); learn flag unioned
 *   wheel    nl_wheel_pkgs        union by package ID; more-items wins
 *   sentence nl_sentence_v1       max XP; most-recent date wins for count; max streak
 *   theme    nl_portal_theme      most-recent timestamp wins { v, t }
 *
 * Returns: same ten fields merged + device syncLog (last 5 entries)
 */
async function handleSync(request, env) {
  const origin = request.headers.get('Origin') || '';

  // ── Auth ───────────────────────────────────────────────────────────────────
  const auth = request.headers.get('Authorization') || '';
  if (!auth.startsWith('Bearer ')) return reply({ error: 'Unauthorized' }, 401, origin);

  let user;
  try {
    user = await verifyGoogleJWT(auth.slice(7), env.GOOGLE_CLIENT_ID);
  } catch (e) {
    return reply({ error: 'Invalid token: ' + e.message }, 401, origin);
  }

  // ── Body ───────────────────────────────────────────────────────────────────
  let body;
  try { body = await request.json(); }
  catch { return reply({ error: 'Invalid JSON' }, 400, origin); }

  const {
    srs:      localSRS      = {},
    meta:     localMeta     = {},
    klanken:  localKlanken  = {},
    verbs:    localVerbs    = {},
    game:     localGame     = {},
    vol:      localVol      = null,
    num:      localNum      = {},
    wheel:    localWheel    = [],
    sentence: localSentence = {},
    theme:    localTheme    = {},
    device:   clientDevice  = null,
  } = body;

  // ── Redis read ─────────────────────────────────────────────────────────────
  const key    = `fc:${user.sub}`;
  const stored = await redisGet(env.UPSTASH_URL, env.UPSTASH_TOKEN, key);

  // ── Merge all ten blobs ────────────────────────────────────────────────────
  // Decode compact SRS strings from Redis back to objects before merging
  const remoteSRS      = srsDecode(stored?.srs || {});
  const mergedSRS      = mergeSRS     (localSRS,      remoteSRS);
  const mergedMeta     = mergeMeta    (localMeta,     stored?.meta     || {});
  const mergedKlanken  = mergeKlanken (localKlanken,  stored?.klanken  || {});
  const mergedVerbs    = mergeVerbs   (localVerbs,    stored?.verbs    || {});
  const mergedGame     = mergeGame    (localGame,     stored?.game     || {});
  const mergedVol      = mergeVol     (localVol,      stored?.vol      || null);
  const mergedNum      = mergeNum     (localNum,      stored?.num      || {});
  const mergedWheel    = mergeWheel   (localWheel,    stored?.wheel    || []);
  const mergedSentence = mergeSentence(localSentence, stored?.sentence || {});
  const mergedTheme    = mergeVol     (localTheme,    stored?.theme    || {});

  // ── Redis write ────────────────────────────────────────────────────────────
  // Keep a rolling log of the last 5 device syncs
  const prevSyncs = stored?.syncLog || [];
  const syncEntry = {
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
      srs: srsEncode(mergedSRS), meta: mergedMeta,
      klanken: mergedKlanken, verbs: mergedVerbs, game: mergedGame,
      vol: mergedVol, num: mergedNum, wheel: mergedWheel,
      sentence: mergedSentence,
      theme:    mergedTheme,
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
    sentence: mergedSentence,
    theme:    mergedTheme,
  }, 200, origin);
}

// ── Main router ───────────────────────────────────────────────────────────────

/**
 * Entry point. Extracts the request origin once, handles CORS preflight,
 * then dispatches to the matching endpoint handler.
 */
export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    const url = new URL(request.url);

    if (url.pathname === '/rss') {
      if (request.method !== 'GET') return reply({ error: 'Method not allowed' }, 405, origin);
      return handleRSS(env, origin);
    }

    if (url.pathname === '/podcast') {
      if (request.method !== 'GET') return reply({ error: 'Method not allowed' }, 405, origin);
      return handlePodcast(env, origin);
    }

    if (url.pathname === '/sync') {
      if (request.method !== 'POST') return reply({ error: 'Method not allowed' }, 405, origin);
      return handleSync(request, env);
    }

    return reply({ error: 'Not found' }, 404, origin);
  },
};
