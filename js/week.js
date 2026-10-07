// Week view: the week's checklist, its days, and hours logged against the budget.
import * as store from './store.js';
import { esc, announce, today, testMode, plural } from './ui.js';
import { addDays, formatShort } from './dates.js';
import { getWeek, getDayContext, contentWeekNumber } from './plan.js';
import { BLOCK_LABELS, ITEM_KIND_LABELS, PLAN_END, WEEKS } from './plan-data.js';
import { weekDayResourcesHtml } from './resources.js';

const KIND_ORDER = ['learn', 'read', 'practice', 'build', 'apply', 'network', 'evidence'];
const BLOCK_ORDER = ['learn', 'practice', 'build', 'publish', 'capstone'];

const ui = { week: null }; // calendar week shown; null = the current week

/** The calendar week (1–9) that contains a date, clamped to the plan. */
export function weekForDate(date) {
  if (date < WEEKS[0].start) return 1;
  if (date > PLAN_END) return 9;
  const ctx = getDayContext(date, store.getSettings());
  return ctx.calendarWeek ?? 9;
}

function formatHours(h) {
  return `${Number.isInteger(h) ? h : h.toFixed(1)} h`;
}

function itemRowHtml(item) {
  const checked = store.isChecked(item.id);
  const flags = [];
  if (item.optional) flags.push('<span class="flag">Optional</span>');
  if (item.conditional) flags.push(`<span class="flag">Conditional: ${esc(item.conditional)}</span>`);
  return `
    <li class="${item.optional ? 'is-optional' : ''}">
      <label class="check" for="chk-${esc(item.id)}">
        <input type="checkbox" id="chk-${esc(item.id)}" data-week-item="${esc(item.id)}" ${checked ? 'checked' : ''}>
        <span><span class="item-text">${esc(item.text)}</span>${flags.join('')}</span>
      </label>
    </li>`;
}

export function weekView() {
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

  // Days of the week with their focus and minutes logged.
  const days = calWeek.days.map((seed) => {
    const ctx = getDayContext(seed.date, settings);
    const minutes = sessions.filter((s) => s.date === seed.date).reduce((a, s) => a + s.minutes, 0);
    const isToday = seed.date === date;
    return `
      <li ${isToday ? 'aria-current="date"' : ''} class="${isToday ? 'is-today' : ''}">
        <span class="day-line"><strong>${esc(formatShort(seed.date))}</strong> · Day ${ctx.dayNumber} · ${esc(ctx.blockLabel)}${isToday ? ' · <strong>Today</strong>' : ''}</span>
        <span>${esc(ctx.focus)}</span>
        ${weekDayResourcesHtml(ctx.contentDay)}
        <span class="meta">${minutes ? `${minutes} min logged` : 'Nothing logged'}</span>
      </li>`;
  }).join('');

  // Checklist grouped by kind. Optional and conditional items are not counted in progress.
  const required = content.items.filter((i) => !i.optional && !i.conditional);
  const done = required.filter((i) => store.isChecked(i.id)).length;
  const groups = KIND_ORDER
    .map((kind) => [kind, content.items.filter((i) => i.kind === kind)])
    .filter(([, items]) => items.length)
    .map(([kind, items]) => `
      <h3>${esc(ITEM_KIND_LABELS[kind])}</h3>
      <ul class="items checklist">${items.map(itemRowHtml).join('')}</ul>`).join('');

  const nav = (label) => `
    <nav class="week-nav" aria-label="${label}">
      <button type="button" data-action="week-prev" ${n <= 1 ? 'disabled' : ''}>← Week ${Math.max(1, n - 1)}</button>
      ${n !== current ? `<button type="button" data-action="week-current">This week (${current})</button>` : ''}
      <button type="button" data-action="week-next" ${n >= 9 ? 'disabled' : ''}>Week ${Math.min(9, n + 1)} →</button>
    </nav>`;

  return `
    <p class="eyebrow">${esc(formatShort(weekStart))} – ${esc(formatShort(calWeek.days[calWeek.days.length - 1].date))}${n === current ? (date < calWeek.start ? ` · Starts ${esc(formatShort(calWeek.start))}` : ' · This week') : ''}</p>
    <h1 id="day-heading" tabindex="-1">Week ${n} of 9: ${esc(content.title)}</h1>
    ${content.number !== n ? `<p class="meta">Showing week ${content.number}'s content (weeks 2 and 5 are swapped in Settings).</p>` : ''}
    ${nav('Weeks')}

    <section class="card" aria-labelledby="hours-heading">
      <h2 id="hours-heading">Hours</h2>
      <p class="hours-total"><strong>${formatHours(loggedTotal)}</strong> logged of <strong>${formatHours(budget)}</strong> planned${over > 0 ? ` (${formatHours(over)} over the budget)` : ''}.</p>
      <div class="progress" aria-hidden="true"><span style="width:${pct}%"></span></div>
      <table class="hours-table">
        <caption class="visually-hidden">Hours logged and planned by block</caption>
        <thead><tr><th scope="col">Block</th><th scope="col">Logged</th><th scope="col">Planned</th></tr></thead>
        <tbody>${blockRows}${otherRow}</tbody>
      </table>
      <p class="meta">Counts sessions dated Mon–Sun this week. Networking happens in the evenings, outside the budget.${includesTest ? ' Includes test sessions.' : ''}</p>
    </section>

    <section class="card" aria-labelledby="checklist-heading">
      <h2 id="checklist-heading">Checklist</h2>
      ${content.items.length
        ? `<p class="meta" id="checklist-progress">${done} of ${plural(required.length, 'item', 'items')} done${content.items.length > required.length ? ' (optional and conditional items not counted)' : ''}.</p>${groups}`
        : '<p class="meta">The capstone week has no item checklist in the roadmap. Follow the daily focus below.</p>'}
      ${content.notes.map((note) => `<p class="note">${esc(note)}</p>`).join('')}
    </section>

    <section class="card" aria-labelledby="days-heading">
      <h2 id="days-heading">Days</h2>
      <ol class="day-list">${days}</ol>
      ${n < 9 ? '<p class="meta">Sunday is a rest day.</p>' : ''}
    </section>
    ${nav('Weeks, bottom of page')}`;
}

export const weekActions = {
  'week-prev': () => {
    ui.week = Math.max(1, (ui.week ?? weekForDate(today())) - 1);
    return '[data-action="week-prev"]:not([disabled]), #day-heading';
  },
  'week-next': () => {
    ui.week = Math.min(9, (ui.week ?? weekForDate(today())) + 1);
    return '[data-action="week-next"]:not([disabled]), #day-heading';
  },
  'week-current': () => {
    ui.week = null;
    return '#day-heading';
  },
};

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
  ui.week = null;
}
