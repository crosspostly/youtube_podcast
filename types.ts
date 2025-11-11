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

export interface Podcast {
  id: string;
  topic: string;
  title: string;
  description: string;
  seoKeywords: string[];
  imagePrompts: string[];
  sources: Source[];
  chapters: Chapter[];
  generatedImages?: string[];
  youtubeThumbnail?: string;
}
