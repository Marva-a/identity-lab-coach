// Date checks. They prove the calendar rules without changing any data and
// run from Settings → "Run date checks" (or `node js/selftest.js`).
import { vancouverDate, addDays, weekday, TIME_ZONE } from './dates.js';
import { getDayContext, dayNumberFor } from './plan.js';
import {
  WEEKS, PLAN_START, PLAN_VERSION, PLAN_ID_HISTORY, renameChecks, SCORECARD_TARGETS, itemIsOptional, extraTimeLabel,
} from './plan-data.js';
import { nextState, initialState, replay, unlockDate, cardUnlockDate, scheduleAll, pickInterleaved, recallState, recallSummary } from './srs.js';
import { SEED_CARDS, SEED_TEACH_DAYS } from './cards-data.js';
import { migrate, needsMigration, compareCounts } from './migrate.js';
import { evidenceToMarkdown, escapeMd } from './evidence-md.js';
import { parseResourceImport } from './resource-import.js';
import { courseProgress } from './progress.js';
import { STATUS_LABELS } from './pace.js';
import { resolveHash, ROUTES, SECTIONS, LEGACY_HASHES } from './routes.js';
import {
  validateManifest, parseCardPack, planContent, summarizePlan, contentUrl, CONTENT_REQUEST_INIT, parseGuidancePack, parseLessonPack, planSize,
} from './content.js';
import { stepIndex, nextStep, previousStep, STEPS } from './session-flow.js';
import { datedFilesToRemove, snapshotsToRemove, datedName, isOurDatedFile, KEEP_FILES, KEEP_SNAPSHOTS } from './backup-files.js';
import {
  countsFromDoc, validateArtifact, validateInteraction, validatePerson, isHttpUrl, UNASSIGNED_ID,
  ARTIFACT_CATEGORIES, categoryCoverage, categoryLabel, splitDeep, levelRank, RESOURCE_LEVELS,
  SUGGESTED_SKILL_TAGS, validateResource, orderResources, totalMinutes, remainingMinutes, optionalMinutes, parseDays, findSameLink,
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
  // Recall is only asked for after the plan has taught the topic (the day after its teaching day).
  const aaa = { id: 'aaa', week: 1, seedId: 'w1-aaa', retired: false };
  const jml = { id: 'jml', week: 1, seedId: 'w1-jml', retired: false };
  check('Cards: the AuthN/AuthZ card (taught Day 2) is not asked on Day 1', scheduleAll([aaa], [], '2026-10-12', {}).get('aaa').isDue, false);
  check('Cards: the AuthN/AuthZ card first comes up on Day 3', cardUnlockDate(aaa, {}), '2026-10-14');
  check('Cards: the lifecycle card (taught Day 4) first comes up on Day 5', cardUnlockDate(jml, {}), '2026-10-16');
  check('Cards: the flow-logs cards wait for their Day 46 reading (first up Nov 27)', cardUnlockDate({ week: 6, seedId: 'w6-flow-logs' }, {}), '2026-11-27');
  check('Cards: with weeks 2 and 5 swapped, a Day 30 card comes up on Day 10 (Oct 21)', cardUnlockDate({ week: 5, seedId: 'w5-zero-trust' }, { swapWeeks2and5: true }), '2026-10-21');
  check('Cards: a seed card you moved to another week follows your week', cardUnlockDate({ week: 3, seedId: 'w1-aaa' }, {}), '2026-10-26');
  check('Cards: a card you added unlocks on its week\'s Monday', cardUnlockDate({ week: 4, seedId: null }, {}), '2026-11-02');
  check('Cards: every seed card has a teaching day in or after its week, on a study day',
    SEED_CARDS.every((c) => {
      const d = SEED_TEACH_DAYS[c.seedId];
      return Number.isInteger(d) && d >= (c.week - 1) * 7 + 1 && d <= 60 && d % 7 !== 0;
    }), true);
  // What you can recall: "held" needs a Good or Easy after a gap of 7+ days; a high box alone is not enough.
  const rv = (date, rating, n = 'a') => ({ cardId: 'c', date, rating, createdAt: `${date}${n}` });
  check('Recall: no reviews is "not tried yet"', recallState([]), 'new');
  check('Recall: last rating Hard is "needs another look"', recallState([rv('2026-10-14', 'good'), rv('2026-10-21', 'hard')]), 'shaky');
  check('Recall: two Easy ratings four days apart are not "held"', recallState([rv('2026-10-14', 'easy'), rv('2026-10-18', 'easy')]), 'recent');
  check('Recall: Good after a 7-day gap is "held"', recallState([rv('2026-10-14', 'again'), rv('2026-10-14', 'good', 'b'), rv('2026-10-21', 'good')]), 'held');
  check('Recall: a later Again turns "held" back into "needs another look"', recallState([rv('2026-10-14', 'good'), rv('2026-10-21', 'good'), rv('2026-11-04', 'again')]), 'shaky');
  {
    const cards = [{ id: 'c', week: 1, seedId: 'w1-aaa' }, { id: 'j', week: 1, seedId: 'w1-jml' }, { id: 'r', week: 1, retired: true }];
    const sum = recallSummary(cards, [rv('2026-10-14', 'again')], '2026-10-14', {});
    check('Recall: only taught, unretired cards count (lifecycle is taught on Day 4)', [sum.totals.total, sum.totals.shaky, sum.shaky.length].join(), '1,1,1');
  }
  const mixed = [{ id: 'a', week: 3 }, { id: 'b', week: 3 }, { id: 'c', week: 1 }, { id: 'd', week: 2 }];
  check('Cards: the retrieval check mixes weeks', pickInterleaved(mixed, 3).map((c) => c.week).join(','), '3,1,2');
  check('Cards: 45 original seed cards plus 20 for Weeks 5 and 6', SEED_CARDS.length, 65);
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
  check('Migration: schema version becomes 5', m1.doc.schemaVersion, 5);
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
  check('Migration: a file with no entries still just upgrades', migrate({ schemaVersion: 2, sessions: [] }).doc.schemaVersion, 5);

  // Evidence: maturity, project and the Markdown export (they must never change the counts).
  const richPub = { ...pub, title: 'T', type: 'threat-model', tags: ['PKCE'], maturity: 'implemented', project: 'project-1' };
  const richDraft = { ...draft, title: 'D', type: 'other', tags: ['x'], maturity: 'conceptual', project: 'project-2' };
  check('Evidence: maturity and project do not change the scorecard counts',
    JSON.stringify(countsFromDoc({ artifacts: [richPub, richDraft] })), JSON.stringify(countsFromDoc({ artifacts: [pub, draft] })));
  check('Evidence: the scorecard rows are identical with or without them',
    scorecard('2026-12-11', [], countsFromDoc({ artifacts: [richPub, richDraft] })).map((r) => r.actual).join(','),
    scorecard('2026-12-11', [], countsFromDoc({ artifacts: [pub, draft] })).map((r) => r.actual).join(','));
  const okBase = { ...pub, title: 't', type: 'other', tags: ['a'] };
  check('Maturity: a published artifact needs one when saving', validateArtifact(okBase, { requireMaturity: true }).length > 0, true);
  check('Maturity: a draft does not need one yet', validateArtifact({ ...draft, title: 't', type: 'other', tags: ['a'] }, { requireMaturity: true }).length, 0);
  check('Maturity: an older published record without one still imports', validateArtifact(okBase).length, 0);
  check('Maturity: a made-up value is refused', validateArtifact({ ...okBase, maturity: 'done' }).length > 0, true);
  check('Project: a made-up value is refused', validateArtifact({ ...okBase, project: 'project-9' }).length > 0, true);
  check('Maturity: converted entries stay empty', m1.doc.artifacts[0].maturity === '' && m1.doc.artifacts[0].project === '', true);
  const md = evidenceToMarkdown([
    { ...richPub, url: 'https://example.com/x', reflection: 'It worked.\nNext: *measure* it.' },
    richDraft,
    { ...pub, id: 'q', title: 'Older entry', type: 'other', publishedDate: '2026-10-10', tags: [], maturity: '', project: '' },
  ], { exportedOn: '2026-10-29' });
  check('Markdown: drafts are never included', md.includes('## D'), false);
  check('Markdown: oldest published item comes first', md.indexOf('Older entry') < md.indexOf('## T'), true);
  check('Markdown: it names title, type, project, maturity, date, skills, link and reflection',
    ['## T', '**Type:** Threat model', '**Project:** Project 1', '**How real:** Built and working', '**Shared:** 2026-10-17', '**Skills:** PKCE', '<https://example.com/x>', '**What I learned.** It worked.'].every((x) => md.includes(x)), true);
  check('Markdown: missing maturity and project say "Not set"', md.includes('**How real:** Not set') && md.includes('**Project:** Not set'), true);
  check('Markdown: text is escaped so it shows as written', escapeMd('a *b* _c_ [d]') === 'a \\*b\\* \\_c\\_ \\[d\\]' && escapeMd('# not a heading') === '\\# not a heading', true);
  check('Markdown: a link that is not http(s) is left out', evidenceToMarkdown([{ ...richPub, url: 'javascript:alert(1)' }]).includes('javascript'), false);

  // Stage 4b: Content library.
  const good = { title: 'A real title', source: 'Some author', type: 'article', minutes: 30, url: 'https://oauth.net/2/', days: [8, 9] };
  check('Library: a complete resource is valid', validateResource(good).length, 0);
  check('Library: a resource with no link is valid (empty link)', validateResource({ ...good, url: '' }).length, 0);
  check('Library: a resource with a missing link (null) is valid', validateResource({ ...good, url: null }).length, 0);
  check('Library: a link that is given must be http(s)', validateResource({ ...good, url: 'javascript:alert(1)' }).length > 0, true);
  check('Library: a link without a scheme is refused', validateResource({ ...good, url: 'oauth.net/2' }).length > 0, true);
  check('Library: placeholder addresses (example.com) are still refused', validateResource({ ...good, url: 'https://example.com/a' }).length > 0, true);
  check('Library: placeholder subdomains are refused too', validateResource({ ...good, url: 'https://docs.example.org/a' }).length > 0, true);
  check('Library: a Sunday (Day 14) is not a plan day', validateResource({ ...good, days: [14] }).length > 0, true);
  check('Library: Day 61 is not a plan day', validateResource({ ...good, days: [61] }).length > 0, true);
  check('Library: minutes must be a whole number', validateResource({ ...good, minutes: 2.5 }).length > 0, true);
  check('Library: type must be one of the five', validateResource({ ...good, type: 'podcast' }).length > 0, true);
  check('Library: "optional" must be true or false', validateResource({ ...good, optional: 'yes' }).length > 0, true);
  check('Library: "verified" with no link is a contradiction', validateResource({ ...good, url: '', urlStatus: 'verified' }).length > 0, true);
  check('Library: "needs-your-search" with no link is fine', validateResource({ ...good, url: '', urlStatus: 'needs-your-search' }).length, 0);
  check('Library: days "8, 9 10" read as three days', parseDays('8, 9 10').days.join(','), '8,9,10');
  check('Library: a word in the days is reported', parseDays('8, x').problems.length, 1);

  // Same link: a warning to look at, never a reason to refuse, and a missing link is never a duplicate.
  const lib = [{ id: 'a', url: 'https://oauth.net/2/' }, { id: 'b', url: '' }, { id: 'c', url: '' }];
  check('Same link: found when another resource uses it (ignoring # and a trailing slash)', findSameLink(lib, 'https://oauth.net/2#x', 'z').length, 1);
  check('Same link: not found for the resource itself', findSameLink(lib, 'https://oauth.net/2/', 'a').length, 0);
  check('Same link: a missing link is not a duplicate of another missing link', findSameLink(lib, '', 'b').length, 0);

  const file = (rows, schema = 'identity-lab-coach.resources.v1') => JSON.stringify({ schema, resources: rows });
  const row = (over = {}) => ({
    id: 'r1', title: 'T', source: 'S', type: 'video', estimatedMinutes: 20, url: 'https://oauth.net/a', planDays: [8], ...over,
  });
  const okImport = parseResourceImport(file([row(), row({ id: 'r2', title: 'U', url: 'https://oauth.net/b', planDays: [9, 10], optional: true, why: 'Because', urlStatus: 'verified', verifiedNote: 'Fetched' })]));
  check('Import: two good entries are accepted', okImport.ok && okImport.rows.length === 2, true);
  check('Import: planDays, estimatedMinutes and optional are read into the record',
    okImport.rows[1].days.join() === '9,10' && okImport.rows[1].minutes === 20 && okImport.rows[1].optional === true, true);
  const nullLink = parseResourceImport(file([row({ id: 'n1', url: null, urlStatus: 'needs-your-search', verifiedNote: 'No link confirmed' })]));
  check('Import: "url": null is accepted', nullLink.ok && nullLink.rows.length === 1, true);
  check('Import: a null link becomes an empty link that needs a search', nullLink.rows[0].url === '' && nullLink.rows[0].urlStatus === 'needs-your-search', true);
  check('Import: it counts the entries that need a link', nullLink.needLink, 1);
  check('Import: the link note is kept', nullLink.rows[0].verifiedNote, 'No link confirmed');
  check('Import: a null link without urlStatus defaults to needs-your-search',
    parseResourceImport(file([row({ id: 'n2', url: null })])).rows[0].urlStatus, 'needs-your-search');
  check('Import: a link without urlStatus is "unchecked", never "verified"', parseResourceImport(file([row()])).rows[0].urlStatus, 'unchecked');
  check('Import: the schema must match', parseResourceImport(file([row()], 'something.else')).fileProblems.length, 1);
  check('Import: a file with no schema is refused', parseResourceImport(JSON.stringify({ resources: [row()] })).fileProblems.length, 1);
  check('Import: invalid JSON is reported', parseResourceImport('{oops').fileProblems.length, 1);
  check('Import: an empty list is reported', parseResourceImport(file([])).fileProblems.length, 1);
  const bad = parseResourceImport(file([
    row(), row({ id: 'bad-minutes', estimatedMinutes: 'twenty', url: 'https://oauth.net/b' }),
    row({ id: 'bad-day', url: 'https://oauth.net/c', planDays: [14] }),
    row({ id: 'bad-field', url: 'https://oauth.net/d', colour: 'red' }),
    row({ id: 'bad-link', url: 'ftp://oauth.net/e' }),
    row({ id: 'no-url-key', url: undefined }),
    row({ id: 'r1', title: 'again', url: 'https://oauth.net/f' }),
  ]));
  check('Import: it names each wrong entry by its id', bad.rowProblems.map((p) => p.id).join(','), 'bad-minutes,bad-day,bad-field,bad-link,no-url-key,r1');
  check('Import: a wrong file imports nothing and says so', bad.ok === false, true);
  check('Import: an unknown field is named', bad.rowProblems.find((p) => p.id === 'bad-field').messages.some((m) => m.includes('"colour"')), true);
  check('Import: a missing "url" key says to use null', bad.rowProblems.find((p) => p.id === 'no-url-key').messages.some((m) => m.includes('null')), true);
  check('Import: a repeated id is reported', bad.rowProblems.find((p) => p.id === 'r1').messages.some((m) => m.includes('Duplicate id')), true);
  check('Import: placeholder addresses are refused', parseResourceImport(file([row({ url: 'https://example.com/replace' })])).ok, false);

  // Matching by id: a second import adds nothing, and nothing already in the library is changed.
  const first = parseResourceImport(file([row(), row({ id: 'r2', url: null })]));
  const second = parseResourceImport(file([row({ title: 'EDITED IN FILE' }), row({ id: 'r2', url: 'https://oauth.net/new-link' })]),
    first.rows.map((r) => ({ id: r.id, title: r.title })));
  check('Re-import: entries already in the library are skipped by id', second.ok && second.rows.length === 0 && second.skipped.length === 2, true);

  // Sharing a link is a warning, not an error (your file has one page used by two entries).
  const shared = parseResourceImport(file([row(), row({ id: 'r2', title: 'Second use', planDays: [24] })]));
  check('Same link in a file: both entries are still accepted', shared.ok && shared.rows.length === 2, true);
  check('Same link in a file: it is flagged as a warning on the later entry', shared.warnings.length === 1 && shared.warnings[0].id === 'r2', true);
  const twoNull = parseResourceImport(file([row({ id: 'x1', url: null }), row({ id: 'x2', url: null })]));
  check('Missing links are not duplicates of each other', twoNull.ok && twoNull.warnings.length === 0, true);
  const vsLibrary = parseResourceImport(file([row({ id: 'fresh' })]), [{ id: 'old', title: 'Old one', url: 'https://oauth.net/a' }]);
  check('Same link as the library: accepted with a warning', vsLibrary.ok && vsLibrary.rows.length === 1 && vsLibrary.warnings.length === 1, true);

  const list = [
    { id: 'a', status: 'done', minutes: 10, position: 1 },
    { id: 'b', status: 'not-started', minutes: 20, position: 2 },
    { id: 'c', status: 'in-progress', minutes: 30, position: 3 },
    { id: 'd', status: 'not-started', minutes: 5, position: 4 },
    { id: 'e', status: 'not-started', minutes: 15, position: 0, optional: true },
  ];
  check('Do this next: in progress, then required, then optional, then done', orderResources(list).map((r) => r.id).join(''), 'cbdea');
  check('Do this next: total estimated minutes', totalMinutes(list), 80);
  check('Do this next: minutes still to do leave out done and optional ones', remainingMinutes(list), 55);
  check('Do this next: optional minutes are counted on their own', optionalMinutes(list), 15);
  check('Swap: Oct 19 shows week 5 resources (roadmap Day 29)', getDayContext('2026-10-19', { swapWeeks2and5: true }).contentDay, 29);
  check('Swap: with no swap, Oct 19 is roadmap Day 8', getDayContext('2026-10-19', {}).contentDay, 8);
  const withResources = { artifacts: [pub], interactions: [], tallies: [], resources: [{ ...good, id: 'r', status: 'done', minutes: 120 }] };
  check('Hours: resource minutes never count as hours or change the scorecard',
    scorecard('2026-10-18', [], countsFromDoc(withResources)).find((r) => r.id === 'hours').actual, 0);

  // Plan text version 2 (revised roadmap): nothing you ticked or logged can be lost.
  const itemIds = new Set(WEEKS.flatMap((w) => w.items.map((i) => i.id)));
  const item = (id) => WEEKS.flatMap((w) => w.items).find((i) => i.id === id);
  check('Plan: the plan text is version 4', PLAN_VERSION, 4);
  check('Plan: every item id from version 1 still exists (so every saved tick still matches)',
    PLAN_ID_HISTORY[1].filter((id) => !itemIds.has(id)).length, 0);
  check('Plan: item ids are unique', itemIds.size, WEEKS.reduce((n, w) => n + w.items.length, 0));
  check('Plan: weekly hour budgets are unchanged (11, 12 ×7, 8)', WEEKS.map((w) => Object.values(w.budget).reduce((a, b) => a + b, 0)).join(','), '11,12,12,12,12,12,12,12,8');
  check('Plan: planned hours are still 103 in total', WEEKS.reduce((n, w) => n + w.days.reduce((m, d) => m + d.hours, 0), 0), 103);
  check('Plan: scorecard targets are unchanged', JSON.stringify(SCORECARD_TARGETS.map((t) => [t.hours ?? null, t.artifacts, t.conversations, t.applications.join('-'), t.referralAsks.join('-')])),
    JSON.stringify([[100, 9, 15, '3-6', '2-3'], [null, 12, 25, '20-30', '10-10']]));
  check('Plan: Week 5 is renamed', WEEKS[4].title, 'Zero Trust and network security foundations');
  check('Plan: Week 6 is renamed', WEEKS[5].title, 'Cloud security foundations, IAM and secrets');
  check('Plan: Week 5 Learn now covers TCP/IP layers, mutual TLS and policy points', ['TCP/IP layers', 'mutual TLS', 'policy decision and enforcement points'].every((t) => item('w5-learn-1').text.includes(t)), true);
  const extras = ['w1-read-3', 'w4-read-3', 'w5-practice-2', 'w6-read-3', 'w6-practice-4', 'w6-apply-2', 'w7-apply-2', 'w8-read-3', 'w8-read-4'];
  check('Plan: every addition marked "extra" is an Optional item', extras.every((id) => item(id)?.optional === true), true);
  const required = ['w3-evidence-2', 'w5-read-3', 'w5-evidence-2', 'w6-learn-2', 'w6-evidence-2', 'w7-learn-2', 'w8-learn-2'];
  check('Plan: additions not marked "extra" are required items', required.every((id) => item(id) && !item(id).optional), true);
  check('Plan: Week 5 and 6 each gained an Optional exercise (21 and 22)', `${item('w5-practice-2').exercises} ${item('w6-practice-4').exercises}`, '21 22');
  const ticks = { 'w5-learn-1': { at: 'x' }, 'w1-read-1': { at: 'y' } };
  check('Plan migration: with no renames your ticks are exactly as they were', JSON.stringify(renameChecks(ticks, {})), JSON.stringify(ticks));
  check('Plan migration: a renamed item keeps its tick on the new id', JSON.stringify(renameChecks(ticks, { 'w5-learn-1': 'w5-learn-9' })),
    JSON.stringify({ 'w1-read-1': { at: 'y' }, 'w5-learn-9': { at: 'x' } }));
  check('Plan migration: a tick already on the new id is not overwritten', renameChecks({ a: { at: '1' }, b: { at: '2' } }, { a: 'b' }).b.at, '2');
  const newCards = SEED_CARDS.slice(45);
  check('Cards: 20 new cards, all unlocking in Week 5 or 6', newCards.length === 20 && newCards.every((c) => c.week === 5 || c.week === 6), true);
  check('Cards: every new card has a reference and a question and answer', newCards.every((c) => c.reference && c.front && c.back), true);
  check('Cards: seed data never marks a card verified', SEED_CARDS.every((c) => !('verified' in c)), true);
  check('Cards: seed ids are unique, so re-seeding cannot duplicate', new Set(SEED_CARDS.map((c) => c.seedId)).size, SEED_CARDS.length);
  check('Skill tags: the five new suggestions are offered', ['network-security', 'cloud-security', 'zero-trust', 'segmentation', 'workload-identity'].every((t) => SUGGESTED_SKILL_TAGS.includes(t)), true);

  // Course home and the guided session.
  const emptyData = (over = {}) => ({ settings: {}, sessions: [], weekChecks: {}, resources: [], ...over });
  const cp = (data, today) => courseProgress(emptyData(data), { today });
  const w1Required = WEEKS[0].items.filter((i) => !i.optional && !i.conditional);
  check('Course: nine weeks are listed', cp({}, '2026-10-14').weeks.length, 9);
  check('Course: with nothing ticked, progress is 0%', cp({}, '2026-10-14').percent, 0);
  check('Course: the current week is found by date', cp({}, '2026-10-14').weeks.map((w) => w.state).join(','), 'current,upcoming,upcoming,upcoming,upcoming,upcoming,upcoming,upcoming,upcoming');
  check('Course: Sunday still belongs to the week that just ended', cp({}, '2026-10-18').weeks[0].state, 'current');
  check('Course: Monday starts the next week', `${cp({}, '2026-10-19').weeks[0].state} ${cp({}, '2026-10-19').weeks[1].state}`, 'past current');
  const ticksOf = (ids) => Object.fromEntries(ids.map((id) => [id, { at: 'x' }]));
  const allW1 = cp({ weekChecks: ticksOf(w1Required.map((i) => i.id)) }, '2026-10-14');
  check('Course: ticking every required item of a week fills its bar', `${allW1.weeks[0].requiredTicked}/${allW1.weeks[0].required}`, `${w1Required.length}/${w1Required.length}`);
  check('Course: an Optional item never counts toward required progress', cp({ weekChecks: ticksOf(['w1-read-3']) }, '2026-10-14').weeks[0].requiredTicked, 0);
  check('Course: the Optional tick is still shown separately', cp({ weekChecks: ticksOf(['w1-read-3']) }, '2026-10-14').weeks[0].extraTicked, 1);
  check('Course: overall percent follows the ticks', cp({ weekChecks: ticksOf(['w1-learn-1']) }, '2026-10-14').requiredTicked, 1);
  check('Course: hours are only that calendar week’s sessions',
    cp({ sessions: [{ date: '2026-10-13', minutes: 100 }, { date: '2026-10-19', minutes: 50 }] }, '2026-10-20').weeks.map((w) => w.loggedMinutes).slice(0, 2).join(','), '100,50');
  check('Course: planned minutes come from the week budget (Week 1 is 11 h)', cp({}, '2026-10-14').weeks[0].plannedMinutes, 660);
  const resDay29 = { id: 'r1', days: [29], status: 'done', minutes: 30, retired: false };
  check('Course: a resource counts in the week its roadmap day belongs to', cp({ resources: [resDay29] }, '2026-11-09').weeks[4].resourcesTotal, 1);
  check('Course: a done resource is counted as done', cp({ resources: [resDay29] }, '2026-11-09').weeks[4].resourcesDone, 1);
  check('Course: a retired resource is left out', cp({ resources: [{ ...resDay29, retired: true }] }, '2026-11-09').weeks[4].resourcesTotal, 0);
  check('Course: with weeks 2 and 5 swapped, a Week 5 resource shows in calendar week 2',
    cp({ settings: { swapWeeks2and5: true }, resources: [resDay29] }, '2026-10-19').weeks[1].resourcesTotal, 1);
  check('Continue: before the plan starts it points at Week 1’s first item', `${cp({}, '2026-10-07').next.weekNumber} ${cp({}, '2026-10-07').next.text.slice(0, 14)}`, '1 Authentication');
  check('Continue: it points at the first required item not yet ticked', cp({ weekChecks: ticksOf(['w1-learn-1']) }, '2026-10-14').next.text, WEEKS[0].items.find((i) => i.id === 'w1-read-1').text);
  check('Continue: this week comes before an earlier unfinished week', cp({}, '2026-10-21').next.weekNumber, 2);
  check('Continue: when this week is done it returns to an earlier unfinished week',
    cp({ weekChecks: ticksOf(WEEKS[1].items.filter((i) => !i.optional && !i.conditional).map((i) => i.id)) }, '2026-10-21').next.weekNumber, 1);
  const everything = ticksOf(WEEKS.flatMap((w) => w.items.filter((i) => !i.optional && !i.conditional).map((i) => i.id)));
  check('Continue: when every required item is ticked there is nothing to continue', cp({ weekChecks: everything }, '2026-12-11').next, null);
  check('Course: planned-so-far hours match the scorecard’s expected hours', cp({}, '2026-10-19').plannedSoFarMinutes, 660);
  check('Session: the steps are warm-up, focus, wrap-up', STEPS.map((x) => x.id).join(','), 'warmup,focus,wrapup');
  check('Session: next moves forward and stops at the end', `${nextStep('warmup')} ${nextStep('focus')} ${nextStep('wrapup')}`, 'focus wrapup wrapup');
  check('Session: back moves backward and stops at the start', `${previousStep('wrapup')} ${previousStep('focus')} ${previousStep('warmup')}`, 'focus warmup warmup');
  check('Session: an unknown step falls back to the first', stepIndex('nonsense'), 0);

  // Automatic backups: only our own dated files are ever pruned.
  const many = Array.from({ length: 20 }, (_, i) => datedName(`2026-10-${String(i + 1).padStart(2, '0')}`));
  const folder = [...many, 'identity-lab-coach-latest.json', 'my-notes.txt', 'identity-lab-coach-2026-10-5.json', 'taxes-2026-10-01.json'];
  const gone = datedFilesToRemove(folder);
  check('Backups: the newest 14 dated files are kept (6 removed)', `${KEEP_FILES} ${gone.length}`, '14 6');
  check('Backups: it removes the six oldest', [...gone].sort().join(','), many.slice(0, 6).join(','));
  check('Backups: the "latest" file is never removed', gone.includes('identity-lab-coach-latest.json'), false);
  check('Backups: files that are not ours are never touched', ['my-notes.txt', 'identity-lab-coach-2026-10-5.json', 'taxes-2026-10-01.json'].some((n) => gone.includes(n)), false);
  check('Backups: only exact dated names count as ours', `${isOurDatedFile('identity-lab-coach-2026-10-05.json')} ${isOurDatedFile('identity-lab-coach-latest.json')}`, 'true false');
  check('Snapshots: the newest 14 days are kept', `${KEEP_SNAPSHOTS} ${snapshotsToRemove(many.map((n) => n.slice(18, 28))).length}`, '14 6');
  check('Snapshots: nothing is removed under the limit', snapshotsToRemove(['2026-10-01', '2026-10-02']).length, 0);

  // Content packs.
  const mpack = (over = {}) => ({ id: 'res-one', title: 'Resources one', version: 1, type: 'resources', path: 'res-one.json', ...over });
  const mani = (packs) => ({ schema: 'identity-lab-coach.content-manifest.v1', packs });
  check('Manifest: a good manifest passes', validateManifest(mani([mpack(), mpack({ id: 'cards-one', type: 'cards', path: 'cards-one.json' })])).ok, true);
  check('Manifest: a wrong schema is refused', validateManifest({ ...mani([mpack()]), schema: 'x' }).ok, false);
  check('Manifest: a path with a folder is refused', validateManifest(mani([mpack({ path: 'sub/res.json' })])).ok, false);
  check('Manifest: a path that climbs out of the folder is refused', validateManifest(mani([mpack({ path: '../app.json' })])).ok, false);
  check('Manifest: a link to another site is refused', validateManifest(mani([mpack({ path: 'https://evil.example/x.json' })])).ok, false);
  check('Manifest: an unknown pack type is refused', validateManifest(mani([mpack({ type: 'videos' })])).ok, false);
  check('Manifest: version must be a whole number from 1', validateManifest(mani([mpack({ version: 0 })])).ok, false);
  check('Manifest: a repeated pack id is refused', validateManifest(mani([mpack(), mpack({ path: 'other.json' })])).ok, false);
  const cardRow = (over = {}) => ({ id: 'c-1', front: 'Q?', back: 'A.', type: 'recall', weekTag: 5, reference: 'RFC 1', verified: false, ...over });
  const cardFile = (cards) => JSON.stringify({ schema: 'identity-lab-coach.cards.v1', cards });
  check('Card pack: a good card passes', parseCardPack(cardFile([cardRow()])).ok, true);
  check('Card pack: an empty pack is fine', parseCardPack(cardFile([])).ok, true);
  check('Card pack: a card with no reference is refused', parseCardPack(cardFile([cardRow({ reference: '' })])).ok, false);
  check('Card pack: weekTag must be 1 to 9', parseCardPack(cardFile([cardRow({ weekTag: 10 })])).ok, false);
  check('Card pack: type must be recall or explain', parseCardPack(cardFile([cardRow({ type: 'quiz' })])).ok, false);
  check('Card pack: a repeated id is refused', parseCardPack(cardFile([cardRow(), cardRow()])).ok, false);
  check('Card pack: in the app a "verified: true" is ignored, the card is unverified', parseCardPack(cardFile([cardRow({ verified: true })])).cards[0].verified, false);
  check('Card pack: the build check refuses "verified: true"', parseCardPack(cardFile([cardRow({ verified: true })]), { strictVerified: true }).ok, false);
  check('Card pack: the card is named by its id and carries its week', `${parseCardPack(cardFile([cardRow()])).cards[0].id} ${parseCardPack(cardFile([cardRow()])).cards[0].week}`, 'c-1 5');

  const resRow = (id, over = {}) => ({ id, title: `T ${id}`, source: 'S', type: 'article', estimatedMinutes: 20, url: `https://oauth.net/${id}`, planDays: [8], ...over });
  const resFile = (rows) => JSON.stringify({ schema: 'identity-lab-coach.resources.v1', resources: rows });
  const packs = {
    content: {
      manifest: mani([mpack(), mpack({ id: 'cards-one', type: 'cards', path: 'cards-one.json', title: 'Cards one' })]),
      packTexts: { 'res-one': resFile([resRow('a'), resRow('b'), resRow('c')]), 'cards-one': cardFile([cardRow({ id: 'k1' }), cardRow({ id: 'k2', verified: true })]) },
    },
  };
  const nothing = { resources: [], cards: [] };
  const firstPlan = planContent(packs.content, nothing);
  check('Content: with nothing yet, everything in the packs is new', `${firstPlan.resources.length} ${firstPlan.cards.length}`, '3 2');
  check('Content: the summary says what is ready', summarizePlan(firstPlan), 'Ready to add 3 resources and 2 flashcards');
  check('Content: pack cards are always unverified, even if the file says true', firstPlan.cards.every((c) => c.verified === false), true);
  const haveSome = { resources: [{ id: 'a', title: 'MY EDITED TITLE', url: '', status: 'done', notes: 'mine' }], cards: [{ id: 'uuid-1', seedId: 'k1' }] };
  const secondPlan = planContent(packs.content, haveSome);
  check('Content: only new ids are planned (a, and card k1, are already yours)', `${secondPlan.resources.map((r) => r.id)} ${secondPlan.cards.map((c) => c.id)}`, 'b,c k2');
  check('Content: what you already have is never in the plan (so it can never be changed)', secondPlan.resources.some((r) => r.id === 'a'), false);
  const everything2 = { resources: ['a', 'b', 'c'].map((id) => ({ id, title: 'x', url: '' })), cards: [{ seedId: 'k1' }, { seedId: 'k2' }] };
  const again = planContent(packs.content, everything2);
  check('Content: checking again after adding everything plans nothing (safe to click twice)', `${again.resources.length} ${again.cards.length}`, '0 0');
  check('Content: a retired resource stays retired (its id still counts as yours)', planContent(packs.content, { resources: [{ id: 'a', retired: true, title: 'x', url: '' }], cards: [] }).resources.some((r) => r.id === 'a'), false);
  check('Content: with nothing new it says so', summarizePlan(again), 'Nothing new to add');
  // A pack may fill in a link that was missing, and nothing else, on a resource you have not touched.
  const missing = (over = {}) => ({ id: 'a', title: 'Old title', url: '', urlStatus: 'needs-your-search', editedByMe: false, why: 'old', ...over });
  const fillPlan = planContent(packs.content, { resources: [missing()], cards: [] });
  check('Content: a missing link on an untouched resource is filled from the pack', `${fillPlan.linkFills.length} ${fillPlan.linkFills[0]?.url}`, '1 https://oauth.net/a');
  check('Content: the summary names the missing links', summarizePlan({ resources: [], cards: [], linkFills: [1, 2] }), 'Ready to add 2 missing links');
  check('Content: a resource you edited keeps its empty link', planContent(packs.content, { resources: [missing({ editedByMe: true })], cards: [] }).linkFills.length, 0);
  check('Content: a link you added yourself is never replaced', planContent(packs.content, { resources: [missing({ url: 'https://mine.example/x', urlStatus: 'added-by-you' })], cards: [] }).linkFills.length, 0);
  check('Content: a resource with no "needs your search" mark is left alone', planContent(packs.content, { resources: [missing({ urlStatus: 'unchecked' })], cards: [] }).linkFills.length, 0);
  const brokenRes = { content: { ...packs.content, packTexts: { ...packs.content.packTexts, 'res-one': resFile([resRow('a', { planDays: [14] })]) } } };
  const partial = planContent(brokenRes.content, nothing);
  check('Content: a pack with a wrong row adds nothing from that pack', partial.resources.length, 0);
  check('Content: the other pack still works and the problem is reported', `${partial.cards.length} ${partial.problems.length > 0}`, '2 true');
  check('Content: two packs with the same id add it once', planContent({ manifest: mani([mpack(), mpack({ id: 'res-two', path: 'res-two.json' })]), packTexts: { 'res-one': resFile([resRow('a')]), 'res-two': resFile([resRow('a')]) } }, nothing).resources.length, 1);
  check('Content: nothing is planned from a manifest that is wrong', planContent({ manifest: { schema: 'x' }, packTexts: {} }, nothing).resources.length, 0);
  const root = new URL('https://marva-a.github.io/identity-lab-coach/content/');
  check('Network: the manifest is requested from the content folder', contentUrl('manifest.json', root).href, 'https://marva-a.github.io/identity-lab-coach/content/manifest.json');
  const refuses = (name) => { try { contentUrl(name, root); return false; } catch { return true; } };
  check('Network: another site is refused', refuses('https://evil.example/x.json'), true);
  check('Network: a protocol-relative address is refused', refuses('//evil.example/x.json'), true);
  check('Network: climbing out of the folder is refused', refuses('../js/store.js'), true);
  check('Network: every request is a plain GET with no cookies, no referrer, no body and no redirects',
    CONTENT_REQUEST_INIT.method === 'GET' && CONTENT_REQUEST_INIT.credentials === 'omit' && CONTENT_REQUEST_INIT.referrerPolicy === 'no-referrer'
      && CONTENT_REQUEST_INIT.redirect === 'error' && CONTENT_REQUEST_INIT.mode === 'same-origin' && !('body' in CONTENT_REQUEST_INIT), true);

  // Plan version 3: one Design item per week, extra time on top of the 12 hours.
  const design = WEEKS.flatMap((w) => w.items.filter((i) => i.kind === 'design').map((i) => ({ week: w.number, ...i })));
  const v2Ids = PLAN_ID_HISTORY[2] ?? [];
  check('Plan v3: every item id from version 2 still exists', v2Ids.filter((id) => !itemIds.has(id)).length, 0);
  check('Plan v3: version 2 had 92 items', v2Ids.length, 92);
  check('Plan v3: eight new items, one Design item in each of weeks 1–8', design.map((d) => d.week).join(','), '1,2,3,4,5,6,7,8');
  check('Plan v3: the 100 items are the 92 old ones plus the 8 new ones', itemIds.size, 100);
  check('Plan v3: the new ids are the only additions', [...itemIds].filter((id) => !v2Ids.includes(id)).sort().join(','), design.map((d) => d.id).sort().join(','));
  check('Plan v3: each Design item comes after its week\'s Evidence items', WEEKS.slice(0, 8).every((w) => w.items.map((i) => i.kind).lastIndexOf('design') === w.items.length - 1
    && w.items.map((i) => i.kind).lastIndexOf('evidence') < w.items.map((i) => i.kind).indexOf('design')), true);
  check('Plan v3: weeks 4, 6 and 8 are required flagships of about 3 hours', design.filter((d) => d.flagship && !d.optional && d.extraMinutes === 180).map((d) => d.week).join(','), '4,6,8');
  check('Plan v3: the other five are optional', design.filter((d) => d.optional && !d.flagship).map((d) => d.week).join(','), '1,2,3,5,7');
  check('Plan v3: optional ones are about 2 hours, Week 3 about 3', design.filter((d) => d.optional).map((d) => d.extraMinutes / 60).join(','), '2,2,3,2,2');
  check('Plan v3: titles match the brief', design.map((d) => d.text).join('|'),
    ['Enterprise identity mental model', 'Consent screen and scopes', 'Admin provisioning flow', 'Redesign account recovery', 'Device posture failure experience',
      'Permission management for a non-security admin', 'Account-takeover investigation console', 'Agent authorization case-study outline'].join('|'));
  check('Plan v3: the weekly hour budgets are still 11, 12 ×7, 8 (extra time is not added)', WEEKS.map((w) => Object.values(w.budget).reduce((a, b) => a + b, 0)).join(','), '11,12,12,12,12,12,12,12,8');
  check('Plan v3: the extra time is described in words', extraTimeLabel(design[3]), 'about 3 h, on top of the 12 h');
  check('Plan v3: required item counts per week were 9,11,12,9,10,11,9,10 and are now +1 in weeks 4, 6 and 8',
    WEEKS.slice(0, 8).map((w) => w.items.filter((i) => !i.optional && !i.conditional).length).join(','), '9,11,12,10,10,12,9,11');
  const tickedAll = Object.fromEntries(v2Ids.map((id) => [id, { at: 'x', testMode: false }]));
  check('Plan v3: ticks saved under version 2 are unchanged by the rename step', JSON.stringify(renameChecks(tickedAll)), JSON.stringify(tickedAll));
  const hoursRow = (extra) => scorecard('2026-10-18', [...sat, ...extra], {}).find((r) => r.id === 'hours');
  check('Plan v3: logging 3 extra hours is not penalised (still On track)', hoursRow([{ date: '2026-10-17', minutes: 180 }]).status, 'on');
  check('Plan v3: the scorecard still expects the same hours with or without extra logged time', hoursRow([{ date: '2026-10-17', minutes: 180 }]).expected, hoursRow([]).expected);

  // Your Optional / Required choices.
  const flagship = design[3];
  const optItem = WEEKS[0].items.find((i) => i.id === 'w1-read-3');
  check('Optional choice: no choice means the plan\'s own setting (required flagship)', itemIsOptional(flagship, {}), false);
  check('Optional choice: your choice beats the plan (flagship marked optional)', itemIsOptional(flagship, { [`item:${flagship.id}`]: { optional: true } }), true);
  check('Optional choice: your choice beats the plan (optional item marked required)', itemIsOptional(optItem, { [`item:${optItem.id}`]: { optional: false } }), false);
  check('Optional choice: a choice on another item changes nothing', itemIsOptional(flagship, { 'item:other': { optional: true } }), false);
  const cpBefore = courseProgress(emptyData(), { today: '2026-11-10' });
  const cpAfter = courseProgress(emptyData({ optionalOverrides: { [`item:${flagship.id}`]: { optional: true } } }), { today: '2026-11-10' });
  check('Optional choice: marking a required item optional lowers that week\'s required count by one', cpBefore.weeks[3].required - cpAfter.weeks[3].required, 1);
  check('Optional choice: and counts it as extra', cpAfter.weeks[3].extraTotal - cpBefore.weeks[3].extraTotal, 1);
  check('Optional choice: no other week changes', cpAfter.weeks.filter((w, i) => i !== 3 && w.required !== cpBefore.weeks[i].required).length, 0);
  const cpMore = courseProgress(emptyData({ optionalOverrides: { [`item:${optItem.id}`]: { optional: false } } }), { today: '2026-10-14' });
  check('Optional choice: marking an optional item required raises the required count by one', cpMore.weeks[0].required - cp({}, '2026-10-14').weeks[0].required, 1);
  check('Optional choice: a ticked item stays ticked when its setting changes', courseProgress(emptyData({
    weekChecks: { [flagship.id]: { at: 'x' } }, optionalOverrides: { [`item:${flagship.id}`]: { optional: true } },
  }), { today: '2026-11-10' }).weeks[3].extraTicked, 1);

  // Evidence categories (schema 5).
  const legacyArtifact = { id: 'a1', title: 'Old one', type: 'write-up', status: 'published', createdDate: '2026-10-12', publishedDate: '2026-10-17', url: '', tags: ['oauth'], reflection: 'r', maturity: 'implemented', project: 'project-1', migrated: false, testMode: false };
  const legacyDraft = { ...legacyArtifact, id: 'a2', status: 'draft', publishedDate: null, title: 'Draft' };
  const v4doc = { schemaVersion: 4, planVersion: 2, sessions: [{ id: 's', date: '2026-10-13', minutes: 60 }], tallies: [], artifacts: [legacyArtifact, legacyDraft], people: [], interactions: [] };
  const m5 = migrate(v4doc);
  check('Category migration: a version 4 file with entries migrates', m5.ok, true);
  check('Category migration: schema version becomes 5', m5.doc.schemaVersion, 5);
  check('Category migration: every existing entry becomes Uncategorised', m5.doc.artifacts.map((a) => a.category).join(','), 'uncategorised,uncategorised');
  check('Category migration: no entry was lost', m5.doc.artifacts.length, 2);
  check('Category migration: apart from the category, entries are identical',
    JSON.stringify(m5.doc.artifacts.map(({ category, ...r }) => r)), JSON.stringify([legacyArtifact, legacyDraft]));
  check('Category migration: scorecard counts are the same before and after',
    JSON.stringify(compareCounts(countsFromDoc(v4doc), countsFromDoc(m5.doc))), '[]');
  check('Category migration: sessions are untouched', JSON.stringify(m5.doc.sessions), JSON.stringify(v4doc.sessions));
  check('Category migration: the input file is not changed', v4doc.artifacts[0].category, undefined);
  check('Category migration: it says what happened', /2 existing entries/.test(m5.notice ?? ''), true);
  check('Category migration: running it twice changes nothing more', migrate(m5.doc).changed, false);
  check('Category migration: a category you already chose is kept', migrate({ ...v4doc, artifacts: [{ ...legacyArtifact, category: 'security' }] }).doc.artifacts[0].category, 'security');
  check('Category migration: an unknown category becomes Uncategorised', migrate({ ...v4doc, artifacts: [{ ...legacyArtifact, category: 'bogus' }] }).doc.artifacts[0].category, 'uncategorised');
  check('Category: the five categories are Research, Systems, Interaction, Security, Product', Object.values(ARTIFACT_CATEGORIES).join(','), 'Research,Systems,Interaction,Security,Product');
  check('Category: a new entry needs one of the five', validateArtifact({ ...legacyArtifact, category: 'uncategorised' }, { requireCategory: true }).length > 0, true);
  check('Category: an old entry may stay Uncategorised when edited', validateArtifact({ ...legacyArtifact, category: 'uncategorised' }, { requireMaturity: true }).length, 0);
  check('Category: an empty choice on a new entry asks to choose one, not "invalid"', validateArtifact({ ...legacyArtifact, category: '' }, { requireCategory: true }).join(' '), 'Choose a category (Research, Systems, Interaction, Security or Product).');
  check('Category: a made-up category is refused', validateArtifact({ ...legacyArtifact, category: 'x' }).length > 0, true);
  check('Category: a chosen category is valid', validateArtifact({ ...legacyArtifact, category: 'systems' }, { requireCategory: true }).length, 0);
  const cov = categoryCoverage([{ category: 'security' }, { category: 'security' }, { category: 'product' }, { category: 'uncategorised' }]);
  check('Coverage: lists all five in order', cov.rows.map((r) => r.id).join(','), 'research,systems,interaction,security,product');
  check('Coverage: counts per category', cov.rows.map((r) => r.count).join(','), '0,0,0,2,1');
  check('Coverage: zero categories are the ones with no entries', cov.rows.filter((r) => r.count === 0).map((r) => r.label).join(','), 'Research,Systems,Interaction');
  check('Coverage: uncategorised entries are counted separately', cov.uncategorised, 1);
  check('Coverage: a category does not change the scorecard', JSON.stringify(countsFromDoc({ artifacts: [{ ...legacyArtifact, category: 'systems' }] })), JSON.stringify(countsFromDoc({ artifacts: [legacyArtifact] })));
  check('Coverage: label for a missing category', categoryLabel(undefined), 'Uncategorised');

  // Simplified navigation: five places plus Settings, and every old address still works.
  const at = (h) => resolveHash(h);
  const where = (h) => `${at(h).route}${at(h).section ? `/${at(h).section}` : ''}`;
  check('Routes: the places are Today, Plan, Learn, Proof, Progress and Settings', ROUTES.join(','), 'today,plan,learn,proof,progress,settings');
  check('Routes: an empty address opens Today', where(''), 'today');
  check('Routes: an unknown address opens Today', where('#nonsense'), 'today');
  check('Routes: #today', where('#today'), 'today');
  check('Routes: #plan', where('#plan'), 'plan');
  check('Routes: #progress', where('#progress'), 'progress');
  check('Routes: #settings', where('#settings'), 'settings');
  check('Routes: #learn opens the Library first', where('#learn'), 'learn/library');
  check('Routes: #learn/cards', where('#learn/cards'), 'learn/cards');
  check('Routes: #proof opens Evidence first', where('#proof'), 'proof/evidence');
  check('Routes: #proof/people', where('#proof/people'), 'proof/people');
  check('Routes: #proof/applications', where('#proof/applications'), 'proof/applications');
  check('Routes: an unknown section falls back to the first', where('#learn/nope'), 'learn/library');
  check('Routes: new addresses are not redirected', ['#today', '#plan', '#learn/cards', '#proof/people', '#progress', '#settings'].every((h) => at(h).redirect === null), true);
  check('Redirect: #home goes to Plan', `${where('#home')}|${at('#home').redirect}`, 'plan|#plan');
  check('Redirect: #week goes to Plan', `${where('#week')}|${at('#week').redirect}`, 'plan|#plan');
  check('Redirect: #library goes to Learn / Library', `${where('#library')}|${at('#library').redirect}`, 'learn/library|#learn/library');
  check('Redirect: #cards goes to Learn / Flashcards', `${where('#cards')}|${at('#cards').redirect}`, 'learn/cards|#learn/cards');
  check('Redirect: #evidence goes to Proof / Evidence', `${where('#evidence')}|${at('#evidence').redirect}`, 'proof/evidence|#proof/evidence');
  check('Redirect: #people goes to Proof / People', `${where('#people')}|${at('#people').redirect}`, 'proof/people|#proof/people');
  check('Redirect: #scorecard goes to Progress', `${where('#scorecard')}|${at('#scorecard').redirect}`, 'progress|#progress');
  check('Redirect: with a slash form (#/week) too', where('#/week'), 'plan');
  check('Redirect: all seven old addresses are covered', Object.keys(LEGACY_HASHES).sort().join(','), 'cards,evidence,home,library,people,scorecard,week');
  check('Redirect: every redirect lands on a known place and section', Object.values(LEGACY_HASHES).every((h) => ROUTES.includes(at(h).route)
    && (!SECTIONS[at(h).route] || SECTIONS[at(h).route].includes(at(h).section))), true);
  check('Redirect: a redirect target is never redirected again', Object.values(LEGACY_HASHES).every((h) => at(h).redirect === null || at(h).redirect === h), true);

  // One vocabulary: Required and Optional. "extra" and "conditional" are notes, not words in the item text.
  check('Words: no plan item text says "extra"', WEEKS.flatMap((w) => w.items).filter((i) => /\bextra\b/i.test(i.text)).length, 0);
  check('Words: no plan item text says "(conditional)"', WEEKS.flatMap((w) => w.items).filter((i) => /\(conditional\)/i.test(i.text)).length, 0);
  check('Words: the items that said "extra" now carry their time as a note',
    ['w1-read-3', 'w4-read-3', 'w6-read-3', 'w6-apply-2', 'w7-apply-2', 'w8-read-3', 'w8-read-4'].every((id) => item(id).extraMinutes > 0 && item(id).optional), true);
  check('Words: planned study hours are 103 (shown on the scorecard)', WEEKS.reduce((n, w) => n + w.days.reduce((m, d) => m + d.hours, 0), 0), 103);
  check('Words: marking a week 1 note item optional by default is unchanged', item('w1-read-3').optional, true);

  // Teaching layer: guidance (levels and how to use), lessons, and one order for everything.
  const gText = (over = {}) => JSON.stringify({
    schema: 'identity-lab-coach.guidance.v1',
    resources: { 'r-a': { level: 'foundation', howToUse: 'Read it first.' }, 'r-b': { level: 'core', howToUse: 'Do it.' }, 'r-c': { level: 'deep', howToUse: 'Look things up.' } },
    suggestedDayChanges: [{ id: 'r-a', planDays: [4], reason: 'later' }],
    ...over,
  });
  const gOk = parseGuidancePack(gText());
  check('Guidance: a good pack is accepted', [gOk.ok, gOk.guidance.length, gOk.dayChanges.length].join(), 'true,3,1');
  check('Guidance: a wrong schema is refused', parseGuidancePack(gText({ schema: 'x' })).ok, false);
  check('Guidance: an unknown level is refused', parseGuidancePack(gText({ resources: { 'r-a': { level: 'expert', howToUse: 'x' } } })).ok, false);
  check('Guidance: a missing how-to-use line is refused', parseGuidancePack(gText({ resources: { 'r-a': { level: 'core' } } })).ok, false);
  check('Guidance: an unknown field is refused', parseGuidancePack(gText({ resources: { 'r-a': { level: 'core', howToUse: 'x', extra: 1 } } })).ok, false);
  check('Guidance: a day change onto a Sunday is refused', parseGuidancePack(gText({ suggestedDayChanges: [{ id: 'r-a', planDays: [7] }] })).ok, false);
  check('Guidance: invalid JSON is refused', parseGuidancePack('{').ok, false);
  const lesson = (over = {}) => ({
    id: 'w1-d1', week: 1, day: 1, date: '2026-10-12', title: 'T', inOneSentence: 'S', whyItMattersToADesigner: 'W', keyIdeas: ['k'],
    words: [{ term: 'a', meaning: 'b' }], steps: [{ text: 'do', minutes: 20, resourceId: null }, { text: 'read', minutes: 10, resourceId: 'r-a' }],
    skipOrSkim: 'skip', checkYourself: ['q1', 'q2'], plannedMinutes: 60, ...over,
  });
  const lText = (lessons) => JSON.stringify({ schema: 'identity-lab-coach.lessons.v1', lessons });
  const lOk = parseLessonPack(lText([lesson(), lesson({ id: 'w1-d2', day: 2, date: '2026-10-13' })]));
  check('Lessons: a good pack is accepted', [lOk.ok, lOk.lessons.length].join(), 'true,2');
  check('Lessons: a wrong schema is refused', parseLessonPack(JSON.stringify({ schema: 'x', lessons: [lesson()] })).ok, false);
  check('Lessons: a date that does not match the day is refused', parseLessonPack(lText([lesson({ date: '2026-10-13' })])).ok, false);
  check('Lessons: a week that does not match the day is refused', parseLessonPack(lText([lesson({ week: 2 })])).ok, false);
  check('Lessons: a Sunday is refused', parseLessonPack(lText([lesson({ day: 7, date: '2026-10-18', week: 1 })])).ok, false);
  check('Lessons: a step with no minutes is refused', parseLessonPack(lText([lesson({ steps: [{ text: 'x', resourceId: null }] })])).ok, false);
  check('Lessons: a step pointing at something odd is refused', parseLessonPack(lText([lesson({ steps: [{ text: 'x', minutes: 5, resourceId: 'bad id!' }] })])).ok, false);
  check('Lessons: two lessons on one day are refused', parseLessonPack(lText([lesson(), lesson({ id: 'other' })])).ok, false);
  check('Lessons: a repeated id is refused', parseLessonPack(lText([lesson(), lesson({ day: 2, date: '2026-10-13' })])).ok, false);
  check('Lessons: no questions is refused', parseLessonPack(lText([lesson({ checkYourself: [] })])).ok, false);
  {
    const n = lesson().checkYourself.length;
    const withLook = parseLessonPack(lText([lesson({ lookFor: Array.from({ length: n }, (_, i) => `Good answer ${i + 1}`) })]));
    check('Lessons: a good answer for each question is accepted and kept', [withLook.ok, withLook.lessons[0].lookFor.length].join(), `true,${n}`);
    check('Lessons: good answers are optional (none means null)', parseLessonPack(lText([lesson()])).lessons[0].lookFor, null);
    check('Lessons: good answers that do not match the questions are refused', parseLessonPack(lText([lesson({ lookFor: Array(n + 1).fill('x') })])).ok, false);
    check('Lessons: an empty good answer is refused', parseLessonPack(lText([lesson({ lookFor: Array(n).fill(' ') })])).ok, false);
  }
  check('Lessons: an unknown field is refused', parseLessonPack(lText([lesson({ video: 'x' })])).ok, false);
  check('Lessons: markup in text is kept as text (it is escaped when shown)', parseLessonPack(lText([lesson({ title: '<b>T</b>' })])).lessons[0].title, '<b>T</b>');
  const cManifest = { schema: 'identity-lab-coach.content-manifest.v1', packs: [
    { id: 'guid', title: 'G', version: 1, type: 'guidance', path: 'g.json' }, { id: 'less', title: 'L', version: 2, type: 'lessons', path: 'l.json' }] };
  const cContent = { manifest: cManifest, packTexts: { guid: gText(), less: lText([lesson()]) } };
  const p1 = planContent(cContent, { resources: [], cards: [], contentPacks: {}, lessons: [] });
  check('Plan: a guidance pack adds its notes and day changes', [p1.guidance.length, p1.dayChanges.length].join(), '3,1');
  check('Plan: a lessons pack adds its lessons', p1.lessons.length, 1);
  check('Plan: the summary names lessons and reading tips', summarizePlan(p1), 'Ready to add 1 lesson and 3 reading tips');
  check('Plan: the size counts them', planSize(p1), 4);
  const p2 = planContent(cContent, { resources: [], cards: [], contentPacks: { guid: { version: 1 } }, lessons: [{ id: 'w1-d1', packVersion: 2 }] });
  check('Plan: guidance already applied at this version is not applied again', p2.guidance.length, 0);
  check('Plan: a lesson at the same pack version is not added again', p2.lessons.length, 0);
  const p3 = planContent(cContent, { resources: [], cards: [], contentPacks: {}, lessons: [{ id: 'w1-d1', packVersion: 1 }] });
  check('Plan: a lesson from an older pack version is replaced by the newer one', p3.lessons.length, 1);
  check('Plan: a lesson in the pack with a new id is added', planContent({ manifest: cManifest, packTexts: { guid: gText(), less: lText([lesson({ id: 'w1-d9', day: 9, date: '2026-10-20', week: 2 })]) } },
    { resources: [], cards: [], contentPacks: {}, lessons: [{ id: 'w1-d1', packVersion: 2 }] }).lessons.length, 1);
  check('Plan: a broken guidance pack adds nothing and says why', planContent({ manifest: cManifest, packTexts: { guid: '{', less: lText([lesson()]) } }, { resources: [], cards: [], contentPacks: {}, lessons: [] }).guidance.length
    + (planContent({ manifest: cManifest, packTexts: { guid: '{', less: lText([lesson()]) } }, { resources: [], cards: [], contentPacks: {}, lessons: [] }).problems.length > 0 ? 100 : 0), 100);
  check('Plan: the summary names only what is new', summarizePlan({ resources: [1], cards: [], packs: [{ newCount: 1 }] }), 'Ready to add 1 resource');
  const rs = [
    { id: 'd', level: 'deep', position: 1, status: 'not-started' }, { id: 'c', level: 'core', position: 2, status: 'not-started' },
    { id: 'f', level: 'foundation', position: 3, status: 'not-started' }, { id: 'n', position: 4, status: 'not-started' },
  ];
  check('Order: foundation, then core, then deep', orderResources(rs).map((r) => r.id).join(''), 'fcnd');
  check('Order: a resource with no level sits with core', levelRank({}), 1);
  check('Order: in progress comes first within its level', orderResources([{ id: 'x', level: 'core', position: 1, status: 'not-started' }, { id: 'y', level: 'core', position: 2, status: 'in-progress' }]).map((r) => r.id).join(''), 'yx');
  check('Order: a deep resource in progress still comes after core ones', orderResources([{ id: 'x', level: 'deep', position: 1, status: 'in-progress' }, { id: 'y', level: 'core', position: 2, status: 'not-started' }]).map((r) => r.id).join(''), 'yx');
  check('Order: deep ones are split out for the Reference group', [splitDeep(rs).main.length, splitDeep(rs).deep.map((r) => r.id).join('')].join(), '3,d');
  check('Resource: an unknown level is refused', validateResource({ id: 'a', title: 't', source: 's', type: 'article', minutes: 5, url: '', days: [1], level: 'expert' }).length > 0, true);
  check('Resource: a known level is accepted', validateResource({ id: 'a', title: 't', source: 's', type: 'article', minutes: 5, url: '', days: [1], level: 'deep', howToUse: 'x' }).length, 0);
  check('Routes: #lesson/3 is a page of its own', where('#lesson/3'), 'lesson/3');
  check('Routes: a lesson address with no real day goes to Plan', where('#lesson/99'), 'plan');

  // Plain words (from the principal designer review).
  check('Words: levels read Start here, Practical, Reference', Object.values(RESOURCE_LEVELS).join(','), 'Start here,Practical,Reference');
  check('Words: no status says "At risk"', Object.values(STATUS_LABELS).includes('At risk'), false);
  check('Words: the statuses are On track, A bit behind, Well behind', [STATUS_LABELS.on, STATUS_LABELS.behind, STATUS_LABELS.risk].join(','), 'On track,A bit behind,Well behind');
  const dayFocus = (n) => WEEKS.flatMap((w) => w.days).find((d) => d.day === n).focus;
  check('Plan text: Day 9 no longer says to read RFC 9700 (it moved to Day 13)', /RFC 9700 summary/.test(dayFocus(9)), false);
  check('Plan text: Day 9 points to Day 13 for RFC 9700', /Day 13/.test(dayFocus(9)), true);

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
