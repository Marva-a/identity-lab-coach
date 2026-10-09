// Evidence log: your artifacts, from draft to published.
// The scorecard counts an artifact only when it is published, on its published date.
// Maturity and project describe the work; they never change the counts.
import * as store from './store.js';
import {
  esc, announce, today, testMode, plural, errorSummaryHtml, linkHtml, downloadFile,
} from './ui.js';
import { formatShort, vancouverDate } from './dates.js';
import {
  ARTIFACT_TYPES, ARTIFACT_STATUSES, MATURITIES, PROJECTS, TAGS_MAX, LIMITS, normalizeTags, validateArtifact,
  ARTIFACT_CATEGORIES, UNCATEGORISED, categoryLabel, categoryCoverage,
} from './records.js';
import { evidenceToMarkdown } from './evidence-md.js';

// Transient UI state (not saved).
const ui = {
  status: 'all',
  tag: 'all',
  project: 'all',
  editing: null, // 'new' or an artifact id
  form: null, // values typed into the form
  errors: [],
  publishing: null, // artifact id with its publish form open
  publishDate: '',
  publishMaturity: '',
  publishErrors: [],
  selected: new Set(), // ids ticked for the Markdown export
  message: null,
};

function blankForm() {
  const date = today();
  return {
    title: '', type: 'write-up', status: 'draft', createdDate: date, publishedDate: date,
    url: '', category: '', maturity: '', project: '', tags: ['', '', ''], reflection: '',
  };
}

function formFrom(artifact) {
  return {
    title: artifact.title,
    type: artifact.type,
    status: artifact.status,
    createdDate: artifact.createdDate,
    publishedDate: artifact.publishedDate ?? '',
    url: artifact.url ?? '',
    category: artifact.category ?? UNCATEGORISED,
    maturity: artifact.maturity ?? '',
    project: artifact.project ?? '',
    tags: [...(artifact.tags ?? []), '', '', ''].slice(0, TAGS_MAX),
    reflection: artifact.reflection ?? '',
  };
}

function options(map, selected, emptyLabel) {
  const empty = emptyLabel ? `<option value="" ${selected ? '' : 'selected'}>${esc(emptyLabel)}</option>` : '';
  return empty + Object.entries(map).map(([v, l]) => `<option value="${v}" ${selected === v ? 'selected' : ''}>${esc(l)}</option>`).join('');
}

/** The maturity choices in plain words (the saved values and the export keep their original names). */
const MATURITY_PLAIN = {
  implemented: 'Built and working',
  simulated: 'Simulated: mocked up, and labelled that way',
  conceptual: 'Concept only: designed, not built',
  future: 'Planned for later',
};

function formHtml(artifact) {
  const isNew = !artifact;
  const f = ui.form ?? (artifact ? formFrom(artifact) : blankForm());
  const showPublished = f.status === 'published';
  const datalist = `<datalist id="skill-suggestions">${store.suggestedSkillTags().map((t) => `<option value="${esc(t)}"></option>`).join('')}</datalist>`;
  return `
    <form id="evidence-form" class="card-form" data-id="${esc(artifact?.id ?? 'new')}" novalidate>
      <h3 id="evidence-form-heading" tabindex="-1">${isNew ? 'Add a portfolio piece' : 'Edit portfolio piece'}</h3>
      ${errorSummaryHtml('evidence-errors', ui.errors)}
      <div class="field">
        <label for="ev-title">Title</label>
        <input type="text" id="ev-title" name="title" maxlength="${LIMITS.title}" value="${esc(f.title)}" autocomplete="off">
      </div>
      <div class="field">
        <label for="ev-type">Type</label>
        <select id="ev-type" name="type">${options(ARTIFACT_TYPES, f.type)}</select>
      </div>
      <div class="field">
        <label for="ev-category">Category${isNew ? '' : ' (you can leave it as Uncategorised)'}</label>
        <select id="ev-category" name="category" aria-describedby="ev-category-hint">${f.category === UNCATEGORISED
          ? `<option value="${UNCATEGORISED}" selected>Uncategorised</option>${options(ARTIFACT_CATEGORIES, '')}`
          : options(ARTIFACT_CATEGORIES, f.category, 'Choose…')}</select>
        <span class="hint" id="ev-category-hint">What kind of work it shows: Research, Systems, Interaction, Security or Product. It does not change your Progress numbers.</span>
      </div>
      <div class="field">
        <label for="ev-tag-0">What does this show you can do? (one skill is enough to start)</label>
        <input type="text" id="ev-tag-0" name="tag" list="skill-suggestions" maxlength="40" value="${esc(f.tags[0] ?? '')}" autocomplete="off" aria-describedby="ev-tag-hint">
        <span class="hint" id="ev-tag-hint">Pick a suggestion or type your own, for example OAuth, PKCE, zero-trust or segmentation.</span>
        ${datalist}
      </div>
      ${isNew ? `
        <fieldset>
          <legend>Status</legend>
          <div class="choice-group">
            <label class="choice"><input type="radio" name="status" value="draft" ${f.status === 'draft' ? 'checked' : ''}> Draft</label>
            <label class="choice"><input type="radio" name="status" value="published" ${f.status === 'published' ? 'checked' : ''}> Shared</label>
          </div>
        </fieldset>` : `<p class="meta">Status: <strong>${esc(ARTIFACT_STATUSES[artifact.status])}</strong>${artifact.status === 'draft' ? '. When it is posted where others can see it, use "Mark as shared" on the list.' : ''}</p>`}
      <details class="form-more" ${!isNew || showPublished || ui.errors.length ? 'open' : ''}>
        <summary>More details${showPublished ? ' (“How real is this?” is needed)' : ''}</summary>
        <div class="field">
          <label for="ev-project">Project (optional)</label>
          <select id="ev-project" name="project">${options(PROJECTS, f.project, 'Not set')}</select>
        </div>
        <div class="field">
          <label for="ev-maturity">How real is this?${showPublished ? ' (needed)' : ' (needed before you mark it as shared)'}</label>
          <select id="ev-maturity" name="maturity" aria-describedby="ev-maturity-hint">${options(MATURITY_PLAIN, f.maturity, 'Choose…')}</select>
          <span class="hint" id="ev-maturity-hint">Be honest: a mocked-up design is still a strong piece when it is labelled as one.</span>
        </div>
        <div class="field">
          <label for="ev-created">Date you made it</label>
          <input type="date" id="ev-created" name="createdDate" value="${esc(f.createdDate)}">
        </div>
        ${showPublished ? `
          <div class="field">
            <label for="ev-published">Date you shared it</label>
            <input type="date" id="ev-published" name="publishedDate" value="${esc(f.publishedDate)}" aria-describedby="ev-published-hint">
            <span class="hint" id="ev-published-hint">Progress counts it on this date.</span>
          </div>` : ''}
        <div class="field">
          <label for="ev-url">Link (optional)</label>
          <input type="url" id="ev-url" name="url" inputmode="url" maxlength="${LIMITS.url}" value="${esc(f.url)}" autocomplete="off" aria-describedby="ev-url-hint">
          <span class="hint" id="ev-url-hint">Starts with https://. The app never opens it unless you click it.</span>
        </div>
        ${[1, 2].map((i) => `
          <div class="field">
            <label for="ev-tag-${i}">Another skill (optional)</label>
            <input type="text" id="ev-tag-${i}" name="tag" list="skill-suggestions" maxlength="40" value="${esc(f.tags[i] ?? '')}" autocomplete="off">
          </div>`).join('')}
        <div class="field">
          <label for="ev-reflection">What you learned (optional)</label>
          <textarea id="ev-reflection" name="reflection" rows="3" maxlength="${LIMITS.reflection}" aria-describedby="ev-reflection-hint">${esc(f.reflection)}</textarea>
          <span class="hint" id="ev-reflection-hint">What went wrong, what you would change, what you learned.</span>
        </div>
      </details>
      <div class="button-row">
        <button type="submit" class="button--primary">${isNew ? 'Add piece' : 'Save changes'}</button>
        <button type="button" data-action="evidence-cancel">Cancel</button>
      </div>
    </form>`;
}

function publishFormHtml(artifact) {
  const maturity = ui.publishMaturity || artifact.maturity || '';
  return `
    <form id="publish-form" class="card-form" data-id="${esc(artifact.id)}" novalidate>
      <h3 id="publish-heading" tabindex="-1">Mark "${esc(artifact.title)}" as shared</h3>
      ${errorSummaryHtml('publish-errors', ui.publishErrors)}
      <div class="field">
        <label for="publish-maturity">How real is this? (needed)</label>
        <select id="publish-maturity" name="maturity" aria-describedby="publish-maturity-hint">${options(MATURITY_PLAIN, maturity, 'Choose…')}</select>
        <span class="hint" id="publish-maturity-hint">Be honest about depth: it is shown wherever this piece appears, including the export.</span>
      </div>
      <div class="field">
        <label for="publish-date">Date you shared it</label>
        <input type="date" id="publish-date" name="publishedDate" value="${esc(ui.publishDate || today())}" aria-describedby="publish-hint">
        <span class="hint" id="publish-hint">Progress counts it on this date. You made it on ${esc(formatShort(artifact.createdDate))}.</span>
      </div>
      <div class="button-row">
        <button type="submit" class="button--primary">Mark as shared</button>
        <button type="button" data-action="evidence-publish-cancel">Cancel</button>
      </div>
    </form>`;
}

function rowHtml(a) {
  if (ui.editing === a.id) return `<li class="card-row">${formHtml(a)}</li>`;
  if (ui.publishing === a.id) return `<li class="card-row">${publishFormHtml(a)}</li>`;
  const published = a.status === 'published';
  const title = a.url ? linkHtml(a.url, a.title) : esc(a.title);
  const counts = published
    ? `Counts toward your goals on ${esc(formatShort(a.publishedDate))}.`
    : 'Counts toward your goals once you mark it as shared.';
  const maturity = a.maturity
    ? `<strong>${esc(MATURITIES[a.maturity])}</strong>`
    : `not set${published ? ' (edit to choose)' : ''}`;
  return `
    <li class="card-row">
      <h3 class="card-row__front">${title}</h3>
      <p class="meta">${esc(ARTIFACT_TYPES[a.type])} ·
        <span class="tag ${published ? 'tag--verified' : ''}">${esc(ARTIFACT_STATUSES[a.status])}</span> ·
        Made ${esc(formatShort(a.createdDate))}${published ? ` · Shared ${esc(formatShort(a.publishedDate))}` : ''}
        ${a.testMode ? '<span class="tag tag--test">Test</span>' : ''}</p>
      <p class="meta">Category: <strong>${esc(categoryLabel(a.category))}</strong> · Project: ${a.project ? `<strong>${esc(PROJECTS[a.project])}</strong>` : 'not set'} · How real: ${maturity}</p>
      ${a.tags?.length
        ? `<ul class="tags" aria-label="Skills it shows">${a.tags.map((t) => `<li class="tag">${esc(t)}</li>`).join('')}</ul>`
        : `<p class="meta">${a.migrated ? 'Converted from a quick entry: edit it to add what it proves.' : 'No skill tags yet.'}</p>`}
      ${a.reflection ? `<p class="reflection">${esc(a.reflection)}</p>` : ''}
      <p class="meta">${counts}</p>
      ${published ? `
        <label class="check" for="sel-${esc(a.id)}">
          <input type="checkbox" id="sel-${esc(a.id)}" data-export-select="${esc(a.id)}" ${ui.selected.has(a.id) ? 'checked' : ''}>
          <span>Include in the export<span class="visually-hidden">: ${esc(a.title)}</span></span>
        </label>` : ''}
      <div class="button-row">
        <button type="button" class="button--small" data-action="evidence-edit" data-id="${esc(a.id)}" aria-label="Edit ${esc(a.title)}">Edit</button>
        ${published ? '' : `<button type="button" class="button--small button--primary" data-action="evidence-publish" data-id="${esc(a.id)}" aria-label="Mark ${esc(a.title)} as shared">Mark as shared…</button>`}
        <button type="button" class="button--small button--danger" data-action="evidence-delete" data-id="${esc(a.id)}" aria-label="Delete ${esc(a.title)}">Delete</button>
      </div>
    </li>`;
}

/** The published artifacts the Markdown export will include. */
function exportItems() {
  const published = store.getData().artifacts.filter((a) => a.status === 'published');
  const picked = published.filter((a) => ui.selected.has(a.id));
  return { published, items: picked.length ? picked : published, usingSelection: picked.length > 0 };
}

export function evidenceView() {
  const all = store.getData().artifacts;
  const tags = store.allSkillTags();
  if (ui.tag !== 'all' && !tags.some((t) => t.toLowerCase() === ui.tag)) ui.tag = 'all';
  const shown = all
    .filter((a) => ui.status === 'all' || a.status === ui.status)
    .filter((a) => ui.tag === 'all' || (a.tags ?? []).some((t) => t.toLowerCase() === ui.tag))
    .filter((a) => ui.project === 'all' || (ui.project === 'none' ? !a.project : a.project === ui.project))
    .sort((a, b) => (b.publishedDate ?? b.createdDate).localeCompare(a.publishedDate ?? a.createdDate)
      || b.createdAt.localeCompare(a.createdAt));
  const { published, items, usingSelection } = exportItems();
  const exportLabel = published.length === 0
    ? 'Download for a case study'
    : usingSelection
      ? `Download ${plural(items.length, 'selected piece', 'selected pieces')} (.md)`
      : items.length === 1 ? 'Download your shared piece (.md)' : `Download all ${items.length} shared pieces (.md)`;

  const exportBox = `
      <div class="export-box" role="group" aria-labelledby="export-heading">
        <h3 id="export-heading">Export for a case study</h3>
        <p class="meta">Downloads a Markdown (.md) file with each shared piece: title, type, project, how real it is, date shared, skills, link and what you learned. Drafts are left out. Tick "Include in the export" to pick pieces; with none ticked, every shared piece is included.</p>
        <div class="button-row">
          <button type="button" data-action="evidence-export" ${published.length ? '' : 'disabled'}>${esc(exportLabel)}</button>
          ${ui.selected.size ? '<button type="button" class="button--small" data-action="evidence-clear-selection">Clear selection</button>' : ''}
        </div>
        ${published.length ? '' : '<p class="meta">Share a piece first: only shared pieces are exported.</p>'}
      </div>`;
  const filters = `
      <div class="filters">
        <div class="field">
          <label for="ev-filter-status">Status</label>
          <select id="ev-filter-status">
            <option value="all" ${ui.status === 'all' ? 'selected' : ''}>All</option>
            <option value="draft" ${ui.status === 'draft' ? 'selected' : ''}>Drafts</option>
            <option value="published" ${ui.status === 'published' ? 'selected' : ''}>Shared</option>
          </select>
        </div>
        <div class="field">
          <label for="ev-filter-project">Project</label>
          <select id="ev-filter-project">
            <option value="all" ${ui.project === 'all' ? 'selected' : ''}>All projects</option>
            ${Object.entries(PROJECTS).map(([v, l]) => `<option value="${v}" ${ui.project === v ? 'selected' : ''}>${esc(l)}</option>`).join('')}
            <option value="none" ${ui.project === 'none' ? 'selected' : ''}>Not set</option>
          </select>
        </div>
        <div class="field">
          <label for="ev-filter-tag">Skill</label>
          <select id="ev-filter-tag">
            <option value="all">All skills</option>
            ${tags.map((t) => `<option value="${esc(t.toLowerCase())}" ${ui.tag === t.toLowerCase() ? 'selected' : ''}>${esc(t)}</option>`).join('')}
          </select>
        </div>
      </div>`;

  // One clear action at the top; filters and export only once there is something to filter or export.
  return `
    <h1 id="day-heading" tabindex="-1">Portfolio</h1>
    <p class="meta page-intro">The pieces you make along the way: write-ups, diagrams, threat models, code. A piece counts toward your goals once you have shared it where others can see it (GitHub, LinkedIn, your site).</p>

    <section class="card" aria-labelledby="evidence-heading">
      <h2 id="evidence-heading" tabindex="-1">Your pieces</h2>
      ${ui.message ? `<p class="status-ok" id="evidence-message" tabindex="-1">${esc(ui.message)}</p>` : ''}
      ${ui.editing === 'new' ? formHtml(null) : '<div class="button-row"><button type="button" class="button--primary" data-action="evidence-add">Add a piece</button></div>'}
      ${all.length ? `
        <p class="meta">${plural(published.length, 'shared piece', 'shared pieces')} and ${plural(all.length - published.length, 'draft', 'drafts')}.</p>
        ${coverageHtml(all)}
        ${filters}
        <p class="meta" aria-live="polite">${plural(shown.length, 'item', 'items')} shown.</p>
        <ul class="card-list">${shown.map(rowHtml).join('')}</ul>
        ${exportBox}` : `
        <p class="empty-state">Nothing here yet. On Saturdays (write up and share days), add what you made, even as a draft. Once you have shared it, it counts toward your goals and can go straight into a case study.</p>`}
    </section>`;
}

/** Where your evidence stands by category. Quiet until you have made something. */
function coverageHtml(all) {
  const { rows, uncategorised } = categoryCoverage(all);
  if (!all.length) return '';
  const missing = rows.filter((r) => r.count === 0).map((r) => r.label);
  return `
      <p class="meta" id="coverage-line"><strong>By category:</strong> ${rows.map((r) => `${esc(r.label)} ${r.count}`).join(' · ')}${uncategorised ? ` · Uncategorised ${uncategorised} (edit an entry to choose)` : ''}.
        ${missing.length ? `Not covered yet: ${esc(missing.join(', '))}.` : 'Every category has something.'}</p>`;
}

function readForm(form) {
  const val = (name) => form.querySelector(`[name="${name}"]`)?.value ?? '';
  return {
    title: val('title'),
    type: val('type'),
    status: form.querySelector('input[name="status"]:checked')?.value
      ?? (form.dataset.id === 'new' ? 'draft' : store.getArtifact(form.dataset.id)?.status ?? 'draft'),
    createdDate: val('createdDate'),
    publishedDate: val('publishedDate'),
    url: val('url'),
    category: val('category'),
    maturity: val('maturity'),
    project: val('project'),
    tags: [...form.querySelectorAll('input[name="tag"]')].map((i) => i.value),
    reflection: val('reflection'),
  };
}

export const evidenceActions = {
  'evidence-add': () => {
    ui.editing = 'new'; ui.form = null; ui.errors = []; ui.publishing = null; ui.message = null;
    return '#evidence-form-heading';
  },
  'evidence-edit': (el) => {
    ui.editing = el.dataset.id; ui.form = null; ui.errors = []; ui.publishing = null; ui.message = null;
    return '#evidence-form-heading';
  },
  'evidence-cancel': () => {
    const id = ui.editing;
    ui.editing = null; ui.form = null; ui.errors = [];
    return id && id !== 'new' ? `[data-action="evidence-edit"][data-id="${id}"]` : '[data-action="evidence-add"]';
  },
  'evidence-publish': (el) => {
    ui.publishing = el.dataset.id; ui.publishDate = ''; ui.publishMaturity = ''; ui.publishErrors = [];
    ui.editing = null; ui.message = null;
    return '#publish-heading';
  },
  'evidence-publish-cancel': () => {
    const id = ui.publishing;
    ui.publishing = null; ui.publishErrors = [];
    return `[data-action="evidence-publish"][data-id="${id}"]`;
  },
  'evidence-delete': (el) => {
    const a = store.getArtifact(el.dataset.id);
    if (!a) return null;
    if (!window.confirm(`Delete "${a.title}"?${a.status === 'published' ? ' It will no longer count toward your goals.' : ''}`)) return null;
    store.deleteArtifact(a.id);
    ui.selected.delete(a.id);
    ui.message = 'Piece deleted.';
    announce(ui.message);
    return '#evidence-message';
  },
  'evidence-clear-selection': () => {
    ui.selected.clear();
    announce('Selection cleared. The export will include every shared piece.');
    return '[data-action="evidence-export"]';
  },
  'evidence-export': () => {
    const { items } = exportItems();
    if (!items.length) return null;
    const exportedOn = vancouverDate();
    const fileName = `identity-lab-portfolio-${exportedOn}.md`;
    downloadFile(fileName, evidenceToMarkdown(items, { exportedOn }), 'text/markdown');
    ui.message = `Created ${fileName} with ${plural(items.length, 'item', 'items')}. It was saved on this device only.`;
    announce(ui.message);
    return '#evidence-message';
  },
};

export function submitEvidenceForm(form) {
  const values = readForm(form);
  const id = form.dataset.id;
  // Check everything first, so nothing is saved when something is wrong.
  const tags = normalizeTags(values.tags);
  const problems = validateArtifact({
    ...values,
    publishedDate: values.status === 'published' ? values.publishedDate : null,
    tags,
  }, { requireMaturity: true });
  if (!tags.length) problems.unshift('Add at least one skill tag: what this proves.');
  if (problems.length) {
    ui.form = values;
    ui.errors = problems;
    return '#evidence-errors';
  }
  const result = id === 'new' ? store.addArtifact(values, testMode()) : store.updateArtifact(id, values);
  if (!result.ok) {
    ui.form = values;
    ui.errors = result.problems;
    return '#evidence-errors';
  }
  ui.editing = null; ui.form = null; ui.errors = [];
  const a = result.artifact;
  ui.message = id === 'new'
    ? (a.status === 'published' ? `Added as shared. It counts on ${formatShort(a.publishedDate)}.` : 'Added as a draft. It counts once you mark it as shared.')
    : 'Changes saved.';
  announce(ui.message);
  return '#evidence-message';
}

export function submitPublishForm(form) {
  const date = form.querySelector('[name="publishedDate"]').value;
  const maturity = form.querySelector('[name="maturity"]').value;
  const result = store.publishArtifact(form.dataset.id, date, maturity);
  if (!result.ok) {
    ui.publishDate = date;
    ui.publishMaturity = maturity;
    ui.publishErrors = result.problems;
    return '#publish-errors';
  }
  ui.publishing = null; ui.publishErrors = [];
  ui.message = `Marked as shared. It counts toward your goals on ${formatShort(result.artifact.publishedDate)}.`
    + (result.saved ? '' : ' Warning: this browser blocked saving.');
  announce(ui.message);
  return '#evidence-message';
}

export function handleEvidenceChange(target) {
  if (target.id === 'ev-filter-status') { ui.status = target.value; return '#ev-filter-status'; }
  if (target.id === 'ev-filter-project') { ui.project = target.value; return '#ev-filter-project'; }
  if (target.id === 'ev-filter-tag') { ui.tag = target.value; return '#ev-filter-tag'; }
  if (target.dataset?.exportSelect) {
    if (target.checked) ui.selected.add(target.dataset.exportSelect);
    else ui.selected.delete(target.dataset.exportSelect);
    return `#${CSS.escape(target.id)}`;
  }
  if (target.name === 'status' && target.closest('#evidence-form')) {
    ui.form = readForm(target.closest('#evidence-form'));
    return `#evidence-form input[name="status"][value="${target.value}"]`;
  }
  return null;
}

/** Keeps what you typed across re-renders. */
export function handleEvidenceInput(target) {
  const form = target.closest('#evidence-form');
  if (form) ui.form = readForm(form);
  const publish = target.closest('#publish-form');
  if (publish) {
    ui.publishDate = publish.querySelector('[name="publishedDate"]').value;
    ui.publishMaturity = publish.querySelector('[name="maturity"]').value;
  }
}

export function resetEvidenceView() {
  ui.editing = null; ui.form = null; ui.errors = []; ui.publishing = null; ui.publishErrors = []; ui.message = null;
}
