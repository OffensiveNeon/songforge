// Tag view: scan the Suno Downloads folder, embed cover art + lyrics + metadata
// into MP3s, and write clean copies into a library folder. Desktop Chrome/Edge only
// (uses the File System Access API).
import { ID3Writer } from '../lib/browser-id3-writer.mjs';
import { load } from './data.js';
import { el, toast } from './ui.js';

// ---------- mojibake repair (UTF-8 text mis-read as CP1252, e.g. "â€™" -> "'") ----------
const CP1252_REV = {
  '€': 0x80, '‚': 0x82, 'ƒ': 0x83, '„': 0x84, '…': 0x85,
  '†': 0x86, '‡': 0x87, 'ˆ': 0x88, '‰': 0x89, 'Š': 0x8A,
  '‹': 0x8B, 'Œ': 0x8C, 'Ž': 0x8E, '‘': 0x91, '’': 0x92,
  '“': 0x93, '”': 0x94, '•': 0x95, '–': 0x96, '—': 0x97,
  '˜': 0x98, '™': 0x99, 'š': 0x9A, '›': 0x9B, 'œ': 0x9C,
  'ž': 0x9E, 'Ÿ': 0x9F,
};
function looksMojibake(s) {
  // UTF-8 lead byte (0xC2-0xEF shown as a Latin-1 char) followed by a
  // continuation byte (0x80-0xBF, shown either as Latin-1 or a CP1252 char).
  for (let i = 0; i < s.length - 1; i++) {
    const a = s.charCodeAt(i);
    if (a >= 0xC2 && a <= 0xEF) {
      const b = s.charCodeAt(i + 1);
      if ((b >= 0x80 && b <= 0xBF) || CP1252_REV[s[i + 1]] !== undefined) return true;
    }
  }
  return false;
}
export function fixMojibake(s) {
  if (typeof s !== 'string' || !looksMojibake(s)) return s;
  const bytes = [];
  for (const ch of s) {
    const c = ch.codePointAt(0);
    if (c < 0x100) bytes.push(c);
    else if (CP1252_REV[ch] !== undefined) bytes.push(CP1252_REV[ch]);
    else return s; // genuine unicode present -> not mojibake
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(new Uint8Array(bytes));
  } catch { return s; }
}

export function sanitizeName(name) {
  return name.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').replace(/[. ]+$/, '').trim() || 'Untitled';
}

// ---------- scanning ----------
// A "song item" = same-stem mp3 + json + jpg + txt in one directory (or inside a zip).
function stem(name) { return name.replace(/\.[^.]+$/, ''); }
function ext(name) { const m = name.match(/\.([^.]+)$/); return m ? m[1].toLowerCase() : ''; }

export async function scanDirectory(dirHandle, path, items, albumGuess) {
  const byStem = {};
  const subdirs = [];
  for await (const entry of dirHandle.values()) {
    if (entry.kind === 'directory') { subdirs.push(entry); continue; }
    const e = ext(entry.name);
    if (['mp3', 'json', 'jpg', 'jpeg', 'png', 'txt', 'zip', 'wav', 'm4a'].includes(e)) {
      (byStem[stem(entry.name)] ??= {})[e === 'jpeg' ? 'jpg' : e] = entry;
    }
  }
  for (const [s, files] of Object.entries(byStem)) {
    if (files.zip) {
      items.push({ kind: 'zip', name: s, path, handle: files.zip, album: albumGuess });
    } else if (files.mp3 || files.wav || files.m4a) {
      items.push({ kind: 'files', name: s, path, files, album: albumGuess });
    }
  }
  for (const sub of subdirs) {
    // top-level folder name = project/album guess; deeper levels keep it
    await scanDirectory(sub, path + '/' + sub.name, items, albumGuess ?? sub.name);
  }
}

async function readItem(item) {
  // Returns {audioBuf, audioExt, json, cover, lyricsTxt}
  const out = { audioBuf: null, audioExt: 'mp3', json: null, cover: null, lyricsTxt: '' };
  if (item.kind === 'zip') {
    const zipBuf = await (await item.handle.getFile()).arrayBuffer();
    const zip = await JSZip.loadAsync(zipBuf);
    for (const [name, entry] of Object.entries(zip.files)) {
      if (entry.dir) continue;
      const e = ext(name);
      if (e === 'mp3' || e === 'wav' || e === 'm4a') { out.audioBuf = await entry.async('arraybuffer'); out.audioExt = e; }
      else if (e === 'json') out.json = JSON.parse(await entry.async('string'));
      else if (e === 'jpg' || e === 'jpeg' || e === 'png') out.cover = await entry.async('arraybuffer');
      else if (e === 'txt') out.lyricsTxt = await entry.async('string');
    }
  } else {
    const f = item.files;
    const audio = f.mp3 || f.wav || f.m4a;
    out.audioExt = f.mp3 ? 'mp3' : (f.wav ? 'wav' : 'm4a');
    out.audioBuf = await (await audio.getFile()).arrayBuffer();
    if (f.json) out.json = JSON.parse(await (await f.json.getFile()).text());
    if (f.jpg || f.png) out.cover = await (await (f.jpg || f.png).getFile()).arrayBuffer();
    if (f.txt) out.lyricsTxt = await (await f.txt.getFile()).text();
  }
  return out;
}

function buildMeta(item, data) {
  const j = data.json || {};
  const md = j.metadata || {};
  const settings = load().settings;
  return {
    title: fixMojibake(j.title || item.name),
    album: fixMojibake(j.project_name || item.album || 'Suno'),
    artist: settings.artist || j.display_name || 'Suno',
    genre: (md.tags || '').split(',').map(s => s.trim()).filter(Boolean),
    lyrics: fixMojibake(md.prompt || data.lyricsTxt || ''),
    year: j.created_at ? new Date(j.created_at).getFullYear() : null,
    sunoId: j.id || '',
    styleTags: md.tags || '',
  };
}

function writeTags(audioBuf, meta, cover) {
  const writer = new ID3Writer(audioBuf);
  writer.setFrame('TIT2', meta.title)
    .setFrame('TALB', meta.album)
    .setFrame('TPE1', [meta.artist]);
  if (meta.genre.length) writer.setFrame('TCON', meta.genre);
  if (meta.year) writer.setFrame('TYER', meta.year);
  if (meta.lyrics) writer.setFrame('USLT', { description: '', lyrics: meta.lyrics.slice(0, 60000), language: 'eng' });
  if (cover) writer.setFrame('APIC', { type: 3, data: cover, description: 'Cover' });
  if (meta.sunoId) { try { writer.setFrame('TXXX', { description: 'SUNO_ID', value: meta.sunoId }); } catch {} }
  if (meta.styleTags) { try { writer.setFrame('TXXX', { description: 'SUNO_STYLE', value: meta.styleTags }); } catch {} }
  writer.addTag();
  return writer.arrayBuffer;
}

// ---------- view ----------
let scanState = { items: [], rows: [], srcName: '' };
let playerUrl = null;

function playAudio(playerHost, buf, name) {
  if (playerUrl) URL.revokeObjectURL(playerUrl);
  playerUrl = URL.createObjectURL(new Blob([buf], { type: 'audio/mpeg' }));
  playerHost.replaceChildren(
    el('p', { class: 'muted', style: 'margin-bottom:4px' }, '🎧 ' + name),
    el('audio', { controls: true, autoplay: true, src: playerUrl, style: 'width:100%' }),
  );
}

export function renderTagger(view) {
  view.replaceChildren();
  view.append(el('h2', {}, '🏷️ Tag & build library'));

  if (!window.showDirectoryPicker) {
    view.append(el('div', { class: 'card' },
      el('p', {}, 'This tab needs the folder-access API, which phones and some browsers don\'t support yet.'),
      el('p', { class: 'muted' }, 'Open SongForge in Chrome or Edge on a PC (Windows/Linux/Mac) to tag your files. Everything else works here.')));
    return;
  }

  const intro = el('div', { class: 'card' },
    el('p', {}, 'Pick your Suno Downloads folder. SongForge reads each song\'s JSON/lyrics/cover and writes clean, fully-tagged MP3s (cover art, lyrics, album, style tags) into a library folder of your choice. Originals are never modified.'),
    el('button', {
      class: 'btn', onclick: async () => {
        try {
          const dir = await window.showDirectoryPicker({ id: 'suno-src' });
          scanState = { items: [], rows: [], srcName: dir.name };
          toast('Scanning…');
          await scanDirectory(dir, '', scanState.items, null);
          renderTagger(view);
        } catch (e) { if (e.name !== 'AbortError') toast('Scan failed: ' + e.message); }
      },
    }, '📂 Pick Suno Downloads folder'),
  );
  view.append(intro);

  if (!scanState.items.length) return;

  const items = scanState.items;
  view.append(el('p', { class: 'muted' }, `Found ${items.length} songs in "${scanState.srcName}".`));

  const playerHost = el('div', { class: 'card', style: 'position:sticky;top:0;z-index:5' });
  playerHost.append(el('p', { class: 'muted' }, '🎧 Hit ▶ on any song to listen before tagging.'));
  view.append(playerHost);

  const checks = new Map();
  const statusCells = new Map();
  const table = el('table', { class: 'tagtable' },
    el('thead', {}, el('tr', {},
      el('th', {}, ''), el('th', {}, ''), el('th', {}, 'Song'), el('th', {}, 'Album / project'), el('th', {}, 'Type'), el('th', {}, 'Status'))));
  const tbody = el('tbody');
  for (const item of items) {
    const cb = el('input', { type: 'checkbox' });
    cb.checked = true;
    checks.set(item, cb);
    const status = el('td', { class: 'muted' }, '—');
    statusCells.set(item, status);
    const playBtn = el('button', {
      class: 'btn small ghost', onclick: async () => {
        playBtn.textContent = '⏳';
        try {
          const data = await readItem(item);
          if (!data.audioBuf) throw new Error('no audio file');
          playAudio(playerHost, data.audioBuf, item.name);
        } catch (e) { toast(e.message); }
        playBtn.textContent = '▶';
      },
    }, '▶');
    tbody.append(el('tr', {},
      el('td', {}, cb),
      el('td', {}, playBtn),
      el('td', {}, item.name),
      el('td', {}, item.album || '(root)'),
      el('td', {}, item.kind === 'zip' ? '📦 zip' : '🎵 files'),
      status));
  }
  table.append(tbody);

  const toggleAll = el('button', {
    class: 'btn small ghost', onclick: () => {
      const any = [...checks.values()].some(c => !c.checked);
      checks.forEach(c => { c.checked = any; });
    },
  }, 'Toggle all');

  const progress = el('p', { class: 'muted' }, '');
  const goBtn = el('button', {
    class: 'btn', onclick: async () => {
      let outDir;
      try {
        outDir = await window.showDirectoryPicker({ id: 'suno-out', mode: 'readwrite' });
      } catch { return; }
      goBtn.disabled = true;
      let done = 0, failed = 0;
      const selected = items.filter(i => checks.get(i).checked);
      const usedNames = new Set();
      for (const item of selected) {
        const cell = statusCells.get(item);
        try {
          cell.textContent = '⏳';
          const data = await readItem(item);
          if (!data.audioBuf) throw new Error('no audio file');
          const meta = buildMeta(item, data);
          let outBuf = data.audioBuf;
          if (data.audioExt === 'mp3') {
            outBuf = writeTags(data.audioBuf, meta, data.cover);
          }
          const albumDir = await outDir.getDirectoryHandle(sanitizeName(meta.album), { create: true });
          let base = sanitizeName(meta.title), fileName = `${base}.${data.audioExt}`, n = 1;
          while (usedNames.has(`${meta.album}/${fileName}`)) fileName = `${base} (${++n - 1}).${data.audioExt}`, n++;
          usedNames.add(`${meta.album}/${fileName}`);
          const fh = await albumDir.getFileHandle(fileName, { create: true });
          const w = await fh.createWritable();
          await w.write(outBuf);
          await w.close();
          cell.textContent = data.audioExt === 'mp3' ? '✅ tagged' : '✅ copied (tags need mp3)';
          cell.className = 'status-ok';
          done++;
        } catch (e) {
          cell.textContent = '❌ ' + e.message;
          cell.className = 'status-err';
          failed++;
        }
        progress.textContent = `${done + failed}/${selected.length} processed${failed ? ` · ${failed} failed` : ''}`;
      }
      goBtn.disabled = false;
      toast(failed ? `Done with ${failed} failures` : `🎉 ${done} songs tagged & saved`);
    },
  }, '🏷️ Tag selected → save to library folder…');

  view.append(el('div', { class: 'card' },
    el('div', { class: 'scroll-x' }, table),
    toggleAll, goBtn, progress));
}
