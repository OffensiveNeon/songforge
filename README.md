# 🎵 SongForge

A songwriting companion + Suno library tagger. One app, all devices, no accounts, no server — everyone's data stays on their own device.

## What it does

- **✍️ Write** — walks you through the 5-phase playbook (Kickoff → Curate → Compile → Assemble → Title) and generates copy-paste prompts for any AI chat. Supports Single / Album / Character-voice modes.
- **🧺 Lines** — the line bank. Paste the AI's line options, approve/reject each with a *reason* (the reasons are auto-woven into your Phase 2 reply and Phase 3 compilation block).
- **💬 Chat** — optional built-in AI co-writer that knows your playbook, project setup, and line bank. Connect any of: Anthropic key, OpenRouter key (has free models), Google Gemini key (free tier at aistudio.google.com), or a local model (Ollama / LM Studio with `OLLAMA_ORIGINS=*`). Works without any of them via the Write tab's copy-paste prompts.
- **🖼️ Covers** — Write → Phase 6 generates album cover art in-app (Gemini or OpenRouter key), with vocal-type chips (male/female/duet/instrumental) that rewrite the style tags.
- **🎧 Preview** — the Tag tab has a play button per song, straight from your Suno Downloads.
- **Suno itself has no public API yet** (they announced an early-access developer program July 2026), so generating/streaming inside the app isn't possible officially yet — the Phase 6 copy buttons are the safe bridge until their API ships.
- **🎨 Styles** — a library of Suno "Style of Music" presets. Harvest styles from your past Suno downloads' JSON, extract a style from any track/OST name via AI ("SH3 *Letter from the Lost Days*" → Suno-safe descriptive tags, since Suno rejects artist names), or write your own. One tap applies a preset to the current song. Write → Phase 6 packages the final lyrics + style with Suno's character limits checked.
- **🏷️ Tag** — point it at your `Suno Downloads` folder; it embeds cover art, full lyrics, album, artist, year, and style tags into the MP3s and writes clean copies into a library folder, organized by album. Handles the extension's zip outputs and fixes text-encoding glitches. Originals never touched. (Desktop Chrome/Edge only — phones can't access folders.)
- **📖 Playbook** — your process doc, editable in-app. Each person can rewrite it for their own style.
- **⚙️ Setup** — artist name, API key, rename/delete songs, export/import backup.

## Running it locally (this PC)

Double-click **`Start SongForge.bat`** (needs Python installed). It opens http://localhost:8642.

## Putting it online (recommended — enables phones, offline, and sharing)

Host the folder anywhere that serves static files over HTTPS. Easiest free option, GitHub Pages:

1. Create a GitHub account (if needed), make a new **public** repo, e.g. `songforge`.
2. Upload everything in this folder (drag & drop works on github.com).
3. Repo → Settings → Pages → Source: `main` branch, root. Save.
4. Your app is live at `https://<username>.github.io/songforge/` in ~a minute.

Then on any phone/tablet/PC, open that URL and **install it**:
- iPhone: Safari → Share → *Add to Home Screen*
- Android: Chrome → menu → *Install app*
- PC: install icon in the address bar

After the first load it works fully offline. Send the same URL to your sister — her songs, playbook edits, and settings live only on her devices, completely separate from yours.

## Notes

- Data lives in the browser's local storage per device. Use **Setup → Export** to back up or move between devices.
- The Anthropic API key (if you add one) is stored only on that device and is excluded from imports.
- The Tag tab needs Chrome or Edge on desktop (it uses the File System Access API).
