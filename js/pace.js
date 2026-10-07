// Scorecard maths: what the plan expects by today, and the status of each measure.
// Pure functions only (no page code), so the date checks can run them in Node.
//
// Rules (shown in the app too):
// - "Expected" only counts days that have ENDED, so you never look behind on
//   the morning of a study day, and a Sunday never moves the goalposts.
// - Hours: expected = planned hours of plan days that have ended (Sundays 0).
// - Artifacts (Oct 12 – Dec 10): expected = Saturdays (publish days) that have
//   ended, plus the capstone artifact once Dec 10 has ended (9 in total).
// - Conversations, applications, referral asks, and the 3 extra artifacts after
//   Dec 10: the target (low end of any range) is spread evenly over study days
//   (Mon–Sat), skipping Sundays and the Dec 24 – Jan 1 rest.
// - Status: On track at 90% or more of expected; Behind at 70–89%, or when a
//   count is just one short; At risk below 70%.
import { addDays, weekday } from './dates.js';
import {
  PLAN_START, PLAN_END, BRIDGE_REST_START, BRIDGE_REST_END, WEEKS, SCORECARD_TARGETS,
} from './plan-data.js';

export const PERIOD_1 = { id: 'dec10', start: PLAN_START, end: PLAN_END, label: 'By Thu, Dec 10' };
export const PERIOD_2 = { id: 'jan31', start: addDays(PLAN_END, 1), end: SCORECARD_TARGETS[1].by, label: 'By Sun, Jan 31' };

export const MEASURES = [
  { id: 'hours', label: 'Study hours', unit: 'h' },
  { id: 'artifact', label: 'Published artifacts' },
  { id: 'conversation', label: 'Conversations' },
  { id: 'application', label: 'Targeted applications' },
  { id: 'referral', label: 'Referral asks' },
];

export const STATUS_RULE = 'On track means you are at 90% or more of what the plan expects by today; Behind means 70–89%, or a count that is just one short; At risk means below 70%.';

export const STATUS_LABELS = { on: 'On track', behind: 'Behind', risk: 'At risk', none: 'No target' };

/** Targets per period. Ranges keep both ends; pacing uses `low`. */
export function targetsFor(periodId) {
  const [t1, t2] = SCORECARD_TARGETS;
  const range = (v) => (Array.isArray(v) ? { low: v[0], high: v[1] } : { low: v, high: v });
  const t = periodId === 'dec10' ? t1 : t2;
  return {
    hours: t.hours ? range(t.hours) : null,
    artifact: range(t.artifacts),
    conversation: range(t.conversations),
    application: range(t.applications),
    referral: range(t.referralAsks),
  };
}

const PLAN_HOURS = new Map(WEEKS.flatMap((w) => w.days.map((d) => [d.date, d.hours])));

/** Study days: plan days (Mon–Sat) up to Dec 10, then Mon–Sat outside the Dec 24 – Jan 1 rest. */
export function isStudyDay(date) {
  if (date < PLAN_START) return false;
  if (date <= PLAN_END) return PLAN_HOURS.has(date);
  if (date >= BRIDGE_REST_START && date <= BRIDGE_REST_END) return false;
  return weekday(date) !== 0;
}

/** Number of study days from `start` to `end`, inclusive (0 if end < start). */
export function countStudyDays(start, end) {
  let n = 0;
  for (let d = start; d <= end; d = addDays(d, 1)) if (isStudyDay(d)) n++;
  return n;
}

/** The last day that has fully ended. */
export function lastEndedDay(today) {
  return addDays(today, -1);
}

function minDate(a, b) {
  return a < b ? a : b;
}

/** Planned hours of plan days that have ended. */
export function expectedHours(today) {
  const end = minDate(lastEndedDay(today), PLAN_END);
  let total = 0;
  for (const [date, hours] of PLAN_HOURS) if (date <= end) total += hours;
  return total;
}

/** Publish Saturdays that have ended, plus the capstone once Dec 10 has ended. */
export function expectedArtifactsPeriod1(today) {
  const end = minDate(lastEndedDay(today), PLAN_END);
  let n = 0;
  for (let d = PLAN_START; d <= end; d = addDays(d, 1)) if (weekday(d) === 6) n++;
  if (lastEndedDay(today) >= PLAN_END) n++;
  return n;
}

/** Share of a period's study days that have ended (0–1). */
export function studyShare(period, today) {
  const total = countStudyDays(period.start, period.end);
  const ended = countStudyDays(period.start, minDate(lastEndedDay(today), period.end));
  return total ? ended / total : 0;
}

/**
 * What the plan expects for a measure by today, within a period.
 * Period 2 targets are cumulative (12 artifacts by Jan 31 includes the 9 by Dec 10).
 */
export function expectedFor(measure, period, today) {
  if (measure === 'hours') return period.id === 'dec10' ? expectedHours(today) : null;
  const t1 = targetsFor('dec10')[measure].low;
  if (period.id === 'dec10') {
    if (measure === 'artifact') return expectedArtifactsPeriod1(today);
    return t1 * studyShare(PERIOD_1, today);
  }
  const t2 = targetsFor('jan31')[measure].low;
  return t1 + (t2 - t1) * studyShare(PERIOD_2, today);
}

/**
 * Status from actual vs expected. Counts are compared with the whole number
 * expected so far (you can't have 0.6 of a conversation).
 */
export function statusFor(actual, expected, { isCount }) {
  if (expected === null) return 'none';
  const exp = isCount ? Math.floor(expected + 1e-9) : expected;
  if (exp <= 0 || actual >= exp) return 'on';
  const ratio = actual / exp;
  if (ratio >= 0.9) return 'on';
  if (ratio >= 0.7 || (isCount && exp - actual <= 1)) return 'behind';
  return 'risk';
}

/** Which period the scorecard shows for a date. */
export function activePeriod(today) {
  return today <= PLAN_END ? PERIOD_1 : PERIOD_2;
}

/**
 * Builds the scorecard rows.
 * `sessions`: Session[]; `counts`: { artifact: [dates], conversation: [...], ... }.
 */
export function scorecard(today, sessions, counts) {
  const period = activePeriod(today);
  const targets = targetsFor(period.id);
  const upTo = minDate(today, period.end);
  return MEASURES.map((m) => {
    const isCount = m.id !== 'hours';
    let actual;
    if (m.id === 'hours') {
      actual = sessions
        .filter((s) => s.date >= period.start && s.date <= upTo)
        .reduce((sum, s) => sum + s.minutes, 0) / 60;
    } else {
      actual = (counts[m.id] ?? []).filter((d) => d <= upTo).length;
    }
    const target = targets[m.id];
    const rawExpected = target ? expectedFor(m.id, period, today) : null;
    const expected = rawExpected === null ? null : (isCount ? Math.floor(rawExpected + 1e-9) : rawExpected);
    return {
      ...m,
      isCount,
      actual,
      expected,
      target,
      status: target ? statusFor(actual, rawExpected, { isCount }) : 'none',
      reached: target ? actual >= target.low : false,
    };
  });
}
