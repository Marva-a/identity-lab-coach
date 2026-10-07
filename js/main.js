// UI: renders the views (Today, Week, Flashcards, Scorecard, Settings) and wires up events.
// Views are plain HTML strings; events use delegation on <main>.
import * as store from './store.js';
import * as T from './timer.js';
import { vancouverDate, formatLong, formatShort, isValidDateString } from './dates.js';
import { getDayContext, dayNumberFor } from './plan.js';
import { PLAN_START, PLAN_END, ITEM_KIND_LABELS, BLOCK_LABELS } from './plan-data.js';
import { runDateChecks, timeZoneInfo } from './selftest.js';
import { esc, today, testMode, announce, plural } from './ui.js';
import {
  retrievalHtml, flashcardsView, cardActions, submitCardForm, handleCardChange, handleCardInput, resetCardMessages,
} from './flashcards.js';
import { weekView, weekActions, handleWeekChange, resetWeekView } from './week.js';
import {
  scorecardView, scorecardActions, submitTallyForm, handleTallyInput, resetScorecardMessages,
} from './scorecard.js';

const mainEl = document.getElementById('main');
const bannersEl = document.getElementById('banners');
const BASE_TITLE = 'Identity Lab Coach';

let route = 'today';
let activeTimer = T.loadTimer();
let renderedDate = null;

// Transient UI state (not saved).
const ui = {
  logDraft: { status: '', minutes: '', reason: '', date: '' },
  logErrors: [],
  flash: null,
  importPreview: null,
  importProblems: [],
  dataMessage: null,
  checkResults: null,
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function planDayFor(date) {
  return date >= PLAN_START && date <= PLAN_END ? dayNumberFor(date) : null;
}

function statusLabel(status) {
  return { done: 'Done', partial: 'Partial', skipped: 'Skipped' }[status] ?? status;
}

// ─── Banners and theme ───────────────────────────────────────────────────────

function applyTheme() {
  const { theme } = store.getSettings();
  if (theme === 'light' || theme === 'dark') document.documentElement.dataset.theme = theme;
  else delete document.documentElement.dataset.theme;
}

function renderBanners() {
  const parts = [];
  const { testDate } = store.getSettings();
  if (testDate.enabled) {
    parts.push(`
      <div class="banner" role="region" aria-label="Test date">
        <p><strong>Test date on.</strong> Showing ${esc(formatLong(today()))} instead of today. Sessions you log now are marked as test sessions.</p>
        <button type="button" class="button--small" data-action="test-off">Turn off test date</button>
      </div>`);
  }
  if (!store.storageAvailable) {
    parts.push(`
      <div class="banner" role="alert">
        <p><strong>Nothing can be saved in this browser.</strong> Storage is blocked (often in a private window). Open the app in a normal window, or export before you close it.</p>
      </div>`);
  }
  bannersEl.innerHTML = parts.join('');
}

// ─── Today view ──────────────────────────────────────────────────────────────

function itemHtml(item, showKind = true) {
  const flags = [];
  if (item.optional) flags.push('<span class="flag">Optional</span>');
  if (item.conditional) flags.push(`<span class="flag">Conditional: ${esc(item.conditional)}</span>`);
  return `
    <li class="${item.optional ? 'is-optional' : ''}">
      ${showKind ? `<span class="item-kind">${esc(ITEM_KIND_LABELS[item.kind])}</span>` : ''}
      <span class="item-text">${esc(item.text)}</span>${flags.join('')}
    </li>`;
}

function headerHtml(ctx) {
  switch (ctx.kind) {
    case 'before': {
      const p = ctx.preview;
      return `
        <section class="card" aria-labelledby="day-heading">
          <p class="eyebrow">${esc(formatLong(ctx.date))}</p>
          <h1 id="day-heading" tabindex="-1">Before Day 1</h1>
          <p>The plan starts on <strong>${esc(formatLong(PLAN_START))}</strong>, in ${ctx.daysUntilStart} ${ctx.daysUntilStart === 1 ? 'day' : 'days'}.</p>
          <h2>Day 1 preview</h2>
          <ul class="tags" aria-label="Day 1 details">
            <li class="tag tag--block">${esc(p.blockLabel)}</li>
            <li class="tag">${p.hours} h planned</li>
            ${p.holiday ? `<li class="tag">${esc(p.holiday)}</li>` : ''}
          </ul>
          <p class="focus-line">${esc(p.focus)}</p>
        </section>`;
    }
    case 'study': {
      const swapNote = ctx.swapped ? ` <span class="meta">(swapped: week ${ctx.week.number} content)</span>` : '';
      return `
        <section class="card" aria-labelledby="day-heading">
          <p class="eyebrow">Week ${ctx.calendarWeek}: ${esc(ctx.week.title)}${swapNote}</p>
          <h1 id="day-heading" tabindex="-1">Day ${ctx.dayNumber} of 60</h1>
          <p class="meta">${esc(formatLong(ctx.date))}</p>
          <ul class="tags" aria-label="Today's block">
            <li class="tag tag--block">Block: ${esc(ctx.blockLabel)}</li>
            <li class="tag">${ctx.hours} h planned</li>
            ${ctx.holiday ? `<li class="tag">${esc(ctx.holiday)}</li>` : ''}
          </ul>
          <p class="focus-line"><span class="visually-hidden">Focus: </span>${esc(ctx.focus)}</p>
          ${ctx.conditional ? `<p class="meta">Conditional: ${esc(ctx.conditional)}.</p>` : ''}
          ${ctx.gate ? `<p class="note note--gate"><strong>Gate:</strong> ${esc(ctx.gate)}</p>` : ''}
        </section>`;
    }
    case 'rest': {
      const next = ctx.next;
      return `
        <section class="card" aria-labelledby="day-heading">
          <p class="eyebrow">${esc(formatLong(ctx.date))}${ctx.dayNumber ? ` · Day ${ctx.dayNumber} of 60` : ''}</p>
          <h1 id="day-heading" tabindex="-1">Rest day</h1>
          <p>Sundays are planned rest.</p>
          ${next ? `<p class="meta">Next: ${esc(formatShort(next.date))}, Day ${next.dayNumber}, ${esc(next.blockLabel)}: ${esc(next.focus)}</p>` : ''}
        </section>`;
    }
    case 'bridge':
      return `
        <section class="card" aria-labelledby="day-heading">
          <p class="eyebrow">Bridge period (Dec 11 – Jan 17) · ${esc(formatLong(ctx.date))}</p>
          <h1 id="day-heading" tabindex="-1">${esc(ctx.phase.title)}</h1>
          <ul class="tags"><li class="tag tag--block">Block: ${esc(BLOCK_LABELS.bridge)}</li></ul>
          <p class="focus-line">${esc(ctx.phase.focus)}</p>
          ${applicationHtml(ctx)}
        </section>`;
    case 'bridge-rest':
      return `
        <section class="card" aria-labelledby="day-heading">
          <p class="eyebrow">Bridge period · ${esc(formatLong(ctx.date))}</p>
          <h1 id="day-heading" tabindex="-1">Rest</h1>
          <p>${ctx.sunday ? 'Sundays are planned rest.' : 'Dec 24 – Jan 1 is planned rest. Optional reading only.'}</p>
        </section>`;
    case 'applications':
      return `
        <section class="card" aria-labelledby="day-heading">
          <p class="eyebrow">Application system (Jan 5 – Mar 31) · ${esc(formatLong(ctx.date))}</p>
          <h1 id="day-heading" tabindex="-1">${esc(ctx.application.focus)}</h1>
          <p class="meta">Output: ${esc(ctx.application.output)}</p>
          ${ctx.interviewPrep ? `<p class="note"><strong>Interview prep:</strong> ${esc(ctx.interviewPrep)}</p>` : ''}
          ${ctx.febReview ? '<p class="note note--gate"><strong>Gate:</strong> this is the application review week (week of Feb 15).</p>' : ''}
        </section>`;
    default:
      return `
        <section class="card" aria-labelledby="day-heading">
          <p class="eyebrow">${esc(formatLong(ctx.date))}</p>
          <h1 id="day-heading" tabindex="-1">Beyond the plan</h1>
          <p>The dated roadmap ends on Mar 31, 2027.</p>
        </section>`;
  }
}

function applicationHtml(ctx) {
  if (!ctx.application) return '';
  return `
    <h2>Application system</h2>
    <p>${esc(ctx.application.focus)}</p>
    <p class="meta">Output: ${esc(ctx.application.output)}</p>
    ${ctx.interviewPrep ? `<p class="note"><strong>Interview prep:</strong> ${esc(ctx.interviewPrep)}</p>` : ''}`;
}

function itemsHtml(ctx) {
  if (ctx.kind !== 'study') return '';
  const blockItems = ctx.items.length
    ? `<ul class="items">${ctx.items.map((i) => itemHtml(i)).join('')}</ul>`
    : '<p class="meta">The capstone has no week checklist; follow the day\'s focus.</p>';
  const network = ctx.networkItems.length
    ? `<details>
         <summary>This week's networking (evenings, outside the 12 h)</summary>
         <ul class="items">${ctx.networkItems.map((i) => itemHtml(i, false)).join('')}</ul>
       </details>`
    : '';
  const notes = ctx.notes.map((n) => `<p class="note">${esc(n)}</p>`).join('');
  return `
    <section class="card" aria-labelledby="items-heading">
      <h2 id="items-heading">This week's ${esc(ctx.blockLabel.toLowerCase())} items</h2>
      ${blockItems}
      ${network}
      ${notes}
    </section>`;
}

function defaultBlocks(ctx) {
  if (ctx.kind === 'study') return ctx.hours >= 2 ? 2 : 1;
  return 2;
}

function timerHtml(ctx) {
  const date = ctx.date;
  if (!['study', 'bridge', 'applications'].includes(ctx.kind) && !activeTimer) return '';

  let body;
  if (activeTimer && activeTimer.date !== date) {
    body = `
      <p>A timer from <strong>${esc(formatLong(activeTimer.date))}</strong> is still open, with ${T.focusMinutes(activeTimer)} focus minutes. The log form below is filled in for that date.</p>
      <div class="button-row">
        <button type="button" class="button--danger" data-action="timer-discard">Discard that timer</button>
      </div>`;
  } else if (!activeTimer) {
    const blocks = defaultBlocks(ctx);
    body = `
      <p class="meta">Focus blocks are ${T.FOCUS_MIN} minutes, with a ${T.BREAK_MIN}-minute break between them. You can pause at any time.</p>
      <div class="field">
        <label for="timer-blocks">Focus blocks</label>
        <select id="timer-blocks">
          <option value="1" ${blocks === 1 ? 'selected' : ''}>1 block (50 min)</option>
          <option value="2" ${blocks === 2 ? 'selected' : ''}>2 blocks (50 + 10 break + 50)</option>
        </select>
      </div>
      <div class="button-row">
        <button type="button" class="button--primary" data-action="timer-start-new">Start focus block 1</button>
      </div>`;
  } else {
    const t = activeTimer;
    const phase = T.currentPhase(t);
    const focusCount = t.phases.filter((p) => p.type === 'focus').length;
    let phaseLabel;
    if (t.finished) phaseLabel = 'Finished';
    else if (phase.type === 'break') phaseLabel = 'Break';
    else phaseLabel = `Focus block ${phase.block} of ${focusCount}`;
    const state = t.finished ? '' : t.running ? ' (running)' : ' (paused)';

    let primary;
    if (t.finished) primary = '';
    else if (t.running) primary = '<button type="button" class="button--primary" data-action="timer-pause">Pause</button>';
    else if (T.remainingMs(t) === phase.minutes * 60_000) {
      primary = `<button type="button" class="button--primary" data-action="timer-start">Start ${phase.type === 'break' ? 'break' : `focus block ${phase.block}`}</button>`;
    } else primary = '<button type="button" class="button--primary" data-action="timer-start">Resume</button>';

    const steps = t.phases.map((p, i) => {
      const label = p.type === 'break' ? `Break ${p.minutes} min` : `Focus ${p.block}: ${p.minutes} min`;
      const done = t.finished || i < t.index;
      const current = !t.finished && i === t.index;
      return `<li class="${done ? 'is-done' : ''}" ${current ? 'aria-current="step"' : ''}>${label}${done ? '<span class="visually-hidden"> (done)</span>' : ''}</li>`;
    }).join('');

    body = `
      <p class="timer-phase" id="timer-phase">${esc(phaseLabel)}${state}</p>
      <p class="timer-clock" role="timer" aria-labelledby="timer-phase" id="timer-clock">${T.formatClock(T.remainingMs(t))}</p>
      <div class="progress" aria-hidden="true"><span id="timer-progress"></span></div>
      <ol class="steps" aria-label="Session steps">${steps}</ol>
      <p class="meta" id="timer-focus-total">Focus time so far: ${T.focusMinutes(t)} min</p>
      ${t.finished ? '<p class="status-ok">Session complete. Log it below.</p>' : ''}
      <div class="button-row">
        ${primary}
        ${t.finished ? '' : `<button type="button" data-action="timer-skip">${phase.type === 'break' ? 'Skip break' : 'End this block early'}</button>`}
        <button type="button" class="button--danger" data-action="timer-discard">Reset timer</button>
      </div>`;
  }

  return `
    <section class="card" aria-labelledby="timer-heading">
      <h2 id="timer-heading">Session timer</h2>
      ${body}
    </section>`;
}

function logFormHtml(ctx) {
  const d = ui.logDraft;
  const timerDate = activeTimer?.date;
  const dateValue = d.date || timerDate || ctx.date;
  const timerMinutes = activeTimer ? T.focusMinutes(activeTimer) : null;
  const minutesValue = d.status === 'skipped' ? '0' : (d.minutes !== '' ? d.minutes : (timerMinutes ?? ''));
  const planned = ctx.kind === 'study' ? ctx.hours * 60 : null;
  const minutesHint = timerMinutes !== null
    ? `Filled in from the timer: ${timerMinutes} focus minutes. Edit it if needed.`
    : planned ? `Planned today: ${planned} min.` : 'Minutes you actually studied.';

  const errors = ui.logErrors.length
    ? `<div class="error-summary" role="alert" tabindex="-1" id="log-errors">
         <h3>Please fix this before saving</h3>
         <ul>${ui.logErrors.map((e) => `<li>${esc(e)}</li>`).join('')}</ul>
       </div>`
    : '';

  const radio = (value, label) => `
    <label class="choice"><input type="radio" name="status" value="${value}" ${d.status === value ? 'checked' : ''}> ${label}</label>`;

  return `
    <form id="log-form" novalidate>
      ${errors}
      <fieldset>
        <legend>How did it go?</legend>
        <div class="choice-group">
          ${radio('done', 'Done')}
          ${radio('partial', 'Partial')}
          ${radio('skipped', 'Skipped')}
        </div>
      </fieldset>
      <div class="field">
        <label for="log-minutes">Minutes studied</label>
        <input id="log-minutes" name="minutes" type="number" inputmode="numeric" min="0" max="${store.MINUTES_MAX}" step="1"
          value="${esc(minutesValue)}" ${d.status === 'skipped' ? 'disabled' : ''} aria-describedby="log-minutes-hint">
        <span class="hint" id="log-minutes-hint">${d.status === 'skipped' ? 'Skipped sessions are logged as 0 minutes.' : esc(minutesHint)}</span>
      </div>
      <div class="field">
        <label for="log-reason">One-line reason${d.status === 'skipped' ? ' (required)' : ' (optional)'}</label>
        <input id="log-reason" name="reason" type="text" maxlength="${store.REASON_MAX}" value="${esc(d.reason)}"
          ${d.status === 'skipped' ? 'aria-required="true"' : ''} aria-describedby="log-reason-hint" autocomplete="off">
        <span class="hint" id="log-reason-hint">Required when you skip. For example: "Sick" or "Client deadline".</span>
      </div>
      <div class="field">
        <label for="log-date">Date</label>
        <input id="log-date" name="date" type="date" value="${esc(dateValue)}" aria-describedby="log-date-hint">
        <span class="hint" id="log-date-hint">Today by default. Change it to log a missed day.</span>
      </div>
      <button type="submit" class="button--primary">Save session</button>
    </form>`;
}

function recentSessionsHtml() {
  const sessions = [...store.getData().sessions]
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt))
    .slice(0, 10);
  if (!sessions.length) return '<p class="meta">No sessions logged yet.</p>';
  return `
    <h3>Recent sessions</h3>
    <ul class="log-list">
      ${sessions.map((s) => `
        <li>
          <span>
            <strong>${esc(formatShort(s.date))}</strong>${s.dayNumber ? ` · Day ${s.dayNumber}` : ''} ·
            ${esc(statusLabel(s.status))} · ${s.minutes} min${s.reason ? ` · ${esc(s.reason)}` : ''}
            ${s.testMode ? '<span class="tag tag--test">Test</span>' : ''}
          </span>
          <button type="button" class="button--small button--danger" data-action="session-delete" data-id="${esc(s.id)}"
            aria-label="Delete the ${esc(statusLabel(s.status).toLowerCase())} session on ${esc(formatShort(s.date))}">Delete</button>
        </li>`).join('')}
    </ul>`;
}

function logHtml(ctx) {
  const studyish = ['study', 'bridge', 'applications'].includes(ctx.kind) || activeTimer;
  const flash = ui.flash ? `<p class="status-ok" id="log-flash" tabindex="-1">${esc(ui.flash)}</p>` : '';
  const form = studyish
    ? logFormHtml(ctx)
    : `<details ${ui.logErrors.length ? 'open' : ''}><summary>Log a session anyway</summary>${logFormHtml(ctx)}</details>`;
  return `
    <section class="card" aria-labelledby="log-heading">
      <h2 id="log-heading">Log a session</h2>
      ${flash}
      ${form}
      ${recentSessionsHtml()}
    </section>`;
}

function todayView() {
  const ctx = getDayContext(today(), store.getSettings());
  const studyish = ['study', 'bridge', 'applications'].includes(ctx.kind);
  return [
    headerHtml(ctx),
    studyish ? retrievalHtml() : '',
    itemsHtml(ctx),
    timerHtml(ctx),
    logHtml(ctx),
  ].join('');
}

// ─── Settings view ───────────────────────────────────────────────────────────

function settingsView() {
  const s = store.getSettings();
  const testData = store.countTestData();
  const testCount = Object.values(testData).reduce((a, b) => a + b, 0);
  const backup = store.getBackupInfo();
  const summaryText = (sum) =>
    [plural(sum.sessions, 'session', 'sessions'), plural(sum.cards, 'card', 'cards'),
      plural(sum.cardReviews, 'card rating', 'card ratings'), plural(sum.tallies, 'scorecard entry', 'scorecard entries'),
      plural(sum.artifacts, 'artifact', 'artifacts'),
      plural(sum.people, 'person', 'people'), plural(sum.reviews, 'review', 'reviews')].join(', ');
  const tzInfo = timeZoneInfo();
  const when = (iso) => new Date(iso).toLocaleString('en-CA', { timeZone: 'America/Vancouver', dateStyle: 'medium', timeStyle: 'short' });

  const checks = ui.checkResults
    ? (() => {
        const failed = ui.checkResults.filter((r) => !r.pass);
        return `
          <p class="${failed.length ? '' : 'status-ok'}" id="check-summary" tabindex="-1">
            ${failed.length ? `<strong>${failed.length} of ${ui.checkResults.length} checks failed.</strong>` : `All ${ui.checkResults.length} checks passed.`}
          </p>
          <p class="${tzInfo.current ? 'meta' : 'note'}">${tzInfo.current ? '' : '<strong>Note:</strong> '}${esc(tzInfo.text)}</p>
          <details ${failed.length ? 'open' : ''}>
            <summary>Show each check</summary>
            <ul class="check-results">
              ${ui.checkResults.map((r) => `<li>${r.pass ? 'Pass' : '<strong>Fail</strong>'}: ${esc(r.name)}${r.pass ? '' : ` (got ${esc(r.actual)}, expected ${esc(r.expected)})`}</li>`).join('')}
            </ul>
          </details>`;
      })()
    : '';

  const importPanel = ui.importPreview
    ? `
      <div class="note note--gate" id="import-preview" tabindex="-1" role="region" aria-label="Import preview">
        <p><strong>Ready to import.</strong> The file contains ${esc(summaryText(ui.importPreview.summary))}${ui.importPreview.summary.exportedAt ? ` (exported ${esc(when(ui.importPreview.summary.exportedAt))})` : ''}.</p>
        <p><strong>Importing replaces all your current data</strong> (${esc(summaryText(store.summarize(store.getData())))}). A copy of your current data is kept in this browser, and you can restore it below.</p>
        <div class="button-row">
          <button type="button" class="button--danger" data-action="import-confirm">Replace my data with this file</button>
          <button type="button" data-action="import-cancel">Cancel</button>
        </div>
      </div>`
    : '';

  const importErrors = ui.importProblems.length
    ? `<div class="error-summary" role="alert" tabindex="-1" id="import-errors">
         <h3>This file was not imported</h3>
         <ul>${ui.importProblems.map((p) => `<li>${esc(p)}</li>`).join('')}</ul>
         <p>Your data has not changed.</p>
       </div>`
    : '';

  return `
    <h1 id="day-heading" tabindex="-1">Settings and data</h1>

    <section class="card" aria-labelledby="test-heading">
      <h2 id="test-heading">Test date (for testing only)</h2>
      <p class="meta">Off by default. While it's on, the app shows the plan, due flashcards and scorecard for the date you choose, a banner appears at the top of every page, and anything you log, rate or tick is marked as test data. The timer still runs on the real clock.</p>
      <label class="check" for="test-enabled">
        <input type="checkbox" id="test-enabled" ${s.testDate.enabled ? 'checked' : ''}>
        <span>Use a test date instead of today</span>
      </label>
      <div class="field">
        <label for="test-date">Test date</label>
        <input type="date" id="test-date" value="${esc(s.testDate.date || PLAN_START)}" aria-describedby="test-date-hint">
        <span class="hint" id="test-date-hint">Applies only while the box above is checked. Real today in Vancouver: ${esc(formatLong(vancouverDate()))}.</span>
      </div>
      ${testCount ? `
        <p>Test data saved: ${plural(testData.sessions, 'session', 'sessions')}, ${plural(testData.cardReviews, 'card rating', 'card ratings')}, ${plural(testData.tallies, 'scorecard entry', 'scorecard entries')} and ${plural(testData.weekChecks, 'ticked item', 'ticked items')}.</p>
        <button type="button" class="button--danger" data-action="delete-test-data">Delete test data</button>` : ''}
      <h3>Date and scheduling checks</h3>
      <p class="meta">Checks that the date changes at midnight Vancouver time, every plan date, the weekly hour budgets, flashcard scheduling and when each week's cards unlock. Nothing is changed.</p>
      <button type="button" data-action="run-checks">Run date checks</button>
      ${checks}
    </section>

    <section class="card" aria-labelledby="plan-heading">
      <h2 id="plan-heading">Plan options</h2>
      <label class="check" for="swap-weeks">
        <input type="checkbox" id="swap-weeks" ${s.swapWeeks2and5 ? 'checked' : ''} aria-describedby="swap-hint">
        <span>Swap weeks 2 and 5</span>
      </label>
      <span class="hint" id="swap-hint">From the roadmap: "If your Tailscale process is active, swap this week with week 2." Dates, day numbers and holidays stay the same; only the content moves.</span>
    </section>

    <section class="card" aria-labelledby="theme-heading">
      <h2 id="theme-heading">Appearance</h2>
      <fieldset>
        <legend>Theme</legend>
        <div class="choice-group">
          ${['system', 'light', 'dark'].map((t) => `
            <label class="choice"><input type="radio" name="theme" value="${t}" ${s.theme === t ? 'checked' : ''}> ${{ system: 'Match my device', light: 'Light', dark: 'Dark' }[t]}</label>`).join('')}
        </div>
      </fieldset>
    </section>

    <section class="card" aria-labelledby="data-heading">
      <h2 id="data-heading">Your data</h2>
      <p>Your data is saved in this browser only. Nothing is sent anywhere. Clearing site data, or opening the app in another browser or at a different address, starts empty, so export now and then.</p>
      <p class="meta">Currently saved: ${esc(summaryText(store.summarize(store.getData())))}. Last export: ${s.lastExportedAt ? esc(when(s.lastExportedAt)) : 'never'}.</p>
      ${ui.dataMessage ? `<p class="status-ok" id="data-message" tabindex="-1">${esc(ui.dataMessage)}</p>` : ''}
      <div class="button-row">
        <button type="button" class="button--primary" data-action="export">Export all data (JSON)</button>
      </div>

      <h3>Import</h3>
      <div class="field">
        <label for="import-file">Choose an exported JSON file</label>
        <input type="file" id="import-file" accept="application/json,.json" aria-describedby="import-hint">
        <span class="hint" id="import-hint">You'll see what's in the file and confirm before anything is replaced.</span>
      </div>
      ${importErrors}
      ${importPanel}

      ${backup ? `
        <h3>Undo the last import</h3>
        <p class="meta">Saved ${esc(when(backup.savedAt))}: ${esc(summaryText(backup.summary))}.</p>
        <button type="button" data-action="restore-backup">Restore data from before the last import</button>` : ''}
    </section>`;
}

// ─── Render ──────────────────────────────────────────────────────────────────

function render({ focus } = {}) {
  const activeId = document.activeElement?.id;
  applyTheme();
  renderBanners();
  document.querySelectorAll('[data-route]').forEach((a) => {
    if (a.dataset.route === route) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
  renderedDate = today();
  const views = {
    today: todayView, week: weekView, cards: flashcardsView, scorecard: scorecardView, settings: settingsView,
  };
  mainEl.innerHTML = views[route]();
  updateTimerDisplay();

  // `focus` may list fallbacks ("#a, #b"): use the first one that exists, in that order.
  const target = focus
    ? focus.split(',').map((sel) => document.querySelector(sel.trim())).find(Boolean)
    : activeId ? document.getElementById(activeId) : null;
  target?.focus();
}

function updateTimerDisplay() {
  const clock = document.getElementById('timer-clock');
  if (activeTimer && clock) {
    const remaining = T.remainingMs(activeTimer);
    clock.textContent = T.formatClock(remaining);
    const total = T.currentPhase(activeTimer).minutes * 60_000;
    const bar = document.getElementById('timer-progress');
    if (bar) bar.style.width = activeTimer.finished ? '100%' : `${((total - remaining) / total) * 100}%`;
    const focusTotal = document.getElementById('timer-focus-total');
    if (focusTotal) focusTotal.textContent = `Focus time so far: ${T.focusMinutes(activeTimer)} min`;
  }
  if (activeTimer?.running) {
    const label = T.currentPhase(activeTimer).type === 'break' ? 'Break' : 'Focus';
    document.title = `${T.formatClock(T.remainingMs(activeTimer))} ${label} · ${BASE_TITLE}`;
  } else {
    document.title = BASE_TITLE;
  }
}

function tick() {
  if (today() !== renderedDate) {
    render();
    return;
  }
  if (!activeTimer) return;
  const events = T.advance(activeTimer);
  if (events.length) {
    T.saveTimer(activeTimer);
    const messages = events.map((e) => {
      if (e.ended) return e.ended.type === 'break' ? 'Break over.' : `Focus block ${e.ended.block} finished.`;
      if (e.started.type === 'break') return `Break started: ${e.started.minutes} minutes.`;
      return `Ready for focus block ${e.started.block}. Press Start when you're ready.`;
    });
    if (activeTimer.finished) messages.push('Session complete. You can log it now.');
    announce(messages.join(' '));
    if (route === 'today') render();
  } else {
    updateTimerDisplay();
  }
}

// ─── Actions ─────────────────────────────────────────────────────────────────

function readLogForm(form) {
  const status = form.querySelector('input[name="status"]:checked')?.value ?? '';
  const minutesRaw = form.querySelector('#log-minutes').value.trim();
  return {
    status,
    minutes: status === 'skipped' ? 0 : minutesRaw === '' ? NaN : Number(minutesRaw),
    reason: form.querySelector('#log-reason').value,
    date: form.querySelector('#log-date').value,
  };
}

function saveLog(form) {
  const values = readLogForm(form);
  ui.flash = null;
  const result = store.addSession({
    date: values.date,
    dayNumber: isValidDateString(values.date) ? planDayFor(values.date) : null,
    minutes: values.minutes,
    status: values.status,
    reason: values.reason,
    testMode: testMode(),
  });
  if (!result.ok) {
    ui.logErrors = result.problems;
    render({ focus: '#log-errors' });
    return;
  }
  const s = result.session;
  if (activeTimer && activeTimer.date === s.date) {
    activeTimer = null;
    T.saveTimer(null);
  }
  ui.logErrors = [];
  ui.logDraft = { status: '', minutes: '', reason: '', date: '' };
  ui.flash = `Saved: ${statusLabel(s.status)}, ${s.minutes} min on ${formatShort(s.date)}${s.dayNumber ? ` (Day ${s.dayNumber})` : ''}${s.testMode ? ', marked as a test session' : ''}.`
    + (result.saved ? '' : ' Warning: this browser blocked saving.');
  announce(ui.flash);
  render({ focus: '#log-flash' });
}

function downloadExport() {
  const blob = new Blob([store.exportJson()], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = store.exportFileName(vancouverDate());
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  store.updateSettings({ lastExportedAt: new Date().toISOString() });
  ui.dataMessage = `Exported ${a.download}.`;
  render({ focus: '#data-message' });
}

const actions = {
  'test-off': () => {
    store.updateSettings({ testDate: { ...store.getSettings().testDate, enabled: false } });
    announce('Test date turned off. Showing today.');
    render({ focus: '#day-heading' });
  },
  'timer-start-new': () => {
    const ctx = getDayContext(today(), store.getSettings());
    const blocks = Number(document.getElementById('timer-blocks')?.value) || defaultBlocks(ctx);
    activeTimer = T.createTimer(ctx.date, blocks);
    T.start(activeTimer);
    T.saveTimer(activeTimer);
    announce(`Focus block 1 started: ${T.FOCUS_MIN} minutes.`);
    render({ focus: '[data-action="timer-pause"]' });
  },
  'timer-start': () => {
    T.start(activeTimer);
    T.saveTimer(activeTimer);
    announce(T.currentPhase(activeTimer).type === 'break' ? 'Break started.' : 'Timer running.');
    render({ focus: '[data-action="timer-pause"]' });
  },
  'timer-pause': () => {
    T.pause(activeTimer);
    T.saveTimer(activeTimer);
    announce('Timer paused.');
    render({ focus: '[data-action="timer-start"]' });
  },
  'timer-skip': () => {
    T.skipPhase(activeTimer);
    T.saveTimer(activeTimer);
    announce(activeTimer.finished ? 'Session complete. You can log it now.' : 'Moved to the next step. Press Start when ready.');
    render({ focus: activeTimer.finished ? '#log-heading' : '[data-action="timer-start"]' });
  },
  'timer-discard': () => {
    if (!window.confirm('Reset the timer? Focus time on it will not be logged.')) return;
    activeTimer = null;
    T.saveTimer(null);
    ui.logDraft.date = '';
    announce('Timer reset.');
    render({ focus: '#timer-heading' });
  },
  'session-delete': (el) => {
    const s = store.getData().sessions.find((x) => x.id === el.dataset.id);
    if (!s) return;
    if (!window.confirm(`Delete the ${statusLabel(s.status).toLowerCase()} session on ${formatShort(s.date)} (${s.minutes} min)?`)) return;
    store.deleteSession(s.id);
    ui.flash = null;
    announce('Session deleted.');
    render({ focus: '#log-heading' });
  },
  'delete-test-data': () => {
    const n = store.countTestData();
    const what = `${plural(n.sessions, 'test session', 'test sessions')}, ${plural(n.cardReviews, 'card rating', 'card ratings')}, ${plural(n.tallies, 'scorecard entry', 'scorecard entries')} and ${plural(n.weekChecks, 'ticked item', 'ticked items')}`;
    if (!window.confirm(`Delete ${what}? Real data is kept, and card schedules go back to what your real ratings give.`)) return;
    store.deleteTestData();
    ui.dataMessage = `Deleted ${what}.`;
    render({ focus: '#test-heading' });
  },
  'run-checks': () => {
    ui.checkResults = runDateChecks();
    render({ focus: '#check-summary' });
  },
  export: downloadExport,
  'import-confirm': () => {
    const result = store.replaceWithImport(ui.importPreview.doc);
    ui.importPreview = null;
    if (!result.ok) {
      ui.importProblems = result.problems;
      render({ focus: '#import-errors' });
      return;
    }
    activeTimer = T.loadTimer();
    ui.dataMessage = 'Import complete. Your previous data is kept as a backup below.';
    announce(ui.dataMessage);
    render({ focus: '#data-message' });
  },
  'import-cancel': () => {
    ui.importPreview = null;
    announce('Import cancelled. Nothing changed.');
    render({ focus: '#import-file' });
  },
  'restore-backup': () => {
    if (!window.confirm('Restore the data from before the last import? Your current data becomes the new backup, so you can switch back.')) return;
    store.restoreBackup();
    ui.dataMessage = 'Restored the data from before the last import.';
    render({ focus: '#data-message' });
  },
};

mainEl.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  if (actions[el.dataset.action]) actions[el.dataset.action](el);
  else {
    const handler = cardActions[el.dataset.action] ?? weekActions[el.dataset.action] ?? scorecardActions[el.dataset.action];
    if (!handler) return;
    const focus = handler(el);
    render(focus ? { focus } : {});
  }
});
bannersEl.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action]');
  if (el && actions[el.dataset.action]) actions[el.dataset.action](el);
});

mainEl.addEventListener('submit', (e) => {
  if (e.target.id === 'log-form') {
    e.preventDefault();
    saveLog(e.target);
  } else if (e.target.id === 'card-form') {
    e.preventDefault();
    render({ focus: submitCardForm(e.target) });
  } else if (e.target.id === 'tally-form') {
    e.preventDefault();
    render({ focus: submitTallyForm(e.target) });
  }
});

// Keep the log form's typed values across re-renders.
mainEl.addEventListener('input', (e) => {
  const map = { 'log-minutes': 'minutes', 'log-reason': 'reason', 'log-date': 'date' };
  if (map[e.target.id]) ui.logDraft[map[e.target.id]] = e.target.value;
  handleCardInput(e.target);
  handleTallyInput(e.target);
});

mainEl.addEventListener('change', async (e) => {
  const t = e.target;
  const cardFocus = handleCardChange(t) ?? handleWeekChange(t);
  if (cardFocus) {
    render({ focus: cardFocus });
  } else if (t.name === 'status' && t.closest('#log-form')) {
    ui.logDraft.status = t.value;
    render({ focus: `input[name="status"][value="${t.value}"]` });
  } else if (t.name === 'theme') {
    store.updateSettings({ theme: t.value });
    render({ focus: `input[name="theme"][value="${t.value}"]` });
  } else if (t.id === 'test-enabled') {
    const date = document.getElementById('test-date').value || PLAN_START;
    store.updateSettings({ testDate: { enabled: t.checked, date } });
    ui.logDraft.date = '';
    announce(t.checked ? `Test date on: ${formatLong(date)}.` : 'Test date off.');
    render({ focus: '#test-enabled' });
  } else if (t.id === 'test-date') {
    if (!isValidDateString(t.value)) return;
    store.updateSettings({ testDate: { ...store.getSettings().testDate, date: t.value } });
    ui.logDraft.date = '';
    render({ focus: '#test-date' });
  } else if (t.id === 'swap-weeks') {
    store.updateSettings({ swapWeeks2and5: t.checked });
    render({ focus: '#swap-weeks' });
  } else if (t.id === 'import-file') {
    const file = t.files?.[0];
    ui.importPreview = null;
    ui.importProblems = [];
    ui.dataMessage = null;
    if (!file) return;
    const parsed = store.parseImport(await file.text());
    if (parsed.ok) {
      ui.importPreview = parsed;
      render({ focus: '#import-preview' });
    } else {
      ui.importProblems = parsed.problems;
      render({ focus: '#import-errors' });
    }
  }
});

// ─── Routing and start-up ────────────────────────────────────────────────────

function routeFromHash() {
  return { '#settings': 'settings', '#cards': 'cards', '#week': 'week', '#scorecard': 'scorecard' }[location.hash] ?? 'today';
}

window.addEventListener('hashchange', () => {
  route = routeFromHash();
  ui.flash = null;
  ui.dataMessage = null;
  resetCardMessages();
  resetScorecardMessages();
  resetWeekView();
  render({ focus: '#day-heading' });
});

document.addEventListener('visibilitychange', () => {
  if (!document.hidden) tick();
});

store.load();
// Catch the timer up on anything that happened while the page was closed.
if (activeTimer && T.advance(activeTimer).length) T.saveTimer(activeTimer);
route = routeFromHash();
render();
setInterval(tick, 1000);
