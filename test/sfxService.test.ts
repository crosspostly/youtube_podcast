// test/sfxService.test.ts
import { findAndDownloadSfx } from '../services/sfxService';
import type { LogEntry } from '../types';

// Mock fetch
const mockFetch = global.fetch as jest.MockedFunction<typeof fetch>;

describe('SFX Service Tests', () => {
  let mockLog: jest.MockedFunction<(entry: Omit<LogEntry, 'timestamp'>) => void>;

  beforeEach(() => {
    mockLog = jest.fn();
    mockFetch.mockClear();
  });

  describe('performFreesoundSearch', () => {
    it('should return empty array when API key is missing', async () => {
      // Mock getApiKey to return undefined
      jest.doMock('../config/apiConfig', () => ({
        getApiKey: () => undefined
      }));

      const result = await performFreesoundSearch('test sound', mockLog);
      expect(result).toEqual([]);
      expect(mockLog).toHaveBeenCalledWith({
        type: 'info',
        message: 'Freesound API key не предоставлен.'
      });
    });

    it('should handle empty search tags', async () => {
      jest.doMock('../config/apiConfig', () => ({
        getApiKey: () => 'test-api-key'
      }));

      const result = await performFreesoundSearch('', mockLog);
      expect(result).toEqual([]);
    });

    it('should clean search tags properly', async () => {
      jest.doMock('../config/apiConfig', () => ({
        getApiKey: () => 'test-api-key'
      }));

      const mockResponse = {
        ok: true,
        json: () => Promise.resolve({
          results: [
            {
              id: 123,
              name: 'Test Sound',
              previews: {
                'preview-hq-mp3': 'https://freesound.org/data/preview/123.mp3'
              },
              license: 'CC0',
              username: 'testuser'
            }
          ]
        })
      };

      mockFetch.mockResolvedValueOnce(mockResponse as Response);

      // Test with punctuation and extra spaces
      const result = await performFreesoundSearch('  test, sound!  ', mockLog);
      
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('query=test%20sound'),
        expect.any(Object)
      );
    });
  });

  describe('findAndDownloadSfx', () => {
    beforeEach(() => {
      jest.doMock('../config/apiConfig', () => ({
        getApiKey: () => 'test-api-key'
      }));
    });

    it('should download SFX blob successfully', async () => {
      const mockSearchResponse = {
        ok: true,
        json: () => Promise.resolve({
          results: [
            {
              id: 123,
              name: 'Thunder Sound',
              previews: {
                'preview-hq-mp3': 'https://freesound.org/data/preview/thunder.mp3'
              },
              license: 'CC0',
              username: 'sounddesigner'
            }
          ]
        })
      };

      const mockAudioResponse = {
        ok: true,
        blob: () => Promise.resolve(new Blob(['audio data'], { type: 'audio/mpeg' }))
      };

      mockFetch
        .mockResolvedValueOnce(mockSearchResponse as Response)
        .mockResolvedValueOnce(mockAudioResponse as Response);

      const result = await findAndDownloadSfx('thunder', mockLog);

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Thunder Sound');
      expect(result[0].blob).toBeInstanceOf(Blob);
      expect(result[0].downloaded).toBe(true);
      expect(result[0].downloadTime).toBeDefined();

      expect(mockLog).toHaveBeenCalledWith({
        type: 'info',
        message: '🔊 Поиск и загрузка SFX: "thunder"'
      });

      expect(mockLog).toHaveBeenCalledWith({
        type: 'info',
        message: expect.stringContaining('✅ SFX скачан: "Thunder Sound"')
      });
    });

    it('should handle download failure gracefully', async () => {
      const mockSearchResponse = {
        ok: true,
        json: () => Promise.resolve({
          results: [
            {
              id: 123,
              name: 'Failed Sound',
              previews: {
                'preview-hq-mp3': 'https://freesound.org/data/preview/failed.mp3'
              },
              license: 'CC0',
              username: 'testuser'
            }
          ]
        })
      };

      const mockAudioResponse = {
        ok: false,
        status: 404
      };

      mockFetch
        .mockResolvedValueOnce(mockSearchResponse as Response)
        .mockResolvedValueOnce(mockAudioResponse as Response);

      const result = await findAndDownloadSfx('failed', mockLog);

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Failed Sound');
      expect(result[0].blob).toBeUndefined();
      expect(result[0].downloaded).toBe(false);

      expect(mockLog).toHaveBeenCalledWith({
        type: 'info',
        message: expect.stringContaining('⚠️  Не удалось скачать SFX "Failed Sound", но ссылка сохранена')
      });
    });

    it('should return empty array when no SFX found', async () => {
      const mockSearchResponse = {
        ok: true,
        json: () => Promise.resolve({
          results: []
        })
      };

      mockFetch.mockResolvedValueOnce(mockSearchResponse as Response);

      const result = await findAndDownloadSfx('nonexistent', mockLog);

      expect(result).toEqual([]);
      expect(mockLog).toHaveBeenCalledWith({
        type: 'info',
        message: '⚠️  SFX не найден: "nonexistent"'
      });
    });

    it('should handle multiple SFX downloads', async () => {
      const mockSearchResponse = {
        ok: true,
        json: () => Promise.resolve({
          results: [
            {
              id: 123,
              name: 'Sound 1',
              previews: {
                'preview-hq-mp3': 'https://freesound.org/data/preview/sound1.mp3'
              },
              license: 'CC0',
              username: 'user1'
            },
            {
              id: 456,
              name: 'Sound 2',
              previews: {
                'preview-hq-mp3': 'https://freesound.org/data/preview/sound2.mp3'
              },
              license: 'CC BY',
              username: 'user2'
            }
          ]
        })
      };

      const mockAudioResponse = {
        ok: true,
        blob: () => Promise.resolve(new Blob(['audio data'], { type: 'audio/mpeg' }))
      };

      mockFetch
        .mockResolvedValueOnce(mockSearchResponse as Response)
        .mockResolvedValueOnce(mockAudioResponse as Response)
        .mockResolvedValueOnce(mockAudioResponse as Response);

      const result = await findAndDownloadSfx('multiple', mockLog);

      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('Sound 1');
      expect(result[1].name).toBe('Sound 2');
      expect(result[0].blob).toBeInstanceOf(Blob);
      expect(result[1].blob).toBeInstanceOf(Blob);
      expect(result[0].downloaded).toBe(true);
      expect(result[1].downloaded).toBe(true);
    });

    it('should handle API errors gracefully', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const result = await findAndDownloadSfx('error', mockLog);

      expect(result).toEqual([]);
      expect(mockLog).toHaveBeenCalledWith({
        type: 'error',
        message: '❌ Ошибка при поиске/загрузке SFX: "error"',
        data: expect.any(Error)
      });
    });
  });

  describe('Fallback logic', () => {
    it('should try shortened query when original fails', async () => {
      // Mock first call to return empty results
      const mockEmptyResponse = {
        ok: true,
        json: () => Promise.resolve({ results: [] })
      };

      // Mock second call with shortened query to return results
      const mockSuccessResponse = {
        ok: true,
        json: () => Promise.resolve({
          results: [
            {
              id: 789,
              name: 'Short Query Sound',
              previews: {
                'preview-hq-mp3': 'https://freesound.org/data/preview/short.mp3'
              },
              license: 'CC0',
              username: 'user3'
            }
          ]
        })
      };

      const mockAudioResponse = {
        ok: true,
        blob: () => Promise.resolve(new Blob(['audio data'], { type: 'audio/mpeg' }))
      };

      mockFetch
        .mockResolvedValueOnce(mockEmptyResponse as Response)
        .mockResolvedValueOnce(mockSuccessResponse as Response)
        .mockResolvedValueOnce(mockAudioResponse as Response);

      const result = await findAndDownloadSfx('very long search query with many words', mockLog);

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Short Query Sound');

      // Should log the fallback attempt
      expect(mockLog).toHaveBeenCalledWith({
        type: 'info',
        message: expect.stringContaining('🔄 Попытка упрощенного поиска')
      });
    });
  });
});