// Studio: the one-screen workspace. Song sections on the left, chat docked right.
// Mobile (<1000px) collapses into Song | Lines | Chat sub-tabs.
import { activeProject } from './data.js';
import { el, copyText } from './ui.js';
import { setupSection, sunoSection, phase1Prompt, albumBiblePrompt, phase2Prompt, phase3Block, phase4Prompt, PHASE5 } from './wizard.js';
import { renderBankInto } from './bank.js';
import { renderChatInto, sendToChat, chatAvailable } from './chat.js';

const openState = {}; // section open/closed, remembered for the session
let subTab = 'song';

function section(key, cls, title, defaultOpen) {
  const det = el('details', { class: `section ${cls}` });
  det.open = openState[key] ?? defaultOpen;
  det.addEventListener('toggle', () => { openState[key] = det.open; });
  det.append(el('summary', {}, title));
  return det;
}

// A ▶ send-to-chat / 📋 copy pair for one playbook prompt.
function promptActions(label, build) {
  const wrap = el('span', { style: 'display:inline-flex;gap:4px;margin:0 10px 6px 0' });
  if (chatAvailable()) {
    wrap.append(el('button', { class: 'btn small', onclick: () => sendToChat(build()) }, `▶ ${label}`));
    wrap.append(el('button', { class: 'btn small ghost', title: 'copy prompt instead', onclick: () => copyText(build()) }, '📋'));
  } else {
    wrap.append(el('button', { class: 'btn small ghost', onclick: () => copyText(build()) }, `📋 ${label}`));
  }
  return wrap;
}

export function renderStudio(view) {
  const p = activeProject();
  view.replaceChildren();
  const root = el('div', { class: 'studio' });
  root.dataset.sub = subTab;

  // --- mobile sub-tabs ---
  const subtabs = el('div', { class: 'studio-subtabs phase-steps' });
  for (const [key, label] of [['song', '✍️ Song'], ['lines', '🧺 Lines'], ['chat', '💬 Chat']]) {
    subtabs.append(el('button', {
      class: subTab === key ? 'active' : '',
      onclick: () => { subTab = key; renderStudio(view); },
    }, label));
  }

  const left = el('div', { class: 'studio-left' });

  // --- Song setup ---
  const setupDet = section('setup', 'sec-setup', '🎬 Song setup', !p.fields.game);
  const setupBody = el('div', { class: 'section-body' });
  const setupActions = el('div');
  const refreshSetupActions = () => {
    setupActions.replaceChildren();
    if (p.mode === 'album') setupActions.append(promptActions('Album bible first', () => albumBiblePrompt(p)));
    setupActions.append(promptActions('Brainstorm lines', () => phase1Prompt(p)));
  };
  setupBody.append(setupSection(p, refreshSetupActions), el('hr', { style: 'border:none;border-top:1px solid var(--line);margin:12px 0' }), setupActions);
  refreshSetupActions();
  setupDet.append(setupBody);

  // --- Brainstorm & curate ---
  const bankDet = section('bank', 'sec-bank', '🧺 Brainstorm & curate', true);
  const bankBody = el('div', { class: 'section-body' });
  const bankActions = el('div');
  const bankHost = el('div');
  const refreshBankActions = () => {
    bankActions.replaceChildren();
    const curated = p.lines.some(l => l.status !== 'candidate');
    const approved = p.lines.filter(l => l.status === 'approved').length;
    if (curated) bankActions.append(promptActions('Send my curation', () => phase2Prompt(p)));
    if (approved) bankActions.append(promptActions('Compile & assemble', () => phase3Block(p) + '\n\n' + phase4Prompt(p)));
    if (approved) bankActions.append(promptActions('Titles', () => PHASE5));
    if (!p.lines.length) bankActions.append(el('p', { class: 'muted' }, 'Curation buttons appear here once lines are banked and judged.'));
  };
  const refreshBank = () => {
    renderBankInto(bankHost, { onChange: refreshBankActions });
    refreshBankActions();
  };
  refreshBank();
  bankBody.append(bankActions, bankHost);
  bankDet.append(bankBody);

  // --- Send to Suno ---
  const sunoDet = section('suno', 'sec-suno', '🚀 Send to Suno', true);
  const sunoBody = el('div', { class: 'section-body' });
  sunoBody.append(sunoSection(p));
  sunoDet.append(sunoBody);

  left.append(setupDet, bankDet, sunoDet);

  // --- chat dock ---
  const chatDock = el('div', { class: 'chat-dock card' });
  renderChatInto(chatDock, { onBankChange: refreshBank });

  root.append(subtabs, left, chatDock);
  view.append(root);
}
