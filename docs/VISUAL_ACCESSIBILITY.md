# Visual Standards for 50+ Audience

Design every export for living-room viewing on large screens 2–3 meters away. The guidelines below ensure subtitles, imagery, and thumbnails remain accessible for the 50–70 year-old Tier 1 audience.

## Subtitles
- **Font:** Arial Bold (100% uppercase not required, but weight must stay bold)
- **Size:** 32 px minimum
- **Color:** Pure white `#FFFFFF`
- **Outline:** 3 px solid black stroke (ASS/FFmpeg `Outline=3`)
- **MarginV:** 60 (keeps captions above system controls)
- **Bold:** `1` in ASS/FFmpeg style to enforce weight
- **Timing:** ≥1.5 seconds per card, max 15 characters per second
- **Line Handling:** Prefer max 2 lines; wrap manually for readability; avoid crowding the bottom third.

## Background Images & Pacing
- **Minimum On-Screen Duration:** 5 seconds per still (Week 3 requirement)
- **Transition Style:** Gentle dissolve/fade only; avoid flashy wipes
- **Contrast:** Ensure main focal point remains visible under overlayed captions
- **Color Palette:** Rich, mature tones (navy, burgundy, deep green, charcoal). Avoid neon or high-saturation gradients that fatigue eyes
- **Detail Level:** Favor high-resolution photography or tasteful AI art with clear focal subjects; remove background clutter that competes with subtitles

## Thumbnail & Title Cards
- **Typography:** Serif or stately sans-serif (e.g., EB Garamond, Playfair, Cormorant, Source Serif)
- **Text Limit:** ≤4 words; no clickbait (“You won’t believe”)
- **Case:** Title Case or Sentence Case; never ALL CAPS
- **Color Pairings:** Navy + Gold, Charcoal + Ivory, Deep Green + Copper; ensure WCAG AA contrast
- **Subject Matter:** Mature protagonists, archival assets, documents, maps; no meme imagery
- **Eye Trace:** Place subject on rule-of-thirds intersections, with text opposite for balance

## Chapter Signposting & Lower Thirds
- **Position Markers:** Include tasteful on-screen cards at ~12, 25, 38-minute marks referencing current segment (e.g., “Chapter 3 · Pattern Recognition”)
- **Lower Thirds:** Use same subtitle palette, 85% opacity background, and large body text (min 36 px) if contextual labels are needed

## Validation Checklist
- [ ] Subtitle sample tested on 55" TV from 3m distance (clear & legible)
- [ ] Each background image displayed ≥5 seconds
- [ ] High-contrast safe zone maintained around captions
- [ ] Thumbnail preview passes readability test at 15% scale
- [ ] Signposting cards feel calm, not flashy

## Implementation References
- `services/chapterPackager.ts` — subtitle style + image duration floor
- `docs/PRE_PUBLISH_CHECKLIST.md` — operational QA list for every upload
- `docs/AUDIO_GUIDELINES.md` — complementary audio standards to pair with these visuals

Following these guardrails ensures senior viewers experience comfortable, trustworthy storytelling without visual fatigue.
