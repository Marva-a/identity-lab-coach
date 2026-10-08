// Date checks. They prove the calendar rules without changing any data and
// run from Settings → "Run date checks" (or `node js/selftest.js`).
import { vancouverDate, addDays, weekday, TIME_ZONE } from './dates.js';
import { getDayContext, dayNumberFor } from './plan.js';
import {
  WEEKS, PLAN_START, PLAN_VERSION, PLAN_ID_HISTORY, renameChecks, SCORECARD_TARGETS,
} from './plan-data.js';
import { nextState, initialState, replay, unlockDate, scheduleAll, pickInterleaved } from './srs.js';
import { SEED_CARDS } from './cards-data.js';
import { migrate, needsMigration, compareCounts } from './migrate.js';
import { evidenceToMarkdown, escapeMd } from './evidence-md.js';
import { parseResourceImport } from './resource-import.js';
import { courseProgress } from './progress.js';
import { stepIndex, nextStep, previousStep, STEPS } from './session-flow.js';
import { datedFilesToRemove, snapshotsToRemove, datedName, isOurDatedFile, KEEP_FILES, KEEP_SNAPSHOTS } from './backup-files.js';
import {
  countsFromDoc, validateArtifact, validateInteraction, validatePerson, isHttpUrl, UNASSIGNED_ID,
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
    ['## T', '**Type:** Threat model', '**Project:** Project 1', '**Maturity:** Implemented', '**Published:** 2026-10-17', '**Skills:** PKCE', '<https://example.com/x>', '**Reflection.** It worked.'].every((x) => md.includes(x)), true);
  check('Markdown: missing maturity and project say "Not set"', md.includes('**Maturity:** Not set') && md.includes('**Project:** Not set'), true);
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
  check('Plan: the plan text is version 2', PLAN_VERSION, 2);
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
