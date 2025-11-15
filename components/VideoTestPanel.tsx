import React, { useState } from 'react';
import { usePodcastContext } from '../context/PodcastContext';
import { generateVideo } from '../services/videoService';
import { TEST_PODCAST_BLUEPRINT } from '../services/testData';
import type { Podcast, LogEntry } from '../types';
import Spinner from './Spinner';
import { CloseIcon, CheckIcon, BeakerIcon } from './Icons';

// Helper to create a silent WAV blob, avoiding TTS calls for speed and consistency.
const createSilentWavBlob = (durationSeconds: number): Blob => {
    const sampleRate = 44100;
    const numChannels = 1;
    const numFrames = sampleRate * durationSeconds;
    const buffer = new ArrayBuffer(44 + numFrames * 2);
    const view = new DataView(buffer);
    
    const writeString = (v: DataView, offset: number, s: string) => {
        for (let i = 0; i < s.length; i++) {
            v.setUint8(offset + i, s.charCodeAt(i));
        }
    };
    
    writeString(view, 0, 'RIFF');
    view.setUint32(4, 36 + numFrames * 2, true);
    writeString(view, 8, 'WAVE');
    writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * numChannels * 2, true);
    view.setUint16(32, numChannels * 2, true);
    view.setUint16(34, 16, true);
    writeString(view, 36, 'data');
    view.setUint32(40, numFrames * 2, true);
    
    return new Blob([view], { type: 'audio/wav' });
};

interface TestResult {
    name: string;
    status: 'pending' | 'running' | 'passed' | 'failed';
    message: string;
    logs: LogEntry[];
}

const initialTests: TestResult[] = [
    { name: "Идеальный сценарий", status: 'pending', message: "Проверяет полный цикл сборки с корректными данными.", logs: [] },
    { name: "Проект без изображений", status: 'pending', message: "Проверяет, что система корректно обрабатывает отсутствие изображений.", logs: [] },
    { name: "Проект с 'битым' изображением", status: 'pending', message: "Симулирует ошибку загрузки одного из изображений.", logs: [] },
    { name: "Проект без аудио", status: 'pending', message: "Проверяет обработку случая, когда аудиофайл поврежден.", logs: [] },
];

const VideoTestPanel: React.FC<{ onClose: () => void }> = ({ onClose }) => {
    const { log } = usePodcastContext();
    const [testResults, setTestResults] = useState<TestResult[]>(initialTests);
    const [isTesting, setIsTesting] = useState(false);

    const updateTestResult = (index: number, result: Partial<TestResult>) => {
        setTestResults(prev => prev.map((r, i) => i === index ? { ...r, ...result } : r));
    };

    const runAllTests = async () => {
        setIsTesting(true);
        setTestResults(initialTests.map(t => ({ ...t, status: 'pending', logs: [] }))); 

        const createTestLogger = (testIndex: number) => (entry: Omit<LogEntry, 'timestamp'>) => {
            const newEntry = { ...entry, timestamp: new Date().toISOString() };
            setTestResults(prev => prev.map((r, i) => 
                i === testIndex ? { ...r, logs: [...r.logs, newEntry] } : r
            ));
            log(entry); // also log to global context
        };

        // Test 1: Perfect Scenario
        const testLogger0 = createTestLogger(0);
        updateTestResult(0, { status: 'running' });
        testLogger0({ type: 'info', message: 'Запуск теста "Идеальный сценарий"...' });
        try {
            const mockPodcast = { ...TEST_PODCAST_BLUEPRINT, id: 'test-1' } as Podcast;
            const mockAudio = createSilentWavBlob(5); 
            await generateVideo(mockPodcast, mockAudio, () => {}, testLogger0);
            updateTestResult(0, { status: 'passed', message: "Видео успешно сгенерировано в памяти." });
            testLogger0({ type: 'response', message: 'Тест "Идеальный сценарий" успешно пройден.' });
        } catch (e: any) {
            updateTestResult(0, { status: 'failed', message: e.message || "Неизвестная ошибка" });
            testLogger0({ type: 'error', message: `Тест "Идеальный сценарий" провален: ${e.message}` });
        }

        // Test 2: No Images
        const testLogger1 = createTestLogger(1);
        updateTestResult(1, { status: 'running' });
        testLogger1({ type: 'info', message: 'Запуск теста "Проект без изображений"...' });
        try {
            const mockPodcast = { 
                ...TEST_PODCAST_BLUEPRINT, 
                id: 'test-2',
                chapters: TEST_PODCAST_BLUEPRINT.chapters.map(c => ({...c, generatedImages: []}))
            } as Podcast;
            const mockAudio = createSilentWavBlob(5);
            await generateVideo(mockPodcast, mockAudio, () => {}, testLogger1);
            updateTestResult(1, { status: 'failed', message: "Ожидалась ошибка, но ее не произошло." });
            testLogger1({ type: 'error', message: 'Тест провален: ожидалась ошибка об отсутствии изображений.' });
        } catch (e: any) {
            if (e.message.includes("нет доступных изображений")) {
                updateTestResult(1, { status: 'passed', message: "Система корректно вернула ошибку об отсутствии изображений." });
                testLogger1({ type: 'response', message: 'Тест успешно пройден, корректно обработана ошибка отсутствия изображений.' });
            } else {
                updateTestResult(1, { status: 'failed', message: `Произошла неожиданная ошибка: ${e.message}` });
                testLogger1({ type: 'error', message: `Тест провален с неожиданной ошибкой: ${e.message}` });
            }
        }

        // Test 3: Broken Image
        const testLogger2 = createTestLogger(2);
        updateTestResult(2, { status: 'running' });
        testLogger2({ type: 'info', message: 'Запуск теста "Проект с \'битым\' изображением"...' });
        try {
            const mockPodcast = JSON.parse(JSON.stringify({ ...TEST_PODCAST_BLUEPRINT, id: 'test-3' })) as Podcast;
            if (mockPodcast.chapters[0]?.generatedImages) {
                mockPodcast.chapters[0].generatedImages[1] = { url: "https://example.com/non-existent-image.jpg", source: 'generated' };
            }
            const mockAudio = createSilentWavBlob(5);
            await generateVideo(mockPodcast, mockAudio, () => {}, testLogger2);
            updateTestResult(2, { status: 'failed', message: "Ожидалась ошибка загрузки, но ее не произошло." });
            testLogger2({ type: 'error', message: 'Тест провален: ожидалась ошибка загрузки изображения.' });
        } catch (e: any) {
             if (e.message.includes("Failed to load image")) {
                updateTestResult(2, { status: 'passed', message: "Система корректно обработала ошибку загрузки изображения." });
                testLogger2({ type: 'response', message: 'Тест успешно пройден, корректно обработана ошибка загрузки изображения.' });
            } else {
                updateTestResult(2, { status: 'failed', message: `Произошла неожиданная ошибка: ${e.message}` });
                testLogger2({ type: 'error', message: `Тест провален с неожиданной ошибкой: ${e.message}` });
            }
        }

        // Test 4: Bad Audio
        const testLogger3 = createTestLogger(3);
        updateTestResult(3, { status: 'running' });
        testLogger3({ type: 'info', message: 'Запуск теста "Проект без аудио"...' });
        try {
            const mockPodcast = { ...TEST_PODCAST_BLUEPRINT, id: 'test-4' } as Podcast;
            const mockBadAudio = new Blob(["not a real wav file"], {type: "audio/wav"});
            await generateVideo(mockPodcast, mockBadAudio, () => {}, testLogger3);
            updateTestResult(3, { status: 'failed', message: "Ожидалась ошибка декодирования аудио, но ее не произошло." });
            testLogger3({ type: 'error', message: 'Тест провален: ожидалась ошибка декодирования аудио.' });
        } catch (e: any) {
             updateTestResult(3, { status: 'passed', message: "Система корректно обработала ошибку декодирования аудио." });
             testLogger3({ type: 'response', message: 'Тест успешно пройден, корректно обработана ошибка аудио.' });
        }

        setIsTesting(false);
    };

    const StatusIcon = ({ status }: { status: TestResult['status'] }) => {
        switch (status) {
            case 'running': return <Spinner className="w-5 h-5" />;
            case 'passed': return <CheckIcon className="w-6 h-6 text-green-400" />;
            case 'failed': return <CloseIcon className="w-6 h-6 text-red-400" />;
            case 'pending':
            default:
                return <div className="w-5 h-5 rounded-full border-2 border-slate-500"></div>;
        }
    };
    
    // FIX: Correctly type LogLine as a React functional component to handle the `key` prop.
    const LogLine: React.FC<{ entry: LogEntry }> = ({ entry }) => {
        let colorClass = 'text-slate-400';
        switch (entry.type) {
            case 'error': colorClass = 'text-red-400'; break;
            case 'warning': colorClass = 'text-orange-300'; break;
            case 'info': colorClass = 'text-blue-300'; break;
            case 'request': colorClass = 'text-yellow-300'; break;
            case 'response': colorClass = 'text-green-300'; break;
        }
        return (
            <div className="border-b border-slate-800/50 py-1">
                <p className={colorClass}>
                    <span className="font-bold">{entry.type.toUpperCase()}:</span> {new Date(entry.timestamp).toLocaleTimeString()} - {entry.message}
                </p>
            </div>
        );
    };

    return (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
            <div className="bg-slate-800/80 backdrop-blur-lg rounded-lg shadow-2xl w-full max-w-2xl border border-slate-700 flex flex-col max-h-[90vh]">
                <div className="flex justify-between items-center p-4 border-b border-slate-700 flex-shrink-0">
                    <h3 className="text-xl font-bold text-white flex items-center gap-2"><BeakerIcon/>Диагностика Видео-движка</h3>
                    <button onClick={onClose} className="text-slate-400 hover:text-white"><CloseIcon/></button>
                </div>
                <div className="p-6 flex-grow overflow-y-auto">
                    <p className="text-slate-300 text-sm mb-6">
                        Этот инструмент запускает серию автоматических тестов для проверки стабильности и отказоустойчивости видео-движка.
                        Тесты могут занять несколько минут, особенно "Идеальный сценарий", так как он инициализирует FFmpeg.
                    </p>
                    <div className="space-y-4">
                        {testResults.map((result, index) => (
                            <div key={index} className="p-4 bg-slate-900/50 rounded-lg">
                                <div className="flex items-start gap-4">
                                    <div className="w-6 h-6 flex-shrink-0 mt-1"><StatusIcon status={result.status} /></div>
                                    <div>
                                        <h4 className="font-semibold text-white">{result.name}</h4>
                                        <p className={`text-sm ${
                                            result.status === 'passed' ? 'text-green-300' :
                                            result.status === 'failed' ? 'text-red-300' : 'text-slate-400'
                                        }`}>{result.message}</p>
                                    </div>
                                </div>
                                {result.logs.length > 0 && (
                                    <details className="mt-3">
                                        <summary className="text-xs text-slate-400 cursor-pointer hover:text-white">Показать лог</summary>
                                        <div className="mt-2 p-2 bg-slate-950 rounded-md max-h-48 overflow-y-auto text-xs font-mono">
                                            {result.logs.map((logEntry, logIndex) => <LogLine key={logIndex} entry={logEntry} />)}
                                        </div>
                                    </details>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
                <div className="p-4 border-t border-slate-700 flex-shrink-0">
                    <button
                        onClick={runAllTests}
                        disabled={isTesting}
                        className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-bold rounded-lg hover:from-cyan-400 hover:to-blue-500 transition-all disabled:from-slate-600 disabled:to-slate-700 disabled:cursor-wait"
                    >
                        {isTesting ? <Spinner className="w-5 h-5" /> : "Запустить все тесты"}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default VideoTestPanel;