import type { TextOptions } from '../types';

// A cache to avoid re-fetching font CSS
const loadedFontStyles = new Set<string>();

export const loadGoogleFont = async (fontFamily: string): Promise<void> => {
    // FIX: Cannot find name 'document'.
    if (!fontFamily || (window as any).document.fonts.check(`12px "${fontFamily}"`) || loadedFontStyles.has(fontFamily)) {
        return;
    }

    const fontQuery = fontFamily.replace(/ /g, '+');
    const fontUrl = `https://fonts.googleapis.com/css2?family=${fontQuery}:wght@400;700;800;900&display=swap`;

    try {
        // Using a more direct way to add stylesheet which is broadly supported
        // FIX: Cannot find name 'document'.
        if (!(window as any).document.querySelector(`link[href="${fontUrl}"]`)) {
            // FIX: Cannot find name 'document'.
            const link = (window as any).document.createElement('link');
            link.href = fontUrl;
            link.rel = 'stylesheet';
            // FIX: Cannot find name 'document'.
            (window as any).document.head.appendChild(link);
            
            // The Font Loading API is the most reliable way to wait
            // FIX: Cannot find name 'document'.
            await (window as any).document.fonts.load(`900 12px "${fontFamily}"`);
            loadedFontStyles.add(fontFamily);
        }
    } catch (error) {
        console.error(`Не удалось загрузить шрифт: ${fontFamily}`, error);
        // Don't throw, allow fallback to system font
    }
};


// FIX: Cannot find name 'CanvasRenderingContext2D'.
const wrapText = (context: any, text: string, maxWidth: number): string[] => {
    const words = text.split(' ');
    if (words.length === 0) return [];
    
    const lines = [];
    let currentLine = words[0];

    for (let i = 1; i < words.length; i++) {
        const word = words[i];
        const width = context.measureText(currentLine + " " + word).width;
        if (width < maxWidth) {
            currentLine += " " + word;
        } else {
            lines.push(currentLine);
            currentLine = word;
        }
    }
    lines.push(currentLine);
    return lines;
};


export const drawCanvas = async (
  // FIX: Cannot find name 'CanvasRenderingContext2D'.
  context: any,
  // FIX: Cannot find name 'HTMLImageElement'.
  baseImage: any,
  options: TextOptions
): Promise<void> => {
    const { width, height } = context.canvas;
    
    // Dynamically load the font before drawing anything
    await loadGoogleFont(options.fontFamily);

    context.clearRect(0, 0, width, height);
    context.drawImage(baseImage, 0, 0, width, height);
    
    context.textAlign = options.textAlign;
    context.textBaseline = 'middle';

    const textToDraw = options.textTransform === 'uppercase' ? options.text.toUpperCase() : options.text;
    
    // --- Automatic Text Fitting Algorithm ---
    let currentFontSize = options.fontSize;
    let lines: string[];
    const maxWidth = width * 0.9; // 90% of canvas width
    const maxHeight = height * 0.9; // 90% of canvas height

    while (currentFontSize > 10) {
        context.font = `900 ${currentFontSize}px "${options.fontFamily}"`; // Use a heavy font weight
        lines = wrapText(context, textToDraw, maxWidth);
        const totalTextHeight = lines.length * (currentFontSize * 1.2);
        
        if (totalTextHeight < maxHeight) {
            break; // It fits vertically, stop reducing size
        }
        
        currentFontSize -= 5; // Reduce font size and try again
    }
    // --- End of Fitting Algorithm ---
    
    // Set final font properties
    context.font = `900 ${currentFontSize}px "${options.fontFamily}"`;
    const lineHeight = currentFontSize * 1.2;
    const totalTextHeight = lines.length * lineHeight;
    const startY = options.position.y - (totalTextHeight / 2) + (lineHeight / 2);
    
    // --- NEW: Advanced Scrim for Readability ---
    // Instead of a global overlay, draw a localized gradient behind the text.
    // This makes the text pop without darkening the entire image.
    if (lines.length > 0) {
         const scrimGradient = context.createLinearGradient(0, 0, 0, height);
         scrimGradient.addColorStop(0, 'rgba(0,0,0,0)');
         scrimGradient.addColorStop(0.3, 'rgba(0,0,0,0)');
         scrimGradient.addColorStop(0.5, 'rgba(0,0,0,0.65)');
         scrimGradient.addColorStop(1, 'rgba(0,0,0,0.8)');
         context.fillStyle = scrimGradient;
         context.fillRect(0, 0, width, height);
    }

    // --- Text Rendering ---
    if (options.gradientColors && options.gradientColors.length >= 2) {
        const gradient = context.createLinearGradient(0, options.position.y - currentFontSize, 0, options.position.y + currentFontSize);
        gradient.addColorStop(0, options.gradientColors[0]);
        gradient.addColorStop(1, options.gradientColors[1]);
        context.fillStyle = gradient;
    } else {
        context.fillStyle = options.fillStyle;
    }
    
    if (options.shadow && options.shadow.color !== 'transparent') {
        context.shadowColor = options.shadow.color;
        context.shadowBlur = options.shadow.blur || 20; // Increased default
        context.shadowOffsetX = options.shadow.offsetX || 5;
        context.shadowOffsetY = options.shadow.offsetY || 5;
    }

    lines.forEach((line, i) => {
        const yPos = startY + (i * lineHeight);
        
        // Draw stroke first (background layer)
        if (options.strokeWidth && options.strokeWidth > 0 && options.strokeColor && options.strokeColor !== 'transparent') {
            context.strokeStyle = options.strokeColor;
            context.lineWidth = options.strokeWidth || 10; // Increased default
            context.lineJoin = 'round';
            // Draw stroke without shadow, so shadow is only on the main text fill
            const currentShadowColor = context.shadowColor;
            context.shadowColor = 'transparent';
            context.strokeText(line, options.position.x, yPos);
            context.shadowColor = currentShadowColor; // Restore shadow for fill
        }

        // Draw main text fill on top
        context.fillText(line, options.position.x, yPos);
    });
    
    // Reset all shadow and stroke properties to avoid affecting other draw calls
    context.shadowColor = 'transparent';
    context.shadowBlur = 0;
    context.shadowOffsetX = 0;
    context.shadowOffsetY = 0;
    context.strokeStyle = 'transparent';
    context.lineWidth = 0;
};