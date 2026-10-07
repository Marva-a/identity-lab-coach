// Seed flashcards (45), written by Claude from the roadmap's topics.
// Every seed card starts UNVERIFIED. Only you can mark one verified, after
// checking it against the named reference. Facts I was not confident about
// were left out rather than guessed (for example exact item numbers in the
// OWASP Top 10 for Agentic Applications, MCP revision dates and the NIST
// agent-identity paper).
//
// SeedCard: { seedId, week, type: 'recall'|'explain', topic, front, back, reference }
// `seedId` lets the app add new seed cards later without duplicating old ones.

export const CARD_SEED_VERSION = 1;

export const SEED_CARDS = [
  // ─── Week 1: identity foundations ─────────────────────────────────────────
  {
    seedId: 'w1-aaa', week: 1, type: 'recall', topic: 'Authentication vs authorization vs accounting',
    front: 'What is the difference between authentication, authorization and accounting?',
    back: 'Authentication verifies who or what is making a request. Authorization decides what that verified identity is allowed to do. Accounting (auditing) records what it actually did, so actions can be traced later.',
    reference: 'NIST CSRC Glossary: "authentication" and "authorization"',
  },
  {
    seedId: 'w1-jml', week: 1, type: 'explain', topic: 'Identity lifecycle',
    front: 'Explain the joiner–mover–leaver lifecycle and why movers are a risk.',
    back: 'Joiners get accounts and access when they start. Movers change roles and should gain the access the new role needs and lose access that no longer fits. Leavers must lose all access promptly. Movers are risky because old access is often not removed, so permissions pile up over time (privilege creep).',
    reference: 'IDPro Body of Knowledge: identity lifecycle chapters',
  },
  {
    seedId: 'w1-credential-session-token', week: 1, type: 'recall', topic: 'Credentials, sessions and tokens',
    front: 'What is the difference between a credential, a session and a token?',
    back: 'A credential is what you present to prove your identity (a password, passkey or certificate). A session is the record that you have already authenticated, usually tracked with a cookie, so you don\'t sign in on every request. A token is a piece of data issued to a client that carries or points to identity or authorization information, such as an OAuth access token.',
    reference: 'NIST SP 800-63B-4 (authenticators, session management); RFC 6749 section 1.4 (access tokens)',
  },
  {
    seedId: 'w1-four-questions', week: 1, type: 'recall', topic: 'Threat-model vocabulary',
    front: 'What are the four key questions of threat modelling?',
    back: 'What are we working on? What can go wrong? What are we going to do about it? Did we do a good enough job?',
    reference: 'Threat Modeling Manifesto (threatmodelingmanifesto.org)',
  },
  {
    seedId: 'w1-stride', week: 1, type: 'recall', topic: 'Threat-model vocabulary',
    front: 'What does STRIDE stand for?',
    back: 'Spoofing, Tampering, Repudiation, Information disclosure, Denial of service, Elevation of privilege.',
    reference: 'Microsoft Learn: Threat Modeling Tool threats (STRIDE)',
  },
  {
    seedId: 'w1-threat-vuln-risk', week: 1, type: 'recall', topic: 'Threat-model vocabulary',
    front: 'Threat, vulnerability, risk: what is the difference?',
    back: 'A threat is something that could cause harm, such as an attacker or an event. A vulnerability is a weakness a threat could exploit. Risk combines how likely the harm is with how bad its impact would be.',
    reference: 'NIST CSRC Glossary: "threat", "vulnerability" and "risk"',
  },

  // ─── Week 2: OAuth 2.0 and OpenID Connect ─────────────────────────────────
  {
    seedId: 'w2-oauth-roles', week: 2, type: 'recall', topic: 'OAuth 2.0 roles and grants',
    front: 'Name the four roles in OAuth 2.0.',
    back: 'Resource owner (usually the user), client (the app asking for access), authorization server (issues tokens) and resource server (the API that accepts tokens).',
    reference: 'RFC 6749, section 1.1 (Roles)',
  },
  {
    seedId: 'w2-grants', week: 2, type: 'recall', topic: 'OAuth 2.0 roles and grants',
    front: 'Which OAuth grants does current best practice recommend, and which should you avoid?',
    back: 'Use the authorization code grant with PKCE when a user is involved, and the client credentials grant for machine-to-machine access. Avoid the implicit grant and the resource owner password credentials grant.',
    reference: 'RFC 9700, OAuth 2.0 Security Best Current Practice (January 2025)',
  },
  {
    seedId: 'w2-pkce-flow', week: 2, type: 'explain', topic: 'Authorization code with PKCE',
    front: 'Walk through the authorization code flow with PKCE.',
    back: 'The client creates a random code verifier and sends its hash (the code challenge) with the authorization request. The user authenticates and consents at the authorization server, which redirects back to the registered redirect URI with a short-lived authorization code. The client exchanges the code plus the original code verifier for tokens. The server checks that the verifier matches the challenge, so someone who intercepts only the code cannot redeem it.',
    reference: 'RFC 7636 (PKCE); RFC 9700 (recommends PKCE for all clients)',
  },
  {
    seedId: 'w2-pkce-attack', week: 2, type: 'recall', topic: 'Authorization code with PKCE',
    front: 'What attack does PKCE prevent?',
    back: 'Authorization code interception: an attacker who steals the authorization code cannot exchange it for tokens without the code verifier, which never left the legitimate client.',
    reference: 'RFC 7636, section 1 (Introduction)',
  },
  {
    seedId: 'w2-token-types', week: 2, type: 'explain', topic: 'Access vs ID vs refresh tokens',
    front: 'Explain the difference between an access token, an ID token and a refresh token.',
    back: 'An access token lets a client call an API; the API (resource server) checks it. An ID token comes from OpenID Connect and tells the client who signed in and how; it is not meant for calling APIs. A refresh token lets the client get new access tokens without the user signing in again, so it lives longer and must be stored and protected carefully.',
    reference: 'RFC 6749 sections 1.4–1.5; OpenID Connect Core 1.0, section 2 (ID Token)',
  },
  {
    seedId: 'w2-jwt', week: 2, type: 'recall', topic: 'JWT structure',
    front: 'What are the three parts of a signed JWT, and is its payload secret?',
    back: 'Header, payload (the claims) and signature, each base64url-encoded and joined with dots. The payload is encoded, not encrypted, so anyone holding the token can read it. The signature only proves it has not been changed.',
    reference: 'RFC 7519 (JWT); RFC 7515 (JWS)',
  },
  {
    seedId: 'w2-token-storage', week: 2, type: 'explain', topic: 'Token storage',
    front: 'Why is storing tokens in localStorage risky for a browser app, and what are the common mitigations?',
    back: 'Any script running on the page can read localStorage, so a cross-site scripting bug can steal the tokens. Common mitigations: keep tokens out of browser JavaScript entirely with a backend-for-frontend that holds them server-side and uses secure, HttpOnly cookies; keep access tokens short-lived; and rotate refresh tokens.',
    reference: 'IETF draft "OAuth 2.0 for Browser-Based Applications"; RFC 9700 (refresh token protection)',
  },

  // ─── Week 3: SAML, SSO, SCIM and authorization models ─────────────────────
  {
    seedId: 'w3-saml-assertion', week: 3, type: 'recall', topic: 'SAML',
    front: 'What is a SAML assertion?',
    back: 'An XML document, signed by the identity provider, that makes statements about a user: that they authenticated, their attributes and sometimes authorization decisions. The service provider checks the signature and the conditions (such as the intended audience and the valid time window) before trusting it.',
    reference: 'OASIS SAML 2.0 Core specification',
  },
  {
    seedId: 'w3-sp-idp', week: 3, type: 'explain', topic: 'SP- vs IdP-initiated SSO',
    front: 'Explain SP-initiated vs IdP-initiated SSO, and why IdP-initiated is riskier.',
    back: 'SP-initiated: the user starts at the app (service provider), which sends them to the identity provider with an authentication request and receives an assertion in response. IdP-initiated: the user starts at the identity provider\'s portal, which sends the app an assertion it never asked for. Because the app cannot match the response to a request it made, injected or replayed assertions are harder to detect.',
    reference: 'OASIS SAML 2.0 Profiles (Web Browser SSO Profile)',
  },
  {
    seedId: 'w3-scim', week: 3, type: 'recall', topic: 'SCIM',
    front: 'What is SCIM, and which two resources does its core schema define?',
    back: 'System for Cross-domain Identity Management: a standard REST API and schema for provisioning identities from an identity provider into applications. The core resources are Users and Groups.',
    reference: 'RFC 7643 (SCIM core schema); RFC 7644 (SCIM protocol)',
  },
  {
    seedId: 'w3-scim-deprovision', week: 3, type: 'recall', topic: 'SCIM',
    front: 'How does SCIM usually deprovision a leaver?',
    back: 'The identity provider either sets the User\'s "active" attribute to false (deactivation) or deletes the User resource. Many apps prefer deactivation because it keeps data and audit history.',
    reference: 'RFC 7643 section 4.1.1 ("active"); RFC 7644 (PATCH and DELETE)',
  },
  {
    seedId: 'w3-rbac-abac-rebac', week: 3, type: 'explain', topic: 'RBAC vs ABAC vs relationship-based access',
    front: 'Explain RBAC, ABAC and relationship-based access control, with an example of each.',
    back: 'RBAC grants permissions through roles: an "Editor" can edit documents. ABAC evaluates attributes of the user, resource, action and context: edit if your department matches the document\'s department. Relationship-based access (ReBAC) decides from relationships between people and objects: you can edit a document because you belong to the team that owns its folder. Google\'s Zanzibar system is the well-known example.',
    reference: 'NIST SP 800-162 (ABAC); "Zanzibar: Google\'s Consistent, Global Authorization System" (USENIX ATC 2019)',
  },
  {
    seedId: 'w3-role-explosion', week: 3, type: 'recall', topic: 'RBAC vs ABAC vs relationship-based access',
    front: 'Where does RBAC typically break down?',
    back: 'Role explosion: when access depends on context, such as which customer, region or project, you need more and more roles. They become hard to understand and review.',
    reference: 'NIST SP 800-162 (ABAC guide, background on RBAC limits)',
  },

  // ─── Week 4: MFA, passkeys, recovery, accessible authentication ───────────
  {
    seedId: 'w4-factors', week: 4, type: 'recall', topic: 'MFA factor types',
    front: 'What are the three authentication factor types?',
    back: 'Something you know (a password or PIN), something you have (a phone, security key or device) and something you are (a biometric).',
    reference: 'NIST SP 800-63B-4 (authentication factors)',
  },
  {
    seedId: 'w4-synced-device-bound', week: 4, type: 'recall', topic: 'Passkeys and WebAuthn',
    front: 'What is the difference between a synced passkey and a device-bound passkey?',
    back: 'A synced passkey\'s private key is backed up and synced across your devices by a passkey provider, so losing one device doesn\'t lose it. A device-bound passkey\'s private key never leaves one authenticator, such as a security key. That gives stronger assurance, but you need a recovery plan if the device is lost.',
    reference: 'passkeys.dev; NIST SP 800-63B-4 (syncable authenticators)',
  },
  {
    seedId: 'w4-phishing-resistance', week: 4, type: 'explain', topic: 'Phishing resistance',
    front: 'Why are passkeys phishing-resistant, and where can accounts that use them still be taken over?',
    back: 'A passkey is bound to the site\'s domain (its relying-party ID). The browser only uses it on that domain, and the private key never leaves the authenticator or passkey provider, so a lookalike site cannot get a usable response and there is no secret to type into a fake page. Accounts can still be taken over at the edges: account recovery, fallback to weaker factors, and help-desk resets.',
    reference: 'W3C Web Authentication (WebAuthn) specification; passkeys.dev',
  },
  {
    seedId: 'w4-mfa-fatigue', week: 4, type: 'recall', topic: 'MFA factor types',
    front: 'What is MFA fatigue (push bombing), and name two mitigations.',
    back: 'An attacker who has the password sends repeated push prompts until the user approves one. Mitigations: number matching (the user enters a number shown on the sign-in screen), limiting how many prompts can be sent, showing context such as location, or moving to phishing-resistant methods like passkeys.',
    reference: 'CISA fact sheet: "Implementing Number Matching in MFA Applications"',
  },
  {
    seedId: 'w4-recovery', week: 4, type: 'explain', topic: 'Account-recovery risks',
    front: 'Why is account recovery often the weakest part of authentication?',
    back: 'Recovery bypasses the normal sign-in, and it is often protected by something weaker: email links, SMS codes, security questions or a help-desk call that can be socially engineered. A strong passkey doesn\'t help if an attacker can recover the account through a weaker path. Recovery should be about as strong as sign-in, notify the user, and add delays or extra checks for high-risk accounts.',
    reference: 'NIST SP 800-63B-4 (account recovery)',
  },
  {
    seedId: 'w4-wcag-338', week: 4, type: 'recall', topic: 'WCAG 2.2 criterion 3.3.8',
    front: 'What does WCAG 2.2 success criterion 3.3.8, Accessible Authentication (Minimum), require?',
    back: 'No step in an authentication process may rely on a cognitive function test, such as remembering a password or transcribing a code, unless there is an alternative method, a mechanism that helps (such as allowing paste and password managers), or the test is recognizing objects or the user\'s own content. It is level AA.',
    reference: 'W3C "Understanding Success Criterion 3.3.8: Accessible Authentication (Minimum)"',
  },

  // ─── Week 5: zero trust ───────────────────────────────────────────────────
  {
    seedId: 'w5-zero-trust', week: 5, type: 'recall', topic: 'Zero trust (NIST SP 800-207)',
    front: 'What is the core idea of zero trust in NIST SP 800-207?',
    back: 'No implicit trust based on network location. Each request to a resource is authenticated and authorized per session, using policy that considers identity, device state and other signals, and access is granted with least privilege.',
    reference: 'NIST SP 800-207, Zero Trust Architecture (sections 2.1 and 3)',
  },
  {
    seedId: 'w5-components', week: 5, type: 'recall', topic: 'Zero trust (NIST SP 800-207)',
    front: 'Name the three logical components at the core of NIST\'s zero-trust architecture.',
    back: 'The policy engine (decides), the policy administrator (carries out the decision by setting up or closing the connection) and the policy enforcement point (allows or blocks the connection to the resource).',
    reference: 'NIST SP 800-207, section 3 (logical components)',
  },
  {
    seedId: 'w5-vpn-ztna', week: 5, type: 'explain', topic: 'VPN vs ZTNA',
    front: 'Explain the difference between a VPN and zero-trust network access (ZTNA).',
    back: 'A traditional VPN puts your device on the network, after which it can often reach many resources. ZTNA connects you only to specific applications, checks identity and device posture for each access decision, and keeps everything else out of reach. The trade-off is more policy to design and maintain.',
    reference: 'NIST SP 800-207; Tailscale documentation (access control policies)',
  },
  {
    seedId: 'w5-device-posture', week: 5, type: 'recall', topic: 'Device posture',
    front: 'What is device posture? Give two signals.',
    back: 'The security state of the device asking for access, used in access decisions. Signals include operating-system version and patch level, disk encryption, screen lock, whether the device is managed, and whether endpoint protection is running.',
    reference: 'NIST SP 800-207; Tailscale documentation (device posture)',
  },

  // ─── Week 6: cloud IAM and secrets ────────────────────────────────────────
  {
    seedId: 'w6-identity-resource-policy', week: 6, type: 'recall', topic: 'Cloud IAM roles and policies',
    front: 'In AWS IAM, what is the difference between an identity-based policy and a resource-based policy?',
    back: 'An identity-based policy is attached to a user, group or role and says what that identity can do. A resource-based policy is attached to a resource, such as an S3 bucket, and says who can access it, including principals in other accounts.',
    reference: 'AWS IAM User Guide: "Identity-based policies and resource-based policies"',
  },
  {
    seedId: 'w6-explicit-deny', week: 6, type: 'recall', topic: 'Cloud IAM roles and policies',
    front: 'In AWS IAM, how does an explicit deny interact with allows?',
    back: 'Requests are denied by default and need an explicit allow, but any explicit deny overrides any allow.',
    reference: 'AWS IAM User Guide: "Policy evaluation logic"',
  },
  {
    seedId: 'w6-short-lived', week: 6, type: 'explain', topic: 'Short-lived credentials',
    front: 'Why prefer roles and short-lived credentials over long-lived access keys?',
    back: 'Long-lived keys leak into repositories and laptops, are rarely rotated, and give attackers lasting access. Roles issue temporary credentials (through AWS STS, or workload identity federation) that expire on their own, so a leaked credential stops working quickly.',
    reference: 'AWS IAM User Guide: "Security best practices in IAM"',
  },
  {
    seedId: 'w6-least-privilege', week: 6, type: 'recall', topic: 'Least privilege',
    front: 'What is least privilege, and how do you move towards it in practice?',
    back: 'Grant only the permissions a task needs, for only as long as it needs them. In practice: start narrow, use last-accessed data and IAM Access Analyzer to remove unused permissions, avoid wildcards, and review the highest-risk roles first.',
    reference: 'AWS IAM User Guide: "Security best practices in IAM"; NIST CSRC Glossary: "least privilege"',
  },
  {
    seedId: 'w6-leaked-secret', week: 6, type: 'recall', topic: 'Secrets management',
    front: 'What should you do as soon as you find a secret committed to a git repository?',
    back: 'Treat it as compromised: revoke or rotate it first, then remove it from the code and history, and check logs for any use. Deleting the commit is not enough, because clones, forks and caches may already have it.',
    reference: 'OWASP Secrets Management Cheat Sheet; gitleaks documentation',
  },

  // ─── Week 7: OWASP, identity logs, incident response ──────────────────────
  {
    seedId: 'w7-a01', week: 7, type: 'recall', topic: 'OWASP Top 10',
    front: 'Which risk is A01 in the OWASP Top 10 (2021 edition)?',
    back: 'Broken Access Control. (Check whether a newer edition has reordered the list.)',
    reference: 'OWASP Top 10:2021, A01 Broken Access Control',
  },
  {
    seedId: 'w7-bola', week: 7, type: 'explain', topic: 'BOLA',
    front: 'What is BOLA (broken object level authorization)? Give an example and the fix.',
    back: 'API1 in the OWASP API Security Top 10 (2023). The API checks that you are signed in but not that you may access the specific object you asked for, so changing an ID in the request (for example /invoices/1001 to /invoices/1002) returns someone else\'s data. The fix is to check, on the server, that the caller may access each object on every request.',
    reference: 'OWASP API Security Top 10 (2023), API1: Broken Object Level Authorization',
  },
  {
    seedId: 'w7-bola-bfla', week: 7, type: 'recall', topic: 'BOLA',
    front: 'What is the difference between BOLA and broken function level authorization (BFLA)?',
    back: 'BOLA: reaching another user\'s object through a function you are allowed to use. BFLA: using a function you should not be able to call at all, such as an admin endpoint called by a regular user.',
    reference: 'OWASP API Security Top 10 (2023), API1 and API5',
  },
  {
    seedId: 'w7-identity-events', week: 7, type: 'recall', topic: 'Identity logs',
    front: 'Name four identity events worth logging and alerting on.',
    back: 'Examples: many failed sign-ins, or a success right after many failures; a new MFA method or passkey registered; a password or recovery reset; a role or privilege change; a new admin account; sessions or tokens revoked.',
    reference: 'OWASP Logging Cheat Sheet',
  },
  {
    seedId: 'w7-ir-lifecycle', week: 7, type: 'recall', topic: 'Incident-response lifecycle',
    front: 'What are the phases of the incident-response lifecycle in NIST SP 800-61 Rev. 2?',
    back: 'Preparation; detection and analysis; containment, eradication and recovery; post-incident activity. Rev. 3 (2025) reorganizes incident response around the NIST CSF 2.0 functions, so check which revision you are studying.',
    reference: 'NIST SP 800-61 Rev. 2 (section 3); NIST SP 800-61 Rev. 3',
  },

  // ─── Week 8: AI and agent security ────────────────────────────────────────
  {
    seedId: 'w8-prompt-injection', week: 8, type: 'explain', topic: 'Prompt injection',
    front: 'What is prompt injection (direct and indirect), and why can\'t filtering fully stop it?',
    back: 'Direct injection is a user typing instructions that override the system\'s intent. Indirect injection hides instructions in content the model reads, such as a web page, email or document. The model receives instructions and data in the same channel, so filters catch known patterns but attackers can rephrase endlessly. The reliable response is to limit the damage: least-privilege tools, human approval for high-risk actions, isolating untrusted content, and treating model output as untrusted input.',
    reference: 'OWASP Top 10 for LLM Applications (2025), LLM01: Prompt Injection',
  },
  {
    seedId: 'w8-excessive-agency', week: 8, type: 'recall', topic: 'Excessive agency',
    front: 'What is "excessive agency" in an LLM application?',
    back: 'The system has more functionality, permissions or autonomy than it needs, so a manipulated or mistaken model can take damaging actions. Mitigations: fewer tools, narrowly scoped permissions, acting with the user\'s own limited authority, and human approval for high-impact actions.',
    reference: 'OWASP Top 10 for LLM Applications (2025), LLM06: Excessive Agency',
  },
  {
    seedId: 'w8-agentic-three', week: 8, type: 'recall', topic: 'OWASP agentic risks',
    front: 'Which three entries of the OWASP Top 10 for Agentic Applications does your roadmap say to read closely?',
    back: 'Agent goal hijack, tool misuse, and identity and privilege abuse.',
    reference: 'OWASP Top 10 for Agentic Applications; your roadmap, week 8 (check the official names and numbering)',
  },
  {
    seedId: 'w8-mcp-authz', week: 8, type: 'explain', topic: 'MCP authorization',
    front: 'How does authorization work for an HTTP-based MCP server?',
    back: 'The MCP server acts as an OAuth resource server and the MCP client as an OAuth client. The client gets an access token from an authorization server, following OAuth 2.1 practices including PKCE, and sends it with each request. The server must check that the token was issued for it (its audience) and must not pass the token through to other services.',
    reference: 'Model Context Protocol specification, "Authorization" section (check the current revision)',
  },
  {
    seedId: 'w8-agent-authz', week: 8, type: 'explain', topic: 'Agent permissions and human approval',
    front: 'How should an AI agent be authorized to act for a user?',
    back: 'The agent should have its own identity and act through scoped, short-lived tokens issued for a specific audience on the user\'s behalf, never the user\'s password or a long-lived key. Policy decides per tool and per action, high-risk actions require approval, and every call is logged with both the user\'s and the agent\'s identity. Token exchange is one standard way to get such delegated tokens.',
    reference: 'RFC 8693 (OAuth 2.0 Token Exchange); MCP specification, "Authorization" section',
  },
  {
    seedId: 'w8-human-approval', week: 8, type: 'recall', topic: 'Agent permissions and human approval',
    front: 'When should an agent stop and ask a human for approval?',
    back: 'Before high-impact or hard-to-reverse actions, such as sending money or messages, deleting data or changing permissions, and whenever an action goes beyond what the user asked for. The approval should show exactly what will happen and be logged with both the user\'s and the agent\'s identity.',
    reference: 'OWASP Top 10 for LLM Applications (2025), LLM06: Excessive Agency (human-in-the-loop)',
  },
];
