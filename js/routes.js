// Where each address (#hash) goes. Pure functions, so the checks can run them in Node.
//
// Five main places plus Settings. Learn and Proof have sections in them, written as #learn/cards.
// The old addresses still work: they are redirected to where that screen lives now.

export const ROUTES = ['today', 'plan', 'learn', 'proof', 'progress', 'settings'];

/** The sections inside a place, first one is the default. */
export const SECTIONS = {
  learn: ['library', 'cards'],
  proof: ['evidence', 'people', 'applications'],
};

/** The first screens of the app and the new place of each. */
export const LEGACY_HASHES = {
  home: '#plan',
  week: '#plan',
  library: '#learn/library',
  cards: '#learn/cards',
  evidence: '#proof/evidence',
  people: '#proof/people',
  scorecard: '#progress',
};

/**
 * Works out the place and section for an address.
 * Returns { route, section, redirect } where `redirect` is the new address when the one given is an old one.
 * An address nobody knows goes to Today without a redirect.
 */
export function resolveHash(hash) {
  const raw = String(hash ?? '').replace(/^#\/?/, '');
  const [first, second] = raw.split('/');
  if (Object.hasOwn(LEGACY_HASHES, first)) {
    const redirect = LEGACY_HASHES[first];
    return { ...resolveHash(redirect), redirect };
  }
  // A lesson page, #lesson/3 (the roadmap day). It is a page of its own, not one of the main places.
  if (first === 'lesson') {
    const day = Number(second);
    return Number.isInteger(day) && day >= 1 && day <= 60 ? { route: 'lesson', section: String(day), redirect: null } : { route: 'plan', section: null, redirect: null };
  }
  if (!ROUTES.includes(first)) return { route: 'today', section: null, redirect: null };
  const sections = SECTIONS[first];
  if (!sections) return { route: first, section: null, redirect: null };
  return { route: first, section: sections.includes(second) ? second : sections[0], redirect: null };
}
