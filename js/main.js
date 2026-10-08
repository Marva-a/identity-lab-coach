// UI: renders the views (Today, Week, Flashcards, Evidence, People, Scorecard, Settings) and wires up events.
// Views are plain HTML strings; events use delegation on <main>.
import * as store from './store.js';
import * as T from './timer.js';
import { vancouverDate, formatLong, formatShort, isValidDateString } from './dates.js';
import { getDayContext, planDayFor } from './plan.js';
import { PLAN_START, ITEM_KIND_LABELS, BLOCK_LABELS } from './plan-data.js';
import { runDateChecks, timeZoneInfo } from './selftest.js';
import { esc, today, testMode, announce, plural, downloadFile, nav } from './ui.js';
import {
  retrievalHtml, retrievalRemaining, flashcardsView, cardActions, submitCardForm, handleCardChange, handleCardInput, resetCardMessages,
} from './flashcards.js';
import { weekView, weekActions, handleWeekChange, resetWeekView, itemFlagsHtml } from './week.js';
import {
  scorecardView, applicationsView, scorecardActions, submitTallyForm, handleTallyInput, resetScorecardMessages,
} from './scorecard.js';
import {
  evidenceView, evidenceActions, submitEvidenceForm, submitPublishForm, handleEvidenceChange, handleEvidenceInput,
  resetEvidenceView,
} from './evidence.js';
import {
  libraryView, resourceActions, todayResourcesHtml, submitResourceForm, submitLinkForm, readResourceFile, handleResourceChange,
  handleResourceInput, handleResourceToggle, resetResourceView, flushResourceNotes, setContentRefresh,
} from './resources.js';
import {
  peopleView, peopleActions, todayFollowUpsHtml, submitPersonForm, submitInteractionForm, handlePeopleInput,
  selectPersonOnNavigate, resetPeopleView,
} from './people.js';

import { planTopHtml, courseActions } from './course.js';
import { resolveHash } from './routes.js';
import { todayLessonHtml, lessonPageView, flushLessonAnswers, handleLessonInput, handleLessonClick } from './lessons.js';
import { STEPS, stepIndex, nextStep, previousStep, loadFlow, saveFlow } from './session-flow.js';
import * as AB from './autobackup.js';

const mainEl = document.getElementById('main');
const bannersEl = document.getElementById('banners');
const BASE_TITLE = 'Identity Lab Coach';

let route = 'today';
let section = null; // the part of Learn or Proof being shown
let testsOpen = false; // the collapsed Testing part of Settings
let activeTimer = T.loadTimer();
let renderedDate = null;
let flow = null; // the guided session in progress: { date, step }

// Transient UI state (not saved).
const ui = {
  logDraft: { status: '', minutes: '', reason: '', date: '' },
  logErrors: [],
  flash: null,
  importPreview: null,
  importProblems: [],
  dataMessage: null,
  checkResults: null,
  flowErrors: [],
  snapshots: [], // daily snapshots kept in this browser (loaded when Settings opens)
  backupMessage: null,
  logOpen: false, // the quick "Log time" form on Today
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

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
        <p><strong>Test date on.</strong> Showing ${esc(formatLong(today()))} instead of today. Anything you log now is marked as test data.</p>
        <button type="button" class="button--small" data-action="test-off">Turn off test date</button>
      </div>`);
  }
  const notice = store.getSettings().migrationNotice;
  if (notice) {
    parts.push(`
      <div class="banner banner--info" role="region" aria-label="Your data was converted">
        <p><strong>Your data was converted.</strong> ${esc(notice)}</p>
        <button type="button" class="button--small" data-action="dismiss-notice">Dismiss</button>
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
  return `
    <li class="${store.isOptionalItem(item) ? 'is-optional' : ''}">
      ${showKind ? `<span class="item-kind">${esc(ITEM_KIND_LABELS[item.kind])}</span>` : ''}
      <span class="item-text">${esc(item.text)}</span>${itemFlagsHtml(item)}
    </li>`;
}

function headerHtml(ctx, { log = true } = {}) {
  switch (ctx.kind) {
    case 'before': {
      const p = ctx.preview;
      return `
        <section class="card" aria-labelledby="day-heading">
          <h1 id="day-heading" tabindex="-1">Starts ${esc(formatMonthDay(PLAN_START))} (in ${plural(ctx.daysUntilStart, 'day', 'days')})</h1>
          <p class="meta">Day 1 · ${p.hours} h planned${p.holiday ? ` · ${esc(p.holiday)}` : ''}</p>
          <p class="focus-line">${esc(p.focus)}</p>
          <h2>Before you start</h2>
          <ul class="before-list">
            <li>Install Docker Desktop. Day 1 checks that it works.</li>
            <li>Set aside Mon–Sat study time. Sunday is a rest day.</li>
            <li>Choose a backup folder in <a href="#settings">Settings</a>, once, so you never have to remember to export.</li>
          </ul>
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
          ${ctx.conditional ? `<p class="meta">Optional: ${esc(ctx.conditional)}.</p>` : ''}
          ${ctx.gate ? `<p class="note note--gate"><strong>Gate:</strong> ${esc(ctx.gate)}</p>` : ''}
          ${log ? logTimeHtml(ctx) : ''}
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
          ${log ? logTimeHtml(ctx) : ''}
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
          ${log ? logTimeHtml(ctx) : ''}
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

/** "June 3" style, for the line that says when the plan starts: "Monday, October 12". */
function formatMonthDay(date) {
  return formatLong(date).replace(/,\s*\d{4}$/, '');
}

/** The one main button on Today, and the quick form it opens. */
function logTimeHtml(ctx) {
  const open = ui.logOpen;
  return `
    <div class="log-time">
      <button type="button" class="button--primary" data-action="log-time" aria-expanded="${open ? 'true' : 'false'}" aria-controls="log-time-panel">Log time</button>
      <div id="log-time-panel" ${open ? '' : 'hidden'}>${open ? flowWrapUpHtml(ctx, { heading: false }) : ''}</div>
    </div>`;
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

// ─── Guided daily session ────────────────────────────────────────────────────
// Warm-up (flashcards), focus (do this next + timer), wrap-up (one-tap log). It only
// reuses the sections the full Today page already has; "Show the whole page" leaves it.

const isStudyish = (ctx) => ['study', 'bridge', 'applications'].includes(ctx.kind);

function activeFlow(ctx) {
  return flow && flow.date === today() && isStudyish(ctx) ? flow : null;
}

function setFlow(next) {
  flow = next;
  saveFlow(next);
}

function startFlow() {
  setFlow({ date: today(), step: retrievalRemaining() > 0 ? 'warmup' : 'focus' });
}

function flowStartCardHtml(ctx) {
  const logged = store.sessionsOn(ctx.date).reduce((n, s) => n + s.minutes, 0);
  const has = store.sessionsOn(ctx.date).length > 0;
  return `
    <section class="card card--notice" aria-labelledby="flow-heading">
      <h2 id="flow-heading" tabindex="-1">Today’s session</h2>
      ${has
    ? `<p class="status-ok">${ui.flash ? esc(ui.flash) : `You have logged ${plural(logged, 'minute', 'minutes')} today.`}</p>`
    : '<p>A few flashcards to warm up, then focus time with the timer, then log it in one tap.</p>'}
      <div class="button-row"><button type="button" data-action="flow-start">${has ? 'Start another session' : 'Start today’s session'}</button></div>
      <p class="meta">Prefer to see everything at once? It is all below.</p>
    </section>`;
}

function flowWrapUpHtml(ctx, { heading = true } = {}) {
  const timerMinutes = activeTimer && activeTimer.date === ctx.date ? T.focusMinutes(activeTimer) : null;
  const planned = ctx.kind === 'study' ? ctx.hours * 60 : null;
  const errors = ui.flowErrors.length
    ? `<div class="error-summary" role="alert" tabindex="-1" id="flow-errors">
         <h3>Please fix this before saving</h3>
         <ul>${ui.flowErrors.map((e) => `<li>${esc(e)}</li>`).join('')}</ul>
       </div>`
    : '';
  return `
    <section ${heading ? 'class="card"' : 'class="log-quick"'} aria-labelledby="wrap-heading">
      <h2 id="wrap-heading" ${heading ? '' : 'class="visually-hidden"'}>Log your session</h2>
      <form id="flow-log-form" novalidate>
        ${errors}
        <div class="field">
          <label for="flow-minutes">Minutes studied</label>
          <input id="flow-minutes" name="minutes" type="number" inputmode="numeric" min="0" max="${store.MINUTES_MAX}" step="1"
            value="${timerMinutes ? esc(timerMinutes) : ''}" aria-describedby="flow-minutes-hint">
          <span class="hint" id="flow-minutes-hint">${timerMinutes
    ? `Filled in from the timer: ${timerMinutes} focus minutes. Change it if that is not right.`
    : `The timer was not used.${planned ? ` Planned today: ${planned} min.` : ''} Type what you actually studied.`}</span>
        </div>
        <div class="button-row">
          <button type="submit" name="status" value="done" class="button--primary">Log as done</button>
          <button type="submit" name="status" value="partial">Log as partial</button>
        </div>
        <details>
          <summary>Skipping today?</summary>
          <div class="field">
            <label for="flow-reason">One-line reason (required)</label>
            <input id="flow-reason" name="reason" type="text" maxlength="${store.REASON_MAX}" autocomplete="off">
          </div>
          <button type="submit" name="status" value="skipped">Log as skipped</button>
        </details>
      </form>
    </section>`;
}

function flowView(ctx, f) {
  const idx = stepIndex(f.step);
  const stepper = `
    <ol class="flow-steps" aria-label="Today’s session, step ${idx + 1} of ${STEPS.length}">
      ${STEPS.map((st, i) => `<li ${i === idx ? 'aria-current="step"' : ''} class="${i < idx ? 'is-done' : ''}">${i + 1}. ${esc(st.label)}${i < idx ? '<span class="visually-hidden"> (done)</span>' : ''}</li>`).join('')}
    </ol>`;
  const body = f.step === 'warmup'
    ? retrievalHtml()
    : f.step === 'focus'
      ? [todayResourcesHtml(ctx), itemsHtml(ctx), timerHtml(ctx)].join('')
      : flowWrapUpHtml(ctx);
  const back = idx > 0 ? `<button type="button" data-action="flow-back">← ${esc(STEPS[idx - 1].label)}</button>` : '';
  const next = idx < STEPS.length - 1 ? `<button type="button" class="button--primary" data-action="flow-next">Next: ${esc(STEPS[idx + 1].label)} →</button>` : '';
  return [
    headerHtml(ctx, { log: false }),
    `<section class="card card--flow" aria-labelledby="flow-step-heading">
       ${stepper}
       <h2 id="flow-step-heading" tabindex="-1">${esc(STEPS[idx].title)}</h2>
       <div class="button-row">${back}${next}<button type="button" class="button--small" data-action="flow-exit">Show the whole page</button></div>
     </section>`,
    body,
  ].join('');
}

// ─── Backup notices on Today ────────────────────────────────────────────────

const PROMPT_FLAG = 'identity-lab-coach:backup-prompt-dismissed';
function promptDismissed() {
  try { return localStorage.getItem(PROMPT_FLAG) === '1'; } catch { return false; }
}

/** A gentle note on Today only when automatic backups need you. It never blocks anything. */
function backupNoticeHtml() {
  if (!AB.supportsFolder() || store.getLoadProblem()) return '<div id="backup-notice"></div>';
  const s = AB.status();
  let inner = '';
  if (s.folder === 'needs-permission') {
    inner = `<h2 id="backup-heading" tabindex="-1">Automatic backups are paused</h2>
      <p>After a browser restart, one click lets the app save to “${esc(s.folderName ?? 'your backup folder')}” again.</p>
      <div class="button-row"><button type="button" class="button--primary" data-action="backup-resume">Resume automatic backups</button></div>`;
  } else if (s.folder === 'error') {
    inner = `<h2 id="backup-heading" tabindex="-1">Automatic backups hit a problem</h2>
      <p>${esc(s.folderError || 'The backup folder could not be written to.')} Your data is still saved in this browser, and daily snapshots continue.</p>
      <div class="button-row"><button type="button" class="button--primary" data-action="backup-choose-folder">Choose the folder again</button></div>`;
  } else if (s.folder === 'none' && !promptDismissed()) {
    inner = `<h2 id="backup-heading" tabindex="-1">Set up automatic backups, once</h2>
      <p>Choose a folder (for example in Documents or iCloud Drive) and the app will keep a backup file there by itself, so you never have to remember to export.</p>
      <div class="button-row">
        <button type="button" class="button--primary" data-action="backup-choose-folder">Choose a backup folder</button>
        <button type="button" data-action="backup-prompt-dismiss">Not now</button>
      </div>`;
  }
  return `<div id="backup-notice">${inner ? `<section class="banner-inline" aria-labelledby="backup-heading">${inner}</section>` : ''}</div>`;
}

function todayView() {
  const ctx = getDayContext(today(), store.getSettings());
  const studyish = isStudyish(ctx);
  const f = activeFlow(ctx);
  if (f) return flowView(ctx, f);
  if (ctx.kind === 'before') return [headerHtml(ctx), backupNoticeHtml(), todayFollowUpsHtml()].join('');
  return [
    headerHtml(ctx),
    backupNoticeHtml(),
    todayLessonHtml(ctx),
    studyish ? flowStartCardHtml(ctx) : '',
    todayFollowUpsHtml(),
    studyish ? retrievalHtml() : '',
    todayResourcesHtml(ctx),
    itemsHtml(ctx),
    timerHtml(ctx),
    logHtml(ctx),
  ].join('');
}

// ─── Plan, Learn and Proof ───────────────────────────────────────────────────

/** The switcher inside Learn and Proof. */
function subnavHtml(place, label, items) {
  return `
    <nav aria-label="${esc(label)}">
      <ul class="subnav">
        ${items.map(([id, text]) => `<li><a href="#${place}/${id}" ${section === id ? 'aria-current="page"' : ''}>${esc(text)}</a></li>`).join('')}
      </ul>
    </nav>`;
}

function planView() {
  return planTopHtml() + weekView();
}

function learnView() {
  return subnavHtml('learn', 'Learn sections', [['library', 'Library'], ['cards', 'Flashcards']])
    + (section === 'cards' ? flashcardsView() : libraryView());
}

function proofView() {
  const body = section === 'people' ? peopleView() : section === 'applications' ? applicationsView() : evidenceView();
  return subnavHtml('proof', 'Proof sections', [['evidence', 'Evidence'], ['people', 'People'], ['applications', 'Applications']]) + body;
}

// ─── Settings view ───────────────────────────────────────────────────────────

/** The "Automatic backups" card in Settings. It is redrawn by itself when a backup finishes. */
function backupPanelHtml() {
  const s = AB.status();
  const when = (iso) => new Date(iso).toLocaleString('en-CA', { timeZone: 'America/Vancouver', dateStyle: 'medium', timeStyle: 'short' });
  const folderText = {
    none: AB.supportsFolder() ? 'No folder chosen yet.' : 'Not available in this browser (Chrome, Edge, Brave and Arc can do it).',
    ready: `Saving to “${esc(s.folderName ?? 'your folder')}”.${s.lastFileAt ? ` Last written ${esc(when(s.lastFileAt))}` : ''}`,
    'needs-permission': `“${esc(s.folderName ?? 'Your folder')}” needs one click to be allowed again.`,
    error: `Problem: ${esc(s.folderError || 'the folder could not be written to')}.`,
  }[s.folder];
  const folderButtons = !AB.supportsFolder() ? '' : s.folder === 'none' || s.folder === 'error'
    ? '<button type="button" class="button--primary" data-action="backup-choose-folder">Choose a backup folder</button>'
    : `${s.folder === 'needs-permission' ? '<button type="button" class="button--primary" data-action="backup-resume">Resume automatic backups</button>' : ''}
       <button type="button" data-action="backup-stop">Stop saving to the folder</button>`;
  const snaps = ui.snapshots;
  return `
    <section class="card" id="backup-panel" aria-labelledby="autobackup-heading">
      <h2 id="autobackup-heading" tabindex="-1">Automatic backups</h2>
      <p>Your data is saved in this browser as you work. These backups happen by themselves, so you do not have to remember to export.</p>
      <dl class="facts">
        <div><dt>Storage protection</dt><dd>${s.persisted === true
    ? 'On: the browser will not clear your data to free up space.'
    : s.persisted === false
      ? `Off. If this device runs low on space, the browser is allowed to clear this app's data. Your daily snapshots and backup folder still protect you. You can ask the browser to protect it; it may say no. <button type="button" class="button--small" data-action="backup-protect">Ask the browser to protect it</button>`
      : 'Not known yet.'}</dd></div>
        <div><dt>Daily snapshots</dt><dd>${snaps.length ? `${plural(snaps.length, 'day', 'days')} kept inside this browser (the newest 14). Latest: ${esc(formatShort(snaps[0].date))}.` : 'None yet. The first one is taken a moment after you open the app.'}</dd></div>
        <div><dt>Backup folder</dt><dd>${folderText}</dd></div>
      </dl>
      ${ui.backupMessage ? `<p class="status-ok" id="backup-message" tabindex="-1">${esc(ui.backupMessage)}</p>` : ''}
      <div class="button-row">
        ${folderButtons}
        <button type="button" data-action="backup-now">Back up now</button>
      </div>
      ${snaps.length ? `
        <details>
          <summary>Restore from a daily snapshot</summary>
          <p class="meta">Choosing one shows what it contains first. Nothing is replaced until you confirm, and your current data is kept as a backup.</p>
          <ul class="log-list">
            ${snaps.map((sn) => `
              <li>
                <span><strong>${esc(formatShort(sn.date))}</strong> · saved ${esc(when(sn.savedAt))} · ${Math.max(1, Math.round(sn.bytes / 1024))} KB</span>
                <button type="button" class="button--small" data-action="backup-restore" data-date="${esc(sn.date)}" aria-label="Restore the snapshot from ${esc(formatShort(sn.date))}">Restore…</button>
              </li>`).join('')}
          </ul>
        </details>` : ''}
    </section>`;
}

/** Redraws only the backup card and the Today note, so a finished backup never disturbs what you are doing. */
function refreshBackupUi() {
  const panel = document.getElementById('backup-panel');
  if (panel) panel.outerHTML = backupPanelHtml();
  const notice = document.getElementById('backup-notice');
  if (notice) notice.outerHTML = backupNoticeHtml();
}

async function loadSnapshots() {
  ui.snapshots = await AB.listSnapshots();
  refreshBackupUi();
}

function settingsView() {
  const s = store.getSettings();
  const testData = store.countTestData();
  const testCount = Object.values(testData).reduce((a, b) => a + b, 0);
  const backup = store.getBackupInfo();
  const summaryText = (sum) =>
    [plural(sum.sessions, 'session', 'sessions'), plural(sum.cards, 'card', 'cards'),
      plural(sum.cardReviews, 'card rating', 'card ratings'), plural(sum.tallies, 'quick entry', 'quick entries'),
      plural(sum.artifacts, 'evidence item', 'evidence items'), plural(sum.people, 'person', 'people'),
      plural(sum.interactions ?? 0, 'interaction', 'interactions'), plural(sum.resources ?? 0, 'resource', 'resources'),
      plural(sum.reviews, 'review', 'reviews')].join(', ');
  const migrationBackups = store.getMigrationBackups();
  const reasonText = { update: 'Converted when the app updated', import: 'Older file imported', restore: 'Older backup restored' };
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
        ${ui.importPreview.migration ? `<p><strong>This is an older file (schema ${esc(ui.importPreview.migration.fromVersion)}).</strong> It will be converted to the current format first${ui.importPreview.migration.notice ? `: ${esc(ui.importPreview.migration.notice.replace(/\.$/, ''))}` : '. It has no quick entries to convert'}. The scorecard numbers were checked and are unchanged.</p>` : ''}
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
    <h1 id="day-heading" tabindex="-1">Settings</h1>

    ${backupPanelHtml()}

    <section class="card" aria-labelledby="data-heading">
      <h2 id="data-heading">Your data</h2>
      <p><strong>Local only.</strong> Your data is saved in this browser only, and nothing is sent anywhere. Clearing site data, or opening the app in another browser or at a different address, starts empty, so export now and then.</p>
      <p><strong>Do not put passwords, keys or confidential employer details in notes, evidence or people.</strong> Browser storage is not a password vault and is not encrypted.</p>
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

      ${migrationBackups.length ? `
        <h3 id="migration-backups-heading" tabindex="-1">Copies from before a data conversion</h3>
        <p class="meta">When the app converts older data to a newer format, it keeps a copy of the old data here until you delete it. Download one to keep it as a file.</p>
        <ul class="log-list">
          ${migrationBackups.map((b) => `
            <li>
              <span><strong>${esc(when(b.savedAt))}</strong> · ${esc(reasonText[b.reason] ?? b.reason)} · format ${esc(b.fromVersion ?? '?')}${b.summary ? `<br><span class="meta">${esc(summaryText(b.summary))}</span>` : ''}</span>
              <span class="button-row">
                <button type="button" class="button--small" data-action="backup-download" data-id="${esc(b.id)}">Download</button>
                <button type="button" class="button--small button--danger" data-action="backup-delete" data-id="${esc(b.id)}">Delete this copy</button>
              </span>
            </li>`).join('')}
        </ul>` : ''}
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

    <section class="card" aria-labelledby="plan-heading">
      <h2 id="plan-heading">Plan options</h2>
      <label class="check" for="swap-weeks">
        <input type="checkbox" id="swap-weeks" ${s.swapWeeks2and5 ? 'checked' : ''} aria-describedby="swap-hint">
        <span>Swap weeks 2 and 5</span>
      </label>
      <span class="hint" id="swap-hint">From the roadmap: "If your Tailscale process is active, swap this week with week 2." Dates, day numbers and holidays stay the same; only the content moves.</span>
    </section>

    <details class="card" id="test-section" ${testsOpen || s.testDate.enabled ? 'open' : ''}>
      <summary id="test-heading">Testing (for testing only)</summary>
      <h2 class="visually-hidden">Test date</h2>
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
        <p>Test data saved: ${esc(describeTestData(testData))}.</p>
        <button type="button" class="button--danger" data-action="delete-test-data">Delete test data</button>` : ''}
      <h3>Date and scheduling checks</h3>
      <p class="meta">Checks that the date changes at midnight Vancouver time, every plan date, the weekly hour budgets, flashcard scheduling, scorecard pacing, the evidence, people and library rules, the Markdown export and the data migration. Nothing is changed.</p>
      <button type="button" data-action="run-checks">Run date checks</button>
      ${checks}
    </details>
    `;
}

/** A readable list of the test data present, leaving out categories with none. */
function describeTestData(n) {
  const parts = [
    n.sessions && plural(n.sessions, 'session', 'sessions'),
    n.cardReviews && plural(n.cardReviews, 'card rating', 'card ratings'),
    n.tallies && plural(n.tallies, 'quick entry', 'quick entries'),
    n.artifacts && plural(n.artifacts, 'evidence item', 'evidence items'),
    n.people && plural(n.people, 'person', 'people'),
    n.interactions && plural(n.interactions, 'interaction', 'interactions'),
    n.resources && plural(n.resources, 'resource changed or added', 'resources changed or added'),
    n.weekChecks && plural(n.weekChecks, 'ticked item', 'ticked items'),
    n.optionalOverrides && plural(n.optionalOverrides, 'Optional/Required choice', 'Optional/Required choices'),
    n.lessonAnswers && plural(n.lessonAnswers, 'lesson answer', 'lesson answers'),
  ].filter(Boolean);
  return parts.length ? parts.join(', ') : 'none';
}

/** Shown instead of the app when stored data could not be converted safely. */
function loadProblemView(problem) {
  return `
    <h1 id="day-heading" tabindex="-1">Your saved data was not changed</h1>
    <section class="card" aria-labelledby="problem-heading">
      <h2 id="problem-heading">The update could not convert it safely</h2>
      <div class="error-summary" role="alert">
        <ul>${problem.problems.map((p) => `<li>${esc(p)}</li>`).join('')}</ul>
      </div>
      <p><strong>Nothing was saved or changed.</strong> Your data is exactly as it was in this browser. The app is paused so it can't overwrite it.</p>
      <p>Download a copy of your data now, then share this message with whoever maintains the app.</p>
      <div class="button-row">
        <button type="button" class="button--primary" data-action="problem-download">Download my data</button>
      </div>
    </section>`;
}

// ─── Render ──────────────────────────────────────────────────────────────────

function render({ focus } = {}) {
  flushResourceNotes(); // notes typed a moment ago are saved before the page redraws
  flushLessonAnswers();
  const activeId = document.activeElement?.id;
  applyTheme();
  renderBanners();
  document.querySelectorAll('[data-route]').forEach((a) => {
    if (a.dataset.route === route || (route === 'lesson' && a.dataset.route === 'plan')) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
  renderedDate = today();
  const views = {
    today: todayView, plan: planView, learn: learnView, proof: proofView, progress: scorecardView, settings: settingsView,
    lesson: () => lessonPageView(section),
  };
  const problem = store.getLoadProblem();
  mainEl.innerHTML = problem ? loadProblemView(problem) : views[route]();
  updateTimerDisplay();
  if (route === 'settings' && !problem) loadSnapshots();

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
    if (activeTimer.finished && flow && flow.date === today() && flow.step === 'focus') setFlow({ ...flow, step: 'wrapup' });
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

function submitFlowLog(form, status) {
  const date = today();
  const raw = form.querySelector('#flow-minutes').value.trim();
  const result = store.addSession({
    date,
    dayNumber: planDayFor(date),
    minutes: status === 'skipped' ? 0 : raw === '' ? NaN : Number(raw),
    status,
    reason: form.querySelector('#flow-reason')?.value ?? '',
    testMode: testMode(),
  });
  if (!result.ok) {
    ui.flowErrors = result.problems;
    render({ focus: '#flow-errors' });
    return;
  }
  const sess = result.session;
  if (activeTimer && activeTimer.date === sess.date) {
    activeTimer = null;
    T.saveTimer(null);
  }
  ui.flowErrors = [];
  ui.logDraft = { status: '', minutes: '', reason: '', date: '' };
  ui.flash = `Saved: ${statusLabel(sess.status)}, ${sess.minutes} min on ${formatShort(sess.date)}${sess.dayNumber ? ` (Day ${sess.dayNumber})` : ''}${sess.testMode ? ', marked as a test session' : ''}.`
    + (result.saved ? '' : ' Warning: this browser blocked saving.');
  setFlow(null);
  ui.logOpen = false;
  announce(ui.flash);
  render({ focus: '#flow-heading' });
}

const downloadText = (fileName, text) => downloadFile(fileName, text, 'application/json');

function downloadExport() {
  const fileName = store.exportFileName(vancouverDate());
  downloadText(fileName, store.exportJson());
  store.updateSettings({ lastExportedAt: new Date().toISOString() });
  ui.dataMessage = `Exported ${fileName}.`;
  render({ focus: '#data-message' });
}

const actions = {
  'log-time': () => {
    ui.logOpen = !ui.logOpen;
    ui.flowErrors = [];
    render({ focus: ui.logOpen ? '#flow-minutes' : '[data-action="log-time"]' });
  },
  'flow-start': () => {
    startFlow();
    announce('Session started.');
    render({ focus: '#flow-step-heading' });
  },
  'flow-start-from-home': () => {
    startFlow();
    nav.focus = '#flow-step-heading';
    location.hash = '#today';
  },
  'flow-next': () => {
    setFlow({ ...flow, step: nextStep(flow.step) });
    render({ focus: '#flow-step-heading' });
  },
  'flow-back': () => {
    setFlow({ ...flow, step: previousStep(flow.step) });
    render({ focus: '#flow-step-heading' });
  },
  'flow-exit': () => {
    setFlow(null);
    announce('Showing the whole page. Your timer and progress are kept.');
    render({ focus: '#flow-heading, #day-heading' });
  },
  'backup-choose-folder': async () => {
    try {
      await AB.chooseFolder();
      ui.backupMessage = 'Automatic backups are on. A backup file was just saved to your folder.';
    } catch (error) {
      if (error?.name === 'AbortError') return; // closed the picker without choosing
      ui.backupMessage = 'The folder could not be used. Try another folder.';
    }
    announce(ui.backupMessage);
    refreshBackupUi();
  },
  'backup-resume': async () => {
    await AB.resumeFolder();
    ui.backupMessage = AB.status().folder === 'ready' ? 'Automatic backups resumed.' : 'The folder is still not allowed. Choose it again in Settings.';
    announce(ui.backupMessage);
    refreshBackupUi();
  },
  'backup-stop': async () => {
    await AB.stopFolder();
    ui.backupMessage = 'Stopped saving to the folder. Files already there are left alone. Daily snapshots continue.';
    announce(ui.backupMessage);
    refreshBackupUi();
  },
  'backup-protect': async () => {
    const granted = await AB.requestPersistence();
    ui.backupMessage = granted ? 'Storage protection is on.' : 'The browser said no. Storage protection stays off, and your backups still protect you.';
    announce(ui.backupMessage);
    refreshBackupUi();
  },
  'backup-now': async () => {
    const result = await AB.backupNow();
    ui.backupMessage = result.folder === 'ready' ? 'Backed up to your folder and to a daily snapshot.' : 'Daily snapshot saved in this browser.';
    announce(ui.backupMessage);
    await loadSnapshots();
  },
  'backup-prompt-dismiss': () => {
    try { localStorage.setItem(PROMPT_FLAG, '1'); } catch { /* the note simply shows again next time */ }
    refreshBackupUi();
    announce('Okay. You can set up automatic backups any time in Settings.');
  },
  'backup-restore': async (el) => {
    const text = await AB.getSnapshotText(el.dataset.date);
    const parsed = text ? store.parseImport(text) : { ok: false, problems: ['That snapshot could not be read.'] };
    ui.importPreview = null;
    ui.importProblems = [];
    if (parsed.ok) ui.importPreview = parsed;
    else ui.importProblems = parsed.problems;
    render({ focus: parsed.ok ? '#import-preview' : '#import-errors' });
  },
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
  'dismiss-notice': () => {
    store.dismissMigrationNotice();
    announce('Notice dismissed.');
    render({ focus: '#day-heading' });
  },
  'problem-download': () => {
    const problem = store.getLoadProblem();
    if (problem) downloadText(`identity-lab-coach-saved-data-${vancouverDate()}.json`, problem.rawText);
  },
  'backup-download': (el) => {
    const text = store.getMigrationBackupText(el.dataset.id);
    if (text) downloadText(`identity-lab-coach-before-conversion-${vancouverDate()}.json`, text);
  },
  'backup-delete': (el) => {
    if (!window.confirm('Delete this copy of your old data? This cannot be undone.')) return;
    store.deleteMigrationBackup(el.dataset.id);
    ui.dataMessage = 'Copy deleted.';
    announce(ui.dataMessage);
    render({ focus: '#data-message' });
  },
  'delete-test-data': () => {
    const n = store.countTestData();
    const what = describeTestData(n);
    if (!window.confirm(`Delete test data (${what})? Real data is kept, and card schedules go back to what your real ratings give.`)) return;
    store.deleteTestData();
    ui.dataMessage = `Deleted test data: ${what}.`;
    render({ focus: '#test-heading' });
  },
  'run-checks': () => {
    ui.checkResults = runDateChecks();
    render({ focus: '#check-summary' });
  },
  export: downloadExport,
  'import-confirm': () => {
    const converted = ui.importPreview.migration;
    const result = store.replaceWithImport(ui.importPreview);
    ui.importPreview = null;
    if (!result.ok) {
      ui.importProblems = result.problems;
      render({ focus: '#import-errors' });
      return;
    }
    activeTimer = T.loadTimer();
    ui.dataMessage = `Import complete.${converted ? ' The older file was converted, and a copy of it is kept below.' : ''} Your previous data is kept as a backup below.`;
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
    const result = store.restoreBackup();
    if (!result.ok) {
      ui.importProblems = result.problems;
      render({ focus: '#import-errors' });
      return;
    }
    ui.dataMessage = 'Restored the data from before the last import.';
    render({ focus: '#data-message' });
  },
};

mainEl.addEventListener('click', (e) => {
  // A follow-up link on Today opens that person's page (the link itself navigates).
  const personLink = e.target.closest('[data-person-link]');
  if (personLink) selectPersonOnNavigate(personLink.dataset.personLink);
  handleLessonClick(e);
  const el = e.target.closest('[data-action]');
  if (!el) return;
  if (actions[el.dataset.action]) actions[el.dataset.action](el);
  else {
    const handler = cardActions[el.dataset.action] ?? weekActions[el.dataset.action] ?? scorecardActions[el.dataset.action]
      ?? evidenceActions[el.dataset.action] ?? peopleActions[el.dataset.action] ?? resourceActions[el.dataset.action] ?? courseActions[el.dataset.action];
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
  } else if (e.target.id === 'evidence-form') {
    e.preventDefault();
    render({ focus: submitEvidenceForm(e.target) });
  } else if (e.target.id === 'publish-form') {
    e.preventDefault();
    render({ focus: submitPublishForm(e.target) });
  } else if (e.target.id === 'flow-log-form') {
    e.preventDefault();
    submitFlowLog(e.target, e.submitter?.value || 'done');
  } else if (e.target.id === 'resource-form') {
    e.preventDefault();
    render({ focus: submitResourceForm(e.target) });
  } else if (e.target.dataset?.linkForm !== undefined) {
    e.preventDefault();
    render({ focus: submitLinkForm(e.target) });
  } else if (e.target.id === 'person-form') {
    e.preventDefault();
    render({ focus: submitPersonForm(e.target) });
  } else if (e.target.id === 'interaction-form') {
    e.preventDefault();
    render({ focus: submitInteractionForm(e.target) });
  }
});

// Keep the log form's typed values across re-renders.
mainEl.addEventListener('input', (e) => {
  const map = { 'log-minutes': 'minutes', 'log-reason': 'reason', 'log-date': 'date' };
  if (map[e.target.id]) ui.logDraft[map[e.target.id]] = e.target.value;
  handleCardInput(e.target);
  handleTallyInput(e.target);
  handleEvidenceInput(e.target);
  handlePeopleInput(e.target);
  handleResourceInput(e.target);
  handleLessonInput(e.target);
});

// Open or closed notes are remembered across redraws ("toggle" does not bubble, so listen while capturing).
mainEl.addEventListener('toggle', (e) => {
  if (e.target.id === 'test-section') testsOpen = e.target.open;
  else handleResourceToggle(e);
}, true);
// Leaving a notes box saves it straight away.
mainEl.addEventListener('focusout', (e) => {
  if (e.target.dataset?.resNotes) flushResourceNotes();
  if (e.target.dataset?.lessonAnswer) flushLessonAnswers();
});

mainEl.addEventListener('change', async (e) => {
  const t = e.target;
  if (t.id === 'resource-import-file') {
    render({ focus: await readResourceFile(t) });
    return;
  }
  const cardFocus = handleCardChange(t) ?? handleWeekChange(t) ?? handleEvidenceChange(t) ?? handleResourceChange(t);
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

// The focus ring on a heading that a script focused shows only for keyboard users.
document.addEventListener('keydown', (e) => { if (e.key !== 'Escape' && !e.metaKey) document.body.classList.add('using-keyboard'); });
document.addEventListener('pointerdown', () => document.body.classList.remove('using-keyboard'));

// ─── Routing and start-up ────────────────────────────────────────────────────

/** Reads the address, sends an old one to its new place, and sets the place and section to show. */
function routeFromHash() {
  const r = resolveHash(location.hash);
  if (r.redirect) history.replaceState(null, '', r.redirect);
  section = r.section;
  return r.route;
}

window.addEventListener('hashchange', () => {
  route = routeFromHash();
  ui.flash = null;
  ui.logOpen = false;
  ui.dataMessage = null;
  resetCardMessages();
  resetScorecardMessages();
  resetWeekView();
  resetEvidenceView();
  resetPeopleView();
  resetResourceView();
  const focus = nav.focus ?? '#day-heading';
  nav.focus = null;
  render({ focus });
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden) { flushResourceNotes(); flushLessonAnswers(); AB.backupNow().catch(() => {}); }
  else tick();
});
window.addEventListener('pagehide', () => { flushResourceNotes(); flushLessonAnswers(); AB.backupNow().catch(() => {}); });

store.load();
setContentRefresh((focus) => { if (route === 'learn' && section === 'library') render({ focus }); });
flow = loadFlow(today());
if (!store.getLoadProblem()) {
  store.onSave(AB.noteChanged);
  AB.onStatusChange(refreshBackupUi);
  // Backups are named by the real Vancouver date, even while a test date is on.
  AB.init({ json: () => store.exportJson(), today: () => vancouverDate() });
}
// Catch the timer up on anything that happened while the page was closed.
if (activeTimer && T.advance(activeTimer).length) T.saveTimer(activeTimer);
// If the timer ended while the page was closed, a guided session goes straight to wrap-up.
if (activeTimer?.finished && flow && flow.date === today() && flow.step === 'focus') setFlow({ ...flow, step: 'wrapup' });
route = routeFromHash();
render();
setInterval(tick, 1000);

// Offline use and installing: register the service worker, then ask it to keep a copy of what this page loaded.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    try {
      await navigator.serviceWorker.register('sw.js');
      await navigator.serviceWorker.ready;
      // On a first visit the worker is only in charge of this page a moment later; wait for that,
      // otherwise the requests below would not pass through it and nothing would be kept.
      if (!navigator.serviceWorker.controller) {
        await new Promise((resolve) => {
          navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true });
          setTimeout(resolve, 4000);
        });
      }
      const base = location.href.split('#')[0];
      const urls = new Set([
        base, new URL('manifest.webmanifest', base).href, new URL('icons/icon-192.png', base).href,
        ...performance.getEntriesByType('resource').map((e) => e.name),
      ]);
      await Promise.all([...urls].filter((u) => new URL(u).origin === location.origin).map((u) => fetch(u).catch(() => {})));
    } catch {
      // No service worker (for example a private window): the app still works online.
    }
  });
}
