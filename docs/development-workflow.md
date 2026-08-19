# Expense Tracker — Development Workflow

Status: Draft v1
Owner: Yogendra Singh
Last updated: 2026-08-18
Source: `docs/product-spec.md` (v1), `docs/requirements.md` (v2), `docs/architecture.md` (v1),
`docs/database-design.md` (v1), `docs/api-spec.md` (v1), `docs/testing-strategy.md` (v1) — all
approved

## Purpose & Scope

This is the last planning artifact before implementation begins. It defines _how_ the project
moves from the six approved specification documents into working, tested, deployed code —
including, explicitly, how Claude Code itself should be used, since this project's second goal
(alongside building the app) is learning Claude Code deeply through a structured, explainable
workflow. This document formalizes the exact working pattern the whole spec-driven series has
already demonstrated: identify ambiguity, ask one at a time with a recommendation, record the
decision, and keep specifications and implementation permanently in sync.

Four genuine workflow decisions were resolved with the product owner before this document was
finalized; they're called out inline and summarized in the Appendix.

## 1. Development Lifecycle

The macro lifecycle already followed to reach this point: product-spec → requirements →
architecture → database-design → api-spec → testing-strategy → **development-workflow** (this
document) → implementation. Within implementation, work proceeds feature-by-feature (§6), each
following the spec→plan→implement→test→review→merge micro-cycle in §2.

## 2. Spec → Plan → Implementation Workflow

The exact loop already used to produce all six prior documents, now formalized as the standing
pattern for code as well:

1. Identify the requirement ID(s) (FR/BR/SEC/DI) being implemented.
2. Enter Plan Mode; derive an implementation plan strictly from the six approved documents, citing
   the IDs (§7).
3. Surface any ambiguity the documents don't resolve via `AskUserQuestion`, one at a time, with a
   recommendation (§27) — never silently assume.
4. Get explicit approval on the plan before writing code.
5. Implement exactly what was approved; write tests per testing-strategy.md's pyramid.
6. Verify against the requirement's acceptance criteria (product-spec.md §14) and the Definition
   of Done (§15).
7. If implementation reveals a spec gap, fix the spec first (through its own approval process),
   then the code — never let code and docs drift (§22).

## 3. Claude Code Usage Workflow

- **Plan Mode** for anything nontrivial: new features/endpoints, schema changes, any deviation
  from the six approved documents, any ambiguity resolution (§4).
- **Execution mode** for mechanical, already-approved, or low-risk work: implementing an approved
  plan, running/reading tests, fixing a specific failing test, linter/formatter auto-fixes,
  behavior-preserving renames.
- **`CLAUDE.md`** at the repo root, kept up to date, summarizing the tech stack, the key
  conventions from this document, and pointers into `docs/` — loaded automatically as standing
  project context, so conventions don't need re-explaining every session.
- Task-tracking (e.g. a todo list) for any multi-step implementation session, to keep visible
  progress and make it easy to resume across context compaction.

## 4. Plan Mode vs. Execution Mode

The less reversible an action, and the more it deviates from an already-approved spec, the more it
needs Plan Mode and explicit approval first.

| Requires Plan Mode                         | Does not require Plan Mode                         |
| ------------------------------------------ | -------------------------------------------------- |
| New feature/endpoint implementation        | Running or reading existing tests                  |
| Any Prisma schema/migration change         | Fixing a specific, already-identified failing test |
| Any architectural deviation                | Linter/formatter auto-fixes                        |
| Resolving a newly discovered ambiguity     | Behavior-preserving renames/reformatting           |
| Amending any of the six approved documents | Reading code/docs to answer a question             |

## 5. When Human Approval Is Required

- Before writing application code for any new FR/BR/endpoint (plan approval, §2).
- Before applying any migration to a non-ephemeral database — a dedicated confirmation step,
  distinct from normal PR review (§19).
- Before adding **any** new npm dependency, however small (§8's Appendix decision, WQ-1).
- Before merging a PR (§13/§14).
- Before a release/deployment (§24).
- Before any destructive git operation (force-push, hard reset, branch deletion).
- Before deviating from an approved spec document — the spec is amended (with its own approval)
  first, never silently patched around in code.

## 6. Task Decomposition Rules

- One task ≈ one requirement cluster — no smaller than a single testable requirement, no larger
  than one feature area (mirroring architecture §4's module boundaries). "Implement FR-7.1–7.5
  (create expense)" is one task; "implement all of Expenses" is reasonable; "implement the whole
  backend" is not.
- Implementation order follows the build-order already established in requirements.md §8 and
  architecture.md §21: Auth → Categories → Expenses/Income → Budgets → Dashboard/Reports. A task
  isn't started until its dependencies per that map are done.
- Each task maps to one Plan Mode cycle (plan → approve → implement → test → commit/PR) and should
  be small enough to review in one sitting.

## 7. How Implementation Tasks Reference FR/BR/SEC/DI IDs

Every plan and PR explicitly lists the requirement ID(s) it covers. Code comments do **not**
pervasively cite IDs — comments explain non-obvious _why_, not restate identifiers a reader can
already find in the spec. Traceability instead lives where it's actually queryable: test titles
(testing-strategy.md §24) and commit/PR messages (§12/§13).

## 8. Coding Standards Enforcement

- **ESLint + Prettier** — the most broadly documented, conventional choice for a TypeScript
  project, which matters for a learning project's abundance of reference material.
- **TypeScript `strict: true`** — catches a whole class of bugs at compile time, consistent with
  the "production-quality" vision.
- Enforced twice: locally via a pre-commit hook (lint-staged on changed files, fast) and
  authoritatively in CI (testing-strategy.md §26's lint → typecheck → test pipeline). The
  pre-commit hook is a convenience; CI is the actual gate.

## 9. Unit/Integration/Route Test Workflow

Fully specified in testing-strategy.md §2–§7 and §25–§26; not re-derived here. One process rule
added: a task isn't "done" (§15) until its tests — per testing-strategy.md §30's traceability
table — pass both locally and in CI.

## 10. Local Development Workflow

- `.env` for local config (DB URL, JWT secret, etc.), never committed; `.env.example` committed as
  a template.
- A hot-reload dev command runs the Fastify server locally.
- A **persistent** local Postgres (via docker-compose) for day-to-day development and manual
  inspection (e.g. via Prisma Studio) — distinct from the **ephemeral**, Testcontainers-provisioned
  Postgres used per test run (testing-strategy.md §5). These solve different problems: dev wants a
  database you can poke at between restarts; tests want a guaranteed-clean slate every run.

## 11. Git Branch Strategy

**Trunk-based development with short-lived feature branches** — `main` stays always-deployable;
one branch per task (`feat/`, `fix/`, `chore/`, `docs/` + a short slug, e.g.
`feat/fr-17a-category-reassignment`), merged back promptly. Simpler than GitFlow's multiple
long-lived branches, which solve problems (parallel release trains, a long-lived `develop`) this
solo project doesn't have.

## 12. Commit Conventions

**Conventional Commits** (`feat:`, `fix:`, `docs:`, `test:`, `refactor:`, `chore:`). Commit bodies
cite the requirement ID(s) implemented (e.g. "Implements FR-7.1–7.5, BR-1, BR-8") — this is where
the requirement↔commit link in §30's traceability chain actually lives. Never `--amend` published
history; always use a heredoc message; commits happen only when explicitly requested.

## 13. Pull Request Workflow

One PR per task (§6), even solo — the natural checkpoint for the Definition of Done (§15) and
where CI results and requirement-ID traceability (§7) live. The PR description includes:
requirement IDs covered, a summary of the approach (can link back to the approved Plan Mode plan),
CI status, and any spec deviations discovered and already resolved.

Every PR gets an **AI-assisted review pass** (the `/code-review` skill) before merge — a low-cost
safety net given there's no second human reviewer on a solo project, and consistent with treating
this as a genuine production-quality exercise rather than a purely informal hobby project.

## 14. Code Review Workflow

The `/code-review` pass (§13) checks: does the change match the approved plan exactly, with no
unrequested extras (§28); does it correctly implement the cited FR/BR/SEC/DI IDs; does it respect
architecture.md's explicit decisions (no repository layer, mandatory `userId`-scoped queries,
`Restrict` not `Cascade` on category deletion, `404` not `403` for ownership mismatches); are the
tests genuine verification rather than coverage-theater (testing-strategy.md §23).

## 15. Definition of Done

A task is done when: it implements exactly its cited requirement IDs (no more, no less); it has
tests per testing-strategy.md's pyramid, named per §24's convention, passing locally and in CI;
lint/typecheck pass; the full existing test suite is still green (no regressions); any spec gap
discovered along the way has already been resolved in the relevant document (§22); the PR has
passed its review (§14) and is approved.

## 16. Definition of Ready

A task is ready to start when: its requirement ID(s) exist in requirements.md with no unresolved
ambiguity (true today); the relevant architecture/database/API decisions are locked (true today);
its dependencies per requirements.md §8 / architecture §21 are already implemented; a Plan Mode
plan for this specific task has been written and approved.

## 17. Bug-Fixing Workflow

Two distinct cases:

- **Implementation bug** — the code doesn't match the approved spec. Fix directly: write a
  regression test reproducing the bug first (citing the FR/BR/SEC/DI it violates), then fix, then
  confirm the test passes.
- **Spec bug** — the approved spec itself is wrong or incomplete, discovered during
  implementation. The relevant document is amended first (through its own Plan Mode + approval
  cycle), _then_ code follows — exactly the pattern this project already followed when a report
  period-boundary gap required backfilling `api-spec.md` §16.

A single, uniform, lightweight process covers both cases for now. A formal incident/hotfix
fast-path is explicitly out of scope until the project has real production users and data to
protect.

## 18. Refactoring Workflow

Behavior-preserving refactors don't require re-approval of any spec document, but are kept as
separate, clearly labeled commits/PRs (`refactor:` prefix) — never bundled silently into unrelated
feature work. A refactor that _does_ touch an architecture.md decision (module boundaries, the
auth token design, etc.) requires updating architecture.md first, through the same process as any
other spec change (§2, §22) — code and docs never diverge.

## 19. Database Migration Workflow

Every schema change is a Prisma migration (`prisma migrate dev` locally), reviewed in its PR
alongside the code that needs it, checked specifically against database-design.md's already-locked
cascade/constraint decisions (e.g., confirming a migration didn't accidentally introduce `Cascade`
where `Restrict` was decided, database-design.md §9).

Beyond that normal PR review, applying **any migration to a real (non-test) database requires a
separate, dedicated confirmation step**, where the generated SQL is shown and confirmed before it
runs — consistent with the standing principle that hard-to-reverse actions get extra scrutiny, and
schema changes are exactly that category.

## 20. API Contract Change Workflow

Any change to api-spec.md's documented contract (new endpoint, changed shape, new error code)
updates api-spec.md **first** (Plan Mode + approval), then code follows to match — the same
discipline as §17's spec-bug case. Since there's a single client and single team, a breaking
change to an already-implemented endpoint can happen with a coordinated update rather than
needing a parallel `/api/v2` — api-spec.md §2 already reserves that path if it's ever needed.

## 21. Security Review Workflow

Any PR touching auth, CSRF, rate-limiting, or token logic (the SEC-\* requirement areas) gets an
explicit security-focused review pass, using the project's `/security-review` skill as the
concrete mechanism rather than an ad hoc read-through. Dependency vulnerability scanning
(`npm audit`/Dependabot, testing-strategy.md §28) is a merge-blocking signal specifically for
auth-adjacent PRs, not merely advisory there.

## 22. Documentation Update Workflow

**The central discipline of this whole document, already demonstrated live in this project's own
history**: when implementation surfaces a gap, ambiguity, or necessary change, the relevant spec
document is updated first — through its own Plan Mode + approval cycle — and code follows after.
Documentation is never left stale. `README.md` is kept current with actual setup/run instructions
once implementation begins.

## 23. CI Workflow

Fully specified in testing-strategy.md §26 (lint → typecheck → unit → integration → route,
assuming GitHub Actions); not re-derived here. Branch-protection rule: CI passing is a **hard
gate** for merging to `main`, whereas code-coverage percentage is tracked but explicitly **not** a
gate (testing-strategy.md §23) — two different signals, and only one blocks a merge.

## 24. Release Workflow

No hosting platform or deployment target has been chosen anywhere in the six approved documents
(architecture.md §2 only says "a single instance is sufficient for MVP," without naming one). This
document deliberately keeps that decision deferred and describes only the release _process_:

- **Versioning**: tag releases from `main` once a coherent set of tasks/PRs is merged and green.
- **"Ready to release"** means: CI green on `main`, the Definition of Done (§15) met for every
  included task, and `docs/*.md` fully in sync with the shipped code (§22).
- **Hosting/deployment target** (e.g. Railway, Render, Fly.io, a VPS) is a deliberately deferred
  decision, to be made via its own short, dedicated Plan Mode discussion once the project is
  actually ready to ship — not folded into this process-focused document, matching the scope
  discipline every prior document in this series has held.

## 25. Rollback Strategy

Independent of the hosting decision in §24: every deployable change is revertible via `git revert`
and redeploying the previous known-good commit. Database migrations are written with reversibility
in mind where practical; any migration that isn't trivially reversible (Prisma doesn't
auto-generate down-migrations) is explicitly flagged in its PR description rather than assumed
safe.

## 26. Change-Impact Analysis

Before starting any task: check requirements.md §8's dependency map and architecture §21's module
dependency rules for what else references the requirement ID(s) being touched. For example,
changing BR-5's thresholds ripples into FR-20.2, the dashboard, reports, and every test written
against those boundaries (testing-strategy.md §17) — all of which must be revisited together, not
left inconsistent.

## 27. How Claude Code Should Handle Ambiguity

A formal codification of the pattern this entire spec-driven series has already modeled: never
silently assume. Identify the ambiguity explicitly, ask via `AskUserQuestion` one at a time,
always with 2–3 concrete options, a clear trade-off explanation, and a recommendation. Wait for
the answer before proceeding. Record the resolution in the relevant document's own
decisions-log/appendix, mirroring every prior document's "Resolved With the Product Owner"
appendix.

## 28. How Claude Code Should Avoid Scope Creep

Every task's plan explicitly enumerates the FR/BR/SEC/DI IDs in scope (§6/§7); anything noticed
along the way that isn't one of them is logged as a note or future-consideration, never silently
implemented. Before implementing anything that feels adjacent-but-not-quite-in-scope, check
product-spec.md §5 (Non-Goals) and §13 (Future Features) explicitly.

## 29. How AI-Generated Changes Should Be Reviewed

The `/code-review` pass (§13/§14) specifically checks: does the change match the approved plan
exactly, with no unrequested extras (§28); does it correctly cite and satisfy its requirement IDs
(§7); does it respect architecture.md's explicit, sometimes counter-intuitive decisions (no
repository layer, mandatory `userId`-scoped queries, `Restrict` not `Cascade`, `404` not `403` for
ownership mismatches); are its tests genuine assertions of behavior rather than coverage-theater
(testing-strategy.md §23).

## 30. Traceability From Requirement → Task → Code → Test → Commit

The capstone chain, tying together §6/§7/§12 and testing-strategy.md §24/§30:

**Requirement ID** (requirements.md) → **Task/Plan** (Plan Mode plan citing the ID, §2/§7) →
**Code** (lives in the module architecture.md §4 assigns to that requirement area) → **Test**
(named per testing-strategy.md §24's convention, citing the ID) → **Commit/PR** (message/
description cites the ID, §12/§13).

Worked example: **FR-17a.4** (category-deletion budget conflict) → a task plan citing FR-17a.4,
BR-4, DI-1 → implemented in `modules/categories`'s service layer (architecture §4/§20) → a test
titled `it('FR-17a.4: rejects when the replacement has a conflicting budget')` (testing-strategy.md
§16/§24) → a commit `feat: reject category reassignment on budget conflict (FR-17a.4, BR-4)`. Any
of these five links can be found from any other — that traceability is the entire point of the
discipline this spec series has maintained.

## Appendix: Workflow Decisions Resolved With the Product Owner

| ID   | Question                            | Decision                                                                                                              | Sections Affected |
| ---- | ----------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ----------------- |
| WQ-1 | Dependency-addition approval policy | Blanket approval — every new npm dependency requires explicit sign-off                                                | §5                |
| WQ-2 | PR review mechanism                 | Every PR gets an AI-assisted review pass (`/code-review`) before merge                                                | §13, §14, §29     |
| WQ-3 | Migration approval rigor            | A dedicated confirmation step (showing the generated SQL) beyond normal PR review, before applying to a real database | §19               |
| WQ-4 | Release/deployment scope            | Hosting platform deliberately deferred; this document describes only the release process                              | §24               |

No open workflow ambiguities remain. This closes the seven-document spec-driven planning series
(product-spec → requirements → architecture → database-design → api-spec → testing-strategy →
development-workflow). Implementation can begin, following the process defined here.
