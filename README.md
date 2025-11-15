# Mystic Narratives AI: Your Automated Podcast & Video Studio

<div align="center">
  <img src="https://storage.googleapis.com/gemini-prod/static/634f18635905f85072053965_mystic-narratives-banner.png" alt="Mystic Narratives AI Banner" width="800">
</div>

<p align="center">
  <strong>From a single idea to a fully produced, multi-chapter podcast or video in minutes.</strong>
  <br />
  AI-powered writing, narration, sound design, and video assembly—all in your browser.
</p>

---

## Table of Contents

- [Overview](#overview)
- [Key Features](#key-features)
- [Architecture Deep Dive](#architecture-deep-dive)
  - [The Multi-Queue System: Performance by Design](#-the-multi-queue-system-performance-by-design)
  - [Reliability Mechanisms](#-reliability-mechanisms)
- [Technology Stack](#technology-stack)
- [Getting Started](#getting-started)
- [Configuration](#configuration)
- [Roadmap & Future Enhancements](#-roadmap--future-enhancements)
- [Development & Contribution](#development--contribution)
- [Troubleshooting & FAQ](#troubleshooting--faq)
- [License](#license)

---

## Overview

**Mystic Narratives AI** is a sophisticated, client-side web application that automates the entire creative workflow for producing narrative media. It empowers a single user to generate a complete media package—including a multi-chapter script, multi-character voice-overs, background music, contextual sound effects, and a final, fully assembled MP4 video—based on just a single topic.

This tool is engineered for YouTube creators, marketers, educators, and hobbyists who need to produce high-quality, atmospheric content with maximum speed and minimal overhead. The AI acts as your co-writer, voice actor, sound designer, and video editor, turning a concept into a finished product in minutes.

---

## Key Features

### ✒️ AI-Powered Content Pipeline
- **Automated Scriptwriting:** Generates multi-chapter scripts with unique characters, drawing facts from Google Search or a user-provided knowledge base.
- **Creative & Documentary Modes:** Choose between a fact-based documentary style or a captivating narrative inspired by masters of suspense like Stephen King and H.P. Lovecraft.
- **YouTube Optimization:** Automatically generates multiple clickable titles, SEO-optimized descriptions, and relevant keywords for your video.

### 🔊 Automated Audio Production
- **Multi-Voice Narration:** Utilizes Google's latest TTS models to assign distinct, natural-sounding voices to each character in the script.
- **AI-Driven Music Selection:** Intelligently analyzes the script's mood to find and suggest royalty-free background music from the Jamendo API.
- **Contextual Sound Effects:** Automatically identifies cues in the script and searches the vast Freesound.org library for relevant SFX to enhance the atmosphere.

### 🖼️ Advanced Visuals Engine
- **AI-Generated Image Prompts:** Creates detailed, cinematic prompts for each scene based on the script's content.
- **Hybrid Image Generation:** Uses Google's `Imagen` model to generate images, with an automatic, seamless fallback to high-quality stock photos from **Unsplash** and **Pexels** if the AI service is unavailable.
- **AI-Designed Thumbnails:** Proposes multiple high-CTR YouTube thumbnail designs in the style of top creators, which can be edited and exported.

### 🎥 "Bulletproof" Video Assembly
- **Client-Side Rendering:** Assembles the final MP4 video directly in your browser using **FFmpeg.wasm**, combining audio, images, and subtitles. No server-side processing is needed.
- **Automatic Subtitles:** Generates and burns subtitles directly into the video from the script content.
- **Dynamic "Ken Burns" Effect:** Applies a subtle zoom and pan effect to static images to create a dynamic, engaging visual experience.
- **Placeholder Protection:** If an image fails to load for any reason (e.g., it's broken or unavailable), it is automatically replaced with a placeholder, **guaranteeing that video generation never fails**.

---

## Architecture Deep Dive

This is a **purely client-side application** with serverless functions acting as secure proxies for third-party APIs that do not support CORS.

### ⚡ The Multi-Queue System: Performance by Design

The application's core is its parallel processing architecture. Instead of a single, slow queue, it uses three independent, specialized queues to process API requests concurrently. This ensures that slow tasks (like image generation) never block faster ones (like audio synthesis), dramatically reducing total project generation time.

```plaintext
User Topic
     │
     └───▶ [Phase 1: Sequential Script Generation] ───────▶ All Scripts Ready
                 (Fast Text Queue: 1.5s delay/request)
                                                                 │
           ┌─────────────────────────────────────────────────────┴────────────────────────────────────────────────────┐
           │                                                                                                           │
     ▼ [Phase 2: Parallel Asset Generation] ▼                                                                    ▼ [Phase 2: Parallel Asset Generation] ▼
   [Audio Generation for All Chapters]                                                                         [Image Generation for All Chapters]
   (Fast Audio Queue: 1.5s delay/request)                                                                      (Slow Image Queue: 65s delay/request)
           │                                                                                                           │
           └─────────────────────────────────────────────────────┬────────────────────────────────────────────────────┘
                                                                 │
                                                           ▼ [Final Assembly] ▼
                                                         (FFmpeg.wasm in Browser)
                                                                 │
                                                         ▼ Final MP4 Video ▼
```

### 🛡️ Reliability Mechanisms

- **"Circuit Breaker" Pattern:** Automatically detects if the Gemini image generation API is failing repeatedly. After 3 consecutive failures, it "trips the breaker" for 5 minutes, instantly redirecting all image requests to the stock photo fallback to prevent user frustration and wasted time. The status is visible in the settings panel.
- **Intelligent API Retries:** Implements an exponential backoff with jitter strategy for all API calls. This gracefully handles temporary issues like rate limits (`429`) or server overloads (`503`), ensuring maximum resilience.
- **"Bulletproof" Video Generation:** The video rendering pipeline is designed to be completely resilient. Before rendering, every image is validated. If an image is broken, unavailable, or fails to load, it is **automatically replaced** with a gray placeholder, guaranteeing that a video is always produced.

---

## Technology Stack

- **Frontend:** React, TypeScript, Tailwind CSS
- **Media Engine:** FFmpeg.wasm (for video), Web Audio API (for audio mixing)
- **AI Services:** Google Gemini (`gemini-2.5-flash-lite`, `imagen-4.0-generate-001`, `gemini-2.5-flash-preview-tts`)
- **Stock Photos:** Unsplash, Pexels (via serverless proxy)
- **Audio Libraries:** Jamendo (music), Freesound (SFX) (via serverless proxy)

---

## Getting Started

### Prerequisites
- Node.js (v18 or higher)
- npm or yarn

### Installation & Launch
1.  **Clone the Repository:**
    ```sh
    git clone https://github.com/crosspostly/youtube_podcast.git
    cd youtube_podcast
    ```

2.  **Install Dependencies:**
    ```sh
    npm install
    ```

3.  **Run the Full Development Environment:**
    This command starts both the Vite frontend server and the local Express API proxy server concurrently.
    ```sh
    npm run dev:full
    ```
    - The application will be available at `http://localhost:5173` (or another port if 5173 is busy).
    - The local API proxy runs on `http://localhost:3000`.

---

## Configuration

API keys are required for the application to function correctly. While default, rate-limited keys are provided for some services, using your own is highly recommended for stability.

1.  **Obtain Your API Keys:**
    - **Google Gemini:** Essential for all AI features. Get a key from [Google AI Studio](https://aistudio.google.com/app/apikey).
    - **Freesound:** For sound effects. Create an app on the [Freesound Developers](https://freesound.org/docs/api/) page.
    - **Unsplash & Pexels:** For stock photo fallbacks. Get keys from their respective developer portals.

2.  **Enter Keys in the UI:**
    - Click the **Settings (key) icon** in the top-right corner of the application.
    - Enter your keys in the respective tabs.
    - All settings are saved securely in your browser's `localStorage`.

---

## 🚀 Roadmap & Future Enhancements

This project has a solid foundation, but there are several key architectural improvements planned to further enhance performance and user experience.

### Phase 1: UI & Performance Decoupling
- **Move FFmpeg to a Web Worker:** Isolate the entire video rendering process in a background thread. This will prevent the UI from freezing during intensive operations, ensuring the application remains responsive at all times.
- **Implement AbortController for Cancellation:** Add a robust cancellation mechanism to safely terminate the FFmpeg process if the user decides to cancel video generation.

### Phase 2: Advanced Caching & Loading
- **Progressive WASM Loading:** Implement caching for heavy `.wasm` files using a Service Worker. This will dramatically speed up subsequent video renders by eliminating the need to re-download the FFmpeg core.
- **Batch Image Processing:** Optimize memory usage by processing images in batches (e.g., 3-4 at a time) instead of loading all of them into memory at once, reducing the risk of browser crashes on low-RAM devices.

### Phase 3: Diagnostics & Adaptability
- **Device Capability Detection:** Automatically detect user's hardware capabilities (`navigator.deviceMemory`, `hardwareConcurrency`) to adapt performance settings, such as FFmpeg presets (`ultrafast` vs. `fast`) and image batch sizes.
- **Enhanced Diagnostics Panel:** Provide users with clear information about their device's capabilities and offer recommendations for optimal performance.

### Phase 4 (Future): Hybrid Architecture
- **Optional Server-Side Rendering Backend:** For "power users" or very long projects, implement an optional backend (e.g., using Cloud Run or Vercel Functions) to offload the most intensive FFmpeg tasks from the browser.

---

## Development & Contribution

We welcome contributions! Please follow these guidelines:

1.  **Fork and Branch:** Create a new branch from `main` for your feature or fix.
2.  **Atomic Commits:** Write clear, concise, and atomic commits. Use conventional commit messages (e.g., `feat:`, `fix:`, `docs:`).
3.  **Update Documentation:** Any changes to features, configuration, or architecture must be reflected in this README.
4.  **Submit a Pull Request:** Reference any related issues and provide a clear description of your changes and how to test them.

For more details, see [`CONTRIBUTING.md`](./CONTRIBUTING.md).

---

## Troubleshooting & FAQ

- **I'm getting `429 Too Many Requests` errors.**
  This is expected when using the shared default API keys. The app's built-in retry logic will handle it, but for a better experience, please use your own API keys.

- **Video generation is slow or freezes.**
  Video rendering is computationally intensive and happens entirely in your browser. Ensure you have sufficient RAM (8GB+ recommended) and are using a modern browser like Chrome or Firefox. Close other heavy tabs for best performance. The planned move to a Web Worker (see Roadmap) will solve UI freezing.

- **Can I customize the generated content?**
  Yes! Every asset (script line, SFX, music track, image) can be individually reviewed and regenerated from the Podcast Studio view.

For more, see the detailed [`FAQ.md`](./FAQ.md).

---

## License

This project is licensed under the MIT License. See the [LICENSE](./LICENSE) file for details.
