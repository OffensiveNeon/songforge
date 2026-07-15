// SongForge data layer: localStorage persistence + playbook content.

const KEY = 'songforge.v1';

export const DEFAULT_PLAYBOOK_MD = `# Song Lyric Playbook

The "magic" is not one prompt — it's a 5-phase sequence with taste-guardrails up front. The AI drafts broadly; you curate; the AI assembles only from approved material.

**Golden rule:** the more raw material you bring in Phase 1 (game dialogue, reference songs, your own rough draft), the faster you land.

## Phase 1 — Kickoff
State the source/inspiration, the emotional angle, the POV reframe (whose tragedy is it really?), sound, and emotional arc. Paste raw material. Ask for modular line OPTIONS by emotional stage — NOT a full song.

## Phase 2 — Curate with reasons (2-3 passes)
Quote each line back; say WHY it works or fails. The why steers the next batch.

Acceptance criteria:
- loaded but not on-the-nose ("too near to forgive")
- dual-perspective lines ("they fear the fall / I fear the pull")
- embodied perspective ("the ground looks softer from far away")
- ties to game mechanics/canon (moon's tears, radio broadcast)

Rejection criteria:
- breaks character logic/agency or canon
- too on-the-nose, too violent for the tone
- abstract / poetic-for-poetry's-sake ("the air learns my shape")
- culturally loaded ("Let It Be" = Beatles)

## Phase 3 — Compilation (secret weapon)
Paste EVERY approved line as one block before asking for assembly. This forces the final song to be built only from approved material.

## Phase 4 — Assembly rules
- each verse 6-8 lines, uniform cadence; chorus 4-6 lines with catchy refrain
- iambic pentameter and/or common meter
- Suno formatting: [Verse 1], [Chorus], [Bridge] tags
- evolving refrain: final chorus shifts a word or two to mark the arc
- production cues that mirror the arc
- end in stillness, not climax — whispered/spoken coda, fade

## Phase 5 — Title
Titles pulled from phrases already inside the lyrics. Flag anything culturally loaded.

## Structural signatures checklist
- [ ] Spoken-word section(s) using real source dialogue, varied delivery
- [ ] Evolving refrain — final chorus changes 1-2 words
- [ ] Emotional arc mapped to structure
- [ ] Instrumentation tells the same story as the lyrics
- [ ] Ending in stillness: whispered coda, fade-out
- [ ] Title is a phrase from inside the lyrics

## Line-level anatomy — what makes a line pass
1. **Iceberg line** — says one small thing, implies a huge thing.
2. **Dual-perspective line** — two truths in one breath ("they fear the fall / I fear the pull").
3. **Impossible-promise line** — love spoken over doubt, kept anyway. Never resolve the doubt.
4. **Blame-transfer line** — the victim carrying someone else's crime.
5. **Canon-echo line** — rhymes with the source without quoting it.

**Automatic kills** (no matter how pretty): agency the character doesn't have; triumph where canon says death; abstract with no anchor; names the subtext; origin-story mythic declaratives; borrowed cultural weight.

## Mode variations
**Album mode:** one-paragraph album bible first (tracklist, arc across tracks, per-track concept + sound), locked BEFORE any lyrics. Distinct vocal identities per character, consistent across tracks. Title album + tracks as a set.

**Character-voice / experimental:** meter rules OFF — voice authenticity instead. Broken-psyche: stutters, half-words, dissolve into noise. Child-voice: concrete observations, circular repetition, devastating innocence stated flatly. Duets: characters talk PAST each other; disagreement stays unresolved.

**Spoken sections:** real source dialogue verbatim when iconic; vary delivery per section (muffled/static, warped, radio, whispered); foreign-language or numeric material is gold — texture over meaning.`;

export const APPROVE_REASONS = [
  'iceberg — implies more than it says',
  'dual-perspective',
  'embodied / physical',
  'canon-echo / game mechanic',
  'impossible promise',
  'blame-transfer',
  'loaded but not on-the-nose',
];

export const REJECT_REASONS = [
  'too on-the-nose',
  'breaks canon / agency',
  'abstract, no anchor',
  'melodrama / labels the emotion',
  'culturally loaded',
  'too violent for tone',
  'AI-phrasing / generic',
];

export const MODES = {
  single: 'Single song',
  album: 'Album',
  character: 'Character-voice / experimental',
};

export const uid = () => Math.random().toString(36).slice(2, 10);

export const STARTER_STYLES = [
  {
    name: 'SH ballad — "Letter from the Lost Days" feel',
    tags: 'melancholic acoustic rock ballad, female alto vocals, wistful and restrained delivery, arpeggiated clean electric guitar, soft brushed drums, slow tempo, 90s alternative production, bittersweet, reflective',
    notes: 'Silent Hill 3 vocal-ballad mood. Understated, tired-sad, never soaring.',
  },
  {
    name: 'SH rock — "You\'re Not Here" feel',
    tags: 'driving alternative rock, powerful female vocals, urgent, palm-muted verses opening into anthemic chorus, melodic lead guitar, 2000s rock production, yearning',
    notes: 'Silent Hill 3 opening-credits energy.',
  },
  {
    name: 'SH instrumental — "Theme of Laura" feel',
    tags: 'cinematic instrumental rock, emotive lead guitar melody, arpeggiated intro, driving steady drums, melancholic, atmospheric, minor key, longing',
    notes: 'Silent Hill 2 main theme mood. Use with "make instrumental".',
  },
  {
    name: 'SH dark ambient — otherworld',
    tags: 'dark ambient industrial, metallic scraped percussion, low drones, distant radio static, tape hiss, unsettling, sparse, horror atmosphere, no melody until late',
    notes: 'Rust-world texture beds; good under spoken-word sections.',
  },
];

function blankProject(name) {
  return {
    id: uid(),
    name: name || 'Untitled song',
    mode: 'single',
    fields: { game: '', angle: '', pov: '', sound: '', arc: '', raw: '', cues: '', albumBible: '' },
    lines: [],   // {id, text, section, status: candidate|approved|rejected, reason}
    chat: [],    // {role, content}
    phase: 1,
    createdAt: new Date().toISOString(),
  };
}

function defaults() {
  const p = blankProject('My first song');
  return {
    settings: {
      artist: '', provider: 'anthropic',
      apiKey: '', model: 'claude-sonnet-5',
      openrouterKey: '', openrouterModel: 'anthropic/claude-sonnet-4.5',
      geminiKey: '', geminiModel: 'gemini-2.5-flash',
      localUrl: '', localModel: '', localKey: '',
    },
    playbookMd: DEFAULT_PLAYBOOK_MD,
    projects: [p],
    activeProject: p.id,
    styles: STARTER_STYLES.map(s => ({ id: uid(), ...s })),
  };
}

let state = null;

export function load() {
  if (state) return state;
  try {
    const raw = localStorage.getItem(KEY);
    state = raw ? Object.assign(defaults(), JSON.parse(raw)) : defaults();
    state.settings = Object.assign(defaults().settings, state.settings);
  } catch { state = defaults(); }
  if (!state.projects.length) { const p = blankProject(); state.projects = [p]; state.activeProject = p.id; }
  return state;
}

export function save() {
  localStorage.setItem(KEY, JSON.stringify(state));
}

export function activeProject() {
  const s = load();
  return s.projects.find(p => p.id === s.activeProject) || s.projects[0];
}

export function setActiveProject(id) { load().activeProject = id; save(); }

export function newProject(name) {
  const p = blankProject(name);
  load().projects.push(p);
  load().activeProject = p.id;
  save();
  return p;
}

export function deleteProject(id) {
  const s = load();
  s.projects = s.projects.filter(p => p.id !== id);
  if (!s.projects.length) s.projects.push(blankProject());
  if (!s.projects.find(p => p.id === s.activeProject)) s.activeProject = s.projects[0].id;
  save();
}

export function addLines(project, texts, section) {
  for (const t of texts) {
    const text = t.replace(/^[-*•\d.)\s]+/, '').trim();
    if (text) project.lines.push({ id: uid(), text, section: section || '', status: 'candidate', reason: '' });
  }
  save();
}

export function exportAll() {
  return JSON.stringify(load(), null, 2);
}

export function importAll(json) {
  const data = JSON.parse(json);
  if (!data.projects) throw new Error('Not a SongForge export');
  // never import someone else's keys silently
  for (const k of ['apiKey', 'openrouterKey', 'geminiKey', 'localKey']) delete data.settings?.[k];
  state = Object.assign(defaults(), data);
  save();
}
