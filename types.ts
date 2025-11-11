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
}