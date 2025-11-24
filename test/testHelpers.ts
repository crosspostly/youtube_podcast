// test/testHelpers.ts
// Helper functions for creating test objects with all required properties

import type { Podcast, Chapter, ScriptLine, SoundEffect } from '../types';

export const createMockPodcast = (overrides: Partial<Podcast> = {}): Podcast => {
  return {
    id: 'test-podcast',
    title: 'Test Podcast',
    topic: 'Test Topic',
    youtubeTitleOptions: ['Test Title 1', 'Test Title 2'],
    selectedTitle: 'Test Title 1',
    description: 'Test Description',
    seoKeywords: ['test', 'podcast'],
    visualSearchPrompts: ['test prompt'],
    characters: [],
    sources: [],
    chapters: [],
    totalDurationMinutes: 10,
    creativeFreedom: true as boolean,
    knowledgeBaseText: 'Test knowledge',
    language: 'en',
    designConcepts: [],
    narrationMode: 'dialogue',
    thumbnailText: 'Test Thumbnail',
    backgroundMusicVolume: 0.3,
    ...overrides
  };
};

export const createMockChapter = (overrides: Partial<Chapter> = {}): Chapter => {
  return {
    id: 'test-chapter',
    title: 'Test Chapter',
    script: [],
    status: 'completed',
    ...overrides
  };
};

export const createMockScriptLine = (overrides: Partial<ScriptLine> = {}): ScriptLine => {
  return {
    speaker: 'Narrator',
    text: 'Test line',
    ...overrides
  };
};

export const createMockSoundEffect = (overrides: Partial<SoundEffect> = {}): SoundEffect => {
  return {
    id: 123,
    name: 'Test Sound',
    license: 'CC0',
    username: 'testuser',
    ...overrides
  };
};