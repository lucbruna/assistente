import { Router } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

const router = Router();
const users = new Map();

router.post('/register', async (req, res) => {
  try {
    const { email, password, name } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Dados incompletos' });
    if (users.has(email)) return res.status(409).json({ error: 'Usuário já existe' });
    const hashed = await bcrypt.hash(password, 10);
    users.set(email, { email, name, password: hashed, createdAt: new Date() });
    const token = jwt.sign({ email, name }, process.env.JWT_SECRET, { expiresIn: '30d' });
    res.json({ success: true, token, user: { email, name } });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = users.get(email);
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });
    const ok = await bcrypt.compare(password, user.password);
    if (!ok) return res.status(401).json({ error: 'Senha incorreta' });
    const token = jwt.sign({ email, name: user.name }, process.env.JWT_SECRET, { expiresIn: '30d' });
    res.json({ success: true, token, user: { email, name: user.name } });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/me', (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  try { const decoded = jwt.verify(token, process.env.JWT_SECRET); res.json({ user: decoded }); }
  catch(e) { res.status(401).json({ error: 'Token inválido' }); }
});

export { router as authRouter };
