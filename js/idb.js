// A very small wrapper around the browser's IndexedDB, used for automatic backups:
// daily snapshots of your data and the backup folder you chose. It lives in the
// same browser as the rest of your data and is never sent anywhere. Every function
// returns a safe fallback if IndexedDB is unavailable, so backups never break the app.
const DB_NAME = 'identity-lab-coach-backups';

function open() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is not available'));
      return;
    }
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore('kv');
      request.result.createObjectStore('snapshots', { keyPath: 'date' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function run(store, mode, fn, fallback) {
  try {
    const db = await open();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(store, mode);
      const result = fn(tx.objectStore(store));
      tx.oncomplete = () => { db.close(); resolve(result.value ?? result.result ?? null); };
      tx.onerror = () => { db.close(); reject(tx.error); };
      tx.onabort = () => { db.close(); reject(tx.error); };
    });
  } catch {
    return fallback;
  }
}

const wrap = (req) => ({ get value() { return req.result; } });

export const kvGet = (key) => run('kv', 'readonly', (s) => wrap(s.get(key)), null);
export const kvSet = (key, value) => run('kv', 'readwrite', (s) => { s.put(value, key); return {}; }, false).then((r) => r !== false);
export const kvDelete = (key) => run('kv', 'readwrite', (s) => { s.delete(key); return {}; }, false);

export const snapshotPut = (record) => run('snapshots', 'readwrite', (s) => { s.put(record); return {}; }, false).then((r) => r !== false);
export const snapshotGet = (date) => run('snapshots', 'readonly', (s) => wrap(s.get(date)), null);
export const snapshotDelete = (date) => run('snapshots', 'readwrite', (s) => { s.delete(date); return {}; }, false);
export const snapshotAll = () => run('snapshots', 'readonly', (s) => wrap(s.getAll()), []);
