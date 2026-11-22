// Shared school password. Set APP_PASSWORD in Vercel (Settings > Environment
// Variables). Until it is set, the app stays open exactly as before.
// The browser keeps a 1-year cookie holding a hash of the password, so
// changing the password automatically signs every computer out.
const crypto = require('crypto');

function expectedToken() {
  const pw = process.env.APP_PASSWORD;
  if (!pw) return null;
  return crypto.createHash('sha256').update('sky-leaderboard:' + pw).digest('hex');
}

function isAuthed(req) {
  const expected = expectedToken();
  if (!expected) return true;
  const m = String(req.headers.cookie || '').match(/(?:^|;\s*)sky_auth=([a-f0-9]{64})/);
  if (!m) return false;
  return crypto.timingSafeEqual(Buffer.from(m[1]), Buffer.from(expected));
}

function requireAuth(req, res) {
  if (isAuthed(req)) return true;
  res.status(401).json({ error: 'login' });
  return false;
}

module.exports = { expectedToken, isAuthed, requireAuth };
