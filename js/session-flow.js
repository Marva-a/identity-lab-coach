// The guided daily session: warm-up, focus, wrap-up. This file only keeps track
// of which step you are on (so a reload resumes it); the screens are drawn in main.js.
export const STEPS = [
  { id: 'warmup', label: 'Warm-up', title: 'Warm-up: recall first' },
  { id: 'focus', label: 'Study', title: 'Study: today’s lesson' },
  { id: 'wrapup', label: 'Log time', title: 'Log time: save today’s session' },
];
const KEY = 'identity-lab-coach:session-flow';

export const stepIndex = (id) => Math.max(0, STEPS.findIndex((s) => s.id === id));
export const nextStep = (id) => STEPS[Math.min(STEPS.length - 1, stepIndex(id) + 1)].id;
export const previousStep = (id) => STEPS[Math.max(0, stepIndex(id) - 1)].id;

/** The saved flow if it belongs to `date`; otherwise null (a new day starts fresh). */
export function loadFlow(date) {
  try {
    const f = JSON.parse(localStorage.getItem(KEY));
    return f && f.date === date && STEPS.some((s) => s.id === f.step) ? f : null;
  } catch {
    return null;
  }
}

export function saveFlow(flow) {
  try {
    if (flow) localStorage.setItem(KEY, JSON.stringify(flow));
    else localStorage.removeItem(KEY);
  } catch {
    // Storage blocked: the flow still works until the page is closed.
  }
}
