# AI Podcast Studio FAQ

## Main Troubleshooting

### I get 429 Too Many Requests. What now?
- The app will automatically throttle requests with exponential backoff and random jitter. 
- Check rate limit status in the UI. On global/shared API keys, use your own Gemini/Freesound/Jamendo keys if possible.
- Heavy users: Tweak retry/backoff logic in `config/appConfig.ts`.

### My Gemini API calls return an error or freeze
- Make sure your API key is active and has sufficient quota.
- See live status and error in the Settings/Debug panel.
- If persistent: the app will automatically fall back to Unsplash & Pexels stock photos for image generation.

### Media/Sound/Image not downloading or being replaced
- Check browser compatibility (recent Chrome/Edge/Firefox recommended)
- Ensure popup blocking, adblock, or firewall settings don’t interfere with downloads/AJAX requests.
- Try clearing LocalStorage via Settings panel if project won’t save/load


## Usage Tips

- **How to customize script, SFX, music or images?**
  - Edit any generated chapter directly—replace or regenerate SFX, music and images via UI controls.
- **I want to export all assets (including project state).**
  - Use export JSON/MP3/MP4 in the editor. All assets stay local, nothing uploaded.
- **Contribution/Feedback:**
  - Open issues or PRs with test/proof steps; see CONTRIBUTING.md.
- **What about licensing?**
  - Music/SFX/image assets are from Jamendo/Freesound (royalty-free), or AI-generated for your creative/commercial use. See each API/site for legal fine print.

---

For advanced documentation, see:

- [README.md](../README.md) — Quickstart, API key setup, advanced configuration
- [CONTRIBUTING.md](../CONTRIBUTING.md)
- [src/services/*](../src/services/) — Core logic and integration points
