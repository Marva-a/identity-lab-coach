# Identity Lab Coach

A private, local-first study coach for the 60-day identity and security plan
(Day 1 = Mon Oct 12, 2026; Day 60 = Thu Dec 10, 2026). No accounts, no
tracking, no dependencies. Your data stays in your browser.

**Live app:** https://marva-a.github.io/identity-lab-coach/

Each browser keeps its own data (the live link, your phone and `localhost`
don't share it). Use Export and Import in Settings to move data between them.

## How to add content

Resources and flashcards come to the app as **content packs** in the `content/` folder,
so you never paste or type them in. In the app, **Learn → Library → Check for new content** shows
what is new ("Ready to add 71 resources and 2 cards from 4 packs") and adds it only after you
confirm. It asks only this app's own site for the files and sends none of your data. It adds
**new ids only**: anything you already have (links, statuses, notes, edits, ratings,
retirements) is never changed, and checking twice adds nothing the second time. Cards from a
pack always arrive unverified, with their reference.

To add a pack:

1. Put the file in `content/`.
   - **Resources:** the existing format, `"schema": "identity-lab-coach.resources.v1"`
     (see the import guide in the Library). Give every resource a new, stable `id`.
   - **Flashcards:** `"schema": "identity-lab-coach.cards.v1"` with a `cards` list. Each card has
     `id`, `front`, `back`, `type` (`recall` or `explain`), `weekTag` (1 to 9), `reference`
     (required) and `verified` (leave it `false`; the app ignores `true`, and the build rejects it).
2. Add a line for it to `content/manifest.json`: `id`, `title`, `version` (start at 1, add 1 when
   you change the pack), `type` (`resources`, `cards`, `guidance` or `lessons`) and `path` (a plain file name).
3. Check it before you publish: `node scripts/validate-content.mjs`. Publishing also runs this
   check (`.github/workflows/pages.yml`), and **any wrong row stops the site from being published**.
4. Push to `main`. Then click **Check for new content** in the app.

Two more pack types teach rather than list:

- **Guidance** (`type: guidance`, `"schema": "identity-lab-coach.guidance.v1"`): for each resource id, a
  `level` (`foundation`, `core` or `deep`) and a `howToUse` line, plus optional `suggestedDayChanges`.
  The level is a small label on each resource and the line shows under its title. Resources are ordered
  foundation, then core, then deep, and deep ones sit under a closed "Reference" heading. If you changed
  a resource yourself (title, source, type, minutes, link, reason or plan days) your version is kept and
  a "Newer version available" note offers the update. A guidance pack applies once per `version`.
- **Lessons** (`type: lessons`, `"schema": "identity-lab-coach.lessons.v1"`): one lesson per study day, with
  its week, day and the plan's date for that day. Today shows the day's lesson, and the Week view has a
  Lesson button on each day. Your answers to the check-yourself questions are stored apart, so a newer
  lesson version (a higher pack `version`) replaces the text and keeps your answers.

A resource or card whose id you already have is skipped, even if the pack file has changed since:
changes to existing items are not applied, so your edits are safe. Give a changed resource a new id.
`content/cards-test.json` is a 2-card test pack; remove its line from the manifest when you no
longer want it (and retire the two cards in the app).

## Install it like an app

Open the site in your browser and choose **Install** (Chrome, Edge, Brave and Arc) or
**Share → Add to Home Screen** (iPhone). It keeps a copy of itself so it opens offline.
**Each place you open it has its own saved data**: the phone app starts empty and does not
share anything with your computer, and on an iPhone the home-screen app is separate from
Safari too. Use Export and Import in Settings to move data between them.

## Less manual work

- **Guided daily session** (Today → "Start today's session"): warm-up flashcards,
  then "do this next" with the timer, then one tap to log. It reuses the same
  sections as the full Today page, which is still there ("Show the whole page").
  A finished timer takes you straight to the wrap-up, and the minutes are filled in.
- **Course home**: overall and per-week progress, and a "continue where you left off"
  button that points at the first required item you have not ticked.
- **Automatic backups**: the browser is asked to protect your data from being cleared;
  a snapshot of your data is kept inside the browser once a day (the newest 14); and,
  in Chrome, Edge, Brave and Arc, a backup folder you choose once gets a "latest" file
  and a dated file (the newest 14) by itself a few seconds after each change. After a
  browser restart it may need one click to be allowed again. Nothing is ever sent anywhere.
  Safari and Firefox cannot write to a folder, so they keep the daily snapshots only.

## Do not store secrets here

Do not put passwords, keys or confidential employer details in notes, evidence or people. Browser storage is not a password vault and is not encrypted.

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
| `js/progress.js` | Course progress and the "continue where you left off" rule (no page code) |
| `js/course.js` | The top of Plan: overall and per-week progress, and "Continue" |
| `js/routes.js` | Where each address goes, and the redirects from the old addresses (no page code) |
| `js/lessons.js` | The daily lesson (on Today and on its own page) and the saved answers |
| `js/session-flow.js` | Which step of the guided daily session you are on |
| `js/autobackup.js` | Automatic backups: protected storage, daily snapshots, backup folder |
| `js/backup-files.js` | Writing and pruning the backup files (only our own file names are ever touched) |
| `js/idb.js` | A tiny wrapper around the browser's IndexedDB, used for backups |
| `js/content.js` | Content packs: the manifest, card packs, what would be added, and the safe fetch |
| `content/` | The content packs and `manifest.json` (see "How to add content") |
| `scripts/validate-content.mjs` | Build check for the content packs; stops publishing on any wrong row |
| `scripts/make-icons.py` | Draws the app icons |
| `sw.js`, `manifest.webmanifest`, `icons/` | The installable app and its offline copy |
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
