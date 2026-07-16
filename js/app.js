// SongForge shell: routing, project switcher, playbook + settings views.
import { load, save, activeProject, setActiveProject, newProject, deleteProject, exportAll, importAll, DEFAULT_PLAYBOOK_MD } from './data.js';
import { el, toast, renderMd } from './ui.js';
import { renderStudio } from './studio.js';
import { renderTagger } from './tagger.js';
import { renderStyles } from './styles.js';

const view = document.getElementById('view');
let current = 'studio';

function renderProjectSwitcher() {
  const host = document.getElementById('project-switch');
  const s = load();
  host.replaceChildren();
  if (current !== 'studio') return;
  const sel = el('select', {});
  for (const p of s.projects) {
    const o = el('option', { value: p.id }, p.name);
    if (p.id === s.activeProject) o.selected = true;
    sel.append(o);
  }
  sel.append(el('option', { value: '__new__' }, '＋ New song…'));
  sel.addEventListener('change', () => {
    if (sel.value === '__new__') {
      const name = prompt('Song / project name:');
      if (name) newProject(name);
    } else setActiveProject(sel.value);
    render();
  });
  host.append(sel);
}

function renderPlaybook(v) {
  const s = load();
  v.replaceChildren();
  v.append(el('h2', {}, '📖 Playbook'));
  const md = el('div', { class: 'card pb-md', html: renderMd(s.playbookMd) });
  v.append(md);
  const ta = el('textarea', { style: 'min-height:300px' });
  ta.value = s.playbookMd;
  const editCard = el('div', { class: 'card', style: 'display:none' },
    el('h3', {}, 'Edit playbook (markdown)'),
    el('p', { class: 'muted' }, 'This is YOUR process doc — the wizard prompts and the AI co-writer both follow it. Your sister can rewrite it for her own style on her device.'),
    ta,
    el('button', { class: 'btn', onclick: () => { s.playbookMd = ta.value; save(); render(); toast('Playbook saved'); } }, 'Save'),
    el('button', { class: 'btn ghost', onclick: () => { if (confirm('Reset to the built-in playbook?')) { s.playbookMd = DEFAULT_PLAYBOOK_MD; save(); render(); } } }, 'Reset to default'),
  );
  v.append(el('button', {
    class: 'btn ghost', onclick: () => {
      editCard.style.display = editCard.style.display === 'none' ? '' : 'none';
    },
  }, '✏️ Edit playbook'), editCard);
}

function renderSettings(v) {
  const s = load();
  v.replaceChildren();
  v.append(el('h2', {}, '⚙️ Setup'));

  const artist = el('input', { type: 'text', placeholder: 'shown as Artist on tagged MP3s (default: your Suno display name)' });
  artist.value = s.settings.artist;
  artist.addEventListener('input', () => { s.settings.artist = artist.value; save(); });

  const bindText = (key, attrs) => {
    const input = el('input', { type: 'text', ...attrs });
    input.value = s.settings[key] || '';
    input.addEventListener('input', () => { s.settings[key] = input.value.trim(); save(); });
    return input;
  };
  const bindPass = (key, ph) => {
    const input = el('input', { type: 'password', placeholder: ph });
    input.value = s.settings[key] || '';
    input.addEventListener('input', () => { s.settings[key] = input.value.trim(); save(); });
    return input;
  };

  const provider = el('select', {});
  for (const [id, label] of [
    ['anthropic', 'Anthropic (Claude)'],
    ['openrouter', 'OpenRouter (any model, has free ones)'],
    ['gemini', 'Google Gemini (free API tier)'],
    ['local', 'Local model (Ollama / LM Studio)'],
  ]) {
    const o = el('option', { value: id }, label);
    if ((s.settings.provider || 'anthropic') === id) o.selected = true;
    provider.append(o);
  }
  provider.addEventListener('change', () => { s.settings.provider = provider.value; save(); render(); });

  const anthropicModel = el('select', {});
  for (const [id, label] of [
    ['claude-sonnet-5', 'Claude Sonnet 5 (recommended)'],
    ['claude-opus-4-8', 'Claude Opus 4.8 (strongest)'],
    ['claude-haiku-4-5-20251001', 'Claude Haiku 4.5 (cheapest)'],
  ]) {
    const o = el('option', { value: id }, label);
    if (s.settings.model === id) o.selected = true;
    anthropicModel.append(o);
  }
  anthropicModel.addEventListener('change', () => { s.settings.model = anthropicModel.value; save(); });

  const aiCard = el('div', { class: 'card' },
    el('h3', {}, 'AI co-writer (optional)'),
    el('p', { class: 'muted' }, 'The Write tab works with any AI chat for free. Connect an AI here to also chat, extract styles, and generate covers inside the app. Keys are stored only on this device. Note: a ChatGPT/Claude/Gemini chat subscription is NOT an API key — API keys come from each provider\'s developer console.'),
    el('label', {}, 'Chat provider'), provider,
  );
  const prov = s.settings.provider || 'anthropic';
  if (prov === 'anthropic') {
    aiCard.append(el('label', {}, 'Anthropic API key (console.anthropic.com)'), bindPass('apiKey', 'sk-ant-…'),
      el('label', {}, 'Model'), anthropicModel);
  }
  if (prov === 'openrouter') {
    aiCard.append(el('label', {}, 'OpenRouter API key (openrouter.ai/keys)'), bindPass('openrouterKey', 'sk-or-…'),
      el('label', {}, 'Model id'), bindText('openrouterModel', { placeholder: 'e.g. anthropic/claude-sonnet-4.5, or a :free model' }));
  }
  if (prov === 'gemini') {
    aiCard.append(el('label', {}, 'Gemini API key (aistudio.google.com — free)'), bindPass('geminiKey', 'AIza…'),
      el('label', {}, 'Model'), bindText('geminiModel', { placeholder: 'gemini-2.5-flash' }));
  }
  if (prov === 'local') {
    aiCard.append(
      el('label', {}, 'Server URL (OpenAI-compatible)'), bindText('localUrl', { placeholder: 'http://localhost:11434/v1  (Ollama)' }),
      el('label', {}, 'Model name'), bindText('localModel', { placeholder: 'e.g. llama3.2, qwen2.5' }),
      el('label', {}, 'API key (usually empty for local)'), bindPass('localKey', ''),
      el('p', { class: 'muted' }, 'Ollama needs CORS enabled: set the environment variable OLLAMA_ORIGINS=* and restart it. Works only on devices that can reach the server.'),
    );
  }
  aiCard.append(el('h3', {}, 'Cover images'),
    el('p', { class: 'muted' }, 'Cover generation (Write → Phase 6) uses your Gemini key if set, otherwise OpenRouter — regardless of the chat provider above.'));
  if (prov !== 'gemini') aiCard.append(el('label', {}, 'Gemini API key (optional, for images)'), bindPass('geminiKey', 'AIza…'));

  v.append(el('div', { class: 'card' },
    el('h3', {}, 'Tagging'),
    el('label', {}, 'Artist name for your library'), artist,
  ), aiCard);

  // Projects management
  const projCard = el('div', { class: 'card' }, el('h3', {}, 'Songs'));
  for (const p of s.projects) {
    projCard.append(el('div', { class: 'line-actions' },
      el('span', { style: 'flex:1' }, `${p.name} — ${p.lines.length} lines`),
      el('button', {
        class: 'btn small ghost', onclick: () => {
          const name = prompt('Rename song:', p.name);
          if (name) { p.name = name; save(); render(); }
        },
      }, 'rename'),
      el('button', {
        class: 'btn small ghost', onclick: () => {
          if (confirm(`Delete "${p.name}" and its line bank?`)) { deleteProject(p.id); render(); }
        },
      }, '🗑'),
    ));
  }
  v.append(projCard);

  // Backup / share
  v.append(el('div', { class: 'card' },
    el('h3', {}, 'Backup & sharing'),
    el('p', { class: 'muted' }, 'Everything lives on this device only. Export to move your songs/playbook to another device or share with someone (your API key is never included in imports).'),
    el('button', {
      class: 'btn', onclick: () => {
        const blob = new Blob([exportAll()], { type: 'application/json' });
        const a = el('a', { href: URL.createObjectURL(blob), download: `songforge-backup-${new Date().toISOString().slice(0, 10)}.json` });
        a.click();
      },
    }, '⬇️ Export all data'),
    el('button', {
      class: 'btn ghost', onclick: () => {
        const inp = el('input', { type: 'file', accept: '.json' });
        inp.addEventListener('change', async () => {
          try { importAll(await inp.files[0].text()); render(); toast('Imported!'); }
          catch (e) { toast('Import failed: ' + e.message); }
        });
        inp.click();
      },
    }, '⬆️ Import'),
  ));
  v.append(el('p', { class: 'muted', style: 'text-align:center' }, 'SongForge · your songs never leave your device'));
}

const VIEWS = { studio: renderStudio, styles: renderStyles, tagger: renderTagger, playbook: renderPlaybook, settings: renderSettings };

function render() {
  renderProjectSwitcher();
  document.querySelectorAll('#tabs button').forEach(b =>
    b.classList.toggle('active', b.dataset.view === current));
  view.classList.toggle('wide', current === 'studio');
  VIEWS[current](view);
  window.scrollTo(0, 0);
}

document.querySelectorAll('#tabs button').forEach(b =>
  b.addEventListener('click', () => { current = b.dataset.view; render(); }));

load();
render();

if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
