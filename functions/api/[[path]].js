import { sign, verify } from './helpers/jwt.js';
import { handleCORS, addCORS } from './helpers/cors.js';
import bcrypt from 'bcryptjs';

const users = new Map();
const db = new Map();

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { 'Content-Type': 'application/json' }
  });
}

function getToken(request) {
  return request.headers.get('Authorization')?.replace('Bearer ', '') || '';
}

function authUser(request, env) {
  const token = getToken(request);
  if (!token) return null;
  try {
    return verify(token, env.JWT_SECRET);
  } catch { return null; }
}

async function handleStream(request, env) {
  const { messages, system } = await request.json();
  const key = env.OPENAI_API_KEY;
  if (!key) return json({ error: 'OPENAI_API_KEY não configurada' }, 500);
  const r = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key },
    body: JSON.stringify({
      model: 'gpt-4o-mini', stream: true,
      messages: [{ role: 'system', content: system || 'Você é ARIA' }, ...messages]
    })
  });
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const encoder = new TextEncoder();
  (async () => {
    const reader = r.body.getReader();
    const decoder = new TextDecoder();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const lines = decoder.decode(value).split('\n').filter(l => l.startsWith('data: '));
        for (const line of lines) {
          const data = line.replace('data: ', '');
          if (data === '[DONE]') { writer.close(); return; }
          try {
            const json = JSON.parse(data);
            const content = json.choices?.[0]?.delta?.content;
            if (content) await writer.write(encoder.encode('data: ' + JSON.stringify({ chunk: content }) + '\n\n'));
          } catch {}
        }
      }
      await writer.close();
    } catch (e) {
      await writer.write(encoder.encode('data: ' + JSON.stringify({ error: e.message }) + '\n\n'));
      await writer.close();
    }
  })();
  return new Response(readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    }
  });
}

async function callAI(provider, messages, systemPrompt, env) {
  const sys = systemPrompt || 'Você é ARIA, assistente administrativa brasileira especialista.';
  let key, url, body;
  switch (provider) {
    case 'grok':
      key = env.GROK_API_KEY;
      if (!key) throw new Error('Grok não configurado');
      url = 'https://api.x.ai/v1/chat/completions';
      body = { model: 'grok-2-20241218', max_tokens: 2000, messages: [{ role: 'system', content: sys }, ...messages] };
      break;
    case 'gemini':
      key = env.GEMINI_API_KEY;
      if (!key) throw new Error('Gemini não configurado');
      return await callGemini(messages, sys, key);
    case 'qwen':
      key = env.QWEN_API_KEY;
      if (!key) throw new Error('Qwen não configurado');
      url = 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions';
      body = { model: 'qwen-max', messages: [{ role: 'system', content: sys }, ...messages] };
      break;
    case 'openai':
      key = env.OPENAI_API_KEY;
      if (!key) throw new Error('OpenAI não configurado');
      url = 'https://api.openai.com/v1/chat/completions';
      body = { model: 'gpt-4o-mini', max_tokens: 2000, messages: [{ role: 'system', content: sys }, ...messages] };
      break;
    default:
      throw new Error('Provedor desconhecido');
  }
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key },
    body: JSON.stringify(body)
  });
  const d = await r.json();
  if (!r.ok) throw new Error(d.error?.message || d.error?.status || 'Erro ' + provider);
  return d.choices?.[0]?.message?.content || '';
}

async function callGemini(messages, sys, key) {
  const parts = messages.map(m => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }]
  }));
  const r = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${key}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ systemInstruction: { parts: [{ text: sys }] }, contents: parts })
    }
  );
  const d = await r.json();
  if (!r.ok) throw new Error(d.error?.message || d.error?.status || 'Erro Gemini');
  return d.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const path = url.pathname;

  const cors = handleCORS(request);
  if (cors) return cors;

  try {
    let result;

    // Health
    if (path === '/health') {
      return addCORS(json({ status: 'ok', version: '4.0' }));
    }

    // POST /api/ai/chat
    if (path === '/api/ai/chat' && request.method === 'POST') {
      const { provider = 'gemini', messages, system } = await request.json();
      if (!messages?.length) return addCORS(json({ error: 'Mensagens vazias' }, 400));
      const text = await callAI(provider, messages, system, env);
      return addCORS(json({ success: true, text, provider }));
    }

    // POST /api/ai/stream
    if (path === '/api/ai/stream' && request.method === 'POST') {
      const stream = await handleStream(request, env);
      return addCORS(stream);
    }

    // POST /api/auth/register
    if (path === '/api/auth/register' && request.method === 'POST') {
      const { email, password, name } = await request.json();
      if (!email || !password) return addCORS(json({ error: 'Dados incompletos' }, 400));
      if (users.has(email)) return addCORS(json({ error: 'Usuário já existe' }, 409));
      const hashed = await bcrypt.hash(password, 10);
      users.set(email, { email, name, password: hashed, createdAt: new Date().toISOString() });
      const token = sign({ email, name }, env.JWT_SECRET);
      return addCORS(json({ success: true, token, user: { email, name } }));
    }

    // POST /api/auth/login
    if (path === '/api/auth/login' && request.method === 'POST') {
      const { email, password } = await request.json();
      const user = users.get(email);
      if (!user) return addCORS(json({ error: 'Usuário não encontrado' }, 404));
      const ok = await bcrypt.compare(password, user.password);
      if (!ok) return addCORS(json({ error: 'Senha incorreta' }, 401));
      const token = sign({ email, name: user.name }, env.JWT_SECRET);
      return addCORS(json({ success: true, token, user: { email, name: user.name } }));
    }

    // GET /api/auth/me
    if (path === '/api/auth/me' && request.method === 'GET') {
      const user = authUser(request, env);
      if (!user) return addCORS(json({ error: 'Token inválido' }, 401));
      return addCORS(json({ user }));
    }

    // POST /api/ocr/image
    if (path === '/api/ocr/image' && request.method === 'POST') {
      const formData = await request.formData();
      const file = formData.get('image');
      if (!file) return addCORS(json({ error: 'Nenhuma imagem enviada' }, 400));
      const key = env.OPENAI_API_KEY;
      if (!key) return addCORS(json({ error: 'OPENAI_API_KEY não configurada' }, 500));
      const buf = await file.arrayBuffer();
      const base64 = btoa(String.fromCharCode(...new Uint8Array(buf)));
      const r = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [{
            role: 'user',
            content: [
              { type: 'text', text: 'Extraia TODO o texto desta imagem com máxima precisão. Mantenha a formatação. Retorne APENAS o texto extraído.' },
              { type: 'image_url', image_url: { url: 'data:' + file.type + ';base64,' + base64 } }
            ]
          }],
          max_tokens: 4000
        })
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error?.message || 'Erro OCR');
      return addCORS(json({ success: true, text: d.choices?.[0]?.message?.content || '' }));
    }

    // POST /api/ocr/pdf
    if (path === '/api/ocr/pdf' && request.method === 'POST') {
      return addCORS(json({ error: 'OCR de PDF requer backend Node.js. Use o Image OCR (tire print) ou configure o Render para o backend.', fallback: true }, 400));
    }

    // POST /api/ocr/audio
    if (path === '/api/ocr/audio' && request.method === 'POST') {
      const formData = await request.formData();
      const file = formData.get('audio');
      if (!file) return addCORS(json({ error: 'Nenhum áudio enviado' }, 400));
      const key = env.OPENAI_API_KEY;
      if (!key) return addCORS(json({ error: 'OPENAI_API_KEY não configurada' }, 500));
      const audioBuf = await file.arrayBuffer();
      const whisperForm = new FormData();
      whisperForm.append('file', new File([audioBuf], file.name || 'audio.webm', { type: file.type }));
      whisperForm.append('model', 'whisper-1');
      whisperForm.append('language', 'pt');
      const r = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + key },
        body: whisperForm
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error?.message || 'Erro transcrição');
      return addCORS(json({ success: true, text: d.text }));
    }

    // POST /api/ocr/image-generate
    if (path === '/api/ocr/image-generate' && request.method === 'POST') {
      const { prompt, size = '1024x1024' } = await request.json();
      if (!prompt) return addCORS(json({ error: 'Prompt vazio' }, 400));
      const key = env.OPENAI_API_KEY;
      if (!key) return addCORS(json({ error: 'OPENAI_API_KEY não configurada' }, 500));
      const r = await fetch('https://api.openai.com/v1/images/generations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key },
        body: JSON.stringify({ model: 'dall-e-3', prompt: prompt.slice(0, 1000), n: 1, size })
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error?.message || 'Erro geração');
      return addCORS(json({ success: true, url: d.data?.[0]?.url }));
    }

    // GET /api/storage/all
    if (path === '/api/storage/all' && request.method === 'GET') {
      const user = authUser(request, env);
      if (!user) return addCORS(json({ error: 'Não autenticado' }, 401));
      const data = db.get(user.email) || { files: [], events: [], notes: [] };
      return addCORS(json({ success: true, data }));
    }

    // POST /api/storage/save
    if (path === '/api/storage/save' && request.method === 'POST') {
      const user = authUser(request, env);
      if (!user) return addCORS(json({ error: 'Não autenticado' }, 401));
      const { type, payload } = await request.json();
      const userData = db.get(user.email) || { files: [], events: [], notes: [] };
      const data = typeof payload === 'string' ? JSON.parse(payload) : payload;
      if (type === 'file') userData.files.unshift(data);
      if (type === 'event') userData.events.push(data);
      if (type === 'note') userData.notes.unshift(data);
      db.set(user.email, userData);
      return addCORS(json({ success: true }));
    }

    // DELETE /api/storage/all
    if (path === '/api/storage/all' && request.method === 'DELETE') {
      const user = authUser(request, env);
      if (!user) return addCORS(json({ error: 'Não autenticado' }, 401));
      db.delete(user.email);
      return addCORS(json({ success: true }));
    }

    return addCORS(json({ error: 'Rota não encontrada: ' + request.method + ' ' + path }, 404));
  } catch (e) {
    return addCORS(json({ error: e.message }, 500));
  }
}
