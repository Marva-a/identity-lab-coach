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
/** How real the work is. Empty until you choose; required before an artifact is published. */
export const MATURITIES = {
  implemented: 'Implemented',
  simulated: 'Simulated',
  conceptual: 'Conceptual',
  future: 'Future phase',
};
export const PROJECTS = {
  'project-1': 'Project 1',
  'project-2': 'Project 2',
  'project-3': 'Project 3',
  other: 'Other',
};
export const TAGS_MAX = 3;
/** Skill tags offered as suggestions in the Evidence form (you can still type any tag). */
export const SUGGESTED_SKILL_TAGS = ['network-security', 'cloud-security', 'zero-trust', 'segmentation', 'workload-identity'];
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

/**
 * Returns a list of problems; empty when the artifact is valid.
 * With `requireMaturity`, a published artifact must have a maturity. Saving
 * in the app asks for it; importing does not, so older files and converted
 * quick entries (which have none) still load.
 */
export function validateArtifact(a, { requireMaturity = false } = {}) {
  const problems = [];
  if (!String(a.title ?? '').trim()) problems.push('Add a title.');
  if (String(a.title ?? '').length > LIMITS.title) problems.push(`Keep the title under ${LIMITS.title} characters.`);
  if (!(a.type in ARTIFACT_TYPES)) problems.push('Choose a type.');
  if (!(a.status in ARTIFACT_STATUSES)) problems.push('Choose draft or published.');
  if ((a.maturity ?? '') !== '' && !(a.maturity in MATURITIES)) problems.push('Choose a valid maturity.');
  if (requireMaturity && a.status === 'published' && !a.maturity) {
    problems.push('Pick a maturity (Implemented, Simulated, Conceptual or Future phase). It is required for published evidence.');
  }
  if ((a.project ?? '') !== '' && !(a.project in PROJECTS)) problems.push('Choose a valid project.');
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

// ─── Resources (Stage 4b: Content library) ───────────────────────────────────
export const RESOURCE_TYPES = {
  video: 'Video', article: 'Article', spec: 'Spec', lab: 'Lab', exercise: 'Exercise',
};
export const RESOURCE_STATUSES = { 'not-started': 'Not started', 'in-progress': 'In progress', done: 'Done' };
/**
 * Where a resource's link stands. 'verified' and 'needs-your-search' come from
 * the file you import; 'added-by-you' is set when you type a link in the app;
 * 'unchecked' is a link from a file that did not say.
 */
export const RESOURCE_URL_STATUSES = ['verified', 'needs-your-search', 'unchecked', 'added-by-you'];
export const RESOURCE_LIMITS = {
  title: 150, source: 100, why: 600, notes: 4000, minutes: 600, days: 10, url: 500, note: 500,
};
export const RESOURCE_ID_RE = /^[A-Za-z0-9_-]{1,80}$/;
const PLACEHOLDER_HOSTS = ['example.com', 'example.org', 'example.net'];

/** Plan days are 1–60; Sundays (7, 14 … 56) are rest days, so nothing is scheduled on them. */
export function isPlanStudyDay(n) {
  return Number.isInteger(n) && n >= 1 && n <= 60 && n % 7 !== 0;
}

/** The made-up addresses used in examples (example.com and friends) are never real resources. */
export function isPlaceholderUrl(value) {
  try {
    const host = new URL(String(value).trim()).hostname.toLowerCase();
    return PLACEHOLDER_HOSTS.some((p) => host === p || host.endsWith(`.${p}`));
  } catch {
    return false;
  }
}

/** A link in a form that can be compared: no #fragment, no trailing slash. */
export function normalizeUrl(value) {
  try {
    const u = new URL(String(value).trim());
    u.hash = '';
    return u.href.replace(/\/$/, '');
  } catch {
    return String(value ?? '').trim();
  }
}

/**
 * Other resources that already use the same link. A resource with no link is never
 * the same as another with no link. Sharing a link is allowed (one guide can serve
 * two plan days), so this is a warning to look at, not an error.
 */
export function findSameLink(resources, url, exceptId) {
  const clean = typeof url === 'string' ? url.trim() : '';
  if (!clean) return [];
  const key = normalizeUrl(clean);
  return resources.filter((r) => r.id !== exceptId && r.url && normalizeUrl(r.url) === key);
}

/** Problems with a link (empty = fine). An empty link is allowed: the resource then shows "Link needed". */
export function validateResourceUrl(value) {
  const url = typeof value === 'string' ? value.trim() : '';
  if (!url) return [];
  if (!isHttpUrl(url)) return ['The link must start with http:// or https://.'];
  if (url.length > RESOURCE_LIMITS.url) return [`Keep the link under ${RESOURCE_LIMITS.url} characters.`];
  if (isPlaceholderUrl(url)) return ['This is a placeholder address (example.com, .org or .net). Use the real link.'];
  return [];
}

/** Reads "8, 9 10" into day numbers. Returns the numbers and anything that is not a number. */
export function parseDays(text) {
  const tokens = String(text ?? '').split(/[\s,;]+/).filter(Boolean);
  const days = [];
  const problems = [];
  for (const t of tokens) {
    if (/^\d+$/.test(t)) days.push(Number(t));
    else problems.push(`"${t}" is not a day number.`);
  }
  return { days: [...new Set(days)].sort((a, b) => a - b), problems };
}

/** Returns a list of problems; empty when the resource is valid. */
export function validateResource(r) {
  const problems = [];
  const text = (v) => (typeof v === 'string' ? v : '');
  if (r.id !== undefined && !RESOURCE_ID_RE.test(String(r.id))) {
    problems.push('The id may only use letters, numbers, hyphens and underscores (up to 80 characters).');
  }
  const title = text(r.title).trim();
  if (!title) problems.push('Add a title.');
  else if (title.length > RESOURCE_LIMITS.title) problems.push(`Keep the title under ${RESOURCE_LIMITS.title} characters.`);
  const source = text(r.source).trim();
  if (!source) problems.push('Add the source or author.');
  else if (source.length > RESOURCE_LIMITS.source) problems.push(`Keep the source under ${RESOURCE_LIMITS.source} characters.`);
  if (!(r.type in RESOURCE_TYPES)) problems.push(`Type must be one of: ${Object.keys(RESOURCE_TYPES).join(', ')}.`);
  if (!Number.isInteger(r.minutes) || r.minutes < 1 || r.minutes > RESOURCE_LIMITS.minutes) {
    problems.push(`Estimated minutes must be a whole number from 1 to ${RESOURCE_LIMITS.minutes}.`);
  }
  problems.push(...validateResourceUrl(r.url));
  if (text(r.why).length > RESOURCE_LIMITS.why) problems.push(`Keep the reason under ${RESOURCE_LIMITS.why} characters.`);
  if (!Array.isArray(r.days) || !r.days.length) {
    problems.push('Add at least one plan day (1–60).');
  } else {
    if (r.days.length > RESOURCE_LIMITS.days) problems.push(`Use at most ${RESOURCE_LIMITS.days} plan days.`);
    for (const d of r.days) {
      if (!isPlanStudyDay(d)) problems.push(`Day ${d} is not a study day: use 1–60, and Sundays (7, 14, 21 … 56) are rest days.`);
    }
  }
  if (r.optional !== undefined && typeof r.optional !== 'boolean') problems.push('"optional" must be true or false.');
  if (r.urlStatus !== undefined && !RESOURCE_URL_STATUSES.includes(r.urlStatus)) {
    problems.push(`urlStatus must be one of: ${RESOURCE_URL_STATUSES.join(', ')}.`);
  }
  if (r.verifiedNote !== undefined && text(r.verifiedNote).length > RESOURCE_LIMITS.note) {
    problems.push(`Keep the link note under ${RESOURCE_LIMITS.note} characters.`);
  }
  if (r.urlStatus === 'verified' && !text(r.url).trim()) problems.push('urlStatus is "verified" but there is no link.');
  if (r.status !== undefined && !(r.status in RESOURCE_STATUSES)) problems.push('The status is not valid.');
  if (r.notes !== undefined && text(r.notes).length > RESOURCE_LIMITS.notes) problems.push(`Keep notes under ${RESOURCE_LIMITS.notes} characters.`);
  return problems;
}

/**
 * "Do this next" order: in progress first, then not started (required before
 * optional), then done; plan order within each.
 */
export function orderResources(list) {
  const rank = (r) => (r.status === 'done' ? 3 : r.status === 'in-progress' ? 0 : r.optional ? 2 : 1);
  return [...list].sort((a, b) => rank(a) - rank(b) || (a.position ?? 0) - (b.position ?? 0));
}

export const totalMinutes = (list) => list.reduce((sum, r) => sum + r.minutes, 0);
/** Minutes still to do, leaving out done and optional resources. */
export const remainingMinutes = (list) => totalMinutes(list.filter((r) => r.status !== 'done' && !r.optional));
export const optionalMinutes = (list) => totalMinutes(list.filter((r) => r.optional));
