// Importing resources from a JSON file you provide.
// Pure functions only (no page or storage code). The app ships with no
// resources; it never invents titles or links. All-or-nothing: if any row is
// wrong, nothing is imported and every wrong row is listed.
import { validateResource, normalizeUrl, isHttpUrl } from './records.js';

export const MAX_ROWS = 300;
const FIELDS = ['title', 'source', 'type', 'minutes', 'url', 'why', 'days'];
const TEXT_FIELDS = ['title', 'source', 'type', 'url', 'why'];

/**
 * Checks a resource file against what is already in the library.
 * Returns {
 *   ok,            true when there are no problems
 *   fileProblems,  problems with the file as a whole
 *   rowProblems,   [{ row, label, messages[] }] for each wrong row (row 1 = first resource)
 *   rows,          clean resources ready to add (duplicates of the library left out)
 *   skipped,       [{ row, title }] rows whose link is already in the library
 * }
 */
export function parseResourceImport(text, existing = []) {
  const result = { ok: false, fileProblems: [], rowProblems: [], rows: [], skipped: [] };
  let raw;
  try {
    raw = JSON.parse(text);
  } catch {
    result.fileProblems.push('This file is not valid JSON. Check for a missing comma, quote or bracket.');
    return result;
  }
  const list = Array.isArray(raw) ? raw : (raw && typeof raw === 'object' && Array.isArray(raw.resources) ? raw.resources : null);
  if (!list) {
    result.fileProblems.push('The file should be a list of resources, or an object with a "resources" list.');
    return result;
  }
  if (!list.length) result.fileProblems.push('The file has no resources in it.');
  if (list.length > MAX_ROWS) result.fileProblems.push(`The file has ${list.length} resources; the most per file is ${MAX_ROWS}.`);
  if (result.fileProblems.length) return result;

  const inLibrary = new Set(existing.map((r) => normalizeUrl(r.url)));
  const seenInFile = new Map();

  list.forEach((item, index) => {
    const row = index + 1;
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      result.rowProblems.push({ row, label: '', messages: ['This row should be an object with the resource fields.'] });
      return;
    }
    const title = typeof item.title === 'string' ? item.title.trim() : '';
    const label = title ? ` (${title.length > 40 ? `${title.slice(0, 37)}…` : title})` : '';
    const messages = [];

    for (const key of Object.keys(item)) {
      if (!FIELDS.includes(key)) messages.push(`Unknown field "${key}". The fields are: ${FIELDS.join(', ')}.`);
    }
    for (const key of TEXT_FIELDS) {
      if (item[key] !== undefined && typeof item[key] !== 'string') messages.push(`"${key}" should be text.`);
    }
    if (item.minutes !== undefined && typeof item.minutes !== 'number') messages.push('"minutes" should be a number, not text.');
    if (item.days !== undefined && (!Array.isArray(item.days) || item.days.some((d) => typeof d !== 'number'))) {
      messages.push('"days" should be a list of day numbers, like [8, 9].');
    }

    const clean = {
      title,
      source: typeof item.source === 'string' ? item.source.trim() : '',
      type: item.type,
      minutes: item.minutes,
      url: typeof item.url === 'string' ? item.url.trim() : '',
      why: typeof item.why === 'string' ? item.why.trim() : '',
      days: Array.isArray(item.days) ? [...new Set(item.days)].sort((a, b) => a - b) : item.days,
    };
    // Type problems above already explain a wrong shape; validate the rest on what is usable.
    const usable = {
      ...clean,
      minutes: typeof clean.minutes === 'number' ? clean.minutes : NaN,
      days: Array.isArray(clean.days) && clean.days.every((d) => typeof d === 'number') ? clean.days : [],
    };
    for (const m of validateResource(usable)) {
      const duplicate = (m === 'Add at least one plan day (1–60).' && item.days !== undefined)
        || (m.startsWith('Estimated minutes') && item.minutes !== undefined && typeof item.minutes !== 'number');
      if (!duplicate && !messages.includes(m)) messages.push(m);
    }

    let key = null;
    if (clean.url && isHttpUrl(clean.url)) {
      key = normalizeUrl(clean.url);
      if (seenInFile.has(key)) messages.push(`Same link as row ${seenInFile.get(key)}. List a resource once and put all its days in "days".`);
      else seenInFile.set(key, row);
    }

    if (messages.length) result.rowProblems.push({ row, label, messages });
    else if (key && inLibrary.has(key)) result.skipped.push({ row, title });
    else result.rows.push(clean);
  });

  result.ok = result.rowProblems.length === 0;
  return result;
}
