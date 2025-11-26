// hooks/useAvailableVoices.ts
import { useEffect, useState } from 'react';
import { fetchAvailableVoices, getCachedVoices, cacheVoices } from '../services/voicesService';
import type { Voice, LogEntry } from '../types';

type LogFunction = (entry: Omit<LogEntry, 'timestamp'>) => void;

/**
 * Hook for fetching and managing available Google Gemini voices
 * Provides dynamic voice fetching with caching and fallback to static list
 */
export const useAvailableVoices = (log: LogFunction) => {
    const [voices, setVoices] = useState<Voice[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const loadVoices = async () => {
            try {
                setLoading(true);
                setError(null);
                
                // First, try to get cached voices
                const cachedVoices = getCachedVoices();
                if (cachedVoices) {
                    log({ type: 'info', message: 'Using cached voices' });
                    setVoices(cachedVoices);
                    setLoading(false);
                    return;
                }
                
                // If no cache, fetch from API
                log({ type: 'info', message: 'Fetching voices from Google Gemini API...' });
                const fetchedVoices = await fetchAvailableVoices(log);
                
                setVoices(fetchedVoices);
                cacheVoices(fetchedVoices);
                log({ type: 'info', message: `Successfully loaded ${fetchedVoices.length} voices` });
                
            } catch (err) {
                const errorMessage = err instanceof Error ? err.message : 'Failed to fetch voices';
                setError(errorMessage);
                log({ type: 'error', message: errorMessage, data: err });
            } finally {
                setLoading(false);
            }
        };

        loadVoices();
    }, [log]);

    /**
     * Refreshes the voice list from the API
     */
    const refreshVoices = async () => {
        try {
            setLoading(true);
            setError(null);
            
            log({ type: 'info', message: 'Refreshing voices from API...' });
            const fetchedVoices = await fetchAvailableVoices(log);
            
            setVoices(fetchedVoices);
            cacheVoices(fetchedVoices);
            log({ type: 'info', message: `Successfully refreshed ${fetchedVoices.length} voices` });
            
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : 'Failed to refresh voices';
            setError(errorMessage);
            log({ type: 'error', message: errorMessage, data: err });
        } finally {
            setLoading(false);
        }
    };

    return { 
        voices, 
        loading, 
        error, 
        refreshVoices
    };
};