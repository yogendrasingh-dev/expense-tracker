# Expense Tracker — Implementation Plan

Status: Draft v1
Owner: Yogendra Singh
Last updated: 2026-08-18
Source: `CLAUDE.md`, `docs/product-spec.md`, `docs/requirements.md`, `docs/architecture.md`,
`docs/database-design.md`, `docs/api-spec.md`, `docs/testing-strategy.md`,
`docs/development-workflow.md` — all approved

## Purpose & Scope

This is the master roadmap from finalized specification to working code. It breaks the backend
into small, independently reviewable phases, each a discrete Plan Mode → approval → implement →
test → review → merge cycle per `development-workflow.md` §2/§6. No application code, Node.js
project initialization, Prisma models, or migrations are created by this document — it is a plan
only. No other specification document is modified by this plan.

## Sequencing Principles Applied

- **Module-sized phases, further split where a phase would otherwise be large**
  (`development-workflow.md` §6): each phase ≈ one requirement cluster, small enough to review in
  one sitting.
- **Respect the build order** (`requirements.md` §8, `architecture.md` §21): Auth → Categories →
  Expenses/Income → Budgets → Dashboard/Reports, with `shared` cross-cutting infrastructure built
  _before_ the first feature that needs it, not bolted on later.
- **Category deletion-with-reassignment (FR-17a) is deliberately sequenced _after_ Expenses,
  Income, and Budgets all exist** — `requirements.md` §8 explicitly states this cross-cutting rule
  "must be implemented after all three exist, not alongside basic category CRUD."
- **FR-6 (default-category seeding) is implemented in full in Phase 3, not deferred.** FR-6 is an
  approved, finalized requirement — registration must atomically create the user, store their
  timezone, and seed default categories in one transaction, per `architecture.md` §12. This is why
  the `Category` table is deliberately built in **Phase 1** (schema only) ahead of Auth — so
  Phase 3's registration transaction has something to insert into. Category's full CRUD
  (create/rename/delete) is a separate, later phase (Phase 6) that extends the same module rather
  than starting it — the table appears in Phase 1, a minimal seed function appears in Phase 3, and
  the user-facing CRUD surface appears in Phase 6. No functionality is deferred; only the
  _module's growth_ is staged.
- Every phase, without exception, requires: a Plan Mode plan approved before starting
  (`CLAUDE.md` §5/§21), explicit approval for any new dependency it introduces (`CLAUDE.md` §7),
  and an AI-assisted `/code-review` pass before merge (`CLAUDE.md` §17). Phases that touch the
  schema additionally require the dedicated migration-confirmation step (`CLAUDE.md` §18). These
  are stated once here rather than repeated in every phase entry below.

## Phase 0 — Project Scaffolding & Tooling

- **Objective**: initialize the repo skeleton so every later phase has somewhere to land — package
  config, TypeScript, linting, test runner, Prisma init, folder structure, CI skeleton, local dev
  Postgres.
- **Requirement IDs**: none directly (infrastructure); supports NFR-5 and `architecture.md` §1/§20.
- **Dependencies**: none — first phase.
- **Files/modules**: `package.json`, `tsconfig.json` (`strict: true`), `.eslintrc`/`prettier`
  config, `vitest.config.ts`, `src/app.ts`, `src/server.ts`, `src/config/`, empty `src/shared/` and
  `src/modules/` per `architecture.md` §20, `prisma/schema.prisma` (datasource/generator only, no
  models yet), `docker-compose.yml` (local Postgres), `.env.example`, `.github/workflows/ci.yml`
  skeleton.
- **Database changes**: none.
- **API changes**: none. No routes are added in this phase, including any not documented in
  `api-spec.md` — Phase 0 stays limited to infrastructure/tooling bootstrap.
- **Tests**: a smoke test that instantiates the Fastify app and calls its startup lifecycle (e.g.
  `.ready()`) to confirm all plugins and config load without error — no HTTP route is exercised,
  since none exist yet.
- **Acceptance criteria**: `npm run dev` boots the server with no routes registered beyond
  framework defaults; `npm test` runs and the app-boot smoke test passes; CI pipeline executes
  lint+typecheck+test on a dummy PR.
- **Risks**: tooling churn early is expensive to unwind later — mitigated by keeping this phase
  minimal and deferring anything not immediately needed.
- **Required human approvals**: dependency approval for every initial package (Fastify,
  TypeScript, ESLint, Prettier, Vitest, Prisma, Pino, dotenv, etc.) — this phase has the most
  dependency touchpoints of any phase.
- **Commit/PR boundary**: one PR — `chore: project scaffolding and tooling setup`.

## Phase 1 — Database Foundation: User, RefreshToken, VerificationToken, Category

- **Objective**: create the four tables with no cross-dependencies on ledger data — User and its
  two token tables, plus Category (included early specifically so Phase 3's registration
  transaction can seed default categories immediately, per FR-6, without a later schema-churn
  phase).
- **Requirement IDs**: schema support for FR-1.1–1.5, FR-6, FR-2.1–2.4, FR-3.4–3.5, FR-5.1–5.4,
  FR-15.1–FR-17, SEC-1/3/6/8; DI-2 (Category FK), DI-5 (money — N/A yet, no money columns in this
  phase).
- **Dependencies**: Phase 0.
- **Files/modules**: `prisma/schema.prisma` (User, RefreshToken, VerificationToken, Category
  models), first migration.
- **Database changes**: `CREATE TABLE` for all four, per `database-design.md` §4–§9, §14, §20 —
  UUID PKs; `User.email` unique; `RefreshToken.tokenHash`/`familyId`; `VerificationToken.tokenHash`/
  `type` discriminator; `Category (userId, normalizedName)` unique; all FKs to User as `Cascade`.
  (Category's `Restrict`-to-children FKs come later, in Phase 7–9, when Expense/Income/Budget
  tables are created.)
- **API changes**: none.
- **Tests**: raw-Prisma constraint tests (`testing-strategy.md` §6) — `User.email` uniqueness,
  `RefreshToken.tokenHash`/`VerificationToken.tokenHash` uniqueness, `Category` case-insensitive
  name uniqueness, `User`-delete cascades to all four tables.
- **Acceptance criteria**: migration applies cleanly to a fresh Testcontainers database; all
  constraint tests pass.
- **Risks**: this is the first real migration — establishes the pattern for the dedicated
  SQL-confirmation step; getting a constraint wrong here is cheap to fix now, expensive once data
  exists.
- **Required human approvals**: migration confirmation (generated SQL shown and approved) — the
  first instance of this workflow rule.
- **Commit/PR boundary**: `feat: add User, token, and Category schema (DB foundation)`.

## Phase 2 — Shared Cross-Cutting Infrastructure

- **Objective**: build the `shared` module (`architecture.md` §4) that every feature phase from
  here on depends on, so it's never retrofitted under pressure: centralized error handling, Zod
  validation wiring, JWT auth middleware + the structural ownership-guard helper, the CSRF
  double-submit middleware, the rate-limiter plugin, the `EmailSender` interface + console-log
  stub, the money/decimal utility, and the timezone/date utility — built with an **injectable
  current-instant** from the start, per `testing-strategy.md` §14's testability requirement.
- **Requirement IDs**: SEC-1 (hashing helper), SEC-2 (ownership-guard helper), SEC-4 (rate-limit
  plugin), SEC-5 (assumed at infra layer), SEC-6/SEC-8 (JWT verification, refresh-family
  revocation helper), SEC-7 (Zod wiring), DI-5 (money utility); `CLAUDE.md` §14's Finding-A/B
  reconciliations (logout/refresh semantics, fresh-per-request user lookup) are implemented here
  as the auth middleware's actual behavior.
- **Dependencies**: Phase 1 (needs the User/RefreshToken tables for the auth middleware's
  per-request lookup).
- **Files/modules**: `src/shared/errors/`, `src/shared/money/`, `src/shared/time/` (with
  injectable clock), `src/shared/auth/` (JWT verify + ownership guard + CSRF + rate-limit),
  `src/shared/email/` (interface + stub).
- **Database changes**: none (uses Phase 1's tables, adds no new ones).
- **API changes**: none directly — this phase has no routes of its own; routes starting next
  phase will use this infrastructure.
- **Tests**: unit tests for the money utility (decimal precision, DI-5), the timezone utility
  (boundary math with an injected clock), and the CSRF/rate-limit logic in isolation; no route
  tests yet (no routes exist).
- **Acceptance criteria**: all shared utilities have passing unit tests; the auth middleware can
  be exercised against a hand-built fake JWT in a test without needing a real login flow yet.
- **Risks**: getting the auth middleware's fresh-lookup behavior (`CLAUDE.md` Finding B) wrong
  here propagates into every subsequent phase — worth extra scrutiny in review since it's
  foundational and security-relevant (triggers the `/security-review` skill per `CLAUDE.md`/
  `development-workflow.md` §21).
- **Required human approvals**: dependency approval for `zod`, `jsonwebtoken` (or equivalent),
  `argon2`, a rate-limit library, a timezone library (Luxon or `date-fns-tz`); security-review
  pass (auth-adjacent).
- **Commit/PR boundary**: `feat: shared auth, validation, error-handling, and utility
infrastructure`.

## Phase 3 — Registration (with Default-Category Seeding) and Email Verification

- **Objective**: the first real feature slice. Users can register and verify their email.
  Registration is fully atomic per `architecture.md` §12: it creates the User, stores their
  timezone, **and seeds the default category set in the same transaction (FR-6), in full** — FR-6
  is an approved, finalized requirement and is not deferred.
- **Requirement IDs**: FR-1.1, FR-1.2, FR-1.3, FR-1.4, FR-1.5, FR-6, FR-2.1, FR-2.2, FR-2.3,
  FR-2.4, SEC-1, SEC-3, SEC-4, SEC-7.
- **Dependencies**: Phase 1 (schema — `User` and `Category` tables both required here), Phase 2
  (shared infra: hashing, Zod, EmailSender stub, rate limiter).
- **Files/modules**: `src/modules/auth/` (service + routes + schemas for
  register/verify-email/resend-verification); a minimal `src/modules/categories/` introduced here
  with just the default-category-name list and a `seedDefaultCategories(userId, tx)` helper used
  inside registration's transaction — Phase 6 later extends this same module with the full CRUD
  surface.
- **Database changes**: none new (uses Phase 1's `User` and `Category` tables).
- **API changes**: `POST /auth/register`, `POST /auth/verify-email`, `POST
/auth/resend-verification` per `api-spec.md` §3–§8.
- **Tests**: unit (password-length policy, FR-1.3); integration (registration happy path —
  **asserting the full default category set is created atomically alongside the user and
  timezone** — duplicate email → 409, verification token lifecycle: valid/expired/already-used/
  wrong-type per `testing-strategy.md` §13); route (schema validation, rate-limit trigger on
  register/resend).
- **Acceptance criteria**: a user can register, receive a (stubbed) verification email, and
  verify; duplicate registration and invalid tokens are correctly rejected; **registration
  atomically creates the user, stores their timezone, and seeds the default category set (FR-6)
  in one transaction** — verified by querying for the seeded categories immediately after
  registration, not just by response status.
- **Risks**: this is the first multi-table write transaction in the project (User + N Category
  rows) — worth confirming the transaction is truly atomic (a forced failure after the User
  insert must leave no partial Category rows) before later phases build on the same pattern.
- **Required human approvals**: none beyond the standing rules (no new schema, no likely new
  dependencies beyond Phase 2's).
- **Commit/PR boundary**: `feat: user registration with default-category seeding, and email
verification (FR-1, FR-2, FR-6)`.

## Phase 4 — Login, Logout, Token Issuance & Refresh Rotation

- **Objective**: complete the session lifecycle — login issues tokens, logout revokes them,
  refresh rotates them with reuse detection. **Phase 3 + Phase 4 together are the first vertical
  slice** (see below).
- **Requirement IDs**: FR-3.1, FR-3.2, FR-3.3, FR-3.4, FR-3.5, FR-4, SEC-6, SEC-8, BR-6.
- **Dependencies**: Phase 3 (a user must be able to register/verify before logging in is testable
  end-to-end).
- **Files/modules**: extends `src/modules/auth/` with login/logout/refresh service functions and
  routes.
- **Database changes**: none (uses Phase 1's `RefreshToken` table).
- **API changes**: `POST /auth/login`, `POST /auth/logout`, `POST /auth/refresh` per
  `api-spec.md` §3–§8; sets the httpOnly access/refresh/CSRF cookies.
- **Tests**: the full `testing-strategy.md` §8/§12 suite — no-enumeration assertion (wrong
  password vs. unknown email produce identical errors), full refresh-rotation cycle,
  **reuse-detection asserting the entire family (including the newest token) is revoked**,
  logout-then-refresh rejection, and using `POST /auth/resend-verification` (the authenticated
  endpoint already shipped in Phase 3) to prove the auth middleware and per-request user lookup
  correctly identify the caller.
- **Acceptance criteria**: register → login while still unverified (BR-6 permits this) → call
  `POST /auth/resend-verification` (an already-documented, already-implemented authenticated
  endpoint — succeeds, proving the auth middleware correctly identifies the caller with no
  undefined placeholder route) → verify → refresh → logout → confirm the token chain is fully
  rejected, including a replay of an already-rotated refresh token — the complete auth flow from
  `testing-strategy.md` §29 (`development-workflow.md`'s own worked precedent, adapted).
- **Risks**: refresh-token rotation and reuse detection is one of the highest-risk areas flagged
  across `architecture.md` §23 and `testing-strategy.md` §12 — deserves careful, unhurried review.
- **Required human approvals**: none beyond standing rules.
- **Commit/PR boundary**: `feat: login, logout, and refresh-token rotation with reuse detection
(FR-3, FR-4)`.

**→ First vertical slice: Phases 0–4.** This is the smallest set of phases that exercises every
architectural layer end-to-end on a real, complete feature — HTTP routes, Zod validation, the
service layer, Prisma/Postgres, cookies, JWTs, CSRF, rate limiting, and all three testing-pyramid
layers — before any ledger/financial feature exists. It's the right place to validate that the
whole stack (and the whole _workflow_: Plan Mode → approval → implement → test → review → merge)
works end-to-end before committing to the same pattern for every remaining phase.

## Phase 5 — Password Reset

- **Objective**: small, isolated feature reusing Phase 1's `VerificationToken` and Phase 2's
  `EmailSender`.
- **Requirement IDs**: FR-5.1, FR-5.2, FR-5.3, FR-5.4.
- **Dependencies**: Phases 1–3 (verification-token infrastructure already exists).
- **Files/modules**: extends `src/modules/auth/`.
- **Database changes**: none.
- **API changes**: `POST /auth/password-reset/request`, `POST /auth/password-reset/confirm`.
- **Tests**: no-enumeration assertion on request (identical response for existing/non-existing
  email); expired/used/invalid token rejection; successful reset allows login with the new
  password and not the old one.
- **Acceptance criteria**: matches `api-spec.md` §3–§8's documented behavior exactly.
- **Risks**: low — this phase is intentionally small given how much of its machinery already
  exists.
- **Required human approvals**: none beyond standing rules.
- **Commit/PR boundary**: `feat: password reset (FR-5)`.

## Phase 6 — Categories CRUD

- **Objective**: the user-facing category management surface — create, rename, and simple delete —
  extending the `src/modules/categories/` module Phase 3 already started (with the default-list
  and seed helper). FR-6 was already fully implemented in Phase 3; this phase adds no seeding
  logic, only CRUD.
- **Requirement IDs**: FR-15.1, FR-16, FR-17, BR-3.1.
- **Dependencies**: Phase 1 (schema), Phase 3 (the `categories` module already exists with the
  seed helper; this phase extends it).
- **Files/modules**: extends `src/modules/categories/` with create/rename/delete service
  functions, routes, and schemas.
- **Database changes**: none new (Category table already exists from Phase 1).
- **API changes**: `POST /categories`, `GET /categories`, `PATCH /categories/:id`, `DELETE
/categories/:id` (no-associated-records case only — `409 CATEGORY_IN_USE`/`409 LAST_CATEGORY`
  per `api-spec.md` §11; the reassign-and-delete variant is Phase 10).
- **Tests**: case-insensitive uniqueness (create/rename), last-category-deletion rejection, and a
  regression check confirming this phase's changes don't alter Phase 3's seeding behavior.
- **Acceptance criteria**: all of `api-spec.md` §11's non-reassignment endpoints behave exactly as
  documented.
- **Risks**: low — this phase only adds new functions to an existing module; the main risk is
  accidentally touching the seed helper while extending the module.
- **Required human approvals**: none beyond standing rules.
- **Commit/PR boundary**: one PR — `feat: category CRUD (FR-15.1, FR-16, FR-17)`.

## Phase 7 — Expenses CRUD

- **Objective**: full expense lifecycle.
- **Requirement IDs**: FR-7.1, FR-7.2, FR-7.3, FR-7.4, FR-7.5, FR-8.1, FR-8.2, FR-8.3, FR-9,
  FR-10, BR-1, BR-8.
- **Dependencies**: Phase 6 (a category must exist to reference).
- **Files/modules**: new `src/modules/expenses/`.
- **Database changes**: `CREATE TABLE Expense` per `database-design.md` §4–§12 —
  `NUMERIC(12,2)` amount with `CHECK (amount > 0)`, `DATE` for the business date,
  `userId`/`categoryId` FKs (Category→Expense as `Restrict`, established here for the first
  time), indexes on `(userId, date)` and `(userId, categoryId)`.
- **API changes**: `POST/GET/GET :id/PATCH/DELETE /expenses` per `api-spec.md` §12.
- **Tests**: amount/date/ownership validation; the timezone-boundary tests from
  `testing-strategy.md` §14 land here for the first time (an expense dated "today" in the user's
  timezone at a UTC-tomorrow moment must succeed, and vice versa); pagination/filtering/sorting
  (§21).
- **Acceptance criteria**: matches `api-spec.md` §12 exactly; the injectable-clock timezone tests
  from Phase 2's utility are exercised end-to-end for the first time.
- **Risks**: this is the first phase where the timezone utility and the `Restrict` FK are
  exercised for real — worth confirming both behave as designed before Income (Phase 8) copies
  the same pattern.
- **Required human approvals**: migration confirmation for the new `Expense` table.
- **Commit/PR boundary**: `feat: expense CRUD (FR-7–FR-10)`.

## Phase 8 — Income CRUD

- **Objective**: mirrors Phase 7 exactly, for income.
- **Requirement IDs**: FR-11.1, FR-11.2, FR-11.3, FR-11.4, FR-11.5, FR-12.1, FR-12.2, FR-12.3,
  FR-13, FR-14, BR-1, BR-8.
- **Dependencies**: Phase 6 (categories); can proceed in parallel with Phase 7 if ever split
  across sessions, since Expense and Income don't depend on each other.
- **Files/modules**: new `src/modules/income/`.
- **Database changes**: `CREATE TABLE Income` — identical shape to `Expense` (§4–§12), same
  `Restrict` FK pattern from Category.
- **API changes**: `POST/GET/GET :id/PATCH/DELETE /income` per `api-spec.md` §13.
- **Tests**: same shape as Phase 7's, mirrored for income.
- **Acceptance criteria**: matches `api-spec.md` §13 exactly; behavior is a faithful mirror of
  Phase 7.
- **Risks**: low — this is the most mechanically-repetitive phase in the plan; the main risk is
  copy-paste drift from Expenses rather than new design risk.
- **Required human approvals**: migration confirmation for the new `Income` table.
- **Commit/PR boundary**: `feat: income CRUD (FR-11–FR-14)`.

## Phase 9 — Budgets CRUD and Status Calculation

- **Objective**: budgets, uniqueness, and the under/near/over status calculation.
- **Requirement IDs**: FR-18.1, FR-18.2, FR-18.3, FR-19.1, FR-19.2, FR-20.1, FR-20.2, BR-1, BR-4,
  BR-5, DI-1.
- **Dependencies**: Phase 6 (categories) and Phase 7 (expenses — `FR-20.1`'s actual-spend
  calculation reads Expense data).
- **Files/modules**: new `src/modules/budgets/`.
- **Database changes**: `CREATE TABLE Budget` — `NUMERIC(12,2)` amount, `DATE` month (normalized
  to the 1st), `UNIQUE (userId, categoryId, month)`, `Restrict` FK from Category (extending the
  pattern from Phase 7/8).
- **API changes**: `POST/GET/PATCH/DELETE /budgets` per `api-spec.md` §14.
- **Tests**: uniqueness at both the service and raw-Prisma-constraint layers; **boundary-value
  tests at exactly 89.99%/90.00%/100.00%/100.01% of budget** per `testing-strategy.md` §17 — the
  priority test in this phase, since off-by-one threshold bugs are the classic failure mode here.
- **Acceptance criteria**: matches `api-spec.md` §14 exactly, including status embedded directly
  in the list response (no separate status endpoint, per `api-spec.md`'s decision).
- **Risks**: the budget-status classification function should be extracted as a pure,
  unit-testable function (`classifyBudgetStatus`) per `testing-strategy.md` §3/§4 rather than
  inlined — worth confirming in review.
- **Required human approvals**: migration confirmation for the new `Budget` table.
- **Commit/PR boundary**: `feat: budget CRUD and status calculation (FR-18–FR-20)`.

## Phase 10 — Category Deletion-with-Reassignment

- **Objective**: the single most cross-cutting, highest-risk feature in the system, correctly
  sequenced now that Expense, Income, and Budget all exist with real data to reassign.
- **Requirement IDs**: FR-17a.1, FR-17a.2, FR-17a.3, FR-17a.4, FR-17a.5, BR-3.2, BR-4, DI-2, DI-3.
- **Dependencies**: Phase 6 (categories), Phase 7 (expenses), Phase 8 (income), Phase 9
  (budgets) — all four must exist; this is why `requirements.md` §8 places this rule last among
  the ledger features.
- **Files/modules**: extends `src/modules/categories/` with the transactional
  reassign-and-delete service function.
- **Database changes**: none new (all four tables already exist); this phase is pure
  service-layer logic wrapped in a `$transaction`.
- **API changes**: `POST /categories/:id/reassign-and-delete` per `api-spec.md` §11.
- **Tests**: the priority test from `testing-strategy.md` §16 — the FR-17a.4 conflict case must
  assert **nothing changed at all** on rejection (not just that an error was returned); the happy
  path verified by querying afterward, not just by response status; the in-transaction re-check
  (not the full concurrent race, per `testing-strategy.md`'s TQ-2 resolution).
- **Acceptance criteria**: matches `api-spec.md` §11 and `architecture.md` §15's exact
  transactional sequence; DI-3's atomicity is demonstrably true under test, not just assumed.
- **Risks**: the highest-risk phase in the whole plan — explicitly called out as such in
  `architecture.md` §23 and `testing-strategy.md` §16. Budget for extra review time; a good
  candidate for the most thorough `/code-review` and `/security-review` passes in the project so
  far.
- **Required human approvals**: none beyond standing rules (no schema change) — but this phase's
  `/code-review` pass should be treated as non-optional even if other phases' were ever
  informally skipped.
- **Commit/PR boundary**: `feat: category deletion with atomic reassignment (FR-17a)`.

## Phase 11 — Dashboard

- **Objective**: the single combined summary endpoint.
- **Requirement IDs**: FR-21.1, FR-21.2, FR-21.3, FR-22.
- **Dependencies**: Phase 7 (expenses), Phase 8 (income), Phase 9 (budgets) — a read-only
  aggregator over all three, per `architecture.md` §5's "Insights" domain.
- **Files/modules**: new `src/modules/dashboard/` — calls `expenses`/`income`/`budgets`' exported
  service functions only, never raw Prisma queries against their tables (`architecture.md` §21).
- **Database changes**: none — aggregation queries only (`aggregate`/`groupBy`, not in-memory
  summing, per `architecture.md` §11).
- **API changes**: `GET /dashboard` per `api-spec.md` §15.
- **Tests**: totals match a manually-computed sum over seeded current-month data; out-of-month
  records excluded; a money-precision aggregation test (DI-5) specifically targeting the
  summation layer.
- **Acceptance criteria**: matches `api-spec.md` §15's response shape exactly; response time
  within NFR-1's 500ms target under seeded "few thousand records" data (the lightweight
  performance check from `testing-strategy.md` §27).
- **Risks**: low — mostly a composition of already-tested lower-level service functions; the main
  risk is accidentally querying another module's table directly instead of going through its
  service function (`architecture.md` §21's rule).
- **Required human approvals**: none beyond standing rules.
- **Commit/PR boundary**: `feat: dashboard summary endpoint (FR-21, FR-22)`.

## Phase 12 — Reports

- **Objective**: the two report endpoints.
- **Requirement IDs**: FR-23.1, FR-23.2, FR-24.1, FR-24.2.
- **Dependencies**: Phase 7 (expenses), Phase 8 (income) — same "Insights" domain as Dashboard.
- **Files/modules**: new `src/modules/reports/`.
- **Database changes**: none — aggregation only.
- **API changes**: `GET /reports/spending-by-category`, `GET /reports/income-vs-expense` per
  `api-spec.md` §16, using the calendar-aligned period definitions already documented there
  (this_month/last_month/last_3_months/this_year).
- **Tests**: each of the four presets tested with seeded data at period boundaries
  (`testing-strategy.md` §18) — the highest-value tests in this phase, since boundary-off-by-one
  errors are exactly what this area is prone to.
- **Acceptance criteria**: matches `api-spec.md` §16 exactly; boundary tests pass for all four
  presets; performance check per NFR-1 (`testing-strategy.md` §27).
- **Risks**: low-to-moderate — the period-boundary math is subtle enough to warrant the dedicated
  boundary tests called out above; otherwise a straightforward aggregation feature.
- **Required human approvals**: none beyond standing rules.
- **Commit/PR boundary**: `feat: spending-by-category and income-vs-expense reports (FR-23,
FR-24)`.

## Phase 13 — Settings: Profile, Currency, Timezone, Password

- **Objective**: the remaining account-settings endpoints that don't involve re-verification.
- **Requirement IDs**: FR-25.1, FR-25.2, FR-26.1, FR-26.2, FR-26.3, FR-27, BR-2, DI-6.
- **Dependencies**: Phase 7, 8, 9 (Expense/Income/Budget tables must exist for FR-26.2's
  currency-lock check to be meaningful) — does **not** depend on Phases 10–12, so it could be
  reordered earlier if convenient during actual implementation.
- **Files/modules**: new `src/modules/users/`.
- **Database changes**: none (uses Phase 1's `User` table fields already defined in
  `database-design.md` §14).
- **API changes**: `GET/PATCH /users/me`, `PATCH /users/me/currency`, `PATCH
/users/me/timezone`, `POST /auth/change-password` per `api-spec.md` §9–§10 and §3–§8.
- **Tests**: currency-lock tested independently for each of the three record types (an expense
  alone locks it, an income alone locks it, a budget alone locks it) per `testing-strategy.md`
  §15; timezone change does not retroactively reinterpret existing dates
  (`testing-strategy.md` §14's explicit regression test).
- **Acceptance criteria**: matches `api-spec.md` §9–§10 exactly; the currency-lock and
  timezone-immutability-of-past-dates behaviors are both under explicit test, not just implied.
- **Risks**: the currency-lock check must query all three tables (Expense/Income/Budget) — worth
  confirming it's a real existence check, not accidentally scoped to only one table.
- **Required human approvals**: none beyond standing rules.
- **Commit/PR boundary**: `feat: profile, currency, timezone, and password settings
(FR-25.1–25.2, FR-26, FR-27)`.

## Phase 14 — Email Change

- **Objective**: the request/confirm email-change flow, isolated from Phase 13 because of its
  re-verification and collision-check nuances.
- **Requirement IDs**: FR-25.3, FR-25.4, FR-25.5.
- **Dependencies**: Phase 2 (verification-token infrastructure), Phase 13 (the `users` module it
  extends).
- **Files/modules**: extends `src/modules/auth/` (token issuance, reusing the `EMAIL_CHANGE`
  type) and `src/modules/users/` (the `pendingEmail` field).
- **Database changes**: none new (`User.pendingEmail` and the `VerificationToken` type
  discriminator already exist from Phase 1).
- **API changes**: `POST /auth/email-change/request`, `POST /auth/email-change/confirm` per
  `api-spec.md` §3–§8.
- **Tests**: the SA-2 collision check specifically — a request to an email already registered or
  already pending for another user fails **at request time**, before any email is sent
  (`testing-strategy.md` §13); a second request before the first is confirmed replaces the
  pending token; the old email keeps working for login until confirmation.
- **Acceptance criteria**: matches `api-spec.md`'s documented flow exactly; the request-time
  collision check (not deferred to confirmation) is under explicit test.
- **Risks**: low — small in scope, but the collision-check timing is easy to get subtly wrong
  (checking only `User.email` and forgetting `User.pendingEmail`, or vice versa).
- **Required human approvals**: none beyond standing rules.
- **Commit/PR boundary**: `feat: email change request/confirm flow (FR-25.3–25.5)`.

## Phase 15 — Cross-Cutting Hardening & Release Readiness

- **Objective**: close out anything that only makes sense once the full feature set exists — full
  traceability audit, dependency/security scanning wired into CI, performance spot-checks across
  all read-heavy endpoints, documentation sync.
- **Requirement IDs**: none new — this phase verifies coverage of everything already built
  (NFR-1, NFR-2, NFR-5 specifically).
- **Dependencies**: all prior phases.
- **Files/modules**: CI workflow finalization, `README.md`.
- **Database changes**: none.
- **API changes**: none.
- **Tests**: a full audit pass confirming every FR/BR/SEC/DI ID in `requirements.md` has at least
  one matching test title (`testing-strategy.md` §24/§30's traceability convention) — any gap
  found here is fixed before this phase closes, not deferred.
- **Acceptance criteria**: `npm audit`/Dependabot wired into CI (`testing-strategy.md` §28); a
  `/security-review` pass across all auth/CSRF/token code; `README.md` reflects actual setup/run
  instructions (`development-workflow.md` §22); the full test suite green in CI.
- **Risks**: the temptation to treat this as optional busywork — it's the phase that actually
  makes the traceability discipline this whole project maintained verifiable rather than
  aspirational.
- **Required human approvals**: none beyond standing rules; this is the natural point to consider
  `development-workflow.md` §24's "ready to release" checklist, though the hosting decision
  itself remains explicitly deferred per that document.
- **Commit/PR boundary**: `chore: traceability audit, security/dependency scanning, and
documentation sync`.

## Next Step

Each phase begins its own Plan Mode cycle per `development-workflow.md` §2 when implementation is
ready to start it, beginning with Phase 0.
