var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// common.js
var ALLOWED_ORIGINS = /* @__PURE__ */ new Set([
  "https://dqvn.github.io"
]);
var _CORS_METHODS = "GET, POST, OPTIONS";
var _CORS_HEADERS = "Content-Type, Authorization";
function corsHeaders(origin) {
  const base = {
    "Access-Control-Allow-Methods": _CORS_METHODS,
    "Access-Control-Allow-Headers": _CORS_HEADERS,
    "Vary": "Origin"
  };
  if (ALLOWED_ORIGINS.has(origin)) {
    base["Access-Control-Allow-Origin"] = origin;
  }
  return base;
}
__name(corsHeaders, "corsHeaders");
var REDIS_TTL = 90 * 86400;
var FEED_USER_AGENT = "Mozilla/5.0 (compatible; NLLearnReader/1.0)";
var FEED_CDN_TTL = 3600;
var RSS_FEED_URL = "https://www.nu.nl/rss";
var RSS_CACHE_KEY = "rss:nu:cache:v2";
var RSS_MAX = 50;
var RSS_FETCH_TTL = 8e3;
var RSS_REDIS_TTL = 7 * 86400;
var PODCAST_FEED_URL = "https://podcast.npo.nl/feed/met-het-oog-op-morgen.xml";
var PODCAST_CACHE_KEY = "podcast:npo:moem:v1";
var PODCAST_MAX = 50;
var PODCAST_FETCH_TTL = 1e4;
var PODCAST_REDIS_TTL = 7 * 86400;
function reply(data, status = 200, origin = "") {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders(origin) }
  });
}
__name(reply, "reply");
async function redisGet(url, token, key) {
  const res = await fetch(`${url}/get/${encodeURIComponent(key)}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const { result } = await res.json();
  if (!result) return null;
  try {
    return JSON.parse(result);
  } catch {
    return null;
  }
}
__name(redisGet, "redisGet");
async function redisSet(url, token, key, value, ex) {
  await fetch(`${url}/`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(["SET", key, JSON.stringify(value), "EX", ex])
  });
}
__name(redisSet, "redisSet");
async function redisPush(url, token, key, value) {
  await fetch(`${url}/`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(["RPUSH", key, JSON.stringify(value)])
  });
}
__name(redisPush, "redisPush");
async function redisLRange(url, token, key, start = 0, stop = -1) {
  const r = await fetch(
    `${url}/lrange/${encodeURIComponent(key)}/${start}/${stop}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const { result } = await r.json();
  if (!Array.isArray(result)) return [];
  return result.map((s) => {
    try {
      return JSON.parse(s);
    } catch {
      return null;
    }
  }).filter(Boolean);
}
__name(redisLRange, "redisLRange");
async function redisLLen(url, token, key) {
  const r = await fetch(
    `${url}/llen/${encodeURIComponent(key)}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const { result } = await r.json();
  return typeof result === "number" ? result : 0;
}
__name(redisLLen, "redisLLen");
async function redisLRemById(url, token, key, id) {
  const hdr = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  const r = await fetch(`${url}/`, {
    method: "POST",
    headers: hdr,
    body: JSON.stringify(["LRANGE", key, "0", "-1"])
  });
  const { result } = await r.json();
  if (!Array.isArray(result)) return -1;
  const idx = result.findIndex((s) => {
    try {
      return JSON.parse(s).id === id;
    } catch {
      return false;
    }
  });
  if (idx < 0) return -1;
  await fetch(`${url}/`, {
    method: "POST",
    headers: hdr,
    body: JSON.stringify(["LREM", key, "1", result[idx]])
  });
  return idx;
}
__name(redisLRemById, "redisLRemById");
async function redisScanKeys(url, token, pattern) {
  const keys = [];
  let cursor = "0";
  do {
    const r = await fetch(`${url}/`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(["SCAN", cursor, "MATCH", pattern, "COUNT", "100"])
    });
    const { result } = await r.json();
    if (!Array.isArray(result) || result.length < 2) break;
    cursor = String(result[0]);
    if (Array.isArray(result[1])) keys.push(...result[1]);
  } while (cursor !== "0");
  return keys;
}
__name(redisScanKeys, "redisScanKeys");
async function verifyGoogleJWT(token, clientId) {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("Malformed JWT");
  const [rawHeader, rawPayload, rawSig] = parts;
  function decodeB64url(s) {
    const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
    const pad = b64 + "=".repeat((4 - b64.length % 4) % 4);
    const bin = atob(pad);
    return new Uint8Array([...bin].map((c) => c.charCodeAt(0)));
  }
  __name(decodeB64url, "decodeB64url");
  const header = JSON.parse(new TextDecoder().decode(decodeB64url(rawHeader)));
  const payload = JSON.parse(new TextDecoder().decode(decodeB64url(rawPayload)));
  const now = Math.floor(Date.now() / 1e3);
  if (payload.exp < now) throw new Error("Token expired");
  if (payload.aud !== clientId) throw new Error("Wrong audience");
  if (payload.iss !== "accounts.google.com" && payload.iss !== "https://accounts.google.com") {
    throw new Error("Wrong issuer");
  }
  const jwksRes = await fetch("https://www.googleapis.com/oauth2/v3/certs");
  const { keys } = await jwksRes.json();
  const jwk = keys.find((k) => k.kid === header.kid);
  if (!jwk) throw new Error("Signing key not found");
  const cryptoKey = await crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"]
  );
  const data = new TextEncoder().encode(`${rawHeader}.${rawPayload}`);
  const sig = decodeB64url(rawSig);
  const valid = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", cryptoKey, sig, data);
  if (!valid) throw new Error("Signature invalid");
  return {
    sub: payload.sub,
    email: payload.email,
    name: payload.name,
    picture: payload.picture
  };
}
__name(verifyGoogleJWT, "verifyGoogleJWT");
function srsEncodeWord(w) {
  return [w.state, w.interval, w.ease, w.nextDue, w.lapses, w.reps, w.seen, w.lastStudied].join("|");
}
__name(srsEncodeWord, "srsEncodeWord");
function srsDecodeWord(v) {
  if (typeof v !== "string") return v;
  const p = v.split("|");
  return {
    state: p[0],
    interval: Number(p[1]),
    ease: Number(p[2]),
    nextDue: Number(p[3]),
    lapses: Number(p[4]),
    reps: Number(p[5]),
    seen: Number(p[6]),
    lastStudied: Number(p[7])
  };
}
__name(srsDecodeWord, "srsDecodeWord");
function srsEncode(blob) {
  const out = {};
  for (const [chId, ch] of Object.entries(blob || {})) {
    const enc = {};
    for (const [word, v] of Object.entries(ch)) {
      enc[word] = word === "_totals" ? v : srsEncodeWord(v);
    }
    out[chId] = enc;
  }
  return out;
}
__name(srsEncode, "srsEncode");
function srsDecode(blob) {
  const out = {};
  for (const [chId, ch] of Object.entries(blob || {})) {
    const dec = {};
    for (const [word, v] of Object.entries(ch)) {
      dec[word] = word === "_totals" ? v : srsDecodeWord(v);
    }
    out[chId] = dec;
  }
  return out;
}
__name(srsDecode, "srsDecode");
function mergeSRS(local, remote) {
  if (!remote || !Object.keys(remote).length) return local;
  if (!local || !Object.keys(local).length) return remote;
  const merged = {};
  const allChapters = /* @__PURE__ */ new Set([...Object.keys(local), ...Object.keys(remote)]);
  for (const chId of allChapters) {
    const chL = local[chId] || {};
    const chR = remote[chId] || {};
    if (!Object.keys(chL).length) {
      merged[chId] = chR;
      continue;
    }
    if (!Object.keys(chR).length) {
      merged[chId] = chL;
      continue;
    }
    const chM = {};
    const allWords = /* @__PURE__ */ new Set([...Object.keys(chL), ...Object.keys(chR)]);
    for (const word of allWords) {
      if (word === "_totals") continue;
      const wL = chL[word], wR = chR[word];
      if (!wR) {
        chM[word] = wL;
        continue;
      }
      if (!wL) {
        chM[word] = wR;
        continue;
      }
      chM[word] = (wL.lastStudied || 0) >= (wR.lastStudied || 0) ? wL : wR;
    }
    const tL = chL._totals || {}, tR = chR._totals || {};
    if (tL.seen || tR.seen) {
      chM._totals = {
        seen: Math.max(tL.seen || 0, tR.seen || 0),
        hard: Math.max(tL.hard || 0, tR.hard || 0),
        good: Math.max(tL.good || 0, tR.good || 0),
        easy: Math.max(tL.easy || 0, tR.easy || 0),
        lastStudied: Math.max(tL.lastStudied || 0, tR.lastStudied || 0)
      };
    }
    merged[chId] = chM;
  }
  return merged;
}
__name(mergeSRS, "mergeSRS");
function mergeMeta(local, remote) {
  if (!remote || !Object.keys(remote).length) return local;
  if (!local || !Object.keys(local).length) return remote;
  const base = (local.lastStudyDate || "") >= (remote.lastStudyDate || "") ? local : remote;
  return {
    ...base,
    streak: Math.max(local.streak || 0, remote.streak || 0)
  };
}
__name(mergeMeta, "mergeMeta");
function mergeKlanken(local, remote) {
  if (!remote || !Object.keys(remote).length) return local;
  if (!local || !Object.keys(local).length) return remote;
  return { ...remote, ...local };
}
__name(mergeKlanken, "mergeKlanken");
function mergeVerbs(local, remote) {
  if (!remote || remote.version !== 3) return local;
  if (!local || local.version !== 3) return remote;
  const mergedLessons = {};
  const allLessons = /* @__PURE__ */ new Set([
    ...Object.keys(local.lessons || {}),
    ...Object.keys(remote.lessons || {})
  ]);
  for (const lessonId of allLessons) {
    const lL = local.lessons?.[lessonId] || {};
    const lR = remote.lessons?.[lessonId] || {};
    const mergedStats = {};
    const allVerbs = /* @__PURE__ */ new Set([
      ...Object.keys(lL.verbStats || {}),
      ...Object.keys(lR.verbStats || {})
    ]);
    for (const verb of allVerbs) {
      const vL = lL.verbStats?.[verb] || { seen: 0, correct: 0 };
      const vR = lR.verbStats?.[verb] || { seen: 0, correct: 0 };
      mergedStats[verb] = {
        seen: Math.max(vL.seen || 0, vR.seen || 0),
        correct: Math.max(vL.correct || 0, vR.correct || 0)
      };
    }
    mergedLessons[lessonId] = {
      sessions: Math.max(lL.sessions || 0, lR.sessions || 0),
      totalCorrect: Math.max(lL.totalCorrect || 0, lR.totalCorrect || 0),
      totalAnswered: Math.max(lL.totalAnswered || 0, lR.totalAnswered || 0),
      verbStats: mergedStats
    };
  }
  const base = (local.lastStudy || "") >= (remote.lastStudy || "") ? local : remote;
  return {
    ...base,
    streak: Math.max(local.streak || 0, remote.streak || 0),
    lessons: mergedLessons
  };
}
__name(mergeVerbs, "mergeVerbs");
function mergeGame(local, remote) {
  if (!remote || !Object.keys(remote).length) return local;
  if (!local || !Object.keys(local).length) return remote;
  const merged = { ...remote };
  for (const [ch, words] of Object.entries(local)) {
    if (!merged[ch]) {
      merged[ch] = words;
      continue;
    }
    merged[ch] = [.../* @__PURE__ */ new Set([...merged[ch], ...words])];
  }
  return merged;
}
__name(mergeGame, "mergeGame");
function mergeVol(local, remote) {
  if (!remote) return local;
  if (!local) return remote;
  return (local?.t || 0) >= (remote?.t || 0) ? local : remote;
}
__name(mergeVol, "mergeVol");
function mergeNum(local, remote) {
  if (!remote || !Object.keys(remote).length) return local;
  if (!local || !Object.keys(local).length) return remote;
  const merged = { ...remote };
  for (const [levelId, lv] of Object.entries(local)) {
    const rv = remote[levelId] || {};
    merged[levelId] = {
      learn: lv.learn || rv.learn || false,
      listen: Math.max(lv.listen || 0, rv.listen || 0),
      quiz: Math.max(lv.quiz || 0, rv.quiz || 0)
    };
  }
  return merged;
}
__name(mergeNum, "mergeNum");
function mergeWheel(local, remote) {
  if (!Array.isArray(remote) || remote.length === 0) return Array.isArray(local) ? local : [];
  if (!Array.isArray(local) || local.length === 0) return remote;
  const byId = /* @__PURE__ */ new Map();
  for (const pkg of remote) {
    if (pkg?.id) byId.set(pkg.id, pkg);
  }
  for (const pkg of local) {
    if (!pkg?.id) continue;
    const existing = byId.get(pkg.id);
    if (!existing || (pkg.items?.length || 0) >= (existing.items?.length || 0)) {
      byId.set(pkg.id, pkg);
    }
  }
  return [...byId.values()];
}
__name(mergeWheel, "mergeWheel");
function mergeSentence(local, remote) {
  if (!remote || !Object.keys(remote).length) return local;
  if (!local || !Object.keys(local).length) return remote;
  const ld = local.date || "";
  const rd = remote.date || "";
  let date, count;
  if (ld > rd) {
    date = ld;
    count = local.count || 0;
  } else if (rd > ld) {
    date = rd;
    count = remote.count || 0;
  } else {
    date = ld;
    count = Math.max(local.count || 0, remote.count || 0);
  }
  const llg = local.lastGoalDate || "";
  const rlg = remote.lastGoalDate || "";
  const lastGoalDate = llg >= rlg ? llg : rlg;
  const streak = Math.max(local.streak || 0, remote.streak || 0);
  return {
    date,
    count,
    streak,
    xp: Math.max(local.xp || 0, remote.xp || 0),
    lastGoalDate
  };
}
__name(mergeSentence, "mergeSentence");
function rssIsVideo(item) {
  const link = (item.link || "").toLowerCase();
  const cats = (item.categories || []).map((c) => c.toLowerCase());
  return cats.some((c) => c.includes("video")) || link.includes("/video/");
}
__name(rssIsVideo, "rssIsVideo");
function rssSortTrim(items, max) {
  const seen = /* @__PURE__ */ new Set();
  const deduped = items.filter((item) => {
    const key = item.guid || item.link;
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  deduped.sort(
    (a, b) => new Date(b.pubDate || 0).getTime() - new Date(a.pubDate || 0).getTime()
  );
  return deduped.slice(0, max);
}
__name(rssSortTrim, "rssSortTrim");
function rssParseItems(xml) {
  const items = [];
  const itemRx = /<item[^>]*>([\s\S]*?)<\/item>/gi;
  let m;
  while ((m = itemRx.exec(xml)) !== null && items.length < 30) {
    const b = m[1];
    const link = rssLink(b);
    const imgM = b.match(/<enclosure[^>]+url="([^"]+)"[^>]*type="image[^"]*"/i) || b.match(/<enclosure[^>]+type="image[^"]*"[^>]+url="([^"]+)"/i);
    const image = (imgM?.[1]?.trim() || "").replace(/&amp;/gi, "&");
    items.push({
      title: rssStripTags(rssText(b, "title")),
      link,
      description: rssStripTags(rssText(b, "description")),
      pubDate: rssText(b, "pubDate"),
      guid: rssText(b, "guid") || link,
      categories: rssAllText(b, "category"),
      image
    });
  }
  return items;
}
__name(rssParseItems, "rssParseItems");
function rssStripTags(str) {
  return (str || "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/&quot;/gi, '"').replace(/&#39;/gi, "'").replace(/\s+/g, " ").trim();
}
__name(rssStripTags, "rssStripTags");
function rssText(block, tag) {
  const rx = new RegExp(
    `<${tag}[^>]*>\\s*(?:<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>|([\\s\\S]*?))\\s*<\\/${tag}>`,
    "i"
  );
  const m = block.match(rx);
  return (m?.[1] ?? m?.[2] ?? "").trim();
}
__name(rssText, "rssText");
function rssLink(block) {
  const m1 = block.match(/<link>\s*(?:<!\[CDATA\[([\s\S]*?)\]\]>|([^<]*))\s*<\/link>/i);
  if (m1) return (m1[1] ?? m1[2] ?? "").trim();
  const m2 = block.match(/<link[^>]+href="([^"]+)"/i);
  return (m2?.[1] ?? "").trim();
}
__name(rssLink, "rssLink");
function rssAllText(block, tag) {
  const results = [];
  const rx = new RegExp(
    `<${tag}[^>]*>\\s*(?:<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>|([^<]*))\\s*<\\/${tag}>`,
    "gi"
  );
  let m;
  while ((m = rx.exec(block)) !== null) {
    const v = (m[1] ?? m[2] ?? "").trim();
    if (v) results.push(v);
  }
  return results;
}
__name(rssAllText, "rssAllText");
function podcastParseItems(xml) {
  const items = [];
  const itemRx = /<item[^>]*>([\s\S]*?)<\/item>/gi;
  let m;
  while ((m = itemRx.exec(xml)) !== null && items.length < 50) {
    const b = m[1];
    const encM = b.match(/<enclosure[^>]+url="([^"]+)"[^>]*type="audio[^"]*"/i) || b.match(/<enclosure[^>]+type="audio[^"]*"[^>]+url="([^"]+)"/i);
    const audioUrl = (encM?.[1]?.trim() || "").replace(/&amp;/gi, "&");
    if (!audioUrl) continue;
    const durM = b.match(/<itunes:duration[^>]*>([^<]+)<\/itunes:duration>/i);
    const duration = durM?.[1]?.trim() || "";
    const epM = b.match(/<itunes:episode[^>]*>([^<]+)<\/itunes:episode>/i);
    const episode = epM?.[1]?.trim() || "";
    const link = rssLink(b).replace(/&amp;/gi, "&");
    items.push({
      title: rssStripTags(rssText(b, "title")),
      link,
      description: rssStripTags(rssText(b, "description")),
      pubDate: rssText(b, "pubDate"),
      guid: rssText(b, "guid") || link,
      audioUrl,
      duration,
      episode
    });
  }
  return items;
}
__name(podcastParseItems, "podcastParseItems");

// index.js
var _rssMemCache = null;
var _podcastMemCache = null;
async function handleRSS(env, origin) {
  let freshItems = null;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), RSS_FETCH_TTL);
    let upstream;
    try {
      upstream = await fetch(RSS_FEED_URL, {
        signal: ctrl.signal,
        headers: { "User-Agent": FEED_USER_AGENT, "Accept": "application/rss+xml, application/xml, text/xml, */*" },
        cf: { cacheTtl: FEED_CDN_TTL, cacheEverything: true }
      });
    } finally {
      clearTimeout(timer);
    }
    if (upstream?.ok) {
      const xml = await upstream.text();
      freshItems = rssParseItems(xml).filter((item) => !rssIsVideo(item));
    }
  } catch (_) {
  }
  let persisted = _rssMemCache;
  if (!persisted && env?.UPSTASH_URL && env?.UPSTASH_TOKEN) {
    try {
      persisted = await redisGet(env.UPSTASH_URL, env.UPSTASH_TOKEN, RSS_CACHE_KEY);
    } catch (_) {
    }
  }
  if (!Array.isArray(persisted)) persisted = [];
  let items;
  if (freshItems?.length) {
    const freshGuids = new Set(freshItems.map((i) => i.guid).filter(Boolean));
    const carried = persisted.filter((i) => i.guid && !freshGuids.has(i.guid));
    items = rssSortTrim([...freshItems, ...carried], RSS_MAX);
    _rssMemCache = items;
    if (env?.UPSTASH_URL && env?.UPSTASH_TOKEN) {
      redisSet(env.UPSTASH_URL, env.UPSTASH_TOKEN, RSS_CACHE_KEY, items, RSS_REDIS_TTL).catch(() => {
      });
    }
  } else if (persisted.length) {
    items = persisted;
    _rssMemCache = items;
  } else {
    return reply({ error: "RSS unavailable and no cached data" }, 503, origin);
  }
  return new Response(JSON.stringify({ status: "ok", items, fetchedAt: Date.now() }), {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": `public, max-age=${FEED_CDN_TTL}`,
      ...corsHeaders(origin)
    }
  });
}
__name(handleRSS, "handleRSS");
async function handlePodcast(env, origin) {
  let freshItems = null;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), PODCAST_FETCH_TTL);
    let upstream;
    try {
      upstream = await fetch(PODCAST_FEED_URL, {
        signal: ctrl.signal,
        headers: { "User-Agent": FEED_USER_AGENT, "Accept": "application/rss+xml, application/xml, text/xml, */*" },
        cf: { cacheTtl: FEED_CDN_TTL, cacheEverything: true }
      });
    } finally {
      clearTimeout(timer);
    }
    if (upstream?.ok) {
      const xml = await upstream.text();
      freshItems = podcastParseItems(xml);
    }
  } catch (_) {
  }
  let persisted = _podcastMemCache;
  if (!persisted && env?.UPSTASH_URL && env?.UPSTASH_TOKEN) {
    try {
      persisted = await redisGet(env.UPSTASH_URL, env.UPSTASH_TOKEN, PODCAST_CACHE_KEY);
    } catch (_) {
    }
  }
  if (!Array.isArray(persisted)) persisted = [];
  let items;
  if (freshItems?.length) {
    const freshGuids = new Set(freshItems.map((i) => i.guid).filter(Boolean));
    const carried = persisted.filter((i) => i.guid && !freshGuids.has(i.guid));
    items = rssSortTrim([...freshItems, ...carried], PODCAST_MAX);
    _podcastMemCache = items;
    if (env?.UPSTASH_URL && env?.UPSTASH_TOKEN) {
      redisSet(env.UPSTASH_URL, env.UPSTASH_TOKEN, PODCAST_CACHE_KEY, items, PODCAST_REDIS_TTL).catch(() => {
      });
    }
  } else if (persisted.length) {
    items = persisted;
    _podcastMemCache = items;
  } else {
    return reply({ error: "Podcast feed unavailable and no cached data" }, 503, origin);
  }
  return new Response(JSON.stringify({ status: "ok", items, fetchedAt: Date.now() }), {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": `public, max-age=${FEED_CDN_TTL}`,
      ...corsHeaders(origin)
    }
  });
}
__name(handlePodcast, "handlePodcast");
async function handleSync(request, env) {
  const origin = request.headers.get("Origin") || "";
  const auth = request.headers.get("Authorization") || "";
  if (!auth.startsWith("Bearer ")) return reply({ error: "Unauthorized" }, 401, origin);
  let user;
  try {
    user = await verifyGoogleJWT(auth.slice(7), env.GOOGLE_CLIENT_ID);
  } catch (e) {
    return reply({ error: "Invalid token: " + e.message }, 401, origin);
  }
  let body;
  try {
    body = await request.json();
  } catch {
    return reply({ error: "Invalid JSON" }, 400, origin);
  }
  const {
    srs: localSRS = {},
    meta: localMeta = {},
    klanken: localKlanken = {},
    verbs: localVerbs = {},
    game: localGame = {},
    vol: localVol = null,
    ttsEn: localTtsEn = null,
    num: localNum = {},
    wheel: localWheel = [],
    sentence: localSentence = {},
    theme: localTheme = {},
    device: clientDevice = null
  } = body;
  const key = `fc:${user.sub}`;
  const stored = await redisGet(env.UPSTASH_URL, env.UPSTASH_TOKEN, key);
  const remoteSRS = srsDecode(stored?.srs || {});
  const mergedSRS = mergeSRS(localSRS, remoteSRS);
  const mergedMeta = mergeMeta(localMeta, stored?.meta || {});
  const mergedKlanken = mergeKlanken(localKlanken, stored?.klanken || {});
  const mergedVerbs = mergeVerbs(localVerbs, stored?.verbs || {});
  const mergedGame = mergeGame(localGame, stored?.game || {});
  const mergedVol = mergeVol(localVol, stored?.vol || null);
  const mergedTtsEn = mergeVol(localTtsEn, stored?.ttsEn || null);
  const mergedNum = mergeNum(localNum, stored?.num || {});
  const mergedWheel = mergeWheel(localWheel, stored?.wheel || []);
  const mergedSentence = mergeSentence(localSentence, stored?.sentence || {});
  const mergedTheme = mergeVol(localTheme, stored?.theme || {});
  const prevSyncs = stored?.syncLog || [];
  const syncEntry = {
    at: Date.now(),
    name: user.name,
    email: user.email,
    sub: user.sub,
    ua: clientDevice?.ua || null,
    tz: clientDevice?.tz || null,
    lang: clientDevice?.lang || null
  };
  const syncLog = [syncEntry, ...prevSyncs].slice(0, 5);
  await redisSet(
    env.UPSTASH_URL,
    env.UPSTASH_TOKEN,
    key,
    {
      srs: srsEncode(mergedSRS),
      meta: mergedMeta,
      klanken: mergedKlanken,
      verbs: mergedVerbs,
      game: mergedGame,
      vol: mergedVol,
      ttsEn: mergedTtsEn,
      num: mergedNum,
      wheel: mergedWheel,
      sentence: mergedSentence,
      theme: mergedTheme,
      owner: { sub: user.sub, email: user.email, name: user.name },
      syncedAt: Date.now(),
      syncLog
    },
    REDIS_TTL
  );
  return reply({
    srs: mergedSRS,
    meta: mergedMeta,
    klanken: mergedKlanken,
    verbs: mergedVerbs,
    game: mergedGame,
    vol: mergedVol,
    ttsEn: mergedTtsEn,
    num: mergedNum,
    wheel: mergedWheel,
    sentence: mergedSentence,
    theme: mergedTheme,
    isAdmin: user.email === _ownerEmail(env)
  }, 200, origin);
}
__name(handleSync, "handleSync");
var FB_LIST_KEY = "feedback:list";
var FB_SEEN_KEY = "feedback:seen";
var FB_RL_TTL = 300;
var FB_MSG_MAX = 500;
var FB_IMG_RL_TTL = 5;
var FB_IMG_DAY_MAX = 100;
var FB_IMG_DAY_TTL = 86400;
var _ownerEmail = /* @__PURE__ */ __name((env) => env.OWNER_EMAIL || "", "_ownerEmail");
async function _requireOwner(request, env) {
  const origin = request.headers.get("Origin") || "";
  const auth = request.headers.get("Authorization") || "";
  if (!auth.startsWith("Bearer ")) return { error: reply({ error: "Unauthorized" }, 401, origin) };
  let user;
  try {
    user = await verifyGoogleJWT(auth.slice(7), env.GOOGLE_CLIENT_ID);
  } catch {
    return { error: reply({ error: "Invalid token" }, 401, origin) };
  }
  if (!_ownerEmail(env) || user.email !== _ownerEmail(env))
    return { error: reply({ error: "Forbidden" }, 403, origin) };
  return { user };
}
__name(_requireOwner, "_requireOwner");
async function handleFeedback(request, env) {
  const origin = request.headers.get("Origin") || "";
  let body;
  try {
    body = await request.json();
  } catch {
    return reply({ error: "Invalid JSON" }, 400, origin);
  }
  const message = (body.message || "").trim().slice(0, FB_MSG_MAX);
  const type = ["bug", "idea", "general", "image"].includes(body.type) ? body.type : "general";
  if (!message) return reply({ error: "Bericht is verplicht" }, 400, origin);
  const ip = request.headers.get("CF-Connecting-IP") || "anon";
  const ipSafe = ip.replace(/[^a-zA-Z0-9]/g, "_");
  let img = null, rlKey, rlTtl = FB_RL_TTL, dayKey, dayN = 0;
  if (type === "image") {
    const clip = /* @__PURE__ */ __name((v, n) => String(v || "").slice(0, n), "clip");
    img = {
      word: clip(body.img?.word, 80),
      english: clip(body.img?.english, 120),
      lesson: clip(body.img?.lesson, 40),
      file: clip(body.img?.file, 120),
      kind: body.img?.kind === "emoji" ? "emoji" : "photo"
    };
    if (!img.word) return reply({ error: "Woord is verplicht" }, 400, origin);
    dayKey = `feedback:imgday:${ipSafe}`;
    dayN = Number(await redisGet(env.UPSTASH_URL, env.UPSTASH_TOKEN, dayKey)) || 0;
    if (dayN >= FB_IMG_DAY_MAX) return reply({ error: "Te veel meldingen vandaag." }, 429, origin);
    rlKey = `feedback:rlimg:${ipSafe}`;
    rlTtl = FB_IMG_RL_TTL;
    if (await redisGet(env.UPSTASH_URL, env.UPSTASH_TOKEN, rlKey))
      return reply({ error: "Even wachten voor de volgende melding." }, 429, origin);
    const wordKey = `feedback:imgdup:${ipSafe}:${img.word.toLowerCase().replace(/[^a-z0-9]/g, "_")}`;
    if (await redisGet(env.UPSTASH_URL, env.UPSTASH_TOKEN, wordKey))
      return reply({ ok: true, duplicate: true }, 200, origin);
    await redisSet(env.UPSTASH_URL, env.UPSTASH_TOKEN, wordKey, 1, FB_IMG_DAY_TTL);
  } else {
    rlKey = `feedback:rl:${ipSafe}`;
    if (await redisGet(env.UPSTASH_URL, env.UPSTASH_TOKEN, rlKey))
      return reply({ error: "Wacht 5 minuten voor je opnieuw feedback stuurt." }, 429, origin);
  }
  const entry = {
    id: `fb_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    ts: Date.now(),
    date: (/* @__PURE__ */ new Date()).toISOString(),
    type,
    message,
    ...img ? { img } : {},
    env: {
      url: (body.env?.url || "").slice(0, 200),
      browser: (body.env?.browser || "").slice(0, 120),
      screen: (body.env?.screen || "").slice(0, 20),
      lang: (body.env?.lang || "").slice(0, 10),
      logged_in: !!body.env?.logged_in,
      active_level: body.env?.active_level || null,
      active_unit: body.env?.active_unit || null,
      streak: Number(body.env?.streak) || 0
    }
  };
  await Promise.all([
    redisPush(env.UPSTASH_URL, env.UPSTASH_TOKEN, FB_LIST_KEY, entry),
    redisSet(env.UPSTASH_URL, env.UPSTASH_TOKEN, rlKey, 1, rlTtl),
    ...dayKey ? [redisSet(env.UPSTASH_URL, env.UPSTASH_TOKEN, dayKey, dayN + 1, FB_IMG_DAY_TTL)] : []
  ]);
  return reply({ ok: true }, 200, origin);
}
__name(handleFeedback, "handleFeedback");
async function handleGetFeedback(request, env) {
  const origin = request.headers.get("Origin") || "";
  const checked = await _requireOwner(request, env);
  if (checked.error) return checked.error;
  const raw = await redisLRange(env.UPSTASH_URL, env.UPSTASH_TOKEN, FB_LIST_KEY, 0, 499);
  const items = raw.slice().reverse();
  await redisSet(env.UPSTASH_URL, env.UPSTASH_TOKEN, FB_SEEN_KEY, items.length, REDIS_TTL);
  return reply({ items, total: items.length }, 200, origin);
}
__name(handleGetFeedback, "handleGetFeedback");
async function handleFeedbackBadge(request, env) {
  const origin = request.headers.get("Origin") || "";
  const checked = await _requireOwner(request, env);
  if (checked.error) return checked.error;
  const [total, seen] = await Promise.all([
    redisLLen(env.UPSTASH_URL, env.UPSTASH_TOKEN, FB_LIST_KEY),
    redisGet(env.UPSTASH_URL, env.UPSTASH_TOKEN, FB_SEEN_KEY)
  ]);
  return reply({ total, unseen: Math.max(0, total - (seen || 0)) }, 200, origin);
}
__name(handleFeedbackBadge, "handleFeedbackBadge");
async function handleDeleteFeedback(request, env) {
  const origin = request.headers.get("Origin") || "";
  const checked = await _requireOwner(request, env);
  if (checked.error) return checked.error;
  let body;
  try {
    body = await request.json();
  } catch {
    return reply({ error: "Invalid JSON" }, 400, origin);
  }
  const id = String(body.id || "");
  if (!/^fb_\d+_[a-z0-9]+$/.test(id)) return reply({ error: "Invalid id" }, 400, origin);
  const idx = await redisLRemById(env.UPSTASH_URL, env.UPSTASH_TOKEN, FB_LIST_KEY, id);
  if (idx < 0) return reply({ error: "Niet gevonden" }, 404, origin);
  const seen = await redisGet(env.UPSTASH_URL, env.UPSTASH_TOKEN, FB_SEEN_KEY);
  if (typeof seen === "number" && idx < seen)
    await redisSet(env.UPSTASH_URL, env.UPSTASH_TOKEN, FB_SEEN_KEY, Math.max(0, seen - 1), REDIS_TTL);
  return reply({ ok: true }, 200, origin);
}
__name(handleDeleteFeedback, "handleDeleteFeedback");
async function handleAdminUsers(request, env) {
  const origin = request.headers.get("Origin") || "";
  const checked = await _requireOwner(request, env);
  if (checked.error) return checked.error;
  const keys = await redisScanKeys(env.UPSTASH_URL, env.UPSTASH_TOKEN, "fc:*");
  const results = await Promise.all(
    keys.slice(0, 100).map(
      (key) => redisGet(env.UPSTASH_URL, env.UPSTASH_TOKEN, key).then((data) => data?.owner ? {
        name: data.owner.name || "",
        email: data.owner.email || "",
        syncedAt: data.syncedAt || null,
        lastSync: data.syncLog?.[0] || null
      } : null).catch(() => null)
    )
  );
  const users = results.filter(Boolean).sort((a, b) => (b.syncedAt || 0) - (a.syncedAt || 0));
  return reply({ users, total: users.length }, 200, origin);
}
__name(handleAdminUsers, "handleAdminUsers");
var STORY_WORDS_MAX = 40;
var STORY_WORD_LEN = 40;
var STORY_IP_RL_TTL = 10;
var STORY_IP_DAY_MAX = 40;
var STORY_GLOBAL_DAY_MAX = 120;
var STORY_DAY_TTL = 86400;
var STORY_MAX_TOKENS = 900;
var STORY_MAX_CHARS = 3600;
var STORY_DEFAULT_MODEL = "@cf/meta/llama-4-scout-17b-16e-instruct";
async function handleStory(request, env) {
  const origin = request.headers.get("Origin") || "";
  if (!env.AI) return reply({ error: "AI not configured" }, 503, origin);
  let body;
  try {
    body = await request.json();
  } catch {
    return reply({ error: "Invalid JSON" }, 400, origin);
  }
  const words = (Array.isArray(body.words) ? body.words : []).map((w) => String(w ?? "").replace(/[^\p{L}\p{N} '\-]/gu, "").trim().slice(0, STORY_WORD_LEN)).filter(Boolean).slice(0, STORY_WORDS_MAX);
  if (!words.length) return reply({ error: "words is required" }, 400, origin);
  const redis = [env.UPSTASH_URL, env.UPSTASH_TOKEN];
  const ip = (request.headers.get("CF-Connecting-IP") || "anon").replace(/[^a-zA-Z0-9]/g, "_");
  const today = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
  const rlKey = `story:rl:${ip}`, ipDayKey = `story:ipday:${ip}:${today}`, globalKey = `story:day:${today}`;
  if (await redisGet(...redis, rlKey)) return reply({ error: "Even wachten." }, 429, origin);
  const [ipDayN, globalN] = await Promise.all([
    redisGet(...redis, ipDayKey),
    redisGet(...redis, globalKey)
  ]).then((r) => r.map((v) => Number(v) || 0));
  if (ipDayN >= STORY_IP_DAY_MAX) return reply({ error: "Te veel verhalen vandaag." }, 429, origin);
  if (globalN >= STORY_GLOBAL_DAY_MAX) return reply({ error: "Daily AI limit reached" }, 503, origin);
  const sentences = Math.min(12, Math.max(5, Math.round(words.length / 3.5)));
  const perSentence = Math.ceil(words.length / sentences);
  let raw, out;
  try {
    out = await env.AI.run(env.STORY_MODEL || STORY_DEFAULT_MODEL, {
      messages: [
        { role: "system", content: "Je bent een Nederlandse taaldocent. Schrijf eenvoudig Nederlands (niveau A1-A2). Geef ALLEEN de tekst terug: geen markdown, geen titel, geen uitleg en geen quotes." },
        { role: "user", content: `Schrijf een kort Nederlands verhaal van ${sentences} zinnen (maximaal 20 woorden per zin). Gebruik ALLE ${words.length} woorden uit de lijst, ongeveer ${perSentence} woorden per zin, zonder er een over te slaan: ${words.join(", ")}.
Zet daarna op een nieuwe regel de Engelse vertaling van het verhaal tussen [ ].` }
      ],
      max_tokens: STORY_MAX_TOKENS,
      temperature: 0.7
    });
    const text = out?.response ?? out?.choices?.[0]?.message?.content ?? "";
    raw = String(text).trim().slice(0, STORY_MAX_CHARS);
  } catch (e) {
    console.error("[story] AI error:", e?.message || e);
    return reply({ error: "AI unavailable" }, 503, origin);
  }
  if (!raw) {
    console.error("[story] empty reply, model output:", JSON.stringify(out).slice(0, 400));
    return reply({ error: "Empty story" }, 502, origin);
  }
  await Promise.all([
    redisSet(...redis, rlKey, 1, STORY_IP_RL_TTL),
    redisSet(...redis, ipDayKey, ipDayN + 1, STORY_DAY_TTL),
    redisSet(...redis, globalKey, globalN + 1, STORY_DAY_TTL)
  ]).catch(() => {
  });
  return reply({ story: raw }, 200, origin);
}
__name(handleStory, "handleStory");
var index_default = {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }
    const url = new URL(request.url);
    if (url.pathname === "/rss") {
      if (request.method !== "GET") return reply({ error: "Method not allowed" }, 405, origin);
      return handleRSS(env, origin);
    }
    if (url.pathname === "/podcast") {
      if (request.method !== "GET") return reply({ error: "Method not allowed" }, 405, origin);
      return handlePodcast(env, origin);
    }
    if (url.pathname === "/sync") {
      if (request.method !== "POST") return reply({ error: "Method not allowed" }, 405, origin);
      return handleSync(request, env);
    }
    if (url.pathname === "/story") {
      if (request.method !== "POST") return reply({ error: "Method not allowed" }, 405, origin);
      return handleStory(request, env);
    }
    if (url.pathname === "/feedback") {
      if (request.method === "POST") return handleFeedback(request, env);
      if (request.method === "GET") return handleGetFeedback(request, env);
      return reply({ error: "Method not allowed" }, 405, origin);
    }
    if (url.pathname === "/feedback/badge") {
      if (request.method !== "GET") return reply({ error: "Method not allowed" }, 405, origin);
      return handleFeedbackBadge(request, env);
    }
    if (url.pathname === "/feedback/delete") {
      if (request.method !== "POST") return reply({ error: "Method not allowed" }, 405, origin);
      return handleDeleteFeedback(request, env);
    }
    if (url.pathname === "/admin/users") {
      if (request.method !== "GET") return reply({ error: "Method not allowed" }, 405, origin);
      return handleAdminUsers(request, env);
    }
    return reply({ error: "Not found" }, 404, origin);
  }
};
export {
  index_default as default
};
//# sourceMappingURL=index.js.map
