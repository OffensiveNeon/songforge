// Write view: walks the playbook phases and generates copy-paste prompts.
import { activeProject, save, MODES } from './data.js';
import { el, copyBlock, copyText, toast } from './ui.js';
import { aiImage, hasImageAI } from './ai.js';

const VOCAL_OPTIONS = ['female vocals', 'male vocals', 'duet, male and female vocals', 'instrumental, no vocals'];
function setVocals(tags, choice) {
  // drop existing vocal-type chunks, then lead with the chosen one
  const rest = tags.split(',').map(x => x.trim())
    .filter(x => x && !/vocals|vocal\b|instrumental|duet|a cappella/i.test(x))
    .join(', ');
  return choice + (rest ? ', ' + rest : '');
}

const HARD_RULES = `Hard rules:
- Avoid cliched words and phrases. Subtext and nuance — imply, never explain.
- No melodrama, no explicit emotion-labeling, no triumph, no catharsis.
- Stay inside the character's actual agency and canon.
- Concrete tangible verbs over abstract poetry. If a line is poetic just to be poetic, cut it.`;

const CHARACTER_RULES = `Voice rules (this is a character-voice track — meter rules do NOT apply, voice authenticity does):
- Broken-psyche: stuttering, half-words, non-words, rare completed phrases that reveal doctrine; dissolve into noise by the end.
- Child-voice: concrete observations (cracks, colors, counting), circular forgetful repetition, devastating innocence stated flatly. Neglect implied through physical detail, never named.
- Dialogue/duet: characters talk PAST each other; disagreement stays unresolved; what they don't say carries the meaning.
(Keep whichever of these applies; the others are calibration.)`;

export function phase1Prompt(p) {
  const f = p.fields;
  const rules = p.mode === 'character' ? HARD_RULES + '\n\n' + CHARACTER_RULES : HARD_RULES;
  return `Let's write a song inspired by ${f.game || '[SOURCE]'}, about ${f.angle || '[EMOTIONAL ANGLE]'}.
POV: ${f.pov || '[THE REFRAME — whose tragedy is it really? the victim/weapon/bystander, not the protagonist]'}
Sound: ${f.sound || '[GENRE + textures]'}
Emotional arc: ${f.arc || '[e.g. stages of grief, ending in acceptance]'}

Raw material to work from:
${f.raw || '[paste game dialogue, script excerpts, reference-song lines you love, or your own rough draft]'}

${rules}

Do NOT write a full song yet. Brainstorm modular lyric material first: line OPTIONS organized by emotional stage, plus recurring motifs and 3-4 refrain/hook candidates. Multiple options per section so I can pick.`;
}

export function albumBiblePrompt(p) {
  const f = p.fields;
  return `Before any lyrics: let's lock an album bible for an album inspired by ${f.game || '[SOURCE]'}.
Give me a one-paragraph album concept, then: tracklist, the emotional arc ACROSS tracks, and per-track concept + sound.
Assign distinct vocal identities per character up front and keep them consistent across tracks.
Title the album and tracks as a set, so the drama level matches.
Do not write any lyrics until I approve the bible.`;
}

export function phase2Prompt(p) {
  const approved = p.lines.filter(l => l.status === 'approved');
  const rejected = p.lines.filter(l => l.status === 'rejected');
  let out = '';
  if (approved.length) {
    out += 'APPROVED — keep these exactly as written:\n';
    for (const l of approved) out += `- "${l.text}"${l.reason ? ` (works: ${l.reason})` : ''}\n`;
    out += '\n';
  }
  if (rejected.length) {
    out += 'REJECTED — replace these, matching the reason given:\n';
    for (const l of rejected) out += `- "${l.text}"${l.reason ? ` (fails: ${l.reason})` : ''}\n`;
    out += '\n';
  }
  out += `Keep only my approved lines. Offer replacements only where I rejected something, matching the reason I gave. Don't rewrite lines I approved.`;
  return out;
}

export function phase3Block(p) {
  const approved = p.lines.filter(l => l.status === 'approved');
  const bySection = {};
  for (const l of approved) (bySection[l.section || 'unsorted'] ??= []).push(l.text);
  let out = 'COMPILED APPROVED MATERIAL — the song must be built ONLY from these lines:\n\n';
  for (const [sec, lines] of Object.entries(bySection)) {
    out += `[${sec}]\n${lines.join('\n')}\n\n`;
  }
  return out.trim();
}

export function phase4Prompt(p) {
  const meter = p.mode === 'character'
    ? `- meter rules do NOT apply — this runs on voice authenticity instead (keep stutters, half-words, broken phrasing)`
    : `- each verse 6-8 lines, uniform cadence or rhythm
- chorus 4-6 lines with a catchy refrain
- iambic pentameter and/or common meter`;
  return `Assemble the full song using ONLY my compiled lines, adapted minimally for rhythm. Rules:
${meter}
- Suno formatting: [Verse 1], [Chorus], [Bridge] tags
- evolving refrain: the final chorus shifts a word or two to mark the arc
- embed production cues that mirror the arc: ${p.fields.cues || '[e.g. "guitar starts structured, disintegrates into arrhythmic plucking by the bridge"]'}
- end in stillness, not climax — whispered/spoken coda, fade`;
}

export const PHASE5 = `Suggest titles pulled from phrases already inside the lyrics. Flag anything culturally loaded (existing famous songs/idioms).`;

const PHASES = [
  { n: 1, label: '1 · Kickoff' },
  { n: 2, label: '2 · Curate' },
  { n: 3, label: '3 · Compile' },
  { n: 4, label: '4 · Assemble' },
  { n: 5, label: '5 · Title' },
  { n: 6, label: '6 · Suno' },
];

function field(p, key, labelText, opts = {}) {
  const input = opts.multi
    ? el('textarea', { placeholder: opts.ph || '' })
    : el('input', { type: 'text', placeholder: opts.ph || '' });
  input.value = p.fields[key] || '';
  input.addEventListener('input', () => { p.fields[key] = input.value; save(); rerenderPromptOnly(p); });
  return el('div', {}, el('label', {}, labelText), input);
}

let promptHost = null;
let currentBuilder = null;
function rerenderPromptOnly(p) {
  if (promptHost && currentBuilder) {
    promptHost.replaceChildren(copyBlock(currentBuilder(p)));
  }
}

export function renderWrite(view) {
  const p = activeProject();
  view.replaceChildren();
  view.append(el('h2', {}, '✍️ ', p.name));

  // Mode selector
  const modeSel = el('select', {},
    ...Object.entries(MODES).map(([k, v]) => {
      const o = el('option', { value: k }, v);
      if (p.mode === k) o.selected = true;
      return o;
    }));
  modeSel.addEventListener('change', () => { p.mode = modeSel.value; save(); renderWrite(view); });
  view.append(el('div', { class: 'card' }, el('label', {}, 'Mode'), modeSel));

  // Phase pills
  const pills = el('div', { class: 'phase-steps' },
    ...PHASES.map(ph => el('button', {
      class: p.phase === ph.n ? 'active' : '',
      onclick: () => { p.phase = ph.n; save(); renderWrite(view); },
    }, ph.label)));
  view.append(pills);

  const card = el('div', { class: 'card' });
  promptHost = el('div');
  currentBuilder = null;

  if (p.phase === 1) {
    card.append(el('h3', {}, 'Phase 1 — Kickoff'),
      el('p', { class: 'muted' }, 'Golden rule: the more raw material you bring, the faster you land. Fill in, then copy the prompt into your AI chat.'));
    if (p.mode === 'album') {
      card.append(el('p', { class: 'muted' }, '📀 Album mode: lock the album bible FIRST, then run phases 1-5 per track.'));
    }
    card.append(
      el('div', { class: 'row' },
        field(p, 'game', 'Source / inspiration', { ph: 'e.g. Silent Hill 4' }),
        field(p, 'angle', 'Emotional angle', { ph: 'e.g. being made into a weapon' })),
      field(p, 'pov', 'POV — the reframe (whose tragedy is it really?)', { ph: 'the victim/weapon/bystander, not the protagonist' }),
      el('div', { class: 'row' },
        field(p, 'sound', 'Sound', { ph: 'rock with discordant strings, unnerving' }),
        field(p, 'arc', 'Emotional arc', { ph: 'stages of grief → acceptance, calmer tone' })),
      field(p, 'raw', 'Raw material (dialogue, reference lines, rough draft)', { multi: true }),
    );
    if (p.mode === 'album') {
      currentBuilder = null;
      card.append(el('h3', {}, 'Album bible prompt (run this first)'), copyBlock(albumBiblePrompt(p)));
      card.append(el('h3', {}, 'Kickoff prompt (per track)'));
    }
    currentBuilder = phase1Prompt;
    promptHost.append(copyBlock(phase1Prompt(p)));
    card.append(promptHost);
  }

  if (p.phase === 2) {
    const nApproved = p.lines.filter(l => l.status === 'approved').length;
    const nRejected = p.lines.filter(l => l.status === 'rejected').length;
    const nCand = p.lines.filter(l => l.status === 'candidate').length;
    card.append(el('h3', {}, 'Phase 2 — Curate with reasons'),
      el('p', { class: 'muted' },
        `Paste the AI's line options into the Lines tab, approve/reject each with a reason, then copy the generated reply below. 2-3 passes is normal. `,
        `Bank now: ${nApproved} approved · ${nRejected} rejected · ${nCand} undecided.`));
    if (!nApproved && !nRejected) {
      card.append(el('p', { class: 'status-warn' }, '⚠️ No curated lines yet — go to the 🧺 Lines tab first.'));
    }
    currentBuilder = phase2Prompt;
    promptHost.append(copyBlock(phase2Prompt(p)));
    card.append(promptHost);
  }

  if (p.phase === 3) {
    const nApproved = p.lines.filter(l => l.status === 'approved').length;
    card.append(el('h3', {}, 'Phase 3 — Compilation (secret weapon)'),
      el('p', { class: 'muted' }, `Paste EVERY approved line as one block before asking for assembly, so the song is built only from approved material. ${nApproved} approved lines in the bank.`));
    currentBuilder = phase3Block;
    promptHost.append(copyBlock(phase3Block(p)));
    card.append(promptHost);
  }

  if (p.phase === 4) {
    card.append(el('h3', {}, 'Phase 4 — Assembly rules'),
      field(p, 'cues', 'Production cues that mirror the arc', { ph: 'guitar starts structured, disintegrates by the bridge' }));
    currentBuilder = phase4Prompt;
    promptHost.append(copyBlock(phase4Prompt(p)));
    card.append(promptHost);
    card.append(el('p', { class: 'muted' }, 'Send Phase 3\'s block and this in the same message for best results.'));
  }

  if (p.phase === 5) {
    card.append(el('h3', {}, 'Phase 5 — Title'));
    currentBuilder = () => PHASE5;
    promptHost.append(copyBlock(PHASE5));
    card.append(promptHost);
    card.append(el('h3', {}, 'Final checklist'),
      el('div', { class: 'pb-md', html: `<ul>
        <li>Spoken-word section(s) using real source dialogue, varied delivery</li>
        <li>Evolving refrain — final chorus changes 1-2 words</li>
        <li>Emotional arc mapped to structure</li>
        <li>Instrumentation tells the same story as the lyrics</li>
        <li>Ending in stillness: whispered coda, fade-out</li>
        <li>Title is a phrase from inside the lyrics</li></ul>` }));
  }

  if (p.phase === 6) {
    card.append(el('h3', {}, 'Phase 6 — Send to Suno'),
      el('p', { class: 'muted' }, 'Suno takes two boxes: Lyrics and Style of Music. Both are kept with this project.'));

    const styleTa = el('textarea', { style: 'min-height:70px', placeholder: 'comma-separated style tags — pick a preset in the 🎨 Styles tab, or type your own' });
    styleTa.value = p.fields.sound || '';
    const styleCount = el('span', { class: 'muted' });
    const lyricsTa = el('textarea', { style: 'min-height:220px', placeholder: 'Paste the final assembled song here (with [Verse]/[Chorus] tags and production cues) so it lives with the project.' });
    lyricsTa.value = p.fields.finalLyrics || '';
    const lyricsCount = el('span', { class: 'muted' });

    const updateCounts = () => {
      const sc = styleTa.value.length, lc = lyricsTa.value.length;
      styleCount.textContent = ` ${sc}/1000${sc > 1000 ? ' — too long for Suno!' : ''}`;
      styleCount.className = sc > 1000 ? 'status-err' : 'muted';
      lyricsCount.textContent = ` ${lc}/5000${lc > 5000 ? ' — too long for Suno!' : ''}`;
      lyricsCount.className = lc > 5000 ? 'status-err' : 'muted';
    };
    styleTa.addEventListener('input', () => { p.fields.sound = styleTa.value; save(); updateCounts(); });
    lyricsTa.addEventListener('input', () => { p.fields.finalLyrics = lyricsTa.value; save(); updateCounts(); });
    updateCounts();

    const vocalChips = el('div', { class: 'chips' },
      ...VOCAL_OPTIONS.map(v => el('span', {
        class: 'chip',
        onclick: () => {
          styleTa.value = setVocals(styleTa.value, v);
          p.fields.sound = styleTa.value;
          save(); updateCounts();
          toast('Vocals set: ' + v);
        },
      }, v)));

    card.append(
      el('label', {}, 'Style of Music box', styleCount), styleTa,
      el('label', {}, 'Vocals'), vocalChips,
      el('button', { class: 'btn small', onclick: () => copyText(styleTa.value) }, '📋 Copy style'),
      el('label', {}, 'Lyrics box', lyricsCount), lyricsTa,
      el('button', { class: 'btn small', onclick: () => copyText(lyricsTa.value) }, '📋 Copy lyrics'),
      el('p', { class: 'muted' }, 'Reminder: no artist names in the style box — Suno rejects them. The 🎨 Styles tab\'s extractor writes Suno-safe tags.'),
    );

    // ---- Cover art ----
    const artCard = el('div', { class: 'card' }, el('h3', {}, '🖼️ Cover art'));
    if (!hasImageAI()) {
      artCard.append(el('p', { class: 'muted' }, 'To generate cover art in-app, add a Gemini API key (free at aistudio.google.com) or an OpenRouter key in ⚙️ Setup. Note: a ChatGPT/Gemini chat subscription is not an API key.'));
    } else {
      const artPrompt = el('textarea', { style: 'min-height:70px' });
      artPrompt.value = p.fields.coverPrompt ||
        `Square album cover art for a song called "${p.name}". Mood: ${p.fields.angle || p.fields.arc || 'melancholic'}. Visual style: dark, painterly, atmospheric. No text, no words, no lettering.`;
      artPrompt.addEventListener('input', () => { p.fields.coverPrompt = artPrompt.value; save(); });
      const artHost = el('div');
      const genBtn = el('button', {
        class: 'btn', onclick: async () => {
          genBtn.disabled = true;
          artHost.replaceChildren(el('p', { class: 'muted' }, '🎨 generating…'));
          try {
            const url = await aiImage(artPrompt.value);
            const dl = el('a', {
              class: 'btn small ghost', href: url,
              download: `${p.name.replace(/[<>:"/\\|?*]/g, '_')} cover.png`,
              style: 'display:inline-block;text-decoration:none;margin-top:8px',
            }, '⬇️ Save image');
            artHost.replaceChildren(
              el('img', { src: url, style: 'max-width:100%;border-radius:10px;margin-top:8px' }),
              el('div', {}, dl),
              el('p', { class: 'muted' }, 'Not stored in the app — save it. Drop it next to the song\'s files (same name as the mp3) and the 🏷️ Tag tab embeds it.'),
            );
          } catch (e) {
            artHost.replaceChildren(el('p', { class: 'status-err' }, e.message));
          }
          genBtn.disabled = false;
        },
      }, '✨ Generate cover');
      artCard.append(el('label', {}, 'Image prompt'), artPrompt, genBtn, artHost);
    }
    card.append(artCard);
  }

  view.append(card);
}
