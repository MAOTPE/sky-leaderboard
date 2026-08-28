const { writeOneClass } = require('../lib/redis');

const KEY_RE = /^class-([1-9]|1[0-9]|2[0-5])$/;

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'POST only' });
    return;
  }
  try {
    let body = req.body;
    // Defensive: Vercel's Node runtime normally auto-parses a JSON body into
    // req.body, but if it ever arrives as a raw string, parse it ourselves.
    if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch (e) { body = null; }
    }
    if (!body || typeof body !== 'object') {
      res.status(400).json({ error: 'missing or invalid JSON body' });
      return;
    }

    const { key, name, archived, students } = body;
    if (typeof key !== 'string' || !KEY_RE.test(key)) {
      res.status(400).json({ error: 'invalid class key' });
      return;
    }
    if (typeof name !== 'string' || !Array.isArray(students)) {
      res.status(400).json({ error: 'invalid payload shape' });
      return;
    }

    const cleanStudents = students.slice(0, 60).map((s) => ({
      name: String((s && s.name) || 'Student').slice(0, 60),
      score: Math.max(0, Math.min(999999, parseInt(s && s.score, 10) || 0)),
      lastDelta: parseInt((s && s.lastDelta) || 0, 10) || 0,
    }));

    const payload = {
      name: String(name).slice(0, 80) || 'Class',
      archived: !!archived,
      students: cleanStudents,
    };

    const storageMode = await writeOneClass(key, payload);
    res.status(200).json({ ok: true, storageMode });
  } catch (err) {
    res.status(500).json({ error: String((err && err.message) || err) });
  }
};
