# CLAUDE.md — Operating Instructions for This Repository

This file is the permanent, always-loaded operating manual for working in this repo. It
**summarizes and enforces** decisions made in `docs/*.md` — it never duplicates their reasoning or
overrides them. When in doubt, open the referenced document section for the full rationale.

Seven specification documents are approved and unmodified: `product-spec.md`, `requirements.md`,
`architecture.md`, `database-design.md`, `api-spec.md`, `testing-strategy.md`,
`development-workflow.md`. This file was produced by auditing all seven for contradictions; two
were found and are reconciled below (§14), with a note that they should get a formal wording
correction in requirements.md/architecture.md in a future documentation-maintenance pass.

## 1. Project Overview

A production-quality personal expense tracker: expense/income tracking, categories, monthly
budgets, a dashboard, and two reports, built as a learning exercise in spec-driven development
with Claude Code. Single-user-per-account, no sharing/multi-tenancy in v1. → `product-spec.md` §1–§2.

## 2. Technology Stack

Node.js, TypeScript (`strict: true`), Fastify, PostgreSQL, Prisma, Zod (validation), argon2id
(password hashing), JWT/HS256 access tokens + opaque rotating refresh tokens, Vitest, ESLint +
Prettier, Testcontainers (test DB). → `architecture.md` §2, `development-workflow.md` §8.

## 3. Source-of-Truth Document Hierarchy

`product-spec.md` (what/why) → `requirements.md` (testable WHAT) → `architecture.md` (HOW,
system-level) → `database-design.md` / `api-spec.md` (HOW, concrete) → `testing-strategy.md` (how
verified) → `development-workflow.md` (how built) → this file (operating summary).

**Precedence rule:** when a downstream document's concrete technical resolution differs from an
upstream document's literal wording — because the upstream doc didn't anticipate a real
constraint — the downstream, more specific document governs implementation, and the upstream
wording gets flagged for a correction pass rather than silently overridden in code. (See §14 for
the two current instances of this.)

## 4. Spec-Driven Development Workflow

1. Identify the FR/BR/SEC/DI ID(s) in scope.
2. Plan Mode: derive a plan strictly from the seven documents, citing those IDs.
3. Surface any ambiguity via `AskUserQuestion`, one at a time, with a recommendation — never assume.
4. Get explicit approval before writing code.
5. Implement exactly what was approved; write tests per the pyramid (§15).
6. Verify against acceptance criteria and the Definition of Done (§24).
7. If implementation reveals a spec gap, fix the spec first, then the code (§22).

→ `development-workflow.md` §2.

## 5. Plan Mode vs. Execution Mode

| Requires Plan Mode | Does not require Plan Mode |
|---|---|
| New feature/endpoint implementation | Running or reading existing tests |
| Any Prisma schema/migration change | Fixing a specific, already-identified failing test |
| Any architectural deviation | Linter/formatter auto-fixes |
| Resolving a newly discovered ambiguity | Behavior-preserving renames/reformatting |
| Amending any of the seven approved documents | Reading code/docs to answer a question |

→ `development-workflow.md` §4.

## 6. Human Approval Requirements

Required before: writing code for any new FR/BR/endpoint; applying a migration to a real database
(§18); adding any new dependency (§7); merging a PR (§17); a release/deployment; any destructive
git operation; deviating from an approved spec document. → `development-workflow.md` §5.

## 7. Dependency Approval Rules

**Every new npm dependency, however small, requires explicit sign-off before being added.** No
threshold-based exceptions. → `development-workflow.md` §5 (WQ-1).

## 8. Coding Standards

ESLint + Prettier, enforced locally (pre-commit, changed files) and authoritatively in CI.
Conventional Commits (§16). No pervasive requirement-ID comments in code — comments explain
non-obvious *why* only; IDs live in test titles and commit/PR messages (§19). →
`development-workflow.md` §7–§8.

## 9. TypeScript Strictness

`strict: true` in `tsconfig.json`. Zod schemas are the single source of truth for both runtime
validation and inferred static types — never hand-maintain a duplicate interface alongside a Zod
schema. → `architecture.md` §9.

## 10. Architecture Rules (non-negotiable)

- Monolith — no microservices, no message queue, no separate auth service.
- Layered: route handler → service layer → Prisma. **No repository abstraction layer.**
- Ownership enforced *structurally*: every service function takes `userId`; every Prisma query
  filters `(id, userId)` together. Fetch-by-id-alone does not exist in this codebase.
- Service layer throws typed domain errors (`ValidationError`, `NotFoundError`, `ConflictError`,
  `ForbiddenError`, `UnauthorizedError`) — never raw strings or generic `Error`.

→ `architecture.md` §3, §8, §10, §22.

## 11. Module Boundaries

`auth`, `users`, `categories`, `expenses`, `income`, `budgets`, `dashboard`, `reports`, plus
`shared` (money/time/error/auth-guard utilities, zero dependencies on domain modules).
`dashboard`/`reports` are leaf aggregators: they depend on `expenses`/`income`/`budgets`, but
nothing depends back on them. Cross-module data access always goes through the owning module's
exported service functions — never a raw Prisma query against another module's table. →
`architecture.md` §4, §21.

## 12. Database Rules

UUID primary keys everywhere. Money columns: `NUMERIC(12,2)`, never `FLOAT`/`DOUBLE`, with
`CHECK (amount > 0)`. Business dates (`Expense.date`, `Income.date`, `Budget.month`): plain `DATE`,
no time/offset. Audit columns (`createdAt`/`updatedAt`): `TIMESTAMPTZ`. Category → (Expense,
Income, Budget) foreign keys: **`Restrict`, never `Cascade`**. User → everything it owns:
`Cascade`. `Budget (userId, categoryId, month)` and `Category (userId, normalizedName)` are unique
constraints, not just app-level checks. No Postgres Row-Level Security for MVP. →
`database-design.md` §4, §7, §9, §11–§12, §18.

## 13. API Rules

All endpoints under `/api/v1`. Money serialized as strings (`"42.50"`), never JSON numbers. Dates
as bare `"YYYY-MM-DD"` — the client never sends a timezone or "current date"; all date-boundary
logic is server-side, using the user's stored timezone. Errors: `{ error: { code, message,
details? } }`. Ownership mismatches return `404`, never `403`. Category deletion-with-reassignment
is a dedicated `POST /categories/:id/reassign-and-delete`, not a `DELETE` with a body. →
`api-spec.md` §1, §11, §19–§20, §22.

## 14. Authentication/Security Rules

- Passwords: argon2id, OWASP-recommended minimum parameters.
- Access token: stateless JWT, HS256, ~15 min. Refresh token: opaque, hash-stored only, rotated on
  every use, revoked as a whole `familyId` on reuse detection (SEC-8).
- Both tokens transported as httpOnly, Secure cookies; a third, non-httpOnly cookie carries a
  double-submit CSRF token, echoed via `X-CSRF-Token` on every mutating authenticated request.
- Rate limit: 5 attempts / 15 min on `login`, `register`, `password-reset/request`,
  `email-change/request`, and `resend-verification` (the last two extend beyond requirements.md's
  literal SEC-4 text — api-spec.md §24's deliberate, documented extension; the wider scope is the
  operative rule here).
- **Reconciliation (Finding A):** logout revokes the current refresh-token family. **The access
  token is never actively revoked — it only expires naturally.** requirements.md's FR-4 currently
  reads as if both tokens are revoked; that wording is inaccurate and flagged for correction.
  Architecture.md's version (stateless JWTs can't be revoked early; this is an accepted,
  documented risk) is what code implements.
- **Reconciliation (Finding B):** only the JWT's signature/expiry check is database-free.
  `request.user`'s mutable fields — `verified`, `timezone`, `baseCurrency` — are read **fresh from
  the database on every request** (a cheap primary-key lookup), never cached in the JWT. This was
  an unstated gap between architecture.md §6 (which assumes these fields are always current) and
  §7 (which only lists id+verified as JWT claims and touts "no database lookup"). Caching them in
  the token would let a user who just verified their email or changed a setting see stale behavior
  for up to ~15 minutes — resolved by always reading fresh instead.

→ `architecture.md` §7–§8, §17, `api-spec.md` §23–§25.

## 15. Testing Rules

Pyramid: unit (pure functions, no I/O) → integration (service layer against a real
Testcontainers-provisioned Postgres, never mocked) → route (Fastify `inject()`, black-box HTTP).
Truncate all tables between integration tests. Vitest. Tests are named/organized to cite the
specific FR/BR/SEC/DI ID(s) they verify. Coverage is tracked in CI, never a merge gate — the
requirement-ID traceability convention is the real quality bar. → `testing-strategy.md` §2–§5,
§23–§24.

## 16. Git/Branch/Commit Conventions

Trunk-based development; `main` always deployable. Short-lived branches: `feat/`, `fix/`,
`chore/`, `docs/` + a short slug. Conventional Commits (`feat:`, `fix:`, `docs:`, `test:`,
`refactor:`, `chore:`), with the body citing the requirement ID(s) implemented. Never `--amend`
published history; commit only when explicitly asked; always use a heredoc commit message. →
`development-workflow.md` §11–§12.

## 17. PR/Code-Review Rules

One PR per task. Every PR gets a mandatory AI-assisted review pass (`/code-review`) before merge —
there is no second human reviewer on this solo project. The review checks: matches the approved
plan exactly (no unrequested extras, §20); correctly implements its cited requirement IDs; respects
the architecture rules in §10/§12 (no repository layer, `userId`-scoped queries, `Restrict` not
`Cascade`, `404` not `403`); tests are genuine assertions, not coverage-theater. →
`development-workflow.md` §13–§14 (WQ-2).

## 18. Migration Approval Rules

Every schema change is a Prisma migration, reviewed in its PR like any other file. Beyond that:
applying **any migration to a real (non-test) database requires a separate, dedicated
confirmation** — the generated SQL is shown and explicitly approved before it runs. →
`development-workflow.md` §19 (WQ-3).

## 19. Requirement Traceability Rules

Chain: **Requirement ID** (`requirements.md`) → **Task/Plan** (Plan Mode plan citing the ID) →
**Code** (module per §11) → **Test** (titled with the ID, §15) → **Commit/PR** (message cites the
ID, §16). IDs are not sprinkled through code comments — they live where they're queryable: test
titles and commit/PR messages. → `development-workflow.md` §7, §30.

## 20. Scope-Control Rules

Every task's plan enumerates its exact FR/BR/SEC/DI IDs. Anything noticed along the way that isn't
one of them is logged as a note or future-consideration — never silently implemented. Before
building anything that feels adjacent-but-not-quite-in-scope, check `product-spec.md` §5
(Non-Goals) and §13 (Future Features) explicitly. → `development-workflow.md` §28.

## 21. Ambiguity-Handling Rules

Never assume silently. Identify the ambiguity, ask via `AskUserQuestion` **one at a time**, always
with 2–3 concrete options, a trade-off explanation, and a recommendation. Wait for the answer
before proceeding. Record the resolution in the relevant document's own decisions-log/appendix. →
`development-workflow.md` §27.

## 22. Documentation Synchronization Rules

When implementation surfaces a gap, ambiguity, or necessary change, the relevant spec document is
updated first (its own Plan Mode + approval cycle) — code follows after. Docs are never left
stale. Concrete precedent: the report-period-boundary gap backfilled into `api-spec.md` §16 during
the testing-strategy planning turn. → `development-workflow.md` §22.

## 23. Definition of Ready

A task is ready when: its requirement ID(s) exist in `requirements.md` with no unresolved
ambiguity; the relevant architecture/database/API decisions are locked; its dependencies (per
`requirements.md` §8 / `architecture.md` §21) are already implemented; a Plan Mode plan for this
specific task is written and approved. → `development-workflow.md` §16.

## 24. Definition of Done

A task is done when: it implements exactly its cited requirement IDs, no more, no less; it has
tests per §15, passing locally and in CI; lint/typecheck pass; the full test suite is still green;
any spec gap found along the way is already resolved in the relevant document (§22); its PR has
passed review (§17) and is approved. → `development-workflow.md` §15.

## 25. Document Index

| Document | Governs | Open it when... |
|---|---|---|
| `docs/product-spec.md` | Vision, scope, features, non-goals | Unsure if something is in scope |
| `docs/requirements.md` | Testable FR/BR/NFR/SEC/DI statements | Need the exact rule for a behavior |
| `docs/architecture.md` | System design, module/domain boundaries, auth design | Deciding where code lives or how a flow works |
| `docs/database-design.md` | Entities, keys, constraints, cascade behavior | Touching the schema |
| `docs/api-spec.md` | Endpoints, request/response shapes, status codes | Building or calling an endpoint |
| `docs/testing-strategy.md` | Test pyramid, tooling, what to test for each risk area | Writing tests |
| `docs/development-workflow.md` | Process: branches, PRs, review, migrations, releases | Unsure about process, not product behavior |
| `.claude/plans/*.md` (session plan files) | Historical record of how each document's decisions were reached | Need the "why" behind a specific resolved ambiguity |

No application code exists yet. This file will need routine updates as conventions are refined
during implementation — keep it in sync per §22.
