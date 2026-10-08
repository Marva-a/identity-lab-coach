// Seed plan, transcribed from the roadmap (Parts 5, 8 and 12).
// This is read-only reference data that lives in code, not in your saved data,
// so fixing a typo here never breaks an export. Your own records (sessions,
// cards, artifacts, people, reviews) live in store.js.
//
// Corrections from the plan review are applied here:
// - Exercise 14 sits in Week 7's Apply block (not Practice).
// - Exercise 10 is Optional in Week 6; exercises 2, 13, 19 and 20 are unscheduled.
// - Week 1 is 11 h: Day 1 is 1 h (Thanksgiving) and Day 4 is a Learn day.
// - Conditional items ("if you attend", "if confirmed") are marked `conditional`,
//   which is different from `optional`.
// - The bridge says "finish and publish Project 2" by Jan 17.

/** @typedef {'learn'|'practice'|'build'|'publish'|'capstone'} BlockType */

/**
 * Plan text version. Bump it when plan text changes. Saved ticks are keyed by item id,
 * and existing ids never change (new items get new ids), so a ticked item stays ticked.
 * If an id ever has to change, list it in PLAN_ID_RENAMES and saved ticks move with it.
 *   2: revised roadmap (zero trust and cloud security foundations; extras as Optional items)
 *   3: one Design item per week (kind 'design', after Evidence); extra time on top of the 12 h
 */
export const PLAN_VERSION = 3;
/** { oldId: newId } for any item whose id changed in a later version. Empty so far. */
export const PLAN_ID_RENAMES = {};
/** Every item id that existed in each earlier plan version. A check proves none were removed. */
export const PLAN_ID_HISTORY = {
  1: [
    'w1-learn-1', 'w1-read-1', 'w1-read-2', 'w1-practice-1', 'w1-build-1',
    'w1-apply-1', 'w1-network-1', 'w1-network-2', 'w1-network-3', 'w1-evidence-1',
    'w2-learn-1', 'w2-read-1', 'w2-read-2', 'w2-read-3', 'w2-practice-1',
    'w2-practice-2', 'w2-practice-3', 'w2-build-1', 'w2-apply-1', 'w2-network-1',
    'w2-evidence-1', 'w3-learn-1', 'w3-read-1', 'w3-read-2', 'w3-read-3',
    'w3-practice-1', 'w3-practice-2', 'w3-build-1', 'w3-apply-1', 'w3-network-1',
    'w3-network-2', 'w3-evidence-1', 'w4-learn-1', 'w4-read-1', 'w4-read-2',
    'w4-practice-1', 'w4-practice-2', 'w4-build-1', 'w4-apply-1', 'w4-network-1',
    'w4-evidence-1', 'w5-learn-1', 'w5-read-1', 'w5-read-2', 'w5-practice-1',
    'w5-build-1', 'w5-apply-1', 'w5-network-1', 'w5-evidence-1', 'w6-learn-1',
    'w6-read-1', 'w6-read-2', 'w6-practice-1', 'w6-practice-2', 'w6-practice-3',
    'w6-build-1', 'w6-apply-1', 'w6-network-1', 'w6-evidence-1', 'w7-learn-1',
    'w7-read-1', 'w7-practice-1', 'w7-practice-2', 'w7-build-1', 'w7-apply-1',
    'w7-network-1', 'w7-evidence-1', 'w8-learn-1', 'w8-read-1', 'w8-read-2',
    'w8-practice-1', 'w8-practice-2', 'w8-build-1', 'w8-apply-1', 'w8-network-1',
    'w8-evidence-1',
  ],
  2: [
    'w1-learn-1', 'w1-read-1', 'w1-read-2', 'w1-read-3', 'w1-practice-1',
    'w1-build-1', 'w1-apply-1', 'w1-network-1', 'w1-network-2', 'w1-network-3',
    'w1-evidence-1', 'w2-learn-1', 'w2-read-1', 'w2-read-2', 'w2-read-3',
    'w2-practice-1', 'w2-practice-2', 'w2-practice-3', 'w2-build-1', 'w2-apply-1',
    'w2-network-1', 'w2-evidence-1', 'w3-learn-1', 'w3-read-1', 'w3-read-2',
    'w3-read-3', 'w3-practice-1', 'w3-practice-2', 'w3-build-1', 'w3-apply-1',
    'w3-network-1', 'w3-network-2', 'w3-evidence-1', 'w3-evidence-2', 'w4-learn-1',
    'w4-read-1', 'w4-read-2', 'w4-read-3', 'w4-practice-1', 'w4-practice-2',
    'w4-build-1', 'w4-apply-1', 'w4-network-1', 'w4-evidence-1', 'w5-learn-1',
    'w5-read-1', 'w5-read-2', 'w5-read-3', 'w5-practice-1', 'w5-practice-2',
    'w5-build-1', 'w5-apply-1', 'w5-network-1', 'w5-evidence-1', 'w5-evidence-2',
    'w6-learn-1', 'w6-learn-2', 'w6-read-1', 'w6-read-2', 'w6-read-3',
    'w6-practice-1', 'w6-practice-2', 'w6-practice-3', 'w6-practice-4', 'w6-build-1',
    'w6-apply-1', 'w6-apply-2', 'w6-network-1', 'w6-evidence-1', 'w6-evidence-2',
    'w7-learn-1', 'w7-read-1', 'w7-practice-1', 'w7-practice-2', 'w7-build-1',
    'w7-learn-2', 'w7-apply-2', 'w7-apply-1', 'w7-network-1', 'w7-evidence-1',
    'w8-learn-1', 'w8-read-1', 'w8-read-2', 'w8-read-3', 'w8-read-4',
    'w8-learn-2', 'w8-practice-1', 'w8-practice-2', 'w8-build-1', 'w8-apply-1',
    'w8-network-1', 'w8-evidence-1',
  ],
};

/** Whether a plan item is Optional, given your own choices (`data.optionalOverrides`). Your choice wins over the plan's. */
export function itemIsOptional(item, overrides) {
  const o = overrides?.[`item:${item.id}`];
  return typeof o?.optional === 'boolean' ? o.optional : Boolean(item.optional);
}

/** Text for the extra time on a Design item, for example "about 3 h, on top of the 12 h". */
export function extraTimeLabel(item) {
  if (!item.extraMinutes) return '';
  const h = item.extraMinutes / 60;
  return `about ${Number.isInteger(h) ? h : h.toFixed(1)} h, on top of the 12 h`;
}

/**
 * Moves saved ticks to renamed item ids. Nothing is ever removed, and a tick already on the
 * new id is kept. With no renames (today) it returns the same ticks.
 */
export function renameChecks(weekChecks, renames = PLAN_ID_RENAMES) {
  const out = { ...weekChecks };
  for (const [oldId, newId] of Object.entries(renames)) {
    if (out[oldId] && !out[newId]) {
      out[newId] = out[oldId];
      delete out[oldId];
    }
  }
  return out;
}

export const PLAN_START = '2026-10-12'; // Day 1, Monday
export const PLAN_END = '2026-12-10'; // Day 60, Thursday
export const BRIDGE_START = '2026-12-11';
export const BRIDGE_REST_START = '2026-12-24';
export const BRIDGE_REST_END = '2027-01-01';
export const BRIDGE_END = '2027-01-17';
export const APPLICATIONS_START = '2027-01-05'; // a Tuesday
export const APPLICATIONS_END = '2027-03-31';
export const PROJECT1_GATE = '2026-11-21'; // Day 41, Saturday
export const FEB_REVIEW_WEEK = '2027-02-15'; // Monday of the review week

export const BLOCK_LABELS = {
  learn: 'Learn and read',
  practice: 'Practice',
  build: 'Build',
  publish: 'Publish and apply',
  capstone: 'Capstone',
  bridge: 'Bridge',
  applications: 'Application system',
};

/** Which week items each block type works on (shown on the Today view). */
export const BLOCK_ITEM_KINDS = {
  learn: ['learn', 'read'],
  practice: ['practice'],
  build: ['build'],
  publish: ['apply', 'evidence', 'design'],
  capstone: [],
};

export const ITEM_KIND_LABELS = {
  learn: 'Learn',
  read: 'Read',
  practice: 'Practice',
  build: 'Build (Project 1)',
  apply: 'Apply',
  network: 'Network (evenings, outside the 12 h)',
  evidence: 'Evidence',
  design: 'Design (on top of the 12 h)',
};

/**
 * PlanWeek: one study week.
 * - number, title, start (Monday)
 * - budget: planned hours per block; the total is the week's budget
 * - items: the checklist (WeekItem: id, kind, text, exercises?, optional?, conditional?, flagship?, extraMinutes?)
 *   `extraMinutes` is time on top of the week's budget (Design items); it is never added to the budget
 * - days: PlanDay seeds, in order (Sundays are not listed; they are rest days)
 * - notes: plan notes shown with the week
 *
 * PlanDay: { day, date, block, focus, hours, holiday? }
 *   `date` is the date printed in the roadmap. The date checks verify that it
 *   matches Day 1 + (day − 1), so a transcription slip shows up as a failure.
 */
export const WEEKS = [
  {
    number: 1,
    title: 'Identity foundations and your lab',
    start: '2026-10-12',
    budget: { learn: 5, practice: 2, build: 2, publish: 2 },
    items: [
      { id: 'w1-learn-1', kind: 'learn', text: 'Authentication vs authorization vs accounting; identity lifecycle (joiner, mover, leaver); credentials, sessions, tokens; threat-model vocabulary' },
      { id: 'w1-read-1', kind: 'read', text: "Professor Messer's SY0-701 access-control and authentication videos only (3 hours maximum)" },
      { id: 'w1-read-2', kind: 'read', text: 'The Threat Modeling Manifesto' },
      { id: 'w1-read-3', kind: 'read', text: 'NIST Cybersecurity Framework 2.0 overview and one Quick Start Guide', optional: true, extraMinutes: 60 },
      { id: 'w1-practice-1', kind: 'practice', text: 'Exercise 1: Keycloak realm, users, groups, roles', exercises: [1] },
      { id: 'w1-build-1', kind: 'build', text: 'A seed script for 50 users and 8 "apps" (groups), with several planted stale accounts' },
      { id: 'w1-apply-1', kind: 'apply', text: 'Read the admin getting-started docs for Tailscale, 1Password and Okta; list what an admin must do on day one' },
      { id: 'w1-network-1', kind: 'network', text: 'Join #owasp-vancouver on MARS Slack' },
      { id: 'w1-network-2', kind: 'network', text: 'Follow 15 practitioners (for example Aaron Parecki, Justin Richer, Pamela Dingle, Dick Hardt, Adam Shostack, Clint Gibler)' },
      { id: 'w1-network-3', kind: 'network', text: 'Operation Defend the North on Oct 15', conditional: 'if you attend' },
      { id: 'w1-evidence-1', kind: 'evidence', text: 'identity-lab README and a one-page "who holds which credential" diagram' },
      { id: 'w1-design-1', kind: 'design', text: 'Enterprise identity mental model', extraMinutes: 120, optional: true },
    ],
    days: [
      { day: 1, date: '2026-10-12', block: 'learn', focus: 'Docker check; start an identity glossary', hours: 1, holiday: 'Thanksgiving: 1 hour' },
      { day: 2, date: '2026-10-13', block: 'learn', focus: 'AuthN, AuthZ, accounting; Messer videos', hours: 2 },
      { day: 3, date: '2026-10-14', block: 'practice', focus: 'Exercise 1: Keycloak realm, users, roles', hours: 2 },
      { day: 4, date: '2026-10-15', block: 'learn', focus: 'Lifecycle and threat-model vocabulary', hours: 2 },
      { day: 5, date: '2026-10-16', block: 'build', focus: 'Project 1: seed script', hours: 2 },
      { day: 6, date: '2026-10-17', block: 'publish', focus: 'README, credential diagram, publish', hours: 2 },
    ],
    notes: [],
  },
  {
    number: 2,
    title: 'OAuth 2.0 and OpenID Connect',
    start: '2026-10-19',
    budget: { learn: 4, practice: 4, build: 2, publish: 2 },
    items: [
      { id: 'w2-learn-1', kind: 'learn', text: 'Grant types, authorization code with PKCE, scopes, refresh tokens, access vs ID tokens, JWT anatomy, token storage' },
      { id: 'w2-read-1', kind: 'read', text: 'oauth.com' },
      { id: 'w2-read-2', kind: 'read', text: 'The summary sections of RFC 9700, the OAuth 2.0 Security Best Current Practice (January 2025)' },
      { id: 'w2-read-3', kind: 'read', text: 'An OpenID Connect overview' },
      { id: 'w2-practice-1', kind: 'practice', text: 'Exercise 4: authorization code flow with PKCE', exercises: [4] },
      { id: 'w2-practice-2', kind: 'practice', text: 'Exercise 5: OIDC login to a sample app', exercises: [5] },
      { id: 'w2-practice-3', kind: 'practice', text: 'Three PortSwigger OAuth labs' },
      { id: 'w2-build-1', kind: 'build', text: '"App A", a mock SaaS app that signs in through Keycloak with OIDC (reuse this week\'s practice app)' },
      { id: 'w2-apply-1', kind: 'apply', text: 'Audit consent screens in three real products: scope wording, comprehension, revocation' },
      { id: 'w2-network-1', kind: 'network', text: 'Two short conversations: "How do you explain OAuth to a non-engineer?"' },
      { id: 'w2-evidence-1', kind: 'evidence', text: 'Annotated PKCE sequence diagram with attacker moves; consent-screen audit' },
      { id: 'w2-design-1', kind: 'design', text: 'Consent screen and scopes', extraMinutes: 120, optional: true },
    ],
    days: [
      { day: 8, date: '2026-10-19', block: 'learn', focus: 'Grant types; auth code and PKCE', hours: 2 },
      { day: 9, date: '2026-10-20', block: 'learn', focus: 'Tokens, JWTs; RFC 9700 summary', hours: 2 },
      { day: 10, date: '2026-10-21', block: 'practice', focus: 'Exercise 4: PKCE flow in dev tools', hours: 2 },
      { day: 11, date: '2026-10-22', block: 'practice', focus: 'Exercise 5 and PortSwigger OAuth labs', hours: 2 },
      { day: 12, date: '2026-10-23', block: 'build', focus: 'Project 1: App A with OIDC login', hours: 2 },
      { day: 13, date: '2026-10-24', block: 'publish', focus: 'Sequence diagram, consent audit, publish', hours: 2 },
    ],
    notes: [],
  },
  {
    number: 3,
    title: 'SAML, SSO, SCIM and authorization models',
    start: '2026-10-26',
    budget: { learn: 4, practice: 4, build: 2, publish: 2 },
    items: [
      { id: 'w3-learn-1', kind: 'learn', text: 'SAML assertions, SP- vs IdP-initiated SSO, SCIM provisioning, RBAC vs ABAC vs relationship-based access' },
      { id: 'w3-read-1', kind: 'read', text: 'Okta or Auth0 SAML docs' },
      { id: 'w3-read-2', kind: 'read', text: 'The overview sections of SCIM RFC 7644' },
      { id: 'w3-read-3', kind: 'read', text: 'Two IDPro Body of Knowledge chapters' },
      { id: 'w3-practice-1', kind: 'practice', text: 'Exercise 6: SAML to a test service provider', exercises: [6] },
      { id: 'w3-practice-2', kind: 'practice', text: 'Exercise 7, light version: one RBAC and one ABAC policy in the Cedar playground', exercises: [7] },
      { id: 'w3-build-1', kind: 'build', text: 'Offboarding, part 1: App A gets a minimal SCIM Users endpoint, and an offboarding script disables the user in Keycloak and deactivates them in App A. If SCIM takes too long, mock it and label it "simulated".' },
      { id: 'w3-apply-1', kind: 'apply', text: 'Compare how WorkOS, Okta and Tailscale document SSO and SCIM setup; list the friction points' },
      { id: 'w3-network-1', kind: 'network', text: 'One Vancouver event' },
      { id: 'w3-network-2', kind: 'network', text: 'Start recruiting 3–5 IT admins for Project 1 usability sessions in weeks 7–8 (Slack, LinkedIn, client and mentoring networks)' },
      { id: 'w3-evidence-1', kind: 'evidence', text: 'SSO and SCIM admin journey map with failure points' },
      { id: 'w3-evidence-2', kind: 'evidence', text: 'Persona-conflict table (employee, IT admin, security admin, CISO, compliance: what each needs from the same sign-in)' },
      { id: 'w3-design-1', kind: 'design', text: 'Admin provisioning flow', extraMinutes: 180, optional: true },
    ],
    days: [
      { day: 15, date: '2026-10-26', block: 'learn', focus: 'SAML flows; SCIM concepts', hours: 2 },
      { day: 16, date: '2026-10-27', block: 'learn', focus: 'Authorization models; IDPro reading', hours: 2 },
      { day: 17, date: '2026-10-28', block: 'practice', focus: 'Exercise 6: SAML SSO', hours: 2 },
      { day: 18, date: '2026-10-29', block: 'practice', focus: 'Exercise 7 (light): Cedar policies', hours: 2 },
      { day: 19, date: '2026-10-30', block: 'build', focus: 'Project 1: SCIM deprovisioning', hours: 2 },
      { day: 20, date: '2026-10-31', block: 'publish', focus: 'Admin journey map, publish', hours: 2 },
    ],
    notes: [],
  },
  {
    number: 4,
    title: 'MFA, passkeys, recovery and accessible authentication',
    start: '2026-11-02',
    budget: { learn: 4, practice: 4, build: 2, publish: 2 },
    items: [
      { id: 'w4-learn-1', kind: 'learn', text: 'Factor types, TOTP, push fatigue, WebAuthn and passkeys (synced vs device-bound), phishing resistance, step-up, account-recovery attacks, and WCAG 2.2 success criterion 3.3.8, Accessible Authentication' },
      { id: 'w4-read-1', kind: 'read', text: 'passkeys.dev' },
      { id: 'w4-read-2', kind: 'read', text: 'The syncable-authenticator and recovery sections of NIST SP 800-63B-4 (final, July 2025)' },
      { id: 'w4-read-3', kind: 'read', text: 'FIDO Alliance passkey design guidelines on Passkey Central', optional: true, extraMinutes: 60 },
      { id: 'w4-practice-1', kind: 'practice', text: 'Exercise 3: TOTP and passkeys in Keycloak', exercises: [3] },
      { id: 'w4-practice-2', kind: 'practice', text: 'Exercise 11: STRIDE model of account recovery', exercises: [11] },
      { id: 'w4-build-1', kind: 'build', text: 'Offboarding, part 2: revoke active sessions through the Keycloak admin API and write every step to an append-only audit log' },
      { id: 'w4-apply-1', kind: 'apply', text: 'Score three real recovery flows on both security and accessibility' },
      { id: 'w4-network-1', kind: 'network', text: 'Publish the recovery threat model and send it to two practitioners for feedback' },
      { id: 'w4-evidence-1', kind: 'evidence', text: 'Recovery threat model v1 (the seed of Project 3)' },
      { id: 'w4-design-1', kind: 'design', text: 'Redesign account recovery', extraMinutes: 180, flagship: true },
    ],
    days: [
      { day: 22, date: '2026-11-02', block: 'learn', focus: 'Factors, passkeys, phishing resistance', hours: 2 },
      { day: 23, date: '2026-11-03', block: 'learn', focus: 'NIST 800-63B-4 sections; WCAG 3.3.8', hours: 2 },
      { day: 24, date: '2026-11-04', block: 'practice', focus: 'Exercise 3: TOTP and passkeys', hours: 2 },
      { day: 25, date: '2026-11-05', block: 'practice', focus: 'Exercise 11: STRIDE model of recovery', hours: 2 },
      { day: 26, date: '2026-11-06', block: 'build', focus: 'Project 1: session revocation and audit log', hours: 2 },
      { day: 27, date: '2026-11-07', block: 'publish', focus: 'Score three recovery flows; publish', hours: 2 },
    ],
    notes: [],
  },
  {
    number: 5,
    title: 'Zero Trust and network security foundations',
    start: '2026-11-09',
    budget: { learn: 4, practice: 4, build: 2, publish: 2 },
    items: [
      { id: 'w5-learn-1', kind: 'learn', text: 'TCP/IP layers, DNS and TLS basics, mutual TLS, firewalls and segmentation, VPN vs zero-trust network access, WireGuard at concept level, NIST SP 800-207, policy decision and enforcement points, device posture, access policy as code' },
      { id: 'w5-read-1', kind: 'read', text: 'Tailscale docs on access-control policies, tags, SSO and device posture' },
      { id: 'w5-read-2', kind: 'read', text: 'A summary of NIST SP 800-207' },
      { id: 'w5-read-3', kind: 'read', text: "Cloudflare's Zero Trust and ZTNA explainers, Google's BeyondCorp paper, and the Professor Messer Network+ videos on segmentation, security rules, Zero Trust and VPNs (selected, about 90 minutes)" },
      { id: 'w5-practice-1', kind: 'practice', text: 'A tailnet with two devices, tag-based access rules, and sign-in through an identity provider' },
      { id: 'w5-practice-2', kind: 'practice', text: 'Exercise 21: capture a DNS lookup and a TLS handshake in Wireshark on your own machine and note what an observer can and cannot see (60–90 minutes)', exercises: [21], optional: true },
      { id: 'w5-build-1', kind: 'build', text: 'Access requests: request, approve, and automatic expiry (API and data model)' },
      { id: 'w5-apply-1', kind: 'apply', text: 'An access-policy design for a fictional 20-person startup, plus five specific, constructive observations on a zero-trust admin experience' },
      { id: 'w5-network-1', kind: 'network', text: 'Ask two networking or zero-trust practitioners which policy mistakes they see most' },
      { id: 'w5-evidence-1', kind: 'evidence', text: 'Policy design document plus the five observations' },
      { id: 'w5-evidence-2', kind: 'evidence', text: 'A one-page trust-boundary diagram showing where identity, device and network checks happen' },
      { id: 'w5-design-1', kind: 'design', text: 'Device posture failure experience', extraMinutes: 120, optional: true },
    ],
    days: [
      { day: 29, date: '2026-11-09', block: 'learn', focus: 'TLS, DNS, VPN vs ZTNA', hours: 2 },
      { day: 30, date: '2026-11-10', block: 'learn', focus: 'NIST 800-207; Tailscale docs', hours: 2 },
      { day: 31, date: '2026-11-11', block: 'practice', focus: 'Tailnet setup and access rules', hours: 2, holiday: 'Remembrance Day' },
      { day: 32, date: '2026-11-12', block: 'practice', focus: 'Identity sign-in, device posture, logs', hours: 2 },
      { day: 33, date: '2026-11-13', block: 'build', focus: 'Project 1: access requests with expiry', hours: 2 },
      { day: 34, date: '2026-11-14', block: 'publish', focus: 'Policy design and observations; publish', hours: 2 },
    ],
    notes: [
      'If your Tailscale process is active, swap this week with week 2 so the networking knowledge arrives before your interviews (Settings → Swap weeks 2 and 5).',
    ],
  },
  {
    number: 6,
    title: 'Cloud security foundations, IAM and secrets',
    start: '2026-11-16',
    budget: { learn: 4, practice: 4, build: 2, publish: 2 },
    items: [
      { id: 'w6-learn-1', kind: 'learn', text: 'AWS IAM users, roles and policies; STS and short-lived credentials; least privilege; Microsoft Entra basics; workload identity; secrets management' },
      { id: 'w6-learn-2', kind: 'learn', text: 'The shared responsibility model; VPCs, subnets and security groups' },
      { id: 'w6-read-1', kind: 'read', text: 'AWS IAM security best practices' },
      { id: 'w6-read-2', kind: 'read', text: 'Three selected modules of the free Microsoft Learn SC-300 path (conditional access, app registrations, identity governance basics), not the whole path' },
      { id: 'w6-read-3', kind: 'read', text: 'The AWS shared responsibility model, VPC and security group documentation', optional: true, extraMinutes: 120 },
      { id: 'w6-practice-1', kind: 'practice', text: 'Exercise 9: AWS role, STS, Access Analyzer (set a budget alert first)', exercises: [9] },
      { id: 'w6-practice-2', kind: 'practice', text: 'Exercise 15: gitleaks', exercises: [15] },
      { id: 'w6-practice-3', kind: 'practice', text: 'Exercise 10: Entra conditional access', exercises: [10], optional: true },
      { id: 'w6-practice-4', kind: 'practice', text: 'Exercise 22: a VPC with one public and one private subnet and a security group that allows only the traffic you intend; turn on flow logs, read them, then delete everything (60–90 minutes)', exercises: [22], optional: true },
      { id: 'w6-build-1', kind: 'build', text: 'A simple UI for request, approve, offboard and audit' },
      { id: 'w6-apply-1', kind: 'apply', text: 'Write half a page on why AI agents need workload identity rather than user credentials (this feeds week 8)' },
      { id: 'w6-apply-2', kind: 'apply', text: "A 30-minute teardown of one security product's access-review or alert screens", optional: true, extraMinutes: 30 },
      { id: 'w6-network-1', kind: 'network', text: 'One ISACA Vancouver or OWASP Vancouver event' },
      { id: 'w6-evidence-1', kind: 'evidence', text: 'A bad-to-good IAM policy pair with an explanation of each change' },
      { id: 'w6-evidence-2', kind: 'evidence', text: 'A segmentation diagram showing subnets, security groups and the roles that cross them' },
      { id: 'w6-design-1', kind: 'design', text: 'Permission management for a non-security admin', extraMinutes: 180, flagship: true },
    ],
    days: [
      { day: 36, date: '2026-11-16', block: 'learn', focus: 'AWS IAM fundamentals; STS', hours: 2 },
      { day: 37, date: '2026-11-17', block: 'learn', focus: 'Entra basics; SC-300 modules', hours: 2 },
      { day: 38, date: '2026-11-18', block: 'practice', focus: 'Exercise 9: role, STS, Access Analyzer', hours: 2 },
      { day: 39, date: '2026-11-19', block: 'practice', focus: 'Exercise 15: secrets and gitleaks', hours: 2 },
      { day: 40, date: '2026-11-20', block: 'build', focus: 'Project 1: UI', hours: 2 },
      { day: 41, date: '2026-11-21', block: 'publish', focus: 'Policy pair; agent-identity note; publish', hours: 2 },
    ],
    notes: [
      'Gate on Sat Nov 21: Project 1 must work end to end, or you freeze its scope.',
    ],
  },
  {
    number: 7,
    title: 'Logging, detection and attack surface',
    start: '2026-11-23',
    budget: { learn: 4, practice: 4, build: 2, publish: 2 },
    items: [
      { id: 'w7-learn-1', kind: 'learn', text: 'Which identity events matter; identity threat detection concepts; MITRE ATT&CK credential-access techniques; OWASP Top 10 and API Security Top 10; the incident-response lifecycle (NIST SP 800-61)' },
      { id: 'w7-read-1', kind: 'read', text: 'The OWASP Top 10 and API Top 10 pages' },
      { id: 'w7-practice-1', kind: 'practice', text: 'Exercise 8: four PortSwigger access-control labs', exercises: [8] },
      { id: 'w7-practice-2', kind: 'practice', text: 'Exercise 12: Keycloak events and jq', exercises: [12] },
      { id: 'w7-build-1', kind: 'build', text: 'Threat-model your own Project 1 and fix the two most serious findings' },
      { id: 'w7-learn-2', kind: 'learn', text: 'Compliance vocabulary (SOC 2, ISO 27001, PIPEDA, GDPR) as control, evidence, audit' },
      { id: 'w7-apply-2', kind: 'apply', text: "A 30-minute teardown of one product's audit-log or alert screens", optional: true, extraMinutes: 30 },
      { id: 'w7-apply-1', kind: 'apply', text: 'Exercise 14: a short tabletop for "stolen refresh token": signals, response steps, and how the admin is told', exercises: [14] },
      { id: 'w7-network-1', kind: 'network', text: 'Run the first one or two Project 1 usability sessions with IT admins (they count as conversations)' },
      { id: 'w7-evidence-1', kind: 'evidence', text: 'Project 1 threat model and the tabletop' },
      { id: 'w7-design-1', kind: 'design', text: 'Account-takeover investigation console', extraMinutes: 120, optional: true },
    ],
    days: [
      { day: 43, date: '2026-11-23', block: 'learn', focus: 'Identity events; ATT&CK credential access', hours: 2 },
      { day: 44, date: '2026-11-24', block: 'learn', focus: 'OWASP Top 10 and API Top 10', hours: 2 },
      { day: 45, date: '2026-11-25', block: 'practice', focus: 'Exercise 8: PortSwigger access-control labs', hours: 2 },
      { day: 46, date: '2026-11-26', block: 'practice', focus: 'Exercise 12: Keycloak events', hours: 2 },
      { day: 47, date: '2026-11-27', block: 'build', focus: 'Project 1: threat model and fixes', hours: 2 },
      { day: 48, date: '2026-11-28', block: 'publish', focus: 'Tabletop; publish', hours: 2 },
    ],
    notes: [],
  },
  {
    number: 8,
    title: 'AI and agent security',
    start: '2026-11-30',
    budget: { learn: 4, practice: 4, build: 2, publish: 2 },
    items: [
      { id: 'w8-learn-1', kind: 'learn', text: 'LLM risks (prompt injection, sensitive data disclosure, excessive agency); agentic risks; MCP architecture and its OAuth 2.1 authorization model; delegation and token exchange; human approval patterns' },
      { id: 'w8-read-1', kind: 'read', text: 'Skim the OWASP Top 10 for LLM Applications (2026) and the Top 10 for Agentic Applications, then read three entries closely: goal hijack, tool misuse, identity and privilege abuse' },
      { id: 'w8-read-2', kind: 'read', text: 'The authorization section of the MCP specification' },
      { id: 'w8-read-3', kind: 'read', text: 'NIST AI Risk Management Framework overview', optional: true, extraMinutes: 45 },
      { id: 'w8-read-4', kind: 'read', text: "Microsoft's Entra Agent ID documentation", optional: true, extraMinutes: 60 },
      { id: 'w8-learn-2', kind: 'learn', text: 'Applying zero trust to agents (each agent a workload identity, each tool call a policy decision)' },
      { id: 'w8-practice-1', kind: 'practice', text: 'Exercise 16: prompt-injection tests against a small local app', exercises: [16] },
      { id: 'w8-practice-2', kind: 'practice', text: 'Exercise 17: agent permission model', exercises: [17] },
      { id: 'w8-build-1', kind: 'build', text: 'Apply the usability findings; finish the remaining sessions' },
      { id: 'w8-apply-1', kind: 'apply', text: "Read Okta's agentic-security and SailPoint's non-human-identity postings line by line; mark what you can and cannot yet explain" },
      { id: 'w8-network-1', kind: 'network', text: 'Post a short analysis in the OWASP GenAI community or on LinkedIn: one agentic risk and the identity controls that reduce it' },
      { id: 'w8-evidence-1', kind: 'evidence', text: 'Agent permission model and the injection test log' },
      { id: 'w8-design-1', kind: 'design', text: 'Agent authorization case-study outline', extraMinutes: 180, flagship: true },
    ],
    days: [
      { day: 50, date: '2026-11-30', block: 'learn', focus: 'OWASP LLM and Agentic lists', hours: 2 },
      { day: 51, date: '2026-12-01', block: 'learn', focus: 'MCP architecture and authorization', hours: 2 },
      { day: 52, date: '2026-12-02', block: 'practice', focus: 'Exercise 16: prompt-injection tests', hours: 2 },
      { day: 53, date: '2026-12-03', block: 'practice', focus: 'Exercise 17: agent permission model', hours: 2 },
      { day: 54, date: '2026-12-04', block: 'build', focus: 'Project 1: usability fixes', hours: 2 },
      { day: 55, date: '2026-12-05', block: 'publish', focus: 'Posting gap analysis; publish', hours: 2 },
    ],
    notes: [
      "Moved to the bridge: exercise 18 (MCP broker), NIST's agent identity concept paper, MITRE ATLAS.",
    ],
  },
  {
    number: 9,
    title: 'Capstone',
    start: '2026-12-07',
    budget: { capstone: 8 },
    items: [],
    days: [
      { day: 57, date: '2026-12-07', block: 'capstone', focus: 'Project 1 README, diagrams, implemented/simulated/conceptual table', hours: 2 },
      { day: 58, date: '2026-12-08', block: 'capstone', focus: 'Demo recording; case-study draft', hours: 2 },
      { day: 59, date: '2026-12-09', block: 'capstone', focus: 'LinkedIn, GitHub and resume refresh (Part 11)', hours: 2 },
      { day: 60, date: '2026-12-10', block: 'capstone', focus: 'Retrospective and scorecard review; two outreach messages with your case study', hours: 2, conditional: 'VanCitySec, if confirmed' },
    ],
    notes: [],
  },
];

/**
 * Exercise: the 20 hands-on exercises from Part 8.
 * schedule: 'week' (with `week`), 'optional' (with `week`), 'bridge' or 'unscheduled'.
 * Exercise 14 is scheduled in Week 7's Apply block, not Practice.
 */
export const EXERCISES = [
  { n: 1, title: 'Stand up an IdP: realm, users, groups, roles', tool: 'Keycloak in Docker', learn: 'What an admin actually configures; identity lifecycle', hours: 3, artifact: 'Setup README plus screenshots', schedule: 'week', week: 1 },
  { n: 2, title: 'Password authentication done right', tool: 'Keycloak password policy and hashing docs', learn: 'Credential storage, lockout, enumeration risks', hours: 2, artifact: 'One-page "password flow risks" note', schedule: 'unscheduled' },
  { n: 3, title: 'Add TOTP and WebAuthn passkeys', tool: 'Keycloak', learn: 'Factor types, enrolment UX, recovery gaps', hours: 3, artifact: 'Enrolment flow screenshots plus failure notes', schedule: 'week', week: 4 },
  { n: 4, title: 'Authorization code flow with PKCE', tool: 'Small app plus Keycloak, browser dev tools', learn: 'Tokens, redirects, what an interceptor sees', hours: 4, artifact: 'Annotated sequence diagram', schedule: 'week', week: 2 },
  { n: 5, title: 'OIDC login to a sample app', tool: 'Keycloak, OIDC library', learn: 'ID token claims, userinfo, session', hours: 3, artifact: 'Claims table with security notes', schedule: 'week', week: 2 },
  { n: 6, title: 'SAML SSO to a test service provider', tool: 'Keycloak plus a SAML test SP', learn: 'Assertions, metadata, attributes', hours: 3, artifact: 'Admin journey map with failure points', schedule: 'week', week: 3 },
  { n: 7, title: 'RBAC, then ABAC, then relationship-based access', tool: 'Keycloak roles; Cedar playground or SpiceDB', learn: 'Where role models break; policy-as-code', hours: 4, artifact: 'Comparison table with one worked example each', schedule: 'week', week: 3, note: 'Light version in week 3' },
  { n: 8, title: 'API authorization failures (BOLA, broken function-level authorization)', tool: 'PortSwigger API and access-control labs; OWASP crAPI', learn: 'The most common real-world access failures', hours: 4, artifact: 'Two lab write-ups', schedule: 'week', week: 7 },
  { n: 9, title: 'Least-privilege cloud IAM', tool: 'AWS free tier, IAM Access Analyzer', learn: 'Roles, STS, permission boundaries', hours: 4, artifact: 'Bad-to-good policy pair', schedule: 'week', week: 6 },
  { n: 10, title: 'Conditional access policy', tool: 'Free Entra tenant', learn: 'Risk-based access and its user impact', hours: 2, artifact: 'Policy design note with UX friction points', schedule: 'optional', week: 6 },
  { n: 11, title: 'Threat model account recovery', tool: 'OWASP Threat Dragon or a STRIDE table', learn: 'Systematic threat identification', hours: 4, artifact: 'Threat model v1 (Project 3 seed)', schedule: 'week', week: 4 },
  { n: 12, title: 'Logging and detection basics', tool: 'Keycloak event logs, jq, a few Sigma-style rules written by hand', learn: 'Which events signal compromise', hours: 3, artifact: 'Event catalogue with three detection ideas', schedule: 'week', week: 7 },
  { n: 13, title: 'Vulnerability analysis', tool: 'OWASP Juice Shop plus Trivy scan of a sample container', learn: 'Triage, severity, false positives', hours: 3, artifact: 'Triage write-up on three findings', schedule: 'unscheduled' },
  { n: 14, title: 'Incident response tabletop: stolen refresh token', tool: 'NIST SP 800-61 structure', learn: 'Roles, evidence, containment, communications', hours: 3, artifact: 'Tabletop document', schedule: 'week', week: 7, note: "Week 7's Apply block" },
  { n: 15, title: 'Secrets management', tool: 'gitleaks; a secrets manager in dev mode', learn: 'Leak detection, rotation, short-lived credentials', hours: 3, artifact: 'Before-and-after repo scan', schedule: 'week', week: 6 },
  { n: 16, title: 'Prompt injection against a small LLM app', tool: 'Local model, Garak or manual tests', learn: 'Direct and indirect injection; why filtering is not enough', hours: 4, artifact: 'Test log with a pass/fail table', schedule: 'week', week: 8 },
  { n: 17, title: 'Agent permission model', tool: 'Whiteboard plus the OWASP Agentic Top 10', learn: 'Scoping tools, identity, and approval for agents', hours: 3, artifact: 'One-page permission model', schedule: 'week', week: 8 },
  { n: 18, title: 'MCP server with policy-gated tools', tool: 'MCP SDK, a policy layer (Cedar or OPA)', learn: 'OAuth-protected tool access, approvals, audit trails', hours: 8, artifact: 'Working prototype with README', schedule: 'bridge', note: 'The core of Project 2' },
  { n: 19, title: 'Data leakage test for a retrieval-augmented app', tool: 'Local RAG demo with seeded confidential documents', learn: 'How untrusted content crosses permission boundaries', hours: 4, artifact: 'Leakage test results', schedule: 'unscheduled' },
  { n: 20, title: "Security review of a real product's admin UX", tool: 'Public docs and free tiers (Tailscale, 1Password, Okta developer)', learn: 'Spotting trust and risk-communication problems', hours: 3, artifact: 'Three-page critique with annotated screens', schedule: 'unscheduled' },
  { n: 21, title: 'Capture a DNS lookup and a TLS handshake', tool: 'Wireshark, on your own machine', learn: 'What an observer can and cannot see', hours: 1.5, artifact: 'Notes on what an observer can and cannot see', schedule: 'optional', week: 5, note: 'Extra. 60–90 minutes.' },
  { n: 22, title: 'A VPC with one public and one private subnet, and a tight security group', tool: 'AWS: VPC, security group, flow logs', learn: 'Segmentation; reading flow logs', hours: 1.5, artifact: '', schedule: 'optional', week: 6, note: 'Extra. 60–90 minutes. Turn on flow logs, read them, then delete everything. The revised roadmap names no artifact.' },
];

/** Bridge period (Dec 11 – Jan 17). Sundays are rest days here too. */
export const BRIDGE_PHASES = [
  {
    start: '2026-12-11',
    end: '2026-12-23',
    rest: false,
    title: 'Project 2 MVP (exercise 18)',
    focus: 'The broker with two tools, one approval flow and eight injection scenarios. About 16 hours across these two weeks.',
  },
  {
    start: '2026-12-24',
    end: '2027-01-01',
    rest: true,
    title: 'Rest',
    focus: 'Optional reading only.',
  },
  {
    start: '2027-01-02',
    end: '2027-01-17',
    rest: false,
    title: 'Finish and publish Project 2',
    focus: 'Finish and publish Project 2 by Jan 17; finalize the tracker and target list. The full application system starts Tue Jan 5.',
  },
];

/** Part 12 weekly system, from Jan 5 (keyed by weekday, 1 = Monday). */
export const APPLICATION_WEEK = {
  1: { focus: 'Radar (1 h): scan alerts, score postings, pick 4–6. Learning (1 h).', output: 'Shortlist in the tracker' },
  2: { focus: 'Tailor and submit 2–3 applications', output: 'Resume and note per role' },
  3: { focus: 'Outreach (1 h): 3 messages to practitioners, hiring managers or recruiters. Project work (1 h).', output: '3 messages sent' },
  4: { focus: 'Tailor and submit 2–3 applications; send referral asks', output: '1–2 referral asks' },
  5: { focus: 'Interview preparation, plus a 20-minute weekly review of the scorecard', output: 'Updated tracker and prep notes' },
  6: { focus: 'Project or learning (Project 2 finish in January, Project 3 light version by Jan 31)', output: 'One improvement published' },
};

/** Part 12 interview-preparation timeline (shown alongside the weekly system). */
export const INTERVIEW_PREP = [
  { start: '2027-01-05', end: '2027-01-11', text: 'Write 8 STAR stories; polish the Project 1 and Project 2 case-study walk-throughs.' },
  { start: '2027-01-12', end: '2027-01-25', text: 'Practise concept explanations aloud, recorded; run two mock interviews with practitioners from your network.' },
  { start: '2027-01-26', end: '2027-03-31', text: 'One mock per week; update stories from real interview feedback.' },
];

/**
 * ScorecardTargets (used by the Stage 5 dashboard). Ranges keep both ends;
 * pacing uses the low end, as agreed in the plan review.
 */
export const SCORECARD_TARGETS = [
  { by: '2026-12-10', hours: 100, artifacts: 9, conversations: 15, applications: [3, 6], referralAsks: [2, 3] },
  { by: '2027-01-31', artifacts: 12, conversations: 25, applications: [20, 30], referralAsks: [10, 10] },
];
