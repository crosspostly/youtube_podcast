const fs = require('fs');
const path = require('path');

// Файлы для обработки (найденные через поиск)
const filesToProcess = [
  'services/geminiService.ts',
  'hooks/usePodcast.ts'
];

// Паттерны для замены
const patterns = [
  {
    // (error?.message || '').toLowerCase() -> safeLower(error?.message)
    regex: /\(([^)]+)\s*\|\|\s*['"]\s*['"]\)\.toLowerCase\(\)/g,
    replacement: 'safeLower($1)'
  },
  {
    // variable?.toLowerCase() -> safeLower(variable)
    regex: /([a-zA-Z_][a-zA-Z0-9_.]*)\?\.toLowerCase\(\)/g,
    replacement: 'safeLower($1)'
  }
];

const importStatement = "import { safeLower } from '../utils/safeLower-util';\n";

function processFile(filePath) {
  const fullPath = path.join(__dirname, '..', filePath);
  
  if (!fs.existsSync(fullPath)) {
    console.log(`⚠️  Файл не найден: ${filePath}`);
    return;
  }

  let content = fs.readFileSync(fullPath, 'utf8');
  let modified = false;
  
  // Применяем все паттерны замены
  patterns.forEach(pattern => {
    const newContent = content.replace(pattern.regex, pattern.replacement);
    if (newContent !== content) {
      content = newContent;
      modified = true;
    }
  });
  
  if (modified) {
    // Проверяем, есть ли уже импорт safeLower
    if (!content.includes('safeLower')) {
      console.log(`⚠️  В файле ${filePath} нет импорта safeLower!`);
      return;
    }
    
    // Если импорта нет, добавляем его после первого импорта
    if (!content.includes('from \'../utils/safeLower-util\'') && 
        !content.includes('from "../utils/safeLower-util"')) {
      const lines = content.split('\n');
      const firstImportIndex = lines.findIndex(line => line.trim().startsWith('import'));
      if (firstImportIndex !== -1) {
        lines.splice(firstImportIndex + 1, 0, importStatement.trim());
        content = lines.join('\n');
      }
    }
    
    fs.writeFileSync(fullPath, content, 'utf8');
    console.log(`✅ Обновлен: ${filePath}`);
  } else {
    console.log(`ℹ️  Без изменений: ${filePath}`);
  }
}

console.log('🚀 Начинаем применение safeLower утилиты...\n');

filesToProcess.forEach(file => {
  try {
    processFile(file);
  } catch (error) {
    console.error(`❌ Ошибка при обработке ${file}:`, error.message);
  }
});

console.log('\n✨ Готово! Проверьте изменения и закоммитьте их.');
console.log('💡 Запустите: git diff для просмотра изменений');
