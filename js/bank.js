// Line bank component: paste candidates, approve/reject with reasons.
// Rendered into a host element so Studio can embed it and react to changes.
import { activeProject, save, addLines, APPROVE_REASONS, REJECT_REASONS } from './data.js';
import { el, toast } from './ui.js';

function reasonPicker(line, reasons, cls, onDone) {
  const wrap = el('div', { class: 'chips' });
  for (const r of reasons) {
    wrap.append(el('span', {
      class: `chip ${cls}`,
      onclick: () => { line.reason = r; onDone(); },
    }, r));
  }
  const custom = el('input', { type: 'text', placeholder: 'custom reason…', style: 'max-width:180px;font-size:12.5px;padding:4px 8px' });
  custom.addEventListener('keydown', e => {
    if (e.key === 'Enter' && custom.value.trim()) { line.reason = custom.value.trim(); onDone(); }
  });
  wrap.append(custom);
  return wrap;
}

function lineItem(p, line, rerender) {
  const item = el('div', { class: `line-item ${line.status}` });
  item.append(el('div', { class: 'line-text' }, line.text));
  const meta = [];
  if (line.section) meta.push(line.section);
  if (line.reason) meta.push((line.status === 'rejected' ? 'fails: ' : 'works: ') + line.reason);
  if (meta.length) item.append(el('div', { class: 'line-meta' }, meta.join(' · ')));

  const actions = el('div', { class: 'line-actions' });
  const setStatus = (status) => {
    line.status = status;
    line.reason = '';
    save(); rerender();
  };
  actions.append(
    el('button', { class: 'btn small', style: 'background:var(--good);color:#0a2412', onclick: () => setStatus('approved') }, '✓ keep'),
    el('button', { class: 'btn small', style: 'background:var(--bad);color:#2d0808', onclick: () => setStatus('rejected') }, '✗ cut'),
    el('button', { class: 'btn small ghost', onclick: () => setStatus('candidate') }, 'reset'),
    el('button', { class: 'btn small ghost', onclick: () => { p.lines = p.lines.filter(l => l.id !== line.id); save(); rerender(); } }, '🗑'),
  );
  if (line.status !== 'candidate' && !line.reason) {
    item.append(el('div', { class: 'line-meta' }, 'why? (the why steers the next batch)'),
      reasonPicker(line, line.status === 'approved' ? APPROVE_REASONS : REJECT_REASONS,
        line.status === 'approved' ? 'good' : 'bad', () => { save(); rerender(); }));
  }
  item.append(actions);
  return item;
}

// opts.onChange fires after any mutation (used by Studio to refresh phase actions).
export function renderBankInto(host, opts = {}) {
  const p = activeProject();
  const rerender = () => { renderBankInto(host, opts); opts.onChange?.(); };
  host.replaceChildren();

  const section = el('input', { type: 'text', placeholder: 'section / emotional stage (optional, e.g. "denial", "chorus candidates")' });
  const paste = el('textarea', { placeholder: 'Paste line options here — one per row. Bullets and numbering are stripped automatically.' });
  host.append(el('div', { class: 'card' },
    el('label', {}, 'Section'), section,
    el('label', {}, 'Lines'), paste,
    el('button', {
      class: 'btn', onclick: () => {
        const texts = paste.value.split('\n').filter(t => t.trim());
        if (!texts.length) return;
        addLines(p, texts, section.value.trim());
        paste.value = '';
        toast(`Added ${texts.length} lines`);
        rerender();
      },
    }, '+ Add to bank'),
  ));

  const groups = [
    ['candidate', '🟡 Undecided'],
    ['approved', '🟢 Approved'],
    ['rejected', '🔴 Rejected'],
  ];
  for (const [status, title] of groups) {
    const lines = p.lines.filter(l => l.status === status);
    if (!lines.length) continue;
    const card = el('div', { class: 'card' }, el('h3', {}, `${title} (${lines.length})`));
    for (const line of lines) card.append(lineItem(p, line, rerender));
    host.append(card);
  }
  if (!p.lines.length) {
    host.append(el('p', { class: 'muted' }, 'Nothing banked yet — brainstorm in the chat (▶ button above), then paste or tick lines in.'));
  }
}
