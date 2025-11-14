export interface Source {
  uri: string;
  title: string;
}

export interface LogEntry {
  timestamp: string;
  type: 'info' | 'error' | 'request' | 'response' | 'warning';
  message: string;
  data?: any;
}

export interface SoundEffect {
    id: number;
    name: string;
    previews: {
        'preview-hq-mp3': string;
    };
    license: string;
    username: string;
}

export interface ScriptLine {
  speaker: string;
  text: string;
  // New fields for SFX
  soundEffect?: SoundEffect;
  soundEffectVolume?: number;
  searchTags?: string; // Embedded search tags for SFX (to avoid additional Gemini requests)
}

export type ChapterStatus = 'pending' | 'script_generating' | 'images_generating' | 'audio_generating' | 'completed' | 'error';

export interface MusicTrack {
  id: string;
  name: string;
  artist_name: string;
  audio: string; // URL
}

export interface Chapter {
  id:string;
  title: string;
  script: ScriptLine[];
  audioBlob?: Blob;
  status: ChapterStatus;
  error?: string;
  backgroundMusic?: MusicTrack;
  backgroundMusicVolume?: number;
  // Per-chapter image generation
  imagePrompts: string[];
  generatedImages?: GeneratedImage[];
  selectedBgIndex: number;
  // New field for manual video timing
  imageDurations?: number[];
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
  // New advanced options
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
}

// AI-Generated Design concept for thumbnails
export interface ThumbnailDesignConcept {
    name: string;
    fontFamily: string;
    fontSize: number;
    textColor: string;
    shadowColor: string;
    overlayOpacity: number;
    // New advanced options for "MrBeast" style
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

export interface ApiKeys {
  gemini?: string;
  openRouter?: string;
  freesound?: string;
  unsplash?: string;
  pexels?: string;
}

export interface Podcast {
  id: string;
  topic: string;
  youtubeTitleOptions: string[];
  selectedTitle: string;
  description: string;
  seoKeywords: string[];
  characters: Character[];
  sources: Source[];
  chapters: Chapter[];
  youtubeThumbnails?: YoutubeThumbnail[];
  designConcepts?: ThumbnailDesignConcept[];
  knowledgeBaseText?: string;
  creativeFreedom: boolean;
  totalDurationMinutes: number;
  language: string;
  narrationMode: NarrationMode;
  characterVoices: { [characterName: string]: string };
  monologueVoice: string;
  initialImageCount: number;
  // New fields for background music
  backgroundMusicVolume: number;
  // New field for thumbnail background
  thumbnailBaseImage?: GeneratedImage;
  // New field for video pacing control
  videoPacingMode?: 'auto' | 'manual';
}

// Configuration interface for API retry behavior
export interface ApiRetryConfig {
  retries?: number;
  initialDelay?: number;
  maxDelay?: number;
  exponentialBase?: number;
  jitterFactor?: number;
}

export interface StockPhoto {
    id: string;
    url: string;           // URL для превью
    downloadUrl: string;   // URL для скачивания в полном размере
    photographer: string;
    photographerUrl: string;
    source: 'unsplash' | 'pexels';
    width: number;
    height: number;
    license: string;
}

export interface GeneratedImage {
    url: string;
    photographer?: string;
    photographerUrl?: string;
    source?: 'generated' | 'unsplash' | 'pexels';
    license?: string;
}

export type ImageMode = 'generate' | 'unsplash' | 'pexels';

export type StockPhotoApiKeys = {
    unsplash?: string;
    pexels?: string;
};

// Global application configuration
export interface AppConfig {
  apiRetry: ApiRetryConfig;
}