// Date logic. Every "date" in this app is a plain calendar-date string,
// "YYYY-MM-DD", in America/Vancouver time.
//
// Rules (agreed in the plan review):
// - "Today" is computed from the real clock with Intl in America/Vancouver,
//   never from the device's own time zone and never from UTC.
// - Day arithmetic treats each date string as UTC midnight. UTC has no daylight
//   saving, so the difference between two dates is always a whole number of
//   days. We never divide raw millisecond timestamps of local times by 86,400,000.

export const TIME_ZONE = 'America/Vancouver';

const MS_PER_DAY = 86_400_000;

const vancouverParts = new Intl.DateTimeFormat('en-CA', {
  timeZone: TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** The Vancouver calendar date for an instant (defaults to now). */
export function vancouverDate(instant = new Date()) {
  const parts = Object.fromEntries(
    vancouverParts.formatToParts(instant).map((p) => [p.type, p.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function isValidDateString(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}

function toUtcMidnight(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

function fromUtcMidnight(ms) {
  return new Date(ms).toISOString().slice(0, 10);
}

/** Whole days from a to b (b − a). */
export function daysBetween(a, b) {
  return Math.round((toUtcMidnight(b) - toUtcMidnight(a)) / MS_PER_DAY);
}

export function addDays(dateStr, n) {
  return fromUtcMidnight(toUtcMidnight(dateStr) + n * MS_PER_DAY);
}

/** 0 = Sunday … 6 = Saturday. */
export function weekday(dateStr) {
  return new Date(toUtcMidnight(dateStr)).getUTCDay();
}

/** The Monday on or before the date. */
export function mondayOf(dateStr) {
  const wd = weekday(dateStr);
  return addDays(dateStr, wd === 0 ? -6 : 1 - wd);
}

// Display formatting. The date string is formatted as UTC midnight with
// timeZone 'UTC', so the label can never shift by a day.
const longFormat = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'UTC',
  weekday: 'long',
  month: 'long',
  day: 'numeric',
  year: 'numeric',
});
const shortFormat = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'UTC',
  weekday: 'short',
  month: 'short',
  day: 'numeric',
});

export function formatLong(dateStr) {
  return longFormat.format(new Date(toUtcMidnight(dateStr)));
}

export function formatShort(dateStr) {
  return shortFormat.format(new Date(toUtcMidnight(dateStr)));
}
