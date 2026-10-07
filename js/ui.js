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

/** The "Please fix this before saving" box used by forms. */
export function errorSummaryHtml(id, errors) {
  if (!errors.length) return '';
  return `
    <div class="error-summary" role="alert" tabindex="-1" id="${id}">
      <h3>Please fix this before saving</h3>
      <ul>${errors.map((e) => `<li>${esc(e)}</li>`).join('')}</ul>
    </div>`;
}

/** Only http(s) links become clickable; anything else is shown as plain text. */
export function linkHtml(url, label) {
  const text = esc(label ?? url);
  if (!/^https?:\/\//i.test(String(url ?? '').trim())) return text;
  return `<a href="${esc(String(url).trim())}" target="_blank" rel="noopener noreferrer">${text}<span class="visually-hidden"> (opens in a new tab)</span></a>`;
}

/** Saves text as a file on this device (nothing is uploaded). */
export function downloadFile(fileName, text, mime = 'application/json') {
  const blob = new Blob([text], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** One-shot request for where focus should land after the next page change. */
export const nav = { focus: null };
