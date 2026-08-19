# Expense Tracker — Architecture Specification

Status: Draft v1
Owner: Yogendra Singh
Last updated: 2026-08-18
Source: `docs/product-spec.md` (v1, approved), `docs/requirements.md` (v2, approved, all
ambiguities resolved)

## Purpose & Scope

This document defines _how_ the approved, testable requirements in `docs/requirements.md` get
built: system shape, backend layering, module/domain boundaries, and the mechanics behind the
trickiest cross-cutting rules (timezone, currency, category reassignment, token rotation). It does
**not** define the literal Prisma schema (a separate database design doc) or API endpoints (a
separate API spec), and it introduces no feature or behavior beyond what product-spec.md and
requirements.md already approved. Every decision below cites the requirement ID(s) it implements.

Three architectural decisions that were genuinely open (not derivable from the requirements alone)
were resolved with the product owner before this document was written; they're called out inline
and summarized in the Appendix.

## 1. Architecture Goals

- **Traceability** — every requirement ID (FR/BR/SEC/DI) maps to one discrete code unit, so tests
  and code can cite it directly, extending requirements.md §2's ID scheme into the codebase.
- **Simplicity over scalability** — this is a single-user-per-account personal app at modest data
  volume (NFR-1: "a few thousand transactions per user"); no microservices, queues, or caching
  layers not justified by actual scope.
- **Correctness of business rules and data integrity**, enforced at one clear layer rather than
  scattered across the codebase (BR-_, DI-_).
- **Security-by-default** on every authenticated path (SEC-2, SEC-7).
- **Predictable, fail-loud behavior** (NFR-2) — no silent partial writes; every operation returns
  an explicit success or error.
- **Built for testability first** (NFR-5) — the architecture should make unit-testing business
  rules trivial without spinning up the full HTTP+DB stack for every test.

## 2. System Architecture

A single Fastify backend service ("monolith") backed by one PostgreSQL database, accessed via
Prisma. No microservices, no message queue, no separate auth service — none are justified by this
product's scope. The client (a web application, per product-spec §3/§5) talks to the backend over
HTTPS as JSON over REST (endpoint design deferred to the API spec). TLS termination happens at the
infrastructure/reverse-proxy layer, not in application code (SEC-5).

An external email-sending dependency is required for FR-2.1 (verification), FR-5.1 (password
reset), and FR-25.4 (email-change confirmation). It's modeled behind an `EmailSender` interface so
the concrete provider is swappable and mockable in tests. **Decision:** for MVP development, the
implementation is a console-log stub — it prints the email content/link instead of sending real
email — so a real provider (e.g., a transactional-email API) can be wired in later with zero
business-logic changes.

**Deployment topology:** a single instance is sufficient for MVP (NFR-6: no formal SLA). This has
one consequence worth stating up front: in-memory rate-limiting (SEC-4) and the stateless-JWT
access token both work cleanly on one instance; horizontal scaling later would need to move
rate-limit state to a shared store (see §24).

## 3. Backend Architecture

A layered backend, chosen specifically to support the testability/traceability goals in §1:

- **Route/handler layer** (Fastify route handlers) — parses and validates the HTTP request, calls
  into the service layer, and shapes the HTTP response. No business logic lives here.
- **Service layer** — one set of functions per domain area (§4), implementing FR/BR/DI logic,
  orchestrating Prisma calls, and owning transaction boundaries (§12). This is the layer where
  requirement IDs are cited in code comments and test names.
- **Data access** — Prisma Client used directly by the service layer. **Decision: no repository
  abstraction layer over Prisma.** Prisma is already a sufficiently clean data-access abstraction
  for this scope; an extra layer would be indirection without payoff, and (§18) integration tests
  against a real test database are more valuable here than mocked repositories — especially for
  FR-17a's multi-table transaction, which a mocked repository would exercise poorly.
- **Cross-cutting concerns** — auth middleware (verifies the access token, attaches user context),
  a centralized error-handling middleware (§10), and schema-based request validation (§9).

## 4. Application/Module Boundaries

Modules mirror the groupings requirements.md already uses, so a requirement ID tells you exactly
where its implementation lives:

- `auth` — FR-1–FR-6, FR-3.4/FR-3.5, SEC-1/3/4/6/8
- `users` — FR-25, FR-26, FR-27 (profile, currency, timezone, password; settings-facing, but
  operates on the same User entity as `auth`)
- `categories` — FR-15–FR-17a
- `expenses` — FR-7–FR-10
- `income` — FR-11–FR-14
- `budgets` — FR-18–FR-20
- `dashboard` — FR-21–FR-22 (reads from `expenses`/`income`/`budgets`; owns no data itself)
- `reports` — FR-23–FR-24 (same shape as `dashboard`: a read-only aggregator)

Plus a `shared` module (money/decimal utilities, timezone/date utilities, domain error types, auth
guard helpers) with zero dependencies on any domain module.

## 5. Domain Boundaries

Coarser, conceptual bounded contexts — useful groundwork for the future database/schema design:

- **Identity & Access** — User, credentials, sessions/refresh tokens, verification/reset/
  email-change tokens, and the user's currency/timezone preferences. Preferences are folded in
  here rather than made a separate domain: there isn't enough distinct behavior to justify
  fragmenting a small app further.
- **Ledger** — Expense, Income, Category: the core transactional data (FR-7–FR-17a, BR-1–BR-3,
  DI-1–DI-3).
- **Budgeting** — Budget and budget-status calculation (FR-18–FR-20, BR-4–BR-5, DI-1).
- **Insights** (derived, read-only) — Dashboard and Reports (FR-21–FR-24); no persisted state of
  its own, purely aggregates Ledger and Budgeting data.

## 6. Request/Response Flow

1. Request arrives at Fastify (TLS already terminated upstream).
2. Rate-limit check for `/auth/*` routes only (SEC-4).
3. Auth middleware validates the access token and attaches `request.user` (id, verified status,
   timezone, base currency) for protected routes — this is what SEC-2's ownership checks build on.
4. Request schema validation rejects malformed input before any business logic runs (SEC-7).
5. The route handler calls the relevant service function with the authenticated user context and
   validated input.
6. The service layer applies business rules, executes Prisma queries — directly, or inside a
   transaction per §12 — and returns a result or throws a typed domain error.
7. The centralized error handler maps a thrown domain error to an HTTP status and a consistent
   JSON error body (§10); otherwise the handler shapes a success response.
8. A JSON response is returned to the client.

## 7. Authentication Architecture

- **Credentials:** `User.passwordHash`, hashed with **argon2id** using OWASP-recommended minimum
  parameters (SEC-1).
- **Access token:** a stateless JWT, short-lived (~15 min, FR-3.4), signed **HS256** with a server
  secret. Symmetric signing is simpler to operate for a single-service monolith; asymmetric keys
  only pay off once a second service needs to verify tokens independently, which is out of scope
  here. It carries the user's id and verified status and is validated on every request with no
  database lookup — fast, but it cannot be revoked before it expires (an accepted risk, see §23).
- **Refresh token:** an opaque random value (FR-3.4), deliberately _not_ a JWT, because it must be
  server-trackable to support rotation and reuse detection (FR-3.5, SEC-8) — something a stateless
  token can't provide. Only its hash is stored server-side, mirroring the defense-in-depth
  principle already used for passwords.
- **Login:** verify credentials, then issue an access+refresh token pair.
- **Refresh:** exchange a valid, unused refresh token for a new access+refresh pair, marking the
  old refresh token used and linking it to its replacement — this is the rotation FR-3.5 requires.
  Presenting an already-used refresh token means it has been replayed; per SEC-8, the entire
  session chain from that login is revoked, forcing the user to log in again.
- **Logout (FR-4):** explicitly revokes the current refresh token (and thus the chain from that
  point onward). The access token simply expires within 15 minutes — it cannot be revoked early,
  the same accepted risk noted above.
- **Token transport (resolved decision):** both tokens are set as **httpOnly, Secure cookies** —
  client-side JavaScript can never read them, closing off XSS-based token theft. This requires
  CSRF protection on every state-changing (non-GET) request, since cookies are attached to
  requests automatically by the browser: `SameSite=Lax` (or `Strict`) on both cookies, plus a CSRF
  token pattern (e.g. double-submit cookie) enforced on mutating routes.

## 8. Authorization and Resource Ownership

There is no roles/permissions system — product-spec has no multi-role concept (single-user
accounts, no admin, no household sharing in v1). Authorization reduces entirely to "does this
record belong to the requesting user" (SEC-2).

**Decision:** ownership is enforced _structurally_, not as a separate check step layered on top.
Every service-layer query or mutation on Expense/Income/Category/Budget takes `userId` as a
mandatory parameter, and every Prisma query filters by `(id, userId)` together — never `id` alone
followed by an application-level ownership check. This removes an entire class of IDOR bugs by
construction: the unsafe query (fetch-by-id-alone) simply doesn't exist in the codebase's
vocabulary.

**Unverified-user restriction (BR-6):** a guard blocks financial-record-mutating routes
(create/edit/delete on expenses, income, budgets, categories) whenever `request.user.verified` is
false; read-only routes (viewing the profile, resending verification) remain accessible.

## 9. Validation Strategy

Two distinct layers, each answering a different question:

- **Schema validation**, at the route boundary — "is this input well-formed" (types, presence,
  format). Recommended: **Zod**, integrated with Fastify, for TypeScript-native type inference,
  which avoids duplicating the same shape between runtime checks and static types. This is what
  satisfies SEC-7's "validate server-side regardless of client-side validation."
- **Domain/business-rule validation**, in the service layer — "is this a valid operation," for
  things a schema alone can't express: amount > 0 (BR-1), date not in the future in the user's
  timezone (BR-8), category ownership (FR-7.3), category-name uniqueness (FR-15.1), budget
  uniqueness (BR-4). These require database lookups or cross-record logic, so they live as
  explicit checks in the service layer that throw typed domain errors (§10) rather than as schema
  rules.

## 10. Error Handling Strategy

- Typed domain error classes — `ValidationError`, `NotFoundError`, `ConflictError`,
  `ForbiddenError`, `UnauthorizedError` — are what the service layer throws. Never a raw string or
  a generic `Error`.
- One centralized Fastify error handler maps each error type to an HTTP status and a consistent
  JSON shape (`{ error: { code, message, details? } }`), which is what implements NFR-2's "no
  silent failures" at the transport level.
- Structured errors carry whatever detail a requirement demands — for example, FR-17a.4's conflict
  error must name the specific conflicting month(s), not just say "conflict."
- Unexpected/unhandled errors are logged server-side with full detail (§19) and returned to the
  client as a generic 500 with no internal detail leaked.

## 11. Database Access Strategy

- Prisma Client is used directly from the service layer (§3), with a single shared client instance
  per process (standard Prisma practice — not one client per request).
- Every query is scoped by `userId` (§8).
- Aggregation for dashboard totals (FR-21) and reports (FR-23/FR-24) uses Prisma's
  `aggregate`/`groupBy` rather than pulling all matching rows into application memory and summing
  in JavaScript — both for NFR-1's 500ms target and to keep decimal precision (DI-5) inside the
  database engine rather than doing floating-point-risky summation in JS.
- Money columns are `NUMERIC`/`DECIMAL` in Postgres, never `FLOAT`/`DOUBLE`. (The literal column
  definitions belong to the database design doc; this constraint is an architecture-level rule,
  not an implementation detail left open for later.)

## 12. Transaction Boundaries

Single-entity writes need no explicit transaction beyond Prisma's own per-query atomicity. An
explicit `$transaction` is required wherever an operation spans multiple tables, or does a
read-then-write that enforces a uniqueness/conflict rule:

- **Registration** (FR-1.1 + FR-1.5's timezone capture + FR-6's default-category seeding) — one
  transaction, so a user is never left existing without their seeded categories.
- **Category delete + reassignment** (FR-17a.5) — the FR-17a.4 conflict check must be re-verified
  _inside_ the same transaction, not merely before it, to avoid a time-of-check/time-of-use race
  where a conflicting budget is created concurrently between the check and the write.
- **Refresh-token rotation** (FR-3.5) — marking the old token used and creating its replacement
  must be atomic, or two concurrent refresh calls could both succeed against the same token,
  undermining SEC-8's reuse detection.
- **Email-change request** (FR-25.3/FR-25.4) — creating the pending-email state and its
  confirmation token happens together, so the account is never left in a half-created state.

**General rule:** database-level unique constraints (DI-1, DI-2, and category-name uniqueness) are
a required second line of defense against races, not a substitute for the application-level
pre-checks above.

## 13. Timezone Handling

- `User.timezone` (an IANA timezone string, e.g. `Asia/Kolkata`) is captured at registration
  (FR-1.5, defaulting to UTC if none is provided) and editable at any time (FR-26.3).
- Every "today" / "current month" / report-boundary calculation (FR-7.4, FR-11.4, FR-20.1,
  FR-21.1–21.3, FR-23.1, FR-24.1, BR-8) is computed through one shared, timezone-aware utility in
  `shared`, built on a proper timezone library (e.g. Luxon or `date-fns-tz`) rather than raw
  JavaScript `Date` arithmetic, which is a well-known source of subtle timezone bugs.
- Expense and income dates are stored as plain calendar dates with no time-of-day component — they
  represent "which day this happened," independent of the user's _current_ timezone setting. If a
  user later changes their timezone (FR-26.3), previously stored dates are **not** reinterpreted;
  only live "what is today" comparisons use the current setting.

## 14. Currency Handling

- `User.baseCurrency` (an ISO 4217 code) is set at signup (FR-26.1) and becomes immutable once any
  Expense, Income, or Budget exists (FR-26.2) — enforced by checking for existing records before
  allowing the settings update to go through.
- All monetary arithmetic uses a decimal library end-to-end (e.g. `decimal.js`, or Prisma's own
  `Decimal` type) — parsed at the API boundary, carried through business logic, and stored as
  `NUMERIC` (DI-5). Native JavaScript `number` is never used for money.
- **Currency is derived, not snapshotted (resolved decision):** individual Expense, Income, and
  Budget records carry no currency field of their own. Every amount is implicitly denominated in
  the user's _current_ `User.baseCurrency`, read at query time. This matches DI-6 literally and
  needs no extra column, since currency is already locked the moment any record exists (FR-26.2) —
  a snapshot would only ever agree with the live value anyway.

## 15. Category Deletion/Reassignment Flow

This is the single most cross-cutting operation in the system (it touches three tables and two
business rules at once), so it's worth spelling out as an explicit sequence:

1. The client requests deletion of category **C**.
2. If C has zero associated expenses, income entries, or budgets: verify the user has more than
   one category in total (FR-17); if so, delete C directly.
3. If C has associated records: the request must include a `replacementCategoryId` (FR-17a.1);
   the service layer validates that the replacement belongs to the same user and isn't C itself.
4. A database transaction begins:
   a. **Re-check inside the transaction** (not just before it): for every month in which C has a
   budget, does the replacement category already have one? If any conflict exists, abort with
   zero writes and return an error naming the specific conflicting month(s) (FR-17a.4).
   b. Reassign every Expense referencing C to the replacement category (FR-17a.2).
   c. Reassign every Income entry referencing C to the replacement category (FR-17a.3).
   d. Move C's budgets to the replacement category — safe at this point, since step (a) already
   ruled out conflicts.
   e. Delete C.
   f. Commit.
5. Any failure at any point inside the transaction leaves the database completely unchanged
   (DI-3) — there is no partially-reassigned state.

## 16. Token Lifecycle and Refresh-Token Rotation

- **Access token:** a JWT with a ~15-minute lifetime, issued at login and reissued at every
  successful refresh.
- **Refresh token:** an opaque random value, stored only as a hash, rotated on every use. Each
  stored record conceptually tracks whether it has been used and which token replaced it — enough
  to support chain-based reuse detection. (The literal schema for this is deferred to the database
  design doc; this is the conceptual shape the schema must support.)
- **Reuse detection (SEC-8):** if a refresh token is presented that's already marked used, that's
  a replay — the system treats it as a compromise signal, revokes the entire token chain from that
  login, and requires the user to log in again.
- Verification, password-reset, and email-change confirmation tokens (FR-2.1, FR-5.2, FR-25.4) are
  a **separate, simpler** token family: single-use with a fixed expiry, no rotation chain at all.
  They're architecturally distinct from the session tokens above even though both are "opaque,
  server-tracked, hash-only-stored" in spirit.

## 17. Security Boundaries

- Nothing arriving from the client is trusted without validation (SEC-7); JWT claims are always
  cryptographically verified — signature and expiry — never simply decoded and trusted.
- Every authenticated route requires a valid access token; every resource-scoped route additionally
  requires an ownership match (SEC-2, §8).
- Rate limiting (SEC-4) is applied as a plugin/hook scoped specifically to `/auth/*` routes, not
  globally, so it never throttles normal authenticated usage.
- Secrets — the JWT signing key, database credentials, and (eventually) email-provider credentials
  — come from environment variables, never hardcoded in source.
- Cookie-based token transport (§7) requires CSRF defenses (`SameSite` + a CSRF token pattern) on
  every mutating route, in addition to the ownership checks above.
- **Accepted risk:** stateless access tokens can't be revoked before they expire — mitigated by
  their short (~15 min) lifetime (see §23).
- HTTPS termination (SEC-5) is an infrastructure concern, handled by the deployment layer, not by
  application code.

## 18. Testing Boundaries

This maps directly onto §3's layers and NFR-5's "covered by automated tests":

- **Unit tests** — pure, I/O-free business-rule functions: budget-status classification (FR-20.2),
  amount validation (BR-1), the password-length policy (FR-1.3), and the timezone/date-boundary
  math in `shared` (§13). Fast, no database involved.
- **Integration tests** — service-layer functions tested against a real, ephemeral test Postgres
  database via Prisma, not mocked. This matters most for FR-17a's multi-table transaction, where
  mocking Prisma would end up testing the mock instead of the actual transactional behavior.
- **Route/API-level tests** — black-box HTTP tests using Fastify's `inject()` (no real network),
  covering auth middleware, request validation, and error-response shapes for a representative
  slice of routes. Full endpoint-by-endpoint coverage follows once the API spec exists.
- Tests are named and organized to cite the FR/BR/SEC/DI ID(s) they verify, extending
  requirements.md's traceability convention all the way into the test suite.

## 19. Observability/Logging Approach

- Structured JSON logging via Fastify's built-in Pino logger — no additional logging library.
- Unhandled errors are logged server-side with a full stack trace and request context (route,
  userId), while the client only ever sees the sanitized message (§10).
- Security-relevant events are logged explicitly: failed login attempts, rate-limit triggers, and
  refresh-token reuse detection (SEC-8) — these are exactly the signals that would matter most if
  this system were ever operated for real.
- No external observability stack for MVP (no Datadog, Sentry, etc.) — acceptable given NFR-6's
  "no formal SLA"; noted as future extensibility (§24) if real monitoring is ever needed.
- Raw passwords, raw tokens, and full financial record contents are never logged at normal log
  levels.

## 20. Project Folder/Module Structure

```
src/
  app.ts                   # Fastify app assembly (plugins, route registration)
  server.ts                # process entrypoint
  config/                  # env/config loading
  shared/
    errors/                # domain error classes
    money/                 # decimal utilities (DI-5)
    time/                  # timezone/date utilities (§13)
    auth/                  # token verification middleware, ownership-guard helpers
  modules/
    auth/                  # FR-1–FR-6, FR-3.4/3.5, SEC-1/3/4/6/8
    users/                 # FR-25–FR-27
    categories/            # FR-15–FR-17a
    expenses/              # FR-7–FR-10
    income/                # FR-11–FR-14
    budgets/               # FR-18–FR-20
    dashboard/             # FR-21–FR-22
    reports/               # FR-23–FR-24
  db/
    prisma.ts              # shared Prisma client instance
prisma/
  schema.prisma             # (defined in the future database design doc)
tests/
  unit/
  integration/
```

Each module directory holds its service logic now; `routes.ts`/`schemas.ts` files are named here
so the future API spec has an obvious home, without this document designing any endpoints itself.

## 21. Dependency Rules Between Modules

- `shared/*` depends on nothing else in the codebase.
- `auth` and `users` depend only on `shared/*` — the foundational identity domain.
- `categories`, `expenses`, `income`, and `budgets` depend on `shared/*` and on `auth`/`users` (for
  user context), but **must not** depend on `dashboard` or `reports`.
- `dashboard` and `reports` depend on `expenses`, `income`, `budgets`, and `shared`, but nothing
  depends back on them — they are leaf aggregators, keeping the dependency graph acyclic.
- Cross-module data access always goes through the owning module's exported service functions
  (e.g., `dashboard` calls `expenses.getMonthlyTotal(userId, month)`), never a raw Prisma query
  against another module's table. This keeps business rules centralized (NFR-5) and prevents the
  timezone-aware month-boundary logic from being reimplemented in multiple places.
- This can be enforced later with a dependency-boundary lint rule (e.g. `dependency-cruiser`) — a
  useful future tooling addition, not required for MVP.

## 22. Architecture Decisions and Rationale

| Decision                                                            | Rationale                                                                                                                                                                                            |
| ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Monolith, not microservices                                         | Single-user personal app with no independent-scaling needs; simplest to build, test, and reason about (§1).                                                                                          |
| No repository layer over Prisma                                     | Prisma is already a clean data-access abstraction; integration tests against a real database are more valuable than mocked repositories for this domain's transactional logic (DI-3).                |
| Stateless JWT access token + server-tracked opaque refresh token    | Gets the performance/simplicity of a stateless token while still enabling the server-side rotation and reuse detection SEC-8 requires — something a purely stateless refresh token couldn't support. |
| HS256 (symmetric) JWT signing                                       | Simpler key management for a single-service monolith; asymmetric keys only pay off once a second service needs to verify tokens independently.                                                       |
| httpOnly cookies for token transport                                | Closes off XSS-based token theft entirely, appropriate for an app handling personal financial data; the CSRF-mitigation cost is well understood and standard.                                        |
| Currency derived from `User.baseCurrency`, never snapshotted        | Matches DI-6 literally; a snapshot field would be redundant given currency is locked once any record exists.                                                                                         |
| Per-user timezone, centralized in one shared utility                | Directly implements the timezone decision from requirements.md; avoids ad-hoc date math scattered across modules.                                                                                    |
| Ownership enforced structurally (mandatory `userId`-scoped queries) | Eliminates an entire IDOR bug class by construction, rather than relying on a separate, forgettable authorization check.                                                                             |
| Decimal library end-to-end for money                                | DI-5 requires exact precision; native JavaScript `number`/float arithmetic is unsafe for currency math.                                                                                              |
| Zod for schema validation                                           | TypeScript-native type inference avoids duplicating the same shape between runtime checks and static types.                                                                                          |
| Console-log `EmailSender` stub for MVP                              | Lets development and testing proceed without an external account/provider dependency; the interface makes swapping in a real provider a zero-business-logic-change later.                            |

## 23. Risks and Trade-offs

- Stateless access tokens can't be revoked before they expire — mitigated by their short (~15 min)
  lifetime.
- In-memory rate limiting won't behave correctly across multiple server instances — acceptable for
  MVP's single-instance deployment; would need a shared store (e.g. Redis) if horizontally scaled.
- Skipping a repository layer couples business logic somewhat to Prisma's API — an acceptable
  trade-off at this scope; would only need revisiting if a second backing store were ever required
  (unlikely for this project).
- The currency-lock-after-first-record rule has a theoretical race (a concurrent "add expense" and
  "change currency" request) — low real-world risk for a single-user personal app, and not
  specially mitigated beyond normal transaction ordering for MVP.
- The category-deletion transaction (FR-17a.5) touches every associated record at once — fine at
  NFR-1's "a few thousand records" scale, but would need batching if data-volume assumptions ever
  changed substantially.
- No caching layer — dashboard and report queries hit Postgres directly on every request;
  acceptable given NFR-1's 500ms target at expected volumes, and the first thing to revisit if
  performance ever becomes an issue.
- httpOnly-cookie token transport requires correct CSRF handling on every mutating route; getting
  this wrong is a common source of security bugs, so it deserves explicit test coverage (§18) once
  the API spec defines the actual routes.

## 24. Future Extensibility Considerations

- **Household/shared accounts** (a product-spec future feature): the Identity & Access / Ledger
  domain split (§5) was chosen partly so that ownership (§8) could later generalize from `userId`
  to a broader `ownerId` concept without a full rewrite.
- **Multi-currency support**: currency logic is already isolated in one place (§14); adding
  conversion later means extending that area rather than restructuring the application.
- **Recurring transactions**: would likely become a new `modules/recurring` that generates
  Expense/Income records on a schedule, without needing to touch the existing CRUD logic in
  `expenses`/`income`.
- **Horizontal scaling**: would require moving rate-limit state to a shared store; the
  stateless-access-token design already avoids one common horizontal-scaling pitfall.
- **Observability**: Pino's structured log output is compatible with most hosted log aggregators,
  so swapping in real monitoring later requires no application code changes.

## Appendix: Architectural Decisions Resolved With the Product Owner

Three questions in this document could not be derived from product-spec.md or requirements.md
alone and were resolved directly before this document was finalized:

| ID   | Question                                                                      | Decision                                                                                 | Sections Affected |
| ---- | ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ----------------- |
| AA-1 | How should the browser client store/send the access and refresh tokens?       | httpOnly, Secure cookies for both, with CSRF protection on mutating routes               | §7, §17, §22, §23 |
| AA-2 | Should currency be stored per-record or only derived from the user's setting? | Derived from `User.baseCurrency` at read time; no per-record currency field              | §14, §22          |
| AA-3 | How should verification/reset/email-change emails be sent for now?            | Abstract `EmailSender` interface with a console-log stub for MVP; real provider deferred | §2, §22           |

No open architectural ambiguities remain. The next artifact in this series — the database design
document — can proceed from this architecture without further product-owner input, though it may
surface its own schema-level questions.
