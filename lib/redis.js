// Shared helper: find whatever Redis/KV credentials Vercel injected, under
// whatever name the Marketplace integration happened to give them. Vercel's
// own "Vercel KV" product was retired (Dec 2024) in favor of Marketplace
// integrations like Upstash, and different integrations / store nicknames
// can produce different env var prefixes. Rather than force the user to
// find and rename env vars by hand, we scan for anything that looks right.
const { Redis } = require('@upstash/redis');

const HASH_KEY = 'sky_leaderboard_classes';
const CLASS_COUNT = 25;
const CLASS_KEYS = Array.from({ length: CLASS_COUNT }, (_, i) => `class-${i + 1}`);

function findRedisCreds() {
  const env = process.env;
  const urlPatterns = [/REDIS_REST_URL$/i, /KV_REST_API_URL$/i];
  for (const key of Object.keys(env)) {
    for (const pat of urlPatterns) {
      if (pat.test(key) && env[key]) {
        const tokenKey = key.replace(/URL$/i, 'TOKEN');
        if (env[tokenKey]) {
          return { url: env[key], token: env[tokenKey] };
        }
      }
    }
  }
  return null;
}

// In-memory fallback so the app never hard-crashes before a database is
// connected. NOT real persistence on Vercel (each serverless invocation can
// get a fresh instance) — it exists only so local testing and the very
// first deploy (before Storage is wired up) show a working UI instead of
// an error page.
global.__skyMemoryStore = global.__skyMemoryStore || {};

function getClient() {
  const creds = findRedisCreds();
  if (!creds) return null;
  return new Redis({ url: creds.url, token: creds.token });
}

function defaultClass(n) {
  return { name: `Class ${n}`, archived: false, students: [] };
}

async function readAllClasses() {
  const redis = getClient();
  let raw;
  let storageMode;
  if (redis) {
    raw = (await redis.hgetall(HASH_KEY)) || {};
    storageMode = 'redis';
  } else {
    raw = global.__skyMemoryStore;
    storageMode = 'memory-fallback';
  }
  const classes = CLASS_KEYS.map((key, idx) => {
    let val = raw[key];
    if (typeof val === 'string') {
      try { val = JSON.parse(val); } catch (e) { val = null; }
    }
    if (!val || typeof val !== 'object' || !Array.isArray(val.students)) {
      val = defaultClass(idx + 1);
    }
    return Object.assign({ key }, val);
  });
  return { classes, storageMode };
}

async function readOneClass(key) {
  const redis = getClient();
  let val = redis ? await redis.hget(HASH_KEY, key) : global.__skyMemoryStore[key];
  if (typeof val === 'string') {
    try { val = JSON.parse(val); } catch (e) { val = null; }
  }
  return val && typeof val === 'object' ? val : null;
}

const HIST_PREFIX = 'sky_hist:';      // last 100 saves of each class
const DAILY_PREFIX = 'sky_daily:';    // one full copy of every class per day
const HIST_KEEP = 100;

function stripPhoto(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  const copy = Object.assign({}, obj);
  delete copy.photo;
  return copy;
}

// Safety net: never let a save happen without first keeping what was there.
// A failure here must not block the save itself.
async function keepHistory(redis, key) {
  try {
    const day = new Date().toISOString().slice(0, 10);
    const first = await redis.set(DAILY_PREFIX + day + ':mark', '1', { nx: true, ex: 60 * 60 * 24 * 90 });
    if (first) {
      const all = (await redis.hgetall(HASH_KEY)) || {};
      const snap = {};
      for (const k of Object.keys(all)) {
        let v = all[k];
        if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { v = null; } }
        if (v) snap[k] = stripPhoto(v);
      }
      await redis.set(DAILY_PREFIX + day, JSON.stringify(snap), { ex: 60 * 60 * 24 * 90 });
    }
    let prev = await redis.hget(HASH_KEY, key);
    if (typeof prev === 'string') { try { prev = JSON.parse(prev); } catch (e) { prev = null; } }
    if (prev) {
      await redis.lpush(HIST_PREFIX + key, JSON.stringify({ t: Date.now(), data: stripPhoto(prev) }));
      await redis.ltrim(HIST_PREFIX + key, 0, HIST_KEEP - 1);
    }
  } catch (e) { /* history is best-effort */ }
}

async function readHistory(key) {
  const redis = getClient();
  if (!redis) return [];
  const items = (await redis.lrange(HIST_PREFIX + key, 0, HIST_KEEP - 1)) || [];
  return items.map((it) => {
    if (typeof it === 'string') { try { return JSON.parse(it); } catch (e) { return null; } }
    return it;
  }).filter(Boolean);
}

async function writeOneClass(key, payload) {
  const redis = getClient();
  if (redis) {
    await keepHistory(redis, key);
    await redis.hset(HASH_KEY, { [key]: JSON.stringify(payload) });
    return 'redis';
  }
  global.__skyMemoryStore[key] = JSON.stringify(payload);
  return 'memory-fallback';
}

module.exports = { findRedisCreds, readAllClasses, readOneClass, writeOneClass, readHistory, CLASS_KEYS };
