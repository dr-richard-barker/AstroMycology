// Tiny promise wrapper over IndexedDB for locally-uploaded image/scan sources.
// Two stores:
// - "sources": metadata for an uploaded batch, keyed by id.
// - "images": compressed image blobs (and raw 3D-scan file blobs), keyed by
//   `${sourceId}::${filename}`.

const DB_NAME = 'astromycology-local';
const VERSION = 3;

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('sources')) db.createObjectStore('sources', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('images')) db.createObjectStore('images');
      // Superseded by the in-app 3D viewer — drop the old RSML trace store.
      if (db.objectStoreNames.contains('rsml')) db.deleteObjectStore('rsml');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  return open().then(db => new Promise<T>((resolve, reject) => {
    const t = db.transaction(store, mode);
    const req = fn(t.objectStore(store));
    req.onsuccess = () => resolve(req.result as T);
    req.onerror = () => reject(req.error);
    t.oncomplete = () => db.close();
  }));
}

export const idbPut = (store: string, value: any, key?: IDBValidKey) =>
  tx<void>(store, 'readwrite', s => (key !== undefined ? s.put(value, key) : s.put(value)));
export const idbGet = <T>(store: string, key: IDBValidKey) => tx<T>(store, 'readonly', s => s.get(key));
export const idbGetAll = <T>(store: string) => tx<T[]>(store, 'readonly', s => s.getAll());
export const idbDelete = (store: string, key: IDBValidKey) => tx<void>(store, 'readwrite', s => s.delete(key));

// Delete a source record + all of its image blobs.
export async function idbDeleteSource(id: string): Promise<void> {
  const db = await open();
  await new Promise<void>((resolve, reject) => {
    const t = db.transaction(['sources', 'images'], 'readwrite');
    t.objectStore('sources').delete(id);
    const imgs = t.objectStore('images');
    const cursor = imgs.openKeyCursor();
    cursor.onsuccess = () => {
      const c = cursor.result;
      if (c) { if (String(c.key).startsWith(id + '::')) imgs.delete(c.key); c.continue(); }
    };
    t.oncomplete = () => { db.close(); resolve(); };
    t.onerror = () => reject(t.error);
  });
}
