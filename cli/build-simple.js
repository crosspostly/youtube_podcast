#!/usr/bin/env node

import { promises as fs } from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execPromise = promisify(exec);

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
    console.log('Reading manifest from:', manifestPath);
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
      
      const imagePath = path.join(projectDir, chapter.files.image);
      const speechPath = path.join(projectDir, chapter.files.speech);
      
      let cmd = `ffmpeg -y -loop 1 -framerate 30 -t ${chapter.duration} -i "${imagePath}" -i "${speechPath}"`;
      
      // Добавить музыку если есть
      if (chapter.files.music) {
        const musicPath = path.join(projectDir, chapter.files.music);
        cmd += ` -i "${musicPath}"`;
        cmd += ` -filter_complex "[1:a]volume=1.0[speech];[2:a]volume=${chapter.musicVolume}[music];[speech][music]amix=inputs=2:duration=shortest[aout]" -map "[aout]" -map 0:v`;
      } else {
        cmd += ' -map 0:v -map 1:a';
      }
      
      // Ken Burns zoom effect
      cmd += ` -vf "zoompan=z='min(zoom+0.0015,1.5)':d=${chapter.duration * 30}:s=1920x1080:fps=30"`;
      
      cmd += ` -c:v libx264 -preset medium -pix_fmt yuv420p -c:a aac -b:a 192k -shortest "${chapterVideoPath}"`;
      
      console.log('Running command:', cmd);
      
      const { stdout, stderr } = await execPromise(cmd);
      console.log(`✅ Глава ${index + 1} готова`);
      
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
    
    const concatCmd = `ffmpeg -y -f concat -safe 0 -i "${concatListPath}" -c copy "${outputPath}"`;
    console.log('Running concat command:', concatCmd);
    
    await execPromise(concatCmd);
    
    // 5. Очистить temp
    await fs.rm(tempDir, { recursive: true, force: true });
    
    console.log('\n✅ ГОТОВО!');
    console.log(`📁 Видео: ${outputPath}\n`);
    
  } catch (error) {
    console.error('\n❌ Ошибка:', error.message);
    console.error('Stack:', error.stack);
    process.exit(1);
  }
}

build();