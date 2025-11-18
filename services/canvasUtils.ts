import type { TextOptions } from '../types';
// Fix: Import proxy utility for loading cross-origin images to canvas.
import { getProxiedUrl } from './apiUtils';

// A cache to avoid re-fetching font CSS
const loadedFontStyles = new Set<string>();

export const loadGoogleFont = async (fontFamily: string): Promise<void> => {
    if (!fontFamily || document.fonts.check(`12px "${fontFamily}"`) || loadedFontStyles.has(fontFamily)) {
        return;
    }

    const fontQuery = fontFamily.replace(/ /g, '+');
    const fontUrl = `https://fonts.googleapis.com/css2?family=${fontQuery}:wght@400;700;800;900&display=swap`;

    try {
        // Using a more direct way to add stylesheet which is broadly supported
        if (!document.querySelector(`link[href="${fontUrl}"]`)) {
            const link = document.createElement('link');
            link.href = fontUrl;
            link.rel = 'stylesheet';
            document.head.appendChild(link);

            // Wait for the font to be loaded
            await new Promise((resolve, reject) => {
                link.onload = resolve;
                link.onerror = reject;
                setTimeout(() => reject(new Error(`Font loading timed out for ${fontFamily}`)), 3000);
            });
        }
        await document.fonts.load(`12px "${fontFamily}"`);
        loadedFontStyles.add(fontFamily);
    } catch (e) {
        console.error(`Failed to load Google Font: ${fontFamily}`, e);
        // Don't re-throw, just fall back to system font
    }
};

// Function to wrap text and draw it
const wrapAndDrawText = (context: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, lineHeight: number) => {
    const words = text.split(' ');
    let line = '';
    const lines = [];

    for (let n = 0; n < words.length; n++) {
        const testLine = line + words[n] + ' ';
        const metrics = context.measureText(testLine);
        const testWidth = metrics.width;
        if (testWidth > maxWidth && n > 0) {
            lines.push(line);
            line = words[n] + ' ';
        } else {
            line = testLine;
        }
    }
    lines.push(line);
    
    // Adjust Y position to be centered based on the number of lines
    const totalHeight = lines.length * lineHeight;
    let currentY = y - totalHeight / 2 + lineHeight / 2;

    for (let i = 0; i < lines.length; i++) {
        const trimmedLine = lines[i].trim();
        if (context.lineWidth > 0) {
            context.strokeText(trimmedLine, x, currentY);
        }
        context.fillText(trimmedLine, x, currentY);
        currentY += lineHeight;
    }
};

export const drawCanvas = async (
    ctx: CanvasRenderingContext2D,
    image: HTMLImageElement,
    options: TextOptions
): Promise<void> => {
    const canvas = ctx.canvas;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw background image
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

    // Draw overlay
    if (options.overlayColor) {
        ctx.fillStyle = options.overlayColor;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    // Prepare text
    const textToDraw = options.textTransform === 'uppercase' ? options.text.toUpperCase() : options.text;

    // Load font if needed
    if (options.fontFamily) {
        await loadGoogleFont(options.fontFamily);
    }

    // Set text styles
    ctx.font = `900 ${options.fontSize}px "${options.fontFamily}"`;
    ctx.textAlign = options.textAlign;
    ctx.textBaseline = 'middle';

    // Set shadow
    if (options.shadow) {
        ctx.shadowColor = options.shadow.color;
        ctx.shadowBlur = options.shadow.blur;
        ctx.shadowOffsetX = options.shadow.offsetX;
        ctx.shadowOffsetY = options.shadow.offsetY;
    }

    // Set fill style (solid or gradient)
    if (options.gradientColors && options.gradientColors.length >= 2) {
        const gradient = ctx.createLinearGradient(0, options.position.y - options.fontSize / 2, 0, options.position.y + options.fontSize / 2);
        gradient.addColorStop(0, options.gradientColors[0]);
        gradient.addColorStop(1, options.gradientColors[1]);
        ctx.fillStyle = gradient;
    } else {
        ctx.fillStyle = options.fillStyle;
    }

    // Set stroke style
    if (options.strokeColor && options.strokeWidth && options.strokeWidth > 0) {
        ctx.strokeStyle = options.strokeColor;
        ctx.lineWidth = options.strokeWidth;
    } else {
        ctx.lineWidth = 0;
        ctx.strokeStyle = 'transparent';
    }
    
    const maxWidth = canvas.width * 0.9;
    const lineHeight = options.fontSize * 1.1;
    wrapAndDrawText(ctx, textToDraw, options.position.x, options.position.y, maxWidth, lineHeight);

    // Reset shadow for next draw operations
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
};

export const cropToAspectRatio = (imageUrl: string, targetAspectRatio = 16 / 9): Promise<string> => {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            if (!ctx) {
                return reject(new Error('Could not get canvas context for cropping.'));
            }

            const sourceWidth = img.width;
            const sourceHeight = img.height;
            const sourceAspectRatio = sourceWidth / sourceHeight;

            let sx = 0, sy = 0, sWidth = sourceWidth, sHeight = sourceHeight;

            if (sourceAspectRatio > targetAspectRatio) {
                // Image is wider than target
                sWidth = sourceHeight * targetAspectRatio;
                sx = (sourceWidth - sWidth) / 2;
            } else if (sourceAspectRatio < targetAspectRatio) {
                // Image is taller than target
                sHeight = sourceWidth / targetAspectRatio;
                sy = (sourceHeight - sHeight) / 2;
            }

            canvas.width = 1280;
            canvas.height = Math.round(1280 / targetAspectRatio);
            
            ctx.drawImage(img, sx, sy, sWidth, sHeight, 0, 0, canvas.width, canvas.height);
            resolve(canvas.toDataURL('image/jpeg'));
        };
        img.onerror = (e) => reject(new Error(`Failed to load image for cropping from ${imageUrl}. Error: ${e}`));
        
        // Use proxy to avoid CORS issues
        img.src = getProxiedUrl(imageUrl);
    });
};
