# Identity Lab Coach

A private, local-first study coach for the 60-day identity and security plan
(Day 1 = Mon Oct 12, 2026; Day 60 = Thu Dec 10, 2026). No accounts, no
tracking, no dependencies. Your data stays in your browser.

**Live app:** https://marva-a.github.io/identity-lab-coach/

Each browser keeps its own data (the live link, your phone and `localhost`
don't share it). Use Export and Import in Settings to move data between them.

## Time zone note

British Columbia stopped changing clocks in 2026 and stays on UTC−7. The app
asks the browser for the Vancouver date, so it follows whatever time zone data
the browser has. Settings → "Run date checks" says whether your browser's data
is up to date.

## Run it locally

```bash
node serve.mjs
```

Then open http://localhost:8095. The server only listens on this computer.
A server is needed because browsers block JavaScript modules opened directly
as files.

Run the date checks from the terminal too:

```bash
node js/selftest.js
```

## Files

| File | What it does |
|---|---|
| `js/dates.js` | Vancouver dates and day arithmetic (no off-by-one across time zones or daylight saving) |
| `js/plan-data.js` | The seeded plan: 9 weeks, 52 study days, 20 exercises, bridge, Part 12 weekly system, scorecard targets |
| `js/plan.js` | Turns a date into "what's on today" |
| `js/store.js` | Data model, saving, JSON export and import (the data model is documented at the top) |
| `js/timer.js` | The 50/10/50 session timer |
| `js/srs.js` | Leitner spaced repetition, unlocking by week, interleaving |
| `js/cards-data.js` | The 65 seed flashcards (all unverified, each with a reference) |
| `js/flashcards.js` | Retrieval check, Flashcards view, card editor |
| `js/week.js` | Week view: checklist, days, hours against the budget |
| `js/pace.js` | Scorecard maths: expected-by-today and status (no page code) |
| `js/scorecard.js` | Scorecard view and the quick "+1 application" log |
| `js/records.js` | Evidence, person and interaction rules (validation) and what counts toward the scorecard |
| `js/migrate.js` | Converts Stage 1–3 data to the Stage 4 format, with a before/after check |
| `js/evidence.js` | Evidence log view (maturity, project, filters, Markdown export) |
| `js/evidence-md.js` | Builds the Markdown export of published evidence |
| `js/resources.js` | Content library: "Do this next" on Today, Week lists, the Library, notes |
| `js/resource-import.js` | Checks a resource JSON file row by row before anything is added |
| `js/people.js` | People log view and the follow-ups on Today |
| `js/ui.js` | Small shared helpers |
| `js/main.js` | The Today and Settings views, routing and events |
| `js/selftest.js` | Date and scheduling checks (in Settings, or `node js/selftest.js`) |

## Data model changes from the brief

- **PlanDay is seed data in code, not saved data.** Fixing a plan typo never
  breaks an export. Checklist items live on a new **PlanWeek** record, since the
  roadmap gives items per week and one focus line per day.
- **Exercise** is a new seed record (the 20 exercises from Part 8).
- **Session** adds `id`, `dayNumber`, `testMode`, `createdAt` and `updatedAt`.
- **Card schedules are not stored.** Each rating is appended to a
  `cardReviews` log, and a card's box and due date are worked out by
  replaying that log. Deleting test ratings or importing a file can never
  leave a schedule out of step with its history.
- **Tally** is a quick "+1 with date" scorecard entry. Since Stage 4 only
  applications are tallies; artifacts live in the Evidence log, and
  conversations and referral asks are interactions in the People log.
- **Artifact** (Stage 4): title, type, draft or published, created date,
  published date (only when published), optional link, one to three skill tags
  ("what this proves") and a reflection. The scorecard counts an artifact only
  when published, on its published date. The brief's earlier fields (week or
  exercise, project, implemented/simulated/conceptual label) are not in this
  stage.
- **Artifact maturity and project** (added after Stage 4): `maturity`
  (implemented / simulated / conceptual / future phase) and `project`
  (Project 1–3 / other). Both start empty; maturity is required to publish.
  They never change scorecard counts, and older files load with both empty.
- **Resource** (Stage 4b): a thing to read, watch or do, with an id, title,
  source, type, estimated minutes (never hours), an optional link, a reason, the
  plan days it belongs to, an optional flag, a link note, a status, your notes
  and a retired flag. You provide them: the app ships with none and never copies
  third-party content. A resource may have no link yet; it then shows "Link
  needed" with a field to add one. Importing an `identity-lab-coach.resources.v1`
  file matches on id, so a second import adds nothing and never changes a
  resource you already have (your link, statuses, notes and edits stay).
- **Person and Interaction** (Stage 4): a person has a name, organization, role,
  how you connected, notes and an optional link. An interaction (conversation or
  referral ask) has a date, an outcome note and an optional follow-up date.
  Follow-ups that are due show on Today.
- **Migration:** on the first load after an update, and when importing an older
  file, Stage 3 quick entries are converted: artifacts become published
  Evidence, conversations and referral asks become interactions under
  "Unassigned (migrated)". The scorecard is recounted before saving; if any
  number differs, nothing is saved. A copy of the old data is kept in Settings
  until you delete it.
- **Plan text version** (`planVersion`): the plan lives in code, so changing its text
  bumps `PLAN_VERSION` in `plan-data.js`. Your ticks are keyed by plan item id and
  existing ids never change (new items get new ids), so a ticked item stays ticked.
  If an id ever has to change, `PLAN_ID_RENAMES` moves its tick. Version 2 is the
  revised roadmap: Weeks 5 and 6 renamed, extra items added (extras are Optional),
  exercises 21 and 22, and 20 more flashcards for Weeks 5 and 6.
- **Every saved record has `id`, `createdAt` and `updatedAt`**, ready for a
  server, sync or an append-only audit log. Add `ownerId` when you add
  sign-in; `store.js` is the only file that touches storage, so it is the one
  place to swap for API calls.

## Build stages

1. **Stage 1 (built):** data model, seeded plan, Today view, timer, session log, JSON export and import, test date.
2. **Stage 2 (built):** spaced-repetition flashcards, the retrieval check on Today, card editor.
3. **Stage 3 (built):** Week view (checklist, hours against budget) and Scorecard (pace against the plan).
4. **Stage 4 (built):** Evidence log and People log, with the migration from quick entries.
4b. **Stage 4b (built):** Content library (resources by plan day, notes, flashcards from notes).
5. Application tracker (quick "+1 application" until then).
6. People log and follow-ups on Today.
7. Friday review with the reduced-mode and Nov 21 rules.

## Later (phase 2, not planned for the MVP)

- Interview practice: a random question from the 23-question bank, a
  90-second timer, a typed or recorded answer, and a self-rating rubric
  (accuracy, structure, trade-off named, honest about depth). Optional AI
  feedback must state its uncertainty.
- Application tracker with the 12-point role score and weekly pipeline.
- A concept map of identity topics, shaded by flashcard mastery.
- Sign-in through Keycloak (OpenID Connect with PKCE), admin and learner
  roles, and an append-only audit log.
