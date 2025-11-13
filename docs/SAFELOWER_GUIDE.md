# SafeLower Utility Guide

## Проблема

В коде наблюдаются ошибки при вызове `.toLowerCase()` на значениях, которые могут быть `null`, `undefined` или не-строковыми.

### Примеры проблемного кода:

```typescript
// ✗ Ошибка: Cannot read property 'toLowerCase' of null
const value = null;
const result = value.toLowerCase(); 

// ✗ Ошибка: Cannot read property 'toLowerCase' of undefined
const prop = obj.property?.toLowerCase();

// ✗ Небезопасно
const input = (value || '').toLowerCase();
```

## Решение

Используйте утилиту `safeLower()` из `utils/safeLower-util.ts`.

### Правильные примеры:

```typescript
import { safeLower } from '../utils/safeLower-util';

// ✓ Безопасно
const value = null;
const result = safeLower(value); // ''

// ✓ Безопасно
const prop = safeLower(obj.property); // ''

// ✓ Безопасно с любыми типами
const num = safeLower(123); // '123'
```

## API

### safeLower(value: any): string

Безопасно преобразует любое значение к строке в нижнем регистре.

**Параметры:**
- `value` - Любое значение

**Возвращает:**
- Строку в нижнем регистре или `''` для null/undefined

### safeUpper(value: any): string

Безопасно преобразует любое значение к строке в верхнем регистре.

### safeEquals(value1: any, value2: any): boolean

Безопасно сравнивает два значения без учёта регистра.

```typescript
safeEquals('Hello', 'hello'); // true
safeEquals(null, undefined); // true
```

### safeIncludes(str: any, searchStr: any): boolean

Безопасно проверяет вхождение подстроки без учёта регистра.

```typescript
safeIncludes('Hello World', 'world'); // true
```

## Массовая замена

Для замены всех использований `.toLowerCase()` в проекте:

1. Найти все вхождения: `.toLowerCase()`
2. Добавить импорт: `import { safeLower } from '../utils/safeLower-util';`
3. Заменить:
   - `(value || '').toLowerCase()` → `safeLower(value)`
   - `value?.toLowerCase()` → `safeLower(value)`
   - `String(value).toLowerCase()` → `safeLower(value)`

## Преимущества

✓ Безопасно работает с null/undefined  
✓ Автоматическое преобразование типов  
✓ Короткий и читаемый код  
✓ TypeScript поддержка  
✓ Полный набор утилит  

## Ссылки

- Исходный код: `utils/safeLower-util.ts`
- Примеры: `utils/*_example.ts`
