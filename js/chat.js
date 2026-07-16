// Chat dock: streaming AI co-writer, embeddable in Studio's right pane.
// Studio's phase buttons push prompts in via sendToChat().
import { load, save, activeProject, addLines } from './data.js';
import { el, toast } from './ui.js';
import { aiStream, hasChatAI, providerLabel } from './ai.js';
import { phase1Prompt, albumBiblePrompt, phase2Prompt, phase3Block, phase4Prompt, PHASE5 } from './wizard.js';

function systemPrompt() {
  const s = load();
  const p = activeProject();
  const f = p.fields;
  return `You are a songwriting collaborator. Follow this playbook strictly — it is the user's proven process:

${s.playbookMd}

Current project: "${p.name}" (mode: ${p.mode}).
Project setup — source: ${f.game || 'n/a'}; angle: ${f.angle || 'n/a'}; POV: ${f.pov || 'n/a'}; sound: ${f.sound || 'n/a'}; arc: ${f.arc || 'n/a'}.
Approved lines so far (NEVER rewrite these):
${p.lines.filter(l => l.status === 'approved').map(l => `- "${l.text}"`).join('\n') || '(none yet)'}
Rejected lines and why (never reoffer anything similar):
${p.lines.filter(l => l.status === 'rejected').map(l => `- "${l.text}" (${l.reason})`).join('\n') || '(none yet)'}

Respect the process: brainstorm modular line OPTIONS (never a full song) until the user asks for assembly; assemble ONLY from approved lines; titles come from inside the lyrics.
Formatting: when offering lyric candidates, put each candidate line on its own row with no commentary between lines (commentary before/after blocks is fine).`;
}

let currentSend = null;

// Push a prompt into the docked chat (used by Studio's ▶ buttons).
export function sendToChat(text) {
  if (currentSend) currentSend(text);
  else toast('Connect an AI in ⚙️ Setup to chat in-app');
}

export function chatAvailable() { return hasChatAI(); }

// Inline picker to move an AI reply's lines into the line bank.
function bankPicker(p, content, onBanked) {
  const rows = content.split('\n')
    .map(t => t.replace(/^[-*•>\d.)\s"“]+|["”]+$/g, '').trim())
    .filter(t => t);
  const boxes = [];
  const list = el('div', { style: 'max-height:260px;overflow-y:auto;margin:8px 0' });
  for (const text of rows) {
    const likely = text.length <= 90 && !/[:：]$/.test(text) && !/^\[|^#|^(APPROVED|REJECTED|Verse|Chorus|Bridge)\b/i.test(text);
    const cb = el('input', { type: 'checkbox' });
    cb.checked = likely;
    boxes.push([cb, text]);
    list.append(el('label', { style: 'display:flex;gap:8px;align-items:flex-start;font-size:14px;color:var(--fg);margin:3px 0' }, cb, text));
  }
  const section = el('input', { type: 'text', placeholder: 'section / emotional stage (optional)' });
  return el('div', { class: 'card' },
    el('p', { class: 'muted' }, 'Tick the lines to add as candidates:'),
    list, section,
    el('button', {
      class: 'btn small', onclick: (e) => {
        const chosen = boxes.filter(([cb]) => cb.checked).map(([, t]) => t);
        if (!chosen.length) return toast('Nothing ticked');
        addLines(p, chosen, section.value.trim());
        toast(`🧺 ${chosen.length} lines added to bank`);
        e.target.closest('.card').remove();
        onBanked();
      },
    }, '+ Add to bank'),
    el('button', { class: 'btn small ghost', onclick: (e) => e.target.closest('.card').remove() }, 'cancel'),
  );
}

// opts.onBankChange fires when lines are added to the bank from a chat reply.
export function renderChatInto(host, opts = {}) {
  const p = activeProject();
  host.replaceChildren();
  host.classList.add('chat-pane');

  if (!hasChatAI()) {
    currentSend = null;
    host.append(el('div', { class: 'card' },
      el('p', {}, '💬 Chat is optional — connect an AI in ⚙️ Setup: an Anthropic, OpenRouter, or Gemini API key, or a local model (Ollama / LM Studio).'),
      el('p', { class: 'muted' }, 'Without one, use the 📋 copy-prompt buttons and paste into your regular ChatGPT/Claude chats.')));
    return;
  }

  const rerender = () => renderChatInto(host, opts);
  const header = el('div', { class: 'chat-head' },
    el('span', { class: 'muted' }, `💬 ${providerLabel()} · knows your playbook & line bank`),
    el('button', {
      class: 'btn small ghost', onclick: () => {
        if (confirm('Clear this project\'s chat history?')) { p.chat = []; save(); rerender(); }
      },
    }, 'clear'));

  const log = el('div', { class: 'chat-log' });
  for (const m of p.chat) {
    log.append(el('div', { class: `msg ${m.role}` }, m.content));
    if (m.role === 'assistant') {
      log.append(el('button', {
        class: 'btn small ghost', style: 'align-self:flex-start;margin-top:-6px',
        onclick: (e) => e.target.after(bankPicker(p, m.content, () => { opts.onBankChange?.(); })),
      }, '🧺 add lines to bank'));
    }
  }

  const ta = el('textarea', { placeholder: 'Talk to your co-writer…' });
  const sendBtn = el('button', { class: 'btn' }, 'Send');
  let busy = false;

  async function send(text) {
    if (busy || !text.trim()) return;
    busy = true; sendBtn.disabled = true;
    log.append(el('div', { class: 'msg user' }, text));
    p.chat.push({ role: 'user', content: text });
    save();
    const target = el('div', { class: 'msg assistant' }, '…');
    log.append(target);
    target.scrollIntoView({ block: 'end' });
    let first = true;
    try {
      const reply = await aiStream(systemPrompt(), p.chat.map(m => ({ role: m.role, content: m.content })), delta => {
        if (first) { target.textContent = ''; first = false; }
        target.textContent += delta;
        log.scrollTop = log.scrollHeight;
      });
      p.chat.push({ role: 'assistant', content: reply });
      save();
      rerender();
      const newLog = host.querySelector('.chat-log');
      if (newLog) newLog.scrollTop = newLog.scrollHeight;
    } catch (e) {
      target.className = 'msg assistant status-err';
      target.textContent = e.message;
      p.chat.pop(); // drop the failed user turn so retry is clean
      save();
      busy = false; sendBtn.disabled = false;
    }
  }
  currentSend = send;

  // Quick actions mirror Studio's ▶ buttons for when chat is used standalone (mobile).
  const nApproved = p.lines.filter(l => l.status === 'approved').length;
  const actions = [];
  if (p.mode === 'album') actions.push(['📀 Album bible', () => albumBiblePrompt(p)]);
  actions.push(['▶ Brainstorm lines', () => phase1Prompt(p)]);
  if (p.lines.some(l => l.status !== 'candidate')) actions.push(['📝 Send my curation', () => phase2Prompt(p)]);
  if (nApproved) actions.push(['🧩 Compile & assemble', () => phase3Block(p) + '\n\n' + phase4Prompt(p)]);
  actions.push(['🏷 Titles', () => PHASE5]);
  const chips = el('div', { class: 'chips' },
    ...actions.map(([label, build]) => el('span', { class: 'chip', onclick: () => send(build()) }, label)));

  sendBtn.addEventListener('click', () => { const t = ta.value; ta.value = ''; send(t); });
  ta.addEventListener('keydown', e => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { const t = ta.value; ta.value = ''; send(t); }
  });

  host.append(header, log, chips, el('div', { class: 'chat-input' }, ta, sendBtn));
  log.scrollTop = log.scrollHeight;
}
