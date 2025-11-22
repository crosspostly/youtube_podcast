import React, { useCallback } from 'react';
import { drawCanvas } from '../../services/canvasUtils';
import type { Podcast, YoutubeThumbnail } from '../../types';

export const useThumbnailManagement = (
    podcast: Podcast | null,
    setPodcast: (updater: React.SetStateAction<Podcast | null>) => void
) => {
    const handleTitleSelection = useCallback(async (newTitle: string) => {
        if (!podcast || podcast.selectedTitle === newTitle) return;
        setPodcast(p => p ? { ...p, selectedTitle: newTitle } : null);
    }, [podcast, setPodcast]);
    
    const updateThumbnailText = useCallback(async (newText: string) => {
        if (!podcast) return;
        
        setPodcast(p => p ? { ...p, thumbnailText: newText } : null);
        
        const baseImageSrc = podcast.chapters[0]?.images?.[0] || podcast.generatedImages?.[0];
        if (!baseImageSrc || !podcast.youtubeThumbnails) return;
        
        try {
            const img = new Image();
            img.crossOrigin = "anonymous";
            img.src = baseImageSrc;
            await new Promise((resolve, reject) => { img.onload = resolve; img.onerror = reject; });

            const canvas = document.createElement('canvas');
            canvas.width = 1280;
            canvas.height = 720;
            const ctx = canvas.getContext('2d');
            if(!ctx) return;

            const updatedThumbnails = await Promise.all(podcast.youtubeThumbnails.map(async (thumb) => {
                 const newOptions = { ...thumb.options, text: newText };
                 await drawCanvas(ctx, img, newOptions);
                 return { ...thumb, options: newOptions, dataUrl: canvas.toDataURL('image/png') };
            }));

            setPodcast(p => p ? { ...p, youtubeThumbnails: updatedThumbnails } : null);
        } catch (e) {
            console.error("Failed to refresh thumbnails with new text", e);
        }
    }, [podcast, setPodcast]);

    const saveThumbnail = (updatedThumbnail: YoutubeThumbnail) => {
        setPodcast(p => {
            if (!p || !p.youtubeThumbnails) return p;
            return { ...p, youtubeThumbnails: p.youtubeThumbnails.map(t => t.styleName === updatedThumbnail.styleName ? updatedThumbnail : t) };
        });
    };

    return {
        handleTitleSelection,
        updateThumbnailText,
        saveThumbnail,
    };
};
