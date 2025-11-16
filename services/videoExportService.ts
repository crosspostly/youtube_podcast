import { Podcast } from '../types';

interface ExportPayload {
  projectId: string;
  metadata: {
    title: string;
    description: string;
    language: string;
  };
  chapters: Array<{
    id: string;
    title: string;
    duration: number;
    speechAudio: string;      // Base64
    musicAudio?: string;       // Base64
    image: string;             // Base64 или URL
    musicVolume: number;
    sfx?: Array<{
      audio: string;           // Base64
      timestamp: number;
      volume: number;
    }>;
  }>;
  settings: {
    resolution: '1920x1080' | '1280x720';
    fps: 30;
    quality: 'fast' | 'medium' | 'slow';
  };
}

async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export async function exportProjectToLocalCLI(podcast: Podcast): Promise<string> {
  
  const payload: ExportPayload = {
    projectId: `project-${Date.now()}`,
    metadata: {
      title: podcast.selectedTitle,
      description: podcast.description || '',
      language: podcast.language
    },
    chapters: [],
    settings: {
      resolution: '1920x1080',
      fps: 30,
      quality: 'medium'
    }
  };
  
  // Конвертировать все медиафайлы в Base64
  for (const chapter of podcast.chapters) {
    
    if (!chapter.audioBlob) {
      throw new Error(`Глава "${chapter.title}" не имеет аудио`);
    }
    
    const chapterData: any = {
      id: chapter.id,
      title: chapter.title,
      duration: chapter.duration || 60, // Default duration if not set
      speechAudio: await blobToBase64(chapter.audioBlob),
      musicVolume: chapter.backgroundMusicVolume || 0.3,
      image: chapter.generatedImages?.[0]?.url || '',
      sfx: []
    };
    
    // Музыка
    if (chapter.backgroundMusic?.audio) {
      // Для музыки у нас есть URL, нужно скачать и конвертировать
      try {
        const musicResponse = await fetch(chapter.backgroundMusic.audio);
        const musicBlob = await musicResponse.blob();
        chapterData.musicAudio = await blobToBase64(musicBlob);
      } catch (error) {
        console.warn(`Failed to fetch music for chapter "${chapter.title}":`, error);
        // Продолжаем без музыки
      }
    }
    
    // SFX - пока не реализовано, оставляем пустым массивом
    // В будущем можно добавить обработку soundEffects
    
    payload.chapters.push(chapterData);
  }
  
  // Отправить на backend
  const response = await fetch('/api/export-project', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Ошибка экспорта');
  }
  
  const result = await response.json();
  return result.projectId;
}