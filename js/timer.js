// Session timer: focus blocks of 50 minutes with a 10-minute break between them.
//
// The timer stores timestamps, not a ticking counter, so it stays accurate
// after a reload or when a phone puts the tab to sleep. Its state is kept in
// its own localStorage key and is not part of your exported data; only the
// session you log from it is.
//
// Flow: focus → (break → focus) … → finished.
// - When a focus block ends, the break starts by itself.
// - When a break ends, the timer waits for you to start the next focus block,
//   so it never runs on while you are away.
// The timer always uses the real clock. The test date only changes which plan
// day is shown, not how fast time passes.

export const FOCUS_MIN = 50;
export const BREAK_MIN = 10;
const TIMER_KEY = 'identity-lab-coach:timer';
const MS_PER_MIN = 60_000;

export function buildPhases(focusBlocks) {
  const phases = [];
  for (let i = 0; i < focusBlocks; i++) {
    if (i > 0) phases.push({ type: 'break', minutes: BREAK_MIN });
    phases.push({ type: 'focus', minutes: FOCUS_MIN, block: i + 1 });
  }
  return phases;
}

/**
 * TimerState {
 *   date: 'YYYY-MM-DD'     plan date the session belongs to
 *   phases: Phase[]
 *   index: number           current phase
 *   running: boolean
 *   runStartedAt: number|null   epoch ms when the current run began
 *   phaseElapsedMs: number      time in the current phase before that run
 *   focusDoneMs: number         focus time from completed phases
 *   finished: boolean
 * }
 */
export function createTimer(date, focusBlocks) {
  return {
    date,
    phases: buildPhases(focusBlocks),
    index: 0,
    running: false,
    runStartedAt: null,
    phaseElapsedMs: 0,
    focusDoneMs: 0,
    finished: false,
  };
}

export function loadTimer() {
  try {
    const t = JSON.parse(localStorage.getItem(TIMER_KEY));
    return t && Array.isArray(t.phases) ? t : null;
  } catch {
    return null;
  }
}

export function saveTimer(t) {
  try {
    if (t) localStorage.setItem(TIMER_KEY, JSON.stringify(t));
    else localStorage.removeItem(TIMER_KEY);
  } catch {
    // Storage blocked: the timer still works until the page is closed.
  }
}

export function currentPhase(t) {
  return t.phases[t.index];
}

function elapsedInPhase(t, now) {
  return t.phaseElapsedMs + (t.running ? now - t.runStartedAt : 0);
}

/**
 * Moves the timer forward to `now`, completing any phases that have ended.
 * Returns the list of events that happened (for screen-reader announcements).
 */
export function advance(t, now = Date.now()) {
  const events = [];
  while (t.running && !t.finished) {
    const phase = currentPhase(t);
    const durationMs = phase.minutes * MS_PER_MIN;
    const elapsed = elapsedInPhase(t, now);
    if (elapsed < durationMs) break;

    const phaseEnd = now - (elapsed - durationMs);
    if (phase.type === 'focus') t.focusDoneMs += durationMs;
    events.push({ ended: phase });

    if (t.index === t.phases.length - 1) {
      t.finished = true;
      t.running = false;
      t.runStartedAt = null;
      t.phaseElapsedMs = 0;
      break;
    }
    t.index += 1;
    t.phaseElapsedMs = 0;
    const next = currentPhase(t);
    if (next.type === 'break') {
      t.runStartedAt = phaseEnd; // breaks start by themselves
    } else {
      t.running = false; // wait for you to start the next focus block
      t.runStartedAt = null;
    }
    events.push({ started: next, running: t.running });
  }
  return events;
}

export function start(t, now = Date.now()) {
  if (t.finished || t.running) return;
  t.running = true;
  t.runStartedAt = now;
}

export function pause(t, now = Date.now()) {
  if (!t.running) return;
  t.phaseElapsedMs += now - t.runStartedAt;
  t.running = false;
  t.runStartedAt = null;
}

/** Ends the current phase early and moves to the next one (paused). */
export function skipPhase(t, now = Date.now()) {
  if (t.finished) return;
  const phase = currentPhase(t);
  if (phase.type === 'focus') t.focusDoneMs += elapsedInPhase(t, now);
  t.running = false;
  t.runStartedAt = null;
  t.phaseElapsedMs = 0;
  if (t.index === t.phases.length - 1) t.finished = true;
  else t.index += 1;
}

export function remainingMs(t, now = Date.now()) {
  if (t.finished) return 0;
  return Math.max(0, currentPhase(t).minutes * MS_PER_MIN - elapsedInPhase(t, now));
}

/** Focus minutes so far, rounded to the nearest minute (breaks are not counted). */
export function focusMinutes(t, now = Date.now()) {
  let ms = t.focusDoneMs;
  if (!t.finished && currentPhase(t).type === 'focus') ms += elapsedInPhase(t, now);
  return Math.round(ms / MS_PER_MIN);
}

export function formatClock(ms) {
  const total = Math.ceil(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
