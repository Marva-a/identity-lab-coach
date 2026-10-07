// Date checks. They prove the calendar rules without changing any data and
// run from Settings → "Run date checks" (or `node js/selftest.js`).
import { vancouverDate, addDays, weekday } from './dates.js';
import { getDayContext, dayNumberFor } from './plan.js';
import { WEEKS, PLAN_START } from './plan-data.js';

export function runDateChecks() {
  const results = [];
  const check = (name, actual, expected) => {
    results.push({ name, pass: actual === expected, actual, expected });
  };

  // Vancouver time, including the end of daylight saving (2 am PDT, Sun Nov 1, 2026).
  check('Oct 12, 11:30 pm PDT is still Oct 12', vancouverDate(new Date('2026-10-13T06:30:00Z')), '2026-10-12');
  check('Oct 13, 12:00 am PDT is Oct 13', vancouverDate(new Date('2026-10-13T07:00:00Z')), '2026-10-13');
  check('Nov 1, 1:30 am (before the change) is Nov 1', vancouverDate(new Date('2026-11-01T08:30:00Z')), '2026-11-01');
  check('Nov 1, 11:30 pm PST is still Nov 1', vancouverDate(new Date('2026-11-02T07:30:00Z')), '2026-11-01');
  check('Nov 2, 12:30 am PST is Nov 2', vancouverDate(new Date('2026-11-02T08:30:00Z')), '2026-11-02');

  // Plan days.
  const oct7 = getDayContext('2026-10-07');
  check('Oct 7 is before Day 1', oct7.kind, 'before');
  check('Oct 7 is 5 days before Day 1', oct7.daysUntilStart, 5);
  check('Oct 12 is Day 1', getDayContext('2026-10-12').dayNumber, 1);
  check('Day 1 is a 1-hour day', getDayContext('2026-10-12').hours, 1);
  check('Oct 15 (Day 4) is a Learn day', getDayContext('2026-10-15').block, 'learn');
  check('Oct 18 is a rest day', getDayContext('2026-10-18').kind, 'rest');
  check('Nov 2 is Day 22 (after the clock change)', getDayContext('2026-11-02').dayNumber, 22);
  check('Nov 21 is Day 41 with the Project 1 gate', Boolean(getDayContext('2026-11-21').gate), true);
  check('Dec 10 is Day 60', getDayContext('2026-12-10').dayNumber, 60);
  check('Dec 11 is in the bridge', getDayContext('2026-12-11').kind, 'bridge');
  check('Dec 24 is bridge rest', getDayContext('2026-12-24').kind, 'bridge-rest');
  check('Jan 5 adds the application system', Boolean(getDayContext('2027-01-05').application), true);
  check('Feb 16 is in the application review week', getDayContext('2027-02-16').febReview, true);

  // Every Sunday from Day 7 to Day 56 is a rest day.
  for (let day = 7; day <= 56; day += 7) {
    const date = addDays(PLAN_START, day - 1);
    check(`Day ${day} (${date}) is a Sunday rest day`, weekday(date) === 0 && getDayContext(date).kind === 'rest', true);
  }

  // Every seeded day's printed date matches its day number, and none is a Sunday.
  let seedMismatches = 0;
  let total = 0;
  for (const w of WEEKS) {
    let weekHours = 0;
    for (const d of w.days) {
      if (addDays(PLAN_START, d.day - 1) !== d.date || weekday(d.date) === 0 || dayNumberFor(d.date) !== d.day) seedMismatches++;
      weekHours += d.hours;
    }
    const budget = Object.values(w.budget).reduce((a, b) => a + b, 0);
    check(`Week ${w.number}: day hours match the ${budget} h budget`, weekHours, budget);
    total += weekHours;
  }
  check('Every seeded date matches its day number', seedMismatches, 0);
  check('52 study days', WEEKS.reduce((n, w) => n + w.days.length, 0), 52);
  check('103 planned hours in the 60 days', total, 103);

  // Swapping weeks 2 and 5 moves content but keeps dates and holidays.
  const swap = { swapWeeks2and5: true };
  check('Swap: Oct 19 shows week 5 content', getDayContext('2026-10-19', swap).week.number, 5);
  check('Swap: Nov 11 keeps Remembrance Day', getDayContext('2026-11-11', swap).holiday, 'Remembrance Day');
  check('Swap: Nov 11 is still Day 31', getDayContext('2026-11-11', swap).dayNumber, 31);

  return results;
}

// Allow `node js/selftest.js` from the project folder.
if (typeof process !== 'undefined' && process.argv?.[1]?.endsWith('selftest.js')) {
  const results = runDateChecks();
  for (const r of results) console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.name}${r.pass ? '' : ` (got ${r.actual}, expected ${r.expected})`}`);
  const failed = results.filter((r) => !r.pass).length;
  console.log(`\n${results.length - failed}/${results.length} passed`);
  if (failed) process.exitCode = 1;
}
