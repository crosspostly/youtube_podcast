import type { TextOptions } from '../types';
import { fetchWithCorsFallback } from './apiUtils';

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

// Enhanced function to fit text within canvas bounds with automatic font scaling
const fitTextToCanvas = (
    ctx: CanvasRenderingContext2D,
    text: string,
    maxWidth: number,
    maxHeight: number,
    initialFontSize: number,
    fontFamily: string
): { fontSize: number; lines: string[] } => {
    let fontSize = initialFontSize;
    let lines: string[] = [];
    
    // Binary search for optimal font size
    while (fontSize > 16) { // Minimum font size
        ctx.font = `900 ${fontSize}px "${fontFamily}"`;
        lines = wrapText(ctx, text, maxWidth);
        
        const totalHeight = lines.length * (fontSize * 1.15);
        if (totalHeight <= maxHeight) break;
        
        fontSize -= 2;
    }
    
    return { fontSize, lines };
};

// Enhanced text wrapping function
const wrapText = (ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] => {
    const words = text.split(' ');
    const lines: string[] = [];
    let currentLine = words[0];
    
    for (let i = 1; i < words.length; i++) {
        const testLine = currentLine + ' ' + words[i];
        const metrics = ctx.measureText(testLine);
        
        if (metrics.width > maxWidth) {
            lines.push(currentLine);
            currentLine = words[i];
        } else {
            currentLine = testLine;
        }
    }
    lines.push(currentLine);
    
    return lines;
};

// Function to wrap text and draw it (legacy, kept for compatibility)
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
    // 1. CRITICAL FIX: Load font BEFORE clearing or drawing anything.
    // This prevents the "Ghosting" race condition where an async font load
    // causes a delayed draw to render on top of a subsequent draw.
    if (options.fontFamily) {
        await loadGoogleFont(options.fontFamily);
    }

    const canvas = ctx.canvas;
    
    // 2. Now that we are ready to draw, Clear the canvas completely.
    // This ensures this specific draw call owns the entire frame.
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 3. Draw background image
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

    // 4. Draw overlay
    if (options.overlayColor) {
        ctx.fillStyle = options.overlayColor;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    // Prepare text
    const textToDraw = options.textTransform === 'uppercase' ? options.text.toUpperCase() : options.text;

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
    let strokeWidth = 0;
    if (options.strokeColor && options.strokeWidth && options.strokeWidth > 0) {
        ctx.strokeStyle = options.strokeColor;
        ctx.lineWidth = options.strokeWidth;
        strokeWidth = options.strokeWidth;
    } else {
        ctx.lineWidth = 0;
        ctx.strokeStyle = 'transparent';
    }
    
    const maxWidth = canvas.width * 0.9;
    const maxHeight = canvas.height * 0.8; // Leave 20% margin top/bottom
    
    // Use enhanced text fitting with automatic scaling
    const { fontSize: fittedFontSize, lines } = fitTextToCanvas(
        ctx, 
        textToDraw, 
        maxWidth, 
        maxHeight, 
        options.fontSize, 
        options.fontFamily
    );
    
    // Update font size to the fitted size
    ctx.font = `900 ${fittedFontSize}px "${options.fontFamily}"`;
    
    // IMPROVED LINE HEIGHT CALCULATION
    const lineHeight = (fittedFontSize * 1.15) + (strokeWidth * 2.5);
    
    // Draw fitted text with proper alignment
    const totalHeight = lines.length * lineHeight;
    let currentY = options.position.y - totalHeight / 2 + lineHeight / 2;

    for (let i = 0; i < lines.length; i++) {
        const trimmedLine = lines[i].trim();
        
        // Apply text alignment
        let drawX = options.position.x;
        if (options.textAlign === 'center') {
            const metrics = ctx.measureText(trimmedLine);
            drawX = options.position.x - metrics.width / 2;
        } else if (options.textAlign === 'right') {
            const metrics = ctx.measureText(trimmedLine);
            drawX = options.position.x - metrics.width;
        }
        
        if (ctx.lineWidth > 0) {
            ctx.strokeText(trimmedLine, drawX, currentY);
        }
        ctx.fillText(trimmedLine, drawX, currentY);
        currentY += lineHeight;
    }

    // Reset shadow for next draw operations
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
};

export const cropToAspectRatio = (imageUrl: string, targetAspectRatio = 16 / 9): Promise<string> => {
    return new Promise(async (resolve, reject) => {
        try {
            const response = await fetchWithCorsFallback(imageUrl);
            const blob = await response.blob();
            const objectUrl = URL.createObjectURL(blob);

            const img = new Image();
            // crossOrigin is not needed for blob URLs
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                if (!ctx) {
                    URL.revokeObjectURL(objectUrl);
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
                URL.revokeObjectURL(objectUrl); // Cleanup
            };
            img.onerror = (e) => {
                URL.revokeObjectURL(objectUrl);
                reject(new Error(`Failed to load image for cropping from blob URL. Error: ${e}`));
            };
            img.src = objectUrl;
        } catch (err) {
            reject(new Error(`Failed to fetch image for cropping from ${imageUrl}. Error: ${err}`));
        }
    });
};