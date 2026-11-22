const crypto = require('crypto');
const { expectedToken } = require('../lib/auth');

module.exports = async (req, res) => {
  if (req.method !== 'POST') { res.status(405).json({ error: 'POST only' }); return; }
  const expected = expectedToken();
  if (!expected) { res.status(200).json({ ok: true, open: true }); return; }
  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } }
  const given = crypto.createHash('sha256').update('sky-leaderboard:' + String((body && body.password) || '')).digest('hex');
  if (!crypto.timingSafeEqual(Buffer.from(given), Buffer.from(expected))) {
    await new Promise((r) => setTimeout(r, 900)); // slow down guessing
    res.status(401).json({ error: 'wrong password' });
    return;
  }
  res.setHeader('Set-Cookie', 'sky_auth=' + expected + '; Path=/; Max-Age=31536000; HttpOnly; Secure; SameSite=Lax');
  res.status(200).json({ ok: true });
};
