// Lines view: the line bank — paste candidates, approve/reject with reasons.
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
  let pickerOpen = null;

  const setStatus = (status, reasons, cls) => {
    if (pickerOpen) { pickerOpen.remove(); pickerOpen = null; }
    line.status = status;
    line.reason = '';
    pickerOpen = reasonPicker(line, reasons, cls, () => { save(); rerender(); });
    item.append(pickerOpen);
    save(); rerender();
  };

  actions.append(
    el('button', { class: 'btn small', style: 'background:var(--good);color:#0a2412', onclick: () => setStatus('approved', APPROVE_REASONS, 'good') }, '✓ keep'),
    el('button', { class: 'btn small', style: 'background:var(--bad);color:#2d0808', onclick: () => setStatus('rejected', REJECT_REASONS, 'bad') }, '✗ cut'),
    el('button', { class: 'btn small ghost', onclick: () => { line.status = 'candidate'; line.reason = ''; save(); rerender(); } }, 'reset'),
    el('button', { class: 'btn small ghost', onclick: () => { p.lines = p.lines.filter(l => l.id !== line.id); save(); rerender(); } }, '🗑'),
  );
  // Inline reason picker when a status was chosen but no reason given yet
  if (line.status !== 'candidate' && !line.reason) {
    item.append(el('div', { class: 'line-meta' }, 'why? (the why steers the next batch)'),
      reasonPicker(line, line.status === 'approved' ? APPROVE_REASONS : REJECT_REASONS,
        line.status === 'approved' ? 'good' : 'bad', () => { save(); rerender(); }));
  }
  item.append(actions);
  return item;
}

export function renderLines(view) {
  const p = activeProject();
  const rerender = () => renderLines(view);
  view.replaceChildren();
  view.append(el('h2', {}, '🧺 Line bank — ', p.name));

  // Paste box
  const section = el('input', { type: 'text', placeholder: 'section / emotional stage (optional, e.g. "denial", "chorus candidates")' });
  const paste = el('textarea', { placeholder: 'Paste the AI\'s line options here — one line per row. Bullets and numbering are stripped automatically.' });
  view.append(el('div', { class: 'card' },
    el('h3', {}, 'Add candidates'),
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
    view.append(card);
  }
  if (!p.lines.length) {
    view.append(el('p', { class: 'muted' }, 'Nothing in the bank yet. Run Phase 1 in the Write tab, then paste the AI\'s line options above.'));
  }
}
