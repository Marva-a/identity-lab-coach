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
  parseDays, validateResource,
} from './records.js';
import { parseResourceImport, MAX_ROWS } from './resource-import.js';
import { startCardFromResource } from './flashcards.js';

// Transient UI state (not saved).
const ui = {
  editing: null, // 'new' or a resource id
  form: null,
  errors: [],
  doneFor: null, // resource id waiting for the "also log a session?" choice
  openNotes: new Set(), // resources whose notes are open
  filter: { status: 'all', type: 'all', week: 'all', retired: false },
  report: null, // result of checking an import file
  reportFile: '',
  message: null,
};

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

function resourceItemHtml(r, { library = false } = {}) {
  if (library && ui.editing === r.id) return `<li class="resource">${resourceFormHtml(r)}</li>`;
  const done = r.status === 'done';
  const hasNotes = Boolean((r.notes ?? '').trim());
  return `
    <li class="resource ${done ? 'resource--done' : ''} ${r.retired ? 'resource--retired' : ''}">
      <p class="resource__title">${linkHtml(r.url, r.title)}${r.retired ? ' <span class="tag">Retired</span>' : ''}${r.testMode ? ' <span class="tag tag--test">Test</span>' : ''}</p>
      <p class="meta">${esc(RESOURCE_TYPES[r.type])} · ${esc(r.source)} · about ${r.minutes} min (estimate)${done && r.doneDate ? ` · Done ${esc(formatShort(r.doneDate))}` : ''}</p>
      ${r.why ? `<p class="meta">Why: ${esc(r.why)}</p>` : ''}
      ${library ? `<p class="meta">Plan ${r.days.length === 1 ? 'day' : 'days'}: ${esc(r.days.map(dayLabel).join(', '))}</p>` : ''}
      <div class="resource__status field">
        <label for="rs-${esc(r.id)}">Status</label>
        <select id="rs-${esc(r.id)}" data-res-status="${esc(r.id)}">
          ${Object.entries(RESOURCE_STATUSES).map(([v, l]) => `<option value="${v}" ${r.status === v ? 'selected' : ''}>${esc(l)}</option>`).join('')}
        </select>
      </div>
      ${ui.doneFor === r.id ? donePromptHtml(r) : ''}
      <details data-res-details="${esc(r.id)}" ${ui.openNotes.has(r.id) ? 'open' : ''}>
        <summary>Notes${hasNotes ? ' (has notes)' : ''}</summary>
        <div class="field">
          <label for="rn-${esc(r.id)}">Your notes on "${esc(r.title)}"</label>
          <textarea id="rn-${esc(r.id)}" data-res-notes="${esc(r.id)}" rows="4" maxlength="${RESOURCE_LIMITS.notes}" aria-describedby="rns-${esc(r.id)}">${esc(r.notes ?? '')}</textarea>
          <span class="hint" id="rns-${esc(r.id)}" aria-live="polite">${hasNotes ? 'Saved' : 'Saved as you type.'}</span>
        </div>
        <button type="button" class="button--small" data-action="resource-make-card" data-id="${esc(r.id)}">Make a flashcard from this note</button>
      </details>
      ${library ? `
        <div class="button-row">
          <button type="button" class="button--small" data-action="resource-edit" data-id="${esc(r.id)}" aria-label="Edit ${esc(r.title)}">Edit</button>
          ${r.retired
            ? `<button type="button" class="button--small" data-action="resource-restore" data-id="${esc(r.id)}" aria-label="Restore ${esc(r.title)}">Restore</button>`
            : `<button type="button" class="button--small button--danger" data-action="resource-retire" data-id="${esc(r.id)}" aria-label="Retire ${esc(r.title)}">Retire</button>`}
        </div>` : ''}
    </li>`;
}

// ─── Today: "Do this next" ───────────────────────────────────────────────────

/** The ordered "Do this next" list for a study day. Empty string when nothing is assigned. */
export function todayResourcesHtml(ctx) {
  if (ctx.kind !== 'study') return '';
  const list = orderResources(store.resourcesForDay(ctx.contentDay));
  if (!list.length) return '';
  const left = remainingMinutes(list);
  return `
    <section class="card" aria-labelledby="next-heading">
      <h2 id="next-heading" tabindex="-1">Do this next</h2>
      <p class="meta">In order: in progress first. Estimated total ${totalMinutes(list)} min, ${left} min still to do, against ${ctx.hours * 60} min planned today. These are estimates: your hours only change when you log a session.</p>
      ${ui.message ? `<p class="status-ok" id="resources-message" tabindex="-1">${esc(ui.message)}</p>` : ''}
      <ol class="resources">${list.map((r) => resourceItemHtml(r)).join('')}</ol>
    </section>`;
}

// ─── Week: resources under each day ──────────────────────────────────────────

/** A compact list under a day in the Week view (no controls; the Library has those). */
export function weekDayResourcesHtml(contentDay) {
  const list = store.resourcesForDay(contentDay);
  if (!list.length) return '';
  return `
    <span class="day-resources">
      <span class="meta">Resources · about ${totalMinutes(list)} min estimated (<a href="#library">open in the Library</a>)</span>
      <ul>
        ${list.map((r) => `<li>${esc(RESOURCE_TYPES[r.type])}: ${linkHtml(r.url, r.title)} · about ${r.minutes} min · <span class="res-status res-status--${r.status}">${esc(RESOURCE_STATUSES[r.status])}</span></li>`).join('')}
      </ul>
    </span>`;
}

// ─── Library ─────────────────────────────────────────────────────────────────

function resourceFormHtml(resource) {
  const isNew = !resource;
  const f = ui.form ?? (resource
    ? { title: resource.title, source: resource.source, type: resource.type, minutes: String(resource.minutes), url: resource.url, why: resource.why, days: resource.days.join(', ') }
    : { title: '', source: '', type: 'article', minutes: '', url: '', why: '', days: '' });
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
        <label for="rf-url">Link</label>
        <input type="url" id="rf-url" name="url" inputmode="url" maxlength="${RESOURCE_LIMITS.url}" value="${esc(f.url)}" autocomplete="off" aria-describedby="rf-url-hint">
        <span class="hint" id="rf-url-hint">Starts with https://. It opens in a new tab; the app never embeds it.</span>
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
      <div class="button-row">
        <button type="submit" class="button--primary">${isNew ? 'Add resource' : 'Save changes'}</button>
        <button type="button" data-action="resource-cancel">Cancel</button>
      </div>
    </form>`;
}

const GUIDE_EXAMPLE = `{
  "resources": [
    {
      "title": "Title of the resource",
      "source": "Author or site",
      "type": "article",
      "minutes": 30,
      "url": "https://example.com/replace-with-the-real-link",
      "why": "Optional: why it is in the plan",
      "days": [8, 9]
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
            ${r.rowProblems.map((p) => `<li><strong>Row ${p.row}${esc(p.label)}:</strong> ${p.messages.map(esc).join(' ')}</li>`).join('')}
          </ul>
          <p>Nothing was imported. ${r.rowProblems.length
    ? `Fix ${r.rowProblems.length === 1 ? 'that row' : 'those rows'} in the file and choose it again. Row 1 is the first resource in the file.`
    : 'Fix the file and choose it again.'}</p>
        </div>`;
    } else {
      report = `
        <div class="note note--gate" role="region" aria-label="Import preview" id="import-report" tabindex="-1">
          <p><strong>Ready to add ${plural(r.rows.length, 'resource', 'resources')}</strong> from "${esc(ui.reportFile)}".
            ${r.skipped.length ? `${plural(r.skipped.length, 'row is', 'rows are')} already in the library (same link) and will be skipped: ${esc(r.skipped.map((s) => s.title).join('; '))}.` : ''}</p>
          ${r.rows.length ? `<ul>${r.rows.slice(0, 8).map((x) => `<li>${esc(x.title)} · ${esc(RESOURCE_TYPES[x.type])} · about ${x.minutes} min · day${x.days.length === 1 ? '' : 's'} ${esc(x.days.join(', '))}</li>`).join('')}${r.rows.length > 8 ? `<li>…and ${r.rows.length - 8} more</li>` : ''}</ul>` : ''}
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
      <p class="meta">The library starts empty. The app does not come with any resources and never makes up titles or links: you provide a JSON file, and every row is checked before anything is added.</p>
      <details>
        <summary>Import guide</summary>
        <p>The file is a JSON list of resources. Each one needs these fields:</p>
        <ul>
          <li><code>title</code>: text</li>
          <li><code>source</code>: author or site, as text</li>
          <li><code>type</code>: <code>video</code>, <code>article</code>, <code>spec</code>, <code>lab</code> or <code>exercise</code></li>
          <li><code>minutes</code>: your estimate, a whole number from 1 to ${RESOURCE_LIMITS.minutes}</li>
          <li><code>url</code>: the real link, starting with https://</li>
          <li><code>days</code>: plan day numbers from the roadmap, like <code>[8, 9]</code> (Day 1 is Mon Oct 12; Sundays are rest days)</li>
          <li><code>why</code>: optional, why it is included</li>
        </ul>
        <p>Use one row per link and list every day it belongs to in <code>days</code>. A link already in the library is skipped. At most ${MAX_ROWS} rows per file. If any row is wrong, nothing is imported and each wrong row is listed.</p>
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

export function libraryView() {
  const all = store.getData().resources;
  const f = ui.filter;
  const firstDay = (r) => Math.min(...r.days);
  const shown = all
    .filter((r) => (f.retired ? true : !r.retired))
    .filter((r) => f.status === 'all' || r.status === f.status)
    .filter((r) => f.type === 'all' || r.type === f.type)
    .filter((r) => f.week === 'all' || r.days.some((d) => Math.ceil(d / 7) === Number(f.week)))
    .sort((a, b) => firstDay(a) - firstDay(b) || (a.position ?? 0) - (b.position ?? 0));
  const active = all.filter((r) => !r.retired);

  return `
    <h1 id="day-heading" tabindex="-1">Library</h1>
    <p class="meta">Resources you chose for each plan day. Links open in a new tab and are never embedded. The app stores only titles, links, estimates and your own notes, not other people's content. Everything stays in this browser.</p>

    ${importHtml()}

    <section class="card" aria-labelledby="resources-heading">
      <h2 id="resources-heading" tabindex="-1">Your resources</h2>
      <p class="meta">${plural(active.length, 'resource', 'resources')}${all.length - active.length ? `, ${all.length - active.length} retired` : ''}. Minutes are estimates, not logged time.</p>
      ${ui.message ? `<p class="status-ok" id="resources-message" tabindex="-1">${esc(ui.message)}</p>` : ''}
      ${all.length === 0 ? '<p>The library is empty. Import a file above, or add a resource yourself.</p>' : `
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
            <label for="rl-week">Week</label>
            <select id="rl-week">
              <option value="all">All weeks</option>
              ${[1, 2, 3, 4, 5, 6, 7, 8, 9].map((w) => `<option value="${w}" ${String(f.week) === String(w) ? 'selected' : ''}>Week ${w}</option>`).join('')}
            </select>
          </div>
        </div>
        <label class="check" for="rl-retired">
          <input type="checkbox" id="rl-retired" ${f.retired ? 'checked' : ''}>
          <span>Show retired resources</span>
        </label>`}
      ${ui.editing === 'new' ? resourceFormHtml(null) : '<div class="button-row"><button type="button" data-action="resource-add">Add a resource</button></div>'}
      ${all.length ? `<p class="meta" aria-live="polite">${plural(shown.length, 'resource', 'resources')} shown.</p>` : ''}
      <ol class="resources">${shown.map((r) => resourceItemHtml(r, { library: true })).join('')}</ol>
    </section>`;
}

// ─── Events ──────────────────────────────────────────────────────────────────

function readForm(form) {
  const v = (n) => form.querySelector(`[name="${n}"]`)?.value ?? '';
  return { title: v('title'), source: v('source'), type: v('type'), minutes: v('minutes'), url: v('url'), why: v('why'), days: v('days') };
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

export const resourceActions = {
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
    const withLink = `${r.title} (${r.source}) ${r.url}`;
    startCardFromResource({
      back: note,
      week,
      topic: r.title.slice(0, 120),
      reference: withLink.length <= 300 ? withLink : `${r.title} (${r.source})`.slice(0, 300),
    });
    nav.focus = '#card-form-heading';
    location.hash = '#cards';
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
    store.setResourceRetired(r.id, true);
    ui.message = `Retired: ${r.title}. It is hidden from Today and Week; "Show retired resources" brings it back into view.`;
    announce(ui.message);
    return '#resources-message';
  },
  'resource-restore': (el) => {
    const r = store.getResource(el.dataset.id);
    if (!r) return null;
    store.setResourceRetired(r.id, false);
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
    const result = store.importResources(ui.report.rows, testMode());
    ui.report = null;
    ui.message = `Added ${plural(result.added, 'resource', 'resources')}.${result.saved ? '' : ' Warning: this browser blocked saving.'}`;
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
  const result = id === 'new' ? store.addResource(fields, testMode()) : store.updateResource(id, fields);
  if (!result.ok) {
    ui.form = values;
    ui.errors = result.problems;
    return '#resource-errors';
  }
  ui.editing = null; ui.form = null; ui.errors = [];
  ui.message = id === 'new' ? `Added: ${result.resource.title}.` : 'Changes saved.';
  announce(ui.message);
  return '#resources-message';
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
  announce(r.ok ? `Ready to add ${plural(r.rows.length, 'resource', 'resources')}.` : 'The file was not imported. Some rows need fixing.');
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
  if (target.id === 'rl-retired') { ui.filter.retired = target.checked; return '#rl-retired'; }
  return null;
}

/** Typing: notes are saved as you type; the add/edit form keeps what you typed. */
export function handleResourceInput(target) {
  if (target.dataset?.resNotes) {
    queueNotes(target.dataset.resNotes, target.value);
    return;
  }
  const form = target.closest('#resource-form');
  if (form) ui.form = readForm(form);
}

/** Remembers which notes sections are open, so a redraw does not close them. */
export function handleResourceToggle(event) {
  const details = event.target;
  const id = details?.dataset?.resDetails;
  if (!id) return;
  if (details.open) ui.openNotes.add(id);
  else ui.openNotes.delete(id);
}

export function resetResourceView() {
  ui.editing = null; ui.form = null; ui.errors = []; ui.doneFor = null; ui.message = null;
}
