// Date checks. They prove the calendar rules without changing any data and
// run from Settings → "Run date checks" (or `node js/selftest.js`).
import { vancouverDate, addDays, weekday, TIME_ZONE } from './dates.js';
import { getDayContext, dayNumberFor } from './plan.js';
import { WEEKS, PLAN_START } from './plan-data.js';
import { nextState, initialState, replay, unlockDate, scheduleAll, pickInterleaved } from './srs.js';
import { SEED_CARDS } from './cards-data.js';
import { migrate, needsMigration, compareCounts } from './migrate.js';
import {
  countsFromDoc, validateArtifact, validateInteraction, validatePerson, isHttpUrl, UNASSIGNED_ID,
} from './records.js';
import {
  expectedHours, expectedArtifactsPeriod1, expectedFor, statusFor, countStudyDays, scorecard, PERIOD_1, PERIOD_2,
} from './pace.js';

const vancouverClock = new Intl.DateTimeFormat('en-CA', {
  timeZone: TIME_ZONE, hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});

/**
 * The instant when Vancouver wall clocks show `hh:mm` on `date`, using this
 * device's own time zone rules. Tries UTC−7 and UTC−8, so it works whether or
 * not the device knows BC stopped changing clocks in 2026.
 */
function vancouverInstant(date, hh, mm) {
  const [y, m, d] = date.split('-').map(Number);
  for (const offsetHours of [7, 8]) {
    const instant = new Date(Date.UTC(y, m - 1, d, hh + offsetHours, mm));
    if (vancouverDate(instant) === date && vancouverClock.format(instant) === `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`) {
      return instant;
    }
  }
  return null;
}

/** This device's UTC offset for Vancouver at an instant, for example "UTC−7". */
export function vancouverOffset(instant) {
  const name = new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE, timeZoneName: 'longOffset' })
    .formatToParts(instant).find((p) => p.type === 'timeZoneName')?.value ?? '';
  return name.replace('GMT', 'UTC').replace('-', '−');
}

export function runDateChecks() {
  const results = [];
  const check = (name, actual, expected) => {
    results.push({ name, pass: actual === expected, actual, expected });
  };

  // The date changes at local midnight in Vancouver, whatever clock rules this
  // device has. (BC stopped changing clocks in 2026 and stays on UTC−7; a
  // device with older time zone data still expects a change on Nov 1.)
  for (const [date, label] of [['2026-10-12', 'Oct 12'], ['2026-11-01', 'Nov 1'], ['2026-11-02', 'Nov 2'], ['2027-01-15', 'Jan 15']]) {
    const late = vancouverInstant(date, 23, 30);
    const early = vancouverInstant(date, 0, 30);
    check(`${label}, 11:30 pm Vancouver time is still ${label}`, late ? vancouverDate(late) : 'no such time', date);
    check(`${label}, 12:30 am Vancouver time is ${label}`, early ? vancouverDate(early) : 'no such time', date);
  }

  // The checks you asked for before Stage 3 (Vancouver wall-clock times).
  const nov1Late = vancouverInstant('2026-11-01', 23, 30);
  const nov1Ctx = nov1Late ? getDayContext(vancouverDate(nov1Late)) : null;
  check('Nov 1, 2026, 11:30 pm → Nov 1, Day 21, rest day',
    nov1Ctx ? `${nov1Ctx.date}, Day ${nov1Ctx.dayNumber}, ${nov1Ctx.kind}` : 'no such time', '2026-11-01, Day 21, rest');
  const nov2Early = vancouverInstant('2026-11-02', 0, 30);
  const nov2Ctx = nov2Early ? getDayContext(vancouverDate(nov2Early)) : null;
  check('Nov 2, 2026, 12:30 am → Nov 2, Day 22',
    nov2Ctx ? `${nov2Ctx.date}, Day ${nov2Ctx.dayNumber}` : 'no such time', '2026-11-02, Day 22');
  for (const [hh, label] of [[1, '1:30 am'], [3, '3:30 am']]) {
    const instant = vancouverInstant('2027-03-14', hh, 30);
    check(`Mar 14, 2027, ${label} → Mar 14`, instant ? vancouverDate(instant) : 'no such time', '2027-03-14');
  }

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

  // Flashcards: Leitner scheduling.
  const s0 = initialState();
  check('Cards: "Good" on a new card is due 1 day later', nextState(s0, 'good', '2026-10-12').due, '2026-10-13');
  check('Cards: "Easy" on a new card jumps to box 2 (3 days)', nextState(s0, 'easy', '2026-10-12').due, '2026-10-15');
  check('Cards: "Again" is due again the same day', nextState({ ...s0, box: 4 }, 'again', '2026-10-20').due, '2026-10-20');
  check('Cards: "Hard" keeps the box (box 3 = 7 days)', nextState({ ...s0, box: 3 }, 'hard', '2026-10-20').due, '2026-10-27');
  check('Cards: "Good" on Oct 31 into box 2 (3 days) is due Nov 3, not Nov 2 or Nov 4',
    nextState({ ...s0, box: 1 }, 'good', '2026-10-31').due, '2026-11-03');
  check('Cards: box 5 is the top (30 days)', nextState({ ...s0, box: 5 }, 'easy', '2026-11-02').due, '2026-12-02');
  const history = [
    { date: '2026-10-13', createdAt: 'b', rating: 'good' },
    { date: '2026-10-12', createdAt: 'a', rating: 'good' },
  ];
  check('Cards: reviews replay in date order (good, good → box 2, due Oct 16)', replay(history).due, '2026-10-16');
  check('Cards: week 4 unlocks Mon Nov 2', unlockDate(4, {}), '2026-11-02');
  check('Cards: with weeks 2 and 5 swapped, week 5 cards unlock Oct 19', unlockDate(5, { swapWeeks2and5: true }), '2026-10-19');
  const w4 = { id: 'x', week: 4, retired: false };
  check('Cards: a week 4 card is hidden on Sun Nov 1', scheduleAll([w4], [], '2026-11-01', {}).get('x').unlocked, false);
  check('Cards: a week 4 card is due on Mon Nov 2', scheduleAll([w4], [], '2026-11-02', {}).get('x').isDue, true);
  const mixed = [{ id: 'a', week: 3 }, { id: 'b', week: 3 }, { id: 'c', week: 1 }, { id: 'd', week: 2 }];
  check('Cards: the retrieval check mixes weeks', pickInterleaved(mixed, 3).map((c) => c.week).join(','), '3,1,2');
  check('Cards: about 40 seed cards', SEED_CARDS.length >= 38 && SEED_CARDS.length <= 46, true);
  check('Cards: every seed card has a reference', SEED_CARDS.every((c) => c.reference && c.week >= 1 && c.week <= 8), true);
  check('Cards: every week 1–8 has seed cards', [1, 2, 3, 4, 5, 6, 7, 8].every((w) => SEED_CARDS.some((c) => c.week === w)), true);

  // Scorecard pace (against the plan, not the calendar).
  check('Pace: 52 study days from Oct 12 to Dec 10', countStudyDays(PERIOD_1.start, PERIOD_1.end), 52);
  check('Pace: no hours expected on the morning of Day 1', expectedHours('2026-10-12'), 0);
  check('Pace: 1 h expected once Day 1 has ended', expectedHours('2026-10-13'), 1);
  check('Pace: 11 h expected on Sun Oct 18 (Week 1 done)', expectedHours('2026-10-18'), 11);
  check('Pace: a Sunday adds no hours (Sun Oct 18 = Mon Oct 19)', expectedHours('2026-10-19'), expectedHours('2026-10-18'));
  check('Pace: 103 planned hours once Dec 10 has ended', expectedHours('2026-12-11'), 103);
  check('Pace: no artifact expected before the first Saturday ends', expectedArtifactsPeriod1('2026-10-17'), 0);
  check('Pace: 1 artifact expected on Sun Oct 18', expectedArtifactsPeriod1('2026-10-18'), 1);
  check('Pace: 9 artifacts expected after Dec 10 (8 Saturdays + capstone)', expectedArtifactsPeriod1('2026-12-11'), 9);
  for (const m of ['conversation', 'application', 'referral']) {
    check(`Pace: a Sunday adds no ${m}s (Sun Oct 25 = Mon Oct 26)`,
      expectedFor(m, PERIOD_1, '2026-10-26'), expectedFor(m, PERIOD_1, '2026-10-25'));
  }
  check('Pace: no conversations expected during Week 1 (by Sun Oct 18)', expectedFor('conversation', PERIOD_1, '2026-10-18'), 0);
  check('Pace: no conversations expected on the morning of Oct 19', expectedFor('conversation', PERIOD_1, '2026-10-19'), 0);
  check('Pace: the conversation spread starts counting once Oct 19 has ended',
    expectedFor('conversation', PERIOD_1, '2026-10-20') > 0, true);
  check('Pace: applications still count from Oct 12 (spread unchanged)',
    expectedFor('application', PERIOD_1, '2026-10-13') > 0, true);
  check('Pace: the full 15 conversations are expected after Dec 10', expectedFor('conversation', PERIOD_1, '2026-12-11'), 15);
  check('Pace: the Dec 24 – Jan 1 rest adds nothing (Dec 24 = Jan 2)',
    expectedFor('conversation', PERIOD_2, '2027-01-02'), expectedFor('conversation', PERIOD_2, '2026-12-24'));
  check('Pace: Jan 31 targets use the low end (20 applications)', expectedFor('application', PERIOD_2, '2027-02-01'), 20);
  check('Status: 90% of expected is On track', statusFor(9, 10, { isCount: true }), 'on');
  check('Status: 80% is Behind', statusFor(8, 10, { isCount: true }), 'behind');
  check('Status: 60% is At risk', statusFor(6, 10, { isCount: true }), 'risk');
  check('Status: one short of 1 is Behind, not At risk', statusFor(0, 1, { isCount: true }), 'behind');
  check('Status: 0.8 of a conversation expected is still On track', statusFor(0, 0.8, { isCount: true }), 'on');
  const sat = [1, 2, 3, 4, 5, 6].map((i) => ({ date: `2026-10-${String(11 + i).padStart(2, '0')}`, minutes: i === 1 ? 60 : 120 }));
  const hoursStatus = (d) => scorecard(d, sat, {}).find((r) => r.id === 'hours').status;
  check('Status: with Week 1 fully logged, Sun Oct 18 is On track', hoursStatus('2026-10-18'), 'on');
  check('Status: and Mon Oct 19 morning is still On track', hoursStatus('2026-10-19'), 'on');

  // Stage 4: Evidence log, People log and the migration.
  const draft = { id: 'd', status: 'draft', createdDate: '2026-10-12', publishedDate: null };
  const pub = { id: 'p', status: 'published', createdDate: '2026-10-12', publishedDate: '2026-10-17' };
  check('Evidence: a draft does not count', countsFromDoc({ artifacts: [draft] }).artifact.length, 0);
  check('Evidence: a published artifact counts on its published date, not its created date',
    countsFromDoc({ artifacts: [draft, pub] }).artifact.join(','), '2026-10-17');
  const rowFor = (artifacts, date) => scorecard(date, [], countsFromDoc({ artifacts })).find((r) => r.id === 'artifact').actual;
  check('Evidence: created Oct 12 but published Oct 17 is not counted on Oct 14', rowFor([pub], '2026-10-14'), 0);
  check('Evidence: ...and is counted on Oct 17', rowFor([pub], '2026-10-17'), 1);
  const people = [{ id: 'x' }];
  const talks = [
    { id: 'i1', personId: 'x', type: 'conversation', date: '2026-10-20' },
    { id: 'i2', personId: 'x', type: 'referral', date: '2026-10-22' },
  ];
  check('People: conversations come from interactions by date',
    countsFromDoc({ people, interactions: talks }).conversation.join(','), '2026-10-20');
  check('People: referral asks come from interactions by date',
    countsFromDoc({ people, interactions: talks }).referral.join(','), '2026-10-22');
  check('Validation: a published artifact needs a published date',
    validateArtifact({ ...pub, publishedDate: null, title: 't', type: 'other', tags: ['a'] }).length > 0, true);
  check('Validation: published before created is refused',
    validateArtifact({ ...pub, publishedDate: '2026-10-01', title: 't', type: 'other', tags: ['a'] }).length > 0, true);
  check('Validation: a draft cannot have a published date',
    validateArtifact({ ...draft, publishedDate: '2026-10-20', title: 't', type: 'other', tags: ['a'] }).length > 0, true);
  check('Validation: four skill tags are refused',
    validateArtifact({ ...pub, title: 't', type: 'other', tags: ['a', 'b', 'c', 'd'] }).length > 0, true);
  check('Validation: a valid artifact passes',
    validateArtifact({ ...pub, title: 't', type: 'other', tags: ['PKCE'], url: 'https://example.com/x' }).length, 0);
  check('Links: https is allowed', isHttpUrl('https://example.com'), true);
  check('Links: javascript: is refused', isHttpUrl('javascript:alert(1)'), false);
  check('Validation: a follow-up before the interaction date is refused',
    validateInteraction({ personId: 'x', type: 'conversation', date: '2026-10-20', followUpDue: '2026-10-19' }).length > 0, true);
  check('Validation: a person needs a name and how you connected',
    validatePerson({ name: '', connection: '' }).length, 2);

  const stage3 = {
    schemaVersion: 3, app: 'identity-lab-coach',
    sessions: [{ id: 's', date: '2026-10-13', minutes: 60, status: 'done', reason: '' }],
    cards: [], cardReviews: [], artifacts: [], people: [], reviews: [], weekChecks: {},
    settings: { theme: 'system' },
    tallies: [
      { id: 'a1', kind: 'artifact', date: '2026-10-17', note: 'identity-lab README', testMode: true },
      { id: 'c1', kind: 'conversation', date: '2026-10-21', note: 'Chat', testMode: true },
      { id: 'c2', kind: 'conversation', date: '2026-10-23', note: '', testMode: false },
      { id: 'r1', kind: 'referral', date: '2026-10-25', note: 'asked', testMode: false },
      { id: 'p1', kind: 'application', date: '2026-10-26', note: 'Acme', testMode: false },
    ],
  };
  const before = JSON.stringify(stage3);
  const m1 = migrate(stage3, { now: new Date('2026-10-27T12:00:00Z') });
  check('Migration: a Stage 3 file needs it', needsMigration(stage3), true);
  check('Migration: succeeds', m1.ok, true);
  check('Migration: does not change its input', JSON.stringify(stage3), before);
  check('Migration: schema version becomes 4', m1.doc.schemaVersion, 4);
  const cb = countsFromDoc(stage3);
  const ca = countsFromDoc(m1.doc);
  for (const k of ['artifact', 'conversation', 'referral', 'application']) {
    check(`Migration: ${k} dates are unchanged`, ca[k].join(','), cb[k].join(','));
  }
  check('Migration: the artifact became a published Evidence record',
    m1.doc.artifacts.length === 1 && m1.doc.artifacts[0].status === 'published'
      && m1.doc.artifacts[0].publishedDate === '2026-10-17' && m1.doc.artifacts[0].title === 'identity-lab README', true);
  check('Migration: conversations and referral asks sit under one placeholder person',
    m1.doc.people.length === 1 && m1.doc.people[0].id === UNASSIGNED_ID && m1.doc.interactions.length === 3, true);
  check('Migration: applications stay as quick entries', m1.doc.tallies.map((t) => t.kind).join(','), 'application');
  check('Migration: test flags carry over', m1.doc.artifacts[0].testMode && m1.doc.interactions[0].testMode, true);
  const m2 = migrate(m1.doc);
  check('Migration: running it twice changes nothing', m2.changed === false && m2.doc === m1.doc, true);
  const half = JSON.parse(JSON.stringify(m1.doc));
  half.tallies.push(stage3.tallies[0], stage3.tallies[1]);
  const m3 = migrate(half);
  check('Migration: a half-finished state makes no duplicates',
    m3.ok && m3.doc.artifacts.length === 1 && m3.doc.interactions.length === 3 && m3.doc.tallies.length === 1, true);
  check('Migration: a failed check is detected',
    compareCounts(cb, { ...ca, conversation: ca.conversation.slice(1) }).length > 0, true);
  check('Migration: an invalid entry stops it', migrate({ schemaVersion: 3, tallies: [{ id: 'z', kind: 'artifact', date: 'nope' }] }).ok, false);
  check('Migration: a file with no entries still just upgrades', migrate({ schemaVersion: 2, sessions: [] }).doc.schemaVersion, 4);

  return results;
}

/** Information about this device's time zone data (not a pass/fail check). */
export function timeZoneInfo() {
  const offset = vancouverOffset(new Date('2026-12-01T20:00:00Z'));
  const current = offset === 'UTC−07:00';
  // 07:30 UTC on Nov 2, 2026 is the moment the Stage 1 check called "Nov 1, 11:30 pm PST".
  const shown = vancouverDate(new Date('2026-11-02T07:30:00Z'));
  const moment = `07:30 UTC on Nov 2, 2026 shows as ${shown} here`;
  return {
    offset,
    current,
    text: current
      ? `This device's time zone data is up to date: Vancouver stays on ${offset} after Nov 1, 2026, so ${moment} (12:30 am Vancouver time; PST no longer applies).`
      : `This device's time zone data is out of date: it puts Vancouver on ${offset} after Nov 1, 2026, but BC now stays on UTC−7, so ${moment} instead of 2026-11-02. Until the browser updates, the app's day changes at 1 am instead of midnight in winter.`,
  };
}

// Allow `node js/selftest.js` from the project folder.
if (typeof process !== 'undefined' && process.argv?.[1]?.endsWith('selftest.js')) {
  const results = runDateChecks();
  for (const r of results) console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.name}${r.pass ? '' : ` (got ${r.actual}, expected ${r.expected})`}`);
  const failed = results.filter((r) => !r.pass).length;
  console.log(`\n${results.length - failed}/${results.length} passed`);
  console.log(`Info: ${timeZoneInfo().text}`);
  if (failed) process.exitCode = 1;
}
