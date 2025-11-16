#!/usr/bin/env node

import { promises as fs } from 'fs';
import path from 'path';

const [,, projectDir] = process.argv;

if (!projectDir) {
  console.error('❌ Укажите путь к проекту');
  process.exit(1);
}

async function test() {
  try {
    console.log('🧪 Тест CLI...\n');
    
    // 1. Загрузить manifest
    const manifestPath = path.join(projectDir, 'manifest.json');
    console.log('Reading manifest from:', manifestPath);
    const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
    
    console.log(`📹 Проект: ${manifest.metadata.title}`);
    console.log(`📊 Глав: ${manifest.chapters.length}`);
    
    console.log('\n✅ Тест пройден!');
    
  } catch (error) {
    console.error('\n❌ Ошибка:', error.message);
    process.exit(1);
  }
}

test();