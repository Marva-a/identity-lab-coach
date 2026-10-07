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
| `js/cards-data.js` | The 45 seed flashcards (all unverified, each with a reference) |
| `js/flashcards.js` | Retrieval check, Flashcards view, card editor |
| `js/week.js` | Week view: checklist, days, hours against the budget |
| `js/pace.js` | Scorecard maths: expected-by-today and status (no page code) |
| `js/scorecard.js` | Scorecard view and the quick "+1 with date" log |
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
- **Tally** is a new record: a quick "+1 with date" scorecard entry
  (artifact, conversation, application or referral ask). The scorecard counts
  tallies plus the full records later stages add. Stage 4 will turn each
  artifact tally into an Artifact with the same id, date and note, so counts
  never change.
- **Every saved record has `id`, `createdAt` and `updatedAt`**, ready for a
  server, sync or an append-only audit log. Add `ownerId` when you add
  sign-in; `store.js` is the only file that touches storage, so it is the one
  place to swap for API calls.

## Build stages

1. **Stage 1 (built):** data model, seeded plan, Today view, timer, session log, JSON export and import, test date.
2. **Stage 2 (built):** spaced-repetition flashcards, the retrieval check on Today, card editor.
3. **Stage 3 (built):** Week view (checklist, hours against budget) and Scorecard (pace against the plan).
4. Evidence log with Markdown export.
5. Scorecard refinements as needed.
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
