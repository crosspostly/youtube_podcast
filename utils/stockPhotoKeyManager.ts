import type { StockPhotoKeyStatus } from '../types';

const BLOCK_DURATION = 60 * 60 * 1000; // 1 час блокировки при rate limit
const KEY_STATUS_STORAGE = 'stockPhotoKeyStatus';

export const getKeyStatus = (service: 'unsplash' | 'pexels'): StockPhotoKeyStatus => {
    try {
        // Cast `window` to `any` to access `localStorage` because DOM types are missing in the environment.
        const stored = (window as any).localStorage.getItem(KEY_STATUS_STORAGE);
        if (!stored || stored === 'undefined') return { service, isBlocked: false };
        
        const statuses = JSON.parse(stored);
        const status = statuses[service];
        
        // Проверить, не истекла ли блокировка
        if (status?.isBlocked && status.blockedUntil && Date.now() > status.blockedUntil) {
            // Автоматически разблокировать
            return { service, isBlocked: false };
        }
        
        return status || { service, isBlocked: false };
    } catch {
        return { service, isBlocked: false };
    }
};

export const blockKey = (service: 'unsplash' | 'pexels', errorMessage: string) => {
    try {
        // Cast `window` to `any` to access `localStorage` because DOM types are missing in the environment.
        const stored = (window as any).localStorage.getItem(KEY_STATUS_STORAGE);
        const statuses = stored && stored !== 'undefined' ? JSON.parse(stored) : {};
        
        statuses[service] = {
            service,
            isBlocked: true,
            blockedUntil: Date.now() + BLOCK_DURATION,
            lastError: errorMessage
        };
        
        (window as any).localStorage.setItem(KEY_STATUS_STORAGE, JSON.stringify(statuses));
    } catch (e) {
        console.error('Failed to block key:', e);
    }
};

export const unblockKey = (service: 'unsplash' | 'pexels') => {
    try {
        // Cast `window` to `any` to access `localStorage` because DOM types are missing in the environment.
        const stored = (window as any).localStorage.getItem(KEY_STATUS_STORAGE);
        const statuses = stored && stored !== 'undefined' ? JSON.parse(stored) : {};
        
        if (statuses[service]) {
            statuses[service].isBlocked = false;
            statuses[service].blockedUntil = undefined;
        }
        
        (window as any).localStorage.setItem(KEY_STATUS_STORAGE, JSON.stringify(statuses));
    } catch (e) {
        console.error('Failed to unblock key:', e);
    }
};