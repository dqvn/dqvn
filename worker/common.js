/**
 * common.js — shared utilities and constants for the nl-sync Cloudflare Worker
 *
 * Exports: ALLOWED_ORIGINS, corsHeaders, REDIS_TTL,
 *          RSS_FEED_URL, RSS_CACHE_KEY, RSS_MAX, RSS_FETCH_TTL, RSS_CDN_TTL,
 *          PODCAST_FEED_URL, PODCAST_CACHE_KEY, PODCAST_MAX, PODCAST_FETCH_TTL,
 *          FEED_USER_AGENT,
 *          reply, redisGet, redisSet, verifyGoogleJWT,
 *          mergeSRS, mergeMeta, mergeKlanken, mergeVerbs, mergeGame,
 *          mergeVol, mergeNum, mergeWheel, mergeSentence,
 *          rssIsVideo, rssSortTrim, rssParseItems, rssStripTags,
 *          rssText, rssLink, rssAllText,
 *          podcastParseItems
 */

// ── CORS ──────────────────────────────────────────────────────────────────────

// Only these origins receive Access-Control-Allow-Origin in responses.
// Add 'http://localhost:PORT' entries here for local dev as needed.
export const ALLOWED_ORIGINS = new Set([
  'https://dqvn.github.io',
]);

const _CORS_METHODS  = 'GET, POST, OPTIONS';
const _CORS_HEADERS  = 'Content-Type, Authorization';

// Returns CORS headers for a given request origin.
// Echoes the origin back only if it is in ALLOWED_ORIGINS; Vary: Origin
// ensures CDN caches never serve a permissioned response to a blocked origin.
export function corsHeaders(origin) {
  const base = {
    'Access-Control-Allow-Methods': _CORS_METHODS,
    'Access-Control-Allow-Headers': _CORS_HEADERS,
    'Vary': 'Origin',
  };
  if (ALLOWED_ORIGINS.has(origin)) {
    base['Access-Control-Allow-Origin'] = origin;
  }
  return base;
}

// ── Other constants ───────────────────────────────────────────────────────────

export const REDIS_TTL = 90 * 86400;      // 90 days — sync data TTL

export const FEED_USER_AGENT = 'Mozilla/5.0 (compatible; NLLearnReader/1.0)';
export const FEED_CDN_TTL    = 3600;      // 1 h — cf.cacheTtl + Cache-Control max-age

export const RSS_FEED_URL   = 'https://www.nu.nl/rss';
export const RSS_CACHE_KEY  = 'rss:nu:cache:v2'; // v2 = HTML-stripped
export const RSS_MAX        = 50;
export const RSS_FETCH_TTL  = 8000;       // 8 s upstream timeout
export const RSS_REDIS_TTL  = 7 * 86400;  // 7-day Redis TTL for feed cache

export const PODCAST_FEED_URL   = 'https://podcast.npo.nl/feed/met-het-oog-op-morgen.xml';
export const PODCAST_CACHE_KEY  = 'podcast:npo:moem:v1';
export const PODCAST_MAX        = 50;
export const PODCAST_FETCH_TTL  = 10000;  // 10 s upstream timeout
export const PODCAST_REDIS_TTL  = 7 * 86400;

// ── Response helper ───────────────────────────────────────────────────────────

export function reply(data, status = 200, origin = '') {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
  });
}

// ── Upstash REST helpers ──────────────────────────────────────────────────────

export async function redisGet(url, token, key) {
  const res = await fetch(`${url}/get/${encodeURIComponent(key)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const { result } = await res.json();
  if (!result) return null;
  try { return JSON.parse(result); } catch { return null; }
}

export async function redisSet(url, token, key, value, ex) {
  await fetch(`${url}/`, {
    method:  'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body:    JSON.stringify(['SET', key, JSON.stringify(value), 'EX', ex]),
  });
}

// ── Google JWT verification (Web Crypto, no deps) ─────────────────────────────

export async function verifyGoogleJWT(token, clientId) {
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

  if (payload.exp < now)        throw new Error('Token expired');
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

// ── Merge functions ───────────────────────────────────────────────────────────

// SRS: per-word, highest lastStudied wins
export function mergeSRS(local, remote) {
  if (!remote || !Object.keys(remote).length) return local;
  if (!local  || !Object.keys(local).length)  return remote;

  const merged      = {};
  const allChapters = new Set([...Object.keys(local), ...Object.keys(remote)]);

  for (const chId of allChapters) {
    const chL = local[chId]  || {};
    const chR = remote[chId] || {};

    if (!Object.keys(chL).length) { merged[chId] = chR; continue; }
    if (!Object.keys(chR).length) { merged[chId] = chL; continue; }

    const chM      = {};
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

// Meta: most-recently-active device wins, take max streak
export function mergeMeta(local, remote) {
  if (!remote || !Object.keys(remote).length) return local;
  if (!local  || !Object.keys(local).length)  return remote;

  const base = (local.lastStudyDate || '') >= (remote.lastStudyDate || '')
    ? local : remote;

  return {
    ...base,
    streak: Math.max(local.streak || 0, remote.streak || 0),
  };
}

// Klanken: union of completion flags { "cat:snd": 1 }
export function mergeKlanken(local, remote) {
  if (!remote || !Object.keys(remote).length) return local;
  if (!local  || !Object.keys(local).length)  return remote;
  return { ...remote, ...local }; // union: 1 from either side is kept
}

// Verbs: per-verb max(seen, correct) inside each lesson
export function mergeVerbs(local, remote) {
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

// Game: union of seen-word arrays per chapter
export function mergeGame(local, remote) {
  if (!remote || !Object.keys(remote).length) return local;
  if (!local  || !Object.keys(local).length)  return remote;

  const merged = { ...remote };
  for (const [ch, words] of Object.entries(local)) {
    if (!merged[ch]) { merged[ch] = words; continue; }
    merged[ch] = [...new Set([...merged[ch], ...words])];
  }
  return merged;
}

// Vol / Theme: most recently changed value wins { v, t }
export function mergeVol(local, remote) {
  if (!remote) return local;
  if (!local)  return remote;
  return (local?.t || 0) >= (remote?.t || 0) ? local : remote;
}

// Num: per-level best stars + union of learn flags
export function mergeNum(local, remote) {
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

// Wheel: union of packages by ID; more-items version wins
export function mergeWheel(local, remote) {
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

// Sentence: max XP; most-recent date wins for daily count; max streak
//   Schema: { date, count, streak, xp, lastGoalDate }
export function mergeSentence(local, remote) {
  if (!remote || !Object.keys(remote).length) return local;
  if (!local  || !Object.keys(local).length)  return remote;

  // For daily count: pick whichever has the later date; same date → higher count
  const ld = local.date  || '';
  const rd = remote.date || '';
  let date, count;
  if (ld > rd)      { date = ld; count = local.count  || 0; }
  else if (rd > ld) { date = rd; count = remote.count || 0; }
  else              { date = ld; count = Math.max(local.count || 0, remote.count || 0); }

  // Streak: take max, but only trust the one whose lastGoalDate is more recent
  const llg = local.lastGoalDate  || '';
  const rlg = remote.lastGoalDate || '';
  const lastGoalDate = llg >= rlg ? llg : rlg;
  const streak = Math.max(local.streak || 0, remote.streak || 0);

  return {
    date,
    count,
    streak,
    xp:           Math.max(local.xp || 0, remote.xp || 0),
    lastGoalDate,
  };
}

// ── RSS helpers ───────────────────────────────────────────────────────────────

// Returns true for items that are video-only content
export function rssIsVideo(item) {
  const link = (item.link || '').toLowerCase();
  const cats = (item.categories || []).map(c => c.toLowerCase());
  return cats.some(c => c.includes('video')) || link.includes('/video/');
}

// Dedup by guid, sort by pubDate newest-first, keep at most `max` items
export function rssSortTrim(items, max) {
  const seen    = new Set();
  const deduped = items.filter(item => {
    const key = item.guid || item.link;
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  deduped.sort((a, b) =>
    new Date(b.pubDate || 0).getTime() - new Date(a.pubDate || 0).getTime()
  );
  return deduped.slice(0, max);
}

// Parse RSS 2.0 XML without DOM (Workers runtime has no DOMParser)
export function rssParseItems(xml) {
  const items  = [];
  const itemRx = /<item[^>]*>([\s\S]*?)<\/item>/gi;
  let m;

  while ((m = itemRx.exec(xml)) !== null && items.length < 30) {
    const b    = m[1];
    const link = rssLink(b);
    items.push({
      title:       rssStripTags(rssText(b, 'title')),
      link,
      description: rssStripTags(rssText(b, 'description')),
      pubDate:     rssText(b, 'pubDate'),
      guid:        rssText(b, 'guid') || link,
      categories:  rssAllText(b, 'category'),
    });
  }

  return items;
}

// Strip HTML tags and decode common entities — Workers have no DOM
export function rssStripTags(str) {
  return (str || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi,  ' ')
    .replace(/&amp;/gi,   '&')
    .replace(/&lt;/gi,    '<')
    .replace(/&gt;/gi,    '>')
    .replace(/&quot;/gi,  '"')
    .replace(/&#39;/gi,   "'")
    .replace(/\s+/g, ' ')
    .trim();
}

export function rssText(block, tag) {
  const rx = new RegExp(
    `<${tag}[^>]*>\\s*(?:<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>|([\\s\\S]*?))\\s*<\\/${tag}>`, 'i'
  );
  const m = block.match(rx);
  return (m?.[1] ?? m?.[2] ?? '').trim();
}

export function rssLink(block) {
  // <link>URL</link>  or  <link><![CDATA[URL]]></link>
  const m1 = block.match(/<link>\s*(?:<!\[CDATA\[([\s\S]*?)\]\]>|([^<]*))\s*<\/link>/i);
  if (m1) return (m1[1] ?? m1[2] ?? '').trim();
  // Atom-style: <link href="URL" .../>
  const m2 = block.match(/<link[^>]+href="([^"]+)"/i);
  return (m2?.[1] ?? '').trim();
}

export function rssAllText(block, tag) {
  const results = [];
  const rx = new RegExp(
    `<${tag}[^>]*>\\s*(?:<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>|([^<]*))\\s*<\\/${tag}>`, 'gi'
  );
  let m;
  while ((m = rx.exec(block)) !== null) {
    const v = (m[1] ?? m[2] ?? '').trim();
    if (v) results.push(v);
  }
  return results;
}

// ── Podcast helpers ───────────────────────────────────────────────────────────

// Parse RSS 2.0 podcast feed — extracts audio enclosure + itunes metadata
export function podcastParseItems(xml) {
  const items  = [];
  const itemRx = /<item[^>]*>([\s\S]*?)<\/item>/gi;
  let m;

  while ((m = itemRx.exec(xml)) !== null && items.length < 50) {
    const b = m[1];

    // <enclosure url="..." type="audio/..."> — try both attribute orderings
    const encM = b.match(/<enclosure[^>]+url="([^"]+)"[^>]*type="audio[^"]*"/i)
               || b.match(/<enclosure[^>]+type="audio[^"]*"[^>]+url="([^"]+)"/i);
    const audioUrl = (encM?.[1]?.trim() || '').replace(/&amp;/gi, '&');
    if (!audioUrl) continue; // skip items with no playable audio

    // <itunes:duration>
    const durM     = b.match(/<itunes:duration[^>]*>([^<]+)<\/itunes:duration>/i);
    const duration = durM?.[1]?.trim() || '';

    // <itunes:episode>
    const epM     = b.match(/<itunes:episode[^>]*>([^<]+)<\/itunes:episode>/i);
    const episode = epM?.[1]?.trim() || '';

    const link = rssLink(b).replace(/&amp;/gi, '&');
    items.push({
      title:       rssStripTags(rssText(b, 'title')),
      link,
      description: rssStripTags(rssText(b, 'description')),
      pubDate:     rssText(b, 'pubDate'),
      guid:        rssText(b, 'guid') || link,
      audioUrl,
      duration,
      episode,
    });
  }

  return items;
}
