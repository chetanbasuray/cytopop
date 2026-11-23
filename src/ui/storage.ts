// Open samples are kept in IndexedDB (localStorage is far too small for FCS files), so they survive a reload.
// Files never leave this computer. The demo is stored as a marker and regenerated.

export interface KeptFile {
  id: string;
  name: string;
  bytes?: ArrayBuffer; // undefined for the demo sample
}

const open = () =>
  new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open("cytopop", 1);
    req.onupgradeneeded = () => req.result.createObjectStore("samples", { keyPath: "id" });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

async function run<T>(mode: IDBTransactionMode, op: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction("samples", mode);
      const req = op(tx.objectStore("samples"));
      tx.oncomplete = () => resolve(req.result);
      tx.onerror = tx.onabort = () => reject(tx.error ?? req.error);
    });
  } finally {
    db.close();
  }
}

export const keepFile = (f: KeptFile) => run("readwrite", (s) => s.put(f)).then(() => undefined);
export const forgetFile = (id: string) => run("readwrite", (s) => s.delete(id)).then(() => undefined);
export const keptFiles = () => run<KeptFile[]>("readonly", (s) => s.getAll());

export function storageMessage(name: string, err: unknown): string {
  const full = err instanceof DOMException && err.name === "QuotaExceededError";
  return full
    ? `${name} is open but will not be reopened next time: browser storage is full. Close other samples to make room.`
    : `${name} is open but will not be reopened next time: browser storage is unavailable (${String(err)}).`;
}
