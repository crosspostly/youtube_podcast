import type { TextOptions } from '../types';

// A cache to avoid re-fetching font CSS
const loadedFontStyles = new Set<string>();

export const loadGoogleFont = async (fontFamily: string): Promise<void> => {
    if (!fontFamily || document.fonts.check(`12px "${fontFamily}"`) || loadedFontStyles.has(fontFamily)) {
        return;
    }

    const fontQuery = fontFamily.replace(/ /g, '+');
    const fontUrl = `https://fonts.googleapis.com/css2?family=${fontQuery}:wght@400;700&display=swap`;

    try {
        // Using a more direct way to add stylesheet which is broadly supported
        if (!document.querySelector(`link[href="${fontUrl}"]`)) {
            const link = document.createElement('link');
            link.href = fontUrl;
            link.rel = 'stylesheet';
            document.head.appendChild(link);
            
            // The Font Loading API is the most reliable way to wait
            await document.fonts.load(`bold 12px "${fontFamily}"`);
            loadedFontStyles.add(fontFamily);
        }
    } catch (error) {
        console.error(`Не удалось загрузить шрифт: ${fontFamily}`, error);
        // Don't throw, allow fallback to system font
    }
};


const wrapText = (context: CanvasRenderingContext2D, text: string, maxWidth: number): string[] => {
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
  context: CanvasRenderingContext2D,
  baseImage: HTMLImageElement,
  options: TextOptions
): Promise<void> => {
    const { width, height } = context.canvas;
    
    // Dynamically load the font before drawing anything
    await loadGoogleFont(options.fontFamily);

    context.clearRect(0, 0, width, height);
    context.drawImage(baseImage, 0, 0, width, height);
    
    if (options.overlayColor && options.overlayColor !== 'transparent') {
        context.fillStyle = options.overlayColor;
        context.fillRect(0, 0, width, height);
    }
    
    context.textAlign = options.textAlign;
    context.textBaseline = 'middle';

    const textToDraw = options.textTransform === 'uppercase' ? options.text.toUpperCase() : options.text;
    
    // --- Automatic Text Fitting Algorithm ---
    let currentFontSize = options.fontSize;
    let lines: string[];
    const maxWidth = width * 0.9; // 90% of canvas width
    const maxHeight = height * 0.9; // 90% of canvas height

    while (currentFontSize > 10) {
        context.font = `bold ${currentFontSize}px "${options.fontFamily}"`;
        lines = wrapText(context, textToDraw, maxWidth);
        const totalTextHeight = lines.length * (currentFontSize * 1.2);
        
        if (totalTextHeight < maxHeight) {
            break; // It fits vertically, stop reducing size
        }
        
        currentFontSize -= 5; // Reduce font size and try again
    }
    // --- End of Fitting Algorithm ---
    
    // Set final font size after fitting
    context.font = `bold ${currentFontSize}px "${options.fontFamily}"`;

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
        context.shadowBlur = options.shadow.blur;
        context.shadowOffsetX = options.shadow.offsetX;
        context.shadowOffsetY = options.shadow.offsetY;
    }

    const lineHeight = currentFontSize * 1.2;
    const totalTextHeight = lines.length * lineHeight;
    const startY = options.position.y - (totalTextHeight / 2) + (lineHeight / 2);

    lines.forEach((line, i) => {
        const yPos = startY + (i * lineHeight);
        context.fillText(line, options.position.x, yPos);

        if (options.strokeWidth && options.strokeWidth > 0 && options.strokeColor && options.strokeColor !== 'transparent') {
            context.strokeStyle = options.strokeColor;
            context.lineWidth = options.strokeWidth;
            context.lineJoin = 'round';
            context.shadowColor = 'transparent';
            context.strokeText(line, options.position.x, yPos);
            if (options.shadow && options.shadow.color !== 'transparent') {
                context.shadowColor = options.shadow.color;
            }
        }
    });
    
    context.shadowColor = 'transparent';
    context.shadowBlur = 0;
    context.shadowOffsetX = 0;
    context.shadowOffsetY = 0;
    context.strokeStyle = 'transparent';
    context.lineWidth = 0;
};
