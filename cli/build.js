#!/usr/bin/env node

import { promises as fs } from 'fs';
import path from 'path';
import ffmpeg from 'fluent-ffmpeg';

const [,, projectDir] = process.argv;

if (!projectDir) {
  console.error('❌ Укажите путь к проекту');
  process.exit(1);
}

// Helper functions for SRT manipulation
const srtTimeToSeconds = (time) => {
    const parts = time.split(/[:,]/);
    if (parts.length !== 4) return 0;
    return parseInt(parts[0], 10) * 3600 + parseInt(parts[1], 10) * 60 + parseInt(parts[2], 10) + parseInt(parts[3], 10) / 1000;
};

const secondsToSrtTime = (seconds) => {
    if (isNaN(seconds) || seconds < 0) seconds = 0;
    const date = new Date(0);
    date.setMilliseconds(seconds * 1000);
    return date.toISOString().substring(11, 23).replace('.', ',');
};

const parseSrt = (srtContent) => {
    const pattern = /(\d+)\r?\n(\d{2}:\d{2}:\d{2},\d{3}) --> (\d{2}:\d{2}:\d{2},\d{3})\r?\n([\s\S]*?)(?=\r?\n\r?\n|\r?\n*$)/g;
    const subs = [];
    let match;
    while ((match = pattern.exec(srtContent)) !== null) {
        subs.push({
            index: parseInt(match[1], 10),
            start: srtTimeToSeconds(match[2]),
            end: srtTimeToSeconds(match[3]),
            text: match[4].trim()
        });
    }
    return subs;
};

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
    
    // 3. Прочитать и распарсить основной файл субтитров (если есть)
    let allSubtitles = [];
    if (manifest.srtFile) {
        try {
            const srtPath = path.join(projectDir, manifest.srtFile);
            const srtContent = await fs.readFile(srtPath, 'utf8');
            allSubtitles = parseSrt(srtContent);
            console.log(`💬 Найдены субтитры: ${allSubtitles.length} реплик.`);
        } catch (e) {
            console.warn('⚠️ Не удалось прочитать файл субтитров, видео будет создано без них.', e.message);
        }
    }

    const chapterVideos = [];
    let chapterStartTime = 0;
    
    // 4. Создать видео для каждой главы
    for (const [index, chapter] of manifest.chapters.entries()) {
      console.log(`⏳ Глава ${index + 1}/${manifest.chapters.length}: ${chapter.title}`);
      
      const chapterVideoPath = path.join(tempDir, `chapter-${index}.mp4`);
      
      // 4a. Подготовить субтитры для текущей главы
      const chapterEndTime = chapterStartTime + chapter.duration;
      const chapterSubs = allSubtitles
          .filter(sub => sub.start < chapterEndTime && sub.end > chapterStartTime)
          .map((sub, i) => ({
              index: i + 1,
              start: Math.max(0, sub.start - chapterStartTime),
              end: Math.min(chapter.duration, sub.end - chapterStartTime),
              text: sub.text
          }));

      let chapterSrtPath = null;
      if (chapterSubs.length > 0) {
          const chapterSrtContent = chapterSubs.map(sub => 
              `${sub.index}\n${secondsToSrtTime(sub.start)} --> ${secondsToSrtTime(sub.end)}\n${sub.text}`
          ).join('\n\n');
          chapterSrtPath = path.join(tempDir, `chapter-${index}.srt`);
          await fs.writeFile(chapterSrtPath, chapterSrtContent, 'utf8');
      }

      // 4b. Собрать видео для главы с помощью fluent-ffmpeg
      await new Promise((resolve, reject) => {
        const imagePath = path.join(projectDir, chapter.files.image);
        const speechPath = path.join(projectDir, chapter.files.speech);
        
        let command = ffmpeg()
          .input(imagePath)
          .inputOptions(['-loop', '1', '-framerate', '30', '-t', String(chapter.duration)])
          .input(speechPath);

        const videoFilters = [
            `zoompan=z='min(zoom+0.0015,1.1)':d=${Math.ceil(30 * chapter.duration)}:s=1920x1080:fps=30`
        ];

        if (chapterSrtPath) {
            const subtitleStyle = "FontName=Inter,FontSize=48,PrimaryColour=&HFFFFFF&,OutlineColour=&H000000&,BorderStyle=1,Outline=4,Shadow=2";
            // Путь для ffmpeg должен быть правильно экранирован
            const escapedSrtPath = chapterSrtPath.replace(/\\/g, '/').replace(/:/g, '\\:');
            videoFilters.push(`subtitles='${escapedSrtPath}':force_style='${subtitleStyle}'`);
        }
        
        command.videoFilters(videoFilters);
        
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
          .audioCodec('aac')
          .audioBitrate('192k')
          .videoCodec('libx264')
          .preset('medium')
          .format('mp4')
          .outputOptions(['-pix_fmt', 'yuv420p', '-shortest'])
          .output(chapterVideoPath)
          .on('end', resolve)
          .on('error', (error) => {
            console.error(`❌ Ошибка при сборке главы ${index + 1}:`, error);
            reject(error);
          })
          .run();
      });
      
      chapterVideos.push(chapterVideoPath);
      chapterStartTime += chapter.duration;
    }
    
    // 5. Склеить все главы
    console.log('\n🔗 Склейка глав...');
    
    const concatListPath = path.join(tempDir, 'concat.txt');
    const concatList = chapterVideos.map(v => `file '${path.basename(v)}'`).join('\n');
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
        .on('end', resolve)
        .on('error', (error) => {
          console.error('❌ Ошибка при склейке видео:', error);
          reject(error);
        })
        .run();
    });
    
    // 6. Очистить temp
    await fs.rm(tempDir, { recursive: true, force: true });
    
    console.log('\n✅ ГОТОВО!');
    console.log(`📁 Видео: ${outputPath}\n`);
    
  } catch (error) {
    console.error('\n❌ Ошибка:', error.message);
    process.exit(1);
  }
}

build();