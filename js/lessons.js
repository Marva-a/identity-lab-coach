// Daily lessons: plain-language context for a study day, from a lessons pack.
// A lesson has a summary, why it matters, key ideas, words, timed steps (each can point at a resource in
// the Library), what to skim or skip, and check-yourself questions with a box that saves your answer.
// Lessons are content: you cannot edit them, and your answers are stored apart so an update never loses them.
import * as store from './store.js';
import { esc, announce, testMode, nav, plural } from './ui.js';
import { formatShort } from './dates.js';
import { nextLessonOf } from './progress.js';
import { showResourceInLibrary } from './resources.js';
import { startCardDraft } from './flashcards.js';

const pending = new Map(); // "lessonId:index" → text not saved yet
const timers = new Map();
const openChecks = new Set(); // "lessonId:index" of the good answers you opened (kept across redraws)

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
  setStatus(lessonId, index, '');
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
    return `<li><span class="step-minutes">${esc(minutesText(s.minutes))}</span><span class="step-text">${esc(s.text)}${link}</span></li>`;
  }).join('');
  return `
    <section class="card lesson" aria-labelledby="lesson-title-${esc(lesson.id)}">
      <p class="eyebrow">Lesson · Day ${lesson.day} · about ${esc(minutesText(lesson.plannedMinutes))}</p>
      <${h} id="lesson-title-${esc(lesson.id)}" tabindex="-1">${esc(lesson.title)}</${h}>
      <p class="lesson-summary">${esc(lesson.inOneSentence)}</p>

      <${sub} class="lesson__label">Why it matters</${sub}>
      <p>${esc(lesson.whyItMattersToADesigner)}</p>

      <${sub} class="lesson__label">Key ideas</${sub}>
      <ul>${lesson.keyIdeas.map((k) => `<li>${esc(k)}</li>`).join('')}</ul>

      ${lesson.words.length ? `
        <${sub} class="lesson__label">Key terms</${sub}>
        <dl class="words">${lesson.words.map((w) => `<div><dt>${esc(w.term)}</dt><dd>${esc(w.meaning)}</dd></div>`).join('')}</dl>` : ''}

      <${sub} class="lesson__label">Steps <span class="lesson__label-note">${esc(minutesText(stepTotal))}</span></${sub}>
      <ol class="lesson-steps">${steps}</ol>

      <${sub} class="lesson__label">Skim or skip</${sub}>
      <p>${esc(lesson.skipOrSkim)}</p>

      <${sub} class="lesson__label">Check yourself</${sub}>
      <p class="meta">Answer in your own words before you look anything up. Your answer is saved as you type.</p>
      ${lesson.checkYourself.map((q, i) => `
        <div class="field">
          <label for="la-${esc(lesson.id)}-${i}">${esc(q)}</label>
          <textarea id="la-${esc(lesson.id)}-${i}" rows="3" maxlength="4000" data-lesson-answer="${esc(lesson.id)}" data-q="${i}" aria-describedby="las-${esc(lesson.id)}-${i}">${esc(answers[i] ?? '')}</textarea>
          <span class="hint" id="las-${esc(lesson.id)}-${i}" aria-live="polite">${(answers[i] ?? '').trim() ? 'Saved' : 'Saved as you type.'}</span>
        </div>
        ${lookForHtml(lesson, i)}`).join('')}

      ${completeHtml(lesson)}
    </section>`;
}

const isDone = (l) => Boolean(store.lessonDoneAt(l.id));
/** The next lesson to do, in course order, or null when every written lesson is complete. */
export const nextLesson = () => nextLessonOf(store.lessonsInOrder(), isDone);
const dayOf = (iso) => formatShort(new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/Vancouver' }));

/**
 * The end of a lesson: one button to complete it; once complete, a quiet note and the next lesson.
 * Completing never depends on the questions being answered: that is your call.
 */
function completeHtml(lesson) {
  const doneAt = store.lessonDoneAt(lesson.id);
  if (!doneAt) {
    return `
      <div class="lesson-complete">
        <button type="button" class="button--primary" data-action="lesson-complete" data-lesson="${esc(lesson.id)}">Complete lesson</button>
      </div>`;
  }
  const next = nextLesson();
  const nextCta = next
    ? `<a class="button button--primary" href="#lesson/${next.day}">Start next lesson<span class="visually-hidden">: ${esc(next.title)}</span></a>
       <p class="meta">Day ${next.day} · ${esc(next.title)}</p>`
    : '<p class="meta">That is every lesson written so far. New ones arrive as course updates.</p>';
  return `
    <div class="lesson-complete lesson-complete--done" id="lesson-done-${esc(lesson.id)}" tabindex="-1">
      <p class="lesson-complete__status"><span class="lesson-complete__mark" aria-hidden="true">✓</span> Lesson complete · ${esc(dayOf(doneAt))}</p>
      ${nextCta}
      <button type="button" class="button--small lesson-complete__undo" data-action="lesson-uncomplete" data-lesson="${esc(lesson.id)}">Mark as not complete</button>
    </div>`;
}

/** Learn → Lessons: the course as a list, with what is complete and what is up next. */
export function lessonsListView() {
  const all = store.lessonsInOrder();
  const next = nextLesson();
  const done = all.filter(isDone).length;
  const pct = all.length ? Math.round((done / all.length) * 100) : 0;
  const weeks = [...new Set(all.map((l) => l.week))];
  const rows = weeks.map((w) => `
    <h2 class="small-label lessons-week">Week ${w}</h2>
    <ol class="steps-list lessons-list">
      ${all.filter((l) => l.week === w).map((l) => {
    const complete = isDone(l);
    const upNext = next && next.id === l.id;
    const state = complete ? 'done' : upNext ? 'next' : 'todo';
    const said = complete ? 'complete' : upNext ? 'up next' : 'not started';
    return `
      <li class="step step--${state === 'done' ? 'done' : 'todo'} ${upNext ? 'step--next' : ''}">
        <a class="step__row" href="#lesson/${l.day}">
          <span class="step__mark" aria-hidden="true">${complete ? '✓' : l.day}</span>
          <span class="step__body"><span class="step__title">${esc(l.title)}</span><span class="step__meta">Day ${l.day} · about ${l.plannedMinutes} min${upNext ? ' · Up next' : ''}</span></span>
          <span class="visually-hidden"> (${said})</span>
          <span class="step__go" aria-hidden="true">›</span>
        </a>
      </li>`;
  }).join('')}
    </ol>`).join('');
  return `
    <h1 id="day-heading" tabindex="-1">Lessons</h1>
    ${all.length ? `
      <p class="meta page-intro"><strong>${done} of ${plural(all.length, 'lesson', 'lessons')}</strong> complete. Go at your own pace: finish one, then start the next.</p>
      <div class="progress" role="img" aria-label="${done} of ${all.length} lessons complete"><span style="width:${pct}%"></span></div>
      ${next ? `<div class="button-row"><a class="button button--primary" href="#lesson/${next.day}">${done ? 'Continue' : 'Start'}: ${esc(next.title)}</a></div>` : '<p class="status-ok">Every lesson written so far is complete.</p>'}
      ${rows}
      <p class="meta">More lessons arrive as course updates (Settings → Content).</p>`
    : '<p class="empty-state">No lessons yet. Add the course in <a href="#learn/library">Learn → Overview</a>.</p>'}`;
}

/**
 * What a good answer includes, folded away so you answer first. Opening it is your choice; it never blocks you.
 * From there one click makes the question a flashcard, so it comes back for spaced review.
 */
function lookForHtml(lesson, i) {
  const text = lesson.lookFor?.[i];
  if (!text) return '';
  const k = key(lesson.id, i);
  return `
    <details class="lesson-check" data-lesson-check="${esc(k)}" ${openChecks.has(k) ? 'open' : ''}>
      <summary><span>Compare with an example answer <span class="lesson-check__when">(after you try)</span></span></summary>
      <p class="meta">Check what you wrote against this. Missing a part is normal: add it to your answer in your own words.</p>
      <p class="lesson-check__answer">${esc(text)}</p>
      <button type="button" class="button--small" data-action="lesson-card" data-lesson="${esc(lesson.id)}" data-q="${i}">Make it a flashcard<span class="visually-hidden">: ${esc(lesson.checkYourself[i])}</span></button>
    </details>`;
}

/** Remembers which good answers you opened. Returns true when the event was for one of them. */
export function handleLessonToggle(event) {
  const k = event.target?.dataset?.lessonCheck;
  if (!k) return false;
  if (event.target.open) openChecks.add(k);
  else openChecks.delete(k);
  return true;
}

export const lessonActions = {
  'lesson-complete': (el) => {
    flushLessonAnswers();
    const id = el.dataset.lesson;
    store.setLessonDone(id, true, testMode());
    const next = nextLesson();
    announce(`Lesson complete.${next ? ` Next: ${next.title}.` : ' That is every lesson written so far.'}`);
    return `#lesson-done-${id}`;
  },
  'lesson-uncomplete': (el) => {
    const id = el.dataset.lesson;
    store.setLessonDone(id, false, testMode());
    announce('Marked as not complete.');
    return `[data-action="lesson-complete"][data-lesson="${id}"]`;
  },
  /** Opens the card form with the question on the front and the good answer on the back (unverified, editable). */
  'lesson-card': (el) => {
    const lesson = store.lessonById(el.dataset.lesson);
    const i = Number(el.dataset.q);
    if (!lesson?.lookFor?.[i]) return null;
    flushLessonAnswers();
    startCardDraft({
      front: lesson.checkYourself[i],
      back: lesson.lookFor[i],
      week: lesson.week,
      topic: lesson.title.slice(0, 120),
      reference: `Lesson, Day ${lesson.day}: ${lesson.title}`.slice(0, 300),
    });
    nav.focus = '#card-form-heading';
    location.hash = '#settings/content';
    return null;
  },
};

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
      <p><a href="#learn/lessons">← Lessons</a></p>
      <h1 id="day-heading" tabindex="-1">No lesson for this day</h1>
      <p>There is no lesson for day ${esc(day)} yet. Check for course updates in <a href="#settings/content">Settings → Content</a> to see if one has been added.</p>`;
  }
  return `
    <p><a href="#learn/lessons">← Lessons</a></p>
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
