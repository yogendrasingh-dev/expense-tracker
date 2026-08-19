# Expense Tracker — Implementation Plan

Status: Draft v2 (restructured into a 7-phase learning-oriented roadmap)
Owner: Yogendra Singh
Last updated: 2026-08-19
Source: `CLAUDE.md`, `docs/product-spec.md`, `docs/requirements.md`, `docs/architecture.md`,
`docs/database-design.md`, `docs/api-spec.md`, `docs/testing-strategy.md`,
`docs/development-workflow.md` — all approved

## Purpose & Scope

This is the master roadmap from finalized specification to working code, restructured from an
original 16-phase breakdown into 7 coarser phases — including a dedicated "Claude Code Advanced
Lab" phase — while preserving every requirement ID and every architectural, database, API, and
testing decision unchanged. No application code, Node.js project initialization, Prisma models, or
migrations beyond what Phase 0 already completed are created by this document — it is a plan only.
No other specification document is modified by this plan.

## Old → New Phase Mapping (nothing dropped, only regrouped)

This project was originally planned as 16 phases. That plan has been consolidated into the 7
phases below — every requirement ID from the original plan appears in exactly one new phase; none
were dropped, and no scope, architecture, database, API, or testing decision changed.

| New Phase | Absorbs Original Phase(s) | Requirement IDs Carried Over |
|---|---|---|
| **0 — Project Bootstrap** | Original Phase 0 (unchanged, already complete) | none (infra) |
| **1 — Database + Testing Foundation** | Original Phase 1 | schema support for FR-1.1–1.5, FR-6, FR-2.1–2.4, FR-3.4–3.5, FR-5.1–5.4, FR-15.1–FR-17, SEC-1/3/6/8, DI-2 |
| **2 — Claude Code Advanced Lab** | *(new — no original phase)* | none (meta/tooling, not product scope) |
| **3 — Authentication** | Original Phase 2 (shared infra) + Phase 3 (registration+seeding+verification) + Phase 4 (login/logout/refresh) + Phase 5 (password reset) | FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, SEC-1/2/3/4/6/7/8, BR-6 |
| **4 — Core Expense Domain** | Original Phase 6 (categories CRUD) + Phase 7 (expenses) + Phase 8 (income) + Phase 9 (budgets) + Phase 10 (category reassignment) | FR-7–FR-14, FR-15.1, FR-16, FR-17, FR-17a.1–17a.5, FR-18–FR-20, BR-1, BR-3, BR-4, BR-5, BR-8, DI-1, DI-2, DI-3 |
| **5 — Dashboard, Reports & Settings** | Original Phase 11 (dashboard) + Phase 12 (reports) + Phase 13 (settings) + Phase 14 (email change) | FR-21–FR-24, FR-25, FR-26, FR-27, BR-2, DI-6 |
| **6 — Hardening, CI/CD & Release** | Original Phase 15 | none new — verifies NFR-1, NFR-2, NFR-5 coverage; adds release/rollback readiness per `development-workflow.md` §24–§25 |

## Cross-Cutting Principles

- **Respect the build order** (`requirements.md` §8, `architecture.md` §21): Auth → Categories →
  Expenses/Income → Budgets → Dashboard/Reports, with `shared` cross-cutting infrastructure built
  *before* the first feature that needs it. This ordering is unchanged — only the phase-number
  labels grouping this work changed.
- **Category deletion-with-reassignment (FR-17a) is still sequenced after Expenses, Income, and
  Budgets all exist** within Phase 4, per `requirements.md` §8's explicit dependency note.
- **FR-6 (default-category seeding) is implemented in full within Phase 3**, atomically with
  registration, per `architecture.md` §12 — not deferred.
- **Plan Mode vs. execution mode is unchanged** (`CLAUDE.md` §4/§5) and applies *within* every
  phase, not per-phase: complex/risky tasks (new features, schema changes, architectural
  deviations) use Plan Mode; mechanical, already-approved, or low-risk work (implementing an
  approved plan, fixing an identified bug, linter fixes) uses execution mode. Consolidating to 7
  phases does not mean each phase is one giant Plan Mode cycle — each phase still decomposes into
  the same small, independently reviewable tasks/PRs the original 16-phase plan used.
- **Token efficiency is an explicit learning objective.** Not every mechanical task needs a full
  Plan Mode cycle. Judgment about when a quick, direct execution-mode fix is appropriate versus
  when a change is big/risky/ambiguous enough to warrant Plan Mode is a skill deliberately
  practiced throughout this roadmap, starting with Phase 2's lab work.
- **Database, API, architecture, and testing rules are unchanged.** This restructuring only
  regroups *when* things get built, never *what* gets built or *how* — every cascade rule, status
  threshold, error code, and test-boundary decision from the six approved specification documents
  carries over verbatim.
- Every phase, without exception, still requires: a Plan Mode plan approved before starting
  (`CLAUDE.md` §5/§21), explicit approval for any new dependency it introduces (`CLAUDE.md` §7),
  and an AI-assisted `/code-review` pass before merge (`CLAUDE.md` §17). Phases that touch the
  schema additionally require the dedicated migration-confirmation step (`CLAUDE.md` §18).

## Phase 0 — Project Bootstrap

**Status: ✅ Completed.** Committed as `6568e5e` (`chore: project scaffolding and tooling setup`),
plus the code-review remediations recorded in `docs/phases/phase-0.md`. Package configuration,
TypeScript, linting, formatting, Vitest, Prisma tooling (schema-only), Docker Compose Postgres, CI
skeleton, and a Fastify app shaped for `.inject()`/`.ready()` testability. No product requirement
(FR/BR/SEC/DI) was implemented — pure infrastructure. See `docs/phases/phase-0.md` for the full
completion record, including the code-review pass and fixes applied.

## Phase 1 — Database + Testing Foundation

- **Objective**: stand up the first four Prisma models with no cross-dependency on ledger data, and
  prove out the automated-testing infrastructure (Testcontainers, raw-Prisma constraint tests) that
  every later phase relies on.
- **Scope**: `User`, `RefreshToken`, `VerificationToken`, `Category` models; the first Prisma
  migration; Testcontainers wiring for integration tests; database constraint tests.
- **Requirement IDs**: schema support for FR-1.1–1.5, FR-6, FR-2.1–2.4, FR-3.4–3.5, FR-5.1–5.4,
  FR-15.1–FR-17, SEC-1/3/6/8; DI-2 (Category FK).
- **Dependencies**: Phase 0.
- **Main files/modules**: `prisma/schema.prisma` (all four models), first migration, a
  Testcontainers setup helper for integration tests.
- **Database changes**: `CREATE TABLE` for all four — UUID PKs; `User.email` unique;
  `RefreshToken.tokenHash`/`familyId`; `VerificationToken.tokenHash`/`type` discriminator;
  `Category (userId, normalizedName)` unique; all FKs to `User` as `Cascade`
  (`database-design.md` §4–§9, §14, §20). Category's `Restrict`-to-children FKs come later, in
  Phase 4, once Expense/Income/Budget exist.
- **API changes**: none.
- **Testing**: raw-Prisma constraint tests (`testing-strategy.md` §6) — `User.email` uniqueness,
  `RefreshToken.tokenHash`/`VerificationToken.tokenHash` uniqueness, `Category` case-insensitive
  name uniqueness, `User`-delete cascades to all four tables. This is also where the
  Testcontainers-provisioned Postgres pattern (`testing-strategy.md` §5) is established for every
  later integration test to reuse.
- **Acceptance criteria**: migration applies cleanly to a fresh Testcontainers database; all
  constraint tests pass; the Testcontainers setup pattern is documented/reusable for later phases.
- **Learning goals for Claude Code**: none specific — a normal implementation cycle (Plan Mode for
  the schema design review, execution mode for routine constraint-test writing).
- **Commit/PR boundary**: `feat: add User, token, and Category schema (DB + testing foundation)`.

## Phase 2 — Claude Code Advanced Lab

- **Objective**: deliberately pause feature development to build hands-on fluency with Claude
  Code's advanced capabilities, using this project's real codebase as the practice ground, before
  the bulk of remaining feature work. This phase has no product-feature output — it is the
  explicit "learn Claude Code deeply" checkpoint this project has been building toward.
- **Scope**: custom subagents, MCP, hooks, plugins, and skills — each explored and exercised on a
  real, small task connected to this repo, not in the abstract.
- **Requirement IDs**: none — meta/tooling phase, not product scope.
- **Dependencies**: Phase 1 (a real schema/codebase makes the exercises meaningful — e.g., a
  subagent reviewing a migration needs a migration to review).
- **Main files/modules**: `.claude/agents/*.md` (custom subagent definitions),
  `.claude/skills/*/SKILL.md` (custom skill(s)), `.claude/settings.json` (hook configuration), MCP
  server configuration (`.mcp.json` or equivalent) — none of this is application code; all of it is
  Claude Code configuration.
- **Database changes**: none.
- **API changes**: none.
- **Testing**: not the FR/BR/SEC/DI test pyramid — "testing" here means demonstrating each
  capability actually works: invoking the custom subagent for a real task and getting useful
  output; calling an MCP tool and getting real data back; triggering a configured hook and
  observing it fire; installing/exploring a plugin; invoking the custom skill and confirming it
  behaves as authored.
- **Acceptance criteria**: at least one custom subagent created and used for a real task in this
  project; at least one MCP server connected and exercised; at least one hook configured in
  `.claude/settings.json` and observed firing; at least one plugin explored or installed; at least
  one project-specific skill authored and invoked — each demonstrated in actual use, not merely
  configured and left untested.
- **Learning goals for Claude Code** (this phase's entire point): when to fork/spawn a subagent
  vs. do the work directly; how MCP tool discovery differs from a shell command and when it's the
  better choice; hook event types and `settings.json` wiring; the plugin marketplace and
  installation flow; authoring a `SKILL.md` (structure, triggers) vs. ad hoc prompting; and,
  cutting across all of the above, practicing the judgment call from this document's
  token-efficiency principle — deciding per exercise whether a quick execution-mode attempt is
  enough or whether Plan Mode is warranted.
- **Commit/PR boundary**: several small commits, one per capability explored (e.g.,
  `chore: add project-specific code-review subagent`, `chore: connect Postgres MCP server`,
  `chore: add pre-tool-use hook for X`, `chore: add custom skill for Y`) rather than one large PR —
  consistent with keeping each unit of work small and independently reviewable.

## Phase 3 — Authentication

- **Objective**: the complete authentication feature set, end to end — shared auth infrastructure,
  registration with default-category seeding, email verification, login/logout, refresh-token
  rotation with reuse detection, and password reset.
- **Scope**: everything under `src/modules/auth/`, plus the `shared` cross-cutting infrastructure
  (error handling, Zod wiring, JWT/ownership-guard middleware, CSRF, rate limiting, `EmailSender`
  stub, money and timezone utilities) that this and every later feature phase depends on.
- **Requirement IDs**: FR-1.1–1.5, FR-6, FR-2.1–2.4, FR-3.1–3.5, FR-4, FR-5.1–5.4, SEC-1, SEC-2,
  SEC-3, SEC-4, SEC-6, SEC-7, SEC-8, BR-6.
- **Dependencies**: Phase 1 (schema).
- **Main files/modules**: `src/shared/errors/`, `src/shared/money/`, `src/shared/time/`
  (injectable clock, per `testing-strategy.md` §14), `src/shared/auth/` (JWT verify, ownership
  guard, CSRF, rate limit), `src/shared/email/`, `src/modules/auth/` (register, verify-email,
  resend-verification, login, logout, refresh, password-reset).
- **Database changes**: none new (uses Phase 1's tables).
- **API changes**: `POST /auth/register`, `POST /auth/verify-email`, `POST
  /auth/resend-verification`, `POST /auth/login`, `POST /auth/logout`, `POST /auth/refresh`, `POST
  /auth/password-reset/request`, `POST /auth/password-reset/confirm` (`api-spec.md` §3–§8).
- **Testing**: password-length policy (unit); registration atomically seeding default categories
  (integration); verification/reset token lifecycle — valid/expired/used/wrong-type; no-enumeration
  assertions on login and password-reset (identical responses for wrong-password vs. unknown-email,
  and for existing vs. non-existing email); full refresh-rotation cycle with reuse detection
  asserting the entire token family, including the newest token, is revoked; logout-then-refresh
  rejection (`testing-strategy.md` §8, §12, §13).
- **Acceptance criteria**: the complete auth flow — register → login while unverified (BR-6
  permits this) → call an authenticated endpoint → verify → refresh → logout → confirm the token
  chain is fully rejected, including a replay of an already-rotated refresh token.
- **Learning goals for Claude Code**: this is the first phase with genuinely security-sensitive
  logic (token rotation, reuse detection) — a good candidate for practicing when to escalate to
  Plan Mode + the `/security-review` skill versus when a narrower, execution-mode fix is
  appropriate for a small, already-understood piece of the auth flow.
- **Commit/PR boundary**: multiple PRs within this phase — `feat: shared auth, validation, and
  error-handling infrastructure`, `feat: registration with default-category seeding and email
  verification (FR-1, FR-2, FR-6)`, `feat: login, logout, and refresh-token rotation with reuse
  detection (FR-3, FR-4)`, `feat: password reset (FR-5)` — the phase groups them for planning
  purposes; each is still its own small, reviewable unit.

## Phase 4 — Core Expense Domain

- **Objective**: the heart of the product — categories, expenses, income, budgets, and the
  highest-risk cross-cutting feature in the system, category deletion-with-reassignment — built and
  reviewed as a connected sequence, in the dependency order `requirements.md` §8 requires.
- **Scope**: Categories CRUD (including the default-category seed helper's consumers), Expenses
  CRUD, Income CRUD, Budgets CRUD + status calculation, and category deletion-with-reassignment —
  the last of these deliberately built *after* the other four, since it needs real
  expense/income/budget data to reassign.
- **Requirement IDs**: FR-15.1, FR-16, FR-17, FR-7.1–7.5, FR-8.1–8.3, FR-9, FR-10, FR-11.1–11.5,
  FR-12.1–12.3, FR-13, FR-14, FR-18.1–18.3, FR-19.1–19.2, FR-20.1–20.2, FR-17a.1–17a.5, BR-1, BR-3,
  BR-4, BR-5, BR-8, DI-1, DI-2, DI-3.
- **Dependencies**: Phase 3 (authenticated, verified users must exist before any of this is
  reachable).
- **Main files/modules**: `src/modules/categories/`, `src/modules/expenses/`,
  `src/modules/income/`, `src/modules/budgets/`.
- **Database changes**: `CREATE TABLE Expense`, `CREATE TABLE Income` (`NUMERIC(12,2)` amounts
  with `CHECK (amount > 0)`, `DATE` business dates, `Restrict` FKs from Category — established
  here for the first time), `CREATE TABLE Budget` (`UNIQUE (userId, categoryId, month)`, same
  `Restrict` pattern) — per `database-design.md` §4–§12.
- **API changes**: `POST/GET/GET :id/PATCH/DELETE /categories` (non-reassignment), `POST
  /categories/:id/reassign-and-delete`, `POST/GET/GET :id/PATCH/DELETE /expenses`,
  `POST/GET/GET :id/PATCH/DELETE /income`, `POST/GET/PATCH/DELETE /budgets` (`api-spec.md`
  §11–§14).
- **Testing**: category name uniqueness and last-category-deletion rejection; the
  timezone-boundary tests from `testing-strategy.md` §14 (an expense dated "today" in the user's
  timezone at a UTC-tomorrow moment must succeed, and vice versa) — exercised for real for the
  first time here; budget-status boundary-value tests at exactly 89.99%/90.00%/100.00%/100.01%
  (`testing-strategy.md` §17); and the single most important transactional test in the whole
  project — the FR-17a.4 conflict case, which must assert nothing changed at all on rejection, not
  just that an error was returned (`testing-strategy.md` §16).
- **Acceptance criteria**: every endpoint in `api-spec.md` §11–§14 behaves exactly as documented;
  DI-3's atomicity for category reassignment is demonstrably true under test; budget status
  boundaries are exact.
- **Learning goals for Claude Code**: this phase's category-reassignment work is the best candidate
  in the whole roadmap for a deliberate, unhurried Plan Mode cycle plus the most thorough
  `/code-review` pass so far — a good contrast case against Phase 2's lab exercises on when *not*
  to rush past Plan Mode.
- **Commit/PR boundary**: one PR per sub-feature — `feat: category CRUD (FR-15.1, FR-16, FR-17)`,
  `feat: expense CRUD (FR-7–FR-10)`, `feat: income CRUD (FR-11–FR-14)`, `feat: budget CRUD and
  status calculation (FR-18–FR-20)`, `feat: category deletion with atomic reassignment (FR-17a)` —
  five PRs, grouped under one phase for planning purposes, built and reviewed in that order.

## Phase 5 — Dashboard, Reports & Settings

- **Objective**: the read-only "Insights" surfaces (dashboard, reports) and the remaining
  account-settings functionality (profile, currency, timezone, password, email change).
- **Scope**: `GET /dashboard`; the two report endpoints; profile/currency/timezone/password
  settings; the email-change request/confirm flow.
- **Requirement IDs**: FR-21.1–21.3, FR-22, FR-23.1–23.2, FR-24.1–24.2, FR-25.1–25.5, FR-26.1–26.3,
  FR-27, BR-2, DI-6.
- **Dependencies**: Phase 4 (dashboard/reports aggregate Expense/Income/Budget data; the
  currency-lock check in Settings needs those tables to exist to check against).
- **Main files/modules**: `src/modules/dashboard/`, `src/modules/reports/`, `src/modules/users/`
  (extends `src/modules/auth/` for the email-change token flow).
- **Database changes**: none new — dashboard/reports are aggregation-only (`aggregate`/`groupBy`,
  never in-memory summing, per `architecture.md` §11); settings uses Phase 1's `User` fields.
- **API changes**: `GET /dashboard`, `GET /reports/spending-by-category`, `GET
  /reports/income-vs-expense`, `GET/PATCH /users/me`, `PATCH /users/me/currency`, `PATCH
  /users/me/timezone`, `POST /auth/change-password`, `POST /auth/email-change/request`, `POST
  /auth/email-change/confirm` (`api-spec.md` §9–§10, §15–§16).
- **Testing**: dashboard totals matching a manual sum over seeded current-month data; the four
  report presets tested at period boundaries (calendar-aligned, per `api-spec.md` §16); a
  money-precision aggregation test (DI-5); currency-lock tested independently per record type;
  timezone change not retroactively reinterpreting existing dates; the email-change collision check
  firing at request time, not deferred to confirmation (`testing-strategy.md` §13, §15, §18).
- **Acceptance criteria**: every endpoint in `api-spec.md` §9–§10, §15–§16 behaves exactly as
  documented; NFR-1's 500ms performance check (`testing-strategy.md` §27) passes for dashboard and
  reports.
- **Learning goals for Claude Code**: mostly mechanical, well-understood composition work (the
  underlying data already exists and is tested from Phase 4) — a good phase to practice staying in
  execution mode for the more repetitive pieces (e.g., mirroring the reports across two similar
  endpoints) while still using Plan Mode for the email-change collision-check nuance.
- **Commit/PR boundary**: `feat: dashboard summary endpoint (FR-21, FR-22)`, `feat:
  spending-by-category and income-vs-expense reports (FR-23, FR-24)`, `feat: profile, currency,
  timezone, and password settings (FR-25.1–25.2, FR-26, FR-27)`, `feat: email change
  request/confirm flow (FR-25.3–25.5)` — four PRs under one phase.

## Phase 6 — Hardening, CI/CD & Release

- **Objective**: close out everything that only makes sense once the full feature set exists, and
  prepare the project for a real release — without picking a hosting platform, which
  `development-workflow.md` §24 explicitly keeps as its own, separately deferred decision.
- **Scope**: full requirement-to-test traceability audit; dependency/security scanning in CI;
  performance spot-checks; a `/security-review` pass across all auth/CSRF/token code; documentation
  sync; release-readiness and rollback preparation per the process `development-workflow.md`
  §24–§25 already defines (versioning, "ready to release" criteria, git-revert-based rollback) —
  not a new infrastructure decision.
- **Requirement IDs**: none new — verifies coverage of NFR-1, NFR-2, NFR-5 across everything
  already built.
- **Dependencies**: all prior phases.
- **Main files/modules**: CI workflow finalization (`.github/workflows/ci.yml`), `README.md`.
- **Database changes**: none.
- **API changes**: none.
- **Testing**: a full audit pass confirming every FR/BR/SEC/DI ID in `requirements.md` has at
  least one matching test title (`testing-strategy.md` §24/§30); any gap found is fixed before this
  phase closes.
- **Acceptance criteria**: `npm audit`/Dependabot wired into CI; `/security-review` pass
  completed; `README.md` reflects real setup/run instructions; full test suite green in CI; a
  release checklist (versioning + Definition of Done + docs-in-sync, per `development-workflow.md`
  §24) is satisfied for a first tagged release, with the hosting/deployment target explicitly still
  marked as a separate, future decision.
- **Learning goals for Claude Code**: a natural point to reflect on the whole project's Plan Mode
  / execution-mode judgment calls in retrospect — which ones were worth it, which could have been
  faster — closing the loop on the token-efficiency learning objective stated up front.
- **Commit/PR boundary**: `chore: traceability audit, security/dependency scanning, and
  documentation sync`.

## Next Step

Each phase's actual implementation begins its own Plan Mode cycle per `development-workflow.md`
§2 when work on it starts, beginning with Phase 1.
