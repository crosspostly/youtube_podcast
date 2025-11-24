// test/basic-sfx.test.js
// Simple JavaScript test for SFX functionality

describe('SFX Basic Functionality', () => {
  test('should have required files', () => {
    const fs = require('fs');
    
    // Check if service files exist
    expect(fs.existsSync('services/sfxService.ts')).toBe(true);
    expect(fs.existsSync('services/audioUtils.ts')).toBe(true);
    expect(fs.existsSync('services/chapterPackager.ts')).toBe(true);
    expect(fs.existsSync('utils/sfxMemoryCleanup.ts')).toBe(true);
  });

  test('should have required functions in sfxService.ts', () => {
    const fs = require('fs');
    const content = fs.readFileSync('services/sfxService.ts', 'utf8');
    
    expect(content).toContain('findAndDownloadSfx');
    expect(content).toContain('soundEffectBlob');
    expect(content).toContain('performFreesoundSearch');
  });

  test('should have enhanced SFX timing in audioUtils.ts', () => {
    const fs = require('fs');
    const content = fs.readFileSync('services/audioUtils.ts', 'utf8');
    
    expect(content).toContain('SFX_ANTICIPATION');
    expect(content).toContain('WORDS_PER_SECOND');
    expect(content).toContain('Using pre-downloaded blob for SFX');
    expect(content).toContain('cleanupSfxBlobs');
  });

  test('should have enhanced SFX processing in chapterPackager.ts', () => {
    const fs = require('fs');
    const content = fs.readFileSync('services/chapterPackager.ts', 'utf8');
    
    expect(content).toContain('Enhanced SFX processing with timing from metadata');
    expect(content).toContain('adelay');
    expect(content).toContain('powershell');
    expect(content).toContain('Get-Content');
    expect(content).toContain('ConvertFrom-Json');
  });

  test('should have memory cleanup utilities', () => {
    const fs = require('fs');
    const content = fs.readFileSync('utils/sfxMemoryCleanup.ts', 'utf8');
    
    expect(content).toContain('cleanupSfxBlobs');
    expect(content).toContain('getSfxMemoryStats');
    expect(content).toContain('cleanupChapterSfxBlobs');
    expect(content).toContain('forceGarbageCollection');
  });

  test('should have Jest configuration', () => {
    const fs = require('fs');
    
    expect(fs.existsSync('jest.config.js')).toBe(true);
    expect(fs.existsSync('test/setup.ts')).toBe(true);
  });

  test('should have comprehensive test files', () => {
    const fs = require('fs');
    
    expect(fs.existsSync('test/sfxService.test.ts')).toBe(true);
    expect(fs.existsSync('test/sfxMemoryCleanup.test.ts')).toBe(true);
    expect(fs.existsSync('test/sfxTiming.test.ts')).toBe(true);
    expect(fs.existsSync('test/basic-sfx.test.js')).toBe(true);
  });
});