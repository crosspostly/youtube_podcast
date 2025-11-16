#!/usr/bin/env node

import { promises as fs } from 'fs';
import path from 'path';
import ffmpeg from 'fluent-ffmpeg';

const [,, projectDir] = process.argv;

if (!projectDir) {
  console.error('❌ Укажите путь к проекту');
  process.exit(1);
}

async function build() {
  try {
    console.log('🎬 Сборка видео...\n');
    
    // 1. Загрузить manifest
    const manifestPath = path.join(projectDir, 'manifest.json');
    const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
    
    console.log(`📹 Проект: ${manifest.metadata.title}`);
    console.log(`📊 Глав: ${manifest.chapters.length}\n`);
    
    // 2. Создать temp директорию
    const tempDir = path.join(projectDir, 'temp');
    await fs.mkdir(tempDir, { recursive: true });
    
    const chapterVideos = [];
    
    // 3. Создать видео для каждой главы
    for (const [index, chapter] of manifest.chapters.entries()) {
      console.log(`⏳ Глава ${index + 1}/${manifest.chapters.length}: ${chapter.title}`);
      
      const chapterVideoPath = path.join(tempDir, `chapter-${index}.mp4`);
      
      await new Promise((resolve, reject) => {
        const imagePath = path.join(projectDir, chapter.files.image);
        const speechPath = path.join(projectDir, chapter.files.speech);
        
        let command = ffmpeg()
          .input(imagePath)
          .inputOptions(['-loop', '1', '-framerate', '30', '-t', String(chapter.duration)])
          .input(speechPath)
          .videoFilters(`zoompan=z='min(zoom+0.0015,1.5)':d=${chapter.duration * 30}:s=1920x1080:fps=30`)
          .audioCodec('aac')
          .audioBitrate('192k')
          .videoCodec('libx264')
          .preset('medium')
          .format('mp4')
          .outputOptions(['-pix_fmt', 'yuv420p', '-shortest']);
        
        // Добавить музыку если есть
        if (chapter.files.music) {
          const musicPath = path.join(projectDir, chapter.files.music);
          command.input(musicPath);
          command.complexFilter([
            `[1:a]volume=1.0[speech]`,
            `[2:a]volume=${chapter.musicVolume}[music]`,
            `[speech][music]amix=inputs=2:duration=shortest[aout]`
          ]).map('[aout]').map('0:v');
        } else {
          command.map('0:v').map('1:a');
        }
        
        command
          .output(chapterVideoPath)
          .on('end', () => {
            console.log(`✅ Глава ${index + 1} готова`);
            resolve();
          })
          .on('error', (error) => {
            console.error(`❌ Ошибка при сборке главы ${index + 1}:`, error);
            reject(error);
          })
          .run();
      });
      
      chapterVideos.push(chapterVideoPath);
    }
    
    // 4. Склеить все главы
    console.log('\n🔗 Склейка глав...');
    
    const concatListPath = path.join(tempDir, 'concat.txt');
    const concatList = chapterVideos.map(v => `file '${v}'`).join('\n');
    await fs.writeFile(concatListPath, concatList);
    
    const outputDir = path.resolve('./output');
    await fs.mkdir(outputDir, { recursive: true });
    
    const outputPath = path.join(outputDir, `video-${manifest.projectId}.mp4`);
    
    await new Promise((resolve, reject) => {
      ffmpeg()
        .input(concatListPath)
        .inputOptions(['-f', 'concat', '-safe', '0'])
        .videoCodec('copy')
        .audioCodec('copy')
        .output(outputPath)
        .on('end', () => {
          resolve();
        })
        .on('error', (error) => {
          console.error('❌ Ошибка при склейке видео:', error);
          reject(error);
        })
        .run();
    });
    
    // 5. Очистить temp
    await fs.rm(tempDir, { recursive: true, force: true });
    
    console.log('\n✅ ГОТОВО!');
    console.log(`📁 Видео: ${outputPath}\n`);
    
  } catch (error) {
    console.error('\n❌ Ошибка:', error.message);
    process.exit(1);
  }
}

build();