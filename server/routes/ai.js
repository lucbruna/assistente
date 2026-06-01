import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { apiLimiter } from '../middleware/rateLimit.js';
import { callAI } from '../services/providers.js';

const router = Router();
router.use(authMiddleware);
router.use(apiLimiter);

router.post('/chat', async (req, res) => {
  try {
    const { provider = 'gemini', messages, system } = req.body;
    if (!messages?.length) return res.status(400).json({ error: 'Mensagens vazias' });
    const text = await callAI(provider, messages, system);
    res.json({ success: true, text, provider });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/stream', async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  try {
    const { messages, system } = req.body;
    const key = process.env.OPENAI_API_KEY;
    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key },
      body: JSON.stringify({ model: 'gpt-4o-mini', stream: true, messages: [{ role: 'system', content: system || 'Você é ARIA' }, ...messages] })
    });
    const reader = r.body.getReader();
    const decoder = new TextDecoder();
    while(true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value);
      const lines = chunk.split('\n').filter(l => l.startsWith('data: '));
      for (const line of lines) {
        const data = line.replace('data: ', '');
        if (data === '[DONE]') { res.end(); return; }
        try { const json = JSON.parse(data); const content = json.choices?.[0]?.delta?.content; if (content) res.write('data: ' + JSON.stringify({ chunk: content }) + '\n\n'); } catch(e) {}
      }
    }
    res.end();
  } catch(e) {
    res.write('data: ' + JSON.stringify({ error: e.message }) + '\n\n');
    res.end();
  }
});

export { router as aiRouter };
