// Record types, validation and counting for Stage 4 (Evidence log and People log).
// Pure functions only (no page or storage code) so the migration and the date
// checks can run in Node.

export const SCHEMA_VERSION = 4;

// ─── Evidence (artifacts) ────────────────────────────────────────────────────
export const ARTIFACT_TYPES = {
  'project-slice': 'Project slice',
  'write-up': 'Write-up',
  'threat-model': 'Threat model',
  diagram: 'Diagram',
  repo: 'Repo',
  post: 'Post',
  other: 'Other',
};
export const ARTIFACT_STATUSES = { draft: 'Draft', published: 'Published' };
export const TAGS_MAX = 3;
export const TAG_MAX_LENGTH = 40;

// ─── People ──────────────────────────────────────────────────────────────────
export const CONNECTIONS = {
  'warm-intro': 'Warm intro',
  'cold-message': 'Cold message',
  event: 'Event',
  community: 'Community',
  other: 'Other',
};
export const INTERACTION_TYPES = { conversation: 'Conversation', referral: 'Referral ask' };

export const LIMITS = {
  title: 120, reflection: 500, url: 500, name: 100, short: 100, notes: 1000, outcome: 1000,
};

/** The placeholder person that holds interactions converted from Stage 3 "+1" entries. */
export const UNASSIGNED_ID = 'migrated-unassigned';
export const UNASSIGNED_NAME = 'Unassigned (migrated)';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isDate(s) {
  if (typeof s !== 'string' || !DATE_RE.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}

/** Only http and https links are ever stored or shown as links (never javascript: and so on). */
export function isHttpUrl(value) {
  try {
    const u = new URL(String(value).trim());
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

/** Trims tags, drops empty ones and removes duplicates, ignoring capitals. */
export function normalizeTags(list) {
  const seen = new Set();
  const out = [];
  for (const raw of list ?? []) {
    const tag = String(raw ?? '').trim().replace(/\s+/g, ' ');
    if (!tag || seen.has(tag.toLowerCase())) continue;
    seen.add(tag.toLowerCase());
    out.push(tag);
  }
  return out;
}

/** Returns a list of problems; empty when the artifact is valid. */
export function validateArtifact(a) {
  const problems = [];
  if (!String(a.title ?? '').trim()) problems.push('Add a title.');
  if (String(a.title ?? '').length > LIMITS.title) problems.push(`Keep the title under ${LIMITS.title} characters.`);
  if (!(a.type in ARTIFACT_TYPES)) problems.push('Choose a type.');
  if (!(a.status in ARTIFACT_STATUSES)) problems.push('Choose draft or published.');
  if (!isDate(a.createdDate)) problems.push('Choose a valid created date.');
  if (a.status === 'published') {
    if (!isDate(a.publishedDate)) problems.push('Choose a valid published date.');
    else if (isDate(a.createdDate) && a.publishedDate < a.createdDate) {
      problems.push('The published date cannot be before the created date.');
    }
  } else if (a.publishedDate) {
    problems.push('Only published evidence has a published date.');
  }
  if (String(a.url ?? '').trim()) {
    if (!isHttpUrl(a.url)) problems.push('The link must start with http:// or https://.');
    else if (String(a.url).length > LIMITS.url) problems.push(`Keep the link under ${LIMITS.url} characters.`);
  }
  const tags = a.tags ?? [];
  if (!Array.isArray(tags) || tags.length > TAGS_MAX) problems.push(`Use at most ${TAGS_MAX} skill tags.`);
  else if (tags.some((t) => !String(t).trim() || String(t).length > TAG_MAX_LENGTH)) {
    problems.push(`Each skill tag must be 1–${TAG_MAX_LENGTH} characters.`);
  }
  if (String(a.reflection ?? '').length > LIMITS.reflection) problems.push(`Keep the reflection under ${LIMITS.reflection} characters.`);
  return problems;
}

export function validatePerson(p) {
  const problems = [];
  if (!String(p.name ?? '').trim()) problems.push('Add a name.');
  for (const [field, label] of [['name', 'name'], ['organization', 'organization'], ['role', 'role']]) {
    if (String(p[field] ?? '').length > LIMITS.name) problems.push(`Keep the ${label} under ${LIMITS.name} characters.`);
  }
  if (!(p.connection in CONNECTIONS)) problems.push('Choose how you connected.');
  if (String(p.notes ?? '').length > LIMITS.notes) problems.push(`Keep the notes under ${LIMITS.notes} characters.`);
  if (String(p.link ?? '').trim()) {
    if (!isHttpUrl(p.link)) problems.push('The link must start with http:// or https://.');
    else if (String(p.link).length > LIMITS.url) problems.push(`Keep the link under ${LIMITS.url} characters.`);
  }
  return problems;
}

export function validateInteraction(i) {
  const problems = [];
  if (!i.personId) problems.push('Choose a person.');
  if (!isDate(i.date)) problems.push('Choose a valid date.');
  if (!(i.type in INTERACTION_TYPES)) problems.push('Choose conversation or referral ask.');
  if (String(i.outcome ?? '').length > LIMITS.outcome) problems.push(`Keep the outcome note under ${LIMITS.outcome} characters.`);
  if (i.followUpDue) {
    if (!isDate(i.followUpDue)) problems.push('Choose a valid follow-up date.');
    else if (isDate(i.date) && i.followUpDue < i.date) problems.push('The follow-up cannot be before the interaction date.');
  }
  return problems;
}

/**
 * The dates of everything that counts toward each scorecard measure:
 * - artifacts: published evidence, by PUBLISHED date (drafts never count)
 * - conversations and referral asks: interactions, by their date
 * - applications: the "+1" entries (still tallies)
 * Any leftover Stage 3 tally of another kind is counted too, unless a full
 * record with the same id already exists, so a half-finished migration can
 * neither lose nor double count an entry.
 */
export function countsFromDoc(doc) {
  const counts = { artifact: [], conversation: [], application: [], referral: [] };
  const artifactIds = new Set();
  const interactionIds = new Set();
  for (const a of doc.artifacts ?? []) {
    artifactIds.add(a.id);
    if (a.status === 'published' && a.publishedDate) counts.artifact.push(a.publishedDate);
  }
  for (const i of doc.interactions ?? []) {
    interactionIds.add(i.id);
    if (i.type in counts) counts[i.type].push(i.date);
  }
  for (const t of doc.tallies ?? []) {
    if (!(t.kind in counts)) continue;
    if (t.kind === 'artifact' && artifactIds.has(t.id)) continue;
    if ((t.kind === 'conversation' || t.kind === 'referral') && interactionIds.has(t.id)) continue;
    counts[t.kind].push(t.date);
  }
  return counts;
}
