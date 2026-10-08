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
// ─── Data model (schemaVersion 5) ─────────────────────────────────────────────
//
// AppData {
//   schemaVersion: 5,
//   planVersion: number,        // version of the plan text this data was last matched to (see plan-data.js)
//   app: 'identity-lab-coach',
//   sessions:    Session[],     // Stage 1
//   cards:       Card[],        // Stage 2: flashcards
//   cardReviews: CardReview[],  // Stage 2: append-only log of every rating
//   cardSeedVersion: number,    // which seed-card set has been added
//   tallies:     Tally[],       // quick "+1 with date" entries (applications only)
//   artifacts:    Artifact[],    // Stage 4: evidence log
//   people:       Person[],      // Stage 4: people log
//   interactions: Interaction[], // Stage 4: conversations and referral asks
//   resources:    Resource[],    // Stage 4b: the content library
//   contentPacks: { [packId]: { version, appliedAt } },  // which content packs have been added (see content.js)
//   reviews:    Review[],    // Stage 7: Friday reviews
//   lessons:     Lesson[],      // daily lessons from content packs (see content.js); never edited by you
//   lessonAnswers: { [lessonId]: { answers: string[], updatedAt } },  // your answers to the check-yourself questions
//   optionalOverrides: { ["item:<id>" | "resource:<id>"]: { optional: boolean, at, testMode, testPrev } },
//                               // your own Optional/Required choices; plan updates and content packs never touch them
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
// Tally {            — one quick scorecard entry
//   id, createdAt,
//   kind: 'application'     (Stage 3 also had artifact, conversation and
//                            referral; migrate.js converts those, see below)
//   date: 'YYYY-MM-DD'      when it happened
//   note: string            optional, one line (for example "Acme, design lead")
//   testMode: boolean
// }
//
// Artifact {         — one piece of evidence (Stage 4)
//   id, createdAt, updatedAt,
//   title, type: 'project-slice'|'write-up'|'threat-model'|'diagram'|'repo'|'post'|'other'
//   status: 'draft' | 'published'
//   createdDate: 'YYYY-MM-DD'
//   publishedDate: 'YYYY-MM-DD' | null   only when published
//   url: string             optional, http(s) only
//   category: 'research' | 'systems' | 'interaction' | 'security' | 'product' | 'uncategorised'
//                           schema 5; entries that existed before it are 'uncategorised' until you choose
//   maturity: '' | 'implemented' | 'simulated' | 'conceptual' | 'future'
//                           empty until you choose; required before it is published
//                           (converted quick entries stay empty until you edit them)
//   project: '' | 'project-1' | 'project-2' | 'project-3' | 'other'
//   tags: string[]          "what this proves": up to 3 skill tags
//   reflection: string      short note
//   migrated: boolean       true if converted from a Stage 3 "+1" entry
//   testMode: boolean
// }
// The scorecard counts an artifact ONLY when it is published, dated by its
// published date. Drafts never count. maturity and project do not affect counts.
// (maturity and project were added without a new schema version: files without
// them load with both empty.)
//
// Person {           — one person (Stage 4)
//   id, createdAt, updatedAt,
//   name, organization, role, notes
//   connection: 'warm-intro'|'cold-message'|'event'|'community'|'other'
//   link: string            optional, http(s) only; the app never fetches it
//   migrated: boolean       true for the placeholder "Unassigned (migrated)"
//   testMode: boolean
// }
//
// Interaction {      — one conversation or referral ask with a person
//   id, createdAt, updatedAt,
//   personId, date: 'YYYY-MM-DD'
//   type: 'conversation' | 'referral'
//   outcome: string         outcome note
//   followUpDue: 'YYYY-MM-DD' | null
//   followUpDoneAt: ISO string | null
//   migrated, testMode: boolean
// }
// The scorecard counts conversations and referral asks from interactions,
// by their dates.
//
// Resource {         — one thing to read, watch or do (Stage 4b). You provide them;
//                      the app ships with none and never copies third-party content.
//   id                    from your import file (for example "w2-rfc9700"), or generated for
//                         ones you add by hand. Importing matches on it.
//   createdAt, updatedAt,
//   title, source (author or site)
//   url: string           http(s) only, opens in a new tab; '' when there is no link yet
//                         (shown as "Link needed", with a field to add it)
//   urlStatus: 'verified' | 'needs-your-search' | 'unchecked' | 'added-by-you'
//   verifiedNote: string  the file's note on the link, shown as small text
//   type: 'video' | 'article' | 'spec' | 'lab' | 'exercise'
//   minutes: number       ESTIMATE only. Never counted as hours: hours come from Sessions.
//   why: string           why it is in the plan
//   optional: boolean     optional resources are de-emphasized, like Optional plan items
//   days: number[]        plan day numbers (1–60, no Sundays), as in the roadmap table
//   position: number      order added; "Do this next" keeps this order
//   status: 'not-started' | 'in-progress' | 'done'
//   doneDate: 'YYYY-MM-DD' | null
//   notes: string         your own notes, saved as you type
//   retired: boolean      retired resources are hidden from Today and Week
//   testMode: boolean     created while the test date was on
//   testRevert: object | absent
//                         what a real resource looked like before test-date changes
//                         (all the fields you can change), so Delete test data can put it back
// }
// (resources were added without a new schema version: files without them load with none.)
//
// Migration (migrate.js): data from Stages 1–3 (schema 1–3) is converted on
// first load, and on import. Artifact "+1" entries become published Artifacts;
// conversation and referral "+1" entries become Interactions under one person,
// "Unassigned (migrated)". Applications stay as tallies. The scorecard counts
// are checked before saving; if they differ, nothing is saved. A copy of the
// old data is kept under MIGRATION_BACKUPS_KEY until you delete it in Settings.
//
// Planned for later stages (shapes agreed in the brief; adjust when built):
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
//   migrationNotice: string | null,                       // one-time message after a migration
// }

import { isValidDateString } from './dates.js';
import { SEED_CARDS, CARD_SEED_VERSION } from './cards-data.js';
import {
  SCHEMA_VERSION, UNCATEGORISED, validateArtifact, validatePerson, validateInteraction, normalizeTags, countsFromDoc,
  validateResource, validateResourceUrl, RESOURCE_STATUSES, SUGGESTED_SKILL_TAGS, CARD_TEXT_MAX, REFERENCE_MAX,
} from './records.js';
import { migrate, needsMigration } from './migrate.js';
import { PLAN_VERSION, renameChecks, itemIsOptional } from './plan-data.js';

export { SCHEMA_VERSION };
export const STORAGE_KEY = 'identity-lab-coach:data';
export const BACKUP_KEY = 'identity-lab-coach:backup-before-import';
export const MIGRATION_BACKUPS_KEY = 'identity-lab-coach:migration-backups';
const APP_ID = 'identity-lab-coach';

const COLLECTIONS = ['sessions', 'cards', 'cardReviews', 'tallies', 'artifacts', 'people', 'interactions', 'resources', 'reviews'];
export const SESSION_STATUSES = ['done', 'partial', 'skipped'];
export const REASON_MAX = 140;
export const MINUTES_MAX = 600;

function defaultSettings() {
  return {
    theme: 'system',
    testDate: { enabled: false, date: '' },
    swapWeeks2and5: false,
    lastExportedAt: null,
    migrationNotice: null,
  };
}

function emptyData() {
  return {
    schemaVersion: SCHEMA_VERSION,
    planVersion: PLAN_VERSION,
    app: APP_ID,
    sessions: [],
    cards: [],
    cardReviews: [],
    cardSeedVersion: 0,
    tallies: [],
    artifacts: [],
    people: [],
    interactions: [],
    resources: [],
    contentPacks: {},
    reviews: [],
    optionalOverrides: {},
    lessons: [],
    lessonAnswers: {},
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
  // Fields added after the first Stage 4 release: older records load with them empty.
  out.artifacts = out.artifacts.map((a) => ({ maturity: '', project: '', category: UNCATEGORISED, ...a }));
  out.resources = out.resources.map((r) => ({
    optional: false, verifiedNote: '', urlStatus: r?.url ? 'unchecked' : 'needs-your-search', level: '', howToUse: '', editedByMe: false, newerVersion: null, ...r,
  }));
  out.contentPacks = raw?.contentPacks && typeof raw.contentPacks === 'object' && !Array.isArray(raw.contentPacks) ? raw.contentPacks : {};
  out.optionalOverrides = raw?.optionalOverrides && typeof raw.optionalOverrides === 'object' && !Array.isArray(raw.optionalOverrides) ? raw.optionalOverrides : {};
  out.lessons = Array.isArray(raw?.lessons) ? raw.lessons : [];
  out.lessonAnswers = raw?.lessonAnswers && typeof raw.lessonAnswers === 'object' && !Array.isArray(raw.lessonAnswers) ? raw.lessonAnswers : {};
  out.weekChecks = raw?.weekChecks && typeof raw.weekChecks === 'object' ? raw.weekChecks : {};
  out.settings = { ...base.settings, ...(raw?.settings ?? {}) };
  out.settings.testDate = { ...base.settings.testDate, ...(raw?.settings?.testDate ?? {}) };
  out.schemaVersion = SCHEMA_VERSION;
  out.planVersion = Number.isInteger(raw?.planVersion) ? raw.planVersion : 1; // older data: the first plan text
  out.app = APP_ID;
  delete out.exportedAt; // belongs to the export file, not to your data
  return out;
}

/**
 * Set when stored data could not be converted safely. While it is set, nothing
 * is ever written, and the app shows the message instead of running.
 */
let loadProblem = null;
export function getLoadProblem() {
  return loadProblem;
}

export function load() {
  loadProblem = null;
  let migrated = false;
  const text = readKey(STORAGE_KEY);
  if (!text) {
    data = emptyData();
  } else {
    let raw = null;
    try {
      raw = JSON.parse(text);
    } catch {
      // Corrupt data: keep a copy rather than overwriting it, then start fresh.
      writeKey(`${STORAGE_KEY}:corrupt-${Date.now()}`, text);
      data = emptyData();
    }
    if (raw) {
      const result = migrate(raw);
      if (!result.ok) {
        loadProblem = { problems: result.problems, rawText: text };
        data = emptyData();
        return data;
      }
      if (result.changed && !saveMigrationBackup({ reason: 'update', fromVersion: result.fromVersion, text })) {
        loadProblem = {
          problems: ['Could not save a backup of your old data, so nothing was converted. Free up browser storage or export your data, then reload.'],
          rawText: text,
        };
        data = emptyData();
        return data;
      }
      data = normalize(result.doc);
      migrated = result.changed;
    }
  }
  const planChanged = migratePlan();
  const seeded = seedCards();
  if (seeded || planChanged || migrated) persist();
  return data;
}

/**
 * Brings saved data up to the current plan text. Ticks are keyed by plan item id and
 * ids never change, so a ticked item stays ticked and nothing is removed. If an id is
 * ever renamed (PLAN_ID_RENAMES), its tick moves to the new id. Returns true if anything changed.
 */
function migratePlan() {
  if (data.planVersion >= PLAN_VERSION) return false;
  data.weekChecks = renameChecks(data.weekChecks);
  data.planVersion = PLAN_VERSION;
  return true;
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

const saveListeners = new Set();
/** Runs `fn` after each successful save (used to schedule automatic backups). */
export function onSave(fn) {
  saveListeners.add(fn);
}

function persist() {
  if (loadProblem) return false; // never overwrite data we could not convert safely
  const ok = writeKey(STORAGE_KEY, JSON.stringify(data));
  if (ok) {
    for (const fn of saveListeners) {
      try { fn(); } catch { /* a listener failing must never stop a save */ }
    }
  }
  return ok;
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
    artifacts: data.artifacts.filter((a) => a.testMode).length,
    people: data.people.filter((p) => p.testMode).length,
    interactions: data.interactions.filter((i) => i.testMode).length,
    resources: data.resources.filter((r) => r.testMode || r.testRevert).length,
    weekChecks: Object.values(data.weekChecks).filter((c) => c.testMode).length,
    optionalOverrides: Object.values(data.optionalOverrides).filter((o) => o.testMode).length,
    lessonAnswers: Object.values(data.lessonAnswers).filter((a) => a.testMode).length,
  };
}

/** Deletes all test data; card schedules and the scorecard follow automatically. */
export function deleteTestData() {
  const counts = countTestData();
  data.sessions = data.sessions.filter((s) => !s.testMode);
  data.cardReviews = data.cardReviews.filter((r) => !r.testMode);
  data.tallies = data.tallies.filter((t) => !t.testMode);
  data.artifacts = data.artifacts.filter((a) => !a.testMode);
  data.interactions = data.interactions.filter((i) => !i.testMode);
  // Resources made while testing go. Real resources whose status or notes were changed
  // while testing go back to how they were.
  data.resources = data.resources.filter((r) => !r.testMode);
  for (const r of data.resources) {
    if (!r.testRevert) continue;
    Object.assign(r, r.testRevert);
    delete r.testRevert;
  }
  // A person made while testing goes too, unless a real interaction is logged
  // under them (then they become a real person). A migrated placeholder with
  // nothing left under it also goes.
  const stillUsed = new Set(data.interactions.map((i) => i.personId));
  data.people = data.people.filter((p) => !((p.testMode || p.migrated) && !stillUsed.has(p.id)));
  for (const p of data.people) if (p.testMode) p.testMode = false;
  data.weekChecks = Object.fromEntries(Object.entries(data.weekChecks).filter(([, c]) => !c.testMode));
  // A choice made while testing goes back to what it was before (your earlier choice, or the plan's setting).
  for (const [key, o] of Object.entries(data.optionalOverrides)) {
    if (!o.testMode) continue;
    if (o.testPrev) data.optionalOverrides[key] = o.testPrev;
    else delete data.optionalOverrides[key];
  }
  for (const [id, a] of Object.entries(data.lessonAnswers)) {
    if (!a.testMode) continue;
    if (a.testPrev) data.lessonAnswers[id] = a.testPrev;
    else delete data.lessonAnswers[id];
  }
  persist();
  return counts;
}

// ─── Your Optional / Required choices ────────────────────────────────────────
// Stored apart from the plan and the content packs, so updating either never overwrites them.
// A choice that matches the plan's own setting is not stored (that is "back to the plan's setting").

const overrideKey = (kind, id) => `${kind}:${id}`;

/** Your choice for a plan item or resource: { optional, at } or null when you have not changed it. */
export function getOptionalOverride(kind, id) {
  return data.optionalOverrides[overrideKey(kind, id)] ?? null;
}

/** Whether a plan item is Optional now: your choice if you made one, otherwise the plan's. */
export function isOptionalItem(item) {
  return itemIsOptional(item, data.optionalOverrides);
}

/** Whether a resource is Optional now. The record's own flag is the content pack's (or your form's) setting. */
export function isOptionalResource(resource) {
  return getOptionalOverride('resource', resource.id)?.optional ?? Boolean(resource.optional);
}

/** True when your choice differs from the plan's or pack's own setting (the "Changed by me" marker). */
export function isChangedByMe(kind, id, planDefault) {
  const o = getOptionalOverride(kind, id);
  return o !== null && o.optional !== Boolean(planDefault);
}

/**
 * Marks a plan item or resource Optional or Required. `planDefault` is what the plan or pack says.
 * Choosing the plan's own setting clears your choice (while testing it is kept until the test data
 * is deleted, so that deleting it can put your earlier choice back).
 */
export function setOptional(kind, id, optional, planDefault, testMode) {
  const key = overrideKey(kind, id);
  const prev = data.optionalOverrides[key] ?? null;
  if (testMode) {
    data.optionalOverrides[key] = {
      optional: Boolean(optional), at: new Date().toISOString(), testMode: true,
      testPrev: prev && !prev.testMode ? prev : prev?.testPrev ?? null,
    };
  } else if (Boolean(optional) === Boolean(planDefault)) {
    delete data.optionalOverrides[key];
  } else {
    data.optionalOverrides[key] = { optional: Boolean(optional), at: new Date().toISOString(), testMode: false };
  }
  return persist();
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

// ─── Quick "+1" entries (applications only since Stage 4) ───────────────────

export const TALLY_KINDS = ['application'];
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
 * Dates of everything that counts toward each scorecard measure: published
 * artifacts (by published date), interactions (by date) and application entries.
 */
export function scorecardCounts() {
  return countsFromDoc(data);
}

// ─── Evidence log (Stage 4) ──────────────────────────────────────────────────

function cleanArtifactFields(f) {
  const status = f.status;
  return {
    title: String(f.title ?? '').trim(),
    type: f.type,
    status,
    createdDate: f.createdDate,
    publishedDate: status === 'published' ? f.publishedDate : null,
    url: String(f.url ?? '').trim(),
    category: f.category || UNCATEGORISED,
    maturity: f.maturity ?? '',
    project: f.project ?? '',
    tags: normalizeTags(f.tags),
    reflection: String(f.reflection ?? '').trim(),
  };
}

export function getArtifact(id) {
  return data.artifacts.find((a) => a.id === id);
}

export function addArtifact(fields, testMode) {
  const now = new Date().toISOString();
  const artifact = {
    id: newId(),
    createdAt: now,
    updatedAt: now,
    ...cleanArtifactFields(fields),
    migrated: false,
    testMode: Boolean(testMode),
  };
  const problems = validateArtifact(artifact, { requireMaturity: true, requireCategory: true });
  if (problems.length) return { ok: false, problems };
  data.artifacts.push(artifact);
  const saved = persist();
  return { ok: true, artifact, saved };
}

/** Edits an artifact. Its status only changes through publishArtifact. */
export function updateArtifact(id, fields) {
  const artifact = getArtifact(id);
  if (!artifact) return { ok: false, problems: ['That evidence no longer exists.'] };
  const next = {
    ...artifact,
    ...cleanArtifactFields({ ...fields, status: artifact.status }),
    updatedAt: new Date().toISOString(),
  };
  const problems = validateArtifact(next, { requireMaturity: true });
  if (problems.length) return { ok: false, problems };
  Object.assign(artifact, next);
  persist();
  return { ok: true, artifact };
}

/** Moves a draft to published, with the date it was published and its maturity. */
export function publishArtifact(id, publishedDate, maturity) {
  const artifact = getArtifact(id);
  if (!artifact) return { ok: false, problems: ['That evidence no longer exists.'] };
  const next = {
    ...artifact,
    status: 'published',
    publishedDate,
    maturity: maturity ?? artifact.maturity ?? '',
    updatedAt: new Date().toISOString(),
  };
  const problems = validateArtifact(next, { requireMaturity: true });
  if (problems.length) return { ok: false, problems };
  Object.assign(artifact, next);
  const saved = persist();
  return { ok: true, artifact, saved };
}

export function deleteArtifact(id) {
  data.artifacts = data.artifacts.filter((a) => a.id !== id);
  persist();
}

/** The built-in suggestions plus every tag you have used, once each (ignoring capitals), alphabetically. */
export function suggestedSkillTags() {
  const seen = new Map();
  for (const t of [...SUGGESTED_SKILL_TAGS, ...allSkillTags()]) if (!seen.has(t.toLowerCase())) seen.set(t.toLowerCase(), t);
  return [...seen.values()].sort((a, b) => a.localeCompare(b));
}

/** Every skill tag in use, once each (ignoring capitals), alphabetically. */
export function allSkillTags() {
  const seen = new Map();
  for (const a of data.artifacts) {
    for (const t of a.tags ?? []) if (!seen.has(t.toLowerCase())) seen.set(t.toLowerCase(), t);
  }
  return [...seen.values()].sort((a, b) => a.localeCompare(b));
}

// ─── People log (Stage 4) ────────────────────────────────────────────────────

function cleanPersonFields(f) {
  return {
    name: String(f.name ?? '').trim(),
    organization: String(f.organization ?? '').trim(),
    role: String(f.role ?? '').trim(),
    connection: f.connection,
    notes: String(f.notes ?? '').trim(),
    link: String(f.link ?? '').trim(),
  };
}

export function getPerson(id) {
  return data.people.find((p) => p.id === id);
}

export function addPerson(fields, testMode) {
  const now = new Date().toISOString();
  const person = {
    id: newId(),
    createdAt: now,
    updatedAt: now,
    ...cleanPersonFields(fields),
    migrated: false,
    testMode: Boolean(testMode),
  };
  const problems = validatePerson(person);
  if (problems.length) return { ok: false, problems };
  data.people.push(person);
  persist();
  return { ok: true, person };
}

export function updatePerson(id, fields) {
  const person = getPerson(id);
  if (!person) return { ok: false, problems: ['That person no longer exists.'] };
  const next = { ...person, ...cleanPersonFields(fields), updatedAt: new Date().toISOString() };
  const problems = validatePerson(next);
  if (problems.length) return { ok: false, problems };
  Object.assign(person, next);
  persist();
  return { ok: true, person };
}

/** Deletes a person and every interaction logged under them. */
export function deletePerson(id) {
  data.people = data.people.filter((p) => p.id !== id);
  data.interactions = data.interactions.filter((i) => i.personId !== id);
  persist();
}

export function interactionsFor(personId) {
  return data.interactions
    .filter((i) => i.personId === personId)
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
}

function cleanInteractionFields(f) {
  return {
    personId: f.personId,
    date: f.date,
    type: f.type,
    outcome: String(f.outcome ?? '').trim(),
    followUpDue: f.followUpDue ? f.followUpDue : null,
  };
}

export function addInteraction(fields, testMode) {
  const now = new Date().toISOString();
  const interaction = {
    id: newId(),
    createdAt: now,
    updatedAt: now,
    ...cleanInteractionFields(fields),
    followUpDoneAt: null,
    migrated: false,
    testMode: Boolean(testMode),
  };
  const problems = validateInteraction(interaction);
  if (!getPerson(interaction.personId)) problems.push('That person no longer exists.');
  if (problems.length) return { ok: false, problems };
  data.interactions.push(interaction);
  const saved = persist();
  return { ok: true, interaction, saved };
}

export function updateInteraction(id, fields) {
  const interaction = data.interactions.find((i) => i.id === id);
  if (!interaction) return { ok: false, problems: ['That interaction no longer exists.'] };
  const next = { ...interaction, ...cleanInteractionFields(fields), updatedAt: new Date().toISOString() };
  if (next.followUpDue !== interaction.followUpDue) next.followUpDoneAt = null; // a new follow-up date is not done yet
  const problems = validateInteraction(next);
  if (!getPerson(next.personId)) problems.push('That person no longer exists.');
  if (problems.length) return { ok: false, problems };
  Object.assign(interaction, next);
  persist();
  return { ok: true, interaction };
}

export function deleteInteraction(id) {
  data.interactions = data.interactions.filter((i) => i.id !== id);
  persist();
}

export function setFollowUpDone(id, done) {
  const interaction = data.interactions.find((i) => i.id === id);
  if (!interaction || !interaction.followUpDue) return;
  interaction.followUpDoneAt = done ? new Date().toISOString() : null;
  interaction.updatedAt = new Date().toISOString();
  persist();
}

/** Follow-ups not yet done, soonest first. With `onOrBefore`, only those due by that date. */
export function pendingFollowUps(onOrBefore) {
  return data.interactions
    .filter((i) => i.followUpDue && !i.followUpDoneAt && (!onOrBefore || i.followUpDue <= onOrBefore))
    .sort((a, b) => a.followUpDue.localeCompare(b.followUpDue) || a.createdAt.localeCompare(b.createdAt));
}

// ─── Cards ───────────────────────────────────────────────────────────────────

export const CARD_TYPES = ['recall', 'explain'];
export { CARD_TEXT_MAX, REFERENCE_MAX };
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

// ─── Content library (Stage 4b) ──────────────────────────────────────────────

const RESOURCE_EDITABLE = [
  'title', 'source', 'type', 'minutes', 'url', 'urlStatus', 'verifiedNote', 'why', 'optional', 'days',
  'status', 'doneDate', 'notes', 'retired',
];

function cleanResourceFields(f) {
  return {
    title: String(f.title ?? '').trim(),
    source: String(f.source ?? '').trim(),
    type: f.type,
    minutes: Number(f.minutes),
    url: String(f.url ?? '').trim(),
    why: String(f.why ?? '').trim(),
    optional: Boolean(f.optional),
    days: [...new Set((f.days ?? []).map(Number))].sort((a, b) => a - b),
  };
}

function nextPosition() {
  return data.resources.reduce((max, r) => Math.max(max, r.position ?? 0), 0) + 1;
}

export function getResource(id) {
  return data.resources.find((r) => r.id === id);
}

/** The status of a link you type in the app: "added by you" if there is one, else still needed. */
const linkStatusFor = (url) => (url ? 'added-by-you' : 'needs-your-search');

function newResource(fields, testMode, position) {
  const now = new Date().toISOString();
  const clean = cleanResourceFields(fields);
  return {
    id: fields.id || newId(),
    createdAt: now,
    updatedAt: now,
    ...clean,
    urlStatus: fields.urlStatus ?? linkStatusFor(clean.url),
    verifiedNote: String(fields.verifiedNote ?? '').trim(),
    position,
    status: 'not-started',
    doneDate: null,
    notes: '',
    retired: false,
    level: '',
    howToUse: '',
    editedByMe: false,
    newerVersion: null,
    testMode: Boolean(testMode),
  };
}

export function addResource(fields, testMode) {
  const resource = newResource(fields, testMode, nextPosition());
  const problems = validateResource(resource);
  if (problems.length) return { ok: false, problems };
  data.resources.push(resource);
  const saved = persist();
  return { ok: true, resource, saved };
}

/**
 * Adds rows that parseResourceImport already checked, in one save. An id that
 * is already in the library is never touched, so a re-import changes nothing
 * you edited and creates no duplicates.
 */
export function importResources(rows, testMode) {
  let position = nextPosition();
  const have = new Set(data.resources.map((r) => r.id));
  const added = [];
  for (const row of rows) {
    if (have.has(row.id)) continue;
    const resource = newResource(row, testMode, position++);
    if (validateResource(resource).length) continue; // cannot happen after parseResourceImport; never save a bad row
    have.add(resource.id);
    added.push(resource);
  }
  data.resources.push(...added);
  const saved = persist();
  return { ok: true, added: added.length, saved };
}

/** Remembers a real resource the first time anything about it changes during a test. */
function captureTestRevert(resource, testMode) {
  if (testMode && !resource.testMode && !resource.testRevert) {
    resource.testRevert = Object.fromEntries(RESOURCE_EDITABLE.map((k) => [k, JSON.parse(JSON.stringify(resource[k] ?? null))]));
  }
}

/** Edits a resource's details. Its status and notes are kept. A changed link counts as one you added. */
export function updateResource(id, fields, testMode) {
  const resource = getResource(id);
  if (!resource) return { ok: false, problems: ['That resource no longer exists.'] };
  const clean = cleanResourceFields(fields);
  const next = { ...resource, ...clean, optional: resource.optional, updatedAt: new Date().toISOString() };
  if (clean.url !== resource.url) {
    next.urlStatus = linkStatusFor(clean.url);
    next.verifiedNote = '';
  }
  const problems = validateResource(next);
  if (problems.length) return { ok: false, problems };
  captureTestRevert(resource, testMode);
  // Changing what the pack provided (not status, notes or retiring) makes it "yours": a pack update will not overwrite it.
  const changed = ['title', 'source', 'type', 'minutes', 'url', 'why'].some((k) => next[k] !== resource[k])
    || JSON.stringify(next.days) !== JSON.stringify(resource.days);
  if (changed) next.editedByMe = true;
  Object.assign(resource, next);
  // The Optional checkbox is your own choice, so it is stored as one (the pack's setting stays as it was).
  if (clean.optional !== isOptionalResource(resource)) setOptional('resource', id, clean.optional, resource.optional, testMode);
  else persist();
  return { ok: true, resource };
}

/** Adds the link to a resource that was marked "Link needed" (or changes its link). */
export function setResourceLink(id, url, testMode) {
  const resource = getResource(id);
  if (!resource) return { ok: false, problems: ['That resource no longer exists.'] };
  const clean = String(url ?? '').trim();
  const problems = clean ? validateResourceUrl(clean) : ['Type or paste the link first.'];
  if (problems.length) return { ok: false, problems };
  captureTestRevert(resource, testMode);
  resource.url = clean;
  resource.editedByMe = true;
  resource.urlStatus = 'added-by-you';
  resource.verifiedNote = '';
  resource.updatedAt = new Date().toISOString();
  return { ok: true, saved: persist() };
}

export function setResourceRetired(id, retired, testMode) {
  const resource = getResource(id);
  if (!resource) return;
  captureTestRevert(resource, testMode);
  resource.retired = retired;
  resource.updatedAt = new Date().toISOString();
  persist();
}

export function setResourceStatus(id, status, date, testMode) {
  const resource = getResource(id);
  if (!resource || !(status in RESOURCE_STATUSES)) return { ok: false };
  captureTestRevert(resource, testMode);
  resource.status = status;
  resource.doneDate = status === 'done' ? date : null;
  resource.updatedAt = new Date().toISOString();
  return { ok: true, saved: persist() };
}

export function setResourceNotes(id, text, testMode) {
  const resource = getResource(id);
  if (!resource) return { ok: false };
  captureTestRevert(resource, testMode);
  resource.notes = String(text ?? '').slice(0, 4000);
  resource.updatedAt = new Date().toISOString();
  return { ok: true, saved: persist() };
}

/** Resources for a plan day (as numbered in the roadmap), in plan order. Retired ones are left out. */
export function resourcesForDay(day, { includeRetired = false } = {}) {
  return effectiveResources(data.resources.filter((r) => r.days.includes(day) && (includeRetired || !r.retired)))
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
}

/** Copies of resources whose `optional` is what you see now (your choice if you made one). Read-only use. */
export function effectiveResources(list = data.resources) {
  return list.map((r) => ({ ...r, optional: isOptionalResource(r), changedByMe: isChangedByMe('resource', r.id, r.optional) }));
}

// ─── Content packs (resources and cards that ship with the app) ──────────────

/**
 * Adds new cards from content packs (ids you do not already have). They are always unverified,
 * and are never touched again once added, so whatever you do to them stays.
 */
export function addPackCards(cards) {
  const have = new Set(data.cards.flatMap((c) => [c.seedId, c.id].filter(Boolean)));
  const now = new Date().toISOString();
  const added = [];
  for (const card of cards) {
    if (have.has(card.id)) continue;
    const record = {
      id: newId(),
      createdAt: now,
      updatedAt: now,
      type: card.type,
      front: card.front,
      back: card.back,
      week: card.week,
      topic: '',
      reference: card.reference,
      source: 'pack',
      seedId: card.id,
      packId: card.packId ?? null,
      verified: false, // always: only you can verify a card
      verifiedAt: null,
      retired: false,
    };
    if (validateCard(record).length) continue; // cannot happen after the pack was checked; never save a bad card
    have.add(card.id);
    added.push(record);
  }
  data.cards.push(...added);
  return added.length;
}

/**
 * Adds what a confirmed plan (from planContent) contains. New ids only, never flagged as test data,
 * and never removed by "Delete test data". Returns how many of each were added.
 */
export function applyContentPlan(plan) {
  const resources = plan.resources.length ? importResources(plan.resources, false).added : 0;
  const cards = plan.cards.length ? addPackCards(plan.cards) : 0;
  const guidance = applyGuidance(plan.guidance ?? [], plan.dayChanges ?? []);
  const lessons = applyLessons(plan.lessons ?? []);
  const appliedAt = new Date().toISOString();
  for (const pack of plan.packs) {
    if (!pack.problems.length) data.contentPacks[pack.id] = { version: pack.version, appliedAt };
  }
  const saved = persist();
  return { resources, cards, guidance: guidance.applied, newerVersions: guidance.newer, skipped: guidance.skipped, lessons, saved };
}

/**
 * Adds levels, how-to-use lines and suggested day changes to resources. A resource you changed yourself
 * keeps your version: the newer one is stored beside it as `newerVersion` and shown as a note you can accept.
 */
function applyGuidance(guidance, dayChanges) {
  const result = { applied: 0, newer: 0, skipped: 0 };
  const change = new Map(dayChanges.map((c) => [c.id, c]));
  for (const g of guidance) {
    const r = getResource(g.id);
    if (!r) { result.skipped += 1; continue; }
    const next = { level: g.level, howToUse: g.howToUse, days: change.get(g.id)?.planDays ?? r.days };
    if (r.editedByMe) {
      const differs = r.level !== next.level || r.howToUse !== next.howToUse || JSON.stringify(r.days) !== JSON.stringify(next.days);
      if (differs) {
        r.newerVersion = { ...next, reason: change.get(g.id)?.reason ?? '', packId: g.packId };
        result.newer += 1;
      }
    } else {
      Object.assign(r, next, { newerVersion: null });
      result.applied += 1;
    }
  }
  // A day change for a resource that has no guidance row still follows the same rule.
  for (const c of dayChanges) {
    if (guidance.some((g) => g.id === c.id)) continue;
    const r = getResource(c.id);
    if (!r) continue;
    if (r.editedByMe) r.newerVersion = { level: r.level, howToUse: r.howToUse, days: c.planDays, reason: c.reason, packId: c.packId };
    else r.days = c.planDays;
  }
  return result;
}

/** Adds lessons, or replaces one from an older pack version. Your answers are kept (they are stored apart). */
function applyLessons(lessons) {
  let count = 0;
  for (const l of lessons) {
    const at = data.lessons.findIndex((x) => x.id === l.id);
    if (at === -1) data.lessons.push(l);
    else data.lessons[at] = l;
    count += 1;
  }
  return count;
}

/** The lesson for a plan day (as numbered in the roadmap), or null. */
export function lessonForDay(day) {
  return data.lessons.find((l) => l.day === day) ?? null;
}

export function lessonById(id) {
  return data.lessons.find((l) => l.id === id) ?? null;
}

export function getLessonAnswers(lessonId) {
  return data.lessonAnswers[lessonId]?.answers ?? [];
}

/** Saves one answer to a check-yourself question. An emptied answer is removed. */
export function setLessonAnswer(lessonId, index, text, testMode = false) {
  const lesson = lessonById(lessonId);
  if (!lesson || index < 0 || index >= lesson.checkYourself.length) return false;
  const entry = data.lessonAnswers[lessonId] ?? { answers: [], updatedAt: null };
  const answers = lesson.checkYourself.map((_, i) => entry.answers[i] ?? '');
  answers[index] = String(text ?? '').slice(0, 4000);
  // While testing, the answers you had before are remembered so "Delete test data" can put them back.
  const testPrev = testMode ? (entry.testMode ? entry.testPrev ?? null : data.lessonAnswers[lessonId] ?? null) : undefined;
  if (answers.every((a) => a.trim() === '') && !testMode) delete data.lessonAnswers[lessonId];
  else {
    data.lessonAnswers[lessonId] = { answers, updatedAt: new Date().toISOString() };
    if (testMode) Object.assign(data.lessonAnswers[lessonId], { testMode: true, testPrev });
  }
  return persist();
}

/** Takes the newer version of a resource that you had changed, or keeps yours and hides the note. */
export function resolveNewerVersion(id, useNewer) {
  const r = getResource(id);
  if (!r?.newerVersion) return;
  if (useNewer) {
    const { level, howToUse, days } = r.newerVersion;
    Object.assign(r, { level, howToUse, days });
  }
  r.newerVersion = null;
  persist();
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
    interactions: doc.interactions?.length ?? 0,
    resources: doc.resources?.length ?? 0,
    reviews: doc.reviews?.length ?? 0,
    exportedAt: doc.exportedAt ?? null,
  };
}

/**
 * Checks an import file without changing anything. An older (Stage 1–3) file
 * is converted by the same migration as on load, and checked the same way.
 * Returns { ok: true, doc, summary, migration } or { ok: false, problems }.
 * `migration` is null for a current file, otherwise { fromVersion, notice, rawText }.
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
  if (raw.planVersion !== undefined && !(Number.isInteger(raw.planVersion) && raw.planVersion >= 1 && raw.planVersion <= PLAN_VERSION)) {
    problems.push(`The file's plan version (${String(raw.planVersion).slice(0, 12)}) is not one this app knows (1 to ${PLAN_VERSION}).`);
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
  if (raw.lessons !== undefined && !Array.isArray(raw.lessons)) problems.push('"lessons" should be a list.');
  if (raw.lessonAnswers !== undefined && (typeof raw.lessonAnswers !== 'object' || Array.isArray(raw.lessonAnswers) || raw.lessonAnswers === null)) {
    problems.push('"lessonAnswers" should be an object.');
  }
  if (raw.optionalOverrides !== undefined) {
    const o = raw.optionalOverrides;
    if (typeof o !== 'object' || Array.isArray(o) || o === null
      || Object.entries(o).some(([k, v]) => !/^(item|resource):.+/.test(k) || typeof v?.optional !== 'boolean')) {
      problems.push('"optionalOverrides" should be an object of Optional/Required choices.');
    }
  }
  if (raw.weekChecks !== undefined && (typeof raw.weekChecks !== 'object' || Array.isArray(raw.weekChecks) || raw.weekChecks === null)) {
    problems.push('"weekChecks" should be an object.');
  }
  if (problems.length) return { ok: false, problems: problems.slice(0, 8) };

  // Older files: convert with the same migration (and the same before/after check) as on load.
  let doc = raw;
  let migration = null;
  if (needsMigration(raw)) {
    const result = migrate(raw);
    if (!result.ok) return { ok: false, problems: result.problems.slice(0, 8) };
    doc = result.doc;
    migration = { fromVersion: result.fromVersion, notice: result.notice, rawText: text };
  }

  // Everything below checks the converted document.
  (doc.tallies ?? []).forEach((t, i) => {
    const p = validateTally(t ?? {});
    if (!t?.id) p.push('missing id');
    if (p.length) problems.push(`Quick entry ${i + 1}: ${p.join(' ')}`);
  });
  (doc.artifacts ?? []).forEach((a, i) => {
    const p = validateArtifact(a ?? {});
    if (!a?.id) p.push('missing id');
    if (p.length) problems.push(`Evidence ${i + 1}: ${p.join(' ')}`);
  });
  (doc.people ?? []).forEach((person, i) => {
    const p = validatePerson(person ?? {});
    if (!person?.id) p.push('missing id');
    if (p.length) problems.push(`Person ${i + 1}: ${p.join(' ')}`);
  });
  (doc.resources ?? []).forEach((r, i) => {
    const p = validateResource(r ?? {});
    if (!r?.id) p.push('missing id');
    if (p.length) problems.push(`Resource ${i + 1}: ${p.join(' ')}`);
  });
  const personIds = new Set((doc.people ?? []).map((person) => person?.id));
  (doc.interactions ?? []).forEach((it, i) => {
    const p = validateInteraction(it ?? {});
    if (!it?.id) p.push('missing id');
    if (it?.personId && !personIds.has(it.personId)) p.push('that person is not in the file');
    if (p.length) problems.push(`Interaction ${i + 1}: ${p.join(' ')}`);
  });
  if (problems.length) return { ok: false, problems: problems.slice(0, 8) };

  return { ok: true, doc: normalize(doc), summary: summarize(raw), migration };
}

/**
 * Replaces all data with a document from parseImport, keeping a backup of the
 * current data first (and a copy of an older file's original contents).
 */
export function replaceWithImport(parsed) {
  const backup = { savedAt: new Date().toISOString(), data };
  if (!writeKey(BACKUP_KEY, JSON.stringify(backup))) {
    return { ok: false, problems: ['Could not save a backup of your current data, so nothing was replaced.'] };
  }
  if (parsed.migration && !saveMigrationBackup({
    reason: 'import', fromVersion: parsed.migration.fromVersion, text: parsed.migration.rawText,
  })) {
    return { ok: false, problems: ['Could not save a copy of the older file, so nothing was replaced.'] };
  }
  loadProblem = null;
  data = normalize(parsed.doc);
  migratePlan();
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
  if (!text) return { ok: false, problems: ['There is no backup to restore.'] };
  let backup;
  try {
    backup = JSON.parse(text);
  } catch {
    return { ok: false, problems: ['The backup could not be read.'] };
  }
  // A backup made by an older version of the app goes through the migration too.
  const result = migrate(backup.data);
  if (!result.ok) return { ok: false, problems: result.problems };
  if (result.changed && !saveMigrationBackup({
    reason: 'restore', fromVersion: result.fromVersion, text: JSON.stringify(backup.data),
  })) {
    return { ok: false, problems: ['Could not save a copy of the older backup, so nothing was restored.'] };
  }
  const current = { savedAt: new Date().toISOString(), data };
  data = normalize(result.doc);
  migratePlan();
  seedCards();
  persist();
  writeKey(BACKUP_KEY, JSON.stringify(current));
  return { ok: true };
}

// ─── Migration backups ───────────────────────────────────────────────────────
// A copy of the old-format data, kept until you delete it in Settings.

function readMigrationBackups() {
  try {
    const list = JSON.parse(readKey(MIGRATION_BACKUPS_KEY) ?? '[]');
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

/** Saves a copy of old-format data. Returns false if it could not be stored. */
function saveMigrationBackup({ reason, fromVersion, text }) {
  const list = readMigrationBackups();
  if (list.some((b) => b.text === text)) return true; // this exact copy is already kept
  list.push({ id: newId(), savedAt: new Date().toISOString(), reason, fromVersion, text });
  return writeKey(MIGRATION_BACKUPS_KEY, JSON.stringify(list));
}

/** The kept copies, newest first, without their full text. */
export function getMigrationBackups() {
  return readMigrationBackups()
    .map((b) => {
      let summary = null;
      try {
        summary = summarize(JSON.parse(b.text));
      } catch {
        // an unreadable copy is still listed, so it can be downloaded or deleted
      }
      return { id: b.id, savedAt: b.savedAt, reason: b.reason, fromVersion: b.fromVersion, summary };
    })
    .sort((a, b) => b.savedAt.localeCompare(a.savedAt));
}

export function getMigrationBackupText(id) {
  return readMigrationBackups().find((b) => b.id === id)?.text ?? null;
}

export function deleteMigrationBackup(id) {
  const list = readMigrationBackups().filter((b) => b.id !== id);
  writeKey(MIGRATION_BACKUPS_KEY, JSON.stringify(list));
}

/** Clears the one-time message shown after a migration. */
export function dismissMigrationNotice() {
  data.settings.migrationNotice = null;
  persist();
}
