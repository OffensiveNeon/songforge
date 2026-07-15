// Chat view: optional built-in AI co-writer (bring your own Anthropic API key).
import { load, save, activeProject } from './data.js';
import { el, toast } from './ui.js';
import { aiComplete, hasChatAI, providerLabel } from './ai.js';

function systemPrompt() {
  const s = load();
  const p = activeProject();
  const f = p.fields;
  return `You are a songwriting collaborator. Follow this playbook strictly — it is the user's proven process:

${s.playbookMd}

Current project: "${p.name}" (mode: ${p.mode}, currently in Phase ${p.phase}).
Project setup — source: ${f.game || 'n/a'}; angle: ${f.angle || 'n/a'}; POV: ${f.pov || 'n/a'}; sound: ${f.sound || 'n/a'}; arc: ${f.arc || 'n/a'}.
Approved lines so far (NEVER rewrite these):
${p.lines.filter(l => l.status === 'approved').map(l => `- "${l.text}"`).join('\n') || '(none yet)'}
Rejected lines and why (never reoffer anything similar):
${p.lines.filter(l => l.status === 'rejected').map(l => `- "${l.text}" (${l.reason})`).join('\n') || '(none yet)'}

Respect the phase: in Phase 1 brainstorm modular line OPTIONS only (never a full song); in Phase 2 respond to curation; in Phase 3-4 assemble ONLY from approved lines; in Phase 5 suggest titles from inside the lyrics.`;
}

async function sendMessage(p, text) {
  p.chat.push({ role: 'user', content: text });
  save();
  const reply = await aiComplete(systemPrompt(), p.chat.map(m => ({ role: m.role, content: m.content })));
  p.chat.push({ role: 'assistant', content: reply });
  save();
  return reply;
}

export function renderChat(view) {
  const s = load();
  const p = activeProject();
  view.replaceChildren();
  view.append(el('h2', {}, '💬 Co-writer — ', p.name));

  if (!hasChatAI()) {
    view.append(el('div', { class: 'card' },
      el('p', {}, 'Built-in chat is optional — connect an AI in ⚙️ Setup: an Anthropic, OpenRouter, or Gemini API key, or a local model (Ollama / LM Studio).'),
      el('p', { class: 'muted' }, 'No key? No problem: the ✍️ Write tab generates prompts you can paste into your regular ChatGPT/Claude chats instead.')));
    return;
  }
  view.append(el('p', { class: 'muted' }, `Talking to: ${providerLabel()}`));

  const log = el('div', { class: 'chat-log' });
  for (const m of p.chat) log.append(el('div', { class: `msg ${m.role}` }, m.content));
  view.append(log);

  const ta = el('textarea', { placeholder: 'Talk to your co-writer… it knows your playbook, project setup, and line bank.' });
  const btn = el('button', { class: 'btn' }, 'Send');
  btn.addEventListener('click', async () => {
    const text = ta.value.trim();
    if (!text) return;
    ta.value = '';
    btn.disabled = true;
    log.append(el('div', { class: 'msg user' }, text));
    const thinking = el('div', { class: 'msg assistant muted' }, '…thinking');
    log.append(thinking);
    thinking.scrollIntoView({ block: 'end' });
    try {
      const reply = await sendMessage(p, text);
      thinking.replaceWith(el('div', { class: 'msg assistant' }, reply));
    } catch (e) {
      thinking.replaceWith(el('div', { class: 'msg assistant status-err' }, e.message));
      p.chat.pop(); // drop the failed user turn so retry is clean
      save();
    }
    btn.disabled = false;
  });
  view.append(el('div', { class: 'chat-input' }, ta, btn));
  view.append(el('button', {
    class: 'btn small ghost', style: 'margin-top:10px', onclick: () => {
      if (confirm('Clear this project\'s chat history?')) { p.chat = []; save(); renderChat(view); }
    },
  }, 'Clear chat'));
  log.lastElementChild?.scrollIntoView({ block: 'end' });
}
