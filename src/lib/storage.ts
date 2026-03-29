import type { HistoryRecord } from '../types';

const API_KEY_STORAGE_KEY = 'promptograph.apiKey';
const HISTORY_DB_NAME = 'promptograph-db';
const HISTORY_STORE_NAME = 'history-records';
const HISTORY_DB_VERSION = 1;

export function loadStoredApiKey(): string {
  return window.localStorage.getItem(API_KEY_STORAGE_KEY) ?? '';
}

export function saveStoredApiKey(apiKey: string): void {
  if (apiKey) {
    window.localStorage.setItem(API_KEY_STORAGE_KEY, apiKey);
    return;
  }

  window.localStorage.removeItem(API_KEY_STORAGE_KEY);
}

function openHistoryDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(HISTORY_DB_NAME, HISTORY_DB_VERSION);

    request.onerror = () => reject(request.error ?? new Error('Could not open IndexedDB.'));
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(HISTORY_STORE_NAME)) {
        const store = database.createObjectStore(HISTORY_STORE_NAME, { keyPath: 'id' });
        store.createIndex('createdAt', 'createdAt', { unique: false });
      }
    };
  });
}

function runTransaction<T>(
  mode: IDBTransactionMode,
  handler: (store: IDBObjectStore, resolve: (value: T) => void, reject: (reason?: unknown) => void) => void,
): Promise<T> {
  return new Promise(async (resolve, reject) => {
    try {
      const database = await openHistoryDb();
      const transaction = database.transaction(HISTORY_STORE_NAME, mode);
      const store = transaction.objectStore(HISTORY_STORE_NAME);

      transaction.oncomplete = () => database.close();
      transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB transaction failed.'));
      transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB transaction aborted.'));

      handler(store, resolve, reject);
    } catch (error) {
      reject(error);
    }
  });
}

export async function loadHistoryRecords(): Promise<HistoryRecord[]> {
  try {
    const records = await runTransaction<HistoryRecord[]>('readonly', (store, resolve, reject) => {
      const request = store.getAll();
      request.onerror = () => reject(request.error ?? new Error('Could not load history.'));
      request.onsuccess = () => resolve((request.result as HistoryRecord[]) ?? []);
    });

    return records.sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  } catch {
    return [];
  }
}

export async function saveHistoryRecord(record: HistoryRecord): Promise<void> {
  await runTransaction<void>('readwrite', (store, resolve, reject) => {
    const request = store.put(record);
    request.onerror = () => reject(request.error ?? new Error('Could not save history record.'));
    request.onsuccess = () => resolve();
  });
}

export async function clearHistoryRecords(): Promise<void> {
  await runTransaction<void>('readwrite', (store, resolve, reject) => {
    const request = store.clear();
    request.onerror = () => reject(request.error ?? new Error('Could not clear history records.'));
    request.onsuccess = () => resolve();
  });
}
