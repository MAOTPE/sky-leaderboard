const { requireAuth } = require('../lib/auth');
const { readHistory } = require('../lib/redis');

const KEY_RE = /^class-([1-9]|1[0-9]|2[0-5])$/;

module.exports = async (req, res) => {
  if (req.method !== 'GET') { res.status(405).json({ error: 'GET only' }); return; }
  if (!requireAuth(req, res)) return;
  const key = String((req.query && req.query.key) || '');
  if (!KEY_RE.test(key)) { res.status(400).json({ error: 'invalid class key' }); return; }
  try {
    res.status(200).json({ versions: await readHistory(key) });
  } catch (err) {
    res.status(500).json({ error: String((err && err.message) || err) });
  }
};
