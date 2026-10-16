/**
 * nl-sync — Cloudflare Worker
 * Deployed: https://nl-sync.itho.workers.dev
 *
 * Routes: GET /rss · GET /podcast · POST /sync · POST /story
 * Shared utilities and constants live in common.js.
 *
 * Secrets  : UPSTASH_URL, UPSTASH_TOKEN, OWNER_EMAIL  (wrangler secret put <NAME>)
 * Variables: GOOGLE_CLIENT_ID, STORY_MODEL              (wrangler.toml [vars])
 * Binding  : AI  (Workers AI, wrangler.toml [ai]) — used by POST /story
 */

import {
  corsHeaders,
  REDIS_TTL,
  FEED_USER_AGENT, FEED_CDN_TTL,
  RSS_FEED_URL, RSS_CACHE_KEY, RSS_MAX, RSS_FETCH_TTL, RSS_REDIS_TTL,
  PODCAST_FEED_URL, PODCAST_CACHE_KEY, PODCAST_MAX, PODCAST_FETCH_TTL, PODCAST_REDIS_TTL,
  reply,
  redisGet, redisSet, redisPush, redisLRange, redisLLen, redisLRemById, redisScanKeys,
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
    ttsEn:    localTtsEn   = null,
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
  const mergedTtsEn    = mergeVol     (localTtsEn,    stored?.ttsEn    || null);
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
      vol: mergedVol, ttsEn: mergedTtsEn, num: mergedNum, wheel: mergedWheel,
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
    vol: mergedVol, ttsEn: mergedTtsEn, num: mergedNum, wheel: mergedWheel,
    sentence: mergedSentence,
    theme:    mergedTheme,
    isAdmin:  user.email === _ownerEmail(env),
  }, 200, origin);
}

// ── Feedback ──────────────────────────────────────────────────────────────────

const FB_LIST_KEY  = 'feedback:list';
const FB_SEEN_KEY  = 'feedback:seen';   // last-read count for owner badge
const FB_RL_TTL    = 300;              // 5-min rate-limit window (seconds)
const FB_MSG_MAX   = 500;
// Image reports ("this picture doesn't match the word", from vanstart.html) are
// stored in the same list as type "image", with a lighter rate limit: one per
// FB_IMG_RL_TTL seconds and FB_IMG_DAY_MAX per day per IP, one per word per day.
const FB_IMG_RL_TTL  = 5;
const FB_IMG_DAY_MAX = 100;
const FB_IMG_DAY_TTL = 86400;
// OWNER_EMAIL is read from env (wrangler secret) — never hardcoded here.
const _ownerEmail = (env) => env.OWNER_EMAIL || '';

/**
 * Verifies the Bearer JWT and confirms the caller is the owner.
 * Returns the verified user payload on success, or calls reply() and returns null.
 * All admin handlers MUST go through this — never duplicate the auth logic.
 */
async function _requireOwner(request, env) {
  const origin = request.headers.get('Origin') || '';
  const auth   = request.headers.get('Authorization') || '';
  if (!auth.startsWith('Bearer ')) return { error: reply({ error: 'Unauthorized' }, 401, origin) };

  let user;
  try { user = await verifyGoogleJWT(auth.slice(7), env.GOOGLE_CLIENT_ID); }
  catch { return { error: reply({ error: 'Invalid token' }, 401, origin) }; }

  if (!_ownerEmail(env) || user.email !== _ownerEmail(env))
    return { error: reply({ error: 'Forbidden' }, 403, origin) };

  return { user };
}

/**
 * POST /feedback — submit feedback (no auth required)
 * Rate-limited per IP via a Redis key with TTL FB_RL_TTL.
 * Appends a JSON entry to FB_LIST_KEY (Redis list).
 */
async function handleFeedback(request, env) {
  const origin = request.headers.get('Origin') || '';

  let body;
  try { body = await request.json(); } catch { return reply({ error: 'Invalid JSON' }, 400, origin); }

  const message = (body.message || '').trim().slice(0, FB_MSG_MAX);
  const type    = ['bug', 'idea', 'general', 'image'].includes(body.type) ? body.type : 'general';
  if (!message) return reply({ error: 'Bericht is verplicht' }, 400, origin);

  const ip     = request.headers.get('CF-Connecting-IP') || 'anon';
  const ipSafe = ip.replace(/[^a-zA-Z0-9]/g, '_');

  // Image reports have their own, lighter limits (see FB_IMG_* above)
  let img = null, rlKey, rlTtl = FB_RL_TTL, dayKey, dayN = 0;
  if (type === 'image') {
    const clip = (v, n) => String(v || '').slice(0, n);
    img = {
      word:    clip(body.img?.word, 80),
      english: clip(body.img?.english, 120),
      lesson:  clip(body.img?.lesson, 40),
      file:    clip(body.img?.file, 120),
      kind:    body.img?.kind === 'emoji' ? 'emoji' : 'photo',
    };
    if (!img.word) return reply({ error: 'Woord is verplicht' }, 400, origin);

    dayKey = `feedback:imgday:${ipSafe}`;
    dayN   = Number(await redisGet(env.UPSTASH_URL, env.UPSTASH_TOKEN, dayKey)) || 0;
    if (dayN >= FB_IMG_DAY_MAX) return reply({ error: 'Te veel meldingen vandaag.' }, 429, origin);

    rlKey = `feedback:rlimg:${ipSafe}`;
    rlTtl = FB_IMG_RL_TTL;
    if (await redisGet(env.UPSTASH_URL, env.UPSTASH_TOKEN, rlKey))
      return reply({ error: 'Even wachten voor de volgende melding.' }, 429, origin);

    // Same word from the same IP within a day: accept silently, store once.
    // Checked AFTER the rate limits and marked only now, so a rejected (429)
    // report doesn't make the retry look like a duplicate.
    const wordKey = `feedback:imgdup:${ipSafe}:${img.word.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
    if (await redisGet(env.UPSTASH_URL, env.UPSTASH_TOKEN, wordKey))
      return reply({ ok: true, duplicate: true }, 200, origin);
    await redisSet(env.UPSTASH_URL, env.UPSTASH_TOKEN, wordKey, 1, FB_IMG_DAY_TTL);
  } else {
    rlKey = `feedback:rl:${ipSafe}`;
    if (await redisGet(env.UPSTASH_URL, env.UPSTASH_TOKEN, rlKey))
      return reply({ error: 'Wacht 5 minuten voor je opnieuw feedback stuurt.' }, 429, origin);
  }

  const entry = {
    id:   `fb_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    ts:   Date.now(),
    date: new Date().toISOString(),
    type,
    message,
    ...(img ? { img } : {}),
    env: {
      url:          (body.env?.url          || '').slice(0, 200),
      browser:      (body.env?.browser      || '').slice(0, 120),
      screen:       (body.env?.screen       || '').slice(0, 20),
      lang:         (body.env?.lang         || '').slice(0, 10),
      logged_in:    !!body.env?.logged_in,
      active_level: body.env?.active_level  || null,
      active_unit:  body.env?.active_unit   || null,
      streak:       Number(body.env?.streak) || 0,
    },
  };

  await Promise.all([
    redisPush(env.UPSTASH_URL, env.UPSTASH_TOKEN, FB_LIST_KEY, entry),
    redisSet(env.UPSTASH_URL, env.UPSTASH_TOKEN, rlKey, 1, rlTtl),
    ...(dayKey ? [redisSet(env.UPSTASH_URL, env.UPSTASH_TOKEN, dayKey, dayN + 1, FB_IMG_DAY_TTL)] : []),
  ]);

  return reply({ ok: true }, 200, origin);
}

/**
 * GET /feedback — read all items, newest-first (owner only, Bearer auth)
 * Also resets the unread counter stored in FB_SEEN_KEY.
 */
async function handleGetFeedback(request, env) {
  const origin  = request.headers.get('Origin') || '';
  const checked = await _requireOwner(request, env);
  if (checked.error) return checked.error;

  // All items, oldest first from Redis list → reverse = newest first; cap at 500
  const raw   = await redisLRange(env.UPSTASH_URL, env.UPSTASH_TOKEN, FB_LIST_KEY, 0, 499);
  const items = raw.slice().reverse();

  // Mark all as seen
  await redisSet(env.UPSTASH_URL, env.UPSTASH_TOKEN, FB_SEEN_KEY, items.length, REDIS_TTL);

  return reply({ items, total: items.length }, 200, origin);
}

/**
 * GET /feedback/badge — unread count (owner only, Bearer auth)
 * Returns { total, unseen } so the portal can show a notification dot.
 */
async function handleFeedbackBadge(request, env) {
  const origin  = request.headers.get('Origin') || '';
  const checked = await _requireOwner(request, env);
  if (checked.error) return checked.error;

  const [total, seen] = await Promise.all([
    redisLLen(env.UPSTASH_URL, env.UPSTASH_TOKEN, FB_LIST_KEY),
    redisGet(env.UPSTASH_URL, env.UPSTASH_TOKEN, FB_SEEN_KEY),
  ]);
  return reply({ total, unseen: Math.max(0, total - (seen || 0)) }, 200, origin);
}

/**
 * POST /feedback/delete — delete one feedback item by id (owner only, Bearer auth)
 * Body: { id: "fb_<ts>_<rand>" }. POST (not DELETE) so the CORS method list stays unchanged.
 * Keeps the unread counter in step: removing an already-seen item lowers FB_SEEN_KEY by one,
 * otherwise a newer unread item would drop out of the badge.
 */
async function handleDeleteFeedback(request, env) {
  const origin  = request.headers.get('Origin') || '';
  const checked = await _requireOwner(request, env);
  if (checked.error) return checked.error;

  let body;
  try { body = await request.json(); } catch { return reply({ error: 'Invalid JSON' }, 400, origin); }
  const id = String(body.id || '');
  if (!/^fb_\d+_[a-z0-9]+$/.test(id)) return reply({ error: 'Invalid id' }, 400, origin);

  const idx = await redisLRemById(env.UPSTASH_URL, env.UPSTASH_TOKEN, FB_LIST_KEY, id);
  if (idx < 0) return reply({ error: 'Niet gevonden' }, 404, origin);

  const seen = await redisGet(env.UPSTASH_URL, env.UPSTASH_TOKEN, FB_SEEN_KEY);
  if (typeof seen === 'number' && idx < seen)
    await redisSet(env.UPSTASH_URL, env.UPSTASH_TOKEN, FB_SEEN_KEY, Math.max(0, seen - 1), REDIS_TTL);

  return reply({ ok: true }, 200, origin);
}

/**
 * GET /admin/users — list all users who have ever synced (owner only)
 * Scans fc:* keys in Redis and returns lightweight user summaries.
 */
async function handleAdminUsers(request, env) {
  const origin  = request.headers.get('Origin') || '';
  const checked = await _requireOwner(request, env);
  if (checked.error) return checked.error;

  // Scan all user keys (fc:{sub}) in parallel — cap at 100 users
  const keys = await redisScanKeys(env.UPSTASH_URL, env.UPSTASH_TOKEN, 'fc:*');
  const results = await Promise.all(
    keys.slice(0, 100).map(key =>
      redisGet(env.UPSTASH_URL, env.UPSTASH_TOKEN, key)
        .then(data => data?.owner ? {
          name:     data.owner.name  || '',
          email:    data.owner.email || '',
          syncedAt: data.syncedAt    || null,
          lastSync: data.syncLog?.[0] || null,
        } : null)
        .catch(() => null)
    )
  );

  const users = results
    .filter(Boolean)
    .sort((a, b) => (b.syncedAt || 0) - (a.syncedAt || 0));

  return reply({ users, total: users.length }, 200, origin);
}

// ── Main router ───────────────────────────────────────────────────────────────

// ── AI story (Workers AI) ─────────────────────────────────────────────────────

/**
 * POST /story   body: { words: ["huis", "fiets", ...] }
 * Writes a short Dutch story that uses the words, followed by an English
 * translation in [ ... ] — the format game.js already renders.
 * Returns: { story: "<dutch>\n\n[<english>]" }
 *
 * No login (the word game is open to everyone), so it is protected instead:
 *   - input is sanitised and capped (STORY_WORDS_MAX words, STORY_WORD_LEN chars each)
 *   - per-IP: one request per STORY_IP_RL_TTL s and STORY_IP_DAY_MAX per day
 *   - global: STORY_GLOBAL_DAY_MAX per day, so strangers cannot burn the free
 *     Workers AI allowance (10,000 Neurons/day) — on 429/503 the game simply
 *     shows no story. Tune the caps to the model you choose.
 * Cost (llama-3.1-8b-instruct: 25,608 Neurons/M input, 75,147 Neurons/M output):
 *   input ~200 tok ≈ 5 Neurons + output <= STORY_MAX_TOKENS (400) ≈ 30 Neurons
 *   → <= ~35 Neurons per story, so 150 stories/day <= ~5,300 of the 10,000 free.
 * Counters are read-then-write on Upstash (not atomic) — fine for soft limits.
 */
const STORY_WORDS_MAX      = 20;
const STORY_WORD_LEN       = 40;
const STORY_IP_RL_TTL      = 10;     // seconds between requests per IP
const STORY_IP_DAY_MAX     = 40;
const STORY_GLOBAL_DAY_MAX = 150;
const STORY_DAY_TTL        = 86400;
const STORY_MAX_TOKENS     = 400;    // output ceiling; a normal story (NL + EN) is ~200-250 tokens
const STORY_MAX_CHARS      = 1600;   // ~4 chars/token — trims anything the model still overshoots
const STORY_DEFAULT_MODEL  = '@cf/meta/llama-3.1-8b-instruct';

async function handleStory(request, env) {
  const origin = request.headers.get('Origin') || '';
  if (!env.AI) return reply({ error: 'AI not configured' }, 503, origin);

  let body;
  try { body = await request.json(); } catch { return reply({ error: 'Invalid JSON' }, 400, origin); }

  const words = (Array.isArray(body.words) ? body.words : [])
    .map(w => String(w ?? '').replace(/[^\p{L}\p{N} '\-]/gu, '').trim().slice(0, STORY_WORD_LEN))
    .filter(Boolean)
    .slice(0, STORY_WORDS_MAX);
  if (!words.length) return reply({ error: 'words is required' }, 400, origin);

  const redis = [env.UPSTASH_URL, env.UPSTASH_TOKEN];
  const ip    = (request.headers.get('CF-Connecting-IP') || 'anon').replace(/[^a-zA-Z0-9]/g, '_');
  const today = new Date().toISOString().slice(0, 10);
  const rlKey = `story:rl:${ip}`, ipDayKey = `story:ipday:${ip}:${today}`, globalKey = `story:day:${today}`;

  if (await redisGet(...redis, rlKey)) return reply({ error: 'Even wachten.' }, 429, origin);
  const [ipDayN, globalN] = await Promise.all([
    redisGet(...redis, ipDayKey), redisGet(...redis, globalKey),
  ]).then(r => r.map(v => Number(v) || 0));
  if (ipDayN >= STORY_IP_DAY_MAX)         return reply({ error: 'Te veel verhalen vandaag.' }, 429, origin);
  if (globalN >= STORY_GLOBAL_DAY_MAX)    return reply({ error: 'Daily AI limit reached' }, 503, origin);

  let raw;
  try {
    const out = await env.AI.run(env.STORY_MODEL || STORY_DEFAULT_MODEL, {
      messages: [
        { role: 'system', content:
            'Je bent een Nederlandse taaldocent. Schrijf eenvoudig Nederlands (niveau A1-A2). ' +
            'Geef ALLEEN de tekst terug: geen markdown, geen titel, geen uitleg en geen quotes.' },
        { role: 'user', content:
            `Schrijf een kort Nederlands verhaal van 5 korte zinnen (maximaal 12 woorden per zin) met deze woorden: ${words.join(', ')}.\n` +
            'Zet daarna op een nieuwe regel de Engelse vertaling van het verhaal tussen [ ].' },
      ],
      max_tokens:  STORY_MAX_TOKENS,
      temperature: 0.7,
    });
    raw = String(out?.response ?? '').trim().slice(0, STORY_MAX_CHARS);
  } catch (e) {
    return reply({ error: 'AI unavailable' }, 503, origin);   // e.g. free allowance used up
  }
  if (!raw) return reply({ error: 'Empty story' }, 502, origin);

  // Count only successful generations
  await Promise.all([
    redisSet(...redis, rlKey,    1,           STORY_IP_RL_TTL),
    redisSet(...redis, ipDayKey, ipDayN + 1,  STORY_DAY_TTL),
    redisSet(...redis, globalKey, globalN + 1, STORY_DAY_TTL),
  ]).catch(() => {});

  return reply({ story: raw }, 200, origin);
}

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

    if (url.pathname === '/story') {
      if (request.method !== 'POST') return reply({ error: 'Method not allowed' }, 405, origin);
      return handleStory(request, env);
    }

    if (url.pathname === '/feedback') {
      if (request.method === 'POST') return handleFeedback(request, env);
      if (request.method === 'GET')  return handleGetFeedback(request, env);
      return reply({ error: 'Method not allowed' }, 405, origin);
    }

    if (url.pathname === '/feedback/badge') {
      if (request.method !== 'GET') return reply({ error: 'Method not allowed' }, 405, origin);
      return handleFeedbackBadge(request, env);
    }

    if (url.pathname === '/feedback/delete') {
      if (request.method !== 'POST') return reply({ error: 'Method not allowed' }, 405, origin);
      return handleDeleteFeedback(request, env);
    }

    if (url.pathname === '/admin/users') {
      if (request.method !== 'GET') return reply({ error: 'Method not allowed' }, 405, origin);
      return handleAdminUsers(request, env);
    }

    return reply({ error: 'Not found' }, 404, origin);
  },
};
