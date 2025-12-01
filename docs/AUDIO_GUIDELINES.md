# Audio Standards for 50+ Audience

## Quick Reference

| Element | Setting | Why |
|---------|---------|-----|
| Music Volume | 15% | Speech clarity |
| SFX Atmospheric | 20% | Subtle presence |
| SFX Sudden | 40% | Not jarring |
| Speech Boost (2-4kHz) | +3dB | Consonant clarity |
| Compression | 3:1 @ -18dB | Consistent volume |

## Senior-Friendly Pacing

- Sentence pause: **0.8s** (processing time)
- Paragraph pause: **1.5s** (mental reset)
- Pre-revelation pause: **2.5s** (focus and anticipation)

## Why This Matters

People 50+ experience age-related hearing changes (presbycusis):
- Reduced high-frequency hearing (where consonants live)
- Lower tolerance for background noise
- Need more time to process rapid speech

Our audio is optimized for their comfort and comprehension.

## Technical Implementation

### FFmpeg Filters Applied

**Speech Clarity Boost:**
```
equalizer=f=3000:width_type=h:width=2000:g=3
```
- Center frequency: 3000 Hz (middle of consonant range)
- Width: 2000 Hz (affects 2000-4000 Hz)
- Gain: +3 dB (gentle boost for clarity)

**Gentle Compression:**
```
acompressor=threshold=-18dB:ratio=3:attack=200:release=1000
```
- Threshold: -18 dB (comfortable speech level)
- Ratio: 3:1 (gentle, not aggressive)
- Attack: 200ms (smooth onset)
- Release: 1000ms (natural sound)

### Volume Levels

**Audio Mix:**
- Speech: 85% (dominant)
- Background Music: 15% (atmospheric only)
- SFX (Atmospheric): 20% (subtle)
- SFX (Sudden): 40% (noticeable but safe)

These levels are automatically applied during chapter packaging and video assembly.

## Comparison: Standard vs. Senior-Optimized

| Parameter | Standard (18-35) | Senior (50+) | Change |
|-----------|------------------|--------------|--------|
| Music Volume | 30% | 15% | -50% |
| SFX Volume | 70% | 20-40% | -43% to -71% |
| Sentence Pause | 0.3s | 0.8s | +167% |
| Speech Frequency Boost | None | +3dB @ 2-4kHz | Added |
| Dynamic Compression | None | 3:1 @ -18dB | Added |

## Testing Checklist

Before publishing, verify:
- [ ] Music never drowns out speech
- [ ] Can understand every word without strain
- [ ] No sudden loud noises (SFX volumes checked)
- [ ] Natural pauses between sentences
- [ ] Consistent volume throughout (compression applied)

## Validation

Audio settings are validated in `services/audioOptimization.ts`:

```typescript
import { validateAudioForSeniors } from './services/audioOptimization';

const result = validateAudioForSeniors(settings);
if (!result.valid) {
  console.warn('Audio settings issues:', result.warnings);
  console.log('Recommendations:', result.recommendations);
}
```

## Expected Results

**Quantitative Metrics:**
- Speech intelligibility: +25%
- Subtitle dependency: -30%
- Completion rate: +15%

**Qualitative Indicators:**
- Comments: "Easy to follow", "Clear audio"
- Fewer complaints about hearing difficulty
- Higher engagement in 55+ age group

## Files Modified

1. `services/audioOptimization.ts` - Settings and validation
2. `services/chapterPackager.ts` - Metadata with optimized volumes
3. `services/chapterPackager.ts` - FFmpeg assembly script with filters
4. `services/prompts.ts` - AI instructions for appropriate pacing

## Implementation

All settings are in `services/audioOptimization.ts`.
Applied automatically during:
1. Chapter metadata generation
2. FFmpeg video assembly

For questions, refer to technical documentation or development team.

## Scientific Basis

**Presbycusis Research:**
- Age-related hearing loss primarily affects 2-8kHz range
- Consonant recognition depends on 2-4kHz clarity
- Background noise tolerance decreases with age
- Processing time for speech increases (need longer pauses)

**Target Audience:**
- English speakers aged 50-70
- Tier 1 countries (USA, Canada, UK, Australia)
- High CPM, high engagement potential
- Values quality, clarity, and intellectual respect

## A/B Testing Recommendations

To validate effectiveness:
1. Create two versions of same content
2. Version A: Standard audio settings
3. Version B: Senior-optimized settings
4. Compare metrics:
   - Average view duration
   - Retention rate at 15, 25, 35 minutes
   - Comments mentioning audio quality
   - Completion rate

Expected improvement: 15-30% better retention in 50+ age group.
