import React, { useState, useEffect } from 'react';
import { GeneratedImage, StockPhotoApiKeys } from '../types';
import { SearchIcon, CloseIcon, CheckIcon } from './Icons';
import Spinner from './Spinner';

interface StockPhotoModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSelect: (image: GeneratedImage) => void;
    query: string;
    imageMode: 'unsplash' | 'pexels';
    apiKeys?: { unsplash?: string; pexels?: string; gemini?: string };
}

const StockPhotoModal: React.FC<StockPhotoModalProps> = ({ 
    isOpen, 
    onClose, 
    onSelect, 
    query, 
    imageMode,
    apiKeys
}) => {
    const [photos, setPhotos] = useState<GeneratedImage[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [selectedPhoto, setSelectedPhoto] = useState<GeneratedImage | null>(null);
    const [searchQuery, setSearchQuery] = useState(query);

    useEffect(() => {
        if (isOpen && searchQuery) {
            searchPhotos();
        }
    }, [isOpen, searchQuery, imageMode]);

    const searchPhotos = async () => {
        setLoading(true);
        setError(null);
        try {
            // Import dynamically to avoid circular dependencies
            const { searchStockPhotos } = await import('../services/stockPhotoService');
            
            if (!apiKeys?.unsplash && !apiKeys?.pexels) {
                throw new Error('API ключи для Unsplash/Pexels не настроены');
            }
            
            const results = await searchStockPhotos(
                searchQuery, 
                apiKeys || {}, 
                apiKeys?.gemini || '', 
                imageMode, 
                (entry) => console.log('Stock photo search:', entry)
            );
            setPhotos(results);
        } catch (err: any) {
            setError(err.message || 'Ошибка поиска фотографий');
        } finally {
            setLoading(false);
        }
    };

    const handleSelect = () => {
        if (selectedPhoto) {
            onSelect(selectedPhoto);
            onClose();
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-slate-900 rounded-xl border border-slate-700 max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
                <div className="flex items-center justify-between p-6 border-b border-slate-700">
                    <h2 className="text-xl font-bold text-white">
                        Выбор фотографии из {imageMode === 'unsplash' ? 'Unsplash' : 'Pexels'}
                    </h2>
                    <button 
                        onClick={onClose}
                        className="p-2 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition-colors"
                    >
                        <CloseIcon className="w-5 h-5" />
                    </button>
                </div>

                <div className="p-6 border-b border-slate-700">
                    <div className="flex gap-4">
                        <div className="flex-1 relative">
                            <SearchIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-slate-400" />
                            <input
                                type="text"
                                value={searchQuery}
                                // FIX: Cast e.target to any to access value property due to missing DOM types.
                                onChange={(e) => setSearchQuery((e.target as any).value)}
                                onKeyPress={(e) => e.key === 'Enter' && searchPhotos()}
                                placeholder="Поиск фотографий..."
                                className="w-full pl-10 pr-4 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                            />
                        </div>
                        <button
                            onClick={searchPhotos}
                            disabled={loading}
                            className="px-6 py-2 bg-cyan-600 text-white rounded-lg hover:bg-cyan-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
                        >
                            {loading ? <Spinner className="w-4 h-4" /> : <SearchIcon className="w-4 h-4" />}
                            Поиск
                        </button>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-6">
                    {loading && (
                        <div className="flex justify-center items-center h-64">
                            <Spinner />
                        </div>
                    )}
                    
                    {error && (
                        <div className="text-center text-red-400 py-8">
                            <p>{error}</p>
                        </div>
                    )}

                    {!loading && !error && photos.length === 0 && (
                        <div className="text-center text-slate-400 py-8">
                            <p>Фотографии не найдены. Попробуйте изменить запрос.</p>
                        </div>
                    )}

                    {!loading && !error && photos.length > 0 && (
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                            {photos.map((photo, index) => (
                                <div
                                    key={index}
                                    onClick={() => setSelectedPhoto(photo)}
                                    className={`relative cursor-pointer rounded-lg overflow-hidden border-2 transition-all ${
                                        selectedPhoto === photo 
                                            ? 'border-cyan-500 shadow-lg shadow-cyan-500/20' 
                                            : 'border-transparent hover:border-slate-500'
                                    }`}
                                >
                                    <img 
                                        src={photo.url} 
                                        alt={`Фото ${index + 1}`}
                                        className="w-full h-48 object-cover"
                                    />
                                    {selectedPhoto === photo && (
                                        <div className="absolute top-2 right-2 bg-cyan-500 rounded-full p-1">
                                            <CheckIcon className="w-4 h-4 text-white" />
                                        </div>
                                    )}
                                    <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-2">
                                        <p className="text-xs text-white truncate">
                                            {photo.photographer && (
                                                <>Photo by <span className="font-semibold">{photo.photographer}</span></>
                                            )}
                                        </p>
                                        <p className="text-xs text-slate-300">
                                            {photo.source}
                                        </p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                <div className="flex justify-between items-center p-6 border-t border-slate-700">
                    <div className="text-sm text-slate-400">
                        {photos.length > 0 && `Найдено: ${photos.length} фотографий`}
                    </div>
                    <div className="flex gap-4">
                        <button
                            onClick={onClose}
                            className="px-6 py-2 bg-slate-700 text-white rounded-lg hover:bg-slate-600 transition-colors"
                        >
                            Отмена
                        </button>
                        <button
                            onClick={handleSelect}
                            disabled={!selectedPhoto}
                            className="px-6 py-2 bg-cyan-600 text-white rounded-lg hover:bg-cyan-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                            Выбрать
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default StockPhotoModal;