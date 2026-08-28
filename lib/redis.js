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

async function writeOneClass(key, payload) {
  const redis = getClient();
  if (redis) {
    await redis.hset(HASH_KEY, { [key]: JSON.stringify(payload) });
    return 'redis';
  }
  global.__skyMemoryStore[key] = JSON.stringify(payload);
  return 'memory-fallback';
}

module.exports = { findRedisCreds, readAllClasses, writeOneClass, CLASS_KEYS };
