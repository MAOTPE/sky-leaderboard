const { readAllClasses } = require('../lib/redis');

const { requireAuth } = require('../lib/auth');

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'GET only' });
    return;
  }
  if (!requireAuth(req, res)) return;
  try {
    const { classes, storageMode } = await readAllClasses();
    res.status(200).json({ classes, storageMode });
  } catch (err) {
    res.status(500).json({ error: String((err && err.message) || err) });
  }
};
