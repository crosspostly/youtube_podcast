# AI Podcast Studio: From Idea to Media in Minutes

---

> **🚀 Next-Gen Creative Workflow Powered by AI: Automate writing, narration, sound, and visuals—all in your browser. Remix. Direct. Launch.**

## Table of Contents
- [Overview](#overview)
- [Key Features](#key-features)
- [Architecture](#architecture)
- [Quick Start](#quick-start)
- [Configuration](#configuration)
- [Usage Examples](#usage-examples)
- [Development & Structure](#development--structure)
- [Advanced: API Keys & Limits](#advanced-api-keys--limits)
- [Contribution](#contribution)
- [License](#license)
- [FAQ](#faq)

---

## Overview
AI Podcast Studio transforms how you create podcasts, audiobooks, and narrative media. It's a full-featured **client-side web app**: generate scripts, voice-overs, music, SFX, and videos—with just a topic and your taste.

- Democratize storytelling: **AI is your writer, voice actor, composer, and video editor.**
- From YouTube creators and marketers to hobbyists—**launch media projects with a single person, minimal gear, and unmatched speed**.
- Every piece is **remixable**: tweak dialogue, swap music/SFX/images, edit at every step.

---

## Key Features

- **AI Scriptwriting:** Fact-checked, multi-chapter scripts with unique characters, creative or documentary styles, and embedded cues for SFX/music/imagery.
- **AI Voice Acting:** Natural voices assigned per character (Google Gemini TTS and more). Supports both multi-actor dialogue and classic monologue.
- **Soundtrack/SFX Automation:** Jamendo API for royalty-free music; Freesound for global SFX. AI-generated search tags maximize match rate and variety.
- **Visuals Pipeline:** AI generates image prompts for each scene/chapter; get themed thumbnails and viral covers fully styled.
- **Automatic Video Assembly:** Generate MP4 videos from your scripts, images, and audio—complete with subtitles and Ken Burns dynamic effects.
- **Resumable Projects:** Save/load complete project state (text, audio, images, etc.) locally, edit and relaunch anytime.
- **Rate-Limit Handling:** Smart backoff/retry for API limits—never hang; see UI feedback and control tuning in real time.
- **Testing/Diagnostics:** Dedicated panels for visual/musical/SFX rounds of testing, quick resets, and advanced fault diagnostics.


## Architecture

- **Frontend:** React, TypeScript, Tailwind CSS.
- **Media:** All video/serverless assembly via FFmpeg.wasm, Web Audio API, browser APIs only.
- **AI:** Google Gemini (multi-modal) with Unsplash & Pexels stock photo fallbacks. All AI runs via secure cloud endpoints.
- **Music:** Jamendo API — global, legal, royalty-free tracks.
- **SFX:** Freesound API — world’s largest open sound effect library. Batch + prompt-optimized querying.

```
User Topic/Knowledge Base
      ↓
 [AI Script Gen]
      ↓
 [Per-chapter: Images, Music, SFX searchTags]
      ↓
 [Voice/Speech Synthesis] + [SFX/Music Download]
      ↓
 [Audio/Video Assembly (FFmpeg.wasm)]
      ↓
User Review/Remix ➔ Export (MP3, MP4)
```

See [`docs/ENHANCED_429_HANDLING.md`](docs/ENHANCED_429_HANDLING.md) for advanced rate-limit & backoff.

---

## Quick Start

1. **Obtain API Keys**: Google Gemini (essential), Jamendo & Freesound (optional, built-in fallback keys limited).
2. **Clone & Launch**:
    ```sh
    git clone https://github.com/crosspostly/youtube_podcast.git
    cd youtube_podcast
    npm install
    npm start
    # Or: yarn install && yarn start
    ```
    *For pure browser usage, just open `index.html` in a compatible browser (may need API keys in settings panel).*
3. **Set API Keys**: In-app key icon → enter Gemini/Freesound keys as needed. Own keys = best UX.
4. **Instant Project:** Enter your topic, configure language, style and press generate.

---

## Configuration
- All keys/settings saved per session (localStorage).
- Fallback logic if keys missing—will prompt for access.
- Customizable retry/backoff—edit `config/appConfig.ts` or use UI controls (preferences panel).
- See [`docs/ENHANCED_429_HANDLING.md`](docs/ENHANCED_429_HANDLING.md) for advanced tuning.

---

## Usage Examples
- **Classic Podcast:**
  1. Topic: "История Древнего Египта"
  2. Style: Documentary. Language: Russian or English.
  3. Review chapter-wise, swap music/images/SFX per taste.
  4. Export MP3 or assemble YouTube-ready MP4 instantly.
- **YouTube Viral:**
  1. Topic: "Dark Mysteries of the Amazon"
  2. Creative horror/fantasy mode, dramatic AI voices.
  3. Use the thumbnail editor for ultra-CTR covers.
- **Educational Series:**
  1. Feed in your knowledge base, lock fact mode.
  2. Every asset/quote sourced—no hallucination.
  3. Regenerate single elements (chapter, asset, etc.) without losing project context.

---

## Development & Structure

- **src/services/**: All AI, music, SFX, TTS, video, and image logic. Entry: `ttsService.ts`, `sfxService.ts`, etc.
- **hooks/usePodcast.ts**: Main pipeline and project state management (generation, update, queueing).
- **config/appConfig.ts**: Tunable settings (rate-limits, keys, backoff strategies).
- **components/**: UI components for editor, test panels, modals, etc.
- **test/**: Reliability/unit tests (retry, API fallback, etc.).
- **docs/**: Rate-limit docs, FAQ, advanced guides (batch SFX/searches, contribution tips, etc.).

---

## Advanced: API Keys, Rate Limits, & Quotas
- Streaming models like Gemini2.5-Flash are quota-limited: non-personal keys may hit usage warnings or 429 errors in heavy use. Use your own keys in production.
- **How we handle limits:** on every 429, the app triggers an exponential backoff with jitter—configurable in code/UI (see [`ENHANCED_429_HANDLING.md`](docs/ENHANCED_429_HANDLING.md)).
- Detailed status always visible; retries, delays, and failure cases surfaced via UI-feedback, never silent jams.

---

## Contribution

1. Fork, branch from `main` or latest stable.
2. Write clear, atomic commits. PR titles: feat/fix/chore/refactor + scope.
3. All UI/UX/API/logic/infra must have tests or manual test plans attached.
4. Documentation required for: new features, changed APIs, config tweaks.
5. Standard Github PR review applies. Respect CI build, lint, and test actions.
6. Bugs, issues, use new Issue Template (to be found in `.github/ISSUE_TEMPLATE/`).

See [`CONTRIBUTING.md`].

## License
MIT © [crosspostly](https://github.com/crosspostly)

---

## FAQ
- **How do I reset keys/settings?** Use Settings panel → 'clear all' or manually clear `localStorage`.
- **Can I use my own soundtrack/SFX?** Yes, replace any asset in the chapter editor at any time.
- **What if Gemini is down?** For text generation, the app will show an error and you can retry later. For image generation, automatic fallback to Unsplash & Pexels stock photos ensures you can continue working.
- **Can I export projects/transfers?** Use the export (JSON/MP3/MP4) features; all assets saved client-side, portable.
- **How to tune retries/backoff for custom API keys?** Edit `config/appConfig.ts` or tune via UI controls.

---

## See also
- [docs/ENHANCED_429_HANDLING.md](docs/ENHANCED_429_HANDLING.md) — details/backoff logic.
- `src/services/ttsService.ts`, `src/services/sfxService.ts` — advanced pipeline/practical code.
- [Issue templates and contribution workflow in CONTRIBUTING.md]

---
# Test CI after PR #61 - All critical issues should be fixed now
