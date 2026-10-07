# Identity Lab Coach

A private, local-first study coach for the 60-day identity and security plan
(Day 1 = Mon Oct 12, 2026; Day 60 = Thu Dec 10, 2026). No accounts, no
tracking, no dependencies. Your data stays in your browser.

## Run it

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
| `js/main.js` | The Today and Settings views |
| `js/selftest.js` | Date checks (in Settings, or `node js/selftest.js`) |

## Data model changes from the brief

- **PlanDay is seed data in code, not saved data.** Fixing a plan typo never
  breaks an export. Checklist items live on a new **PlanWeek** record, since the
  roadmap gives items per week and one focus line per day.
- **Exercise** is a new seed record (the 20 exercises from Part 8).
- **Session** adds `id`, `dayNumber`, `testMode`, `createdAt` and `updatedAt`.
- **Every saved record has `id`, `createdAt` and `updatedAt`**, ready for a
  server, sync or an append-only audit log. Add `ownerId` when you add
  sign-in; `store.js` is the only file that touches storage, so it is the one
  place to swap for API calls.

## Build stages

1. **Stage 1 (built):** data model, seeded plan, Today view, timer, session log, JSON export and import, test date.
2. Spaced-repetition flashcards and the retrieval check.
3. Week view with checklist and hours against budget.
4. Evidence log with Markdown export.
5. Scorecard dashboard.
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
