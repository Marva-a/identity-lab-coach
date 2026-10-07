// Importing resources from a JSON file you provide, in the schema
// "identity-lab-coach.resources.v1". Pure functions only (no page or storage
// code). The app ships with no resources and never invents titles or links.
//
// All-or-nothing: if any entry is wrong, nothing is imported and every wrong
// entry is listed by its id. Entries are matched by id, so importing a file
// twice adds nothing the second time, and an entry already in the library is
// never changed by a re-import (your edits, statuses and notes stay as they are).
import { validateResource, RESOURCE_ID_RE, normalizeUrl, findSameLink } from './records.js';

export const RESOURCE_SCHEMA = 'identity-lab-coach.resources.v1';
export const MAX_ROWS = 300;
const FIELDS = ['id', 'title', 'source', 'type', 'estimatedMinutes', 'url', 'planDays', 'why', 'optional', 'urlStatus', 'verifiedNote'];
const REQUIRED = ['id', 'title', 'source', 'type', 'estimatedMinutes', 'url', 'planDays'];
const TEXT_FIELDS = ['id', 'title', 'source', 'type', 'why', 'urlStatus', 'verifiedNote'];

/**
 * Checks a resource file against what is already in the library.
 * Returns {
 *   ok,            true when there are no problems
 *   fileProblems,  problems with the file as a whole
 *   rowProblems,   [{ entry, id, messages[] }] for each wrong entry (entry 1 = first in the file)
 *   rows,          clean resources ready to add (ids already in the library left out)
 *   skipped,       [{ entry, id, title }] entries whose id is already in the library
 *   needLink,      how many of the rows to add have no link yet
 *   warnings,      [{ entry, id, message }] things worth a look that do NOT block the import,
 *                  such as two entries sharing one link (a missing link is never a duplicate)
 * }
 */
export function parseResourceImport(text, existing = []) {
  const result = {
    ok: false, fileProblems: [], rowProblems: [], rows: [], skipped: [], needLink: 0, warnings: [],
  };
  let raw;
  try {
    raw = JSON.parse(text);
  } catch {
    result.fileProblems.push('This file is not valid JSON. Check for a missing comma, quote or bracket.');
    return result;
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    result.fileProblems.push(`The file should be an object with "schema": "${RESOURCE_SCHEMA}" and a "resources" list.`);
    return result;
  }
  if (raw.schema !== RESOURCE_SCHEMA) {
    result.fileProblems.push(raw.schema === undefined
      ? `The file has no "schema". It should say "schema": "${RESOURCE_SCHEMA}".`
      : `This file's schema is "${String(raw.schema).slice(0, 60)}", but this app reads "${RESOURCE_SCHEMA}".`);
    return result;
  }
  const list = raw.resources;
  if (!Array.isArray(list)) {
    result.fileProblems.push('The file should have a "resources" list.');
    return result;
  }
  if (!list.length) result.fileProblems.push('The file has no resources in it.');
  if (list.length > MAX_ROWS) result.fileProblems.push(`The file has ${list.length} resources; the most per file is ${MAX_ROWS}.`);
  if (result.fileProblems.length) return result;

  const inLibrary = new Map(existing.map((r) => [r.id, r.title]));
  const firstSeen = new Map(); // id → entry number
  const linkSeen = new Map(); // normalized link → { id, entry } of the first entry using it

  list.forEach((item, index) => {
    const entry = index + 1;
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      result.rowProblems.push({ entry, id: null, messages: ['This entry should be an object with the resource fields.'] });
      return;
    }
    const id = typeof item.id === 'string' && item.id ? item.id : null;
    const messages = [];

    for (const key of Object.keys(item)) {
      if (!FIELDS.includes(key)) messages.push(`Unknown field "${key}". The fields are: ${FIELDS.join(', ')}.`);
    }
    for (const key of REQUIRED) {
      if (!(key in item)) {
        messages.push(key === 'url'
          ? 'Missing "url": use null when there is no link yet.'
          : `Missing "${key}".`);
      }
    }
    for (const key of TEXT_FIELDS) {
      if (item[key] !== undefined && typeof item[key] !== 'string') messages.push(`"${key}" should be text.`);
    }
    if (item.url !== undefined && item.url !== null && typeof item.url !== 'string') messages.push('"url" should be text, or null when there is no link yet.');
    if (item.estimatedMinutes !== undefined && typeof item.estimatedMinutes !== 'number') messages.push('"estimatedMinutes" should be a number, not text.');
    if (item.planDays !== undefined && (!Array.isArray(item.planDays) || item.planDays.some((d) => typeof d !== 'number'))) {
      messages.push('"planDays" should be a list of day numbers, like [8, 9].');
    }
    if (item.optional !== undefined && typeof item.optional !== 'boolean') messages.push('"optional" should be true or false.');

    if (id && !RESOURCE_ID_RE.test(id)) messages.push('The id may only use letters, numbers, hyphens and underscores (up to 80 characters).');
    if (id) {
      if (firstSeen.has(id)) messages.push(`Duplicate id: the same id is used in entry ${firstSeen.get(id)}.`);
      else firstSeen.set(id, entry);
    }

    const url = typeof item.url === 'string' ? item.url.trim() : '';
    const clean = {
      id: id ?? '',
      title: typeof item.title === 'string' ? item.title.trim() : '',
      source: typeof item.source === 'string' ? item.source.trim() : '',
      type: item.type,
      minutes: item.estimatedMinutes,
      url,
      why: typeof item.why === 'string' ? item.why.trim() : '',
      days: Array.isArray(item.planDays) ? [...new Set(item.planDays)].sort((a, b) => a - b) : [],
      optional: item.optional === true,
      urlStatus: typeof item.urlStatus === 'string' ? item.urlStatus : (url ? 'unchecked' : 'needs-your-search'),
      verifiedNote: typeof item.verifiedNote === 'string' ? item.verifiedNote.trim() : '',
    };
    // Shape problems are already listed above; check the values of what is usable.
    const usable = { ...clean, minutes: typeof clean.minutes === 'number' ? clean.minutes : NaN };
    for (const m of validateResource(usable)) {
      const covered = (m.startsWith('Estimated minutes') && typeof item.estimatedMinutes !== 'number')
        || (m === 'Add at least one plan day (1–60).' && item.planDays !== undefined && !Array.isArray(item.planDays))
        || m.startsWith('The id may only') || (m === 'Add a title.' && !('title' in item))
        || (m === 'Add the source or author.' && !('source' in item))
        || (m.startsWith('urlStatus is "verified"') && !('url' in item));
      if (!covered && !messages.includes(m)) messages.push(m);
    }

    if (!messages.length && url) {
      // Same link as another entry or as a resource already in the library: allowed, but flagged.
      const key = normalizeUrl(url);
      const earlier = linkSeen.get(key);
      if (earlier && !inLibrary.has(earlier.id)) {
        result.warnings.push({ entry, id, message: `Uses the same link as ${earlier.id} (entry ${earlier.entry}). Fine if one page serves both; check it is intended.` });
      } else if (!earlier) {
        linkSeen.set(key, { id, entry });
      }
      if (!inLibrary.has(id)) {
        for (const other of findSameLink(existing, url, id)) {
          result.warnings.push({ entry, id, message: `Uses the same link as "${other.title}", which is already in the library.` });
        }
      }
    }

    if (messages.length) {
      result.rowProblems.push({ entry, id, messages });
    } else if (inLibrary.has(id)) {
      result.skipped.push({ entry, id, title: inLibrary.get(id) });
    } else {
      result.rows.push(clean);
      if (!url) result.needLink++;
    }
  });

  result.ok = result.rowProblems.length === 0;
  return result;
}
