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
// ─── Data model (schemaVersion 3) ─────────────────────────────────────────────
//
// AppData {
//   schemaVersion: 3,
//   app: 'identity-lab-coach',
//   sessions:    Session[],     // Stage 1
//   cards:       Card[],        // Stage 2: flashcards
//   cardReviews: CardReview[],  // Stage 2: append-only log of every rating
//   cardSeedVersion: number,    // which seed-card set has been added
//   tallies:     Tally[],       // Stage 3: quick "+1 with date" scorecard entries
//   artifacts:  Artifact[],  // Stage 4: evidence log
//   people:     Person[],    // Stage 6: people log
//   reviews:    Review[],    // Stage 7: Friday reviews
//   weekChecks: { [weekItemId]: { at: ISO string, testMode: boolean } },  // Stage 3: ticked items
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
// Card {             — one flashcard
//   id, createdAt, updatedAt,
//   type: 'recall' | 'explain'
//   front, back: string     question and reference answer
//   week: number|null       week it unlocks (1–9); null = always unlocked
//   topic: string
//   reference: string       where to check it (RFC, NIST, OWASP, W3C page)
//   source: 'seed' | 'user' seedId: string|null (seed cards only)
//   verified: boolean       only you set this; seed cards start false
//   verifiedAt: ISO string|null
//   retired: boolean        retired cards are never due
// }
// A card's schedule (box, next due date) is NOT stored on the card. srs.js
// works it out by replaying the card's CardReview log, so the log is the
// single source of truth (this replaces the brief's "schedule fields").
//
// CardReview {       — one rating, never edited
//   id, createdAt,
//   cardId, date: 'YYYY-MM-DD' (Vancouver, or the test date)
//   rating: 'again' | 'hard' | 'good' | 'easy'
//   response: string        what you typed (explain-it cards), so you can see
//                           how your explanations improve
//   context: 'retrieval' | 'study'
//   testMode: boolean
// }
//
// Tally {            — one quick scorecard entry (Stage 3)
//   id, createdAt,
//   kind: 'artifact' | 'conversation' | 'application' | 'referral'
//   date: 'YYYY-MM-DD'      when it happened
//   note: string            optional, one line (for example "PKCE diagram")
//   testMode: boolean
// }
// The scorecard counts tallies PLUS the matching full records from later
// stages (artifacts from Stage 4, and so on). When Stage 4 is built, each
// artifact tally will be turned into an Artifact record with the same id, date
// and note (title), and then removed from tallies, so the count never changes
// and nothing is lost.
//
// Planned for later stages (shapes agreed in the brief; adjust when built):
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
import { SEED_CARDS, CARD_SEED_VERSION } from './cards-data.js';

export const STORAGE_KEY = 'identity-lab-coach:data';
export const BACKUP_KEY = 'identity-lab-coach:backup-before-import';
export const SCHEMA_VERSION = 3;
const APP_ID = 'identity-lab-coach';

const COLLECTIONS = ['sessions', 'cards', 'cardReviews', 'tallies', 'artifacts', 'people', 'reviews'];
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
    cardReviews: [],
    cardSeedVersion: 0,
    tallies: [],
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
  out.cardSeedVersion = Number.isInteger(raw?.cardSeedVersion) ? raw.cardSeedVersion : 0;
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
  } else {
    try {
      data = normalize(JSON.parse(text));
    } catch {
      // Corrupt data: keep a copy rather than overwriting it, then start fresh.
      writeKey(`${STORAGE_KEY}:corrupt-${Date.now()}`, text);
      data = emptyData();
    }
  }
  if (seedCards()) persist();
  return data;
}

/**
 * Adds any seed cards this data hasn't had yet (matched by seedId), so a
 * fresh install, an older export or a future seed update all end up complete.
 * Seed cards you retired or edited are never re-added or overwritten.
 * Returns true if anything changed.
 */
function seedCards() {
  if (data.cardSeedVersion >= CARD_SEED_VERSION) return false;
  const have = new Set(data.cards.map((c) => c.seedId).filter(Boolean));
  const now = new Date().toISOString();
  for (const seed of SEED_CARDS) {
    if (have.has(seed.seedId)) continue;
    data.cards.push({
      id: newId(),
      createdAt: now,
      updatedAt: now,
      type: seed.type,
      front: seed.front,
      back: seed.back,
      week: seed.week,
      topic: seed.topic,
      reference: seed.reference,
      source: 'seed',
      seedId: seed.seedId,
      verified: false,
      verifiedAt: null,
      retired: false,
    });
  }
  data.cardSeedVersion = CARD_SEED_VERSION;
  return true;
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

/** Test data: anything created while the test date was on. */
export function countTestData() {
  return {
    sessions: data.sessions.filter((s) => s.testMode).length,
    cardReviews: data.cardReviews.filter((r) => r.testMode).length,
    tallies: data.tallies.filter((t) => t.testMode).length,
    weekChecks: Object.values(data.weekChecks).filter((c) => c.testMode).length,
  };
}

/** Deletes all test data; card schedules and the scorecard follow automatically. */
export function deleteTestData() {
  const counts = countTestData();
  data.sessions = data.sessions.filter((s) => !s.testMode);
  data.cardReviews = data.cardReviews.filter((r) => !r.testMode);
  data.tallies = data.tallies.filter((t) => !t.testMode);
  data.weekChecks = Object.fromEntries(Object.entries(data.weekChecks).filter(([, c]) => !c.testMode));
  persist();
  return counts;
}

// ─── Week checklist (Stage 3) ────────────────────────────────────────────────

export function isChecked(itemId) {
  return Boolean(data.weekChecks[itemId]);
}

export function setChecked(itemId, checked, testMode) {
  if (checked) data.weekChecks[itemId] = { at: new Date().toISOString(), testMode: Boolean(testMode) };
  else delete data.weekChecks[itemId];
  persist();
}

// ─── Scorecard tallies (Stage 3) ─────────────────────────────────────────────

export const TALLY_KINDS = ['artifact', 'conversation', 'application', 'referral'];
export const NOTE_MAX = 140;

export function validateTally(t) {
  const problems = [];
  if (!TALLY_KINDS.includes(t.kind)) problems.push('Choose what you are logging.');
  if (!isValidDateString(t.date)) problems.push('Choose a valid date.');
  if (String(t.note ?? '').length > NOTE_MAX) problems.push(`Keep the note under ${NOTE_MAX} characters.`);
  return problems;
}

export function addTally({ kind, date, note, testMode }) {
  const tally = {
    id: newId(),
    createdAt: new Date().toISOString(),
    kind,
    date,
    note: String(note ?? '').trim(),
    testMode: Boolean(testMode),
  };
  const problems = validateTally(tally);
  if (problems.length) return { ok: false, problems };
  data.tallies.push(tally);
  const saved = persist();
  return { ok: true, tally, saved };
}

export function deleteTally(id) {
  data.tallies = data.tallies.filter((t) => t.id !== id);
  persist();
}

/**
 * Dates of everything that counts toward each scorecard measure.
 * Later stages add their full records here (for example Stage 4 artifacts),
 * so the scorecard never needs to change when they arrive.
 */
export function scorecardCounts() {
  const counts = Object.fromEntries(TALLY_KINDS.map((k) => [k, []]));
  for (const t of data.tallies) counts[t.kind].push(t.date);
  return counts;
}

// ─── Cards ───────────────────────────────────────────────────────────────────

export const CARD_TYPES = ['recall', 'explain'];
export const CARD_TEXT_MAX = 2000;
export const REFERENCE_MAX = 300;
export const RESPONSE_MAX = 4000;
const RATINGS = ['again', 'hard', 'good', 'easy'];

export function validateCard(c) {
  const problems = [];
  if (!CARD_TYPES.includes(c.type)) problems.push('Choose a card type.');
  if (!String(c.front ?? '').trim()) problems.push('Add a question or prompt.');
  if (!String(c.back ?? '').trim()) problems.push('Add a reference answer.');
  if (String(c.front ?? '').length > CARD_TEXT_MAX || String(c.back ?? '').length > CARD_TEXT_MAX) {
    problems.push(`Keep each side under ${CARD_TEXT_MAX} characters.`);
  }
  if (c.week !== null && !(Number.isInteger(c.week) && c.week >= 1 && c.week <= 9)) {
    problems.push('The week must be from 1 to 9, or none.');
  }
  if (String(c.reference ?? '').length > REFERENCE_MAX) problems.push(`Keep the reference under ${REFERENCE_MAX} characters.`);
  return problems;
}

function cleanCardFields(f) {
  return {
    type: f.type,
    front: String(f.front ?? '').trim(),
    back: String(f.back ?? '').trim(),
    week: f.week ?? null,
    topic: String(f.topic ?? '').trim(),
    reference: String(f.reference ?? '').trim(),
  };
}

export function getCard(id) {
  return data.cards.find((c) => c.id === id);
}

export function addCard(fields) {
  const now = new Date().toISOString();
  const card = {
    id: newId(),
    createdAt: now,
    updatedAt: now,
    ...cleanCardFields(fields),
    source: 'user',
    seedId: null,
    verified: Boolean(fields.verified),
    verifiedAt: fields.verified ? now : null,
    retired: false,
  };
  const problems = validateCard(card);
  if (problems.length) return { ok: false, problems };
  data.cards.push(card);
  persist();
  return { ok: true, card };
}

/** Edits a card's content. Its review history and schedule are kept. */
export function updateCard(id, fields) {
  const card = getCard(id);
  if (!card) return { ok: false, problems: ['That card no longer exists.'] };
  const next = { ...card, ...cleanCardFields(fields), updatedAt: new Date().toISOString() };
  const problems = validateCard(next);
  if (problems.length) return { ok: false, problems };
  Object.assign(card, next);
  persist();
  return { ok: true, card };
}

/** Only called from your own click: marks a card verified or unverified. */
export function setCardVerified(id, verified) {
  const card = getCard(id);
  if (!card) return;
  const now = new Date().toISOString();
  card.verified = verified;
  card.verifiedAt = verified ? now : null;
  card.updatedAt = now;
  persist();
}

export function setCardRetired(id, retired) {
  const card = getCard(id);
  if (!card) return;
  card.retired = retired;
  card.updatedAt = new Date().toISOString();
  persist();
}

export function addCardReview({ cardId, date, rating, response, context, testMode }) {
  if (!getCard(cardId) || !isValidDateString(date) || !RATINGS.includes(rating)) {
    return { ok: false };
  }
  const review = {
    id: newId(),
    createdAt: new Date().toISOString(),
    cardId,
    date,
    rating,
    response: String(response ?? '').slice(0, RESPONSE_MAX),
    context: context === 'retrieval' ? 'retrieval' : 'study',
    testMode: Boolean(testMode),
  };
  data.cardReviews.push(review);
  const saved = persist();
  return { ok: true, review, saved };
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
    cardReviews: doc.cardReviews?.length ?? 0,
    tallies: doc.tallies?.length ?? 0,
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
  if (Array.isArray(raw.cards)) {
    raw.cards.forEach((c, i) => {
      const p = validateCard({ ...(c ?? {}), week: c?.week ?? null });
      if (!c?.id) p.push('missing id');
      if (p.length) problems.push(`Card ${i + 1}: ${p.join(' ')}`);
    });
  }
  if (Array.isArray(raw.cardReviews)) {
    raw.cardReviews.forEach((r, i) => {
      if (!r?.id || !r.cardId || !isValidDateString(r.date) || !RATINGS.includes(r.rating)) {
        problems.push(`Card rating ${i + 1} is incomplete or has an invalid date or rating.`);
      }
    });
  }
  if (Array.isArray(raw.tallies)) {
    raw.tallies.forEach((t, i) => {
      const p = validateTally(t ?? {});
      if (!t?.id) p.push('missing id');
      if (p.length) problems.push(`Scorecard entry ${i + 1}: ${p.join(' ')}`);
    });
  }
  if (raw.weekChecks !== undefined && (typeof raw.weekChecks !== 'object' || Array.isArray(raw.weekChecks) || raw.weekChecks === null)) {
    problems.push('"weekChecks" should be an object.');
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
  seedCards();
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
  seedCards();
  persist();
  writeKey(BACKUP_KEY, JSON.stringify(current));
  return true;
}
