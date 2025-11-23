export interface Source {
  uri: string;
  title: string;
}

export interface LogEntry {
  timestamp: string;
  type: 'info' | 'error' | 'request' | 'response';
  message: string;
  data?: any;
}

export interface SoundEffect {
    id: number;
    name: string;
    previews?: {
        'preview-hq-mp3'?: string;
        'preview-lq-mp3'?: string;
        'preview-hq-ogg'?: string;
        'preview-lq-ogg'?: string;
    };
    license: string;
    username: string;
}

export interface ScriptLine {
  speaker: string;
  text: string;
  searchKeywords?: string;
  soundEffect?: SoundEffect;
  soundEffectVolume?: number;
}

export type ChapterStatus = 'pending' | 'script_generating' | 'audio_generating' | 'completed' | 'error';

export interface MusicTrack {
  id: string;
  name: string;
  artist_name: string;
  audio: string; // URL
}

// ДОБАВИТЬ новые типы для packaging chapter-based
export interface SfxTiming {
  name: string;
  startTime: number;
  duration: number;
  volume: number;
  filePath: string;
}

export interface ChapterMetadata {
  chapterNumber: number;
  title: string;
  audioDuration: number;
  imageDuration: number;
  imageCount: number;
  musicDuration?: number;
  musicVolume?: number;
  sfxTimings: SfxTiming[];
}

export interface BackgroundImage {
  url: string;
  blob?: Blob;
  prompt?: string;
}

export interface Chapter {
  id:string;
  title: string;
  script: ScriptLine[];
  musicSearchKeywords?: string;
  visualSearchPrompts?: string[];
  images?: string[];
  backgroundImages?: BackgroundImage[];
  audioBlob?: Blob;
  status: ChapterStatus;
  error?: string;
  backgroundMusic?: MusicTrack;
  backgroundMusicVolume?: number;
}

export interface TextOptions {
  text: string;
  fontFamily: string;
  fontSize: number;
  fillStyle: string;
  textAlign: 'left' | 'center' | 'right';
  position: { x: number; y: number };
  shadow: {
    color: string;
    blur: number;
    offsetX: number;
    offsetY: number;
  };
  overlayColor: string;
  strokeColor?: string;
  strokeWidth?: number;
  gradientColors?: string[];
  textTransform?: 'uppercase' | 'none';
}

export interface YoutubeThumbnail {
  styleName: string;
  dataUrl: string;
  options: TextOptions;
}

export interface Character {
  name: string;
  description: string;
  suggestedVoiceId?: string;
}

export interface ThumbnailDesignConcept {
    name: string;
    fontFamily: string;
    fontSize: number;
    textColor: string;
    shadowColor: string;
    overlayOpacity: number;
    strokeColor?: string;
    strokeWidth?: number;
    gradientColors?: string[];
    textTransform?: 'uppercase' | 'none';
}

export type NarrationMode = 'dialogue' | 'monologue';

export interface Voice {
    id: string;
    name: string;
    description: string;
    gender: 'female' | 'male';
}

export interface Podcast {
  id: string;
  topic: string;
  youtubeTitleOptions: string[];
  selectedTitle: string;
  description: string;
  seoKeywords: string[];
  visualSearchPrompts: string[];
  characters: Character[];
  sources: Source[];
  chapters: Chapter[];
  generatedImages?: string[];
  youtubeThumbnails?: YoutubeThumbnail[];
  designConcepts?: ThumbnailDesignConcept[];
  knowledgeBaseText?: string;
  creativeFreedom: boolean;
  totalDurationMinutes: number;
  language: string;
  narrationMode: NarrationMode;
  characterVoices: { [characterName: string]: string };
  monologueVoice: string;
  selectedBgIndex: number;
  initialImageCount: number;
  backgroundMusicVolume: number;
  imageSource: 'ai' | 'stock';
  thumbnailText: string;
}

export interface StockPhoto {
    id: string;
    url: string; 
    downloadUrl: string; 
    authorName: string;
    authorUrl: string;
    source: 'Unsplash' | 'Pexels';
}

export type ApiKeys = {
    gemini: string;
    freesound: string;
    unsplash: string;
    pexels: string;
    jamendo: string;
};

export interface DetailedContentIdea {
    title: string;
    description: string;
    historicalFact: string;
    lovecraftianTwist: string;
    scriptStructure: string[];
    tags: string[];
    sources: string[];
    visuals: string[];
    dialogueTone: string;
}

export interface QueuedProject {
    id: string;
    status: 'pending' | 'in_progress' | 'completed' | 'error';
    title: string;
    knowledgeBase: string;
    language: string;
    totalDuration: number;
    narrationMode: NarrationMode;
    creativeFreedom: boolean;
    imagesPerChapter: number;
    imageSource: 'ai' | 'stock';
}
