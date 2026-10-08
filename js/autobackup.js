// Automatic backups, so you don't have to remember to export.
//
// What happens by itself:
// 1. The browser is asked to keep your data safe from being cleared ("protected storage").
// 2. A snapshot of your data is kept inside the browser once a day (the newest 14 days).
// 3. If you chose a backup folder (Chrome, Edge, Brave and Arc), a "latest" file and a dated
//    file are written to it a short while after each change.
//
// What cannot happen by itself: a web page may not write to your disk until you pick a
// folder once, and after you restart the browser it can ask for a single click to resume.
// Nothing here is ever sent anywhere.
import * as idb from './idb.js';
import {
  writeBackupFiles, snapshotsToRemove, KEEP_SNAPSHOTS,
} from './backup-files.js';

const DELAY_MS = 15_000; // wait this long after a change, so typing is not written on every key

const state = {
  persisted: null, // true / false once asked; null before
  folderName: null,
  folder: 'none', // 'none' | 'ready' | 'needs-permission' | 'error'
  folderError: '',
  lastFileAt: null,
  lastSnapshotDate: null,
  busy: false,
};
let dirHandle = null;
let timer = null;
let provider = null; // { json(): string, today(): 'YYYY-MM-DD' }
const listeners = new Set();

const notify = () => listeners.forEach((fn) => { try { fn(); } catch { /* a screen update failing must not stop backups */ } });
export const onStatusChange = (fn) => listeners.add(fn);
export const supportsFolder = () => typeof window !== 'undefined' && 'showDirectoryPicker' in window;
export const status = () => ({ ...state });

async function checkPermission(interactive) {
  if (!dirHandle) return 'none';
  try {
    let p = await dirHandle.queryPermission?.({ mode: 'readwrite' });
    if (p !== 'granted' && interactive) p = await dirHandle.requestPermission?.({ mode: 'readwrite' });
    return p ?? 'granted';
  } catch {
    return 'denied';
  }
}

function setFolderState(permission) {
  if (!dirHandle) state.folder = 'none';
  else if (permission === 'granted') state.folder = 'ready';
  else state.folder = 'needs-permission';
}

/** Starts automatic backups. `getJson` returns the current data as export text. */
export async function init({ json, today }) {
  provider = { json, today };
  try {
    state.persisted = (await navigator.storage?.persisted?.()) ?? null;
    if (state.persisted === false && navigator.storage?.persist) state.persisted = await navigator.storage.persist();
  } catch {
    state.persisted = null;
  }
  const stored = await idb.kvGet('folder');
  if (stored) {
    dirHandle = stored;
    state.folderName = stored.name ?? null;
    setFolderState(await checkPermission(false));
  }
  state.lastFileAt = (await idb.kvGet('lastFileAt')) ?? null;
  await snapshotNow();
  notify();
}

/** Asks the browser not to clear this app's data when the device runs low on space. It may say no. */
export async function requestPersistence() {
  try {
    state.persisted = (await navigator.storage?.persist?.()) ?? false;
  } catch {
    state.persisted = false;
  }
  notify();
  return state.persisted;
}

/** Called after every save. Waits a moment, then takes a snapshot and writes the folder files. */
export function noteChanged() {
  if (!provider) return;
  clearTimeout(timer);
  timer = setTimeout(() => { backupNow().catch(() => {}); }, DELAY_MS);
}

/** Today's snapshot inside the browser; the newest 14 days are kept. */
export async function snapshotNow() {
  if (!provider) return;
  const date = provider.today();
  const text = provider.json();
  const ok = await idb.snapshotPut({ date, savedAt: new Date().toISOString(), bytes: text.length, text });
  if (!ok) return;
  state.lastSnapshotDate = date;
  const all = await idb.snapshotAll();
  for (const old of snapshotsToRemove(all.map((s) => s.date), KEEP_SNAPSHOTS)) await idb.snapshotDelete(old);
}

/** Snapshot plus folder files, now. Safe to call any time. */
export async function backupNow() {
  if (!provider || state.busy) return status();
  state.busy = true;
  clearTimeout(timer);
  try {
    await snapshotNow();
    if (dirHandle) {
      const permission = await checkPermission(false);
      setFolderState(permission);
      if (permission === 'granted') {
        try {
          await writeBackupFiles(dirHandle, provider.json(), provider.today());
          state.lastFileAt = new Date().toISOString();
          state.folderError = '';
          await idb.kvSet('lastFileAt', state.lastFileAt);
        } catch (error) {
          state.folder = 'error';
          state.folderError = String(error?.message ?? error).slice(0, 160);
        }
      }
    }
  } finally {
    state.busy = false;
    notify();
  }
  return status();
}

/** Uses a folder handle (from the picker). Writes a first backup straight away. */
export async function useFolder(handle) {
  dirHandle = handle;
  state.folderName = handle.name ?? null;
  await idb.kvSet('folder', handle); // may be refused for a pretend handle in tests; the real one can be stored
  setFolderState(await checkPermission(true));
  notify();
  return backupNow();
}

/** Opens the browser's folder picker. Must be called from a click. */
export async function chooseFolder() {
  const handle = await window.showDirectoryPicker({ id: 'identity-lab-coach-backups', mode: 'readwrite' });
  return useFolder(handle);
}

/** After a browser restart the folder may need one click to be allowed again. Call from a click. */
export async function resumeFolder() {
  setFolderState(await checkPermission(true));
  notify();
  return backupNow();
}

export async function stopFolder() {
  dirHandle = null;
  state.folderName = null;
  state.folder = 'none';
  state.folderError = '';
  await idb.kvDelete('folder');
  notify();
}

export async function listSnapshots() {
  const all = await idb.snapshotAll();
  return all.map(({ date, savedAt, bytes }) => ({ date, savedAt, bytes })).sort((a, b) => b.date.localeCompare(a.date));
}

export async function getSnapshotText(date) {
  return (await idb.snapshotGet(date))?.text ?? null;
}
