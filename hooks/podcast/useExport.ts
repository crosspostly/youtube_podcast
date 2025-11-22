import React, { useState, useMemo } from 'react';
import JSZip from 'jszip';
import { combineAndMixAudio, convertWavToMp3, generateSrtFile } from '../../services/audioUtils';
import { fetchWithCorsFallback } from '../../services/apiUtils';
import { ASSEMBLE_VIDEO_BAT, GET_VIDEO_TITLE_PS1, SYNC_SUBTITLES_PS1, CREATE_VIDEO_PS1, UPDATED_PYTHON_ASSEMBLY_SCRIPT, UPDATED_README_ASSEMBLY } from './scriptTemplates';
import type { Podcast, LogEntry } from '../../types';

type LogFunction = (entry: Omit<LogEntry, 'timestamp'>) => void;

export const useExport = (
    podcast: Podcast | null,
    log: LogFunction,
    setError: React.Dispatch<React.SetStateAction<string | null>>,
    devMode: boolean
) => {
    const [isCombiningAudio, setIsCombiningAudio] = useState(false);
    const [isGeneratingSrt, setIsGeneratingSrt] = useState(false);
    const [isZipping, setIsZipping] = useState(false);

    const combineAndDownload = async (format: 'wav' | 'mp3' = 'wav') => {
        if (!podcast || podcast.chapters.some(c => c.status !== 'completed' || !c.audioBlob)) return;
        
        setIsCombiningAudio(true);
        try {
            let finalBlob = await combineAndMixAudio(podcast);
            let extension = 'wav';
            if (format === 'mp3') {
                finalBlob = await convertWavToMp3(finalBlob, log);
                extension = 'mp3';
            }
            const url = URL.createObjectURL(finalBlob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${podcast.selectedTitle.replace(/[^a-z0-9а-яё]/gi, '_').toLowerCase()}.${extension}`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        } catch (err: any) {
            setError('Ошибка при сборке аудиофайла.');
            log({type: 'error', message: `Ошибка при сборке и экспорте (${format})`, data: err});
        } finally {
            setIsCombiningAudio(false);
        }
    };

    const generateSrt = async () => {
        if (!podcast) return;
        setIsGeneratingSrt(true);
        try {
            const srtBlob = await generateSrtFile(podcast, log);
            const url = URL.createObjectURL(srtBlob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${podcast.selectedTitle.replace(/[^a-z0-9а-яё]/gi, '_').toLowerCase()}.srt`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        } catch (err: any) {
            setError('Ошибка при создании SRT файла.');
            log({type: 'error', message: 'Ошибка при генерации SRT', data: err});
        } finally {
            setIsGeneratingSrt(false);
        }
    };

    const downloadProjectAsZip = async () => {
        if (!podcast || !podcast.chapters.every(c => c.status === 'completed')) {
            log({ type: 'info', message: 'Экспорт ZIP отменен: не все главы имеют статус "completed".' });
            // Optionally, provide more specific user feedback e.g. using a toast notification
            // For now, logging is sufficient to debug.
            return;
        }
        
        setIsZipping(true);
        log({ type: 'info', message: `Начало сборки ZIP-архива для проекта: ${podcast.selectedTitle}` });

        try {
            const zip = new JSZip();
            zip.file('VIDEO_TITLE.txt', podcast.selectedTitle);
            
            log({ type: 'info', message: 'ZIP: Микширование финального аудио...' });
            const finalAudioWav = await combineAndMixAudio(podcast);
            zip.file('final_audio.wav', finalAudioWav);
            
            log({ type: 'info', message: 'ZIP: Генерация субтитров...' });
            const srtBlob = await generateSrtFile(podcast, log);
            zip.file('subtitles.srt', srtBlob);

            const [voiceFolder, musicFolder, sfxFolder, imageFolder] = [zip.folder('voice'), zip.folder('music'), zip.folder('sfx'), zip.folder('images')];
            
            let globalImageCounter = 1;

            for (let i = 0; i < podcast.chapters.length; i++) {
                const chapter = podcast.chapters[i];
                log({ type: 'info', message: `ZIP: Обработка главы ${i + 1}...` });
                if (chapter.audioBlob) voiceFolder?.file(`chapter_${i + 1}_voice.wav`, chapter.audioBlob);
                if (chapter.backgroundMusic) {
                     const safeName = chapter.backgroundMusic.name.replace(/[^a-z0-9]/gi, '_').substring(0, 30);
                     const textContent = `Source URL: ${chapter.backgroundMusic.audio}\nTrack: ${chapter.backgroundMusic.name}\nArtist: ${chapter.backgroundMusic.artist_name}`;
                     if (devMode) {
                         musicFolder?.file(`[LINK]_chapter_${i + 1}_${safeName}.txt`, textContent);
                     } else {
                         try {
                            const musicUrl = chapter.backgroundMusic.audio.replace(/^http:\/\//, 'https://');
                            const response = await fetchWithCorsFallback(musicUrl);
                            if (response.ok) musicFolder?.file(`chapter_${i + 1}_${safeName}.mp3`, await response.blob());
                            else throw new Error(`Music fetch status: ${response.status}`);
                         } catch (e) {
                             log({ type: 'error', message: `Не удалось скачать музыку для главы ${i+1}, сохраняем ссылку.`, data: e });
                             musicFolder?.file(`[LINK]_chapter_${i + 1}_${safeName}.txt`, textContent);
                         }
                     }
                }
                if (chapter.script) {
                    for (const line of chapter.script) {
                        if (line.speaker.toUpperCase() === 'SFX' && line.soundEffect?.previews?.['preview-hq-mp3']) {
                            const safeSfxName = line.soundEffect.name.replace(/[^a-z0-9]/gi, '_').substring(0, 30);
                            const hqPreview = line.soundEffect.previews['preview-hq-mp3'];
                             const textContent = `Source URL: ${hqPreview}\nName: ${line.soundEffect.name}\nLicense: ${line.soundEffect.license}\nUsername: ${line.soundEffect.username}`;
                            if (devMode) {
                                sfxFolder?.file(`[LINK]_${safeSfxName}.txt`, textContent);
                            } else {
                                try {
                                    const sfxUrl = hqPreview.replace(/^http:\/\//, 'https://');
                                    const response = await fetchWithCorsFallback(sfxUrl);
                                    if (response.ok) sfxFolder?.file(`${safeSfxName}.mp3`, await response.blob());
                                    else throw new Error(`SFX fetch status: ${response.status}`);
                                } catch (e) {
                                     log({ type: 'error', message: `Не удалось скачать SFX (${line.soundEffect.name}), сохраняем ссылку.` });
                                     sfxFolder?.file(`[LINK]_${safeSfxName}.txt`, textContent);
                                }
                            }
                        }
                    }
                }
                if (chapter.images) {
                     for (const imgSrc of chapter.images) {
                         try {
                             const response = await fetchWithCorsFallback(imgSrc);
                             if (!response.ok) throw new Error(`Fetch failed: ${response.statusText}`);
                             const blob = await response.blob();
                             const ext = blob.type.split('/')[1] || 'jpeg';
                             const filename = `img_${String(globalImageCounter++).padStart(3, '0')}.${ext}`;
                             imageFolder?.file(filename, blob);
                         } catch (e) {
                             log({ type: 'error', message: `Не удалось скачать картинку. Пропуск.` });
                         }
                    }
                }
            }
            
            // Add new scripts
            zip.file('sync_subtitles.ps1', SYNC_SUBTITLES_PS1);
            zip.file('get_video_title.ps1', GET_VIDEO_TITLE_PS1);
            zip.file('create_video.ps1', CREATE_VIDEO_PS1);
            zip.file('assemble_video.bat', ASSEMBLE_VIDEO_BAT);
            zip.file('assemble_locally.py', UPDATED_PYTHON_ASSEMBLY_SCRIPT);
            zip.file('README_ASSEMBLY.txt', UPDATED_README_ASSEMBLY);

            log({ type: 'info', message: 'ZIP: Финальная упаковка архива...' });
            const zipBlob = await zip.generateAsync({ type: 'blob' });
            const url = URL.createObjectURL(zipBlob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${podcast.selectedTitle.replace(/[^a-z0-9а-яё]/gi, '_').toLowerCase()}_videopack.zip`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

        } catch (err: any) {
            setError('Ошибка при создании ZIP-архива.');
            log({ type: 'error', message: 'Ошибка при сборке ZIP-архива', data: err });
        } finally {
             setIsZipping(false);
        }
    };
    
    const manualTtsScript = useMemo(() => {
        if (!podcast) return 'Генерация сценария...';
        const completedChapters = podcast.chapters.filter(c => c.status === 'completed' && c.script?.length > 0);
        if (completedChapters.length === 0) return 'Сценарий будет доступен после завершения глав.';
        return "Style Instructions: Read aloud in a warm, welcoming tone.\n\n" + completedChapters.map((chapter, index) => `ГЛАВА ${index + 1}: ${chapter.title.toUpperCase()}\n\n` + chapter.script.map(line => line.speaker.toUpperCase() === 'SFX' ? `[SFX: ${line.text}]` : `${line.speaker}: ${line.text}`).join('\n')).join('\n\n---\n\n');
    }, [podcast?.chapters]);
    
    return {
        isCombiningAudio,
        isGeneratingSrt,
        isZipping,
        combineAndDownload, 
        generateSrt, 
        downloadProjectAsZip,
        manualTtsScript
    };
};