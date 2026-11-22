const { writeOneClass, readOneClass } = require('../lib/redis');

// Small resized teacher photo stored as a data URL (client shrinks it to ~200px).
const PHOTO_RE = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/;
const PHOTO_MAX = 150000;

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

    // Teacher photo:
    //  - string  -> set it (if it's a valid small image)
    //  - null    -> remove it
    //  - missing -> keep whatever is already stored (older/cached pages
    //               that don't know about photos can never wipe one out)
    let photo = '';
    if (typeof body.photo === 'string') {
      photo = (body.photo.length <= PHOTO_MAX && PHOTO_RE.test(body.photo)) ? body.photo : '';
    } else if (body.photo !== null) {
      const existing = await readOneClass(key);
      photo = (existing && typeof existing.photo === 'string') ? existing.photo : '';
    }
    if (photo) payload.photo = photo;

    const storageMode = await writeOneClass(key, payload);
    res.status(200).json({ ok: true, storageMode });
  } catch (err) {
    res.status(500).json({ error: String((err && err.message) || err) });
  }
};
