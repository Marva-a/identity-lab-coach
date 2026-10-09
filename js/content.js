// Content packs: resources and flashcards that ship with the app, in the /content folder.
//
// The rules (the same code runs in your browser and in the build check):
// - A manifest (content/manifest.json) lists the packs. Resource packs use the
//   "identity-lab-coach.resources.v1" file format; card packs use "identity-lab-coach.cards.v1".
// - Packs are fetched only from this app's own site, and nothing of yours is ever sent.
// - Only NEW ids are added. Anything you already have (a resource or a card, whatever you did
//   to it: links, statuses, notes, edits, ratings, retirements) is never changed, and an id you
//   retired stays retired. So checking twice adds nothing the second time.
// - Cards from a pack always arrive unverified, with their reference. Only you can verify one.
// - Nothing is added until you confirm.
//
// The parts that do not touch the page (checking and planning) are pure functions.
import { parseResourceImport } from './resource-import.js';
import {
  RESOURCE_ID_RE, CARD_TEXT_MAX, REFERENCE_MAX, RESOURCE_LEVELS, HOW_TO_USE_MAX, isPlanStudyDay, isDate,
} from './records.js';
import { PLAN_START } from './plan-data.js';
import { addDays } from './dates.js';
import * as idb from './idb.js';

export const MANIFEST_SCHEMA = 'identity-lab-coach.content-manifest.v1';
export const CARD_PACK_SCHEMA = 'identity-lab-coach.cards.v1';
export const PACK_TYPES = ['resources', 'cards', 'guidance', 'lessons'];
export const GUIDANCE_SCHEMA = 'identity-lab-coach.guidance.v1';
export const LESSON_SCHEMA = 'identity-lab-coach.lessons.v1';
export const CONTENT_DIR = 'content/';
export const MAX_CARDS_PER_PACK = 300;

const PACK_ID_RE = /^[a-z0-9][a-z0-9-]{0,60}$/;
// A pack file name: plain letters, numbers, dots, hyphens and underscores. No folders, so a pack can
// never point anywhere except into the content folder.
const PACK_PATH_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,80}\.json$/;
const MANIFEST_PACK_FIELDS = ['id', 'title', 'version', 'type', 'path'];
const CARD_FIELDS = ['id', 'front', 'back', 'type', 'weekTag', 'reference', 'verified'];

// ─── The manifest ────────────────────────────────────────────────────────────

/** Checks the manifest. Returns { ok, problems: [text], packs: [clean packs] }. */
export function validateManifest(manifest) {
  const problems = [];
  const packs = [];
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    return { ok: false, problems: ['The manifest should be an object.'], packs };
  }
  if (manifest.schema !== MANIFEST_SCHEMA) problems.push(`The manifest's schema should be "${MANIFEST_SCHEMA}".`);
  if (!Array.isArray(manifest.packs) || !manifest.packs.length) {
    problems.push('The manifest needs a "packs" list with at least one pack.');
    return { ok: false, problems, packs };
  }
  const ids = new Set();
  const paths = new Set();
  manifest.packs.forEach((p, i) => {
    const label = typeof p?.id === 'string' && p.id ? `Pack "${p.id}"` : `Pack ${i + 1}`;
    const bad = [];
    if (!p || typeof p !== 'object' || Array.isArray(p)) {
      problems.push(`${label}: should be an object.`);
      return;
    }
    for (const key of Object.keys(p)) if (!MANIFEST_PACK_FIELDS.includes(key)) bad.push(`has an unknown field "${key}"`);
    if (typeof p.id !== 'string' || !PACK_ID_RE.test(p.id)) bad.push('needs an id of lowercase letters, numbers and hyphens');
    if (typeof p.title !== 'string' || !p.title.trim() || p.title.length > 120) bad.push('needs a title (up to 120 characters)');
    if (!Number.isInteger(p.version) || p.version < 1) bad.push('needs a version that is a whole number from 1');
    if (!PACK_TYPES.includes(p.type)) bad.push(`needs a type of ${PACK_TYPES.join(' or ')}`);
    if (typeof p.path !== 'string' || !PACK_PATH_RE.test(p.path) || p.path.includes('..')) {
      bad.push('needs a path that is a plain file name ending in .json (no folders)');
    }
    if (typeof p.id === 'string' && ids.has(p.id)) bad.push('repeats an id used by another pack');
    if (typeof p.path === 'string' && paths.has(p.path)) bad.push('repeats a path used by another pack');
    if (bad.length) {
      problems.push(`${label}: ${bad.join('; ')}.`);
      return;
    }
    ids.add(p.id);
    paths.add(p.path);
    packs.push({ id: p.id, title: p.title.trim(), version: p.version, type: p.type, path: p.path });
  });
  return { ok: problems.length === 0, problems, packs };
}

// ─── Card packs ──────────────────────────────────────────────────────────────

/**
 * Checks a card pack file.
 * Returns { ok, fileProblems, rowProblems: [{ entry, id, messages }], cards: [clean cards] }.
 * `strictVerified` (used by the build check) makes `verified: true` an error, because a pack must
 * never claim a card is verified. In the app it is simply ignored: pack cards are always unverified.
 */
export function parseCardPack(text, { strictVerified = false } = {}) {
  const result = { ok: false, fileProblems: [], rowProblems: [], cards: [] };
  let raw;
  try {
    raw = JSON.parse(text);
  } catch {
    result.fileProblems.push('This file is not valid JSON.');
    return result;
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || raw.schema !== CARD_PACK_SCHEMA) {
    result.fileProblems.push(`The file should be an object with "schema": "${CARD_PACK_SCHEMA}" and a "cards" list.`);
    return result;
  }
  if (!Array.isArray(raw.cards)) {
    result.fileProblems.push('The file should have a "cards" list.');
    return result;
  }
  if (raw.cards.length > MAX_CARDS_PER_PACK) result.fileProblems.push(`A card pack can hold at most ${MAX_CARDS_PER_PACK} cards.`);
  if (result.fileProblems.length) return result;

  const seen = new Map();
  raw.cards.forEach((item, index) => {
    const entry = index + 1;
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      result.rowProblems.push({ entry, id: null, messages: ['This entry should be an object.'] });
      return;
    }
    const id = typeof item.id === 'string' && item.id ? item.id : null;
    const messages = [];
    for (const key of Object.keys(item)) if (!CARD_FIELDS.includes(key)) messages.push(`Unknown field "${key}". The fields are: ${CARD_FIELDS.join(', ')}.`);
    if (!id || !RESOURCE_ID_RE.test(id)) messages.push('The id may only use letters, numbers, hyphens and underscores (up to 80 characters).');
    else if (seen.has(id)) messages.push(`Duplicate id: the same id is used in entry ${seen.get(id)}.`);
    else seen.set(id, entry);
    const text = (v) => (typeof v === 'string' ? v.trim() : '');
    if (!text(item.front)) messages.push('Add the front (the question).');
    else if (item.front.length > CARD_TEXT_MAX) messages.push(`Keep the front under ${CARD_TEXT_MAX} characters.`);
    if (!text(item.back)) messages.push('Add the back (the answer).');
    else if (item.back.length > CARD_TEXT_MAX) messages.push(`Keep the back under ${CARD_TEXT_MAX} characters.`);
    if (item.type !== 'recall' && item.type !== 'explain') messages.push('The type must be "recall" or "explain".');
    if (!Number.isInteger(item.weekTag) || item.weekTag < 1 || item.weekTag > 9) messages.push('The weekTag must be a whole number from 1 to 9.');
    if (!text(item.reference)) messages.push('Add a reference: every card shows where to check it.');
    else if (item.reference.length > REFERENCE_MAX) messages.push(`Keep the reference under ${REFERENCE_MAX} characters.`);
    if (item.verified !== undefined && typeof item.verified !== 'boolean') messages.push('"verified" must be false.');
    if (strictVerified && item.verified === true) messages.push('"verified" must be false in a pack. Only you can verify a card, in the app.');
    if (messages.length) result.rowProblems.push({ entry, id, messages });
    else {
      result.cards.push({
        id,
        front: item.front.trim(),
        back: item.back.trim(),
        type: item.type,
        week: item.weekTag,
        reference: item.reference.trim(),
        verified: false, // always, whatever the file says
      });
    }
  });
  result.ok = result.rowProblems.length === 0;
  return result;
}

// ─── Planning what would be added ────────────────────────────────────────────

/**
 * Works out what checking would add, without changing anything.
 * `content` is { manifest, packTexts: { [packId]: file text } }; `data` is the saved data
 * (it only needs `resources` and `cards`).
 * Returns {
 *   packs:      [{ id, title, version, type, newCount, existingCount, problems: [text] }]
 *   resources:  clean resource rows to add (new ids only)
 *   cards:      clean cards to add (new ids only)
 *   warnings:   [text] things worth a look that do not stop anything
 *   problems:   [text] packs or manifest problems; a pack with a problem adds nothing
 * }
 */
export function planContent(content, data) {
  const plan = { packs: [], resources: [], cards: [], guidance: [], dayChanges: [], lessons: [], warnings: [], problems: [] };
  const manifest = validateManifest(content?.manifest);
  if (!manifest.ok) {
    plan.problems.push(...manifest.problems);
    return plan;
  }
  const haveResources = new Map((data.resources ?? []).map((r) => [r.id, { id: r.id, title: r.title, url: r.url }]));
  const haveCards = new Set((data.cards ?? []).flatMap((c) => [c.seedId, c.id].filter(Boolean)));

  for (const pack of manifest.packs) {
    const text = content.packTexts?.[pack.id];
    const entry = { id: pack.id, title: pack.title, version: pack.version, type: pack.type, newCount: 0, existingCount: 0, problems: [] };
    plan.packs.push(entry);
    if (typeof text !== 'string') {
      entry.problems.push('The pack file was not fetched.');
      continue;
    }
    if (pack.type === 'resources') {
      // Ids already planned from an earlier pack count as "already there" for this one.
      const parsed = parseResourceImport(text, [...haveResources.values()]);
      if (!parsed.ok) {
        entry.problems.push(...parsed.fileProblems, ...parsed.rowProblems.map((p) => `${p.id ?? `Entry ${p.entry}`}: ${p.messages.join(' ')}`));
        continue;
      }
      entry.existingCount = parsed.skipped.length;
      entry.newCount = parsed.rows.length;
      plan.resources.push(...parsed.rows);
      for (const row of parsed.rows) haveResources.set(row.id, { id: row.id, title: row.title, url: row.url });
      plan.warnings.push(...parsed.warnings.map((w) => `${pack.title}: ${w.id}: ${w.message}`));
    } else if (pack.type === 'guidance') {
      const parsed = parseGuidancePack(text);
      if (!parsed.ok) {
        entry.problems.push(...parsed.fileProblems, ...parsed.rowProblems.map((p) => `${p.id ?? `Entry ${p.entry}`}: ${p.messages.join(' ')}`));
        continue;
      }
      // A guidance pack is applied once per version; a higher version in the manifest applies again.
      if ((data.contentPacks?.[pack.id]?.version ?? 0) >= pack.version) {
        entry.existingCount = parsed.guidance.length;
      } else {
        entry.newCount = parsed.guidance.length;
        plan.guidance.push(...parsed.guidance.map((g) => ({ ...g, packId: pack.id })));
        plan.dayChanges.push(...parsed.dayChanges.map((c) => ({ ...c, packId: pack.id })));
      }
    } else if (pack.type === 'lessons') {
      const parsed = parseLessonPack(text);
      if (!parsed.ok) {
        entry.problems.push(...parsed.fileProblems, ...parsed.rowProblems.map((p) => `${p.id ?? `Entry ${p.entry}`}: ${p.messages.join(' ')}`));
        continue;
      }
      for (const lesson of parsed.lessons) {
        const have = (data.lessons ?? []).find((x) => x.id === lesson.id);
        if (!have || (have.packVersion ?? 0) < pack.version) {
          plan.lessons.push({ ...lesson, packId: pack.id, packVersion: pack.version });
          entry.newCount += 1;
        } else entry.existingCount += 1;
      }
    } else {
      const parsed = parseCardPack(text);
      if (!parsed.ok) {
        entry.problems.push(...parsed.fileProblems, ...parsed.rowProblems.map((p) => `${p.id ?? `Entry ${p.entry}`}: ${p.messages.join(' ')}`));
        continue;
      }
      for (const card of parsed.cards) {
        if (haveCards.has(card.id)) entry.existingCount += 1;
        else {
          haveCards.add(card.id);
          plan.cards.push({ ...card, packId: pack.id });
          entry.newCount += 1;
        }
      }
    }
  }
  for (const p of plan.packs) for (const problem of p.problems) plan.problems.push(`${p.title}: ${problem}`);
  return plan;
}

/** A readable summary line, naming only what is new: "Ready to add 71 resources, 6 lessons and 71 reading tips". */
export function summarizePlan(plan) {
  const part = (n, one, many) => (n ? `${n} ${n === 1 ? one : many}` : '');
  const parts = [
    part(plan.resources.length, 'resource', 'resources'),
    part(plan.lessons?.length ?? 0, 'lesson', 'lessons'),
    part(plan.cards.length, 'flashcard', 'flashcards'),
    part(plan.guidance?.length ?? 0, 'reading tip', 'reading tips'),
  ].filter(Boolean);
  if (!parts.length) return 'Nothing new to add';
  const list = parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
  return `Ready to add ${list}`;
}

/** How many things a plan would add or update (zero means you are up to date). */
export const planSize = (plan) => plan.resources.length + plan.cards.length + (plan.guidance?.length ?? 0) + (plan.lessons?.length ?? 0);


// ─── Guidance packs (a level and a how-to-use line for each resource) ─────────

/**
 * Checks a guidance pack: { schema, resources: { id: { level, howToUse } }, suggestedDayChanges: [{ id, planDays, reason }] }.
 * Returns { ok, fileProblems, rowProblems, guidance: [{ id, level, howToUse }], dayChanges: [{ id, planDays, reason }] }.
 */
export function parseGuidancePack(text) {
  const out = { ok: false, fileProblems: [], rowProblems: [], guidance: [], dayChanges: [] };
  let doc;
  try {
    doc = JSON.parse(text);
  } catch {
    out.fileProblems.push('This is not valid JSON.');
    return out;
  }
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) {
    out.fileProblems.push('The file should be an object.');
    return out;
  }
  if (doc.schema !== GUIDANCE_SCHEMA) out.fileProblems.push(`The schema should be "${GUIDANCE_SCHEMA}".`);
  const res = doc.resources;
  if (!res || typeof res !== 'object' || Array.isArray(res) || !Object.keys(res).length) {
    out.fileProblems.push('The file needs a "resources" object with at least one resource.');
  } else {
    Object.entries(res).forEach(([id, g], i) => {
      const messages = [];
      if (!RESOURCE_ID_RE.test(id)) messages.push('the id is not valid');
      if (!g || typeof g !== 'object' || Array.isArray(g)) messages.push('should be an object');
      else {
        for (const key of Object.keys(g)) if (!['level', 'howToUse'].includes(key)) messages.push(`has an unknown field "${key}"`);
        if (!(g.level in RESOURCE_LEVELS)) messages.push('level must be foundation, core or deep');
        if (typeof g.howToUse !== 'string' || !g.howToUse.trim() || g.howToUse.length > HOW_TO_USE_MAX) messages.push(`howToUse must be 1–${HOW_TO_USE_MAX} characters`);
      }
      if (messages.length) out.rowProblems.push({ entry: i + 1, id, messages });
      else out.guidance.push({ id, level: g.level, howToUse: g.howToUse.trim() });
    });
  }
  const changes = doc.suggestedDayChanges ?? [];
  if (!Array.isArray(changes)) out.fileProblems.push('"suggestedDayChanges" should be a list.');
  else {
    changes.forEach((c, i) => {
      const messages = [];
      if (!c || typeof c !== 'object' || Array.isArray(c)) messages.push('should be an object');
      else {
        if (typeof c.id !== 'string' || !RESOURCE_ID_RE.test(c.id)) messages.push('the id is not valid');
        if (!Array.isArray(c.planDays) || !c.planDays.length || c.planDays.length > 6
          || c.planDays.some((d) => !Number.isInteger(d) || !isPlanStudyDay(d))) messages.push('planDays must be 1–6 study days (1–60, no Sundays)');
        if (c.reason !== undefined && (typeof c.reason !== 'string' || c.reason.length > 300)) messages.push('reason must be text up to 300 characters');
      }
      if (messages.length) out.rowProblems.push({ entry: i + 1, id: c?.id, messages: [`day change: ${messages.join('; ')}`] });
      else out.dayChanges.push({ id: c.id, planDays: [...new Set(c.planDays)].sort((a, b) => a - b), reason: String(c.reason ?? '').trim() });
    });
  }
  out.ok = !out.fileProblems.length && !out.rowProblems.length;
  return out;
}

// ─── Lesson packs (one lesson for each study day) ────────────────────────────

export const LESSON_LIMITS = { title: 120, sentence: 400, paragraph: 600, idea: 400, term: 80, meaning: 300, step: 400, check: 300 };
const LESSON_FIELDS = [
  'id', 'week', 'day', 'date', 'title', 'inOneSentence', 'whyItMattersToADesigner', 'keyIdeas', 'words', 'steps',
  'skipOrSkim', 'checkYourself', 'lookFor', 'plannedMinutes',
];

/**
 * Checks a lessons pack. Returns { ok, fileProblems, rowProblems, lessons: [clean lessons] }.
 * Every lesson must sit on a real study day with the date the plan gives that day.
 */
export function parseLessonPack(text) {
  const out = { ok: false, fileProblems: [], rowProblems: [], lessons: [] };
  let doc;
  try {
    doc = JSON.parse(text);
  } catch {
    out.fileProblems.push('This is not valid JSON.');
    return out;
  }
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) {
    out.fileProblems.push('The file should be an object.');
    return out;
  }
  if (doc.schema !== LESSON_SCHEMA) out.fileProblems.push(`The schema should be "${LESSON_SCHEMA}".`);
  if (!Array.isArray(doc.lessons) || !doc.lessons.length) {
    out.fileProblems.push('The file needs a "lessons" list with at least one lesson.');
    out.ok = false;
    return out;
  }
  if (doc.lessons.length > 60) out.fileProblems.push('A lessons pack can hold at most 60 lessons.');
  const seenIds = new Set();
  const seenDays = new Set();
  const str = (v, max) => typeof v === 'string' && v.trim() !== '' && v.length <= max;
  doc.lessons.slice(0, 60).forEach((l, i) => {
    const m = [];
    const id = typeof l?.id === 'string' ? l.id : undefined;
    if (!l || typeof l !== 'object' || Array.isArray(l)) {
      out.rowProblems.push({ entry: i + 1, id, messages: ['should be an object'] });
      return;
    }
    for (const key of Object.keys(l)) if (!LESSON_FIELDS.includes(key)) m.push(`has an unknown field "${key}"`);
    if (typeof l.id !== 'string' || !RESOURCE_ID_RE.test(l.id)) m.push('needs an id of lowercase letters, numbers and hyphens');
    else if (seenIds.has(l.id)) m.push('repeats an id used by another lesson');
    if (!Number.isInteger(l.day) || !isPlanStudyDay(l.day)) m.push('day must be a study day (1–60, no Sundays)');
    else {
      if (seenDays.has(l.day)) m.push(`day ${l.day} already has a lesson in this file`);
      if (l.date !== addDays(PLAN_START, l.day - 1)) m.push(`date should be ${addDays(PLAN_START, l.day - 1)} for day ${l.day}`);
      if (!Number.isInteger(l.week) || l.week !== Math.ceil(l.day / 7)) m.push(`week should be ${Math.ceil(l.day / 7)} for day ${l.day}`);
    }
    if (!isDate(l.date)) m.push('date must be YYYY-MM-DD');
    if (!str(l.title, LESSON_LIMITS.title)) m.push(`title must be 1–${LESSON_LIMITS.title} characters`);
    if (!str(l.inOneSentence, LESSON_LIMITS.sentence)) m.push(`inOneSentence must be 1–${LESSON_LIMITS.sentence} characters`);
    if (!str(l.whyItMattersToADesigner, LESSON_LIMITS.paragraph)) m.push(`whyItMattersToADesigner must be 1–${LESSON_LIMITS.paragraph} characters`);
    if (!str(l.skipOrSkim, LESSON_LIMITS.paragraph)) m.push(`skipOrSkim must be 1–${LESSON_LIMITS.paragraph} characters`);
    if (!Array.isArray(l.keyIdeas) || !l.keyIdeas.length || l.keyIdeas.length > 8 || l.keyIdeas.some((k) => !str(k, LESSON_LIMITS.idea))) {
      m.push(`keyIdeas must be 1–8 lines of up to ${LESSON_LIMITS.idea} characters`);
    }
    if (!Array.isArray(l.words) || l.words.length > 12
      || l.words.some((w) => !w || !str(w.term, LESSON_LIMITS.term) || !str(w.meaning, LESSON_LIMITS.meaning) || Object.keys(w).some((k) => !['term', 'meaning'].includes(k)))) {
      m.push('words must be up to 12 entries, each with a term and a meaning');
    }
    if (!Array.isArray(l.steps) || !l.steps.length || l.steps.length > 12
      || l.steps.some((s) => !s || !str(s.text, LESSON_LIMITS.step) || !Number.isInteger(s.minutes) || s.minutes < 1 || s.minutes > 240
        || !(s.resourceId === null || (typeof s.resourceId === 'string' && RESOURCE_ID_RE.test(s.resourceId)))
        || Object.keys(s).some((k) => !['text', 'minutes', 'resourceId'].includes(k)))) {
      m.push('steps must be 1–12 entries, each with text, minutes (1–240) and a resourceId (or null)');
    }
    if (!Array.isArray(l.checkYourself) || !l.checkYourself.length || l.checkYourself.length > 4 || l.checkYourself.some((q) => !str(q, LESSON_LIMITS.check))) {
      m.push(`checkYourself must be 1–4 questions of up to ${LESSON_LIMITS.check} characters`);
    }
    // Optional: for each question, what a good answer includes (shown only when you open it, after you try).
    if (l.lookFor !== undefined && (!Array.isArray(l.lookFor) || !Array.isArray(l.checkYourself) || l.lookFor.length !== l.checkYourself.length
      || l.lookFor.some((a) => !str(a, LESSON_LIMITS.paragraph)))) {
      m.push(`lookFor, when given, must have one line of up to ${LESSON_LIMITS.paragraph} characters for each checkYourself question`);
    }
    if (!Number.isInteger(l.plannedMinutes) || l.plannedMinutes < 15 || l.plannedMinutes > 600) m.push('plannedMinutes must be a whole number from 15 to 600');
    if (m.length) {
      out.rowProblems.push({ entry: i + 1, id, messages: m });
      return;
    }
    seenIds.add(l.id);
    seenDays.add(l.day);
    out.lessons.push({
      id: l.id, week: l.week, day: l.day, date: l.date, title: l.title.trim(), inOneSentence: l.inOneSentence.trim(),
      whyItMattersToADesigner: l.whyItMattersToADesigner.trim(), keyIdeas: l.keyIdeas.map((k) => k.trim()),
      words: l.words.map((w) => ({ term: w.term.trim(), meaning: w.meaning.trim() })),
      steps: l.steps.map((s) => ({ text: s.text.trim(), minutes: s.minutes, resourceId: s.resourceId })),
      skipOrSkim: l.skipOrSkim.trim(), checkYourself: l.checkYourself.map((q) => q.trim()),
      lookFor: l.lookFor ? l.lookFor.map((a) => a.trim()) : null, plannedMinutes: l.plannedMinutes,
    });
  });
  out.ok = !out.fileProblems.length && !out.rowProblems.length;
  return out;
}

// ─── Fetching (browser only) ─────────────────────────────────────────────────

/**
 * Fetches the manifest and every pack from THIS site's content folder, and nothing else.
 * Plain GET requests with no cookies, no referrer and no body: nothing of yours is sent.
 * Throws an Error with a plain-language message if anything fails.
 */
/** How every content request is made: a plain GET with no cookies, no body, no referrer, and no redirects. */
export const CONTENT_REQUEST_INIT = Object.freeze({
  method: 'GET', cache: 'no-store', credentials: 'omit', mode: 'same-origin', referrerPolicy: 'no-referrer', redirect: 'error',
});

/** The address of a file in the content folder. Anything that would leave the folder is refused. */
export function contentUrl(name, root) {
  const url = new URL(name, root);
  if (url.origin !== root.origin || !url.pathname.startsWith(root.pathname)) {
    throw new Error(`Refused to fetch ${String(name).slice(0, 60)}: it is outside the content folder.`);
  }
  return url;
}

export async function fetchContent({ fetchFn = globalThis.fetch, base } = {}) {
  const root = base ?? new URL(CONTENT_DIR, globalThis.location.href);
  if (root.origin !== globalThis.location.origin) throw new Error('The content folder must be on this app’s own site.');
  let servedOffline = false;
  const get = async (name) => {
    const url = contentUrl(name, root);
    const res = await fetchFn(url.href, { ...CONTENT_REQUEST_INIT });
    if (!res.ok) throw new Error(`${name} could not be fetched (status ${res.status}).`);
    if (res.headers.get('x-served-from-offline-copy')) servedOffline = true;
    return res.text();
  };
  const manifestText = await get('manifest.json');
  let manifest;
  try {
    manifest = JSON.parse(manifestText);
  } catch {
    throw new Error('The manifest is not valid JSON.');
  }
  const checked = validateManifest(manifest);
  if (!checked.ok) throw new Error(`The manifest has problems: ${checked.problems.join(' ')}`);
  const packTexts = {};
  for (const pack of checked.packs) packTexts[pack.id] = await get(pack.path);
  return { fetchedAt: new Date().toISOString(), manifest, packTexts, servedOffline };
}

// ─── The last fetched copy (so it works offline) ─────────────────────────────

const CACHE_KEY = 'contentCache';

export async function saveContentCache(content) {
  return idb.kvSet(CACHE_KEY, { fetchedAt: content.fetchedAt, manifest: content.manifest, packTexts: content.packTexts });
}

export async function loadContentCache() {
  const cached = await idb.kvGet(CACHE_KEY);
  return cached && cached.manifest && cached.packTexts ? { ...cached, servedOffline: false } : null;
}

/**
 * The "Check for new content" step. It tries this site first. If that fails it says so and falls back to
 * the last copy it fetched, if there is one. It never changes your data: that only happens when you confirm.
 * Returns { content, source: 'site' | 'last copy', failure: text | null } or { content: null, failure: text }.
 */
export async function checkForContent({ fetchFn } = {}) {
  try {
    const content = await fetchContent({ fetchFn });
    await saveContentCache(content);
    return { content, source: content.servedOffline ? 'last copy' : 'site', failure: null };
  } catch (error) {
    const failure = String(error?.message ?? error).slice(0, 200);
    const cached = await loadContentCache();
    return cached ? { content: cached, source: 'last copy', failure } : { content: null, source: null, failure };
  }
}
