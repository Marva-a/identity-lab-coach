// Data model and local persistence.
//
// Everything you create is kept in ONE versioned JSON document in this
// browser's localStorage, under STORAGE_KEY. Nothing leaves your device.
// Export writes exactly this document to a file; import reads it back.
//
// The rest of the app only talks to the functions exported here, never to
// localStorage directly. When you add Keycloak sign-in later (phase 2), you can
// replace load()/persist() with calls to your own API and keep the UI as is.
// Every record already has an `id`, `createdAt` and `updatedAt`, which is what
// a server, a sync step or an append-only audit log will need. Add an
// `ownerId` field at that point; no record needs one while the data is local.
//
// ─── Data model (schemaVersion 1) ─────────────────────────────────────────────
//
// AppData {
//   schemaVersion: 1,
//   app: 'identity-lab-coach',
//   sessions:   Session[],   // Stage 1 (in use)
//   cards:      Card[],      // Stage 2: spaced-repetition flashcards
//   artifacts:  Artifact[],  // Stage 4: evidence log
//   people:     Person[],    // Stage 6: people log
//   reviews:    Review[],    // Stage 7: Friday reviews
//   weekChecks: { [weekItemId]: { done: boolean, at: ISO string } },  // Stage 3
//   settings:   Settings,
// }
//
// Session {           — one logged study session
//   id, createdAt, updatedAt,
//   date: 'YYYY-MM-DD'      Vancouver calendar date the session counts for
//   dayNumber: number|null  plan day (1–60), or null outside the 60 days
//   minutes: number         minutes actually studied (0 for skipped)
//   status: 'done' | 'partial' | 'skipped'
//   reason: string          one line; required when skipped
//   testMode: boolean       true if logged while the test date was on
// }
//
// Planned for later stages (shapes agreed in the brief; adjust when built):
// Card     { id, front, back, type: 'recall'|'explain', week, reference,
//            verified: boolean, retired: boolean, box/ease/interval/due… }
// Artifact { id, title, date, link, week, exercise, project,
//            label: 'implemented'|'simulated'|'conceptual' }
// Person   { id, name, role, company, metAt, date, notes, followUpDate }
// Review   { id, week, date, answers: { explain, built, blocked, change } }
//
// Plan content (weeks, days, exercises) and scorecard targets are seed data in
// plan-data.js, not part of AppData.
//
// Settings {
//   theme: 'system' | 'light' | 'dark',
//   testDate: { enabled: boolean, date: 'YYYY-MM-DD' },  // off by default
//   swapWeeks2and5: boolean,                              // off by default
//   lastExportedAt: ISO string | null,                    // shown next to Export
// }

import { isValidDateString } from './dates.js';

export const STORAGE_KEY = 'identity-lab-coach:data';
export const BACKUP_KEY = 'identity-lab-coach:backup-before-import';
export const SCHEMA_VERSION = 1;
const APP_ID = 'identity-lab-coach';

const COLLECTIONS = ['sessions', 'cards', 'artifacts', 'people', 'reviews'];
export const SESSION_STATUSES = ['done', 'partial', 'skipped'];
export const REASON_MAX = 140;
export const MINUTES_MAX = 600;

function defaultSettings() {
  return {
    theme: 'system',
    testDate: { enabled: false, date: '' },
    swapWeeks2and5: false,
    lastExportedAt: null,
  };
}

function emptyData() {
  return {
    schemaVersion: SCHEMA_VERSION,
    app: APP_ID,
    sessions: [],
    cards: [],
    artifacts: [],
    people: [],
    reviews: [],
    weekChecks: {},
    settings: defaultSettings(),
  };
}

export function newId() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

// ─── Load and save ────────────────────────────────────────────────────────────

let data = emptyData();
/** False when this browser blocks storage (for example some private windows). */
export let storageAvailable = true;

function readKey(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    storageAvailable = false;
    return null;
  }
}

function writeKey(key, value) {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch {
    storageAvailable = false;
    return false;
  }
}

/** Fill in anything missing so older or partial documents still work. */
function normalize(raw) {
  const base = emptyData();
  const out = { ...base, ...raw };
  for (const c of COLLECTIONS) out[c] = Array.isArray(raw?.[c]) ? raw[c] : [];
  out.weekChecks = raw?.weekChecks && typeof raw.weekChecks === 'object' ? raw.weekChecks : {};
  out.settings = { ...base.settings, ...(raw?.settings ?? {}) };
  out.settings.testDate = { ...base.settings.testDate, ...(raw?.settings?.testDate ?? {}) };
  out.schemaVersion = SCHEMA_VERSION;
  out.app = APP_ID;
  delete out.exportedAt; // belongs to the export file, not to your data
  return out;
}

export function load() {
  const text = readKey(STORAGE_KEY);
  if (!text) {
    data = emptyData();
    return data;
  }
  try {
    data = normalize(JSON.parse(text));
  } catch {
    // Corrupt data: keep a copy rather than overwriting it, then start fresh.
    writeKey(`${STORAGE_KEY}:corrupt-${Date.now()}`, text);
    data = emptyData();
  }
  return data;
}

function persist() {
  return writeKey(STORAGE_KEY, JSON.stringify(data));
}

export function getData() {
  return data;
}

// ─── Settings ────────────────────────────────────────────────────────────────

export function getSettings() {
  return data.settings;
}

export function updateSettings(patch) {
  data.settings = { ...data.settings, ...patch };
  persist();
  return data.settings;
}

// ─── Sessions ────────────────────────────────────────────────────────────────

/** Returns a list of problems; empty when the session is valid. */
export function validateSession(s) {
  const problems = [];
  if (!isValidDateString(s.date)) problems.push('The date is not a valid YYYY-MM-DD date.');
  if (!SESSION_STATUSES.includes(s.status)) problems.push('Choose done, partial or skipped.');
  if (!Number.isInteger(s.minutes) || s.minutes < 0 || s.minutes > MINUTES_MAX) {
    problems.push(`Minutes must be a whole number from 0 to ${MINUTES_MAX}.`);
  }
  if (s.status === 'skipped' && !String(s.reason ?? '').trim()) {
    problems.push('Add a one-line reason for skipping.');
  }
  if (String(s.reason ?? '').length > REASON_MAX) problems.push(`Keep the reason under ${REASON_MAX} characters.`);
  return problems;
}

export function addSession({ date, dayNumber, minutes, status, reason, testMode }) {
  const now = new Date().toISOString();
  const session = {
    id: newId(),
    createdAt: now,
    updatedAt: now,
    date,
    dayNumber: dayNumber ?? null,
    minutes: status === 'skipped' ? 0 : minutes,
    status,
    reason: String(reason ?? '').trim(),
    testMode: Boolean(testMode),
  };
  const problems = validateSession(session);
  if (problems.length) return { ok: false, problems };
  data.sessions.push(session);
  const saved = persist();
  return { ok: true, session, saved };
}

export function deleteSession(id) {
  data.sessions = data.sessions.filter((s) => s.id !== id);
  persist();
}

export function sessionsOn(date) {
  return data.sessions
    .filter((s) => s.date === date)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export function countTestSessions() {
  return data.sessions.filter((s) => s.testMode).length;
}

export function deleteTestSessions() {
  const before = data.sessions.length;
  data.sessions = data.sessions.filter((s) => !s.testMode);
  persist();
  return before - data.sessions.length;
}

// ─── Export and import ───────────────────────────────────────────────────────

export function exportJson() {
  return JSON.stringify({ ...data, exportedAt: new Date().toISOString() }, null, 2);
}

export function exportFileName(today) {
  return `identity-lab-coach-${today}.json`;
}

export function summarize(doc) {
  return {
    sessions: doc.sessions?.length ?? 0,
    cards: doc.cards?.length ?? 0,
    artifacts: doc.artifacts?.length ?? 0,
    people: doc.people?.length ?? 0,
    reviews: doc.reviews?.length ?? 0,
    exportedAt: doc.exportedAt ?? null,
  };
}

/**
 * Checks an import file without changing anything.
 * Returns { ok: true, doc, summary } or { ok: false, problems }.
 */
export function parseImport(text) {
  let raw;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, problems: ['This file is not valid JSON.'] };
  }
  const problems = [];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, problems: ['This file does not contain an Identity Lab Coach export.'] };
  }
  if (raw.app !== APP_ID) problems.push('This file was not exported from Identity Lab Coach.');
  if (typeof raw.schemaVersion !== 'number') problems.push('The file has no schema version.');
  else if (raw.schemaVersion > SCHEMA_VERSION) {
    problems.push(`The file is from a newer version of the app (schema ${raw.schemaVersion}).`);
  }
  for (const c of COLLECTIONS) {
    if (raw[c] !== undefined && !Array.isArray(raw[c])) problems.push(`"${c}" should be a list.`);
  }
  if (Array.isArray(raw.sessions)) {
    raw.sessions.forEach((s, i) => {
      const p = validateSession(s ?? {});
      if (!s?.id) p.push('missing id');
      if (p.length) problems.push(`Session ${i + 1}: ${p.join(' ')}`);
    });
  }
  if (problems.length) return { ok: false, problems: problems.slice(0, 8) };
  const doc = normalize(raw);
  return { ok: true, doc, summary: summarize(raw) };
}

/** Replaces all data with an imported document, keeping a backup of the current data first. */
export function replaceWithImport(doc) {
  const backup = { savedAt: new Date().toISOString(), data };
  if (!writeKey(BACKUP_KEY, JSON.stringify(backup))) {
    return { ok: false, problems: ['Could not save a backup of your current data, so nothing was replaced.'] };
  }
  data = normalize(doc);
  persist();
  return { ok: true };
}

export function getBackupInfo() {
  const text = readKey(BACKUP_KEY);
  if (!text) return null;
  try {
    const backup = JSON.parse(text);
    return { savedAt: backup.savedAt, summary: summarize(backup.data) };
  } catch {
    return null;
  }
}

/** Swaps the current data with the backup taken before the last import. */
export function restoreBackup() {
  const text = readKey(BACKUP_KEY);
  if (!text) return false;
  const backup = JSON.parse(text);
  const current = { savedAt: new Date().toISOString(), data };
  data = normalize(backup.data);
  persist();
  writeKey(BACKUP_KEY, JSON.stringify(current));
  return true;
}
