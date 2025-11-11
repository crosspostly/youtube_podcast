// A simple key-value store using IndexedDB for persistent caching.
const DB_NAME = 'MysticNarrativesCache';
const STORE_NAME = 'VoicePreviews';
const DB_VERSION = 1;

let dbPromise: Promise<IDBDatabase> | null = null;

const getDb = (): Promise<IDBDatabase> => {
    if (!dbPromise) {
        dbPromise = new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);

            request.onerror = () => {
                console.error("IndexedDB error:", request.error);
                reject("Error opening IndexedDB.");
                dbPromise = null; // Allow retrying
            };

            request.onsuccess = () => {
                resolve(request.result);
            };

            request.onupgradeneeded = (event) => {
                const db = (event.target as IDBOpenDBRequest).result;
                if (!db.objectStoreNames.contains(STORE_NAME)) {
                    db.createObjectStore(STORE_NAME);
                }
            };
        });
    }
    return dbPromise;
};

export const initDB = async (): Promise<void> => {
    try {
        await getDb();
        console.log("Database initialized successfully.");
    } catch (error) {
        console.error("Failed to initialize database:", error);
    }
};


export const saveVoiceToCache = async (voiceId: string, blob: Blob): Promise<void> => {
    try {
        const db = await getDb();
        const transaction = db.transaction(STORE_NAME, 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        store.put(blob, voiceId);
        return new Promise((resolve, reject) => {
            transaction.oncomplete = () => resolve();
            transaction.onerror = () => reject(transaction.error);
        });
    } catch (error) {
        console.error("Failed to save voice to cache:", error);
    }
};

export const getVoiceFromCache = async (voiceId: string): Promise<Blob | undefined> => {
    try {
        const db = await getDb();
        const transaction = db.transaction(STORE_NAME, 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.get(voiceId);

        return new Promise((resolve, reject) => {
            request.onsuccess = () => {
                resolve(request.result as Blob | undefined);
            };
            request.onerror = () => {
                reject(request.error);
            };
        });
    } catch (error) {
        console.error("Failed to get voice from cache:", error);
        return undefined;
    }
};
