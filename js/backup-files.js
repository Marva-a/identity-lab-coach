// Writing backups to a folder you chose once (Chrome, Edge, Brave and Arc only).
// The functions take a folder handle, so they can be tested with a pretend folder.
// Only files named exactly like our own backups are ever created, replaced or removed.
export const KEEP_FILES = 14;
export const KEEP_SNAPSHOTS = 14;
export const LATEST_NAME = 'identity-lab-coach-latest.json';
const DATED = /^identity-lab-coach-\d{4}-\d{2}-\d{2}\.json$/;

export const datedName = (date) => `identity-lab-coach-${date}.json`;
export const isOurDatedFile = (name) => DATED.test(name);

/** Which names to remove so only the newest `keep` dated backups stay. Other files are never touched. */
export function datedFilesToRemove(names, keep = KEEP_FILES) {
  return names.filter(isOurDatedFile).sort().reverse().slice(keep);
}

/** Which snapshot dates to remove so only the newest `keep` stay. */
export function snapshotsToRemove(dates, keep = KEEP_SNAPSHOTS) {
  return [...dates].sort().reverse().slice(keep);
}

async function writeFile(dir, name, text) {
  const file = await dir.getFileHandle(name, { create: true });
  const writable = await file.createWritable();
  await writable.write(text);
  await writable.close();
}

/**
 * Writes the "latest" file and today's dated file, then removes dated files beyond the newest 14.
 * Returns { written: [...names], removed: [...names] }. Throws if the folder cannot be written.
 */
export async function writeBackupFiles(dir, text, date, keep = KEEP_FILES) {
  await writeFile(dir, LATEST_NAME, text);
  await writeFile(dir, datedName(date), text);
  const names = [];
  for await (const [name] of dir.entries()) names.push(name);
  const removed = [];
  for (const name of datedFilesToRemove(names, keep)) {
    await dir.removeEntry(name);
    removed.push(name);
  }
  return { written: [LATEST_NAME, datedName(date)], removed };
}
