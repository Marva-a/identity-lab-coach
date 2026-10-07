// Plan lookup: turns a Vancouver date string into "what is on today".
import { addDays, daysBetween, weekday, isValidDateString } from './dates.js';
import {
  PLAN_START, PLAN_END, BRIDGE_END, APPLICATIONS_START, APPLICATIONS_END,
  PROJECT1_GATE, FEB_REVIEW_WEEK, WEEKS, BLOCK_LABELS, BLOCK_ITEM_KINDS,
  BRIDGE_PHASES, APPLICATION_WEEK, INTERVIEW_PREP,
} from './plan-data.js';

export function dayNumberFor(date) {
  return daysBetween(PLAN_START, date) + 1;
}

/** The plan day (1–60) a date counts as, or null outside the 60 days. */
export function planDayFor(date) {
  return date >= PLAN_START && date <= PLAN_END ? dayNumberFor(date) : null;
}

/** The calendar week (1–9) a plan date falls in. Sundays belong to the week that just ended. */
function calendarWeekFor(dayNumber) {
  return Math.ceil(dayNumber / 7);
}

/**
 * Which week's content to show for a calendar week. With the swap setting on,
 * weeks 2 and 5 trade content (the roadmap's "if your Tailscale process is
 * active" note). Dates, day numbers and holidays stay with the calendar.
 */
export function contentWeekNumber(calendarWeek, settings) {
  if (!settings?.swapWeeks2and5) return calendarWeek;
  if (calendarWeek === 2) return 5;
  if (calendarWeek === 5) return 2;
  return calendarWeek;
}

export function getWeek(n) {
  return WEEKS.find((w) => w.number === n);
}

function studyDayContext(date, settings) {
  const dayNumber = dayNumberFor(date);
  const calWeek = calendarWeekFor(dayNumber);
  const calendarSeed = getWeek(calWeek).days.find((d) => d.day === dayNumber);
  const contentWeek = getWeek(contentWeekNumber(calWeek, settings));
  const index = getWeek(calWeek).days.indexOf(calendarSeed);
  const seed = contentWeek.days[index];

  // Day 1 is the only 1-hour day. It stays on the calendar even if weeks are swapped.
  const hours = calendarSeed.day === 1 ? 1 : seed.hours;
  const kinds = BLOCK_ITEM_KINDS[seed.block] ?? [];

  return {
    date,
    kind: 'study',
    dayNumber,
    calendarWeek: calWeek,
    week: contentWeek,
    swapped: contentWeek.number !== calWeek,
    // The roadmap day number of the content shown (differs from dayNumber when weeks 2 and 5 are swapped).
    contentDay: seed.day,
    block: seed.block,
    blockLabel: BLOCK_LABELS[seed.block],
    focus: seed.focus,
    hours,
    holiday: calendarSeed.holiday ?? null,
    conditional: seed.conditional ?? null,
    items: contentWeek.items.filter((i) => kinds.includes(i.kind)),
    networkItems: contentWeek.items.filter((i) => i.kind === 'network'),
    notes: contentWeek.notes,
    gate: date === PROJECT1_GATE ? 'Project 1 must work end to end today, or you freeze its scope.' : null,
  };
}

function nextStudyDay(date, settings) {
  for (let i = 1; i <= 2; i++) {
    const d = addDays(date, i);
    const ctx = getDayContext(d, settings);
    if (ctx.kind === 'study') return ctx;
  }
  return null;
}

function interviewPrepFor(date) {
  return INTERVIEW_PREP.find((p) => date >= p.start && date <= p.end)?.text ?? null;
}

/**
 * Returns the context for a date. `kind` is one of:
 * before | study | rest | bridge | bridge-rest | applications | after
 */
export function getDayContext(date, settings = {}) {
  if (!isValidDateString(date)) throw new Error(`Invalid date: ${date}`);
  const wd = weekday(date);

  if (date < PLAN_START) {
    return {
      date,
      kind: 'before',
      daysUntilStart: daysBetween(date, PLAN_START),
      preview: studyDayContext(PLAN_START, settings),
    };
  }

  if (date <= PLAN_END) {
    if (wd === 0) {
      const dayNumber = dayNumberFor(date);
      return {
        date,
        kind: 'rest',
        dayNumber,
        calendarWeek: calendarWeekFor(dayNumber),
        next: nextStudyDay(date, settings),
      };
    }
    return studyDayContext(date, settings);
  }

  const febReview = date >= FEB_REVIEW_WEEK && date <= addDays(FEB_REVIEW_WEEK, 6);
  const application = date >= APPLICATIONS_START && date <= APPLICATIONS_END && wd !== 0
    ? { blockLabel: BLOCK_LABELS.applications, ...APPLICATION_WEEK[wd] }
    : null;
  const interviewPrep = date >= APPLICATIONS_START ? interviewPrepFor(date) : null;

  if (date <= BRIDGE_END) {
    const phase = BRIDGE_PHASES.find((p) => date >= p.start && date <= p.end);
    if (phase.rest || wd === 0) {
      return { date, kind: 'bridge-rest', phase, sunday: wd === 0 && !phase.rest };
    }
    return { date, kind: 'bridge', blockLabel: BLOCK_LABELS.bridge, phase, application, interviewPrep, hours: null };
  }

  if (date <= APPLICATIONS_END) {
    if (wd === 0) return { date, kind: 'rest', applicationsPeriod: true };
    return { date, kind: 'applications', application, interviewPrep, febReview, hours: 2 };
  }

  return { date, kind: 'after' };
}

