import React, { useState, useEffect, useRef, useCallback } from 'react';
import type { YoutubeThumbnail, TextOptions } from '../types';
import { drawCanvas, loadGoogleFont } from '../services/canvasUtils';
import { CloseIcon } from './Icons';
import FontAutocompleteInput from './FontAutocompleteInput';

interface ThumbnailEditorProps {
    thumbnail: YoutubeThumbnail;
    baseImageSrc: string;
    onSave: (updatedThumbnail: YoutubeThumbnail) => void;
    onClose: () => void;
}

const ThumbnailEditor: React.FC<ThumbnailEditorProps> = ({ thumbnail, baseImageSrc, onSave, onClose }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const imageRef = useRef<HTMLImageElement | null>(null);
    const [options, setOptions] = useState<TextOptions>(thumbnail.options);
    const [isDragging, setIsDragging] = useState(false);
    const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
    const [isFontLoading, setIsFontLoading] = useState(false);
    
    // Debounce font loading
    useEffect(() => {
        const handler = setTimeout(() => {
            if (options.fontFamily) {
                setIsFontLoading(true);
                loadGoogleFont(options.fontFamily).then(() => {
                    redrawCanvas();
                    setIsFontLoading(false);
                });
            }
        }, 300); // 300ms delay

        return () => clearTimeout(handler);
    }, [options.fontFamily]);


    const redrawCanvas = useCallback(() => {
        if (!canvasRef.current || !imageRef.current || isFontLoading) return;
        // FIX: Cast canvasRef.current to access getContext.
        const ctx = (canvasRef.current as any).getContext('2d');
        if (ctx) {
            drawCanvas(ctx, imageRef.current, options);
        }
    }, [options, isFontLoading]);

    useEffect(() => {
        // FIX: Use `window.Image` to resolve missing DOM type error.
        const img = new (window as any).Image();
        img.crossOrigin = "anonymous";
        img.src = baseImageSrc;
        img.onload = () => {
            imageRef.current = img;
            redrawCanvas();
        };
    }, [baseImageSrc, redrawCanvas]);
    
    useEffect(() => {
        redrawCanvas();
    }, [options, redrawCanvas]);

    const handleOptionChange = <K extends keyof TextOptions>(key: K, value: TextOptions[K]) => {
        setOptions(prev => ({ ...prev, [key]: value }));
    };

    const handleShadowChange = <K extends keyof TextOptions['shadow']>(key: K, value: TextOptions['shadow'][K]) => {
        setOptions(prev => ({ ...prev, shadow: { ...prev.shadow, [key]: value } }));
    };

    const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        // FIX: Cast canvas to `any` to access DOM properties.
        const rect = (canvas as any).getBoundingClientRect();
        const x = (e.clientX - rect.left) * ((canvas as any).width / rect.width);
        const y = (e.clientY - rect.top) * ((canvas as any).height / rect.height);
        setIsDragging(true);
        setDragStart({ x: x - options.position.x, y: y - options.position.y });
    };

    const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
        if (!isDragging) return;
        const canvas = canvasRef.current;
        if (!canvas) return;
        // FIX: Cast canvas to `any` to access DOM properties.
        const rect = (canvas as any).getBoundingClientRect();
        const x = (e.clientX - rect.left) * ((canvas as any).width / rect.width);
        const y = (e.clientY - rect.top) * ((canvas as any).height / rect.height);
        handleOptionChange('position', { x: x - dragStart.x, y: y - dragStart.y });
    };

    const handleMouseUp = () => setIsDragging(false);
    const handleMouseLeave = () => setIsDragging(false);

    const handleSave = () => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        onSave({
            ...thumbnail,
            options,
            // FIX: Cast canvas to `any` to access toDataURL.
            dataUrl: (canvas as any).toDataURL('image/png'),
        });
    };

    return (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
            <div className="bg-slate-900/80 backdrop-blur-lg rounded-lg shadow-2xl w-full max-w-6xl h-full max-h-[90vh] flex flex-col md:flex-row overflow-hidden border border-slate-700">
                {/* Controls Panel */}
                <div className="w-full md:w-80 p-4 bg-slate-950/80 overflow-y-auto flex-shrink-0">
                    <h3 className="text-xl font-bold text-white mb-6">Редактор обложки</h3>
                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-slate-300">Текст</label>
                            {/* FIX: Cast e.currentTarget to any to access value property due to missing DOM types. */}
                            <textarea value={options.text} onChange={(e) => handleOptionChange('text', (e.currentTarget as any).value)} className="w-full bg-slate-800 border border-slate-600 rounded-md p-2 text-white mt-1" rows={3}/>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-300">Шрифт (Google Fonts)</label>
                             <FontAutocompleteInput 
                                value={options.fontFamily}
                                onChange={(font) => handleOptionChange('fontFamily', font)}
                             />
                        </div>
                        <div className="flex items-center gap-4">
                           <div className="flex-1">
                                <label className="block text-sm font-medium text-slate-300">Размер</label>
                                {/* FIX: Cast e.currentTarget to any to access value property due to missing DOM types. */}
                                <input type="range" min="30" max="200" value={options.fontSize} onChange={(e) => handleOptionChange('fontSize', Number((e.currentTarget as any).value))} className="w-full mt-1"/>
                            </div>
                             {/* FIX: Cast e.currentTarget to any to access value property due to missing DOM types. */}
                             <input type="number" value={options.fontSize} onChange={(e) => handleOptionChange('fontSize', Number((e.currentTarget as any).value))} className="w-20 bg-slate-800 border border-slate-600 rounded-md p-2 text-white"/>
                        </div>
                        <div className="flex items-center gap-4">
                             <label className="block text-sm font-medium text-slate-300">Цвет</label>
                             {/* FIX: Cast e.currentTarget to any to access value property due to missing DOM types. */}
                             <input type="color" value={options.fillStyle} onChange={(e) => handleOptionChange('fillStyle', (e.currentTarget as any).value)} className="w-10 h-10 bg-transparent border-none rounded"/>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-300">Выравнивание</label>
                            {/* FIX: Cast e.currentTarget to any to access value property due to missing DOM types. */}
                            <select value={options.textAlign} onChange={(e) => handleOptionChange('textAlign', (e.currentTarget as any).value as TextOptions['textAlign'])} className="w-full bg-slate-800 border border-slate-600 rounded-md p-2 text-white mt-1">
                                <option value="left">По левому краю</option>
                                <option value="center">По центру</option>
                                <option value="right">По правому краю</option>
                            </select>
                        </div>

                         <div className="border-t border-slate-700 pt-4">
                            <h4 className="text-lg font-semibold text-white mb-2">Обводка</h4>
                             <div className="flex items-center gap-4 mb-2">
                                 <label className="block text-sm font-medium text-slate-300">Цвет</label>
                                 {/* FIX: Cast e.currentTarget to any to access value property due to missing DOM types. */}
                                 <input type="color" value={options.strokeColor || '#000000'} onChange={(e) => handleOptionChange('strokeColor', (e.currentTarget as any).value)} className="w-10 h-10 bg-transparent border-none rounded"/>
                             </div>
                             <div>
                                <label className="block text-sm font-medium text-slate-300">Толщина: {options.strokeWidth || 0}px</label>
                                {/* FIX: Cast e.currentTarget to any to access value property due to missing DOM types. */}
                                <input type="range" min="0" max="30" value={options.strokeWidth || 0} onChange={(e) => handleOptionChange('strokeWidth', Number((e.currentTarget as any).value))} className="w-full mt-1"/>
                            </div>
                        </div>

                         <div className="border-t border-slate-700 pt-4">
                            <h4 className="text-lg font-semibold text-white mb-2">Тень</h4>
                            <div className="flex items-center gap-4 mb-2">
                                 <label className="block text-sm font-medium text-slate-300">Цвет</label>
                                 {/* FIX: Cast e.currentTarget to any to access value property due to missing DOM types. */}
                                 <input type="color" value={options.shadow.color} onChange={(e) => handleShadowChange('color', (e.currentTarget as any).value)} className="w-10 h-10 bg-transparent border-none rounded"/>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-300">Размытие: {options.shadow.blur}px</label>
                                {/* FIX: Cast e.currentTarget to any to access value property due to missing DOM types. */}
                                <input type="range" min="0" max="50" value={options.shadow.blur} onChange={(e) => handleShadowChange('blur', Number((e.currentTarget as any).value))} className="w-full mt-1"/>
                            </div>
                             <div>
                                <label className="block text-sm font-medium text-slate-300">Смещение X: {options.shadow.offsetX}px</label>
                                {/* FIX: Cast e.currentTarget to any to access value property due to missing DOM types. */}
                                <input type="range" min="-20" max="20" value={options.shadow.offsetX} onChange={(e) => handleShadowChange('offsetX', Number((e.currentTarget as any).value))} className="w-full mt-1"/>
                            </div>
                             <div>
                                <label className="block text-sm font-medium text-slate-300">Смещение Y: {options.shadow.offsetY}px</label>
                                {/* FIX: Cast e.currentTarget to any to access value property due to missing DOM types. */}
                                <input type="range" min="-20" max="20" value={options.shadow.offsetY} onChange={(e) => handleShadowChange('offsetY', Number((e.currentTarget as any).value))} className="w-full mt-1"/>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Canvas Area */}
                <div className="flex-1 flex flex-col p-4">
                     <div className="flex justify-end mb-4">
                         <button onClick={onClose} className="p-2 text-slate-400 hover:text-white"><CloseIcon/></button>
                    </div>
                    <div className="flex-1 flex items-center justify-center bg-black/50 rounded-lg overflow-hidden">
                       <canvas
                            ref={canvasRef}
                            width={1280}
                            height={720}
                            className="w-full h-auto object-contain cursor-move"
                            onMouseDown={handleMouseDown}
                            onMouseMove={handleMouseMove}
                            onMouseUp={handleMouseUp}
                            onMouseLeave={handleMouseLeave}
                        />
                    </div>
                     <div className="flex justify-end gap-4 mt-4">
                        <button onClick={onClose} className="px-6 py-2 bg-slate-600 text-white font-bold rounded-lg hover:bg-slate-700">Отмена</button>
                        <button onClick={handleSave} className="px-6 py-2 bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-bold rounded-lg hover:from-cyan-400 hover:to-blue-500">Сохранить</button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ThumbnailEditor;