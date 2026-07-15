// Unified AI access: Anthropic, OpenRouter, Google Gemini, or a local
// OpenAI-compatible server (Ollama / LM Studio). Keys live only in localStorage.
import { load } from './data.js';

export function hasChatAI() {
  const s = load().settings;
  const prov = s.provider || 'anthropic';
  if (prov === 'anthropic') return !!s.apiKey;
  if (prov === 'openrouter') return !!s.openrouterKey;
  if (prov === 'gemini') return !!s.geminiKey;
  if (prov === 'local') return !!s.localUrl;
  return false;
}

export function hasImageAI() {
  const s = load().settings;
  return !!(s.geminiKey || s.openrouterKey);
}

export function providerLabel() {
  const s = load().settings;
  return { anthropic: 'Claude', openrouter: 'OpenRouter', gemini: 'Gemini', local: 'local model' }[s.provider || 'anthropic'];
}

async function openaiStyleChat(url, key, model, system, messages, extraHeaders = {}) {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(key ? { authorization: `Bearer ${key}` } : {}),
      ...extraHeaders,
    },
    body: JSON.stringify({
      model,
      max_tokens: 4000,
      messages: [...(system ? [{ role: 'system', content: system }] : []), ...messages],
    }),
  });
  if (!res.ok) throw new Error(`API ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? '';
}

export async function aiComplete(system, messages) {
  const s = load().settings;
  const prov = s.provider || 'anthropic';

  if (prov === 'anthropic') {
    if (!s.apiKey) throw new Error('No Anthropic API key — add one in ⚙️ Setup, or switch provider.');
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': s.apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({ model: s.model || 'claude-sonnet-5', max_tokens: 4000, system, messages }),
    });
    if (!res.ok) throw new Error(`API ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const data = await res.json();
    return data.content.filter(b => b.type === 'text').map(b => b.text).join('\n');
  }

  if (prov === 'openrouter') {
    if (!s.openrouterKey) throw new Error('No OpenRouter key — add one in ⚙️ Setup.');
    return openaiStyleChat('https://openrouter.ai/api/v1/chat/completions', s.openrouterKey,
      s.openrouterModel || 'anthropic/claude-sonnet-4.5', system, messages,
      { 'x-title': 'SongForge' });
  }

  if (prov === 'gemini') {
    if (!s.geminiKey) throw new Error('No Gemini key — add one in ⚙️ Setup (free at aistudio.google.com).');
    const model = s.geminiModel || 'gemini-2.5-flash';
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(s.geminiKey)}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ...(system ? { system_instruction: { parts: [{ text: system }] } } : {}),
        contents: messages.map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })),
      }),
    });
    if (!res.ok) throw new Error(`API ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const data = await res.json();
    return (data.candidates?.[0]?.content?.parts || []).map(p => p.text || '').join('');
  }

  if (prov === 'local') {
    if (!s.localUrl) throw new Error('No local server URL — add one in ⚙️ Setup (e.g. http://localhost:11434/v1 for Ollama).');
    const base = s.localUrl.replace(/\/+$/, '');
    return openaiStyleChat(`${base}/chat/completions`, s.localKey || '', s.localModel || '', system, messages);
  }

  throw new Error('Unknown AI provider');
}

async function readSSE(res, extract) {
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '', out = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop();
    for (const line of lines) {
      const m = line.match(/^data:\s*(.*)$/);
      if (!m || m[1] === '[DONE]') continue;
      try { out += extract(JSON.parse(m[1])) || ''; } catch { /* keep-alive lines etc. */ }
    }
  }
  return out;
}

// Streaming variant of aiComplete: calls onDelta(textChunk) as tokens arrive,
// resolves with the full reply. Falls back to non-streaming if unsupported.
export async function aiStream(system, messages, onDelta) {
  const s = load().settings;
  const prov = s.provider || 'anthropic';
  const emit = t => { if (t) onDelta(t); return t; };
  try {
    if (prov === 'anthropic') {
      if (!s.apiKey) throw new Error('No Anthropic API key — add one in ⚙️ Setup, or switch provider.');
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': s.apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({ model: s.model || 'claude-sonnet-5', max_tokens: 4000, system, messages, stream: true }),
      });
      if (!res.ok) throw new Error(`API ${res.status}: ${(await res.text()).slice(0, 300)}`);
      return await readSSE(res, d =>
        d.type === 'content_block_delta' && d.delta?.text ? emit(d.delta.text) : '');
    }
    if (prov === 'openrouter' || prov === 'local') {
      const url = prov === 'openrouter'
        ? 'https://openrouter.ai/api/v1/chat/completions'
        : s.localUrl.replace(/\/+$/, '') + '/chat/completions';
      const key = prov === 'openrouter' ? s.openrouterKey : (s.localKey || '');
      if (prov === 'openrouter' && !key) throw new Error('No OpenRouter key — add one in ⚙️ Setup.');
      if (prov === 'local' && !s.localUrl) throw new Error('No local server URL — add one in ⚙️ Setup.');
      const model = prov === 'openrouter' ? (s.openrouterModel || 'anthropic/claude-sonnet-4.5') : (s.localModel || '');
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(key ? { authorization: `Bearer ${key}` } : {}),
          ...(prov === 'openrouter' ? { 'x-title': 'SongForge' } : {}),
        },
        body: JSON.stringify({
          model, max_tokens: 4000, stream: true,
          messages: [...(system ? [{ role: 'system', content: system }] : []), ...messages],
        }),
      });
      if (!res.ok) throw new Error(`API ${res.status}: ${(await res.text()).slice(0, 300)}`);
      return await readSSE(res, d => emit(d.choices?.[0]?.delta?.content || ''));
    }
    if (prov === 'gemini') {
      if (!s.geminiKey) throw new Error('No Gemini key — add one in ⚙️ Setup (free at aistudio.google.com).');
      const model = s.geminiModel || 'gemini-2.5-flash';
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${encodeURIComponent(s.geminiKey)}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          ...(system ? { system_instruction: { parts: [{ text: system }] } } : {}),
          contents: messages.map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })),
        }),
      });
      if (!res.ok) throw new Error(`API ${res.status}: ${(await res.text()).slice(0, 300)}`);
      return await readSSE(res, d =>
        emit((d.candidates?.[0]?.content?.parts || []).map(p => p.text || '').join('')));
    }
    throw new Error('Unknown AI provider');
  } catch (e) {
    // Streams need res.body support; if that's the failure, retry without streaming.
    if (/body|stream|getReader/i.test(e.message)) {
      const text = await aiComplete(system, messages);
      onDelta(text);
      return text;
    }
    throw e;
  }
}

// Cover-art generation. Prefers Gemini (free tier), falls back to OpenRouter.
export async function aiImage(prompt) {
  const s = load().settings;
  if (s.geminiKey) {
    const model = s.geminiImageModel || 'gemini-2.5-flash-image';
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(s.geminiKey)}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }] }),
    });
    if (!res.ok) throw new Error(`API ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const data = await res.json();
    for (const part of data.candidates?.[0]?.content?.parts || []) {
      const inline = part.inlineData || part.inline_data;
      if (inline?.data) return `data:${inline.mimeType || inline.mime_type || 'image/png'};base64,${inline.data}`;
    }
    throw new Error('The model returned no image — try rewording the prompt.');
  }
  if (s.openrouterKey) {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${s.openrouterKey}`, 'x-title': 'SongForge' },
      body: JSON.stringify({
        model: s.openrouterImageModel || 'google/gemini-2.5-flash-image',
        messages: [{ role: 'user', content: prompt }],
        modalities: ['image', 'text'],
      }),
    });
    if (!res.ok) throw new Error(`API ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const data = await res.json();
    const img = data.choices?.[0]?.message?.images?.[0]?.image_url?.url;
    if (img) return img;
    throw new Error('The model returned no image — try an image-capable model.');
  }
  throw new Error('Image generation needs a Gemini key (free at aistudio.google.com) or an OpenRouter key — add one in ⚙️ Setup.');
}
