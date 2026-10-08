// Daily lessons: plain-language context for a study day, from a lessons pack.
// A lesson has a summary, why it matters, key ideas, words, timed steps (each can point at a resource in
// the Library), what to skim or skip, and check-yourself questions with a box that saves your answer.
// Lessons are content: you cannot edit them, and your answers are stored apart so an update never loses them.
import * as store from './store.js';
import { esc, announce, testMode, nav } from './ui.js';
import { showResourceInLibrary } from './resources.js';

const pending = new Map(); // "lessonId:index" → text not saved yet
const timers = new Map();

const key = (lessonId, index) => `${lessonId}:${index}`;

function setStatus(lessonId, index, text) {
  const el = document.getElementById(`las-${lessonId}-${index}`);
  if (el) el.textContent = text;
}

function save(lessonId, index) {
  const k = key(lessonId, index);
  if (!pending.has(k)) return;
  const text = pending.get(k);
  pending.delete(k);
  clearTimeout(timers.get(k));
  timers.delete(k);
  const ok = store.setLessonAnswer(lessonId, index, text, testMode());
  setStatus(lessonId, index, ok ? 'Saved' : 'Could not save: this browser blocked saving.');
}

/** Saves every answer typed a moment ago (called before the page redraws or closes). */
export function flushLessonAnswers() {
  for (const k of [...pending.keys()]) {
    const [lessonId, index] = [k.slice(0, k.lastIndexOf(':')), Number(k.slice(k.lastIndexOf(':') + 1))];
    save(lessonId, index);
  }
}

/** Typing in an answer box: saved a moment after you stop. */
export function handleLessonInput(target) {
  const lessonId = target.dataset?.lessonAnswer;
  if (!lessonId) return false;
  const index = Number(target.dataset.q);
  const k = key(lessonId, index);
  pending.set(k, target.value);
  setStatus(lessonId, index, 'Saving…');
  clearTimeout(timers.get(k));
  timers.set(k, setTimeout(() => save(lessonId, index), 600));
  return true;
}

const minutesText = (n) => `${n} min`;

/** One lesson. `level` is the heading level of its title (2 inside Today, 1 on its own page). */
export function lessonHtml(lesson, { level = 2 } = {}) {
  const h = `h${level}`;
  const sub = `h${level + 1}`;
  const answers = store.getLessonAnswers(lesson.id);
  const stepTotal = lesson.steps.reduce((n, s) => n + s.minutes, 0);
  const steps = lesson.steps.map((s) => {
    const r = s.resourceId ? store.getResource(s.resourceId) : null;
    const link = s.resourceId
      ? r
        ? ` <a href="#learn/library" data-resource-link="${esc(r.id)}">${esc(r.title)}<span class="visually-hidden"> (open in the Library)</span></a>`
        : ' <span class="meta">(its resource is not in your Library yet: check for new content in Learn)</span>'
      : '';
    return `<li><span class="step-minutes">${esc(minutesText(s.minutes))}</span> ${esc(s.text)}${link}</li>`;
  }).join('');
  return `
    <section class="card lesson" aria-labelledby="lesson-title-${esc(lesson.id)}">
      <p class="eyebrow">Lesson · Day ${lesson.day} · about ${esc(minutesText(lesson.plannedMinutes))}</p>
      <${h} id="lesson-title-${esc(lesson.id)}" tabindex="-1">${esc(lesson.title)}</${h}>
      <p class="lesson-summary">${esc(lesson.inOneSentence)}</p>

      <${sub}>Why it matters</${sub}>
      <p>${esc(lesson.whyItMattersToADesigner)}</p>

      <${sub}>Key ideas</${sub}>
      <ul>${lesson.keyIdeas.map((k) => `<li>${esc(k)}</li>`).join('')}</ul>

      ${lesson.words.length ? `
        <${sub}>Words</${sub}>
        <dl class="words">${lesson.words.map((w) => `<div><dt>${esc(w.term)}</dt><dd>${esc(w.meaning)}</dd></div>`).join('')}</dl>` : ''}

      <${sub}>Steps (${esc(minutesText(stepTotal))})</${sub}>
      <ol class="lesson-steps">${steps}</ol>

      <${sub}>Skim or skip</${sub}>
      <p>${esc(lesson.skipOrSkim)}</p>

      <${sub}>Check yourself</${sub}>
      <p class="meta">Answer in your own words before you look anything up. Your answer is saved as you type.</p>
      ${lesson.checkYourself.map((q, i) => `
        <div class="field">
          <label for="la-${esc(lesson.id)}-${i}">${esc(q)}</label>
          <textarea id="la-${esc(lesson.id)}-${i}" rows="3" maxlength="4000" data-lesson-answer="${esc(lesson.id)}" data-q="${i}" aria-describedby="las-${esc(lesson.id)}-${i}">${esc(answers[i] ?? '')}</textarea>
          <span class="hint" id="las-${esc(lesson.id)}-${i}" aria-live="polite">${(answers[i] ?? '').trim() ? 'Saved' : 'Saved as you type.'}</span>
        </div>`).join('')}
    </section>`;
}

/** The day's lesson on Today (the main content of a study day), or nothing when there is none. */
export function todayLessonHtml(ctx) {
  if (ctx.kind !== 'study') return '';
  const lesson = store.lessonForDay(ctx.contentDay);
  return lesson ? lessonHtml(lesson, { level: 2 }) : '';
}

/** A "Lesson" link for a day in the Week view. */
export function lessonLinkHtml(contentDay) {
  const lesson = store.lessonForDay(contentDay);
  return lesson ? `<a class="button button--small" href="#lesson/${contentDay}">Lesson<span class="visually-hidden">: ${esc(lesson.title)}</span></a>` : '';
}

/** The page for one lesson (#lesson/3). */
export function lessonPageView(day) {
  const lesson = store.lessonForDay(Number(day));
  if (!lesson) {
    return `
      <p><a href="#plan">← Plan</a></p>
      <h1 id="day-heading" tabindex="-1">No lesson for this day</h1>
      <p>There is no lesson for day ${esc(day)} yet. Check for new content in <a href="#learn/library">Learn</a> to see if one has been added.</p>`;
  }
  return `
    <p><a href="#plan">← Plan</a></p>
    ${lessonHtml(lesson, { level: 1 }).replace(`id="lesson-title-${esc(lesson.id)}"`, 'id="day-heading"')}`;
}

/** Clicking a resource in a lesson step opens the Library at that resource. */
export function handleLessonClick(e) {
  const link = e.target.closest?.('[data-resource-link]');
  if (!link) return false;
  showResourceInLibrary(link.dataset.resourceLink);
  announce('Opening the Library at that resource.');
  return true;
}
