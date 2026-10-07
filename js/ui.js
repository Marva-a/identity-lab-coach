// Small helpers shared by the views.
import * as store from './store.js';
import { vancouverDate, isValidDateString } from './dates.js';

export function esc(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/** The date the app treats as today: the test date if it is on, otherwise Vancouver today. */
export function today() {
  const { testDate } = store.getSettings();
  return testDate.enabled && isValidDateString(testDate.date) ? testDate.date : vancouverDate();
}

export function testMode() {
  return store.getSettings().testDate.enabled;
}

const announcerEl = document.getElementById('announcer');

/** Polite screen-reader announcement. */
export function announce(message) {
  announcerEl.textContent = '';
  setTimeout(() => { announcerEl.textContent = message; }, 50);
}

export function plural(count, one, many) {
  return `${count} ${count === 1 ? one : many}`;
}
