// Flashcards: the retrieval check on Today, the Flashcards view, and the card editor.
// Handlers return a CSS selector to focus after the view re-renders (or nothing).
import * as store from './store.js';
import { esc, announce, today, testMode, plural } from './ui.js';
import { formatShort } from './dates.js';
import { getDayContext } from './plan.js';
import {
  scheduleAll, dueCards, pickInterleaved, nextState, RATINGS, RATING_LABELS, SRS_RULE, BOX_DAYS,
} from './srs.js';

export const RETRIEVAL_SIZE = 3;
const TYPE_LABELS = { recall: 'Recall', explain: 'Explain it' };
const FILTERS = {
  unlocked: 'Unlocked (not retired)',
  due: 'Due today',
  unverified: 'Unverified',
  verified: 'Verified',
  locked: 'Unlocks in a later week',
  retired: 'Retired',
  all: 'All cards',
};

// Transient UI state (not saved).
const ui = {
  reveal: null, // { cardId, context, response } once the answer is shown
  drafts: {}, // `${context}:${cardId}` → explanation typed so far
  filter: 'unlocked',
  week: 'all',
  editing: null, // card id, or 'new'
  form: null, // values typed into the card form
  formErrors: [],
  message: null,
};

function currentSchedule() {
  const d = store.getData();
  return scheduleAll(d.cards, d.cardReviews, today(), store.getSettings());
}

function verificationBadge(card) {
  if (card.verified) return '<span class="tag tag--verified">Verified by you</span>';
  return card.source === 'seed'
    ? '<span class="tag tag--unverified">Unverified: written by Claude</span>'
    : '<span class="tag tag--unverified">Unverified</span>';
}

function boxLabel(state) {
  return state.box === 0 ? 'New' : `Box ${state.box} of 5`;
}

function ratingHint(state, rating, date) {
  const next = nextState(state, rating, date);
  return next.due === date ? 'see again today' : `next due ${formatShort(next.due)}`;
}

// ─── Card face (shared by the retrieval check and the study queue) ───────────

function cardFaceHtml(card, sched, context, positionLabel) {
  const date = today();
  const key = `${context}:${card.id}`;
  const revealed = ui.reveal && ui.reveal.cardId === card.id && ui.reveal.context === context;
  const headingId = `card-front-${context}`;

  let body;
  if (!revealed) {
    body = card.type === 'explain'
      ? `
        <div class="field">
          <label for="explain-${context}">Explain it in your own words</label>
          <textarea id="explain-${context}" data-draft="${esc(key)}" rows="5" maxlength="${store.RESPONSE_MAX}" aria-describedby="explain-${context}-hint">${esc(ui.drafts[key] ?? '')}</textarea>
          <span class="hint" id="explain-${context}-hint">Write before you look. Your explanation is saved with your rating, so you can see how it improves.</span>
        </div>
        <button type="button" class="button--primary" data-action="card-reveal" data-id="${esc(card.id)}" data-context="${context}">Compare with the reference answer</button>`
      : `<button type="button" class="button--primary" data-action="card-reveal" data-id="${esc(card.id)}" data-context="${context}">Show answer</button>`;
  } else {
    const yours = card.type === 'explain'
      ? `<div class="answer answer--yours">
           <h4>Your explanation</h4>
           <p>${ui.reveal.response.trim() ? esc(ui.reveal.response) : '<em>You didn\'t write anything this time.</em>'}</p>
         </div>`
      : '';
    body = `
      <div class="answers">
        ${yours}
        <div class="answer">
          <h4 id="card-answer-${context}" tabindex="-1">${card.type === 'explain' ? 'Reference answer' : 'Answer'}</h4>
          <p>${esc(card.back)}</p>
        </div>
      </div>
      <fieldset class="ratings">
        <legend>How well did you know it?</legend>
        <div class="rating-row">
          ${RATINGS.map((r) => `
            <button type="button" class="rating rating--${r}" data-action="card-rate" data-id="${esc(card.id)}" data-rating="${r}" data-context="${context}">
              <span class="rating__label">${RATING_LABELS[r]}</span>
              <span class="rating__hint">${esc(ratingHint(sched.state, r, date))}</span>
            </button>`).join('')}
        </div>
      </fieldset>`;
  }

  return `
    <article class="flashcard" aria-labelledby="${headingId}">
      <p class="meta">${positionLabel ? `${esc(positionLabel)} · ` : ''}Week ${card.week ?? '–'} · ${TYPE_LABELS[card.type]} · ${boxLabel(sched.state)}</p>
      <ul class="tags" aria-label="Card status"><li>${verificationBadge(card)}</li></ul>
      <h3 class="flashcard__front" id="${headingId}" tabindex="-1">${esc(card.front)}</h3>
      ${body}
      <p class="meta reference">Check against: ${esc(card.reference || 'no reference given')}</p>
    </article>`;
}

// ─── Retrieval check on Today ────────────────────────────────────────────────

/** The 3-card retrieval check at the start of each Today session. */
export function retrievalHtml() {
  const date = today();
  const d = store.getData();
  const sched = currentSchedule();
  const doneToday = new Set(
    d.cardReviews.filter((r) => r.date === date && r.context === 'retrieval').map((r) => r.cardId),
  );
  const remaining = RETRIEVAL_SIZE - doneToday.size;
  const due = dueCards(d.cards, sched);
  const candidates = due.filter((c) => !sched.get(c.id).reviewedToday);

  let body;
  if (remaining > 0 && candidates.length) {
    const [card] = pickInterleaved(candidates, remaining);
    body = cardFaceHtml(card, sched.get(card.id), 'retrieval', `Card ${doneToday.size + 1} of ${Math.min(RETRIEVAL_SIZE, doneToday.size + candidates.length)}`);
  } else if (doneToday.size) {
    const ratings = d.cardReviews.filter((r) => r.date === date && r.context === 'retrieval');
    const counts = RATINGS.map((r) => [r, ratings.filter((x) => x.rating === r).length]).filter(([, n]) => n);
    const more = due.length;
    body = `
      <p class="status-ok" id="retrieval-done" tabindex="-1">Retrieval check done: ${plural(doneToday.size, 'card', 'cards')} (${counts.map(([r, n]) => `${RATING_LABELS[r]} ${n}`).join(', ')}).</p>
      ${more ? `<p class="meta">${plural(more, 'more card is', 'more cards are')} due. <a href="#cards">Study them in Flashcards</a>.</p>` : ''}`;
  } else {
    body = '<p class="meta">No cards are due today.</p>';
  }

  return `
    <section class="card" aria-labelledby="retrieval-heading">
      <h2 id="retrieval-heading" tabindex="-1">Retrieval check</h2>
      <p class="meta">Recall first, before you start the timer.</p>
      ${body}
    </section>`;
}

// ─── Flashcards view ─────────────────────────────────────────────────────────

function nextDueAfter(cards, sched, date) {
  const upcoming = cards
    .filter((c) => !c.retired)
    .map((c) => sched.get(c.id).due)
    .filter((due) => due > date)
    .sort();
  return upcoming[0] ?? null;
}

function cardFormHtml(card) {
  const f = ui.form ?? {
    type: card?.type ?? 'recall',
    front: card?.front ?? '',
    back: card?.back ?? '',
    week: card ? (card.week ?? '') : String(defaultWeek() ?? ''),
    topic: card?.topic ?? '',
    reference: card?.reference ?? '',
    verified: false,
  };
  const isNew = !card;
  const errors = ui.formErrors.length
    ? `<div class="error-summary" role="alert" tabindex="-1" id="card-form-errors">
         <h3>Please fix this before saving</h3>
         <ul>${ui.formErrors.map((e) => `<li>${esc(e)}</li>`).join('')}</ul>
       </div>`
    : '';
  return `
    <form id="card-form" class="card-form" data-card-id="${esc(card?.id ?? 'new')}" novalidate>
      <h3 id="card-form-heading" tabindex="-1">${isNew ? 'Add a card' : 'Edit card'}</h3>
      ${errors}
      <fieldset>
        <legend>Card type</legend>
        <div class="choice-group">
          <label class="choice"><input type="radio" name="card-type" value="recall" ${f.type === 'recall' ? 'checked' : ''}> Recall (question → answer)</label>
          <label class="choice"><input type="radio" name="card-type" value="explain" ${f.type === 'explain' ? 'checked' : ''}> Explain it (type, then compare)</label>
        </div>
      </fieldset>
      <div class="field">
        <label for="card-front">Question or prompt</label>
        <textarea id="card-front" name="front" rows="2" maxlength="${store.CARD_TEXT_MAX}">${esc(f.front)}</textarea>
      </div>
      <div class="field">
        <label for="card-back">Reference answer</label>
        <textarea id="card-back" name="back" rows="4" maxlength="${store.CARD_TEXT_MAX}">${esc(f.back)}</textarea>
      </div>
      <div class="field">
        <label for="card-week">Unlocks in week</label>
        <select id="card-week" name="week" aria-describedby="card-week-hint">
          <option value="" ${f.week === '' ? 'selected' : ''}>No week (always unlocked)</option>
          ${[1, 2, 3, 4, 5, 6, 7, 8, 9].map((w) => `<option value="${w}" ${String(f.week) === String(w) ? 'selected' : ''}>Week ${w}</option>`).join('')}
        </select>
        <span class="hint" id="card-week-hint">The card stays hidden until that week starts, then mixes with earlier weeks.</span>
      </div>
      <div class="field">
        <label for="card-topic">Topic (optional)</label>
        <input type="text" id="card-topic" name="topic" value="${esc(f.topic)}" maxlength="120">
      </div>
      <div class="field">
        <label for="card-reference">Reference</label>
        <input type="text" id="card-reference" name="reference" value="${esc(f.reference)}" maxlength="${store.REFERENCE_MAX}" aria-describedby="card-reference-hint">
        <span class="hint" id="card-reference-hint">Where to check it, for example "RFC 7636" or "NIST SP 800-63B-4".</span>
      </div>
      ${isNew ? `
        <label class="check" for="card-verified">
          <input type="checkbox" id="card-verified" name="verified" ${f.verified ? 'checked' : ''}>
          <span>I've checked this against the reference (mark verified)</span>
        </label>` : ''}
      <div class="button-row">
        <button type="submit" class="button--primary">${isNew ? 'Add card' : 'Save changes'}</button>
        <button type="button" data-action="card-cancel">Cancel</button>
      </div>
    </form>`;
}

function defaultWeek() {
  const ctx = getDayContext(today(), store.getSettings());
  if (ctx.kind === 'study') return ctx.week.number;
  if (ctx.kind === 'rest' && ctx.calendarWeek) return ctx.calendarWeek;
  return null;
}

function historyHtml(card, sched) {
  const reviews = [...sched.reviews].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
  if (!reviews.length) return '';
  const label = card.type === 'explain' ? 'Your explanations and ratings' : 'Your ratings';
  return `
    <details>
      <summary>${esc(label)} (${reviews.length})</summary>
      <ol class="history">
        ${reviews.map((r) => `
          <li>
            <strong>${esc(formatShort(r.date))}</strong> · ${RATING_LABELS[r.rating]}${r.testMode ? ' <span class="tag tag--test">Test</span>' : ''}
            ${card.type === 'explain' ? `<p>${r.response.trim() ? esc(r.response) : '<em>Nothing written</em>'}</p>` : ''}
          </li>`).join('')}
      </ol>
    </details>`;
}

function cardRowHtml(card, sched) {
  if (ui.editing === card.id) return `<li class="card-row">${cardFormHtml(card)}</li>`;
  const date = today();
  let when;
  if (card.retired) when = 'Retired';
  else if (!sched.unlocked) when = `Unlocks ${formatShort(sched.unlock)}`;
  else if (sched.isDue) when = 'Due today';
  else when = `Next due ${formatShort(sched.due)}`;
  const shortFront = card.front.length > 70 ? `${card.front.slice(0, 67)}…` : card.front;
  return `
    <li class="card-row">
      <p class="card-row__front">${esc(card.front)}</p>
      <p class="meta">Week ${card.week ?? '–'} · ${TYPE_LABELS[card.type]} · ${boxLabel(sched.state)} · <strong>${esc(when)}</strong>${sched.due && when.startsWith('Due') && sched.due < date ? ` (since ${esc(formatShort(sched.due))})` : ''}</p>
      <ul class="tags" aria-label="Card status"><li>${verificationBadge(card)}</li></ul>
      <p class="meta reference">Check against: ${esc(card.reference || 'no reference given')}</p>
      <div class="button-row">
        <button type="button" class="button--small" data-action="card-edit" data-id="${esc(card.id)}" aria-label="Edit: ${esc(shortFront)}">Edit</button>
        ${card.verified
          ? `<button type="button" class="button--small" data-action="card-unverify" data-id="${esc(card.id)}" aria-label="Mark unverified: ${esc(shortFront)}">Mark unverified</button>`
          : `<button type="button" class="button--small" data-action="card-verify" data-id="${esc(card.id)}" aria-label="Mark verified: ${esc(shortFront)}">Mark verified</button>`}
        ${card.retired
          ? `<button type="button" class="button--small" data-action="card-restore" data-id="${esc(card.id)}" aria-label="Restore: ${esc(shortFront)}">Restore</button>`
          : `<button type="button" class="button--small button--danger" data-action="card-retire" data-id="${esc(card.id)}" aria-label="Retire: ${esc(shortFront)}">Retire</button>`}
      </div>
      ${historyHtml(card, sched)}
    </li>`;
}

function matchesFilter(card, sched) {
  if (ui.week !== 'all' && String(card.week ?? 'none') !== ui.week) return false;
  switch (ui.filter) {
    case 'unlocked': return sched.unlocked && !card.retired;
    case 'due': return sched.isDue;
    case 'unverified': return !card.verified && !card.retired;
    case 'verified': return card.verified;
    case 'locked': return !sched.unlocked && !card.retired;
    case 'retired': return card.retired;
    default: return true;
  }
}

export function flashcardsView() {
  const date = today();
  const d = store.getData();
  const sched = currentSchedule();
  const due = dueCards(d.cards, sched);

  let study;
  if (due.length) {
    const [card] = due;
    study = cardFaceHtml(card, sched.get(card.id), 'study', `${plural(due.length, 'card', 'cards')} due`);
  } else {
    const next = nextDueAfter(d.cards, sched, date);
    study = `<p class="status-ok" id="study-done" tabindex="-1">Nothing due today.${next ? ` Next card due ${esc(formatShort(next))}.` : ''}</p>`;
  }

  const active = d.cards.filter((c) => !c.retired);
  const unlocked = active.filter((c) => sched.get(c.id).unlocked).length;
  const unverified = active.filter((c) => !c.verified).length;
  const retired = d.cards.length - active.length;
  const shown = d.cards
    .filter((c) => matchesFilter(c, sched.get(c.id)))
    .sort((a, b) => (a.week ?? 0) - (b.week ?? 0) || a.createdAt.localeCompare(b.createdAt));

  const weekOptions = ['all', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'none'];

  return `
    <h1 id="day-heading" tabindex="-1">Flashcards</h1>

    <section class="card" aria-labelledby="study-heading">
      <h2 id="study-heading">Study</h2>
      ${study}
    </section>

    <section class="card card--quiet" aria-labelledby="rule-heading">
      <h2 id="rule-heading">How scheduling works</h2>
      <p>${esc(SRS_RULE[0])} ${esc(SRS_RULE[1])}</p>
      <p class="meta">Boxes: ${BOX_DAYS.map((days, i) => `${i + 1} = ${plural(days, 'day', 'days')}`).join(' · ')}. New cards are due on the day their week unlocks.</p>
    </section>

    <section class="card" aria-labelledby="cards-heading">
      <h2 id="cards-heading" tabindex="-1">Your cards</h2>
      <p class="meta">${plural(active.length, 'active card', 'active cards')}: ${unlocked} unlocked, ${active.length - unlocked} in later weeks, ${unverified} unverified${retired ? `, ${retired} retired` : ''}.</p>
      ${ui.message ? `<p class="status-ok" id="cards-message" tabindex="-1">${esc(ui.message)}</p>` : ''}
      <div class="filters">
        <div class="field">
          <label for="card-filter">Show</label>
          <select id="card-filter">
            ${Object.entries(FILTERS).map(([v, l]) => `<option value="${v}" ${ui.filter === v ? 'selected' : ''}>${esc(l)}</option>`).join('')}
          </select>
        </div>
        <div class="field">
          <label for="card-week-filter">Week</label>
          <select id="card-week-filter">
            ${weekOptions.map((w) => `<option value="${w}" ${ui.week === w ? 'selected' : ''}>${w === 'all' ? 'All weeks' : w === 'none' ? 'No week' : `Week ${w}`}</option>`).join('')}
          </select>
        </div>
      </div>
      ${ui.editing === 'new'
        ? cardFormHtml(null)
        : '<div class="button-row"><button type="button" data-action="card-add">Add a card</button></div>'}
      <p class="meta" aria-live="polite">${plural(shown.length, 'card', 'cards')} shown.</p>
      <ul class="card-list">
        ${shown.map((c) => cardRowHtml(c, sched.get(c.id))).join('')}
      </ul>
    </section>`;
}

// ─── Events ──────────────────────────────────────────────────────────────────

function readCardForm(form) {
  const week = form.querySelector('#card-week').value;
  return {
    type: form.querySelector('input[name="card-type"]:checked')?.value,
    front: form.querySelector('#card-front').value,
    back: form.querySelector('#card-back').value,
    week: week === '' ? null : Number(week),
    topic: form.querySelector('#card-topic').value,
    reference: form.querySelector('#card-reference').value,
    verified: form.querySelector('#card-verified')?.checked ?? false,
  };
}

/** Click handlers. Each returns the selector to focus after re-rendering. */
export const cardActions = {
  'card-reveal': (el) => {
    const { id, context } = el.dataset;
    const key = `${context}:${id}`;
    const textarea = document.getElementById(`explain-${context}`);
    const response = textarea ? textarea.value : '';
    ui.drafts[key] = response;
    ui.reveal = { cardId: id, context, response };
    return `#card-answer-${context}`;
  },
  'card-rate': (el) => {
    const { id, rating, context } = el.dataset;
    const response = ui.reveal?.cardId === id ? ui.reveal.response : '';
    const result = store.addCardReview({
      cardId: id, date: today(), rating, response, context, testMode: testMode(),
    });
    ui.reveal = null;
    delete ui.drafts[`${context}:${id}`];
    if (!result.ok) return null;
    const after = currentSchedule().get(id);
    announce(`Rated ${RATING_LABELS[rating]}. ${after.due === today() ? 'You will see it again today.' : `Next due ${formatShort(after.due)}.`}${result.saved ? '' : ' Warning: this browser blocked saving.'}`);
    // Focus the next card, or the completion message.
    if (context === 'retrieval') return `#card-front-retrieval, #retrieval-done, #retrieval-heading`;
    return '#card-front-study, #study-done';
  },
  'card-add': () => {
    ui.editing = 'new';
    ui.form = null;
    ui.formErrors = [];
    ui.message = null;
    return '#card-form-heading';
  },
  'card-edit': (el) => {
    ui.editing = el.dataset.id;
    ui.form = null;
    ui.formErrors = [];
    ui.message = null;
    return '#card-form-heading';
  },
  'card-cancel': () => {
    const id = ui.editing;
    ui.editing = null;
    ui.form = null;
    ui.formErrors = [];
    return id && id !== 'new' ? `[data-action="card-edit"][data-id="${id}"]` : '[data-action="card-add"]';
  },
  'card-verify': (el) => {
    store.setCardVerified(el.dataset.id, true);
    announce('Card marked verified.');
    return `[data-action="card-unverify"][data-id="${el.dataset.id}"], #cards-heading`;
  },
  'card-unverify': (el) => {
    store.setCardVerified(el.dataset.id, false);
    announce('Card marked unverified.');
    return `[data-action="card-verify"][data-id="${el.dataset.id}"], #cards-heading`;
  },
  'card-retire': (el) => {
    store.setCardRetired(el.dataset.id, true);
    announce('Card retired. It will not come up for review.');
    return `[data-action="card-restore"][data-id="${el.dataset.id}"], #cards-heading`;
  },
  'card-restore': (el) => {
    store.setCardRetired(el.dataset.id, false);
    announce('Card restored.');
    return `[data-action="card-retire"][data-id="${el.dataset.id}"], #cards-heading`;
  },
};

/** Handles the card form submit. Returns the selector to focus. */
export function submitCardForm(form) {
  const values = readCardForm(form);
  const id = form.dataset.cardId;
  const result = id === 'new' ? store.addCard(values) : store.updateCard(id, values);
  if (!result.ok) {
    ui.form = { ...values, week: values.week ?? '' };
    ui.formErrors = result.problems;
    return '#card-form-errors';
  }
  ui.editing = null;
  ui.form = null;
  ui.formErrors = [];
  ui.message = id === 'new' ? 'Card added.' : 'Card saved.';
  announce(ui.message);
  return '#cards-message';
}

/** Handles change events on the Flashcards view. Returns a selector, or null if not handled. */
export function handleCardChange(target) {
  if (target.id === 'card-filter') {
    ui.filter = target.value;
    return '#card-filter';
  }
  if (target.id === 'card-week-filter') {
    ui.week = target.value;
    return '#card-week-filter';
  }
  return null;
}

/** Keeps typed text across re-renders (explanations and the card form). */
export function handleCardInput(target) {
  if (target.dataset.draft) ui.drafts[target.dataset.draft] = target.value;
  const form = target.closest('#card-form');
  if (form) {
    const values = readCardForm(form);
    ui.form = { ...values, week: values.week ?? '' };
  }
}

export function resetCardMessages() {
  ui.message = null;
}

/**
 * Opens the add-card form with a resource note filled in, so a note can become
 * a card through the normal card flow. The card starts unverified; you write
 * the question and save it yourself.
 */
export function startCardFromResource({ back, week, topic, reference }) {
  ui.editing = 'new';
  ui.form = {
    type: 'recall', front: '', back: String(back).slice(0, store.CARD_TEXT_MAX), week: week ? String(week) : '', topic, reference, verified: false,
  };
  ui.formErrors = [];
  ui.message = null;
}
