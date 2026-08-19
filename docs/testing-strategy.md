# Expense Tracker — Testing Strategy

Status: Draft v1
Owner: Yogendra Singh
Last updated: 2026-08-18
Source: `docs/product-spec.md` (v1), `docs/requirements.md` (v2), `docs/architecture.md` (v1),
`docs/database-design.md` (v1), `docs/api-spec.md` (v1) — all approved
Scope: **backend testing only** — no frontend/browser end-to-end testing is designed here, since
no frontend specification exists yet.

## Purpose & Scope

This document turns architecture.md §18's testing boundaries and api-spec.md §29's per-endpoint
testing notes into a complete, systematic strategy: tooling, test-database strategy, isolation,
coverage policy, and — most importantly — explicit, deliberate test coverage for every
cross-cutting risk area the prior documents flagged (category-reassignment atomicity,
refresh-token reuse detection, timezone boundaries, currency lock). It introduces no new product
feature and writes no application code; it defines how the already-approved system will be
verified.

Five genuine testing-strategy questions could not be derived from the five approved documents and
were resolved with the product owner before this document was finalized; they're called out inline
and summarized in the Appendix.

## 1. Testing Goals

- Every business rule and data-integrity constraint (BR-_, DI-_) is verified automatically, not
  manually — directly serves NFR-5.
- Every requirement ID (FR/BR/SEC/DI) has at least one test that can be pointed to (§24, §30).
- The cross-cutting flows architecture §23 explicitly flagged as risky — category-deletion
  transactionality, refresh-token reuse detection, the currency-lock race, timezone boundaries —
  get first-class, deliberate test coverage, not incidental coverage.
- Fast local feedback (unit tests in watch mode) plus a reliable CI gate (integration/route tests)
  — supports architecture §1's "built for testability first" goal.

## 2. Test Pyramid

Extends architecture §18's three layers:

- **Unit** (base, most numerous, fastest, no I/O) — pure business-rule functions.
- **Integration** (middle) — service-layer functions against a real test Postgres via Prisma, per
  architecture §18's explicit "not mocked" decision.
- **Route/API-level (contract)** (top, fewest, slowest) — black-box HTTP via Fastify `inject()`.

No browser/UI end-to-end layer — out of scope. Guiding principle: push each test as far down the
pyramid as it can go while remaining meaningful. A route test confirms wiring (validation →
service → response/error mapping); it does not re-verify a business rule already covered by a unit
or integration test for that rule.

## 3. Unit Testing Strategy

Pure, I/O-free functions: budget-status classification (FR-20.2), amount validation (BR-1),
password-length policy (FR-1.3), timezone/date-boundary math (architecture §13's shared utility),
category-name normalization (FR-15.1/FR-16), and decimal/money arithmetic helpers (DI-5).

**Test runner: Vitest** — fast, native TypeScript/ESM support, a Jest-compatible API (low learning
curve), and strong watch-mode developer experience.

## 4. Service/Business-Rule Testing

Wherever a business rule can be extracted into a pure function independent of Prisma (e.g. a
standalone `classifyBudgetStatus(spent, budgeted)`), it is — and unit-tested directly. The service
function that orchestrates the surrounding Prisma calls is integration-tested instead. This
maximizes fast unit coverage of business-rule correctness while keeping integration tests focused
on "does this actually persist and interact with the database correctly."

## 5. Integration Testing Strategy

Service-layer functions run against a real, ephemeral Postgres via Prisma — never mocked
(architecture §18).

- **Test database infrastructure: Testcontainers.** Each test run spins up a fresh, throwaway
  Postgres container and tears it down afterward. Zero manual setup — the suite runs as long as
  Docker is available — and every run starts from a guaranteed-clean database.
- **Isolation between tests: truncate all tables between tests**, via a helper that clears every
  table in FK-safe order before each test, rather than a transaction-per-test rollback wrapper.
  Several service functions run their own internal transactions (FR-17a.5, FR-3.5); wrapping the
  whole test in an outer transaction risks awkward interaction with Prisma's
  nested-transaction/savepoint handling. Truncation is simpler and correct regardless of what the
  code under test does internally.

## 6. PostgreSQL/Prisma Database Testing

- Test databases are created from the real Prisma schema (`prisma migrate deploy` or `db push`),
  so constraints are exercised for real, not simulated.
- **Explicit constraint tests**, bypassing the service layer entirely, confirm each database-level
  constraint actually fires: a duplicate `(userId, categoryId, month)` budget insert (DI-1), a
  duplicate case-insensitive category name (FR-15.1's uniqueness), and a raw delete of a Category
  with existing Expense rows attached, which must be rejected by the `Restrict` foreign key (DI-2)
  independent of the application ever having a bug.
- A schema-level test confirms `User` deletion cascades correctly to every child table — cheap
  insurance for a decision (database-design.md §9) made ahead of the feature it supports (DI-4)
  actually being built.

## 7. API/Route Testing

Black-box HTTP via Fastify's `inject()`, per api-spec.md §29. Each endpoint gets: a happy path
(response matches its documented schema), each documented error code for that endpoint, and
auth/ownership/verification gating. Route tests deliberately do not re-verify business-rule edge
cases already covered by unit/integration tests for that rule (§2) — they confirm the HTTP layer
wires things correctly.

## 8. Authentication Testing

- Registration: full happy path (account + timezone + default categories created atomically —
  FR-1.1/1.5/6), duplicate email (`409`), password below the 12-character minimum (`400`).
- Login: correct credentials succeed and set the three cookies; **wrong password and unknown email
  produce the identical error**, explicitly asserted — this is what actually verifies FR-3.2's
  no-enumeration rule, not merely that invalid logins are rejected.
- Email verification: valid token succeeds; expired or already-used token fails.
- Logout: revokes the token family; a subsequent refresh attempt fails.
- Password-reset request: asserted to return the identical response for an existing and a
  non-existing email — the same enumeration-focused testing principle as login.

## 9. Authorization and Ownership Testing

A systematic, table-driven test matrix, not spot-checks: for each of the four owned resource types
(Expense, Income, Category, Budget) × the relevant verbs (GET/PATCH/DELETE on `:id`, plus list
scoping), create the resource as User A and attempt the operation as User B — assert `404` every
time, never `403`, never a differentiated message (SEC-2). Separately: unverified-user write
attempts on all four resource types assert `403 ACCOUNT_UNVERIFIED`; reads by the same unverified
user still succeed.

## 10. CSRF Testing

- A mutating request with a valid session cookie but a missing or mismatched `X-CSRF-Token` header
  → `403 CSRF_TOKEN_INVALID`.
- A mutating request with a correctly matching header and cookie → succeeds.
- `GET` requests succeed with no CSRF header present at all.
- The CSRF-exempt endpoints (`register`, `login`, `refresh`, and the token-based public
  confirmations) succeed with no CSRF header — tested explicitly as exemptions.

## 11. Rate-Limit Testing

- Triggering the limit doesn't require waiting out the 15-minute window: sending 6 rapid requests
  to `login`/`register`/`password-reset/request`/`email-change/request`/`resend-verification`
  within milliseconds already falls inside one window, so the 6th request is rate-limited (`429`
  with `Retry-After`) with no time manipulation needed.
- Verifying that the limit _resets_ after the window elapses is lower-value and needs fake
  timers — included only if convenient, not required coverage.
- The rate limiter's state resets between test files/suites to prevent cross-test leakage.

## 12. Token Rotation and Refresh-Token Reuse-Detection Testing

- Refresh with a valid, unused token → a new access/refresh pair is issued; the old token is
  marked used.
- Refresh again with that same now-used token → reuse detected, `401`, and the **entire token
  family is revoked**, including the most-recently-issued "current" token, not just the replayed
  one — explicitly asserted, since the whole point of SEC-8 is that the _latest_ token also stops
  working immediately after a replay.
- Logout revokes the current family; a refresh attempt afterward fails.

## 13. Email Verification/Reset/Email-Change Testing

- Verify-email: valid → success; expired → fail; already-used → fail; a `PASSWORD_RESET`-typed
  token presented to the verify-email endpoint → fail — this specifically proves the unified
  `VerificationToken` table's `type` discriminator (database-design.md's SA-1) is enforced in code,
  not merely assumed from the schema.
- Password reset: request→confirm happy path; expired/used/mismatched token fails; reusing an
  already-used token fails.
- Email change: requesting a change to an email already registered or already pending for another
  user → `409` **at request time** — this is the test that specifically verifies
  database-design.md's SA-2 decision, that the check happens before the confirmation email is even
  sent; confirming activates the pending email and the old email stops authenticating; a second
  change request before the first is confirmed replaces the pending token (only one pending change
  can exist at a time).

## 14. Timezone/Date Boundary Testing

The highest-risk correctness area in the system — explicit boundary cases, not just happy-path
coverage:

- A user in a non-UTC timezone submits an expense dated "today" in their local time at a moment
  when UTC has already rolled to the next calendar day → must succeed.
- A date that _is_ in the future in the user's own timezone is rejected even though it's still
  "today" in UTC.
- An expense dated the last day of the month in the user's timezone counts toward that month's
  dashboard/report totals even if UTC has already rolled into the next month.
- Changing a user's timezone (FR-26.3) does **not** retroactively reinterpret already-stored dates
  — a test changes the timezone and then asserts previously-recorded expenses keep their original
  month bucketing.
- **Testability requirement:** the shared time utility (architecture §13) must accept an
  injectable "current instant" rather than relying only on real wall-clock time, so boundary
  instants (e.g. "one second before midnight in `Asia/Kolkata`") can be constructed
  deterministically in tests.

## 15. Currency-Lock Testing

- Currency change succeeds when the user has zero expenses, income, and budgets.
- Currency change fails `409 CURRENCY_LOCKED` once any **one** of the three record types exists —
  tested independently for each type.
- The theoretical concurrent-request race between "add expense" and "change currency" is an
  explicitly accepted, unmitigated risk per architecture §23 — this strategy does not require a
  test attempting to reproduce that race.

## 16. Category Deletion/Reassignment Transactional Testing

- Plain delete (FR-17): succeeds with no associated records; fails `409 CATEGORY_IN_USE` with
  records; fails `409 LAST_CATEGORY` if it's the user's only category.
- Reassign-and-delete (FR-17a) happy path: all affected expenses, income, and budgets are
  reassigned and the original category is gone — verified by querying afterward, not just by
  response status.
- **The single most important transactional test in the system**: the FR-17a.4 conflict case. Set
  up a replacement category with a conflicting budget, attempt the reassign-and-delete, assert it
  fails `409`, **and then assert nothing changed at all** — the source category still exists, its
  expenses/income are still pointed at it, and the replacement's budget is untouched. Testing only
  "it returned an error" is not sufficient; the atomicity guarantee (DI-3) is the actual thing
  under test.
- **Race-testing rigor:** tests verify the in-transaction check rejects an already-existing
  conflict (the realistic case); the true concurrent race is trusted to the transactional design
  (the in-transaction re-check) plus the database's own unique constraint (DI-1) as a backstop,
  rather than reproduced with special race-simulating harness infrastructure.

## 17. Budget Uniqueness and Status Testing

- Duplicate `(userId, categoryId, month)` budget creation fails `409`, tested both through the
  service layer and as a raw-Prisma constraint test (§6).
- **Boundary-value tests at the exact BR-5 thresholds**: spend at 89.99%, 90.00%, 100.00%, and
  100.01% of the budgeted amount, asserting `under`/`near_limit`/`near_limit`/`over` respectively —
  the boundaries themselves are the priority, since off-by-one percentage errors are a classic bug
  source.
- Budget amount `<= 0` is rejected (both `0` and a negative value).

## 18. Dashboard and Report Aggregation Testing

- Dashboard totals match a manually-computed sum over seeded current-month data; records outside
  the current month are excluded.
- **Report period semantics (calendar-aligned):**
  - `this_month` = the 1st of the current month through today
  - `last_month` = the entire previous calendar month
  - `last_3_months` = the 1st of the month three months ago through today
  - `this_year` = January 1 through today
    All evaluated in the user's stored timezone (FR-1.5, architecture §13). This precise definition
    was missing from api-spec.md §16 and has been backfilled there as a companion edit to this
    document.
- Each preset is tested with seeded data placed deliberately at period boundaries (e.g. an expense
  dated exactly on the 1st of the month three months ago) to confirm correct inclusion/exclusion
  at the edges.
- Money-precision aggregation test: sum a set of decimal amounts specifically chosen to expose
  floating-point drift if the implementation ever slipped into binary floats (DI-5) — targeting
  the aggregation layer specifically, where such bugs most often surface even when individual
  stored values are correct.

## 19. Validation/Error Response Testing

Every error `code` in api-spec.md's enum has at least one test proving it's returned under the
right condition with the documented `{ error: { code, message, details? } }` shape.
`CATEGORY_DELETE_BUDGET_CONFLICT`'s `details.conflictingMonths` array is asserted for shape and
content, not just presence.

## 20. API Contract Testing

The same Zod schemas used for request validation (architecture §9) are reused to assert response
shapes in tests — one source of truth, so implementation and tests can't silently drift apart.
Future nicety, not required now: a CI check that fails if a live response shape diverges from what
api-spec.md documents.

## 21. Test Data/Fixtures Strategy

Factory functions (e.g. `createTestUser({ timezone: 'Asia/Kolkata' })`, `createTestExpense({
userId, amount: '10.00' })`) with sensible defaults and easy overrides, rather than static fixture
files — this is what makes constructing the precise edge-case data §14/§17/§18 need (specific
timezones, exact boundary amounts) practical. Each test creates its own isolated data (via §5's
truncate-between-tests strategy) rather than sharing a seeded dataset, avoiding test-order
dependencies.

## 22. Mocking vs. Real Dependencies

- **Real**: Postgres/Prisma (never mocked in integration/route tests, architecture §18); the rate
  limiter, CSRF middleware, JWT signing/verification, and argon2 hashing all run for real, since
  they are the thing being tested.
- **Mocked**: the `EmailSender` interface (architecture §2) — an in-memory fake recording "sent"
  calls for assertions, rather than the real console-log dev stub. The shared time utility's
  "current instant" (§14) is injectable for boundary tests.
- **Reduced-cost argon2 parameters in the test environment only** (never in production) — argon2's
  deliberate slowness (SEC-1) would otherwise make any test creating several users noticeably
  slow; this keeps the suite fast without weakening production security.

## 23. Coverage Requirements

**Track coverage, don't gate merges.** Coverage is measured and reported in CI but never blocks a
merge; the FR/BR/SEC/DI traceability convention (§24, §30) is the real quality bar, not a
line-coverage percentage — a hard numeric gate risks incentivizing coverage-theater tests that
execute code without meaningfully asserting behavior.

## 24. Test Naming Conventions Using FR/BR/SEC/DI IDs

One top-level `describe` per feature area (mirroring architecture §4's module boundaries), with
nested `describe`/`it` titles citing the specific FR/BR/SEC/DI ID under test, e.g.:

```
describe('FR-17a: category delete with reassignment', () => {
  it('FR-17a.4: rejects when the replacement has a conflicting budget', ...)
  it('DI-3: leaves nothing changed when the reassignment is rejected', ...)
})
```

This is also what makes §30's traceability table maintainable — it can be compiled by extracting
requirement IDs directly out of test titles rather than hand-maintained separately.

## 25. Local Developer Test Workflow

- A fast command runs unit tests in watch mode during day-to-day development.
- A separate command runs integration + route tests against a Testcontainers-provisioned Postgres
  (requires Docker locally).
- A pre-commit hook runs only the fast unit tests, to avoid slowing down every commit; the full
  suite, including integration/route tests, is left to CI.

## 26. CI Test Workflow

On every push/PR: lint → typecheck → unit tests → integration tests (Testcontainers-provisioned
Postgres) → route tests, in that order, so cheaper checks fail fast before the more expensive ones
run. Assumption: GitHub Actions, consistent with this being a GitHub-hosted project.

## 27. Performance Testing Considerations

**Lightweight check within the existing test suite**, not a dedicated load-testing tool. NFR-1's
500ms target is verified by adding response-time assertions to the existing integration/route
tests for the read-heavy endpoints (dashboard, reports, expense/income lists), using seeded data
at the "few thousand records" scale NFR-1 describes. No k6/autocannon stage or separate CI pipeline
is introduced — the realistic load for a single-user personal app doesn't justify that investment,
consistent with architecture §1's "simplicity over scalability" goal.

## 28. Security Testing Considerations

Beyond the functional auth/CSRF/rate-limit coverage in §8–11:

- Dependency vulnerability scanning as part of CI (`npm audit` and/or Dependabot) — cheap,
  high-value, and a natural extension of the "production-quality" vision.
- An explicit test that triggers a representative error and asserts the log output/error response
  never contains a raw password, raw token, or full financial record contents — turning
  architecture §19's "never log X" principle into an automated assertion rather than a
  code-review-only convention.

## 29. Failure Scenarios and Edge Cases

Empty states (zero expenses/categories/budgets for dashboard and reports); boundary amounts (the
largest value `NUMERIC(12,2)` allows, and the smallest positive amount, `0.01`); malformed JSON
bodies and missing required fields; unexpected extra fields in a request body (stripped/ignored
rather than rejected — Zod's default lenient behavior); reasonable field-length assumptions for
free-text fields not pinned to an exact number elsewhere (category name ≤ 100 characters,
description ≤ 500 characters, assumed here as a low-stakes implementation default).

## 30. Traceability From Requirements to Tests

Intended mapping (no test files exist yet — this describes where each requirement's coverage will
live once implementation begins):

| Requirement area                                                                   | Test layer(s)                                       | Section(s) above |
| ---------------------------------------------------------------------------------- | --------------------------------------------------- | ---------------- |
| FR-1–FR-6 (registration, verification, login, logout)                              | Unit + Integration + Route                          | §8               |
| FR-3.4/FR-3.5, SEC-6, SEC-8 (tokens)                                               | Integration + Route                                 | §12              |
| FR-5.1–5.4 (password reset)                                                        | Integration + Route                                 | §8, §13          |
| FR-25.3–25.5 (email change)                                                        | Integration + Route                                 | §13              |
| FR-27 (change password)                                                            | Integration + Route                                 | §8               |
| FR-1.5, FR-26.3, BR-8 (timezone)                                                   | Unit + Integration                                  | §14              |
| FR-26.1–26.2, BR-2, DI-6 (currency)                                                | Integration                                         | §15              |
| FR-15.1–FR-17a, BR-3 (categories)                                                  | Unit + Integration + Route                          | §16              |
| DI-2, DI-3 (referential integrity, atomicity)                                      | Integration (raw-Prisma constraint tests)           | §6, §16          |
| FR-7–FR-14, BR-1 (expenses/income)                                                 | Unit + Integration + Route                          | §17, §29         |
| FR-18–FR-20, BR-4, BR-5, DI-1 (budgets)                                            | Unit + Integration                                  | §17              |
| FR-21–FR-22 (dashboard)                                                            | Integration + Route                                 | §18              |
| FR-23–FR-24 (reports)                                                              | Integration + Route                                 | §18              |
| SEC-1 (hashing), SEC-2 (ownership), SEC-4 (rate limit), SEC-5 (HTTPS, infra-level) | Integration + Route                                 | §9, §11, §22     |
| SEC-3 (token expiry/single-use)                                                    | Integration                                         | §13              |
| SEC-7 (server-side validation)                                                     | Route                                               | §19              |
| NFR-1 (performance)                                                                | Integration/Route (timing assertions)               | §27              |
| NFR-2 (no silent failures)                                                         | Route (every endpoint asserts an explicit response) | §7, §19          |
| NFR-5 (maintainability via tests)                                                  | All layers                                          | §1, §24          |

## Appendix: Testing-Strategy Decisions Resolved With the Product Owner

| ID   | Question                                               | Decision                                                                                         | Sections Affected |
| ---- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------ | ----------------- |
| TQ-1 | Test database infrastructure                           | Testcontainers — fresh, throwaway Postgres per run                                               | §5, §25, §26      |
| TQ-2 | Rigor of TOCTOU race testing for category deletion     | Sequential correctness only; trust the transactional design + DB constraint for true concurrency | §16               |
| TQ-3 | Report period semantics ("Last 3 Months", "This Year") | Calendar-aligned periods (not rolling windows) — also backfilled into `docs/api-spec.md` §16     | §18               |
| TQ-4 | Code-coverage policy                                   | Track coverage, don't gate CI on a numeric threshold                                             | §23               |
| TQ-5 | Performance-testing rigor for NFR-1                    | Lightweight response-time assertions in existing tests, no dedicated load-testing tool           | §27               |

No open testing-strategy ambiguities remain. Implementation can proceed from all six approved
documents in this series.
