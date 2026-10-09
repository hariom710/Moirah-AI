# Changelog

All notable changes to Moirah AI are documented in this file.

## [1.6.0] - 2026-10-08

First release as **Moirah AI** — a rebrand and feature release based on Specter-AI 1.5.0 (MIT, by Umair Inayat).

### Added
- **Google Gemini provider**: direct Google AI Studio REST client with streaming + screenshot vision (`gemini-2.5-flash`, `gemini-2.5-pro`, `gemini-2.0-flash`), free-tier friendly key setup in the wizard and Settings, key auto-detection (`AIza…`), encrypted key storage, cost tracking
- **Prompt presets**: DSA/Coding, System Design, Behavioral (STAR), HR, and Meeting Notes presets on the Interview page — composed with the base prompt, interview grounding, and the immutable trust policy
- **DSA mode + coding-language picker**: force the DSA preset and choose the answer language (C++, C, Python, Java, JavaScript, TypeScript, Go, Rust, Kotlin, Swift); answers arrive as approach → code → complexity → edge cases
- **Panic hide hotkey** (`Ctrl+Shift+H`): instantly hide the overlay; configurable in Settings > Keyboard Shortcuts
- **Auto-hide in meetings** (opt-in): best-effort foreground-window-title heuristic (koffi FFI on Windows, osascript on macOS) that hides the overlay when Zoom/Teams/Meet/Webex/etc. gains focus and restores it when focus leaves — edge-triggered so manual re-shows are honored; documented as not-true-share-detection
- **Quick follow-up actions**: one-click chips after every answer (Explain simpler, More detail, Bullet summary, Key takeaways)
- **Session export**: export any conversation as Markdown via save dialog from History (per-row and detail view)
- New app icon: geometric "M" monogram with violet→cyan gradient
- Regression tests: Gemini SSE parsing + request building, Gemini key detection (59 tests total)

### Changed
- Full rebrand Specter AI → **Moirah AI** (`com.moirah.ai`, `moirahAPI` bridge, `--moirah-*` CSS vars, artifact names `moirah-*`)
- Onboarding skip-check and provider docs updated for the new provider set

### Notes
- MIT attribution preserved: derived from Specter-AI by Umair Inayat (see LICENSE)

## [1.5.0] - 2026-09-22

### Added
- Interview Profile (Dashboard > Interview): company + role, job description paste (20k chars), CV/resume paste or PDF/TXT upload, Interview Mode toggle, voice auto-answer toggle. Includes JD↔CV keyword match preview so you can see grounding coverage before the call
- Voice auto-answer: while the overlay mic is recording, each transcribed chunk is checked for interview questions and answered automatically in first person from your CV, mirroring JD language. 8s cooldown + duplicate detection, garbled audio returns "No question detected." Overlay status bar shows interview target, listening state, and last heard question
- JD/CV-grounded prompts: job description + resume are injected ahead of screen/transcript context (system prompt + user message) whenever Interview Mode is on; answers never invent jobs, dates, or skills not on the resume
- Regression tests for question detection, last-question extraction, and JD/CV grounding order

## [1.4.0] - 2026-08-27

### Added
- First-run setup wizard: provider selection (OpenRouter / OpenAI / Codex plan), API key validation with auto-detection (sk-or-/sk-proj-/legacy sk-), model picker with curated choices per provider, live end-to-end test query, hotkey walkthrough. Skippable via "Skip" — re-runnable from the tray menu ("Run Setup Wizard")
- Auto-update: silent background checks against GitHub Releases every 6 hours, with an overlay restart toast (confirms before restarting during active recording)
- Download website (/site): OS auto-detecting download button (incl. Apple Silicon via User-Agent Client Hints), mobile routing, install walkthroughs, FAQ. Deploys via GitHub Actions (site.yml) with Pages enablement
- Windows CI code-signing support via WINDOWS_CSC_LINK / WINDOWS_CSC_KEY_PASSWORD secrets (unsigned path unchanged when secrets absent)
- Stable, version-less release artifact names: moirah-setup.exe, moirah-portable.exe, moirah-mac-{arch}.zip, moirah-linux-{arch}.AppImage/.deb — permanent download links
- Codex CLI detection util and API-key provider detection util, unit tested
- Vitest test infrastructure; tests run in CI alongside typecheck

## [1.3.0] - 2026-08-23

### Added
- Send live screenshots to vision-capable OpenRouter models instead of relying only on OCR text
- Windows NSIS installer and portable `.exe` artifacts with distinct filenames
- Overlay error when screen capture fails, instead of silently sending empty context

### Changed
- Screen capture now uses Electron `desktopCapturer` first so packaged Windows builds work without external screenshot binaries
- OCR is best-effort: a Tesseract failure no longer drops the screenshot
- Native modules (`koffi`, `tesseract.js`, `screenshot-desktop`) are unpacked from the asar archive

### Fixed
- Packaged `.exe` builds failing to take screenshots
- Send doing nothing when a screenshot was attached with no typed question
- Active-window crop depending on the `sharp` devDependency, which is missing in production
