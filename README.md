<p align="center">
  <img src="https://img.shields.io/badge/Moirah_AI-7C3AED?style=for-the-badge&logoColor=white" alt="Moirah AI" height="40" />
</p>

<h1 align="center">Moirah AI</h1>

<p align="center">
  <strong>The AI copilot no one else can see.</strong>
</p>

<p align="center">
  Open-source, privacy-first AI screen & meeting copilot with a dedicated interview mode.<br>
  Designed to be excluded from screen capture, powered by OpenRouter, OpenAI, Google Gemini, or your local Codex plan. Bring your own key.
</p>

<p align="center">
  <a href="#features">Features</a> &bull;
  <a href="#installation">Installation</a> &bull;
  <a href="#quick-start">Quick Start</a> &bull;
  <a href="#architecture">Architecture</a> &bull;
  <a href="#contributing">Contributing</a> &bull;
  <a href="#license">License</a>
</p>

<p align="center">
  <img src="https://img.shields.io/github/license/hariom710/Moirah-AI?style=flat-square" alt="License" />
  <img src="https://img.shields.io/badge/electron-33+-47848F?style=flat-square&logo=electron" alt="Electron" />
  <img src="https://img.shields.io/badge/react-18-61DAFB?style=flat-square&logo=react" alt="React" />
  <img src="https://img.shields.io/badge/typescript-5-3178C6?style=flat-square&logo=typescript" alt="TypeScript" />
  <img src="https://img.shields.io/badge/providers-4-7C3AED?style=flat-square" alt="AI providers" />
</p>

---

## What is Moirah AI?

Moirah AI is a desktop application that overlays AI-powered assistance on your screen during meetings, interviews, and work sessions. The overlay is **designed to be excluded from screen capture** on supported Windows and macOS configurations, so in practice only you can see it — but behavior depends on the OS, your compositor, and the meeting software.

- Reads your screen via OCR and transcribes meeting audio in real time
- Sends context to your chosen AI provider — OpenRouter (500+ models), OpenAI, Google Gemini, or your local Codex plan
- Streams responses into a translucent overlay that stays on top of all windows
- Interview mode: grounds every answer in a pasted job description + your CV, with DSA/coding presets
- Runs locally -- no data leaves your machine except the AI API call

Think of it as a free, open-source, privacy-first alternative to Cluely.

---

## Features

### Capture-Excluded Overlay
- Transparent, always-on-top window with glass morphism styling
- Excluded from screen capture on Windows (`WDA_EXCLUDEFROMCAPTURE`) and macOS (`type: 'panel'` + screen-saver level). Effectiveness depends on the OS, compositor, and meeting software — verify it yourself before relying on it
- Draggable, collapsible to a small pill when not in use

### Screen Reading (OCR)
- Captures your screen on demand via global hotkey
- Extracts text using Tesseract.js OCR in a worker thread (non-blocking)
- Smart context: sends screen text as part of your AI prompt

### Live Audio Transcription
- Records microphone audio in real time via the Web MediaRecorder API
- Transcribes every 10 seconds using configurable Whisper provider (Groq, OpenAI, or custom endpoint)
- Rolling transcript buffer (last ~60s of conversation) fed into AI context

### AI Providers
- Four providers, switchable in Settings — bring your own key:
  - **[OpenRouter](https://openrouter.ai)** — 500+ models (GPT, Claude, Gemini, Llama, DeepSeek) with one key
  - **Google Gemini** — free-tier friendly keys from Google AI Studio; `gemini-2.5-flash` / `2.5-pro` / `2.0-flash`, all with screenshot vision
  - **OpenAI** — direct Platform API credits
  - **Codex Plan** — uses your local Codex CLI login (ChatGPT Plus/Pro), no API key needed
- Streaming responses with real-time token count and cost display
- Configurable system prompt and model selection

### Interview & DSA Copilot
- **Interview mode**: paste a job description + your CV (text or PDF) — every answer is grounded in your real experience, with a JD↔CV keyword match preview
- **Voice auto-answer**: detected interview questions are answered automatically in first person while you record
- **Prompt presets**: DSA/Coding, System Design, Behavioral (STAR), HR, Meeting Notes
- **DSA mode + coding language picker**: answers arrive as approach → code (C++, Python, Java, Go, …) → complexity → edge cases

### Safety & Privacy Controls
- **Panic hide** (`Ctrl+Shift+H`): instantly hide the overlay at any moment
- **Auto-hide in meetings** (opt-in): hides the overlay when a meeting app (Zoom/Teams/Meet) moves to the foreground — best-effort foreground-window-title heuristic, not true screen-share detection. Once hidden it **stays hidden** until you re-show it or turn the setting off; it is never auto-restored just because the meeting window lost focus
- Screen-capture exclusion: Windows `WDA_EXCLUDEFROMCAPTURE` FFI, macOS panel/screen-saver level

### Productivity
- **Quick follow-up actions**: one-click chips after every answer (Explain simpler / More detail / Bullet summary / Key takeaways)
- **Session export**: export any conversation as Markdown from History
- **Playbooks**: inject context documents (meeting prep, JDs, notes) into every prompt

### Dashboard
- Settings: provider + API keys, overlay opacity, hotkeys, system prompt, meeting auto-hide
- Models: browse and select models per provider
- Interview: JD/CV profile, interview mode, presets, DSA mode, coding language
- Playbooks: manage your context documents
- History: browse, revisit, and export past conversations

### Global Hotkeys
| Shortcut | Action |
|---|---|
| `Ctrl+Enter` / `Cmd+Enter` | Ask AI with current context |
| `Ctrl+Shift+Enter` / `Cmd+Shift+Enter` | Ask AI with screenshot |
| `Ctrl+\` / `Cmd+\` | Toggle overlay visibility |
| `Ctrl+Shift+Space` / `Cmd+Shift+Space` | Toggle audio recording |
| `Ctrl+Shift+H` / `Cmd+Shift+H` | **Panic hide** — instantly hide the overlay |

---

## Installation

### Download Pre-Built Binaries

Download the latest release for your platform from the [Releases](https://github.com/hariom710/Moirah-AI/releases) page:

| Platform | Format |
|---|---|
| Windows | `.exe` (NSIS installer) or portable `.exe` |
| macOS | `.dmg` (Intel & Apple Silicon) |
| Linux | `.AppImage` or `.deb` |

### Build from Source

**Prerequisites:** Node.js 18+ and npm

```bash
# Clone the repository
git clone https://github.com/hariom710/Moirah-AI.git
cd Moirah-AI

# Install dependencies
npm install

# Run in development mode
npm run dev

# Build for your platform
npm run build:win     # Windows
npm run build:mac     # macOS
npm run build:linux   # Linux
```

---

## Quick Start

1. **Launch Moirah AI** -- the setup wizard walks you through provider + key selection; the overlay appears in the top-right corner of your screen
2. **Pick a provider:**
   - **OpenRouter** — get a free key at [openrouter.ai/keys](https://openrouter.ai/keys)
   - **Google Gemini** — get a free-tier key at [aistudio.google.com/apikey](https://aistudio.google.com/apikey) (recommended if you want free + vision)
   - **OpenAI** — a Platform API key at [platform.openai.com/api-keys](https://platform.openai.com/api-keys)
   - **Codex Plan** — no key needed; uses your local Codex CLI login
3. **Select a model** -- `google/gemini-3-flash-preview` (OpenRouter) or `gemini-2.5-flash` (Gemini) for speed
4. **Use it:**
   - Type a question in the overlay and press Enter
   - Press `Ctrl+Enter` to ask with screen context
   - Press `Ctrl+Shift+Enter` to include a screenshot
   - Press `Ctrl+Shift+Space` to start/stop audio transcription
   - Press `Ctrl+Shift+H` to panic-hide the overlay
   - Interview? Open Dashboard > Interview, paste the JD + CV, turn on Interview Mode

---

## Architecture

```
moirah-ai/
  src/
    main/                     Electron main process
      index.ts                App entry, window management
      overlay-window.ts       Capture-excluded overlay BrowserWindow
      dashboard-window.ts     Settings dashboard window
      screen-capture.ts       Screenshot + OCR dispatch
      ocr-worker.ts           Tesseract OCR in worker thread
      audio-capture.ts        Mic recording + Whisper transcription
      hotkey-manager.ts       Global keyboard shortcuts (incl. panic hide)
      foreground.ts           Foreground window title (koffi FFI / osascript)
      meeting-guard.ts        Opt-in meeting-app auto-hide heuristic
      tray.ts                 System tray menu
      ipc-handlers.ts         IPC bridge (main <-> renderer)

    preload/
      index.ts                Context-isolated IPC bridge

    renderer/
      overlay/                Transparent overlay UI (React)
        App.tsx               Main overlay logic
        ResponseCard.tsx      AI response rendering (markdown)
        TranscriptBar.tsx     Live transcript display

      dashboard/              Settings dashboard UI (React)
        App.tsx               Dashboard shell with sidebar
        pages/
          Settings.tsx        API key, opacity, hotkeys
          Models.tsx          Model browser/selector
          Playbooks.tsx       Context document manager
          History.tsx         Conversation history

    services/
      openrouter.ts           OpenRouter API client (streaming)
      openai-api.ts           OpenAI Responses API client (streaming + vision)
      gemini-api.ts           Google Gemini REST client (streaming + vision)
      codex.ts                Codex CLI integration
      presets.ts              Prompt presets + coding-language picker
      context-builder.ts      Prompt assembly (screen + audio + query + interview)
      store.ts                Persistent settings (electron-store, keys encrypted)

    shared/
      types.ts                TypeScript interfaces
      constants.ts            App constants and defaults
      ipc-channels.ts         IPC channel name registry
```

### Data Flow

```
Screen -> screenshot-desktop -> Tesseract.js (worker thread) -> OCR text -\
                                                                           |-> context-builder (+ interview grounding + presets)
Microphone -> MediaRecorder API -> Whisper (Groq/OpenAI/custom) -> transcript text ---/        |
                                                                                     provider dispatch
                                                                                  (OpenRouter / OpenAI / Gemini / Codex)
                                                                                               |
                                                                                               v
                                                                                    streaming response -> overlay
```

### Privacy Model

- **All processing is local** except the AI calls you trigger
- OCR text and transcript are sent to your chosen AI provider only when you trigger a query
- **Raw microphone audio is sent to your transcription provider** (Groq / OpenAI / your custom Whisper endpoint) while recording — transcription cannot happen without it
- **Screenshots are sent to vision-capable models** (OpenRouter vision models, direct OpenAI) when screen context is enabled; text-only backends receive OCR text only
- No telemetry, no analytics, no data collection, no servers of ours
- API keys are encrypted locally via Electron `safeStorage` (OS keychain on macOS, DPAPI on Windows, libsecret on Linux) when the OS store is available
- Conversations, playbooks, and interview profiles are stored locally on your machine — use Clear/Delete controls to remove them

---

## Recommended Models

| Model | Speed | Quality | Cost |
|---|---|---|---|
| `google/gemini-flash-1.5` | Very fast | Good | ~$0.075/$0.30 per 1M tokens |
| `anthropic/claude-3-haiku` | Fast | High | ~$0.80/$4 per 1M tokens |
| `deepseek/deepseek-chat` | Fast | High | ~$0.14/$0.28 per 1M tokens |
| `meta-llama/llama-3.1-8b-instruct:free` | Medium | Decent | Free |

Browse all 500+ models at [openrouter.ai/models](https://openrouter.ai/models).

---

## Platform Notes

### macOS
- Overlay requests exclusion from screen share via `setAlwaysOnTop(true, 'screen-saver')` + `type: 'panel'`
- Requires Screen Recording permission (System Settings > Privacy > Screen Recording)
- Requires Microphone permission for audio transcription
- Works on both Intel and Apple Silicon

### Windows
- Overlay requests exclusion from screen share via `SetWindowDisplayAffinity(WDA_EXCLUDEFROMCAPTURE)`
- Moirah hides the overlay briefly when capturing so your own screenshots still include the rest of the screen
- Packaged builds capture with Electron `desktopCapturer` (with `screenshot-desktop` as fallback)
- No special permissions required

### Linux
- Screen capture exclusion is limited and depends on your compositor
- Wayland support varies; X11 works more reliably
- AppImage is recommended for widest compatibility

---

## Comparison with Cluely

| Feature | Cluely | Moirah AI |
|---|---|---|
| Price | $20-49/month | **Free** |
| Source code | Closed | **Open source (MIT)** |
| AI backend | Proprietary | **OpenRouter / OpenAI / Gemini / Codex plan** |
| Data privacy | Cloud-dependent | **Local-first** |
| Model choice | Fixed | **Any model on OpenRouter, Gemini, or OpenAI** |
| Interview mode (JD/CV grounding) | Paid | **Built-in, free** |
| Customization | Limited | **Full system prompt control + presets** |
| Playbooks | Paid feature | **Built-in, free** |
| Self-hosting | No | **Yes** |

---

## Development

```bash
# Start in development mode with hot reload
npm run dev

# Type check
npm run typecheck

# Build renderer + main process
npm run build

# Build distributable for current platform
npm run build:win     # or build:mac / build:linux

# Build unpacked directory (for testing)
npm run build:unpack
```

### Environment Variables

Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```

The app stores the API key in its Settings UI via `electron-store`, so `.env` is optional and only needed if you want to set it at build time.

---

## Contributing

We welcome contributions! See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

**Quick overview:**
1. Fork the repo
2. Create a branch (`feat/my-feature`)
3. Make your changes
4. Run `npm run typecheck && npm run build` to verify
5. Open a Pull Request

---

## Known Limitations

- **Whisper transcription** supports Groq (fastest, recommended), OpenAI, and custom endpoints. Configure the provider and API key in Settings.
- **Vision screenshots** require a vision-capable model (Gemini, Claude, Llama 4, GPT-4o, etc.). Text-only models still receive OCR text when it is available.
- **Meeting auto-hide** is a best-effort heuristic: it polls the foreground window title every 2 seconds and matches known meeting apps (Zoom, Teams, Meet, Webex, …). It is **not** true screen-share detection and can miss or mis-trigger — on macOS it only sees the frontmost *application name*, so a Meet/Zoom call running inside a browser is not detected, and on Linux it is unsupported. Once it hides the overlay, the overlay **stays hidden** until you explicitly re-show it (toggle hotkey or tray) or disable the setting; it deliberately does not restore itself when the meeting loses focus, to avoid re-showing the overlay mid-share. Treat `Ctrl+Shift+H` (panic-hide) as the primary safety mechanism, not this feature.
- **Linux screen share exclusion** is unreliable on Wayland compositors.

---

## License

[MIT](LICENSE) -- free for personal and commercial use.

This project is a derivative of **[Specter-AI](https://github.com/umairinayat/Specter-AI)** by Umair Inayat (MIT). See [LICENSE](LICENSE) for the full copyright notice.

---

<p align="center">
  Built with Electron, React, TypeScript, and a healthy disregard for subscription fees.
</p>
