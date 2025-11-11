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

export interface ScriptLine {
  speaker: string;
  text: string;
}

export type ChapterStatus = 'pending' | 'script_generating' | 'audio_generating' | 'completed' | 'error';

export interface Chapter {
  id: string;
  title: string;
  script: ScriptLine[];
  audioBlob?: Blob;
  status: ChapterStatus;
  error?: string;
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

export interface Podcast {
  id: string;
  topic: string;
  youtubeTitleOptions: string[];
  selectedTitle: string;
  description: string;
  seoKeywords: string[];
  imagePrompts: string[];
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
  // New fields for voice selection
  narrationMode: NarrationMode;
  characterVoices: { [characterName: string]: string };
  monologueVoice: string;
  selectedBgIndex: number;
}