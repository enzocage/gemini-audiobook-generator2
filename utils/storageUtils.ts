const DB_NAME = 'GeminiAudiobookStudioDB';
const DB_VERSION = 1;
const CHUNK_STORE = 'audio_chunks';
const META_STORE = 'project_meta';

export interface StoredChunkRecord {
  chunkIndex: number;
  textHash: string;
  mp3Blob: Blob;
  durationSec: number;
  byteSize: number;
  wordCount: number;
  createdAt: number;
}

export interface StoredProjectMeta {
  id: string;
  projectName: string;
  text: string;
  chunkTargetWords: number;
  voice: string;
  model: string;
  updatedAt: number;
}

const openDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(CHUNK_STORE)) {
        db.createObjectStore(CHUNK_STORE, { keyPath: 'chunkIndex' });
      }
      if (!db.objectStoreNames.contains(META_STORE)) {
        db.createObjectStore(META_STORE, { keyPath: 'id' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

export const computeSimpleHash = (str: string): string => {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 33) ^ str.charCodeAt(i);
  }
  return (hash >>> 0).toString(16);
};

export const saveChunkToDisk = async (record: StoredChunkRecord): Promise<void> => {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(CHUNK_STORE, 'readwrite');
      const store = tx.objectStore(CHUNK_STORE);
      store.put(record);
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        reject(tx.error);
      };
    });
  } catch (err) {
    console.warn('IndexedDB saveChunkToDisk error:', err);
  }
};

export const loadAllChunksFromDisk = async (): Promise<StoredChunkRecord[]> => {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(CHUNK_STORE, 'readonly');
      const store = tx.objectStore(CHUNK_STORE);
      const req = store.getAll();
      req.onsuccess = () => {
        db.close();
        const records = (req.result as StoredChunkRecord[]) || [];
        records.sort((a, b) => a.chunkIndex - b.chunkIndex);
        resolve(records);
      };
      req.onerror = () => {
        db.close();
        reject(req.error);
      };
    });
  } catch (err) {
    console.warn('IndexedDB loadAllChunksFromDisk error:', err);
    return [];
  }
};

export const clearAllChunksFromDisk = async (): Promise<void> => {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(CHUNK_STORE, 'readwrite');
      const store = tx.objectStore(CHUNK_STORE);
      store.clear();
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        reject(tx.error);
      };
    });
  } catch (err) {
    console.warn('IndexedDB clearAllChunksFromDisk error:', err);
  }
};

export const saveProjectMetaToDisk = async (meta: StoredProjectMeta): Promise<void> => {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(META_STORE, 'readwrite');
      const store = tx.objectStore(META_STORE);
      store.put(meta);
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        reject(tx.error);
      };
    });
  } catch (err) {
    console.warn('IndexedDB saveProjectMetaToDisk error:', err);
  }
};

export const loadProjectMetaFromDisk = async (): Promise<StoredProjectMeta | null> => {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(META_STORE, 'readonly');
      const store = tx.objectStore(META_STORE);
      const req = store.get('current');
      req.onsuccess = () => {
        db.close();
        resolve((req.result as StoredProjectMeta) || null);
      };
      req.onerror = () => {
        db.close();
        reject(req.error);
      };
    });
  } catch (err) {
    console.warn('IndexedDB loadProjectMetaFromDisk error:', err);
    return null;
  }
};
