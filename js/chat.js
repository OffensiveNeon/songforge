// Chat view: built-in AI co-writer with streaming, one-tap phase actions,
// and "add lines to bank" pickers on every AI reply.
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

Current project: "${p.name}" (mode: ${p.mode}, currently in Phase ${p.phase}).
Project setup — source: ${f.game || 'n/a'}; angle: ${f.angle || 'n/a'}; POV: ${f.pov || 'n/a'}; sound: ${f.sound || 'n/a'}; arc: ${f.arc || 'n/a'}.
Approved lines so far (NEVER rewrite these):
${p.lines.filter(l => l.status === 'approved').map(l => `- "${l.text}"`).join('\n') || '(none yet)'}
Rejected lines and why (never reoffer anything similar):
${p.lines.filter(l => l.status === 'rejected').map(l => `- "${l.text}" (${l.reason})`).join('\n') || '(none yet)'}

Respect the phase: in Phase 1 brainstorm modular line OPTIONS only (never a full song); in Phase 2 respond to curation; in Phase 3-4 assemble ONLY from approved lines; in Phase 5 suggest titles from inside the lyrics.
Formatting: when offering lyric candidates, put each candidate line on its own row with no commentary between lines (commentary before/after blocks is fine).`;
}

// Inline picker to move an AI reply's lines into the line bank.
function bankPicker(p, content, rerender) {
  const rows = content.split('\n')
    .map(t => t.replace(/^[-*•>\d.)\s"“]+|["”]+$/g, '').trim())
    .filter(t => t);
  const boxes = [];
  const list = el('div', { style: 'max-height:260px;overflow-y:auto;margin:8px 0' });
  for (const text of rows) {
    // preselect plausible lyric lines: short, not headers/prose
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
        rerender();
      },
    }, '+ Add to bank'),
    el('button', { class: 'btn small ghost', onclick: (e) => e.target.closest('.card').remove() }, 'cancel'),
  );
}

export function renderChat(view) {
  const p = activeProject();
  view.replaceChildren();
  view.append(el('h2', {}, '💬 Co-writer — ', p.name));

  if (!hasChatAI()) {
    view.append(el('div', { class: 'card' },
      el('p', {}, 'Built-in chat is optional — connect an AI in ⚙️ Setup: an Anthropic, OpenRouter, or Gemini API key, or a local model (Ollama / LM Studio).'),
      el('p', { class: 'muted' }, 'No key? No problem: the ✍️ Write tab generates prompts you can paste into your regular ChatGPT/Claude chats instead.')));
    return;
  }
  view.append(el('p', { class: 'muted' }, `Talking to: ${providerLabel()} · knows your playbook, project setup, and line bank`));

  const rerender = () => renderChat(view);
  const log = el('div', { class: 'chat-log' });
  for (const m of p.chat) {
    const msg = el('div', { class: `msg ${m.role}` }, m.content);
    log.append(msg);
    if (m.role === 'assistant') {
      log.append(el('button', {
        class: 'btn small ghost', style: 'align-self:flex-start;margin-top:-6px',
        onclick: (e) => e.target.after(bankPicker(p, m.content, rerender)),
      }, '🧺 add lines to bank'));
    }
  }
  view.append(log);

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
        target.scrollIntoView({ block: 'end' });
      });
      p.chat.push({ role: 'assistant', content: reply });
      save();
      rerender();
      view.scrollTop = view.scrollHeight;
    } catch (e) {
      target.className = 'msg assistant status-err';
      target.textContent = e.message;
      p.chat.pop(); // drop the failed user turn so retry is clean
      save();
      busy = false; sendBtn.disabled = false;
    }
  }

  // One-tap phase actions — auto-send the wizard's prompt for each phase.
  const nApproved = p.lines.filter(l => l.status === 'approved').length;
  const actions = [];
  if (p.mode === 'album') actions.push(['📀 Album bible', () => albumBiblePrompt(p)]);
  actions.push(['▶ 1 · Brainstorm lines', () => phase1Prompt(p)]);
  if (p.lines.some(l => l.status !== 'candidate')) actions.push(['📝 2 · Send my curation', () => phase2Prompt(p)]);
  if (nApproved) actions.push(['🧩 3+4 · Compile & assemble', () => phase3Block(p) + '\n\n' + phase4Prompt(p)]);
  actions.push(['🏷 5 · Titles', () => PHASE5]);

  view.append(el('div', { class: 'chips' },
    ...actions.map(([label, build]) => el('span', { class: 'chip', onclick: () => send(build()) }, label))));

  sendBtn.addEventListener('click', () => { const t = ta.value; ta.value = ''; send(t); });
  ta.addEventListener('keydown', e => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { const t = ta.value; ta.value = ''; send(t); }
  });
  view.append(el('div', { class: 'chat-input' }, ta, sendBtn),
    el('p', { class: 'muted', style: 'margin-top:4px' }, 'Ctrl+Enter sends. The phase buttons auto-send the playbook prompt built from your Write tab fields and line bank.'));
  view.append(el('button', {
    class: 'btn small ghost', style: 'margin-top:10px', onclick: () => {
      if (confirm('Clear this project\'s chat history?')) { p.chat = []; save(); rerender(); }
    },
  }, 'Clear chat'));
  log.lastElementChild?.scrollIntoView({ block: 'end' });
}
