// test/sfxTiming.test.ts
import { combineAndMixAudio } from '../services/audioUtils';
import { createMockPodcast, createMockChapter, createMockScriptLine, createMockSoundEffect } from './testHelpers';
import type { Podcast } from '../types';

declare var jest: any;
declare var describe: any;
declare var it: any;
declare var expect: any;
declare var beforeEach: any;

// Mock the memory cleanup function
jest.mock('../utils/sfxMemoryCleanup', () => ({
  cleanupSfxBlobs: jest.fn().mockReturnValue(3)
}));

describe('SFX Timing Tests', () => {
  let mockPodcast: Podcast;

  beforeEach(() => {
    // Create mock audio blobs
    const mockAudioBlob = new Blob(['audio data'], { type: 'audio/wav' });
    const mockSfxBlob1 = new Blob(['sfx data 1'], { type: 'audio/wav' });
    const mockSfxBlob2 = new Blob(['sfx data 2'], { type: 'audio/wav' });

    mockPodcast = createMockPodcast({
      chapters: [
        createMockChapter({
          status: 'completed',
          audioBlob: mockAudioBlob,
          script: [
            createMockScriptLine({
              speaker: 'Narrator',
              text: 'This is the first line of narration',
              searchKeywords: 'narration'
            }),
            createMockScriptLine({
              speaker: 'SFX',
              text: 'Thunder',
              searchKeywords: 'thunder',
              soundEffect: createMockSoundEffect({
                previews: { 'preview-hq-mp3': 'https://freesound.org/thunder.mp3' },
                license: 'CC0',
                username: 'sounddesigner'
              }),
              soundEffectVolume: 0.6,
              soundEffectBlob: mockSfxBlob1,
              soundEffectDownloaded: true
            }),
            createMockScriptLine({
              speaker: 'Narrator',
              text: 'This is the second line after the thunder',
              searchKeywords: 'narration'
            }),
            createMockScriptLine({
              speaker: 'SFX', 
              text: 'Rain',
              searchKeywords: 'rain',
              soundEffect: createMockSoundEffect({
                id: 456,
                name: 'Rain',
                previews: { 'preview-hq-mp3': 'https://freesound.org/rain.mp3' },
                license: 'CC0',
                username: 'rainmaker'
              }),
              soundEffectVolume: 0.4,
              soundEffectBlob: mockSfxBlob2,
              soundEffectDownloaded: true
            })
          ]
        })
      ]
    });
  });

  describe('SFX Timing Calculation', () => {
    it('should calculate word-based timing correctly', async () => {
      // Mock console.log to capture timing information
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      const result = await combineAndMixAudio(mockPodcast);

      expect(result).toBeInstanceOf(Blob);
      
      // Should have logged SFX scheduling with timing information
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('🔊 SFX scheduled: Thunder at')
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('🔊 SFX scheduled: Rain at')
      );

      // Verify timing calculations
      const thunderLog = consoleSpy.mock.calls.find(call => 
        call[0].includes('Thunder at') && call[0].includes('duration:')
      );
      
      if (thunderLog) {
        const logMessage = thunderLog[0];
        // Should include timing information
        expect(logMessage).toMatch(/at \d+\.\d+s/);
        expect(logMessage).toMatch(/duration: \d+\.\d+s/);
      }

      consoleSpy.mockRestore();
    });

    it('should handle SFX anticipation correctly', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      await combineAndMixAudio(mockPodcast);

      // Verify that SFX are scheduled with anticipation (earlier than estimated time)
      const thunderLog = consoleSpy.mock.calls.find(call => 
        call[0].includes('🔊 SFX scheduled: Thunder')
      );

      if (thunderLog) {
        const logMessage = thunderLog[0];
        // First SFX should be scheduled around 2.5-3.5 seconds (first line + anticipation)
        expect(logMessage).toMatch(/at [2-4]\.\d+s/);
      }

      consoleSpy.mockRestore();
    });

    it('should use pre-downloaded blobs when available', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      await combineAndMixAudio(mockPodcast);

      // Should log that pre-downloaded blobs are being used
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('✅ Using pre-downloaded blob for SFX: Thunder')
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('✅ Using pre-downloaded blob for SFX: Rain')
      );

      consoleSpy.mockRestore();
    });

    it('should fallback to SoundEffect blobs when ScriptLine blob is missing', async () => {
      // Remove ScriptLine blob but keep SoundEffect blob
      mockPodcast.chapters[0].script[1].soundEffectBlob = undefined;
      mockPodcast.chapters[0].script[1].soundEffectDownloaded = false;

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      await combineAndMixAudio(mockPodcast);

      // Should fallback to SoundEffect blob
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('✅ Using SoundEffect blob for SFX: Thunder')
      );

      consoleSpy.mockRestore();
    });

    it('should handle missing SFX blobs gracefully', async () => {
      // Remove all blobs
      mockPodcast.chapters[0].script[1].soundEffectBlob = undefined;
      mockPodcast.chapters[0].script[1].soundEffect!.blob = undefined;
      mockPodcast.chapters[0].script[3].soundEffectBlob = undefined;
      mockPodcast.chapters[0].script[3].soundEffect!.blob = undefined;

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      await combineAndMixAudio(mockPodcast);

      // Should log errors about missing blobs
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('❌ Не удалось обработать SFX: Thunder')
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('❌ Не удалось обработать SFX: Rain')
      );

      consoleSpy.mockRestore();
    });

    it('should calculate timing based on word count', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      // Create podcast with specific word counts for predictable timing
      const wordCountPodcast = createMockPodcast({
        chapters: [
          createMockChapter({
            status: 'completed',
            audioBlob: new Blob(['audio'], { type: 'audio/wav' }),
            script: [
              createMockScriptLine({
                speaker: 'Narrator',
                text: 'One two three four five', // 5 words = ~2 seconds
                searchKeywords: 'test'
              }),
              createMockScriptLine({
                speaker: 'SFX',
                text: 'Test SFX',
                searchKeywords: 'test',
                soundEffect: createMockSoundEffect({
                  name: 'Test',
                  previews: { 'preview-hq-mp3': 'https://example.com/test.mp3' },
                  license: 'CC0',
                  username: 'test'
                }),
                soundEffectVolume: 0.5,
                soundEffectBlob: new Blob(['test'], { type: 'audio/wav' }),
                soundEffectDownloaded: true
              })
            ]
          })
        ]
      });

      await combineAndMixAudio(wordCountPodcast);

      const sfxLog = consoleSpy.mock.calls.find(call => 
        call[0].includes('🔊 SFX scheduled: Test')
      );

      if (sfxLog) {
        const logMessage = sfxLog[0];
        // Should be scheduled around 2.5-3.0 seconds (5 words/2.5 wps + 0.5s pause - 0.2s anticipation)
        expect(logMessage).toMatch(/at [2-3]\.\d+s/);
      }

      consoleSpy.mockRestore();
    });
  });

  describe('SFX Volume Control', () => {
    it('should respect individual SFX volume settings', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      await combineAndMixAudio(mockPodcast);

      // The console logs should show the SFX names but volume is handled internally
      // This test ensures the function runs without errors when different volumes are set
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('🔊 SFX scheduled: Thunder')
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('🔊 SFX scheduled: Rain')
      );

      consoleSpy.mockRestore();
    });
  });

  describe('Error Handling', () => {
    it('should handle audio decoding errors gracefully', async () => {
      // Create invalid blob that will fail decoding
      const invalidBlob = new Blob(['invalid audio data'], { type: 'audio/wav' });
      mockPodcast.chapters[0].script[1].soundEffectBlob = invalidBlob;

      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

      await combineAndMixAudio(mockPodcast);

      // Should log warning about failed blob decoding
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to decode SFX blob: Thunder')
      );

      consoleSpy.mockRestore();
    });

    it('should handle empty podcast gracefully', async () => {
      const emptyPodcast = createMockPodcast({
        id: 'empty',
        title: 'Empty',
        chapters: []
      });

      await expect(combineAndMixAudio(emptyPodcast)).rejects.toThrow('Нет аудиофайлов для сборки');
    });

    it('should handle chapters without audio blobs', async () => {
      const noAudioPodcast = createMockPodcast({
        id: 'no-audio',
        title: 'No Audio',
        chapters: [
          {
            id: 'no-audio-chapter',
            title: 'No Audio Chapter',
            status: 'completed',
            script: [
              { speaker: 'Narrator', text: 'No audio here', searchKeywords: 'test' }
            ]
          }
        ]
      });

      await expect(combineAndMixAudio(noAudioPodcast)).rejects.toThrow('Нет аудиофайлов для сборки');
    });
  });
});