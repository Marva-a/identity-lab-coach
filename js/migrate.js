// Migration from Stage 1–3 data (schema 1–3) to Stage 4 (schema 4).
//
// What it does:
// - Each "artifact" +1 entry becomes a PUBLISHED Evidence record (same id,
//   its date as both created and published date, its note as the title).
// - Each "conversation" or "referral" +1 entry becomes an interaction under one
//   person called "Unassigned (migrated)" (same id, same date, note as outcome).
// - "Application" +1 entries stay exactly as they are.
//
// Safety:
// - It works on a COPY and never touches the input.
// - Before returning, it recounts every scorecard measure from the converted
//   copy and compares it with the counts before (same dates, not just totals,
//   plus the scorecard rows for three dates). Any difference returns an error
//   and NO converted data, so the caller saves nothing.
// - It is safe to run twice: converted entries keep their ids, an entry whose
//   record already exists is dropped instead of duplicated, and data that is
//   already in the new format comes back unchanged.
// Pure functions only (no storage), so the date checks can test it in Node.
import {
  SCHEMA_VERSION, UNASSIGNED_ID, UNASSIGNED_NAME, countsFromDoc, isDate, ARTIFACT_CATEGORIES, UNCATEGORISED,
} from './records.js';
import { scorecard, PERIOD_2 } from './pace.js';
import { PLAN_END } from './plan-data.js';
import { vancouverDate } from './dates.js';

const LEGACY_KINDS = ['artifact', 'conversation', 'application', 'referral'];
const MEASURES = ['artifact', 'conversation', 'application', 'referral'];

/** True when a document is in an older format or still holds convertible entries. */
export function needsMigration(raw) {
  if (!raw || typeof raw !== 'object') return false;
  if ((raw.schemaVersion ?? 1) < SCHEMA_VERSION) return true;
  return (raw.tallies ?? []).some((t) => t && t.kind !== 'application');
}

const sorted = (list) => [...list].sort();

/** Describes any difference between two sets of counts. Empty list = identical. */
export function compareCounts(before, after) {
  const problems = [];
  for (const m of MEASURES) {
    const b = sorted(before[m]);
    const a = sorted(after[m]);
    if (JSON.stringify(a) !== JSON.stringify(b)) {
      problems.push(`${m}: ${b.length} before, ${a.length} after.`);
    }
  }
  return problems;
}

function rowsFor(doc, dates) {
  const counts = countsFromDoc(doc);
  return dates.map((d) => scorecard(d, doc.sessions ?? [], counts).map((r) => `${r.id}=${r.actual}`).join(','));
}

/**
 * Converts a document to the current schema.
 * Returns { ok: true, doc, changed, converted, notice } or { ok: false, problems }.
 */
export function migrate(raw, { now = new Date(), today = vancouverDate(now) } = {}) {
  if (!needsMigration(raw)) return { ok: true, doc: raw, changed: false, converted: null, notice: null };

  const doc = JSON.parse(JSON.stringify(raw));
  const nowIso = now.toISOString();
  const fromVersion = doc.schemaVersion ?? 1;

  // Refuse anything we do not understand, rather than guess.
  const problems = [];
  const tallies = Array.isArray(doc.tallies) ? doc.tallies : [];
  tallies.forEach((t, i) => {
    if (!t || !LEGACY_KINDS.includes(t.kind) || !t.id || !isDate(t.date)) {
      problems.push(`Scorecard entry ${i + 1} is incomplete or has an invalid date or kind.`);
    }
  });
  if (fromVersion < 4) {
    for (const c of ['artifacts', 'people']) {
      if (Array.isArray(doc[c]) && doc[c].length) problems.push(`This older file has unexpected ${c}, so it cannot be converted safely.`);
    }
  }
  if (problems.length) return { ok: false, problems };

  const dates = [today, PLAN_END, PERIOD_2.end];
  const artifactsBefore = JSON.stringify(Array.isArray(doc.artifacts) ? doc.artifacts : []);
  const countsBefore = countsFromDoc(doc);
  const rowsBefore = rowsFor(doc, dates);

  doc.artifacts = Array.isArray(doc.artifacts) ? doc.artifacts : [];
  doc.people = Array.isArray(doc.people) ? doc.people : [];
  doc.interactions = Array.isArray(doc.interactions) ? doc.interactions : [];

  const converted = { artifact: 0, conversation: 0, referral: 0, alreadyConverted: 0 };
  const keep = [];
  let person = doc.people.find((p) => p.id === UNASSIGNED_ID);
  const ensurePerson = () => {
    if (!person) {
      person = {
        id: UNASSIGNED_ID,
        createdAt: nowIso,
        updatedAt: nowIso,
        name: UNASSIGNED_NAME,
        organization: '',
        role: '',
        connection: 'other',
        notes: 'Conversations and referral asks logged as quick "+1" entries before the People log existed. Move them to real people by editing each interaction, or leave them here.',
        link: '',
        migrated: true,
        testMode: false,
      };
      doc.people.push(person);
    }
    return person;
  };

  for (const t of tallies) {
    if (t.kind === 'application') {
      keep.push(t);
    } else if (t.kind === 'artifact') {
      if (doc.artifacts.some((a) => a.id === t.id)) {
        converted.alreadyConverted++;
      } else {
        doc.artifacts.push({
          id: t.id,
          createdAt: t.createdAt ?? nowIso,
          updatedAt: nowIso,
          title: String(t.note ?? '').trim() || `Artifact logged ${t.date}`,
          type: 'other',
          status: 'published',
          createdDate: t.date,
          publishedDate: t.date,
          url: '',
          tags: [],
          reflection: '',
          maturity: '', // stays empty until you edit the record
          project: '',
          migrated: true,
          testMode: Boolean(t.testMode),
        });
        converted.artifact++;
      }
    } else if (doc.interactions.some((i) => i.id === t.id)) {
      converted.alreadyConverted++;
    } else {
      doc.interactions.push({
        id: t.id,
        createdAt: t.createdAt ?? nowIso,
        updatedAt: nowIso,
        personId: ensurePerson().id,
        date: t.date,
        type: t.kind, // 'conversation' or 'referral'
        outcome: String(t.note ?? '').trim(),
        followUpDue: null,
        followUpDoneAt: null,
        migrated: true,
        testMode: Boolean(t.testMode),
      });
      converted[t.kind]++;
    }
  }
  doc.tallies = keep;
  // Schema 5: every Evidence entry gets a category. Existing entries become 'uncategorised'.
  let categorised = 0;
  for (const a of doc.artifacts) {
    if (!(a.category in ARTIFACT_CATEGORIES) && a.category !== UNCATEGORISED) {
      a.category = UNCATEGORISED;
      categorised++;
    }
  }
  doc.schemaVersion = SCHEMA_VERSION;

  // The check: every scorecard number must be exactly what it was.
  const diffs = compareCounts(countsBefore, countsFromDoc(doc));
  // Entries that existed before must be unchanged apart from the new category (nothing lost or edited).
  const strip = (list) => JSON.stringify(list.map((a) => { const { category, ...rest } = a; return rest; }));
  const before = JSON.parse(artifactsBefore);
  if (strip(before) !== strip(doc.artifacts.filter((a) => before.some((b) => b.id === a.id)))) {
    diffs.push('an existing Evidence entry would have changed.');
  }
  const rowsAfter = rowsFor(doc, dates);
  rowsAfter.forEach((row, i) => {
    if (row !== rowsBefore[i]) diffs.push(`scorecard for ${dates[i]} changed.`);
  });
  if (diffs.length) {
    return {
      ok: false,
      problems: [
        'The migration check failed: the scorecard would show different numbers after converting your entries.',
        ...diffs,
        'Nothing was saved or changed.',
      ],
    };
  }

  const total = converted.artifact + converted.conversation + converted.referral;
  converted.categorised = categorised;
  const parts = [];
  if (converted.artifact) parts.push(`${converted.artifact} artifact${converted.artifact === 1 ? '' : 's'} → Evidence log (published)`);
  const talks = converted.conversation + converted.referral;
  if (talks) {
    parts.push(`${converted.conversation} conversation${converted.conversation === 1 ? '' : 's'} and ${converted.referral} referral ask${converted.referral === 1 ? '' : 's'} → People log, under "${UNASSIGNED_NAME}"`);
  }
  const notice = total
    ? `Your quick scorecard entries were converted into full records: ${parts.join('; ')}. Applications stay as quick entries. The scorecard shows the same numbers as before, and a backup of your old data is kept in Settings.`
    : categorised
      ? `Evidence entries now have a category. Your ${categorised} existing ${categorised === 1 ? 'entry is' : 'entries are'} set to Uncategorised; nothing else changed. A backup of your old data is kept in Settings.`
      : null;
  if (notice) doc.settings = { ...(doc.settings ?? {}), migrationNotice: notice };

  return { ok: true, doc, changed: true, converted: { ...converted, total }, notice, fromVersion };
}
