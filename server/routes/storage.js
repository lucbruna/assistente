import { Router } from 'express';

const router = Router();

const db = new Map();

router.get('/all', (req, res) => {
  const data = db.get(req.user.email) || { files: [], events: [], notes: [] };
  res.json({ success: true, data });
});

router.post('/save', (req, res) => {
  try {
    const { type, payload } = req.body;
    const userData = db.get(req.user.email) || { files: [], events: [], notes: [] };
    const data = typeof payload === 'string' ? JSON.parse(payload) : payload;
    if (type === 'file') userData.files.unshift(data);
    if (type === 'event') userData.events.push(data);
    if (type === 'note') userData.notes.unshift(data);
    db.set(req.user.email, userData);
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.delete('/all', (req, res) => {
  db.delete(req.user.email);
  res.json({ success: true });
});

export { router as storageRouter };
