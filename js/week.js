// Week view: the week's checklist, its days, and hours logged against the budget.
import * as store from './store.js';
import { esc, announce, today, testMode, plural } from './ui.js';
import { addDays, formatShort, formatLong } from './dates.js';
import { getWeek, getDayContext, contentWeekNumber } from './plan.js';
import { BLOCK_LABELS, PLAN_END, WEEKS, extraTimeLabel } from './plan-data.js';
import { weekDayResourcesHtml } from './resources.js';
import { lessonLinkHtml } from './lessons.js';

const KIND_ORDER = ['learn', 'read', 'practice', 'build', 'apply', 'network', 'evidence', 'design'];
const BLOCK_ORDER = ['learn', 'practice', 'build', 'publish', 'capstone'];

const ui = { week: null, pendingWeek: null, editPlan: false, openOptional: new Set(), day: null }; // week shown (null = the current week); pendingWeek is set by another screen; day = the day picked in the week calendar

/** The calendar week (1–9) that contains a date, clamped to the plan. */
export function weekForDate(date) {
  if (date < WEEKS[0].start) return 1;
  if (date > PLAN_END) return 9;
  const ctx = getDayContext(date, store.getSettings());
  return ctx.calendarWeek ?? 9;
}

function formatHours(h) {
  return `${Number.isInteger(h) ? h : h.toFixed(1)}\u00a0h`; // a no-break space keeps "11 h" together
}

const capitalFirst = (t) => t.charAt(0).toUpperCase() + t.slice(1);

/**
 * Flags shown next to a plan item. The words are Required and Optional only: an item that depends on
 * something ("if you attend") is Optional with that as a small note, and extra time is a note too.
 */
export function itemFlagsHtml(item) {
  const flags = [];
  if (store.isOptionalItem(item) || item.conditional) flags.push('<span class="flag">Optional</span>');
  if (item.flagship) flags.push('<span class="flag">Flagship</span>');
  if (item.extraMinutes) flags.push(`<span class="flag">${esc(capitalFirst(extraTimeLabel(item)))}</span>`);
  if (item.conditional) flags.push(`<span class="flag">${esc(capitalFirst(item.conditional))}</span>`);
  if (store.isChangedByMe('item', item.id, item.optional)) flags.push('<span class="flag">Changed by me</span>');
  return flags.join(' ');
}

/** Short names for the kind of work, shown on each checklist row. */
const SHORT_KIND = {
  learn: 'Learn', read: 'Read', practice: 'Lab', build: 'Project 1', apply: 'Product study',
  network: 'Networking (evenings)', evidence: 'Portfolio piece', design: 'Design exercise',
};

function itemRowHtml(item) {
  const checked = store.isChecked(item.id);
  const optional = store.isOptionalItem(item);
  return `
    <li class="${optional ? 'is-optional' : ''}">
      <label class="check" for="chk-${esc(item.id)}">
        <input type="checkbox" id="chk-${esc(item.id)}" data-week-item="${esc(item.id)}" ${checked ? 'checked' : ''}>
        <span><span class="item-kind">${esc(SHORT_KIND[item.kind] ?? item.kind)}</span><span class="item-text">${esc(item.text)}</span>${itemFlagsHtml(item)}</span>
      </label>
      ${ui.editPlan ? `<button type="button" class="button--small" data-action="item-toggle-optional" data-id="${esc(item.id)}" aria-label="${optional ? 'Mark as required' : 'Mark as optional'}: ${esc(item.text)}">${optional ? 'Mark as required' : 'Mark as optional'}</button>` : ''}
    </li>`;
}

/** Short names for the kind of day, on the calendar tiles (the full name is in the day's details). */
const SHORT_BLOCK = { learn: 'Learn', practice: 'Lab', build: 'Project', publish: 'Share', capstone: 'Final' };

/**
 * The week as a calendar: one tile per day, Monday to Sunday, coloured and named by the kind of day, with
 * what you logged. Picking a tile shows that day's focus, lesson and resources underneath. The colour is
 * never the only cue: every tile also says its kind of day in words, and its full description is its label.
 */
function weekCalendarHtml({ n, weekStart, date, sessions, settings }) {
  const dates = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const studyDates = dates.filter((d) => getDayContext(d, settings).kind === 'study');
  const picked = studyDates.includes(ui.day) ? ui.day : studyDates.includes(date) ? date : studyDates[0];
  const minutesOn = (d) => sessions.filter((s) => s.date === d).reduce((a, s) => a + s.minutes, 0);

  const tiles = dates.map((d) => {
    const ctx = getDayContext(d, settings);
    const [dow] = formatShort(d).split(',');
    const dayOfMonth = Number(d.slice(8, 10));
    const isToday = d === date;
    if (ctx.kind !== 'study') {
      // After Day 60 comes the bridge period (Dec 11 – Jan 17), with its own rest days.
      const label = ctx.kind === 'rest' || ctx.kind === 'bridge-rest' ? 'Rest' : ctx.kind === 'bridge' ? 'Bridge' : 'After the plan';
      return `
        <li class="day-tile day-tile--off ${isToday ? 'is-today' : ''}" ${isToday ? 'aria-current="date"' : ''}>
          <span class="day-tile__dow">${esc(dow)}</span>
          <span class="day-tile__date">${dayOfMonth}</span>
          <span class="day-tile__block">${label}</span>
          <span class="visually-hidden">: ${esc(formatLong(d))}${isToday ? ', today' : ''}</span>
        </li>`;
    }
    const minutes = minutesOn(d);
    const state = minutes ? `✓ ${minutes} min` : isToday ? 'Today' : `${ctx.hours} h`;
    const said = `${formatLong(d)}, Day ${ctx.dayNumber}, ${ctx.blockLabel}, ${ctx.hours} hours planned${isToday ? ', today' : ''}, ${minutes ? `logged ${minutes} minutes` : d < date ? 'not logged' : isToday ? 'not logged yet' : 'coming up'}`;
    return `
      <li class="${isToday ? 'is-today' : ''}" ${isToday ? 'aria-current="date"' : ''}>
        <button type="button" class="day-tile day-tile--${esc(ctx.block)} ${minutes ? 'is-logged' : ''} ${d < date ? 'is-past' : ''}"
          data-action="day-select" data-date="${d}" aria-pressed="${d === picked}" aria-controls="day-detail" aria-label="${esc(said)}">
          <span class="day-tile__dow">${esc(dow)}</span>
          <span class="day-tile__date">${dayOfMonth}</span>
          <span class="day-tile__block">${esc(SHORT_BLOCK[ctx.block] ?? ctx.blockLabel)}</span>
          <span class="day-tile__state">${esc(state)}</span>
        </button>
      </li>`;
  }).join('');

  let detail = '';
  if (picked) {
    const ctx = getDayContext(picked, settings);
    const minutes = minutesOn(picked);
    const status = minutes ? `Logged ${minutes} min` : picked < date ? 'Not logged' : picked === date ? 'Not logged yet' : 'Coming up';
    detail = `
      <div class="day-detail day-detail--${esc(ctx.block)}" id="day-detail">
        <p class="eyebrow">${esc(formatLong(picked).replace(/,\s*\d{4}$/, ''))} · Day ${ctx.dayNumber}${picked === date ? ' · Today' : ''}</p>
        <h3 class="day-detail__focus" id="day-detail-heading" tabindex="-1">${esc(ctx.focus)}</h3>
        <p class="meta"><span class="block-key block-key--${esc(ctx.block)}" aria-hidden="true"></span>${esc(ctx.blockLabel)} · ${ctx.hours}&nbsp;h planned · <span class="${minutes ? 'status-ok' : ''}">${esc(status)}</span></p>
        <div class="day-row__actions">${lessonLinkHtml(ctx.contentDay)}${weekDayResourcesHtml(ctx.contentDay)}</div>
      </div>`;
  }

  // A key for the kinds of day in this week, in the order they appear.
  const blocks = [...new Set(studyDates.map((d) => getDayContext(d, settings).block))];
  const key = blocks.map((b) => `<span class="cal-key"><span class="block-key block-key--${esc(b)}" aria-hidden="true"></span>${esc(SHORT_BLOCK[b] ?? b)}</span>`).join('');

  return `
    <section class="card week-calendar" aria-labelledby="days-heading">
      <div class="section-head">
        <h2 id="days-heading">Days</h2>
        <p class="meta cal-keys">${key}</p>
      </div>
      <ol class="week-cal" aria-label="Days of week ${n}">${tiles}</ol>
      ${detail}
      <p class="meta week-calendar__note">Pick a day to see what it covers. Today is where you log time; Sunday is rest.</p>
    </section>`;
}

/** `top` and `next` are the title block and the "Next up" card, built by Plan; `next` is a function of the week shown. */
export function weekView({ top = '', next = () => '' } = {}) {
  const settings = store.getSettings();
  const date = today();
  const current = weekForDate(date);
  const n = ui.week ?? current;
  const calWeek = getWeek(n);
  const content = getWeek(contentWeekNumber(n, settings));
  const weekStart = calWeek.start;
  const weekEnd = addDays(weekStart, 6);

  // Hours logged this calendar week (Mon–Sun), split by the block of each day.
  const sessions = store.getData().sessions.filter((s) => s.date >= weekStart && s.date <= weekEnd);
  const loggedByBlock = {};
  let loggedTotal = 0;
  let includesTest = false;
  for (const s of sessions) {
    const ctx = getDayContext(s.date, settings);
    const block = ctx.kind === 'study' ? ctx.block : 'other';
    loggedByBlock[block] = (loggedByBlock[block] ?? 0) + s.minutes / 60;
    loggedTotal += s.minutes / 60;
    if (s.testMode) includesTest = true;
  }
  const budget = Object.values(calWeek.budget).reduce((a, b) => a + b, 0);
  const pct = Math.min(100, Math.round((loggedTotal / budget) * 100));
  const over = loggedTotal - budget;

  const blockRows = BLOCK_ORDER.filter((b) => calWeek.budget[b] || loggedByBlock[b]).map((b) => `
    <tr><th scope="row">${esc(BLOCK_LABELS[b])}</th><td>${formatHours(loggedByBlock[b] ?? 0)}</td><td>${formatHours(calWeek.budget[b] ?? 0)}</td></tr>`).join('');
  const otherRow = loggedByBlock.other
    ? `<tr><th scope="row">Other days (Sunday or outside the plan)</th><td>${formatHours(loggedByBlock.other)}</td><td>–</td></tr>`
    : '';

  // Days as a week calendar: seven tiles (Monday to Sunday) and the picked day's details below them.
  const days = weekCalendarHtml({ n, weekStart, date, sessions, settings });

  // Checklist: required items first, in plan order; optional ones are folded away.
  const required = content.items.filter((i) => !store.isOptionalItem(i) && !i.conditional);
  const optionalItems = content.items.filter((i) => store.isOptionalItem(i) || i.conditional);
  const done = required.filter((i) => store.isChecked(i.id)).length;
  const inOrder = (list) => KIND_ORDER.flatMap((kind) => list.filter((i) => i.kind === kind));
  const optionalDone = optionalItems.filter((i) => store.isChecked(i.id)).length;
  const hoursText = `${formatHours(loggedTotal)} of ${formatHours(budget)}`;

  // One chip for each week.
  const strip = `
    <nav class="week-strip" aria-label="Choose a week">
      ${WEEKS.map((wk) => {
        const state = wk.number === current ? 'this week' : wk.number < current ? 'earlier' : 'coming up';
        return `<button type="button" class="week-chip ${wk.number === current ? 'week-chip--now' : ''}" data-action="week-go" data-week="${wk.number}"
          ${wk.number === n ? 'aria-current="true"' : ''} aria-label="Week ${wk.number}: ${esc(getWeek(wk.number).title)} (${state})">${wk.number}</button>`;
      }).join('')}
    </nav>`;

  const nav = `
    <nav class="week-nav" aria-label="Weeks">
      <button type="button" class="button--small" data-action="week-prev" ${n <= 1 ? 'disabled' : ''}>← Week ${Math.max(1, n - 1)}</button>
      ${n !== current ? `<button type="button" class="button--small" data-action="week-current">Back to this week (${current})</button>` : ''}
      <button type="button" class="button--small" data-action="week-next" ${n >= 9 ? 'disabled' : ''}>Week ${Math.min(9, n + 1)} →</button>
    </nav>`;

  return `
    ${top}
    ${strip}
    <h2 id="week-heading" tabindex="-1">Week ${n}: ${esc(content.title)}</h2>
    <p class="eyebrow">${esc(formatShort(weekStart))} – ${esc(formatShort(calWeek.days[calWeek.days.length - 1].date))}${n === current ? (date < calWeek.start ? ' · Starts soon' : ' · This week') : ''}</p>
    ${content.number !== n ? `<p class="meta">Showing week ${content.number}'s content (weeks 2 and 5 are swapped in Settings).</p>` : ''}
    <p class="week-summary" id="checklist-progress"><strong>${done} of ${required.length}</strong> required items done · <strong>${esc(hoursText)}</strong> logged${over > 0 ? ` (${formatHours(over)} over)` : ''}</p>
    <div class="progress" role="img" aria-label="${done} of ${required.length} required items done"><span style="width:${required.length ? Math.round((done / required.length) * 100) : 0}%"></span></div>
    ${days}

    ${nav}

    ${next(n)}

    <section class="card" aria-labelledby="checklist-heading">
      <div class="section-head">
        <h2 id="checklist-heading">What to finish this week</h2>
        <button type="button" class="button--small" data-action="plan-edit-toggle" aria-pressed="${ui.editPlan ? 'true' : 'false'}">${ui.editPlan ? 'Done editing' : 'Edit what’s required'}</button>
      </div>
      ${ui.editPlan ? '<p class="meta">Each item now has a button to make it required or optional. Your choice is kept when the plan is updated.</p>' : ''}
      ${content.items.length
        ? `<ul class="items checklist">${inOrder(required).map(itemRowHtml).join('')}</ul>
           ${optionalItems.length ? `
             <details class="optional-group" data-deep-group="optional-${n}" ${ui.openOptional.has(n) || ui.editPlan ? 'open' : ''}>
               <summary>Optional (${optionalDone} of ${optionalItems.length} done)</summary>
               <ul class="items checklist">${inOrder(optionalItems).map(itemRowHtml).join('')}</ul>
             </details>` : ''}`
        : '<p class="meta">The capstone week has no item checklist in the roadmap. Follow the daily focus above.</p>'}
      ${content.notes.map((note) => `<p class="note">${esc(note)}</p>`).join('')}
    </section>

    <details class="card" id="hours-details">
      <summary>Hours by type of day (${esc(hoursText)})</summary>
      <table class="hours-table">
        <caption class="visually-hidden">Hours logged and planned by type of day</caption>
        <thead><tr><th scope="col">Type of day</th><th scope="col">Logged</th><th scope="col">Planned</th></tr></thead>
        <tbody>${blockRows}${otherRow}</tbody>
      </table>
      <p class="meta">Counts sessions dated Mon–Sun this week. Networking happens in the evenings and is not counted as study time.${includesTest ? ' Includes test sessions.' : ''}</p>
    </details>`;
}

export const weekActions = {
  'day-select': (el) => {
    ui.day = el.dataset.date;
    return `[data-action="day-select"][data-date="${ui.day}"]`;
  },
  'week-prev': () => {
    ui.week = Math.max(1, (ui.week ?? weekForDate(today())) - 1);
    return '[data-action="week-prev"]:not([disabled]), #week-heading';
  },
  'week-next': () => {
    ui.week = Math.min(9, (ui.week ?? weekForDate(today())) + 1);
    return '[data-action="week-next"]:not([disabled]), #week-heading';
  },
  'week-go': (el) => {
    ui.week = Number(el.dataset.week);
    return `.week-chip[data-week="${ui.week}"]`;
  },
  'week-current': () => {
    ui.week = null;
    return '#week-heading';
  },
  'plan-edit-toggle': () => {
    ui.editPlan = !ui.editPlan;
    announce(ui.editPlan ? 'Editing what is required. Each item now has a button.' : 'Done editing.');
    return '[data-action="plan-edit-toggle"]';
  },
  'item-toggle-optional': (el) => {
    const item = WEEKS.flatMap((w) => w.items).find((i) => i.id === el.dataset.id);
    if (!item) return null;
    const next = !store.isOptionalItem(item);
    store.setOptional('item', item.id, next, item.optional, testMode());
    announce(`Marked as ${next ? 'optional' : 'required'}${store.isChangedByMe('item', item.id, item.optional) ? ', your choice' : ", the plan's own setting"}.`);
    return `[data-action="item-toggle-optional"][data-id="${el.dataset.id}"]`;
  },
};

/** Remembers whether the Optional group of a week is open. Returns true when the event was for it. */
export function handleWeekToggle(event) {
  const key = event.target?.dataset?.deepGroup ?? '';
  if (!key.startsWith('optional-')) return false;
  const n = Number(key.slice('optional-'.length));
  if (event.target.open) ui.openOptional.add(n);
  else ui.openOptional.delete(n);
  return true;
}

/** Ticks or unticks a checklist item. Returns the selector to focus, or null if not handled. */
export function handleWeekChange(target) {
  const id = target.dataset?.weekItem;
  if (!id) return null;
  store.setChecked(id, target.checked, testMode());
  announce(target.checked ? 'Ticked.' : 'Unticked.');
  return `#chk-${CSS.escape(id)}`;
}

/** Called when the date changes or the view is opened from the nav, to show the current week. */
export function resetWeekView() {
  ui.day = null;
  ui.week = ui.pendingWeek;
  ui.pendingWeek = null;
}

/** Shows a week right away (used by the week list on Plan). */
export function setWeek(n) {
  ui.week = n;
}

/** Asks for a particular week to be shown the next time the Week screen opens. */
export function showWeekNext(n) {
  ui.pendingWeek = n;
}
