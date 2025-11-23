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
  searchKeywords?: string; // For SFX
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

// NEW: Timing information for SFX in chapter-based packaging
export interface SfxTiming {
  name: string;
  startTime: number;    // seconds from chapter start
  duration: number;     // how long to play (max 3 sec)
  volume: number;
  filePath: string;     // relative path to SFX file
}

// NEW: Metadata for each chapter in packaged archive
export interface ChapterMetadata {
  chapterNumber: number;
  title: string;
  audioDuration: number;        // speech duration in seconds
  imageDuration: number;        // how long to show each image
  imageCount: number;
  musicDuration?: number;       // music length (if present)
  musicVolume?: number;
  sfxTimings: SfxTiming[];      // precise timings for all effects
}

// NEW: Background image with blob for packaging
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
  visualSearchPrompts?: string[]; // Prompts specific to this chapter
  images?: string[]; // Generated images for this chapter (deprecated, use backgroundImages)
  backgroundImages?: BackgroundImage[]; // NEW: Images with blobs for packaging
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
  suggestedVoiceId?: string; // AI suggested voice ID
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

export interface Podcast {
  id: string;
  topic: string;
  youtubeTitleOptions: string[];
  selectedTitle: string;
  description: string;
  seoKeywords: string[];
  visualSearchPrompts: string[]; // Kept for global context/thumbnail gen
  characters: Character[];
  sources: Source[];
  chapters: Chapter[];
  generatedImages?: string[]; // Deprecated in favor of chapter images, but kept for legacy/thumbnails
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
  // New fields for background music
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
    // Settings for this specific project
    language: string;
    totalDuration: number;
    narrationMode: NarrationMode;
    creativeFreedom: boolean;
    imagesPerChapter: number;
    imageSource: 'ai' | 'stock';
}
