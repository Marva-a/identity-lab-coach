// Content library: resources you provide, shown by plan day.
// The app ships with none and never invents titles or links. Links open in a
// new tab and are never embedded; only your own notes are stored, not other
// people's content. Resource minutes are estimates, never logged hours.
import * as store from './store.js';
import {
  esc, announce, today, testMode, plural, errorSummaryHtml, linkHtml, nav,
} from './ui.js';
import { formatShort } from './dates.js';
import { planDayFor } from './plan.js';
import { WEEKS } from './plan-data.js';
import {
  RESOURCE_TYPES, RESOURCE_STATUSES, RESOURCE_LIMITS, orderResources, totalMinutes, remainingMinutes,
  optionalMinutes, parseDays, validateResource, findSameLink, RESOURCE_LEVELS, splitDeep, levelRank,
} from './records.js';
import { parseResourceImport, MAX_ROWS, RESOURCE_SCHEMA } from './resource-import.js';
import { startCardFromResource } from './flashcards.js';
import { checkForContent, planContent, summarizePlan, planSize } from './content.js';

// Transient UI state (not saved).
const ui = {
  editing: null, // 'new' or a resource id
  form: null,
  errors: [],
  doneFor: null, // resource id waiting for the "also log a session?" choice
  openNotes: new Set(), // resources whose notes are open
  openDeep: new Set(), // "Reference" groups that are open
  highlight: null, // a resource a lesson step pointed at
  linkDrafts: {}, // id → link typed but not saved yet
  linkErrors: {}, // id → problem with the link just typed
  filter: { status: 'all', type: 'all', week: 'this', retired: false, link: 'all' },
  report: null, // result of checking an import file
  reportFile: '',
  message: null,
  content: blankContent(), // the "Check for new content" state
};

function blankContent() {
  return { busy: false, content: null, source: null, failure: null, plan: null, message: null };
}

// Checking for content finishes later, so the screen is asked to redraw when it does.
let refreshScreen = () => {};
export function setContentRefresh(fn) {
  refreshScreen = fn;
}

/** Text marking a resource with no link; "needs your search" is spelled out in words, not just colour. */
const linkNeededLabel = (r) => (r.urlStatus === 'needs-your-search' ? 'Link needed: needs your search' : 'Link needed');

const DAY_INFO = new Map(WEEKS.flatMap((w) => w.days.map((d) => [d.day, d])));
const dayLabel = (n) => (DAY_INFO.get(n) ? `Day ${n} (${formatShort(DAY_INFO.get(n).date)})` : `Day ${n}`);

// ─── Notes: saved as you type ────────────────────────────────────────────────

const pending = new Map(); // resource id → text not yet saved
const timers = new Map();

function setNoteStatus(id, text) {
  const el = document.getElementById(`rns-${id}`);
  if (el) el.textContent = text;
}

function saveNotes(id) {
  if (!pending.has(id)) return;
  clearTimeout(timers.get(id));
  timers.delete(id);
  const text = pending.get(id);
  pending.delete(id);
  const result = store.setResourceNotes(id, text, testMode());
  setNoteStatus(id, result.saved === false ? 'Could not save: this browser blocked storage.' : 'Saved');
}

/** Saves any notes still waiting (called before the page redraws, on blur and on leaving). */
export function flushResourceNotes() {
  for (const id of [...pending.keys()]) saveNotes(id);
}

function queueNotes(id, text) {
  pending.set(id, text);
  setNoteStatus(id, 'Saving…');
  clearTimeout(timers.get(id));
  timers.set(id, setTimeout(() => saveNotes(id), 600));
}

// ─── One resource ────────────────────────────────────────────────────────────

function donePromptHtml(r) {
  const date = today();
  return `
    <div class="note note--gate" role="group" aria-labelledby="done-q-${esc(r.id)}">
      <p id="done-q-${esc(r.id)}" tabindex="-1"><strong>Mark "${esc(r.title)}" done.</strong> Also log a study session of ${r.minutes} minutes for ${esc(formatShort(date))}?
        The ${r.minutes} minutes is an estimate. If you also log this time with the timer, it will count twice.</p>
      <div class="button-row">
        <button type="button" class="button--primary" data-action="resource-done-log" data-id="${esc(r.id)}">Mark done and log ${r.minutes} min</button>
        <button type="button" data-action="resource-done-only" data-id="${esc(r.id)}">Mark done only</button>
        <button type="button" data-action="resource-done-cancel" data-id="${esc(r.id)}">Cancel</button>
      </div>
    </div>`;
}

/** The small text about a resource's link, and the field to add one when it is missing. */
function linkStateHtml(r) {
  if (!r.url) {
    const draft = ui.linkDrafts[r.id] ?? '';
    const error = ui.linkErrors[r.id];
    return `
      ${r.verifiedNote ? `<p class="small">${esc(r.verifiedNote)}</p>` : ''}
      <form class="link-form" data-link-form="${esc(r.id)}" novalidate>
        <label for="lk-${esc(r.id)}">Add the link</label>
        <div class="link-form__row">
          <input type="url" id="lk-${esc(r.id)}" name="url" inputmode="url" maxlength="${RESOURCE_LIMITS.url}" value="${esc(draft)}"
            autocomplete="off" placeholder="https://" aria-describedby="lke-${esc(r.id)}" ${error ? 'aria-invalid="true"' : ''}>
          <button type="submit" class="button--small">Save link</button>
        </div>
        <span class="field-error" id="lke-${esc(r.id)}" role="alert">${error ? esc(error) : ''}</span>
      </form>`;
  }
  if (r.verifiedNote) return `<p class="small">Link note: ${esc(r.verifiedNote)}</p>`;
  if (r.urlStatus === 'added-by-you') return '<p class="small">Link added by you.</p>';
  return '';
}

/** A small label saying how much background a resource assumes. */
function levelFlagHtml(r) {
  return r.level in RESOURCE_LEVELS ? `<span class="flag flag--level">${esc(RESOURCE_LEVELS[r.level])}</span>` : '';
}

/** Shown when a pack has a newer level, how-to-use line or day for a resource you changed yourself. */
function newerVersionHtml(r) {
  const n = r.newerVersion;
  if (!n) return '';
  const days = JSON.stringify(n.days) !== JSON.stringify(r.days);
  return `
    <div class="note" role="group" aria-label="Newer version available">
      <p><strong>Newer version available.</strong> You changed this resource, so your version is kept.
        The update suggests ${n.level in RESOURCE_LEVELS ? `level ${esc(RESOURCE_LEVELS[n.level])}` : 'no level'}${days ? `, plan ${n.days.length === 1 ? 'day' : 'days'} ${esc(n.days.join(', '))}` : ''}${n.reason ? ` (${esc(n.reason)})` : ''}.</p>
      <div class="button-row">
        <button type="button" class="button--small" data-action="resource-newer-use" data-id="${esc(r.id)}">Use the newer version</button>
        <button type="button" class="button--small" data-action="resource-newer-keep" data-id="${esc(r.id)}">Keep mine</button>
      </div>
    </div>`;
}

/** The deep resources of a list, tucked under one closed heading. `key` remembers whether you opened it. */
function deepGroupHtml(deep, key, itemHtml) {
  if (!deep.length) return '';
  return `
    <details class="deep-group" data-deep-group="${esc(key)}" ${ui.openDeep.has(key) ? 'open' : ''}>
      <summary>Reference: skim, look things up, come back later (${deep.length})</summary>
      ${itemHtml(deep)}
    </details>`;
}

function resourceItemHtml(r, { library = false } = {}) {
  if (library && ui.editing === r.id) return `<li class="resource">${resourceFormHtml(r)}</li>`;
  const done = r.status === 'done';
  const hasNotes = Boolean((r.notes ?? '').trim());
  const title = r.url ? linkHtml(r.url, r.title) : esc(r.title);
  const dayText = library ? ` · ${r.days.length === 1 ? 'Day' : 'Days'} ${esc(r.days.join(', '))}` : '';
  return `
    <li id="res-${esc(r.id)}" tabindex="-1" class="resource ${ui.highlight === r.id ? 'resource--highlight' : ''} ${done ? 'resource--done' : ''} ${r.optional ? 'resource--optional' : ''} ${r.retired ? 'resource--retired' : ''}">
      <p class="resource__title">${title}
        ${levelFlagHtml(r)}
        ${r.optional ? '<span class="flag">Optional</span>' : ''}
        ${r.changedByMe ? '<span class="flag">Changed by me</span>' : ''}
        ${r.url ? '' : `<span class="flag flag--need">${esc(linkNeededLabel(r))}</span>`}
        ${r.retired ? '<span class="flag">Retired</span>' : ''}
        ${r.testMode ? '<span class="tag tag--test">Test</span>' : ''}</p>
      <p class="meta">${esc(RESOURCE_TYPES[r.type])} · ${esc(r.source)} · about ${r.minutes} min${dayText}${done && r.doneDate ? ` · Done ${esc(formatShort(r.doneDate))}` : ''}</p>
      ${r.howToUse ? `<p class="how-to-use">${esc(r.howToUse)}</p>` : ''}
      ${newerVersionHtml(r)}
      ${r.url ? '' : linkStateHtml(r)}
      <div class="resource__status field">
        <label for="rs-${esc(r.id)}">Status</label>
        <select id="rs-${esc(r.id)}" data-res-status="${esc(r.id)}">
          ${Object.entries(RESOURCE_STATUSES).map(([v, l]) => `<option value="${v}" ${r.status === v ? 'selected' : ''}>${esc(l)}</option>`).join('')}
        </select>
      </div>
      ${ui.doneFor === r.id ? donePromptHtml(r) : ''}
      <details class="res-more" data-res-details="${esc(r.id)}" ${ui.openNotes.has(r.id) ? 'open' : ''}>
        <summary>${library ? 'Notes and details' : 'Notes'}${hasNotes ? ' (has notes)' : ''}</summary>
        ${r.why ? `<p class="meta">Why: ${esc(r.why)}</p>` : ''}
        ${library ? `<p class="meta">Plan ${r.days.length === 1 ? 'day' : 'days'}: ${esc(r.days.map(dayLabel).join(', '))}</p>` : ''}
        ${r.url ? linkStateHtml(r) : ''}
        <div class="field">
          <label for="rn-${esc(r.id)}">Your notes on "${esc(r.title)}"</label>
          <textarea id="rn-${esc(r.id)}" data-res-notes="${esc(r.id)}" rows="4" maxlength="${RESOURCE_LIMITS.notes}" aria-describedby="rns-${esc(r.id)}">${esc(r.notes ?? '')}</textarea>
          <span class="hint" id="rns-${esc(r.id)}" aria-live="polite">${hasNotes ? 'Saved' : 'Saved as you type.'}</span>
        </div>
        <div class="button-row">
          <button type="button" class="button--small" data-action="resource-make-card" data-id="${esc(r.id)}">Make a flashcard from this note</button>
          ${library ? `
            <button type="button" class="button--small" data-action="resource-edit" data-id="${esc(r.id)}" aria-label="Edit ${esc(r.title)}">Edit</button>
            <button type="button" class="button--small" data-action="resource-toggle-optional" data-id="${esc(r.id)}" aria-label="${r.optional ? 'Mark as required' : 'Mark as optional'}: ${esc(r.title)}">${r.optional ? 'Mark as required' : 'Mark as optional'}</button>
            ${r.retired
    ? `<button type="button" class="button--small" data-action="resource-restore" data-id="${esc(r.id)}" aria-label="Restore ${esc(r.title)}">Restore</button>`
    : `<button type="button" class="button--small button--danger" data-action="resource-retire" data-id="${esc(r.id)}" aria-label="Retire ${esc(r.title)}">Retire</button>`}` : ''}
        </div>
      </details>
    </li>`;
}

// ─── Today: "Do this next" ───────────────────────────────────────────────────

/** The ordered "Do this next" list for a study day. Empty string when nothing is assigned. */
export function todayResourcesHtml(ctx) {
  if (ctx.kind !== 'study') return '';
  const list = orderResources(store.resourcesForDay(ctx.contentDay));
  if (!list.length) return '';
  const optional = optionalMinutes(list);
  const { main, deep } = splitDeep(list);
  return `
    <section class="card" aria-labelledby="next-heading">
      <h2 id="next-heading" tabindex="-1">Do this next</h2>
      <p class="meta">In order: foundation first, then core. Deep reference items are tucked below. Estimated total ${totalMinutes(list)} min${optional ? ` (${optional} min of it optional)` : ''}; ${remainingMinutes(list)} min of the required part still to do, against ${ctx.hours * 60} min planned today. These are estimates: your hours only change when you log a session.</p>
      ${ui.message ? `<p class="status-ok" id="resources-message" tabindex="-1">${esc(ui.message)}</p>` : ''}
      <ol class="resources">${main.map((r) => resourceItemHtml(r)).join('')}</ol>
      ${deepGroupHtml(deep, `today-${ctx.contentDay}`, (items) => `<ol class="resources">${items.map((r) => resourceItemHtml(r)).join('')}</ol>`)}
    </section>`;
}

// ─── Week: resources under each day ──────────────────────────────────────────

/** A compact list under a day in the Week view (no controls; Today and the Library have those). */
export function weekDayResourcesHtml(contentDay) {
  const list = orderResources(store.resourcesForDay(contentDay));
  if (!list.length) return '';
  const { main, deep } = splitDeep(list);
  const rows = (items) => `<ul>${items.map((r) => `<li class="${r.optional ? 'is-optional' : ''}">${levelFlagHtml(r)} ${esc(RESOURCE_TYPES[r.type])}: ${r.url ? linkHtml(r.url, r.title) : esc(r.title)}${r.optional ? ' <span class="flag">Optional</span>' : ''}${r.url ? '' : ` <span class="flag flag--need">${esc(linkNeededLabel(r))}</span>`} · about ${r.minutes} min · <span class="res-status res-status--${r.status}">${esc(RESOURCE_STATUSES[r.status])}</span></li>`).join('')}</ul>`;
  const key = `weekres-${contentDay}`;
  return `
    <details class="day-resources" data-deep-group="${key}" ${ui.openDeep.has(key) ? 'open' : ''}>
      <summary>${plural(list.length, 'resource', 'resources')} · about ${totalMinutes(list)} min</summary>
      <p class="meta">Estimates. <a href="#learn/library">Open in the Library</a> to mark them done or take notes.</p>
      ${main.length ? rows(main) : ''}
      ${deepGroupHtml(deep, `week-${contentDay}`, rows)}
    </details>`;
}

// ─── Library ─────────────────────────────────────────────────────────────────

function resourceFormHtml(resource) {
  const isNew = !resource;
  const f = ui.form ?? (resource
    ? {
      title: resource.title, source: resource.source, type: resource.type, minutes: String(resource.minutes), url: resource.url,
      why: resource.why, days: resource.days.join(', '), optional: store.isOptionalResource(resource),
    }
    : { title: '', source: '', type: 'article', minutes: '', url: '', why: '', days: '', optional: false });
  return `
    <form id="resource-form" class="card-form" data-id="${esc(resource?.id ?? 'new')}" novalidate>
      <h3 id="resource-form-heading" tabindex="-1">${isNew ? 'Add a resource' : 'Edit resource'}</h3>
      ${errorSummaryHtml('resource-errors', ui.errors)}
      <div class="field">
        <label for="rf-title">Title</label>
        <input type="text" id="rf-title" name="title" maxlength="${RESOURCE_LIMITS.title}" value="${esc(f.title)}" autocomplete="off">
      </div>
      <div class="field">
        <label for="rf-source">Source or author</label>
        <input type="text" id="rf-source" name="source" maxlength="${RESOURCE_LIMITS.source}" value="${esc(f.source)}" autocomplete="off">
      </div>
      <div class="field">
        <label for="rf-type">Type</label>
        <select id="rf-type" name="type">
          ${Object.entries(RESOURCE_TYPES).map(([v, l]) => `<option value="${v}" ${f.type === v ? 'selected' : ''}>${esc(l)}</option>`).join('')}
        </select>
      </div>
      <div class="field">
        <label for="rf-minutes">Estimated minutes</label>
        <input type="number" id="rf-minutes" name="minutes" inputmode="numeric" min="1" max="${RESOURCE_LIMITS.minutes}" step="1" value="${esc(f.minutes)}" aria-describedby="rf-minutes-hint">
        <span class="hint" id="rf-minutes-hint">Your estimate. It is never counted as logged time.</span>
      </div>
      <div class="field">
        <label for="rf-url">Link (optional)</label>
        <input type="url" id="rf-url" name="url" inputmode="url" maxlength="${RESOURCE_LIMITS.url}" value="${esc(f.url)}" autocomplete="off" aria-describedby="rf-url-hint">
        <span class="hint" id="rf-url-hint">Starts with https://. Leave it empty and the resource shows "Link needed". It opens in a new tab; the app never embeds it.</span>
      </div>
      <div class="field">
        <label for="rf-why">Why it is included (optional)</label>
        <textarea id="rf-why" name="why" rows="2" maxlength="${RESOURCE_LIMITS.why}">${esc(f.why)}</textarea>
      </div>
      <div class="field">
        <label for="rf-days">Plan days</label>
        <input type="text" id="rf-days" name="days" inputmode="numeric" value="${esc(f.days)}" autocomplete="off" aria-describedby="rf-days-hint">
        <span class="hint" id="rf-days-hint">Day numbers from the roadmap, separated by commas, for example 8, 9. Day 1 is ${esc(formatShort(DAY_INFO.get(1).date))} and Day 60 is ${esc(formatShort(DAY_INFO.get(60).date))}. Sundays (7, 14 … 56) are rest days.</span>
      </div>
      <label class="check" for="rf-optional">
        <input type="checkbox" id="rf-optional" name="optional" ${f.optional ? 'checked' : ''}>
        <span>Optional (shown lighter, and listed after the other resources)</span>
      </label>
      <div class="button-row">
        <button type="submit" class="button--primary">${isNew ? 'Add resource' : 'Save changes'}</button>
        <button type="button" data-action="resource-cancel">Cancel</button>
      </div>
    </form>`;
}

// ─── Content packs ───────────────────────────────────────────────────────────

function packListHtml(plan) {
  return `
    <ul class="pack-list">
      ${plan.packs.map((p) => `
        <li>
          <strong>${esc(p.title)}</strong> · version ${p.version} ·
          ${p.problems.length
    ? `<span class="flag flag--need">Problem</span> ${esc(p.problems.join(' '))} Nothing from this pack was added.`
    : `${p.newCount} new${p.existingCount ? `, ${p.existingCount} already in your library` : ''}`}
        </li>`).join('')}
    </ul>`;
}

function contentHtml() {
  const c = ui.content;
  let body;
  if (c.busy) {
    body = '<p id="content-status" tabindex="-1" role="status">Checking this app’s own site…</p>';
  } else if (c.message) {
    body = `<p class="status-ok" id="content-status" tabindex="-1" role="status">${esc(c.message)}</p>`;
  } else if (!c.plan && c.failure) {
    body = `
      <div class="error-summary" id="content-status" tabindex="-1" role="alert">
        <h3>Could not check for new content</h3>
        <p>${esc(c.failure)}</p>
        <p>Nothing was changed. There is no earlier copy saved on this device to use instead, so try again when you are online.</p>
      </div>`;
  } else if (c.plan) {
    const plan = c.plan;
    const total = planSize(plan);
    const existing = plan.packs.reduce((n, p) => n + p.existingCount, 0);
    const where = c.source === 'site'
      ? 'Checked this app’s own site just now.'
      : `${c.failure ? `Could not reach this app’s site (${esc(c.failure)}). ` : 'You are offline. '}Using the copy last fetched on ${esc(formatShort(c.content.fetchedAt.slice(0, 10)))}. Nothing has changed.`;
    body = `
      <div id="content-status" tabindex="-1" role="region" aria-label="Content check result" class="${total ? 'note note--gate' : ''}">
        <p class="meta">${where}</p>
        ${total
    ? `<p><strong>${esc(summarizePlan(plan))}.</strong> Cards arrive unverified, with their reference. Anything you changed yourself is kept.</p>`
    : `<p class="status-ok"><strong>You are up to date.</strong> Nothing new in ${plural(plan.packs.length, 'pack', 'packs')}${existing ? ` (${plural(existing, 'item', 'items')} already in your library)` : ''}.</p>`}
        ${packListHtml(plan)}
        ${plan.warnings.length ? `<details><summary>Worth a look (does not stop anything)</summary><ul>${plan.warnings.map((w) => `<li>${esc(w)}</li>`).join('')}</ul></details>` : ''}
        <div class="button-row">
          ${total ? '<button type="button" class="button--primary" data-action="content-add">Add them</button>' : ''}
          <button type="button" data-action="content-cancel">${total ? 'Cancel' : 'Close'}</button>
        </div>
      </div>`;
  } else {
    body = '';
  }
  return `
    <section class="card" aria-labelledby="content-heading">
      <h2 id="content-heading" tabindex="-1">Content from the course</h2>
      <p class="meta">Checking looks only at this app’s own site and sends none of your data. Nothing is added until you confirm, and what you already have (links, statuses, notes, edits) is never changed.</p>
      <div class="button-row">
        <button type="button" data-action="content-check" ${c.busy ? 'disabled' : ''}>Check for new content</button>
      </div>
      ${body}
    </section>`;
}

const GUIDE_EXAMPLE = `{
  "schema": "${RESOURCE_SCHEMA}",
  "resources": [
    {
      "id": "w2-example-entry",
      "title": "Title of the resource",
      "source": "Author or site",
      "type": "article",
      "estimatedMinutes": 30,
      "url": "https://example.com/replace-with-the-real-link",
      "planDays": [8, 9],
      "why": "Why it is in the plan",
      "optional": false,
      "urlStatus": "verified",
      "verifiedNote": "How the link was checked"
    }
  ]
}`;

function importHtml() {
  const r = ui.report;
  let report = '';
  if (r) {
    if (r.fileProblems.length || r.rowProblems.length) {
      report = `
        <div class="error-summary" role="alert" tabindex="-1" id="import-report">
          <h3>"${esc(ui.reportFile)}" was not imported</h3>
          <ul>
            ${r.fileProblems.map((p) => `<li>${esc(p)}</li>`).join('')}
            ${r.rowProblems.map((p) => `<li><strong>${p.id ? esc(p.id) : `Entry ${p.entry} (no usable id)`}${p.id ? ` (entry ${p.entry})` : ''}:</strong> ${p.messages.map(esc).join(' ')}</li>`).join('')}
          </ul>
          <p>Nothing was imported. ${r.rowProblems.length
    ? `Fix ${r.rowProblems.length === 1 ? 'that entry' : 'those entries'} in the file and choose it again.`
    : 'Fix the file and choose it again.'}</p>
        </div>`;
    } else {
      report = `
        <div class="note note--gate" role="region" aria-label="Import preview" id="import-report" tabindex="-1">
          <p><strong>Ready to add ${plural(r.rows.length, 'resource', 'resources')}</strong> from "${esc(ui.reportFile)}".
            ${r.needLink ? `${plural(r.needLink, 'of them has', 'of them have')} no link yet and will show "Link needed", so you can add it.` : ''}
            ${r.skipped.length ? `${plural(r.skipped.length, 'entry is', 'entries are')} already in the library (same id) and will be left exactly as they are, so your edits, statuses and notes stay.` : ''}</p>
          ${r.warnings.length ? `
            <p><strong>Worth a look (does not stop the import):</strong></p>
            <ul>${r.warnings.map((w) => `<li><strong>${esc(w.id)}:</strong> ${esc(w.message)}</li>`).join('')}</ul>` : ''}
          ${r.rows.length ? `<ul>${r.rows.slice(0, 6).map((x) => `<li>${esc(x.title)} · ${esc(RESOURCE_TYPES[x.type])} · about ${x.minutes} min · day${x.days.length === 1 ? '' : 's'} ${esc(x.days.join(', '))}${x.optional ? ' · optional' : ''}${x.url ? '' : ' · link needed'}</li>`).join('')}${r.rows.length > 6 ? `<li>…and ${r.rows.length - 6} more</li>` : ''}</ul>` : ''}
          <div class="button-row">
            ${r.rows.length ? `<button type="button" class="button--primary" data-action="resource-import-confirm">Add ${plural(r.rows.length, 'resource', 'resources')}</button>` : ''}
            <button type="button" data-action="resource-import-cancel">${r.rows.length ? 'Cancel' : 'Close'}</button>
          </div>
        </div>`;
    }
  }
  return `
    <section class="card" aria-labelledby="import-heading">
      <h2 id="import-heading" tabindex="-1">Import from a file</h2>
      <p class="meta">Add resources from your own JSON file. Every entry is checked before anything is added.</p>
      <details>
        <summary>Import guide</summary>
        <p>The file is a JSON object with <code>"schema": "${RESOURCE_SCHEMA}"</code> and a <code>resources</code> list. Each entry has:</p>
        <ul>
          <li><code>id</code>: a short stable name, using letters, numbers, hyphens or underscores. Importing matches on it.</li>
          <li><code>title</code> and <code>source</code>: text</li>
          <li><code>type</code>: <code>video</code>, <code>article</code>, <code>spec</code>, <code>lab</code> or <code>exercise</code></li>
          <li><code>estimatedMinutes</code>: your estimate, a whole number from 1 to ${RESOURCE_LIMITS.minutes}</li>
          <li><code>url</code>: the real link starting with https://, or <code>null</code> when there is no link yet</li>
          <li><code>planDays</code>: plan day numbers from the roadmap, like <code>[8, 9]</code> (Day 1 is Mon Oct 12; Sundays are rest days)</li>
          <li>Optional: <code>why</code>, <code>optional</code> (true or false), <code>urlStatus</code> (<code>verified</code>, <code>needs-your-search</code> or <code>unchecked</code>) and <code>verifiedNote</code>, shown as small text on the resource</li>
        </ul>
        <p>Importing the same file again adds nothing: entries are matched by id, and one that is already in the library is never changed. At most ${MAX_ROWS} entries per file. If any entry is wrong, nothing is imported and each wrong entry is listed by its id.</p>
        <p class="meta">Example of the shape only. Its address is a placeholder, and the app refuses it so it cannot be imported by accident:</p>
        <pre class="code" tabindex="0">${esc(GUIDE_EXAMPLE)}</pre>
      </details>
      <div class="field">
        <label for="resource-import-file">Choose a JSON file</label>
        <input type="file" id="resource-import-file" accept="application/json,.json">
      </div>
      ${report}
    </section>`;
}

/** The plan week (1–9) a date is in; before the plan starts it is Week 1, after it Week 9. */
function currentPlanWeek() {
  const day = planDayFor(today());
  if (day) return Math.ceil(day / 7);
  return today() < WEEKS[0].start ? 1 : 9;
}

export function libraryView() {
  const all = store.effectiveResources();
  const f = ui.filter;
  const thisWeek = currentPlanWeek();
  const weekWanted = f.week === 'this' ? thisWeek : f.week;
  const firstDay = (r) => Math.min(...r.days);
  const weekOf = (r) => Math.ceil(firstDay(r) / 7);
  const shown = all
    .filter((r) => (f.retired ? true : !r.retired))
    .filter((r) => f.status === 'all' || r.status === f.status)
    .filter((r) => f.type === 'all' || r.type === f.type)
    .filter((r) => weekWanted === 'all' || r.days.some((d) => Math.ceil(d / 7) === Number(weekWanted)))
    .filter((r) => f.link === 'all' || !r.url)
    .sort((a, b) => firstDay(a) - firstDay(b) || levelRank(a) - levelRank(b) || (a.position ?? 0) - (b.position ?? 0));
  const { main: shownMain, deep: shownDeep } = splitDeep(shown);
  const active = all.filter((r) => !r.retired);
  const needLink = active.filter((r) => !r.url).length;
  const doneCount = active.filter((r) => r.status === 'done').length;
  const filtered = f.status !== 'all' || f.type !== 'all' || f.link !== 'all' || f.retired;
  const contentActive = ui.content.busy || ui.content.plan || ui.content.message || ui.content.failure;
  const list = (items) => {
    if (weekWanted !== 'all') return `<ol class="resources">${items.map((r) => resourceItemHtml(r, { library: true })).join('')}</ol>`;
    // All weeks: a heading for each week, so a long list has landmarks.
    const weeks = [...new Set(items.map(weekOf))];
    return weeks.map((w) => `
      <h3 class="resource-week">Week ${w}</h3>
      <ol class="resources">${items.filter((r) => weekOf(r) === w).map((r) => resourceItemHtml(r, { library: true })).join('')}</ol>`).join('');
  };

  // First run: one clear step instead of a list of ways to bring content in.
  const firstRun = all.length === 0 ? `
    <section class="card card--soft" aria-labelledby="first-heading">
      <h2 id="first-heading">Add the course resources</h2>
      <p>The course comes with a reading and watching list for each day. Add it to see what to read, watch or do, in order.</p>
      ${contentActive ? '' : '<div class="button-row"><button type="button" class="button--primary" data-action="content-check">Add the course resources</button></div>'}
    </section>` : '';

  const manage = `
    <details class="card" data-deep-group="manage" ${ui.openDeep.has('manage') || (all.length && contentActive) || ui.editing === 'new' || ui.report ? 'open' : ''}>
      <summary>Manage content: check for updates, import a file, add your own</summary>
      ${all.length ? contentHtml() : ''}
      ${importHtml()}
      ${ui.editing === 'new' ? resourceFormHtml(null) : '<div class="button-row"><button type="button" data-action="resource-add">Add a resource yourself</button></div>'}
    </details>`;

  return `
    <h1 id="day-heading" tabindex="-1">Library</h1>
    <p class="meta">What to read, watch or do for each plan day, with a rough time for each. Links open in a new tab.</p>

    ${firstRun}
    ${all.length === 0 && contentActive ? contentHtml() : ''}

    ${all.length ? `
    <section class="card" aria-labelledby="resources-heading">
      <h2 id="resources-heading" tabindex="-1">${weekWanted === 'all' ? 'All weeks' : `Week ${weekWanted}`}</h2>
      <p class="meta">${plural(shown.length, 'resource', 'resources')}${weekWanted === 'this' || weekWanted === thisWeek ? ' this week' : ''} · ${doneCount} of ${active.length} done in total${needLink ? ` · ${needLink} still need a link` : ''}. Minutes are estimates, not logged time.</p>
      ${ui.message ? `<p class="status-ok" id="resources-message" tabindex="-1">${esc(ui.message)}</p>` : ''}
      <div class="filters">
        <div class="field">
          <label for="rl-week">Week</label>
          <select id="rl-week">
            <option value="this" ${f.week === 'this' ? 'selected' : ''}>This week (Week ${thisWeek})</option>
            <option value="all" ${f.week === 'all' ? 'selected' : ''}>All weeks</option>
            ${[1, 2, 3, 4, 5, 6, 7, 8, 9].map((w) => `<option value="${w}" ${String(f.week) === String(w) ? 'selected' : ''}>Week ${w}</option>`).join('')}
          </select>
        </div>
      </div>
      <details class="filters-more" data-deep-group="filters" ${ui.openDeep.has('filters') || f.status !== 'all' || f.type !== 'all' || f.link !== 'all' || f.retired ? 'open' : ''}>
        <summary>More filters${f.status !== 'all' || f.type !== 'all' || f.link !== 'all' || f.retired ? ' (on)' : ''}</summary>
        <div class="filters">
          <div class="field">
            <label for="rl-status">Status</label>
            <select id="rl-status">
              <option value="all">All</option>
              ${Object.entries(RESOURCE_STATUSES).map(([v, l]) => `<option value="${v}" ${f.status === v ? 'selected' : ''}>${esc(l)}</option>`).join('')}
            </select>
          </div>
          <div class="field">
            <label for="rl-type">Type</label>
            <select id="rl-type">
              <option value="all">All types</option>
              ${Object.entries(RESOURCE_TYPES).map(([v, l]) => `<option value="${v}" ${f.type === v ? 'selected' : ''}>${esc(l)}</option>`).join('')}
            </select>
          </div>
          <div class="field">
            <label for="rl-link">Link</label>
            <select id="rl-link">
              <option value="all">All</option>
              <option value="needed" ${f.link === 'needed' ? 'selected' : ''}>Link needed</option>
            </select>
          </div>
        </div>
        <label class="check" for="rl-retired">
          <input type="checkbox" id="rl-retired" ${f.retired ? 'checked' : ''}>
          <span>Show retired resources</span>
        </label>
      </details>
      ${shown.length === 0 ? `<p>Nothing matches${weekWanted === 'all' && !filtered ? '' : ' here'}. ${f.week !== 'all' ? '<button type="button" class="button--small" data-action="resource-show-all">Show all weeks</button>' : ''}</p>` : ''}
      ${list(shownMain)}
      ${deepGroupHtml(shownDeep, 'library', list)}
    </section>` : ''}

    ${manage}`;
}

// ─── Events ──────────────────────────────────────────────────────────────────

function readForm(form) {
  const v = (n) => form.querySelector(`[name="${n}"]`)?.value ?? '';
  return {
    title: v('title'), source: v('source'), type: v('type'), minutes: v('minutes'), url: v('url'), why: v('why'),
    days: v('days'), optional: form.querySelector('[name="optional"]')?.checked ?? false,
  };
}

function finishDone(id, withSession) {
  const r = store.getResource(id);
  if (!r) return null;
  const date = today();
  store.setResourceStatus(id, 'done', date, testMode());
  let msg = `Marked done: ${r.title}.`;
  if (withSession) {
    const result = store.addSession({
      date,
      dayNumber: planDayFor(date),
      minutes: r.minutes,
      status: 'done',
      reason: `Resource: ${r.title}`.slice(0, store.REASON_MAX),
      testMode: testMode(),
    });
    msg += result.ok
      ? ` Logged a ${r.minutes}-minute session on ${formatShort(date)}.`
      : ` The session could not be logged (${result.problems.join(' ')}), so your hours did not change.`;
  } else {
    msg += ' No session was logged, so your hours did not change.';
  }
  ui.doneFor = null;
  ui.message = msg;
  announce(msg);
  return `#rs-${id}`;
}

async function runContentCheck() {
  const result = await checkForContent();
  if (!result.content) {
    ui.content = { ...blankContent(), failure: result.failure };
    announce('Could not check for new content. Nothing was changed.');
  } else {
    const plan = planContent(result.content, store.getData());
    ui.content = { ...blankContent(), content: result.content, source: result.source, failure: result.failure, plan };
    const total = planSize(plan);
    announce(total ? `${summarizePlan(plan)}. Choose Add them to confirm.` : 'You are up to date. Nothing new.');
  }
  refreshScreen('#content-status');
}

export const resourceActions = {
  'content-check': () => {
    if (ui.content.busy) return null;
    ui.content = { ...blankContent(), busy: true };
    runContentCheck();
    return '#content-status';
  },
  'content-add': () => {
    const c = ui.content;
    if (!c.content) return null;
    // Plan again from the same files against what you have right now, so a double click or an edit in between is safe.
    const plan = planContent(c.content, store.getData());
    const done = store.applyContentPlan(plan);
    ui.content = {
      ...blankContent(),
      message: done.resources + done.cards + done.guidance + done.lessons + done.newerVersions
        ? `Added ${plural(done.resources, 'resource', 'resources')}, ${plural(done.cards, 'card', 'cards')}, ${plural(done.guidance, 'guidance note', 'guidance notes')} and ${plural(done.lessons, 'lesson', 'lessons')}. Cards are unverified until you verify them.${done.newerVersions ? ` ${plural(done.newerVersions, 'resource you changed has', 'resources you changed have')} a newer version waiting; yours is kept until you choose.` : ''}${done.saved ? '' : ' Warning: this browser blocked saving.'}`
        : 'Nothing new to add: it is already all here.',
    };
    announce(ui.content.message);
    return '#content-status';
  },
  'content-cancel': () => {
    ui.content = blankContent();
    announce('Closed. Nothing was changed.');
    return '[data-action="content-check"]';
  },
  'resource-done-log': (el) => finishDone(el.dataset.id, true),
  'resource-done-only': (el) => finishDone(el.dataset.id, false),
  'resource-done-cancel': (el) => {
    ui.doneFor = null;
    announce('Cancelled. The status did not change.');
    return `#rs-${el.dataset.id}`;
  },
  'resource-make-card': (el) => {
    flushResourceNotes();
    const r = store.getResource(el.dataset.id);
    if (!r) return null;
    const note = (r.notes ?? '').trim();
    if (!note) {
      setNoteStatus(r.id, 'Write a note first: it becomes the answer on the card.');
      return null;
    }
    const week = Math.min(9, Math.max(1, Math.ceil(Math.min(...r.days) / 7)));
    const withLink = r.url ? `${r.title} (${r.source}) ${r.url}` : `${r.title} (${r.source})`;
    startCardFromResource({
      back: note,
      week,
      topic: r.title.slice(0, 120),
      reference: withLink.length <= 300 ? withLink : `${r.title} (${r.source})`.slice(0, 300),
    });
    nav.focus = '#card-form-heading';
    location.hash = '#learn/cards';
    return null;
  },
  'resource-add': () => {
    ui.editing = 'new'; ui.form = null; ui.errors = []; ui.message = null;
    return '#resource-form-heading';
  },
  'resource-edit': (el) => {
    ui.editing = el.dataset.id; ui.form = null; ui.errors = []; ui.message = null;
    return '#resource-form-heading';
  },
  'resource-cancel': () => {
    const id = ui.editing;
    ui.editing = null; ui.form = null; ui.errors = [];
    return id && id !== 'new' ? `[data-action="resource-edit"][data-id="${id}"]` : '[data-action="resource-add"]';
  },
  'resource-retire': (el) => {
    const r = store.getResource(el.dataset.id);
    if (!r) return null;
    store.setResourceRetired(r.id, true, testMode());
    ui.message = `Retired: ${r.title}. It is hidden from Today and Week; "Show retired resources" brings it back into view.`;
    announce(ui.message);
    return '#resources-message';
  },
  'resource-toggle-optional': (el) => {
    const raw = store.getResource(el.dataset.id);
    if (!raw) return null;
    const next = !store.isOptionalResource(raw);
    store.setOptional('resource', raw.id, next, raw.optional, testMode());
    ui.message = `${raw.title} is now ${next ? 'optional' : 'required'}${store.isChangedByMe('resource', raw.id, raw.optional) ? ' (your choice; content updates will not change it)' : " (the content pack's own setting)"}.`;
    announce(ui.message);
    return `[data-action="resource-toggle-optional"][data-id="${raw.id}"]`;
  },
  'resource-show-all': () => {
    ui.filter = { status: 'all', type: 'all', week: 'all', retired: false, link: 'all' };
    return '#resources-heading';
  },
  'resource-newer-use': (el) => {
    store.resolveNewerVersion(el.dataset.id, true);
    announce('Using the newer version.');
    return `#res-${el.dataset.id}`;
  },
  'resource-newer-keep': (el) => {
    store.resolveNewerVersion(el.dataset.id, false);
    announce('Keeping your version.');
    return `#res-${el.dataset.id}`;
  },
  'resource-restore': (el) => {
    const r = store.getResource(el.dataset.id);
    if (!r) return null;
    store.setResourceRetired(r.id, false, testMode());
    ui.message = `Restored: ${r.title}.`;
    announce(ui.message);
    return '#resources-message';
  },
  'resource-import-cancel': () => {
    ui.report = null;
    announce('Import closed. Nothing changed.');
    return '#resource-import-file';
  },
  'resource-import-confirm': () => {
    if (!ui.report?.rows.length) return null;
    const { skipped } = ui.report;
    const result = store.importResources(ui.report.rows, testMode());
    ui.report = null;
    ui.message = `Added ${plural(result.added, 'resource', 'resources')}${skipped.length ? `; ${plural(skipped.length, 'entry was', 'entries were')} already in the library and left as they are` : ''}.${result.saved ? '' : ' Warning: this browser blocked saving.'}`;
    announce(ui.message);
    return '#resources-message';
  },
};

export function submitResourceForm(form) {
  const values = readForm(form);
  const id = form.dataset.id;
  const { days, problems: dayProblems } = parseDays(values.days);
  const fields = { ...values, minutes: values.minutes === '' ? NaN : Number(values.minutes), days };
  const problems = [...dayProblems, ...validateResource({
    ...fields, title: values.title, source: values.source, url: values.url, why: values.why,
  })];
  if (problems.length) {
    ui.form = values;
    ui.errors = problems;
    return '#resource-errors';
  }
  const result = id === 'new' ? store.addResource(fields, testMode()) : store.updateResource(id, fields, testMode());
  if (!result.ok) {
    ui.form = values;
    ui.errors = result.problems;
    return '#resource-errors';
  }
  ui.editing = null; ui.form = null; ui.errors = [];
  const saved = result.resource;
  const same = findSameLink(store.getData().resources, saved.url, saved.id);
  ui.message = `${id === 'new' ? `Added: ${saved.title}.` : 'Changes saved.'}${same.length ? ` Note: the same link is used by ${same.map((x) => `"${x.title}"`).join(', ')}.` : ''}`;
  announce(ui.message);
  return '#resources-message';
}

/** Saves the link typed into a "Link needed" resource. Returns the selector to focus. */
export function submitLinkForm(form) {
  const id = form.dataset.linkForm;
  const url = form.querySelector('[name="url"]').value;
  const result = store.setResourceLink(id, url, testMode());
  if (!result.ok) {
    ui.linkDrafts[id] = url;
    ui.linkErrors[id] = result.problems.join(' ');
    return `#lk-${id}`;
  }
  delete ui.linkDrafts[id];
  delete ui.linkErrors[id];
  const r = store.getResource(id);
  const same = findSameLink(store.getData().resources, r.url, r.id);
  ui.message = `Link saved for ${r.title}. It now opens in a new tab.${same.length ? ` Note: the same link is used by ${same.map((x) => `"${x.title}"`).join(', ')}.` : ''}`;
  announce(ui.message);
  return `#rs-${id}`;
}

/** Reads a chosen file and checks it. Returns the selector to focus. */
export async function readResourceFile(input) {
  const file = input.files?.[0];
  ui.report = null;
  ui.message = null;
  if (!file) return '#resource-import-file';
  ui.reportFile = file.name;
  ui.report = parseResourceImport(await file.text(), store.getData().resources);
  const r = ui.report;
  announce(r.ok ? `Ready to add ${plural(r.rows.length, 'resource', 'resources')}.` : 'The file was not imported. Some entries need fixing.');
  return '#import-report';
}

export function handleResourceChange(target) {
  if (target.dataset?.resStatus) {
    const id = target.dataset.resStatus;
    const r = store.getResource(id);
    if (!r) return null;
    if (target.value === 'done' && r.status !== 'done') {
      ui.doneFor = id;
      return `#done-q-${id}`;
    }
    ui.doneFor = null;
    store.setResourceStatus(id, target.value, today(), testMode());
    ui.message = null;
    announce(`${r.title}: ${RESOURCE_STATUSES[target.value]}.`);
    return `#rs-${id}`;
  }
  if (target.id === 'rl-status') { ui.filter.status = target.value; return '#rl-status'; }
  if (target.id === 'rl-type') { ui.filter.type = target.value; return '#rl-type'; }
  if (target.id === 'rl-week') { ui.filter.week = target.value; return '#rl-week'; }
  if (target.id === 'rl-link') { ui.filter.link = target.value; return '#rl-link'; }
  if (target.id === 'rl-retired') { ui.filter.retired = target.checked; return '#rl-retired'; }
  return null;
}

/** Typing: notes are saved as you type; the forms keep what you typed. */
export function handleResourceInput(target) {
  if (target.dataset?.resNotes) {
    queueNotes(target.dataset.resNotes, target.value);
    return;
  }
  const linkForm = target.closest('[data-link-form]');
  if (linkForm) {
    ui.linkDrafts[linkForm.dataset.linkForm] = target.value;
    return;
  }
  const form = target.closest('#resource-form');
  if (form) ui.form = readForm(form);
}

/** Remembers which notes sections are open, so a redraw does not close them. */
export function handleResourceToggle(event) {
  const details = event.target;
  const deepKey = details?.dataset?.deepGroup;
  if (deepKey) {
    if (details.open) ui.openDeep.add(deepKey);
    else ui.openDeep.delete(deepKey);
    return;
  }
  const id = details?.dataset?.resDetails;
  if (!id) return;
  if (details.open) ui.openNotes.add(id);
  else ui.openNotes.delete(id);
}

/** Lets a lesson step open the Library at its resource. It shows the resource whatever the filters say. */
export function showResourceInLibrary(id) {
  ui.filter = { status: 'all', type: 'all', week: 'all', retired: true, link: 'all' };
  const r = store.getResource(id);
  if (r?.level === 'deep') ui.openDeep.add('library');
  ui.highlight = id;
  nav.focus = `#res-${id}`;
}

export function resetResourceView() {
  ui.editing = null; ui.form = null; ui.errors = []; ui.doneFor = null; ui.message = null; ui.linkErrors = {};
  if (!ui.content.busy) ui.content = blankContent();
}
