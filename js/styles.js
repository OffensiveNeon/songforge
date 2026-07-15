// Styles view: the Suno style-tag library.
// Presets accumulate over time (that's the "training"), can be harvested from
// past Suno downloads' JSON, or extracted from a track/OST name via AI.
import { load, save, uid, activeProject } from './data.js';
import { el, toast, copyText } from './ui.js';
import { aiComplete, hasChatAI } from './ai.js';
import { scanDirectory } from './tagger.js';

const EXTRACT_RULES = `Convert this into a Suno "Style of Music" description.
Rules:
- Descriptive tags only, comma-separated. NO artist names, band names, composer names, or song titles — Suno rejects them. Translate the artist's sound into descriptors instead.
- Cover: genre(s), mood, vocal type & delivery, key instruments & textures, tempo/energy, era/production feel.
- 150-350 characters total. No sentences, no explanations — output ONLY the tag list.`;

function extractorPrompt(desc) {
  return `${EXTRACT_RULES}\n\nDescribe the musical style of: ${desc}\nIf you know the actual track/OST/artist, base the tags on how it really sounds.`;
}

async function readJsonOnly(item) {
  if (item.kind === 'files') {
    if (!item.files.json) return null;
    return JSON.parse(await (await item.files.json.getFile()).text());
  }
  const zipBuf = await (await item.handle.getFile()).arrayBuffer();
  const zip = await JSZip.loadAsync(zipBuf);
  for (const [name, entry] of Object.entries(zip.files)) {
    if (!entry.dir && name.toLowerCase().endsWith('.json')) return JSON.parse(await entry.async('string'));
  }
  return null;
}

function presetCard(style, rerender) {
  const s = load();
  const name = el('input', { type: 'text', style: 'font-weight:600' });
  name.value = style.name;
  name.addEventListener('input', () => { style.name = name.value; save(); });
  const tags = el('textarea', { style: 'min-height:60px' });
  tags.value = style.tags;
  tags.addEventListener('input', () => { style.tags = tags.value; save(); });
  const notes = el('input', { type: 'text', placeholder: 'notes (reference track, when to use…)' });
  notes.value = style.notes || '';
  notes.addEventListener('input', () => { style.notes = notes.value; save(); });

  return el('div', { class: 'card' },
    name, el('label', {}, 'Suno style tags'), tags, el('label', {}, 'Notes'), notes,
    el('div', { class: 'line-actions' },
      el('button', {
        class: 'btn small', onclick: () => {
          const p = activeProject();
          p.fields.sound = style.tags;
          save();
          toast(`Style set on "${p.name}"`);
        },
      }, '🎯 Use in current song'),
      el('button', { class: 'btn small ghost', onclick: () => copyText(style.tags) }, '📋 Copy tags'),
      el('button', {
        class: 'btn small ghost', onclick: () => {
          if (confirm(`Delete style "${style.name}"?`)) {
            s.styles = s.styles.filter(x => x.id !== style.id);
            save(); rerender();
          }
        },
      }, '🗑'),
    ));
}

export function renderStyles(view) {
  const s = load();
  s.styles ??= [];
  const rerender = () => renderStyles(view);
  view.replaceChildren();
  view.append(el('h2', {}, '🎨 Style library'),
    el('p', { class: 'muted' }, 'Suno "Style of Music" presets. Every style you nail and save here makes the next song faster — this library IS the training.'));

  // ---- AI extractor ----
  const desc = el('input', { type: 'text', placeholder: 'e.g. SH3 "Letter from the Lost Days", or "Death Stranding end-credits songs"' });
  const extractCard = el('div', { class: 'card' },
    el('h3', {}, '🔍 Describe a style from a track / OST / vibe'),
    el('p', { class: 'muted' }, 'Names a real song or soundtrack and the AI translates how it sounds into Suno-safe tags (Suno rejects artist names, so the prompt forces descriptors).'),
    desc,
    el('button', {
      class: 'btn ghost', onclick: () => {
        if (!desc.value.trim()) return toast('Name a track or vibe first');
        copyText(extractorPrompt(desc.value.trim()), 'Prompt copied — paste into any AI chat');
      },
    }, '📋 Copy extractor prompt'),
  );
  if (hasChatAI()) {
    const genBtn = el('button', {
      class: 'btn', onclick: async () => {
        if (!desc.value.trim()) return toast('Name a track or vibe first');
        genBtn.disabled = true;
        try {
          const tags = await aiComplete('', [{ role: 'user', content: extractorPrompt(desc.value.trim()) }]);
          s.styles.unshift({ id: uid(), name: desc.value.trim(), tags: tags.trim(), notes: 'AI-extracted' });
          save(); rerender();
          toast('Style added to library');
        } catch (e) { toast(e.message); genBtn.disabled = false; }
      },
    }, '✨ Generate in-app');
    extractCard.append(genBtn);
  } else {
    extractCard.append(el('p', { class: 'muted' }, 'Paste the AI\'s answer into a new preset below. (Connect an AI in ⚙️ Setup to generate in one click.)'));
  }
  view.append(extractCard);

  // ---- Harvest from Suno Downloads ----
  if (window.showDirectoryPicker) {
    const harvestHost = el('div');
    view.append(el('div', { class: 'card' },
      el('h3', {}, '📂 Harvest styles from your Suno Downloads'),
      el('p', { class: 'muted' }, 'Your downloaded songs\' JSON files contain the exact style tags each song was generated with. Scan the folder and save the ones that worked.'),
      el('button', {
        class: 'btn ghost', onclick: async () => {
          try {
            const dir = await window.showDirectoryPicker({ id: 'suno-src' });
            toast('Scanning…');
            const items = [];
            await scanDirectory(dir, '', items, null);
            const seen = new Set(s.styles.map(x => x.tags.trim().toLowerCase()));
            const found = [];
            for (const item of items) {
              try {
                const j = await readJsonOnly(item);
                const tags = j?.metadata?.tags?.trim();
                if (!tags || seen.has(tags.toLowerCase())) continue;
                seen.add(tags.toLowerCase());
                found.push({ title: j.title || item.name, tags });
              } catch { /* skip unreadable */ }
            }
            harvestHost.replaceChildren();
            if (!found.length) return toast('No new styles found');
            harvestHost.append(el('p', { class: 'muted' }, `${found.length} distinct styles found — save the keepers:`));
            for (const f of found) {
              const row = el('div', { class: 'line-item candidate' },
                el('div', { class: 'line-text' }, f.tags),
                el('div', { class: 'line-meta' }, 'from: ' + f.title),
                el('div', { class: 'line-actions' },
                  el('button', {
                    class: 'btn small', onclick: (e) => {
                      s.styles.unshift({ id: uid(), name: f.title, tags: f.tags, notes: 'harvested from Suno Downloads' });
                      save();
                      e.target.closest('.line-item').remove();
                      toast('Saved');
                    },
                  }, '+ save')));
              harvestHost.append(row);
            }
          } catch (e) { if (e.name !== 'AbortError') toast('Scan failed: ' + e.message); }
        },
      }, '📂 Scan folder'),
      harvestHost,
    ));
  }

  // ---- New preset ----
  const nName = el('input', { type: 'text', placeholder: 'style name' });
  const nTags = el('textarea', { placeholder: 'comma-separated Suno style tags' });
  view.append(el('div', { class: 'card' },
    el('h3', {}, '＋ New preset'),
    nName, el('label', {}, 'Tags'), nTags,
    el('button', {
      class: 'btn', onclick: () => {
        if (!nName.value.trim() || !nTags.value.trim()) return toast('Name and tags required');
        s.styles.unshift({ id: uid(), name: nName.value.trim(), tags: nTags.value.trim(), notes: '' });
        save(); rerender();
      },
    }, 'Save preset'),
  ));

  // ---- Library ----
  for (const style of s.styles) view.append(presetCard(style, rerender));
}
