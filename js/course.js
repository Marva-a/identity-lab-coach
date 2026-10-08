// Course home: where you are in the 9 weeks, and what to do next.
// Everything shown is worked out from what you logged. Nothing is typed in.
import * as store from './store.js';
import { esc, today, nav, plural } from './ui.js';
import { formatShort } from './dates.js';
import { planDayFor, getDayContext } from './plan.js';
import { PLAN_START, PLAN_END, ITEM_KIND_LABELS } from './plan-data.js';
import { courseProgress } from './progress.js';
import { showWeekNext } from './week.js';

const hours = (minutes) => `${Number.isInteger(minutes / 60) ? minutes / 60 : (minutes / 60).toFixed(1)} h`;
const STATE_LABELS = { current: 'This week', past: 'Earlier', upcoming: 'Coming up' };

/** A text-first progress bar: the numbers carry the meaning, the bar is a picture of them. */
function bar(done, total, label) {
  const pct = total ? Math.round((done / total) * 100) : 0;
  return `<div class="progress" role="img" aria-label="${esc(label)}"><span style="width:${pct}%"></span></div>`;
}

export function courseView() {
  const date = today();
  const settings = store.getSettings();
  const p = courseProgress(store.getData(), { today: date });
  const dayNumber = planDayFor(date);
  const ctx = getDayContext(date, settings);
  const where = date < PLAN_START
    ? `The course starts ${formatShort(PLAN_START)}.`
    : date > PLAN_END
      ? 'The 60 days are over. Everything you ticked and logged is still here.'
      : dayNumber
        ? `Day ${dayNumber} of 60 · ${formatShort(date)}`
        : formatShort(date);
  const studyToday = ['study', 'bridge', 'applications'].includes(ctx.kind);

  const next = p.next
    ? `
      <section class="card" aria-labelledby="next-up-heading">
        <h2 id="next-up-heading">Continue where you left off</h2>
        <p class="focus-line">Week ${p.next.weekNumber} · ${esc(ITEM_KIND_LABELS[p.next.kind])}</p>
        <p>${esc(p.next.text)}</p>
        <p class="meta">${p.next.state === 'current' ? 'The first item you have not ticked in this week.' : p.next.state === 'past' ? 'An earlier week still has required items open.' : 'This week has not started yet.'}</p>
        <div class="button-row">
          ${studyToday ? '<button type="button" class="button--primary" data-action="flow-start-from-home">Start today’s session</button>' : ''}
          <button type="button" data-action="course-open-week" data-week="${p.next.weekNumber}">Open Week ${p.next.weekNumber}</button>
        </div>
      </section>`
    : `
      <section class="card" aria-labelledby="next-up-heading">
        <h2 id="next-up-heading">Continue where you left off</h2>
        <p class="status-ok">Every required item in every week is ticked.</p>
      </section>`;

  return `
    <h1 id="day-heading" tabindex="-1">Course home</h1>
    <p class="eyebrow">${esc(where)}</p>

    <section class="card" aria-labelledby="overall-heading">
      <h2 id="overall-heading">Your progress</h2>
      <p class="hours-total"><strong>${p.percent}%</strong> of the required items ticked: ${p.requiredTicked} of ${p.requiredTotal}.</p>
      ${bar(p.requiredTicked, p.requiredTotal, `${p.requiredTicked} of ${p.requiredTotal} required items ticked`)}
      <p class="meta">${hours(p.loggedMinutes)} logged${date >= PLAN_START ? `, against about ${hours(p.plannedSoFarMinutes)} planned so far` : ''}. Optional and conditional items are shown on each week, not counted here.</p>
    </section>

    ${next}

    <section class="card" aria-labelledby="weeks-heading">
      <h2 id="weeks-heading">The 9 weeks</h2>
      <ol class="course-weeks">
        ${p.weeks.map((w) => `
          <li class="course-week course-week--${w.state}">
            <div class="course-week__head">
              <h3>Week ${w.number}: ${esc(w.title)}</h3>
              <span class="tag">${esc(STATE_LABELS[w.state])}</span>
            </div>
            <p class="meta">${esc(formatShort(w.start))} – ${esc(formatShort(w.end))}</p>
            ${bar(w.requiredTicked, w.required, `Week ${w.number}: ${w.requiredTicked} of ${w.required} required items ticked`)}
            <p class="meta">${w.requiredTicked} of ${plural(w.required, 'required item', 'required items')} ticked${w.extraTotal ? `; ${w.extraTicked} of ${w.extraTotal} optional or conditional` : ''}
              · ${hours(w.loggedMinutes)} of ${hours(w.plannedMinutes)} logged
              ${w.resourcesTotal ? `· ${w.resourcesDone} of ${plural(w.resourcesTotal, 'resource', 'resources')} done` : ''}</p>
            <div class="button-row"><button type="button" class="button--small" data-action="course-open-week" data-week="${w.number}" aria-label="Open Week ${w.number}">Open week</button></div>
          </li>`).join('')}
      </ol>
    </section>`;
}

export const courseActions = {
  'course-open-week': (el) => {
    showWeekNext(Number(el.dataset.week));
    nav.focus = '#day-heading';
    location.hash = '#week';
    return null;
  },
};
