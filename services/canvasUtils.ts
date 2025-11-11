import type { TextOptions } from '../types';

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


export const drawCanvas = (
  context: CanvasRenderingContext2D,
  baseImage: HTMLImageElement,
  options: TextOptions
): void => {
    const { width, height } = context.canvas;
    context.clearRect(0, 0, width, height);
    context.drawImage(baseImage, 0, 0, width, height);
    
    // Apply overlay
    if (options.overlayColor && options.overlayColor !== 'transparent') {
        context.fillStyle = options.overlayColor;
        context.fillRect(0, 0, width, height);
    }
    
    // Set text styles
    context.font = `bold ${options.fontSize}px ${options.fontFamily}`;
    context.fillStyle = options.fillStyle;
    context.textAlign = options.textAlign;
    context.textBaseline = 'middle';
    
    // Apply shadow
    if (options.shadow && options.shadow.color !== 'transparent') {
        context.shadowColor = options.shadow.color;
        context.shadowBlur = options.shadow.blur;
        context.shadowOffsetX = options.shadow.offsetX;
        context.shadowOffsetY = options.shadow.offsetY;
    }

    // Wrap text and draw
    const lines = wrapText(context, options.text, width * 0.9);
    const lineHeight = options.fontSize * 1.2;
    const totalTextHeight = lines.length * lineHeight;

    // Center the whole text block vertically
    const startY = options.position.y - (totalTextHeight / 2) + (lineHeight / 2);

    lines.forEach((line, i) => {
        context.fillText(line, options.position.x, startY + (i * lineHeight));
    });
    
    // Reset shadow for subsequent draws
    context.shadowColor = 'transparent';
    context.shadowBlur = 0;
    context.shadowOffsetX = 0;
    context.shadowOffsetY = 0;
};
