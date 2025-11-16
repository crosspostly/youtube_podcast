import type { VercelRequest, VercelResponse } from '@vercel/node';
import { promises as fs } from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execPromise = promisify(exec);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }
  
  try {
    const { projectId, metadata, chapters, settings } = req.body;
    
    if (!projectId || !chapters || chapters.length === 0) {
      return res.status(400).json({ error: 'Invalid payload' });
    }
    
    console.log(`📦 Получен проект: ${projectId}`);
    
    // 1. Создать директорию
    const projectDir = path.resolve(`./projects/${projectId}`);
    await fs.mkdir(`${projectDir}/audio`, { recursive: true });
    await fs.mkdir(`${projectDir}/images`, { recursive: true });
    
    // 2. Сохранить метаданные
    const manifest = {
      projectId,
      metadata,
      settings,
      chapters: []
    };
    
    // 3. Сохранить файлы для каждой главы
    for (const [index, chapter] of chapters.entries()) {
      
      const chapterManifest: any = {
        id: chapter.id,
        title: chapter.title,
        duration: chapter.duration,
        files: {
          speech: `audio/chapter-${index}-speech.mp3`,
          image: `images/chapter-${index}.jpg`
        },
        musicVolume: chapter.musicVolume,
        sfx: []
      };
      
      // Сохранить аудио
      await saveBase64ToFile(
        chapter.speechAudio,
        path.join(projectDir, chapterManifest.files.speech)
      );
      
      // Сохранить изображение
      await saveBase64ToFile(
        chapter.image,
        path.join(projectDir, chapterManifest.files.image)
      );
      
      // Сохранить музыку (если есть)
      if (chapter.musicAudio) {
        chapterManifest.files.music = `audio/chapter-${index}-music.mp3`;
        await saveBase64ToFile(
          chapter.musicAudio,
          path.join(projectDir, chapterManifest.files.music)
        );
      }
      
      // Сохранить SFX
      if (chapter.sfx && chapter.sfx.length > 0) {
        for (const [sfxIndex, sfx] of chapter.sfx.entries()) {
          const sfxFile = `audio/chapter-${index}-sfx-${sfxIndex}.mp3`;
          await saveBase64ToFile(
            sfx.audio,
            path.join(projectDir, sfxFile)
          );
          chapterManifest.sfx.push({
            file: sfxFile,
            timestamp: sfx.timestamp,
            volume: sfx.volume
          });
        }
      }
      
      manifest.chapters.push(chapterManifest);
    }
    
    // 4. Сохранить manifest.json
    await fs.writeFile(
      path.join(projectDir, 'manifest.json'),
      JSON.stringify(manifest, null, 2)
    );
    
    console.log(`✅ Проект сохранён: ${projectDir}`);
    
    // 5. Запустить CLI для сборки видео (в фоне)
    const cliCommand = `node cli/build.js "${projectDir}"`;
    console.log(`🎬 Запуск: ${cliCommand}`);
    
    // Запускаем CLI в фоне, не дожидаясь завершения
    execPromise(cliCommand)
      .then(() => console.log(`✅ Видео готово: ${projectId}`))
      .catch((err) => console.error(`❌ Ошибка сборки:`, err));
    
    // 6. Вернуть ответ сразу
    res.status(200).json({
      success: true,
      projectId,
      message: 'Проект сохранён, сборка началась'
    });
    
  } catch (error) {
    console.error('Ошибка:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

async function saveBase64ToFile(base64Data: string, filePath: string) {
  // Определяем MIME тип и расширение
  let mimeType = 'image/jpeg'; // default
  let extension = '.jpg';
  
  if (base64Data.startsWith('data:')) {
    const matches = base64Data.match(/^data:([^;]+);base64,/);
    if (matches && matches[1]) {
      mimeType = matches[1];
      if (mimeType.includes('png')) {
        extension = '.png';
      } else if (mimeType.includes('jpeg') || mimeType.includes('jpg')) {
        extension = '.jpg';
      } else if (mimeType.includes('webp')) {
        extension = '.webp';
      } else if (mimeType.includes('mp3')) {
        extension = '.mp3';
      } else if (mimeType.includes('wav')) {
        extension = '.wav';
      }
    }
    // Убираем data URL префикс
    base64Data = base64Data.replace(/^data:([^;]+);base64,/, '');
  }
  
  // Корректируем путь файла с правильным расширением
  const finalFilePath = filePath.replace(/\.[^/.]+$/, '') + extension;
  
  const buffer = Buffer.from(base64Data, 'base64');
  await fs.writeFile(finalFilePath, buffer);
  return finalFilePath;
}