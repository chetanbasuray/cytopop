// Open samples are kept in IndexedDB (localStorage is far too small for FCS files), so they survive a reload.
// Files never leave this computer. The demo is stored as a marker and regenerated.

export interface KeptFile {
  id: string;
  name: string;
  bytes?: ArrayBuffer; // undefined for the demo sample
}

// Chrome rejects a single stored value over about 128 MB, so file bytes are split into chunks of their own.
const CHUNK = 64 * 1024 * 1024;
const chunkKey = (id: string, i: number) => `${id}:${String(i).padStart(6, "0")}`;
const chunkRange = (id: string) => IDBKeyRange.bound(`${id}:`, `${id}:\uffff`);

interface Meta {
  id: string;
  name: string;
  parts?: number; // number of chunks; absent for the demo
  bytes?: ArrayBuffer; // files kept before chunking (database version 1)
}

const open = () =>
  new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open("cytopop", 2);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("samples")) db.createObjectStore("samples", { keyPath: "id" });
      if (!db.objectStoreNames.contains("chunks")) db.createObjectStore("chunks");
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

async function run<T>(mode: IDBTransactionMode, op: (samples: IDBObjectStore, chunks: IDBObjectStore) => () => T): Promise<T> {
  const db = await open();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(["samples", "chunks"], mode);
      const result = op(tx.objectStore("samples"), tx.objectStore("chunks"));
      tx.oncomplete = () => resolve(result());
      tx.onerror = tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

export const keepFile = (f: KeptFile) =>
  run("readwrite", (samples, chunks) => {
    const parts = f.bytes ? Math.max(1, Math.ceil(f.bytes.byteLength / CHUNK)) : undefined;
    samples.put({ id: f.id, name: f.name, ...(parts ? { parts } : {}) } satisfies Meta);
    for (let i = 0; f.bytes && i < parts!; i++) chunks.put(f.bytes.slice(i * CHUNK, (i + 1) * CHUNK), chunkKey(f.id, i));
    return () => undefined;
  });

export const forgetFile = (id: string) =>
  run("readwrite", (samples, chunks) => {
    samples.delete(id);
    chunks.delete(chunkRange(id));
    return () => undefined;
  });

export const keptFiles = () =>
  run<KeptFile[]>("readonly", (samples, chunks) => {
    const metas = samples.getAll() as IDBRequest<Meta[]>;
    const parts = chunks.getAll() as IDBRequest<ArrayBuffer[]>;
    const keys = chunks.getAllKeys();
    return () => {
      const byId = new Map<string, ArrayBuffer[]>();
      keys.result.forEach((k, i) => {
        const id = String(k).slice(0, String(k).lastIndexOf(":"));
        byId.set(id, [...(byId.get(id) ?? []), parts.result[i]!]); // keys come back sorted, so chunks are in order
      });
      return metas.result.flatMap((m): KeptFile[] => {
        const list = byId.get(m.id);
        if (!m.parts) return [{ id: m.id, name: m.name, bytes: m.bytes }];
        if (list?.length !== m.parts) return []; // incomplete write: drop it rather than open a broken file
        const bytes = new Uint8Array(list.reduce((n, b) => n + b.byteLength, 0));
        let at = 0;
        for (const b of list) { bytes.set(new Uint8Array(b), at); at += b.byteLength; }
        return [{ id: m.id, name: m.name, bytes: bytes.buffer }];
      });
    };
  });

export function storageMessage(name: string, err: unknown): string {
  const full = err instanceof DOMException && err.name === "QuotaExceededError";
  return full
    ? `${name} is open but will not be reopened next time: browser storage is full. Close other samples to make room.`
    : `${name} is open but will not be reopened next time: browser storage is unavailable (${String(err)}).`;
}
