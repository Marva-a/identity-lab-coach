// Spaced repetition: Leitner boxes.
//
// The rule in two sentences (also shown in the app):
//   Every card sits in one of five boxes, and each box has a waiting time of
//   1, 3, 7, 14 or 30 days. "Again" sends a card back to box 1 to see again
//   today, "Hard" keeps it in its box, "Good" moves it up one box and "Easy"
//   moves it up two; the card then comes back after its new box's waiting time.
//
// A card's schedule is not stored. It is worked out by replaying the card's
// review log (store.js → cardReviews) in date order. That keeps one source of
// truth: deleting test reviews, or importing a file, can never leave a card
// with a schedule that doesn't match its history.
import { addDays } from './dates.js';
import { getWeek, contentWeekNumber } from './plan.js';

export const BOX_DAYS = [1, 3, 7, 14, 30]; // waiting time for boxes 1–5
export const RATINGS = ['again', 'hard', 'good', 'easy'];
export const RATING_LABELS = { again: 'Again', hard: 'Hard', good: 'Good', easy: 'Easy' };
export const SRS_RULE = [
  'Every card sits in one of five boxes, and each box has a waiting time of 1, 3, 7, 14 or 30 days.',
  '"Again" sends a card back to box 1 to see again today, "Hard" keeps it in its box, "Good" moves it up one box and "Easy" moves it up two; the card then comes back after its new box\'s waiting time.',
];

/** A new card: box 0, due on the day its week unlocks. */
export function initialState() {
  return { box: 0, due: null, lastReviewed: null, reviewCount: 0 };
}

/** The state after one rating on `date`. */
export function nextState(state, rating, date) {
  let box = state.box;
  if (rating === 'again') box = 1;
  else if (rating === 'hard') box = Math.max(1, box);
  else if (rating === 'good') box = Math.min(5, box + 1);
  else if (rating === 'easy') box = Math.min(5, box + 2);
  const due = rating === 'again' ? date : addDays(date, BOX_DAYS[box - 1]);
  return { box, due, lastReviewed: date, reviewCount: state.reviewCount + 1 };
}

/** Replays a card's reviews (any order) into its current state. */
export function replay(reviews) {
  return [...reviews]
    .sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt))
    .reduce((state, r) => nextState(state, r.rating, r.date), initialState());
}

/**
 * The date a card's week unlocks: the Monday of the calendar week that shows
 * that week's content (so the Week 2/5 swap moves cards with their content).
 * Cards with no week are unlocked from the start.
 */
export function unlockDate(week, settings) {
  if (!week) return '0000-01-01';
  return getWeek(contentWeekNumber(week, settings)).start;
}

/**
 * Works out every card's schedule for `today`.
 * Returns Map(cardId → { state, unlock, unlocked, due, isDue, reviewedToday }).
 */
export function scheduleAll(cards, reviews, today, settings) {
  const byCard = new Map();
  for (const r of reviews) {
    if (!byCard.has(r.cardId)) byCard.set(r.cardId, []);
    byCard.get(r.cardId).push(r);
  }
  const out = new Map();
  for (const card of cards) {
    const cardReviews = byCard.get(card.id) ?? [];
    const state = replay(cardReviews);
    const unlock = unlockDate(card.week, settings);
    const unlocked = today >= unlock;
    const due = state.due ?? unlock;
    out.set(card.id, {
      state,
      unlock,
      unlocked,
      due,
      isDue: !card.retired && unlocked && due <= today,
      reviewedToday: cardReviews.some((r) => r.date === today),
      reviews: cardReviews,
    });
  }
  return out;
}

/**
 * Due cards in study order: cards not yet seen today first, then by due date
 * (most overdue first), then lower boxes, then earlier weeks.
 */
export function dueCards(cards, schedule) {
  return cards
    .filter((c) => schedule.get(c.id).isDue)
    .sort((a, b) => {
      const sa = schedule.get(a.id);
      const sb = schedule.get(b.id);
      return (sa.reviewedToday - sb.reviewedToday)
        || sa.due.localeCompare(sb.due)
        || sa.state.box - sb.state.box
        || (a.week ?? 0) - (b.week ?? 0);
    });
}

/**
 * Picks up to `n` due cards for the retrieval check, interleaving weeks:
 * after the most overdue card, it prefers cards from weeks not yet picked.
 */
export function pickInterleaved(due, n) {
  const picked = [];
  const weeks = new Set();
  for (const card of due) {
    if (picked.length >= n) break;
    if (!weeks.has(card.week)) {
      picked.push(card);
      weeks.add(card.week);
    }
  }
  for (const card of due) {
    if (picked.length >= n) break;
    if (!picked.includes(card)) picked.push(card);
  }
  return picked;
}
