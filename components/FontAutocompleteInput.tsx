import React, { useState, useMemo, useRef, useEffect } from 'react';
import { GOOGLE_FONTS } from '../services/googleFonts';
import { SearchIcon } from './Icons';

interface FontAutocompleteInputProps {
    value: string;
    onChange: (newValue: string) => void;
    id?: string;
}

const FontAutocompleteInput: React.FC<FontAutocompleteInputProps> = ({ value, onChange, id }) => {
    const [searchTerm, setSearchTerm] = useState(value);
    const [suggestions, setSuggestions] = useState<string[]>([]);
    const [isOpen, setIsOpen] = useState(false);
    const wrapperRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        setSearchTerm(value); // Sync with external changes
    }, [value]);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, []);

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newSearchTerm = e.target.value;
        setSearchTerm(newSearchTerm);
        if (newSearchTerm.length > 1) {
            const filtered = GOOGLE_FONTS.filter(font =>
                font.toLowerCase().includes(newSearchTerm.toLowerCase())
            ).slice(0, 100); // Limit results for performance
            setSuggestions(filtered);
            setIsOpen(true);
        } else {
            setSuggestions([]);
            setIsOpen(false);
        }
        // Allow free-form input for fonts not in the list
        onChange(newSearchTerm);
    };

    const handleSuggestionClick = (font: string) => {
        onChange(font);
        setSearchTerm(font);
        setIsOpen(false);
        setSuggestions([]);
    };

    return (
        <div className="relative" ref={wrapperRef}>
            <div className="relative">
                 <input
                    id={id}
                    type="text"
                    value={searchTerm}
                    onChange={handleInputChange}
                    onFocus={() => { if (searchTerm) setIsOpen(true); }}
                    placeholder="Название шрифта из Google Fonts"
                    className="w-full bg-slate-800 border border-slate-600 rounded-md p-2 pl-8 text-white"
                />
                <SearchIcon className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none"/>
            </div>
            {isOpen && suggestions.length > 0 && (
                <ul className="absolute z-20 top-full mt-1 w-full bg-slate-700 border border-slate-600 rounded-md shadow-lg max-h-60 overflow-y-auto">
                    {suggestions.map(font => (
                        <li
                            key={font}
                            onClick={() => handleSuggestionClick(font)}
                            className="px-4 py-2 text-white hover:bg-cyan-600 cursor-pointer"
                        >
                            <span style={{ fontFamily: font }}>{font}</span>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
};

export default FontAutocompleteInput;