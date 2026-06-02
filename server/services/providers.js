const keys = {
  deepseek: process.env.DEEPSEEK_API_KEY,
  gemini: process.env.GEMINI_API_KEY,
  qwen: process.env.QWEN_API_KEY,
  openai: process.env.OPENAI_API_KEY,
};

export async function callAI(provider, messages, systemPrompt) {
  const sys = systemPrompt || 'Você é ARIA, assistente administrativa brasileira especialista.';
  switch(provider) {
    case 'deepseek': return callDeepSeek(messages, sys);
    case 'gemini': return callGemini(messages, sys);
    case 'qwen': return callQwen(messages, sys);
    case 'openai': return callOpenAI(messages, sys);
    default: throw new Error('Provedor desconhecido: ' + provider);
  }
}

async function callDeepSeek(messages, sys) {
  if (!keys.deepseek) throw new Error('DeepSeek não configurado no servidor');
  const r = await fetch('https://api.deepseek.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + keys.deepseek },
    body: JSON.stringify({ model: 'deepseek-chat', max_tokens: 2000, messages: [{ role: 'system', content: sys }, ...messages] })
  });
  const d = await r.json();
  if (!r.ok) throw new Error(d.error?.message || 'Erro DeepSeek');
  return d.choices?.[0]?.message?.content || '';
}

async function callGemini(messages, sys) {
  if (!keys.gemini) throw new Error('Gemini não configurado no servidor');
  const parts = messages.map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] }));
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${keys.gemini}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ systemInstruction: { parts: [{ text: sys }] }, contents: parts })
  });
  const d = await r.json();
  if (!r.ok) throw new Error(d.error?.message || 'Erro Gemini');
  return d.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

async function callQwen(messages, sys) {
  if (!keys.qwen) throw new Error('Qwen não configurado no servidor');
  const r = await fetch('https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + keys.qwen },
    body: JSON.stringify({ model: 'qwen-max', messages: [{ role: 'system', content: sys }, ...messages] })
  });
  const d = await r.json();
  if (d.error) throw new Error(d.error.message);
  return d.choices?.[0]?.message?.content || '';
}

async function callOpenAI(messages, sys) {
  if (!keys.openai) throw new Error('OpenAI não configurado');
  const r = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + keys.openai },
    body: JSON.stringify({ model: 'gpt-4o-mini', max_tokens: 2000, messages: [{ role: 'system', content: sys }, ...messages] })
  });
  const d = await r.json();
  if (!r.ok) throw new Error(d.error?.message || 'Erro OpenAI');
  return d.choices?.[0]?.message?.content || '';
}
