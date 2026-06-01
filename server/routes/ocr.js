import { Router } from 'express';
import multer from 'multer';
import OpenAI from 'openai';

const router = Router();
const upload = multer({ dest: process.env.UPLOAD_DIR || './uploads', limits: { fileSize: (parseInt(process.env.MAX_UPLOAD_MB) || 20) * 1024 * 1024 } });

router.post('/image', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Nenhuma imagem enviada' });
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const fs = await import('fs');
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: [{ type: 'text', text: 'Extraia TODO o texto desta imagem com máxima precisão. Mantenha a formatação. Retorne APENAS o texto extraído.' }, { type: 'image_url', image_url: { url: 'data:' + req.file.mimetype + ';base64,' + fs.readFileSync(req.file.path).toString('base64') } }] }],
      max_tokens: 4000
    });
    fs.unlinkSync(req.file.path);
    res.json({ success: true, text: response.choices[0].message.content });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.post('/pdf', upload.single('pdf'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Nenhum PDF enviado' });
    const pdfParse = (await import('pdf-parse')).default;
    const fs = await import('fs');
    const data = await pdfParse(fs.readFileSync(req.file.path));
    fs.unlinkSync(req.file.path);
    res.json({ success: true, text: data.text, pages: data.numpages, info: data.info });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.post('/audio', upload.single('audio'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Nenhum áudio enviado' });
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const fs = await import('fs');
    const transcription = await openai.audio.transcriptions.create({ file: fs.createReadStream(req.file.path), model: 'whisper-1', language: req.body.language || 'pt' });
    fs.unlinkSync(req.file.path);
    res.json({ success: true, text: transcription.text });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.post('/image-generate', async (req, res) => {
  try {
    const { prompt, size = '1024x1024' } = req.body;
    if (!prompt) return res.status(400).json({ error: 'Prompt vazio' });
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const image = await openai.images.generate({ model: 'dall-e-3', prompt: prompt.slice(0, 1000), n: 1, size });
    res.json({ success: true, url: image.data[0].url });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

export { router as ocrRouter };
