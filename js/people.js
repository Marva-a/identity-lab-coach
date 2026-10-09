// People log: who you've spoken with, and what happened.
// The scorecard counts conversations and referral asks from the interactions here.
// Everything stays in this browser; the app never opens or fetches the links you add.
import * as store from './store.js';
import { esc, announce, today, testMode, plural, errorSummaryHtml, linkHtml } from './ui.js';
import { formatShort, daysBetween } from './dates.js';
import { CONNECTIONS, INTERACTION_TYPES, LIMITS } from './records.js';

// Transient UI state (not saved).
const ui = {
  selected: null, // person id whose page is open
  pendingSelect: null, // set by a "follow-up" link before navigating here
  personForm: null, // 'new' | 'edit' | null
  personValues: null,
  personErrors: [],
  interaction: null, // 'new' | interaction id | null
  interactionValues: null,
  interactionErrors: [],
  message: null,
};

// ─── Follow-ups (shared with the Today view) ─────────────────────────────────

/** How a follow-up relates to today: text first, colour second. */
function followUpState(due, date) {
  if (due < date) {
    const n = daysBetween(due, date);
    return { kind: 'overdue', label: `Overdue by ${plural(n, 'day', 'days')}` };
  }
  if (due === date) return { kind: 'due', label: 'Due today' };
  return { kind: 'upcoming', label: `Due ${formatShort(due)}` };
}

function followUpItemHtml(i, date) {
  const person = store.getPerson(i.personId);
  const st = followUpState(i.followUpDue, date);
  const name = person?.name ?? 'Unknown person';
  return `
    <li class="followup followup--${st.kind}">
      <div>
        <span class="followup__state">${esc(st.label)}</span>
        <a href="#proof/people" data-person-link="${esc(i.personId)}">${esc(name)}</a>
        <span class="meta"> · ${esc(INTERACTION_TYPES[i.type])} on ${esc(formatShort(i.date))} · follow-up due ${esc(formatShort(i.followUpDue))}</span>
        ${i.outcome ? `<p class="meta followup__note">${esc(i.outcome)}</p>` : ''}
      </div>
      <button type="button" class="button--small" data-action="followup-done" data-id="${esc(i.id)}">Done<span class="visually-hidden">: follow-up with ${esc(name)}</span></button>
    </li>`;
}

/** The "Follow-ups due" card on Today. Empty string when nothing is due. */
export function todayFollowUpsHtml() {
  const date = today();
  const due = store.pendingFollowUps(date);
  if (!due.length) return '';
  const overdue = due.filter((i) => i.followUpDue < date).length;
  return `
    <section class="card" aria-labelledby="followups-heading">
      <h2 id="followups-heading" tabindex="-1">Follow-ups due (${due.length})</h2>
      ${overdue ? `<p class="meta">${plural(overdue, 'is', 'are')} overdue. That's fine: do it when you can, or mark it done if it no longer applies.</p>` : ''}
      <ul class="followups">${due.map((i) => followUpItemHtml(i, date)).join('')}</ul>
    </section>`;
}

// ─── Forms ───────────────────────────────────────────────────────────────────

function personFormHtml(person) {
  const isNew = !person;
  const f = ui.personValues ?? (person
    ? { name: person.name, organization: person.organization, role: person.role, connection: person.connection, notes: person.notes, link: person.link }
    : { name: '', organization: '', role: '', connection: '', notes: '', link: '' });
  return `
    <form id="person-form" class="card-form" novalidate>
      <h3 id="person-form-heading" tabindex="-1">${isNew ? 'Add a person' : 'Edit person'}</h3>
      ${errorSummaryHtml('person-errors', ui.personErrors)}
      <div class="field">
        <label for="pf-name">Name</label>
        <input type="text" id="pf-name" name="name" maxlength="${LIMITS.name}" value="${esc(f.name)}" autocomplete="off">
      </div>
      <div class="field">
        <label for="pf-org">Organization (optional)</label>
        <input type="text" id="pf-org" name="organization" maxlength="${LIMITS.name}" value="${esc(f.organization)}" autocomplete="off">
      </div>
      <div class="field">
        <label for="pf-role">Role (optional)</label>
        <input type="text" id="pf-role" name="role" maxlength="${LIMITS.name}" value="${esc(f.role)}" autocomplete="off">
      </div>
      <div class="field">
        <label for="pf-connection">How we connected</label>
        <select id="pf-connection" name="connection">
          <option value="" ${f.connection ? '' : 'selected'}>Choose…</option>
          ${Object.entries(CONNECTIONS).map(([v, l]) => `<option value="${v}" ${f.connection === v ? 'selected' : ''}>${esc(l)}</option>`).join('')}
        </select>
      </div>
      <div class="field">
        <label for="pf-notes">Notes (optional)</label>
        <textarea id="pf-notes" name="notes" rows="3" maxlength="${LIMITS.notes}">${esc(f.notes)}</textarea>
      </div>
      <div class="field">
        <label for="pf-link">LinkedIn or other link (optional)</label>
        <input type="url" id="pf-link" name="link" inputmode="url" maxlength="${LIMITS.url}" value="${esc(f.link)}" autocomplete="off" aria-describedby="pf-link-hint">
        <span class="hint" id="pf-link-hint">Starts with https://. It is only stored here. The app never fetches anything from it.</span>
      </div>
      <div class="button-row">
        <button type="submit" class="button--primary">${isNew ? 'Add person' : 'Save changes'}</button>
        <button type="button" data-action="person-form-cancel">Cancel</button>
      </div>
    </form>`;
}

function interactionFormHtml(existing, person) {
  const isNew = !existing;
  const f = ui.interactionValues ?? (existing
    ? { personId: existing.personId, date: existing.date, type: existing.type, outcome: existing.outcome, followUpDue: existing.followUpDue ?? '' }
    : { personId: person.id, date: today(), type: 'conversation', outcome: '', followUpDue: '' });
  const people = [...store.getData().people].sort((a, b) => a.name.localeCompare(b.name));
  return `
    <form id="interaction-form" class="card-form" data-id="${esc(existing?.id ?? 'new')}" data-person="${esc(person.id)}" novalidate>
      <h3 id="interaction-form-heading" tabindex="-1">${isNew ? `Log a conversation with ${esc(person.name)}` : 'Edit conversation'}</h3>
      ${errorSummaryHtml('interaction-errors', ui.interactionErrors)}
      <fieldset>
        <legend>What happened</legend>
        <div class="choice-group">
          ${Object.entries(INTERACTION_TYPES).map(([v, l]) => `
            <label class="choice"><input type="radio" name="type" value="${v}" ${f.type === v ? 'checked' : ''}> ${esc(l)}</label>`).join('')}
        </div>
      </fieldset>
      <div class="field">
        <label for="if-date">Date</label>
        <input type="date" id="if-date" name="date" value="${esc(f.date)}">
      </div>
      ${isNew ? '' : `
        <div class="field">
          <label for="if-person">Person</label>
          <select id="if-person" name="personId">
            ${people.map((p) => `<option value="${esc(p.id)}" ${f.personId === p.id ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}
          </select>
        </div>`}
      <div class="field">
        <label for="if-outcome">What came of it (optional)</label>
        <textarea id="if-outcome" name="outcome" rows="3" maxlength="${LIMITS.outcome}">${esc(f.outcome)}</textarea>
      </div>
      <div class="field">
        <label for="if-follow">Follow-up due (optional)</label>
        <input type="date" id="if-follow" name="followUpDue" value="${esc(f.followUpDue)}" aria-describedby="if-follow-hint">
        <span class="hint" id="if-follow-hint">It appears on Today from this date until you mark it done.</span>
      </div>
      <div class="button-row">
        <button type="submit" class="button--primary">${isNew ? 'Save' : 'Save changes'}</button>
        <button type="button" data-action="interaction-cancel">Cancel</button>
      </div>
    </form>`;
}

// ─── Views ───────────────────────────────────────────────────────────────────

const PRIVACY = 'The app never fetches anything from LinkedIn or any other link you add; a link only opens if you click it.';

function interactionRowHtml(i, person, date) {
  if (ui.interaction === i.id) return `<li class="card-row">${interactionFormHtml(i, person)}</li>`;
  let follow = '';
  if (i.followUpDue) {
    if (i.followUpDoneAt) {
      follow = `<p class="meta">Follow-up done (was due ${esc(formatShort(i.followUpDue))}).</p>`;
    } else {
      const st = followUpState(i.followUpDue, date);
      follow = `<p class="followup-line followup-line--${st.kind}"><span class="followup__state">${esc(st.label)}</span> · follow-up due ${esc(formatShort(i.followUpDue))}</p>`;
    }
  }
  return `
    <li class="card-row">
      <p class="card-row__front">${esc(INTERACTION_TYPES[i.type])} · ${esc(formatShort(i.date))}${i.testMode ? ' <span class="tag tag--test">Test</span>' : ''}</p>
      ${i.outcome ? `<p>${esc(i.outcome)}</p>` : '<p class="meta">No outcome note.</p>'}
      ${follow}
      <div class="button-row">
        ${i.followUpDue
          ? (i.followUpDoneAt
            ? `<button type="button" class="button--small" data-action="followup-undo" data-id="${esc(i.id)}">Mark follow-up not done</button>`
            : `<button type="button" class="button--small" data-action="followup-done" data-id="${esc(i.id)}">Follow-up done</button>`)
          : ''}
        <button type="button" class="button--small" data-action="interaction-edit" data-id="${esc(i.id)}" aria-label="Edit ${esc(INTERACTION_TYPES[i.type].toLowerCase())} on ${esc(formatShort(i.date))}">Edit</button>
        <button type="button" class="button--small button--danger" data-action="interaction-delete" data-id="${esc(i.id)}" aria-label="Delete ${esc(INTERACTION_TYPES[i.type].toLowerCase())} on ${esc(formatShort(i.date))}">Delete</button>
      </div>
    </li>`;
}

function personPageHtml(person) {
  const date = today();
  const interactions = store.interactionsFor(person.id);
  const talks = interactions.filter((i) => i.type === 'conversation').length;
  const refs = interactions.length - talks;
  return `
    <p><button type="button" data-action="person-back">← All people</button></p>
    <h1 id="day-heading" tabindex="-1">${esc(person.name)}</h1>
    <section class="card" aria-labelledby="person-heading">
      <h2 id="person-heading">About</h2>
      ${ui.message ? `<p class="status-ok" id="people-message" tabindex="-1">${esc(ui.message)}</p>` : ''}
      ${ui.personForm === 'edit' ? personFormHtml(person) : `
        <dl class="facts">
          <div><dt>Organization</dt><dd>${esc(person.organization) || '–'}</dd></div>
          <div><dt>Role</dt><dd>${esc(person.role) || '–'}</dd></div>
          <div><dt>How we connected</dt><dd>${esc(CONNECTIONS[person.connection])}</dd></div>
          ${person.link ? `<div><dt>Link</dt><dd>${linkHtml(person.link)}</dd></div>` : ''}
        </dl>
        ${person.notes ? `<p>${esc(person.notes)}</p>` : ''}
        ${person.migrated ? '<p class="note">This holds conversations and referral requests you logged before People existed. Edit each one to move it to the right person.</p>' : ''}
        <div class="button-row">
          <button type="button" class="button--small" data-action="person-edit">Edit person</button>
          <button type="button" class="button--small button--danger" data-action="person-delete">Delete person</button>
        </div>`}
    </section>
    <section class="card" aria-labelledby="interactions-heading">
      <h2 id="interactions-heading" tabindex="-1">Conversations</h2>
      <p class="meta">${plural(talks, 'conversation', 'conversations')} and ${plural(refs, 'referral request', 'referral requests')}. Each counts toward your goals on its date.</p>
      ${ui.interaction === 'new' ? interactionFormHtml(null, person) : '<div class="button-row"><button type="button" data-action="interaction-add">Log a conversation</button></div>'}
      <ul class="card-list">${interactions.map((i) => interactionRowHtml(i, person, date)).join('')}</ul>
    </section>
    <p class="meta">${esc(PRIVACY)}</p>`;
}

export function peopleView() {
  if (ui.selected) {
    const person = store.getPerson(ui.selected);
    if (person) return personPageHtml(person);
    ui.selected = null;
  }
  const date = today();
  const people = [...store.getData().people].sort((a, b) => a.name.localeCompare(b.name));
  const pending = store.pendingFollowUps();
  const interactions = store.getData().interactions;

  return `
    <h1 id="day-heading" tabindex="-1">People</h1>
    <p class="meta">${esc(PRIVACY)}</p>

    ${pending.length ? `
      <section class="card" aria-labelledby="pending-heading">
        <h2 id="pending-heading" tabindex="-1">Follow-ups (${pending.length})</h2>
        <ul class="followups">${pending.map((i) => followUpItemHtml(i, date)).join('')}</ul>
      </section>` : ''}

    <section class="card" aria-labelledby="people-heading">
      <h2 id="people-heading" tabindex="-1">People</h2>
      ${ui.message ? `<p class="status-ok" id="people-message" tabindex="-1">${esc(ui.message)}</p>` : ''}
      ${ui.personForm === 'new' ? personFormHtml(null) : '<div class="button-row"><button type="button" class="button--primary" data-action="person-add">Add a person</button></div>'}
      ${people.length ? `<ul class="card-list">
        ${people.map((p) => {
          const mine = interactions.filter((i) => i.personId === p.id);
          const talks = mine.filter((i) => i.type === 'conversation').length;
          const refs = mine.length - talks;
          const last = mine.map((i) => i.date).sort().pop();
          return `
            <li class="card-row">
              <p class="card-row__front">${esc(p.name)}${p.testMode ? ' <span class="tag tag--test">Test</span>' : ''}</p>
              <p class="meta">${[p.role, p.organization].filter(Boolean).map(esc).join(' at ') || 'No role or organization'} · ${esc(CONNECTIONS[p.connection])}</p>
              <p class="meta">${plural(talks, 'conversation', 'conversations')}, ${plural(refs, 'referral request', 'referral requests')}${last ? `, last ${esc(formatShort(last))}` : ''}</p>
              <div class="button-row"><button type="button" class="button--small" data-action="person-open" data-id="${esc(p.id)}" aria-label="Open ${esc(p.name)}">Open</button></div>
            </li>`;
        }).join('')}
      </ul>` : '<p class="meta">No one yet. Add someone you have talked to or plan to, then log each conversation or referral request with them.</p>'}
    </section>`;
}

// ─── Events ──────────────────────────────────────────────────────────────────

function readPersonForm(form) {
  const v = (n) => form.querySelector(`[name="${n}"]`)?.value ?? '';
  return { name: v('name'), organization: v('organization'), role: v('role'), connection: v('connection'), notes: v('notes'), link: v('link') };
}

function readInteractionForm(form) {
  const v = (n) => form.querySelector(`[name="${n}"]`)?.value ?? '';
  return {
    personId: form.querySelector('[name="personId"]')?.value ?? form.dataset.person,
    date: v('date'),
    type: form.querySelector('input[name="type"]:checked')?.value ?? 'conversation',
    outcome: v('outcome'),
    followUpDue: v('followUpDue'),
  };
}

function closeForms() {
  ui.personForm = null; ui.personValues = null; ui.personErrors = [];
  ui.interaction = null; ui.interactionValues = null; ui.interactionErrors = [];
}

function doneFocus() {
  return '#followups-heading, #pending-heading, #interactions-heading, #day-heading';
}

export const peopleActions = {
  'person-add': () => {
    closeForms(); ui.personForm = 'new'; ui.message = null;
    return '#person-form-heading';
  },
  'person-edit': () => {
    closeForms(); ui.personForm = 'edit'; ui.message = null;
    return '#person-form-heading';
  },
  'person-form-cancel': () => {
    const editing = ui.personForm === 'edit';
    closeForms();
    return editing ? '[data-action="person-edit"]' : '[data-action="person-add"]';
  },
  'person-open': (el) => {
    closeForms(); ui.selected = el.dataset.id; ui.message = null;
    return '#day-heading';
  },
  'person-back': () => {
    closeForms(); ui.selected = null; ui.message = null;
    return '#people-heading';
  },
  'person-delete': () => {
    const person = store.getPerson(ui.selected);
    if (!person) return null;
    const n = store.interactionsFor(person.id).length;
    if (!window.confirm(`Delete ${person.name}${n ? ` and ${plural(n, 'conversation', 'conversations')} with them` : ''}? They will no longer count toward your goals.`)) return null;
    store.deletePerson(person.id);
    ui.selected = null;
    ui.message = `Deleted ${person.name}.`;
    announce(ui.message);
    return '#people-message';
  },
  'interaction-add': () => {
    closeForms(); ui.interaction = 'new'; ui.message = null;
    return '#interaction-form-heading';
  },
  'interaction-edit': (el) => {
    closeForms(); ui.interaction = el.dataset.id; ui.message = null;
    return '#interaction-form-heading';
  },
  'interaction-cancel': () => {
    const id = ui.interaction;
    closeForms();
    return id && id !== 'new' ? `[data-action="interaction-edit"][data-id="${id}"]` : '[data-action="interaction-add"]';
  },
  'interaction-delete': (el) => {
    const i = store.getData().interactions.find((x) => x.id === el.dataset.id);
    if (!i) return null;
    if (!window.confirm(`Delete this ${INTERACTION_TYPES[i.type].toLowerCase()} on ${formatShort(i.date)}? It will no longer count toward your goals.`)) return null;
    store.deleteInteraction(i.id);
    ui.message = 'Deleted.';
    announce(ui.message);
    return '#people-message, #interactions-heading';
  },
  'followup-done': (el) => {
    store.setFollowUpDone(el.dataset.id, true);
    announce('Follow-up marked done.');
    return doneFocus();
  },
  'followup-undo': (el) => {
    store.setFollowUpDone(el.dataset.id, false);
    announce('Follow-up marked not done.');
    return `[data-action="followup-done"][data-id="${el.dataset.id}"], #interactions-heading`;
  },
};

export function submitPersonForm(form) {
  const values = readPersonForm(form);
  const editing = ui.personForm === 'edit';
  const result = editing ? store.updatePerson(ui.selected, values) : store.addPerson(values, testMode());
  if (!result.ok) {
    ui.personValues = values;
    ui.personErrors = result.problems;
    return '#person-errors';
  }
  closeForms();
  ui.message = editing ? 'Changes saved.' : `Added ${result.person.name}.`;
  announce(ui.message);
  return '#people-message';
}

export function submitInteractionForm(form) {
  const values = readInteractionForm(form);
  const id = form.dataset.id;
  const result = id === 'new' ? store.addInteraction(values, testMode()) : store.updateInteraction(id, values);
  if (!result.ok) {
    ui.interactionValues = values;
    ui.interactionErrors = result.problems;
    return '#interaction-errors';
  }
  const moved = id !== 'new' && values.personId !== ui.selected;
  closeForms();
  if (moved) ui.selected = values.personId;
  const i = result.interaction;
  ui.message = id === 'new'
    ? `Saved. It counts toward your goals on ${formatShort(i.date)}.${i.followUpDue ? ` Follow-up shows on Today from ${formatShort(i.followUpDue)}.` : ''}`
    : `Changes saved${moved ? ` and moved to ${store.getPerson(values.personId).name}` : ''}.`;
  announce(ui.message);
  return '#people-message';
}

export function handlePeopleInput(target) {
  const personForm = target.closest('#person-form');
  if (personForm) ui.personValues = readPersonForm(personForm);
  const interactionForm = target.closest('#interaction-form');
  if (interactionForm) ui.interactionValues = readInteractionForm(interactionForm);
}

/** A follow-up link clicked on Today: open that person's page after navigating. */
export function selectPersonOnNavigate(id) {
  ui.pendingSelect = id;
}

export function resetPeopleView() {
  closeForms();
  ui.selected = ui.pendingSelect;
  ui.pendingSelect = null;
  ui.message = null;
}
