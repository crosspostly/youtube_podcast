import { generateContentWithFallback } from './geminiService';
import type { LogEntry } from '../types';
import { prompts } from './prompts';

type LogFunction = (entry: Omit<LogEntry, 'timestamp'>) => void;
type ApiKeys = { gemini?: string; };


export const parseGeminiJsonResponse = async (rawText: string, log: LogFunction, apiKeys: ApiKeys): Promise<any> => {
    log({ type: 'response', message: 'Сырой ответ от Gemini', data: rawText });
    const jsonMatch = rawText.match(/```json\s*([\s\S]*?)\s*```/);
    const jsonText = jsonMatch ? jsonMatch[1] : rawText;

    try {
        return JSON.parse(jsonText);
    } catch (jsonError) {
        log({ type: 'error', message: 'Не удалось распарсить JSON, попытка исправления с помощью ИИ...', data: { error: jsonError, text: jsonText } });
        
        const correctionPrompt = prompts.jsonCorrection(jsonText);

        try {
            const correctionResponse = await generateContentWithFallback({ contents: correctionPrompt }, log, apiKeys);
            const correctedRawText = correctionResponse.text;
            log({ type: 'info', message: 'Получен исправленный JSON от ИИ.', data: correctedRawText });
            
            const correctedJsonMatch = correctedRawText.match(/```json\s*([\s\S]*?)\s*```/);
            const correctedJsonText = correctedJsonMatch ? correctedJsonMatch[1] : correctedRawText;
            return JSON.parse(correctedJsonText);

        } catch (correctionError) {
             log({ type: 'error', message: 'Не удалось исправить и распарсить JSON даже после второй попытки.', data: correctionError });
             throw new Error(`Ответ модели не является валидным JSON, и попытка автоматического исправления не удалась.`);
        }
    }
};