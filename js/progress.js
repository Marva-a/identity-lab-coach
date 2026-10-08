// Course progress: what the course home shows. Pure functions only (no page or
// storage code). Every number comes from what you logged; nothing is typed in.
import { addDays } from './dates.js';
import { WEEKS, itemIsOptional } from './plan-data.js';
import { getWeek, contentWeekNumber } from './plan.js';
import { expectedHours } from './pace.js';

const sum = (list, pick) => list.reduce((n, x) => n + pick(x), 0);
const isRequired = (item, overrides) => !itemIsOptional(item, overrides) && !item.conditional;

/**
 * Progress for each of the 9 weeks and overall.
 * - Items are the checklist items of the content shown that week (weeks 2 and 5 can be swapped),
 *   counting only required ones (Optional and Conditional items are shown separately, not counted).
 * - Hours are the sessions dated that calendar week against that week's planned budget.
 * - Resources are the (not retired) resources assigned to that week's days.
 */
export function courseProgress(data, { today }) {
  const settings = data.settings ?? {};
  const weeks = WEEKS.map((w) => {
    const content = getWeek(contentWeekNumber(w.number, settings));
    const end = addDays(w.start, 6);
    const required = content.items.filter((i) => isRequired(i, data.optionalOverrides));
    const extra = content.items.filter((i) => !isRequired(i, data.optionalOverrides));
    const ticked = (i) => Boolean(data.weekChecks?.[i.id]);
    const dayNumbers = new Set(content.days.map((d) => d.day));
    const resources = (data.resources ?? []).filter((r) => !r.retired && r.days.some((d) => dayNumbers.has(d)));
    return {
      number: w.number,
      title: content.title,
      start: w.start,
      end,
      state: today < w.start ? 'upcoming' : today > end ? 'past' : 'current',
      required: required.length,
      requiredTicked: required.filter(ticked).length,
      extraTotal: extra.length,
      extraTicked: extra.filter(ticked).length,
      loggedMinutes: sum(data.sessions.filter((s) => s.date >= w.start && s.date <= end), (s) => s.minutes),
      plannedMinutes: sum(Object.values(w.budget), (h) => h) * 60,
      resourcesTotal: resources.length,
      resourcesDone: resources.filter((r) => r.status === 'done').length,
    };
  });

  const requiredTotal = sum(weeks, (w) => w.required);
  const requiredTicked = sum(weeks, (w) => w.requiredTicked);
  return {
    weeks,
    requiredTotal,
    requiredTicked,
    percent: requiredTotal ? Math.round((requiredTicked / requiredTotal) * 100) : 0,
    loggedMinutes: sum(weeks, (w) => w.loggedMinutes),
    plannedSoFarMinutes: Math.round(expectedHours(today) * 60),
    next: nextUp(data, weeks, settings, today),
  };
}

/**
 * "Continue where you left off": the first required item you have not ticked.
 * It looks at this week first, then earlier weeks you have not finished, then the
 * next week. Before the plan starts it points at Week 1. Null when everything is ticked.
 */
export function nextUp(data, weeks, settings, today) {
  const firstOpen = (w) => {
    const content = getWeek(contentWeekNumber(w.number, settings));
    return content.items.find((i) => isRequired(i, data.optionalOverrides) && !data.weekChecks?.[i.id]);
  };
  const order = [
    ...weeks.filter((w) => w.state === 'current'),
    ...weeks.filter((w) => w.state === 'past'),
    ...weeks.filter((w) => w.state === 'upcoming'),
  ];
  for (const w of order) {
    const item = firstOpen(w);
    if (item) return { weekNumber: w.number, weekTitle: w.title, kind: item.kind, text: item.text, state: w.state };
  }
  return null;
}
