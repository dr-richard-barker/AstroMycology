// Analysis-results store, carried over from the CoSE image ecosystem's
// shared-origin pattern (AstroBotany + its sibling tools). Here the writer
// (the in-app 3D viewer) and reader (MarkerInspector) are the same app, so
// this is really just a local IndexedDB cache — kept as its own module
// because MarkerInspector's "Analysis results" panel already reads from it.

const DB_NAME = 'cose-analysis';
const STORE = 'results';

export interface AnalysisResult {
  id: string;            // `${ref}::${tool}`
  ref: string;           // image ref handed off by the database (slug::uuid, or a URL)
  imageUrl: string;
  tool: string;          // machine id, e.g. 'scan3d-viewer'
  toolName: string;      // display name
  metrics: Record<string, string | number>;
  generatedAt: string;   // ISO
}

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function putResult(r: Omit<AnalysisResult, 'id'>): Promise<void> {
  const db = await open();
  const rec: AnalysisResult = { ...r, id: `${r.ref}::${r.tool}` };
  await new Promise<void>((resolve, reject) => {
    const t = db.transaction(STORE, 'readwrite');
    t.objectStore(STORE).put(rec);
    t.oncomplete = () => { db.close(); resolve(); };
    t.onerror = () => reject(t.error);
  });
}

async function getAll(): Promise<AnalysisResult[]> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE, 'readonly').objectStore(STORE).getAll();
    req.onsuccess = () => { db.close(); resolve(req.result as AnalysisResult[]); };
    req.onerror = () => reject(req.error);
  });
}

export async function getResults(ref: string): Promise<AnalysisResult[]> {
  return (await getAll()).filter(r => r.ref === ref).sort((a, b) => (b.generatedAt > a.generatedAt ? 1 : -1));
}
export const allResults = getAll;
