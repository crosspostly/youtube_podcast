// test/sfxMemoryCleanup.test.ts
import { cleanupSfxBlobs, cleanupChapterSfxBlobs, getSfxMemoryStats } from '../utils/sfxMemoryCleanup';
import { createMockPodcast, createMockChapter, createMockScriptLine, createMockSoundEffect } from './testHelpers';
import type { Podcast, Chapter } from '../types';

describe('SFX Memory Cleanup Tests', () => {
  let mockPodcast: Podcast;
  let mockChapter: Chapter;

  beforeEach(() => {
    // Create mock SFX blobs
    const mockBlob1 = new Blob(['audio data 1'], { type: 'audio/wav' });
    const mockBlob2 = new Blob(['audio data 2'], { type: 'audio/wav' });
    const mockBlob3 = new Blob(['audio data 3'], { type: 'audio/wav' });

    mockPodcast = createMockPodcast({
      chapters: [
        createMockChapter({
          script: [
            createMockScriptLine({
              speaker: 'SFX',
              text: 'Thunder sound',
              soundEffect: createMockSoundEffect({
                previews: { 'preview-hq-mp3': 'https://example.com/thunder.mp3' },
                blob: mockBlob1,
                downloaded: true
              }),
              soundEffectBlob: mockBlob2,
              soundEffectDownloaded: true
            }),
            createMockScriptLine({
              speaker: 'Narrator',
              text: 'This is a test narration.'
            }),
            createMockScriptLine({
              speaker: 'SFX',
              text: 'Rain sound',
              soundEffect: createMockSoundEffect({
                id: 456,
                name: 'Rain',
                previews: { 'preview-hq-mp3': 'https://example.com/rain.mp3' },
                blob: mockBlob3,
                downloaded: true
              }),
              soundEffectDownloaded: true
            })
          ]
        }),
        createMockChapter({
          script: [
            createMockScriptLine({
              speaker: 'SFX',
              text: 'Wind sound',
              soundEffect: createMockSoundEffect({
                id: 789,
                name: 'Wind',
                previews: { 'preview-hq-mp3': 'https://example.com/wind.mp3' }
              }),
              soundEffectDownloaded: false
            })
          ]
        })
      ]
    });

    mockChapter = createMockChapter({
      script: [
        createMockScriptLine({
          speaker: 'SFX',
          text: 'Test sound',
          soundEffect: createMockSoundEffect({
            name: 'Test Sound',
            previews: { 'preview-hq-mp3': 'https://example.com/test.mp3' },
            blob: new Blob(['test audio'], { type: 'audio/wav' }),
            downloaded: true
          }),
          soundEffectBlob: new Blob(['test audio 2'], { type: 'audio/wav' }),
          soundEffectDownloaded: true
        })
      ]
    });
  });

  describe('cleanupSfxBlobs', () => {
    it('should clean all SFX blobs from podcast', () => {
      const initialStats = getSfxMemoryStats(mockPodcast);
      expect(initialStats.count).toBe(3); // 2 soundEffect.blobs + 1 soundEffectBlob

      const cleanedCount = cleanupSfxBlobs(mockPodcast);

      expect(cleanedCount).toBe(3);
      
      const finalStats = getSfxMemoryStats(mockPodcast);
      expect(finalStats.count).toBe(0);
      expect(finalStats.sizeMB).toBe(0);

      // Verify blobs are undefined and flags are reset
      expect(mockPodcast.chapters[0].script[0].soundEffectBlob).toBeUndefined();
      expect(mockPodcast.chapters[0].script[0].soundEffectDownloaded).toBe(false);
      expect(mockPodcast.chapters[0].script[0].soundEffect?.blob).toBeUndefined();
      expect(mockPodcast.chapters[0].script[0].soundEffect?.downloaded).toBe(false);
    });

    it('should return 0 when no blobs exist', () => {
      // Create podcast without blobs
      const emptyPodcast = createMockPodcast({
        chapters: [
          createMockChapter({
            script: [
              createMockScriptLine({ speaker: 'Narrator', text: 'No SFX here' })
            ]
          })
        ]
      });

      const cleanedCount = cleanupSfxBlobs(emptyPodcast);
      expect(cleanedCount).toBe(0);
    });

    it('should handle podcast with no chapters', () => {
      const noChaptersPodcast = createMockPodcast({
        chapters: []
      });

      const cleanedCount = cleanupSfxBlobs(noChaptersPodcast);
      expect(cleanedCount).toBe(0);
    });
  });

  describe('cleanupChapterSfxBlobs', () => {
    it('should clean SFX blobs from single chapter', () => {
      const initialStats = getSfxMemoryStats(mockPodcast);
      expect(initialStats.count).toBe(3);

      const cleanedCount = cleanupChapterSfxBlobs(mockChapter);

      expect(cleanedCount).toBe(2); // 1 soundEffect.blob + 1 soundEffectBlob

      // Verify blobs are cleaned
      expect(mockChapter.script[0].soundEffectBlob).toBeUndefined();
      expect(mockChapter.script[0].soundEffectDownloaded).toBe(false);
      expect(mockChapter.script[0].soundEffect?.blob).toBeUndefined();
      expect(mockChapter.script[0].soundEffect?.downloaded).toBe(false);
    });

    it('should handle chapter without script', () => {
      const noScriptChapter = {
        id: 'no-script',
        title: 'No Script',
        status: 'completed' as const
      };

      const cleanedCount = cleanupChapterSfxBlobs(noScriptChapter);
      expect(cleanedCount).toBe(0);
    });
  });

  describe('getSfxMemoryStats', () => {
    it('should calculate correct memory statistics', () => {
      const stats = getSfxMemoryStats(mockPodcast);

      expect(stats.count).toBe(3);
      expect(stats.sizeMB).toBeGreaterThan(0);
      expect(stats.details).toHaveLength(3);

      // Check details structure
      stats.details.forEach(detail => {
        expect(detail).toHaveProperty('name');
        expect(detail).toHaveProperty('sizeMB');
        expect(detail.sizeMB).toBeGreaterThan(0);
      });
    });

    it('should return zero stats for empty podcast', () => {
      const emptyPodcast = createMockPodcast({
        id: 'empty',
        title: 'Empty',
        chapters: []
      });

      const stats = getSfxMemoryStats(emptyPodcast);
      expect(stats.count).toBe(0);
      expect(stats.sizeMB).toBe(0);
      expect(stats.details).toHaveLength(0);
    });

    it('should handle blobs of different sizes', () => {
      // Create blobs with different sizes
      const smallBlob = new Blob(['small'], { type: 'audio/wav' });
      const largeBlob = new Blob(['x'.repeat(1000000)], { type: 'audio/wav' }); // ~1MB

      const sizeTestPodcast = createMockPodcast({
        chapters: [
          createMockChapter({
            script: [
              createMockScriptLine({
                speaker: 'SFX',
                text: 'Small sound',
                soundEffect: createMockSoundEffect({
                  blob: smallBlob,
                  downloaded: true
                })
              }),
              createMockScriptLine({
                speaker: 'SFX',
                text: 'Large sound',
                soundEffect: createMockSoundEffect({
                  id: 2,
                  blob: largeBlob,
                  downloaded: true
                })
              })
            ]
          })
        ]
      });

      const stats = getSfxMemoryStats(sizeTestPodcast);
      expect(stats.count).toBe(2);
      expect(stats.sizeMB).toBeGreaterThan(0.9); // Large blob should be ~1MB
      expect(stats.sizeMB).toBeLessThan(1.1); // But not too large
    });
  });

  describe('Error handling', () => {
    it('should handle malformed podcast structure gracefully', () => {
      const malformedPodcast = createMockPodcast({
        chapters: [
          {
            id: 'bad-chapter',
            title: 'Bad Chapter',
            script: null as any, // Invalid script
            status: 'completed'
          }
        ]
      } as any);

      expect(() => {
        cleanupSfxBlobs(malformedPodcast);
      }).not.toThrow();

      expect(() => {
        getSfxMemoryStats(malformedPodcast);
      }).not.toThrow();
    });

    it('should handle script lines without sound effects', () => {
      const noSfxPodcast = createMockPodcast({
        chapters: [
          createMockChapter({
            script: [
              createMockScriptLine({ speaker: 'Narrator', text: 'Regular line' }),
              createMockScriptLine({ speaker: 'SFX', text: 'SFX without effect' }) // No soundEffect
            ]
          })
        ]
      });

      const stats = getSfxMemoryStats(noSfxPodcast);
      expect(stats.count).toBe(0);

      const cleanedCount = cleanupSfxBlobs(noSfxPodcast);
      expect(cleanedCount).toBe(0);
    });
  });
});