import { ProjectError } from "./types";

/**
 * Binary storage for local development mode (IndexedDB). Photos and previews are Blobs; localStorage cannot hold them.
 * Everything is keyed by an opaque id. All failures become ProjectErrors with a message fit for users.
 */
const DB = "threshold-media";
const STORE = "blobs";

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") return reject(new ProjectError("UNAVAILABLE", "This browser can't store photos locally (private browsing?)."));
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(new ProjectError("UNAVAILABLE", "This browser can't store photos locally (private browsing?)."));
  });
}

function tx<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  return open().then(
    (db) =>
      new Promise<T | undefined>((resolve, reject) => {
        const t = db.transaction(STORE, mode);
        const r = run(t.objectStore(STORE));
        t.oncomplete = () => { db.close(); resolve(r ? (r as IDBRequest<T>).result : undefined); };
        t.onabort = t.onerror = () => {
          db.close();
          const name = t.error?.name;
          reject(new ProjectError(name === "QuotaExceededError" ? "QUOTA" : "UNAVAILABLE", name === "QuotaExceededError" ? "Your browser's storage is full. Delete some projects and try again." : "Couldn't use this browser's storage."));
        };
      }),
  );
}

export const blobStore = {
  put: (key: string, blob: Blob) => tx("readwrite", (s) => { s.put(blob, key); }).then(() => undefined),
  get: (key: string) => tx<Blob | undefined>("readonly", (s) => s.get(key)).then((b) => b ?? null),
  delete: (keys: string[]) => (keys.length ? tx("readwrite", (s) => { keys.forEach((k) => s.delete(k)); }).then(() => undefined) : Promise.resolve()),
};
