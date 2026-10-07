// Scorecard view: progress against the plan, from logged data only.
import * as store from './store.js';
import { esc, announce, today, testMode } from './ui.js';
import { formatShort, isValidDateString } from './dates.js';
import { PLAN_START, PLAN_END } from './plan-data.js';
import {
  scorecard, activePeriod, PERIOD_1, PERIOD_2, targetsFor, MEASURES, STATUS_RULE, STATUS_LABELS,
} from './pace.js';

const KIND_LABELS = {
  artifact: 'Published artifact',
  conversation: 'Conversation',
  application: 'Targeted application',
  referral: 'Referral ask',
};

const ui = {
  draft: { kind: 'artifact', date: '', note: '' },
  errors: [],
  message: null,
};

function formatValue(row, value) {
  if (value === null) return '–';
  if (!row.isCount) return `${value.toFixed(1)} h`;
  return String(value);
}

function formatTarget(target, unit) {
  if (!target) return 'No target';
  const range = target.low === target.high ? `${target.low}` : `${target.low}–${target.high}`;
  return unit ? `about ${range} ${unit}` : range;
}

function statusHtml(row) {
  const label = STATUS_LABELS[row.status];
  return `<span class="status status--${row.status}">${esc(label)}</span>${row.reached ? ' <span class="meta">(target reached)</span>' : ''}`;
}

function expectedNote(row, period) {
  if (row.status === 'none') return 'Hours logged since Dec 11. There is no hours target after Dec 10.';
  if (row.id === 'hours') return 'Planned hours of study days that have ended.';
  if (row.id === 'artifact' && period.id === 'dec10') return 'One per publish Saturday that has ended, plus the capstone after Dec 10.';
  return 'Target spread over study days that have ended (Mon–Sat, no rest days).';
}

function tableHtml(rows, period) {
  return `
    <div class="table-scroll">
      <table class="score-table">
        <caption class="visually-hidden">${esc(period.label)}: logged, expected by today, target and status</caption>
        <thead>
          <tr>
            <th scope="col">Measure</th>
            <th scope="col">Logged</th>
            <th scope="col">Expected by today</th>
            <th scope="col">Target</th>
            <th scope="col">Status</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map((r) => `
            <tr>
              <th scope="row">${esc(r.label)}</th>
              <td>${esc(formatValue(r, r.actual))}</td>
              <td>${esc(formatValue(r, r.expected))}<span class="cell-note">${esc(expectedNote(r, period))}</span></td>
              <td>${esc(formatTarget(r.target, r.unit))}</td>
              <td>${statusHtml(r)}</td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
}

function otherPeriodHtml(period) {
  const other = period.id === 'dec10' ? PERIOD_2 : PERIOD_1;
  const t = targetsFor(other.id);
  const items = MEASURES
    .filter((m) => t[m.id])
    .map((m) => `${m.label}: ${formatTarget(t[m.id], m.unit)}`);
  return `<p class="meta"><strong>${esc(other.label)}${other.id === 'jan31' ? ' (cumulative)' : ''}:</strong> ${esc(items.join('; '))}.</p>`;
}

function logFormHtml() {
  const d = ui.draft;
  const date = d.date || today();
  const errors = ui.errors.length
    ? `<div class="error-summary" role="alert" tabindex="-1" id="tally-errors">
         <h3>Please fix this before saving</h3>
         <ul>${ui.errors.map((e) => `<li>${esc(e)}</li>`).join('')}</ul>
       </div>`
    : '';
  return `
    <form id="tally-form" novalidate>
      ${errors}
      <div class="field">
        <label for="tally-kind">What happened</label>
        <select id="tally-kind" name="kind">
          ${store.TALLY_KINDS.map((k) => `<option value="${k}" ${d.kind === k ? 'selected' : ''}>${esc(KIND_LABELS[k])}</option>`).join('')}
        </select>
      </div>
      <div class="field">
        <label for="tally-date">Date</label>
        <input type="date" id="tally-date" name="date" value="${esc(date)}">
      </div>
      <div class="field">
        <label for="tally-note">Note (optional)</label>
        <input type="text" id="tally-note" name="note" maxlength="${store.NOTE_MAX}" value="${esc(d.note)}" aria-describedby="tally-note-hint" autocomplete="off">
        <span class="hint" id="tally-note-hint">For example "PKCE sequence diagram" or "Chat with an IAM designer at OWASP Vancouver".</span>
      </div>
      <button type="submit" class="button--primary">+1</button>
    </form>`;
}

function recentHtml() {
  const tallies = [...store.getData().tallies]
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt))
    .slice(0, 12);
  if (!tallies.length) return '<p class="meta">Nothing logged yet.</p>';
  return `
    <ul class="log-list">
      ${tallies.map((t) => `
        <li>
          <span><strong>${esc(formatShort(t.date))}</strong> · ${esc(KIND_LABELS[t.kind])}${t.note ? ` · ${esc(t.note)}` : ''}
            ${t.testMode ? '<span class="tag tag--test">Test</span>' : ''}</span>
          <button type="button" class="button--small button--danger" data-action="tally-delete" data-id="${esc(t.id)}"
            aria-label="Delete ${esc(KIND_LABELS[t.kind].toLowerCase())} on ${esc(formatShort(t.date))}">Delete</button>
        </li>`).join('')}
    </ul>`;
}

export function scorecardView() {
  const date = today();
  const d = store.getData();
  const period = activePeriod(date);
  const rows = scorecard(date, d.sessions, store.scorecardCounts());
  const anyTest = d.sessions.some((s) => s.testMode) || d.tallies.some((t) => t.testMode);

  let context;
  if (date < PLAN_START) context = `The plan starts ${formatShort(PLAN_START)}; nothing is expected yet.`;
  else if (date > PERIOD_2.end) context = 'The Jan 31 targets have passed; these are your final numbers.';
  else context = `Today is ${formatShort(date)}. "Expected" only counts days that have ended, so a Sunday or the morning of a study day never puts you behind.`;

  return `
    <h1 id="day-heading" tabindex="-1">Scorecard</h1>

    <section class="card" aria-labelledby="period-heading">
      <h2 id="period-heading">${esc(period.label)}${period.id === 'jan31' ? ' (cumulative since Oct 12)' : ''}</h2>
      <p class="meta">${esc(context)}</p>
      ${tableHtml(rows, period)}
      <p class="rule"><strong>Status:</strong> ${esc(STATUS_RULE)}</p>
      ${otherPeriodHtml(period)}
      <p class="meta">Calculated only from what you log: sessions on Today, and the entries below.${anyTest ? ' Includes test data (delete it in Settings).' : ''}</p>
    </section>

    <section class="card" aria-labelledby="tally-heading">
      <h2 id="tally-heading">Log progress</h2>
      <p class="meta">A quick "+1 with date" until the Evidence log (Stage 4) and People log (Stage 6) exist. Those stages will turn these entries into full records, so nothing is lost.</p>
      ${ui.message ? `<p class="status-ok" id="tally-message" tabindex="-1">${esc(ui.message)}</p>` : ''}
      ${logFormHtml()}
      <h3>Recent entries</h3>
      ${recentHtml()}
    </section>`;
}

export const scorecardActions = {
  'tally-delete': (el) => {
    const t = store.getData().tallies.find((x) => x.id === el.dataset.id);
    if (!t) return null;
    if (!window.confirm(`Delete this ${KIND_LABELS[t.kind].toLowerCase()} on ${formatShort(t.date)}?`)) return null;
    store.deleteTally(t.id);
    ui.message = null;
    announce('Entry deleted.');
    return '#tally-heading';
  },
};

export function submitTallyForm(form) {
  const values = {
    kind: form.querySelector('#tally-kind').value,
    date: form.querySelector('#tally-date').value,
    note: form.querySelector('#tally-note').value,
  };
  const result = store.addTally({ ...values, testMode: testMode() });
  if (!result.ok) {
    ui.draft = values;
    ui.errors = result.problems;
    ui.message = null;
    return '#tally-errors';
  }
  const t = result.tally;
  ui.errors = [];
  ui.draft = { kind: t.kind, date: '', note: '' }; // keep the kind for repeat entries
  const count = store.scorecardCounts()[t.kind].length;
  ui.message = `+1 ${KIND_LABELS[t.kind].toLowerCase()} on ${formatShort(t.date)}${t.testMode ? ' (test)' : ''}. Total: ${count}.`
    + (result.saved ? '' : ' Warning: this browser blocked saving.');
  announce(ui.message);
  return '#tally-message';
}

export function handleTallyInput(target) {
  const map = { 'tally-kind': 'kind', 'tally-date': 'date', 'tally-note': 'note' };
  if (map[target.id]) ui.draft[map[target.id]] = target.value;
  if (target.id === 'tally-date' && !isValidDateString(target.value)) ui.draft.date = '';
}

export function resetScorecardMessages() {
  ui.message = null;
  ui.errors = [];
}

