import type { Podcast } from '../types';

const FPS = 30;

export const generateFfmpegCommandParts = (podcast: Podcast, totalDuration: number): {
    imageInputArgs: string[],
    sfxInputArgs: string[],
    filterComplex: string,
    finalAudioMap: string
} => {
    const allGeneratedImages = podcast.chapters.flatMap(c => c.generatedImages || []);
    if (allGeneratedImages.length === 0) {
        throw new Error("Нет изображений для создания команды FFmpeg.");
    }

    let imagesToUse = [...allGeneratedImages];
    let imageDurations: number[];

    if (podcast.videoPacingMode === 'manual') {
        imageDurations = podcast.chapters.flatMap(c => c.imageDurations || Array(c.generatedImages?.length || 0).fill(60));
        if (imageDurations.length !== imagesToUse.length) {
            imageDurations = Array(imagesToUse.length).fill(totalDuration / imagesToUse.length);
        }
    } else {
        const MIN_IMAGE_DURATION = 4;
        const MAX_IMAGE_DURATION = 15;
        
        let finalImageDuration = totalDuration / imagesToUse.length;

        if (finalImageDuration > MAX_IMAGE_DURATION) {
            const loopsNeeded = Math.ceil(finalImageDuration / MAX_IMAGE_DURATION);
            const originalImages = [...imagesToUse];
            for (let i = 1; i < loopsNeeded; i++) {
                imagesToUse.push(...originalImages);
            }
        }

        finalImageDuration = totalDuration / imagesToUse.length;
        if (finalImageDuration < MIN_IMAGE_DURATION) {
            let imagesNeeded = Math.floor(totalDuration / MIN_IMAGE_DURATION);
            if (imagesNeeded > 0 && imagesNeeded < imagesToUse.length) {
                const step = imagesToUse.length / imagesNeeded;
                imagesToUse = Array.from({ length: imagesNeeded }, (_, i) => imagesToUse[Math.floor(i * step)]);
            } else if (imagesNeeded <= 0) {
                imagesToUse = [imagesToUse[0]];
            }
        }
        
        finalImageDuration = totalDuration / imagesToUse.length;
        imageDurations = Array(imagesToUse.length).fill(finalImageDuration);
    }
    
    const imageInputArgs: string[] = [];
    const filterComplex: string[] = [];
    const videoStreams: string[] = [];

    // Image inputs and zoompan filters
    imagesToUse.forEach((_, i) => {
        const inputIndex = i;
        const duration = imageDurations[i];
        imageInputArgs.push(`-loop 1 -t ${duration} -i "images/img_${String(i).padStart(3, '0')}.png"`);
        
        filterComplex.push(
            `[${inputIndex}:v]scale=1280:720,format=pix_fmts=yuv420p,zoompan=z='min(zoom+0.001,1.1)':d=${Math.ceil(FPS * duration)}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'[v${i}]`
        );
        videoStreams.push(`[v${i}]`);
    });

    // Concat video streams
    filterComplex.push(`${videoStreams.join('')}concat=n=${imagesToUse.length}:v=1:a=0[concatv]`);
    
    // The main audio track will be the input right after the images
    let audioInputStreamMap = `${imagesToUse.length}:a`;
    let lastAudioStreamLabel = `[${audioInputStreamMap}]`;

    // SFX inputs and mixing
    const sfxInputArgs: string[] = [];
    let estimatedTimeCursor = 0;
    const CHARS_PER_SECOND = 15;
    let sfxInputIndex = imagesToUse.length + 1; // After all images and main audio
    const allScriptLines = podcast.chapters.flatMap(c => c.script);
    
    for (const line of allScriptLines) {
        if (line.speaker.toUpperCase() !== 'SFX' && line.text) {
             estimatedTimeCursor += Math.max(1, line.text.length / CHARS_PER_SECOND);
        } else if (line.speaker.toUpperCase() === 'SFX' && line.soundEffect) {
            const sfxFilename = `sfx/sfx_${line.soundEffect.id}.mp3`;
            const sfxVolume = line.soundEffectVolume ?? 0.5;
            const startTime = estimatedTimeCursor;
            
            sfxInputArgs.push(`-i "${sfxFilename}"`);
            
            const sfxStreamLabel = `[${sfxInputIndex}:a]`;
            const nextAudioStreamLabel = `[amixout_${sfxInputIndex}]`;

            filterComplex.push(
                `${sfxStreamLabel}adelay=${startTime * 1000}|${startTime * 1000},volume=${sfxVolume}[sfxdelayed_${sfxInputIndex}]`
            );
            filterComplex.push(
                `${lastAudioStreamLabel}[sfxdelayed_${sfxInputIndex}]amix=inputs=2:duration=longest${nextAudioStreamLabel}`
            );
            
            lastAudioStreamLabel = nextAudioStreamLabel;
            sfxInputIndex++;
        }
    }
    
    // Subtitles filter
    filterComplex.push(`[concatv]subtitles=subtitles.srt:force_style='FontName=Inter,FontSize=32,PrimaryColour=&HFFFFFF&,OutlineColour=&H000000&,BorderStyle=3,Outline=4,Shadow=2'[outv]`);
    
    const finalFilterComplex = filterComplex.join(';\n');

    return {
        imageInputArgs,
        sfxInputArgs,
        filterComplex: finalFilterComplex,
        finalAudioMap: lastAudioStreamLabel,
    };
};
