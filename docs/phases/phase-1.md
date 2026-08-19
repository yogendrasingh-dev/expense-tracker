# Phase 1 — Database + Testing Foundation: Completion Record

Status: Implemented and verified (uncommitted — no git commit has been created yet)
Date: 2026-08-19
Source plan: Phase 1 entry in `docs/implementation-plan.md`, refined through one round of
plan-mode review in this session (one open question resolved: `prisma migrate deploy` over
`db push` for the Testcontainers schema setup).

## 1. Objective

Stand up the first four Prisma models (`User`, `RefreshToken`, `VerificationToken`, `Category`)
with no cross-dependency on ledger data, and prove out the Testcontainers-based integration-test
infrastructure every later phase relies on. `docs/database-design.md` was treated as authoritative
for every field/constraint/index.

## 2. Approved Scope

- `User`, `RefreshToken`, `VerificationToken`, `Category` Prisma models, translated field-for-field
  from `database-design.md`.
- The first Prisma migration.
- Testcontainers-provisioned Postgres for integration tests (one container per test run, per
  `testing-strategy.md` §5).
- Raw-Prisma database constraint tests, bypassing any service layer.
- No API changes, no application/service code — schema and test infrastructure only.

## 3. Plan vs. Implemented

The approved plan's schema, indexes, and constraints were implemented exactly as specified — see
`prisma/schema.prisma`. Two things surfaced during implementation that the plan flagged as
"verify at implementation time" or left as low-stakes technical conventions turned out to require
real, unplanned changes; both are recorded in full in §7 (Deviations) rather than glossed over.

## 4. Files Created/Modified

**Created:**
```
prisma/migrations/20260819050428_init_auth_and_category_schema/migration.sql
prisma.config.ts                          (new — required by Prisma 7, see §7)
vitest.integration.config.ts              (new — separate config for Testcontainers-backed tests)
tests/integration/setup.ts                (Testcontainers globalSetup)
tests/integration/helpers/db.ts           (shared test Prisma Client + truncate helper)
tests/integration/helpers/setupEach.ts    (per-test truncate wiring)
tests/integration/schema-constraints.test.ts
docs/phases/phase-1.md                    (this file)
```

**Modified:**
```
prisma/schema.prisma       — added the four models; datasource `url` field removed (Prisma 7)
package.json               — @prisma/client, @prisma/adapter-pg, pg, @types/pg,
                              @testcontainers/postgresql added; prisma:generate, prisma:migrate,
                              test:integration scripts added; engines.node tightened
.nvmrc                     — "22" → "22.23.2" (exact pin, see §7)
.github/workflows/ci.yml   — node-version now reads from .nvmrc; added a test:integration step
vitest.config.ts           — excludes tests/integration/** (unit-only now)
```

## 5. Dependencies Installed (with resolved versions)

**dependencies**
- `@prisma/client@^7.9.1`
- `@prisma/adapter-pg@^7.9.1`
- `pg@^8.23.0`

**devDependencies**
- `@types/pg@^8.23.1`
- `@testcontainers/postgresql@^12.1.0` (pulls in `testcontainers@12.1.0`)

All four were called out in the approved plan (as "Prisma/tooling decisions") except
`@prisma/adapter-pg`/`pg`, which were an unplanned addition — approved separately mid-implementation
(§7, item 1).

## 6. Tooling Decisions

- **Resolved per plan**: `prisma migrate deploy` (not `db push`) applies the real migration file in
  the Testcontainers `globalSetup` — `testing-strategy.md` §6's explicitly open choice.
- **Decided directly** (as flagged in the plan): Prisma-side `@default(uuid())`;
  `@testcontainers/postgresql` over the generic `testcontainers` package; one container per test
  run via Vitest `globalSetup`; `postgres:16` image, matching `docker-compose.yml`; a shared
  `setupFiles`-based `beforeEach` for truncate-between-tests.
- **New decision, not in the plan**: unit and integration tests now run via **two separate Vitest
  configs** (`vitest.config.ts` for unit, `vitest.integration.config.ts` for integration), rather
  than one shared config. This directly implements `testing-strategy.md` §25's "a separate command
  runs integration + route tests" — which Phase 0's single `vitest run` setup didn't yet
  distinguish, since no integration tests existed until now. `npm test` stays fast (unit only,
  no container); `npm run test:integration` opts into the Testcontainers-backed suite.

## 7. Deviations from the Approved Plan

1. **Prisma 7 requires driver adapters — a real, unplanned dependency need.** The plan flagged
   "will verify at implementation time whether Prisma 7.9.1 has changed its recommended PostgreSQL
   connection setup." It had: `npx prisma validate` failed outright because `datasource.url` in
   `schema.prisma` is no longer supported in Prisma 7. Fix, **approved separately before
   installing anything**: added `@prisma/adapter-pg` + `pg` (dependencies) and `@types/pg`
   (devDependency); removed `url` from the `datasource` block; added `prisma.config.ts` at the
   repo root (required for `prisma migrate`/CLI commands to know the connection string); test-side
   `PrismaClient` is now constructed with an `adapter: new PrismaPg({ connectionString })` instead
   of an implicit schema URL.
2. **Prisma CLI no longer auto-loads `.env`.** Once `prisma.config.ts` existed, every `prisma`
   CLI invocation (even `--help`) failed with `Cannot resolve environment variable: DATABASE_URL`
   unless the variable was already in the process environment. Fix: added `prisma:generate` and
   `prisma:migrate` npm scripts that wrap the CLI as `node --env-file=.env
   node_modules/.bin/prisma ...` — consistent with the project's existing native-`--env-file`
   convention (no `dotenv` introduced).
3. **`@testcontainers/postgresql` requires Node ≥22.22; this machine had 22.17.0.** `.npmrc`'s
   `engine-strict=true` (a Phase 0 decision) caught this immediately and hard-failed the install —
   exactly the behavior that setting was added for. Fix: installed Node 22.23.2 via `nvm`;
   `.nvmrc` tightened from `"22"` to the exact `"22.23.2"`; `package.json`'s `engines.node`
   tightened from `"22.x"` to `">=22.22.0 <23.0.0"` to capture the real constraint; `.github/workflows/ci.yml`
   now reads its Node version from `.nvmrc` (`node-version-file`) instead of a separately hardcoded
   `'22.x'`, so this can't drift between local and CI again.
4. **Unit vs. integration test splitting was not explicit in the plan.** Phase 0 had a single
   `vitest.config.ts` covering everything. Adding real integration tests made
   `testing-strategy.md` §25's "separate command" requirement concrete for the first time — see
   §6 above. `tests/app.boot.test.ts` (Phase 0's smoke test) is unaffected and still runs under
   `npm test`.
5. **Migration SQL preview used `prisma migrate diff` rather than a dry-run flag on `migrate
   dev`**, since Prisma 7 renamed `--to-schema-datamodel` to `--to-schema` (another undocumented
   CLI change encountered along the way, fixed immediately). The previewed SQL was shown for
   explicit approval before `prisma migrate dev` was run for real, per `CLAUDE.md` §18's
   migration-confirmation rule — the applied migration was diffed against the preview afterward
   and confirmed identical (aside from an expected, benign `CREATE SCHEMA IF NOT EXISTS`
   difference that `migrate dev` omits when the schema already exists).

None of the above changed any field, constraint, index, or cascade behavior specified in
`database-design.md` — every change was about *how Prisma connects/tooling runs*, not what the
schema is.

## 8. Verification/Results

| Check | Result |
|---|---|
| `npx prisma validate` | Passes (after the driver-adapter fix). |
| Migration SQL preview vs. approved shape | Matched `database-design.md` exactly — verified line by line before applying. |
| `prisma migrate dev` applied to local Docker Compose Postgres | Succeeded; diffed against the pre-approved preview and confirmed identical. |
| `npm run typecheck` | Passes. |
| `npm run lint` | Passes. |
| `npm run format:check` | Passes. |
| `npm test` (unit) | 1 file, 1 test, passes (Phase 0's smoke test, unaffected). |
| `npm run test:integration` | **6 of 6 constraint tests pass**, against a real, freshly-provisioned Testcontainers Postgres with the actual migration file applied via `migrate deploy`. |
| Container teardown | Confirmed no leftover Testcontainers containers after the run (`docker ps` shows only the persistent Compose Postgres). |
| Repeatability | Re-ran `test:integration` a second time end-to-end — passed again, 6/6, confirming the container lifecycle and truncate-between-tests isolation both work reliably. |

## 9. Constraint Tests (all passing)

1. `FR-1.2`: `User.email` uniqueness — duplicate insert rejected (`P2002`).
2. `SEC-8`: `RefreshToken.tokenHash` uniqueness — duplicate insert rejected.
3. `SEC-3`: `VerificationToken.tokenHash` uniqueness — duplicate insert rejected.
4. `FR-15.1`: `Category (userId, normalizedName)` uniqueness — duplicate for the same user
   rejected; the same name for two *different* users succeeds (positive case, confirms per-user
   scoping).
5. `DI-2`/`DI-4`: deleting a `User` cascades to zero remaining rows in all three child tables.

## 10. Known Limitations / Follow-Up Items

- `npm audit`'s pre-existing `deepmerge-ts`/`prisma` finding (logged in `docs/phases/phase-0.md`)
  is unchanged — still no upstream fix; still deferred to the hardening phase.
- The Testcontainers/Prisma-7 friction encountered here (config file, env loading, CLI flag
  renames) is now fully absorbed into the tooling (scripts, `.nvmrc`, `prisma.config.ts|) — no
  outstanding action needed, but worth remembering if `prisma`/`testcontainers` are ever
  upgraded again, since both packages changed CLI/API surface between versions during this
  single phase.
- No git commit has been made yet for this phase's work.

## 11. Git/Commit Information

**No commit has been created.** All Phase 1 files exist only in the working directory on branch
`chore/phase-0-scaffolding` (the branch created after Phase 0's commit). This phase's work has not
yet been committed or assigned its own branch/PR.

## 12. Traceability to Specification Sections

| Item | Source |
|---|---|
| Model fields/constraints/indexes | `database-design.md` §4–§9, §14, §20 |
| Testcontainers, one container per run | `testing-strategy.md` §5 |
| `migrate deploy` over `db push` | `testing-strategy.md` §6 (resolved during this phase's planning) |
| Truncate-between-tests isolation | `testing-strategy.md` §5 |
| Separate unit/integration test commands | `testing-strategy.md` §25 |
| Migration confirmation checkpoint | `CLAUDE.md` §18 |
| Dependency approval (adapter packages, Testcontainers) | `CLAUDE.md` §7 |
| Native `--env-file`, no `dotenv` | Phase 0 resolved decision (Q3), carried forward |
| Node version pinning (`.nvmrc`/`engines`) | Phase 0 §3, tightened here |

No FR/BR/SEC/DI requirement is *fully* satisfied by this phase — schema/test-infrastructure only.
Requirement IDs cited in test titles indicate which future service-layer behavior each constraint
underpins, per `testing-strategy.md` §24's naming convention.
