// Course home: where you are in the 9 weeks, and what to do next.
// Everything shown is worked out from what you logged. Nothing is typed in.
import * as store from './store.js';
import { esc, today, nav, plural } from './ui.js';
import { formatShort } from './dates.js';
import { planDayFor, getDayContext, getWeek } from './plan.js';
import { PLAN_START, PLAN_END, ITEM_KIND_LABELS, WEEKS } from './plan-data.js';
import { courseProgress } from './progress.js';
import { setWeek } from './week.js';

const hours = (minutes) => `${Number.isInteger(minutes / 60) ? minutes / 60 : (minutes / 60).toFixed(1)} h`;
const STATE_LABELS = { current: 'This week', past: 'Earlier', upcoming: 'Coming up' };

/** A text-first progress bar: the numbers carry the meaning, the bar is a picture of them. */
function bar(done, total, label) {
  const pct = total ? Math.round((done / total) * 100) : 0;
  return `<div class="progress" role="img" aria-label="${esc(label)}"><span style="width:${pct}%"></span></div>`;
}

/**
 * The top of Plan: your progress, then "Continue" (only once you have logged a session) or
 * "Start with Week 1", then the nine weeks in a closed list.
 */
export function planTopHtml() {
  const date = today();
  const settings = store.getSettings();
  const data = store.getData();
  const p = courseProgress(data, { today: date });
  const dayNumber = planDayFor(date);
  const ctx = getDayContext(date, settings);
  const where = date < PLAN_START
    ? `Starts ${formatShort(PLAN_START)}.`
    : date > PLAN_END
      ? 'The 60 days are over. Everything you ticked and logged is still here.'
      : dayNumber
        ? `Day ${dayNumber} of 60 · ${formatShort(date)}`
        : formatShort(date);
  const studyToday = ['study', 'bridge', 'applications'].includes(ctx.kind);
  const hasLogged = data.sessions.length > 0;

  let next;
  if (!hasLogged) {
    next = `
      <section class="card" aria-labelledby="next-up-heading">
        <h2 id="next-up-heading">Start with Week 1</h2>
        <p>${esc(WEEKS[0].title)}. Log your first session on Today and this page will show where to continue.</p>
        <div class="button-row"><button type="button" class="button--primary" data-action="course-open-week" data-week="1">Open Week 1</button></div>
      </section>`;
  } else if (p.next) {
    next = `
      <section class="card" aria-labelledby="next-up-heading">
        <h2 id="next-up-heading">Continue</h2>
        <p class="focus-line">Week ${p.next.weekNumber} · ${esc(ITEM_KIND_LABELS[p.next.kind])}</p>
        <p>${esc(p.next.text)}</p>
        <p class="meta">${p.next.state === 'current' ? 'The first required item you have not ticked this week.' : p.next.state === 'past' ? 'An earlier week still has required items open.' : 'This week has not started yet.'}</p>
        <div class="button-row">
          ${studyToday ? '<button type="button" data-action="flow-start-from-home">Start today’s session</button>' : ''}
          <button type="button" class="button--primary" data-action="course-open-week" data-week="${p.next.weekNumber}">Open Week ${p.next.weekNumber}</button>
        </div>
      </section>`;
  } else {
    next = `
      <section class="card" aria-labelledby="next-up-heading">
        <h2 id="next-up-heading">Continue</h2>
        <p class="status-ok">Every required item in every week is ticked.</p>
      </section>`;
  }

  const lastDay = (n) => getWeek(n).days.at(-1).date; // Mon–Sat: Sunday is a rest day
  return `
    <h1 id="day-heading" tabindex="-1">Plan</h1>
    <p class="eyebrow">${esc(where)}</p>

    <section class="card" aria-labelledby="overall-heading">
      <h2 id="overall-heading">Your progress</h2>
      <p class="hours-total"><strong>${p.percent}%</strong> of the required items ticked: ${p.requiredTicked} of ${p.requiredTotal}.</p>
      ${bar(p.requiredTicked, p.requiredTotal, `${p.requiredTicked} of ${p.requiredTotal} required items ticked`)}
      <p class="meta">${hours(p.loggedMinutes)} logged${date >= PLAN_START ? `, against ${hours(p.plannedSoFarMinutes)} planned so far` : ''}. Optional items are shown on each week and not counted here.</p>
    </section>

    ${next}

    <details class="card" id="weeks-list">
      <summary>All 9 weeks</summary>
      <ol class="course-weeks">
        ${p.weeks.map((w) => `
          <li class="course-week course-week--${w.state}">
            <div class="course-week__head">
              <h3>Week ${w.number}: ${esc(w.title)}</h3>
              <span class="tag">${esc(STATE_LABELS[w.state])}</span>
            </div>
            <p class="meta">${esc(formatShort(w.start))} – ${esc(formatShort(lastDay(w.number)))}</p>
            ${bar(w.requiredTicked, w.required, `Week ${w.number}: ${w.requiredTicked} of ${w.required} required items ticked`)}
            <p class="meta">${w.requiredTicked} of ${plural(w.required, 'required item', 'required items')} ticked${w.extraTotal ? `; ${w.extraTicked} of ${w.extraTotal} optional` : ''}
              · ${hours(w.loggedMinutes)} of ${hours(w.plannedMinutes)} logged
              ${w.resourcesTotal ? `· ${w.resourcesDone} of ${plural(w.resourcesTotal, 'resource', 'resources')} done` : ''}</p>
            <div class="button-row"><button type="button" class="button--small" data-action="course-open-week" data-week="${w.number}" aria-label="Open Week ${w.number}">Open week</button></div>
          </li>`).join('')}
      </ol>
    </details>`;
}

export const courseActions = {
  'course-open-week': (el) => {
    setWeek(Number(el.dataset.week));
    return '#week-heading';
  },
};
