// Spaced repetition: Leitner boxes.
//
// A card first comes up the day after the plan day that teaches it (cardUnlockDate below).
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
import { addDays, daysBetween } from './dates.js';
import { getWeek, contentWeekNumber } from './plan.js';
import { SEED_CARDS, SEED_TEACH_DAYS } from './cards-data.js';

const SEED_WEEK = new Map(SEED_CARDS.map((c) => [c.seedId, c.week]));

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
 * The plan day that teaches a card's topic, or null. Only seed cards have one, and only while their week is
 * the one they came with (if you move a card to another week yourself, your week wins).
 */
export function teachDay(card) {
  const day = card.seedId ? SEED_TEACH_DAYS[card.seedId] : undefined;
  return day && card.week === SEED_WEEK.get(card.seedId) ? day : null;
}

/**
 * The date a card first comes up. A card with a teaching day comes up the day AFTER the calendar date that
 * shows that day's content (so the Week 2/5 swap still moves it with its content): recall is only asked for
 * once the plan has taught it, and the first try comes after a night's gap. Other cards: their week's Monday.
 */
export function cardUnlockDate(card, settings) {
  const day = teachDay(card);
  if (!day) return unlockDate(card.week, settings);
  const calendarWeek = contentWeekNumber(Math.ceil(day / 7), settings); // the swap is its own inverse
  return addDays(getWeek(calendarWeek).start, ((day - 1) % 7) + 1);
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
    const unlock = cardUnlockDate(card, settings);
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

// ─── What you can recall (Progress) ──────────────────────────────────────────
// Evidence of learning, not of time spent: worked out only from your ratings. "Held" needs a successful
// recall after a gap of at least HELD_GAP_DAYS since the card's previous review, which is the best sign
// this app has that something is in long-term memory. A high box alone is not enough (two "Easy" ratings
// in four days reach box 4).
export const HELD_GAP_DAYS = 7;
export const RECALL_STATES = ['new', 'shaky', 'recent', 'held'];

/** Where one card stands, from its reviews: 'new' | 'shaky' | 'recent' | 'held'. */
export function recallState(reviews) {
  if (!reviews.length) return 'new';
  const sorted = [...reviews].sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt));
  const last = sorted[sorted.length - 1];
  if (last.rating === 'again' || last.rating === 'hard') return 'shaky';
  const heldOnce = sorted.some((r, i) => i > 0 && (r.rating === 'good' || r.rating === 'easy')
    && daysBetween(sorted[i - 1].date, r.date) >= HELD_GAP_DAYS);
  return heldOnce ? 'held' : 'recent';
}

/**
 * Recall by week for the cards you have met (unlocked, not retired), and the cards that need another look
 * (last rating Again or Hard), most recent first. Weeks with no unlocked card are left out.
 */
export function recallSummary(cards, reviews, today, settings) {
  const sched = scheduleAll(cards, reviews, today, settings);
  const weeks = new Map();
  const shaky = [];
  for (const card of cards) {
    const s = sched.get(card.id);
    if (card.retired || !s.unlocked) continue;
    const state = recallState(s.reviews);
    const w = card.week ?? 0;
    if (!weeks.has(w)) weeks.set(w, { week: card.week ?? null, total: 0, new: 0, shaky: 0, recent: 0, held: 0 });
    const row = weeks.get(w);
    row.total += 1;
    row[state] += 1;
    if (state === 'shaky') {
      const last = [...s.reviews].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt))[0];
      shaky.push({ card, last, due: s.due });
    }
  }
  shaky.sort((a, b) => b.last.date.localeCompare(a.last.date) || b.last.createdAt.localeCompare(a.last.createdAt));
  const rows = [...weeks.values()].sort((a, b) => (a.week ?? 99) - (b.week ?? 99));
  const sum = (k) => rows.reduce((n, r) => n + r[k], 0);
  return {
    rows, shaky,
    totals: { total: sum('total'), new: sum('new'), shaky: sum('shaky'), recent: sum('recent'), held: sum('held') },
    anyTest: reviews.some((r) => r.testMode),
  };
}
