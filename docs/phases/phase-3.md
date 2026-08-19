# Phase 3 — Authentication: Completion Record

Status: **Partially implemented and verified (uncommitted — no git commit has been created yet)**
Date: 2026-08-19
Source plan: `.claude/plans/start-phase-3-magical-puddle.md` (approved this session), itself derived
from the Phase 3 entry in `docs/implementation-plan.md`, `docs/requirements.md`,
`docs/architecture.md`, `docs/database-design.md`, `docs/api-spec.md`, and `CLAUDE.md`.

This record documents work completed so far in Phase 3. **Phase 3 is not complete.** Of the plan's
8 tasks (mapped to 4 PRs), Tasks 1–3 (PR1 and PR2) are implemented and verified; Tasks 4–8
(login, logout, refresh-token rotation, password reset, and the phase-level end-to-end test) are
**not yet implemented**. See §3, §9, and §12 for the precise boundary.

## 1. Objective

Per the approved plan: build the complete authentication feature set for the application — shared
auth infrastructure, registration with default-category seeding, email verification,
login/logout, refresh-token rotation with reuse detection, and password reset — tracing FR-1.1–1.5,
FR-6, FR-2.1–2.4, FR-3.1–3.5, FR-4, FR-5.1–5.4, SEC-1/2/3/4/6/7/8, and BR-6.

## 2. Planned Scope (from the approved plan)

Eight tasks, grouped into four PRs:

| Task | Description | PR |
|---|---|---|
| 1 | Shared auth & validation infrastructure | PR1 |
| 2 | Registration + default-category seeding | PR2 |
| 3 | Email verification + resend | PR2 |
| 4 | Login | PR3 |
| 5 | Logout | PR3 |
| 6 | Refresh-token rotation + reuse detection | PR3 |
| 7 | Password reset | PR4 |
| 8 | Phase-level end-to-end auth flow + traceability check | (closes the phase) |

Planned endpoints (api-spec.md §3–§8): `POST /auth/register`, `POST /auth/verify-email`,
`POST /auth/resend-verification`, `POST /auth/login`, `POST /auth/logout`, `POST /auth/refresh`,
`POST /auth/password-reset/request`, `POST /auth/password-reset/confirm` — 8 endpoints total.

Planned new dependencies (all pre-approved in the plan): `zod`, `argon2`, `jose`,
`@fastify/cookie`, `@fastify/csrf-protection`, `@fastify/rate-limit`.

Explicitly out of scope per the plan: FR-27 (change password) and FR-25.3–25.5 (email change) —
Phase 5 work.

## 3. Implemented Scope

**Task 1 — Shared auth & validation infrastructure: implemented.**
Typed domain errors + centralized Fastify error handler, an injectable clock, argon2id password
hashing, opaque token generation/hashing (SHA-256), JWT sign/verify (HS256), `requireAuth`/
`requireVerified` guards, CSRF double-submit wiring, rate-limit scaffolding, cookie helpers, the
`EmailSender` interface + console stub, the shared Prisma client, config extensions, and test
scaffolding (`buildTestApp`, `FakeEmailSender`, `mutableClock`, cookie-parsing test helpers).

**Task 2 — Registration + default-category seeding: implemented.**
`POST /api/v1/auth/register` — one atomic transaction creating the `User` row, 7 seeded
`Category` rows, an `EMAIL_VERIFY` `VerificationToken`, and the initial `RefreshToken`
family, then issuing access/refresh/CSRF cookies.

**Task 3 — Email verification + resend: implemented.**
`POST /api/v1/auth/verify-email`, `POST /api/v1/auth/resend-verification`.

**Tasks 4–8: not implemented.** No code exists yet for login, logout, refresh-token rotation,
password reset, or the phase-level end-to-end test. `AuthService` currently exposes only
`register`, `verifyEmail`, and `resendVerification`.

**Endpoints implemented: 3 of 8** (`register`, `verify-email`, `resend-verification`).

## 4. Files Created/Modified

**Created:**
```
src/db/prisma.ts
src/modules/auth/defaultCategories.ts
src/modules/auth/routes.ts
src/modules/auth/schemas.ts
src/modules/auth/service.ts
src/shared/auth/cookies.ts
src/shared/auth/csrf.ts
src/shared/auth/guards.ts
src/shared/auth/jwt.ts
src/shared/auth/password.ts
src/shared/auth/rateLimit.ts
src/shared/auth/tokens.ts
src/shared/email/ConsoleEmailSender.ts
src/shared/email/EmailSender.ts
src/shared/errors/errorHandler.ts
src/shared/errors/index.ts
src/shared/time/clock.ts
tests/helpers/buildTestApp.ts
tests/helpers/cookies.ts
tests/helpers/fakeEmailSender.ts
tests/helpers/mutableClock.ts
tests/integration/auth-register.test.ts
tests/integration/auth-verify.test.ts
tests/unit/appContext.test.ts
tests/unit/modules/auth/schemas.test.ts
tests/unit/shared/clock.test.ts
tests/unit/shared/errorHandler.test.ts
tests/unit/shared/guards.test.ts
tests/unit/shared/jwt.test.ts
tests/unit/shared/password.test.ts
tests/unit/shared/tokens.test.ts
docs/phases/phase-3.md   (this file)
```

**Modified:**
```
package.json                — 6 new dependencies (see §5); package-lock.json updated accordingly
src/app.ts                  — registers cookie/CSRF/rate-limit plugins, the centralized error
                               handler, an AppContext decoration (`app.ctx`), and mounts
                               `registerAuthRoutes` at `/api/v1/auth`
src/config/index.ts         — added `jwtSecret` (with a dev-only fallback outside production)
                               and `cookieSecure` to AppConfig
vitest.integration.config.ts — added `fileParallelism: false` (see §9, deviation)
```

No `prisma/schema.prisma` changes — Phase 1's schema already covers this phase in full, as the
plan anticipated.

## 5. Dependencies Added (resolved versions actually installed)

| Package | Resolved version | Purpose |
|---|---|---|
| `zod` | `^4.4.3` | Request schema validation |
| `argon2` | `^0.45.1` | argon2id password hashing (SEC-1) |
| `jose` | `^6.2.9` | JWT sign/verify, HS256 |
| `@fastify/cookie` | `^11.1.2` | httpOnly/Secure cookie read/write |
| `@fastify/csrf-protection` | `^8.0.1` | Double-submit CSRF token issuance/verification |
| `@fastify/rate-limit` | `^11.2.0` | Per-route rate limiting |

All six were pre-approved in the plan before installation; no dependency was added outside that
approval. `npm audit` reports the same pre-existing `deepmerge-ts`/`@prisma/config`/`prisma` chain
finding already logged in `docs/phases/phase-1.md` — unchanged by this phase's installs, and none
of the six new packages introduced a new finding.

Also required, before any install could run: switching the local Node runtime to `v22.23.2` via
`nvm` to satisfy `package.json`'s `engines.node` constraint (the shell's active Node was `22.17.0`).

## 6. Key Decisions

Resolved via `AskUserQuestion` before implementation began (recorded in the approved plan):

1. **Default categories (FR-6):** locked in product-spec.md §7.4's illustrative list verbatim —
   `Food, Rent, Transport, Utilities, Entertainment, Salary, Other` (7 categories) — as the actual
   seed data in `src/modules/auth/defaultCategories.ts`.
2. **`shared/money`/`shared/time` scope:** deferred the full `decimal.js`-backed money module and
   timezone-aware date module to Phase 4. Phase 3 built only a minimal injectable clock
   (`src/shared/time/clock.ts`), no new dependency.

Made directly during implementation (not requiring `AskUserQuestion`, per the plan's own rationale):

3. **JWT claims:** the access token carries only `{ sub: userId }` plus standard `iat`/`exp` —
   never `verified`/`timezone`/`baseCurrency` — per CLAUDE.md §14 Finding B. `requireAuth` re-reads
   the user's mutable fields fresh from the database on every request.
4. **Token hashing algorithm:** `RefreshToken.tokenHash`/`VerificationToken.tokenHash` use SHA-256
   (Node's built-in `crypto`), not argon2id — these are already-high-entropy random values, not
   user-chosen secrets.
5. **CSRF exemption for `password-reset/request`:** CSRF enforcement is implemented as part of the
   authenticated-session guard combo (`requireAuth`/`requireVerified` + `app.csrfProtection`
   applied together per-route), not a blanket hook — this naturally exempts any endpoint with no
   session (register, login, and any future public/token-based endpoint) without hand-maintaining
   a separate exemption list.
6. **`resend-verification` requires CSRF.** api-spec.md §25's explicit exemption list does not
   include `resend-verification` (only register, login, verify-email, password-reset/confirm,
   email-change/confirm, refresh are named) — it is an authenticated, mutating endpoint, so
   `app.csrfProtection` was applied to it, consistent with decision #5's session-scoped design.

## 7. Tests and Results

**Unit tests: 37/37 passing, 9 files** (`npm test`):

- `tests/unit/shared/password.test.ts` (3) — SEC-1 argon2id hash/verify roundtrip, wrong-password
  rejection, `$argon2id$`-prefixed hash.
- `tests/unit/shared/jwt.test.ts` (4) — FR-3.4 sign/verify roundtrip, expiry rejection, wrong-secret
  rejection, malformed-token rejection.
- `tests/unit/shared/tokens.test.ts` (4) — SEC-3/SEC-8 opaque token uniqueness, deterministic
  hashing, hash non-reversibility.
- `tests/unit/shared/clock.test.ts` (2) — systemClock vs. fixedClock.
- `tests/unit/shared/errorHandler.test.ts` (7) — each `AppError` subclass → correct status/code;
  unhandled error → sanitized 500; CSRF-plugin error → 403 `CSRF_TOKEN_INVALID`.
- `tests/unit/shared/guards.test.ts` (6) — `requireAuth` (missing/expired/deleted-user/valid token)
  and `requireVerified` (BR-6) behavior against mocked Prisma.
- `tests/unit/modules/auth/schemas.test.ts` (8) — `registerSchema`: FR-1.3 password length,
  FR-1.4 email format, FR-1.5 timezone default, FR-26.1 baseCurrency.
- `tests/unit/appContext.test.ts` (3) — app boots with plugins wired, `app.ctx` decoration present,
  injected `FakeEmailSender` capture.
- `tests/app.boot.test.ts` (1) — pre-existing Phase 0 smoke test, unaffected.

**Integration tests (Testcontainers): 24/24 passing, 3 files** (`npm run test:integration`):

- `tests/integration/auth-register.test.ts` (8) — atomic creation of 1 user + 7 categories;
  cookies set; timezone default/override; FR-1.2 duplicate-email 409; a concurrent
  duplicate-email race leaving exactly one user + 7 categories; FR-1.4 malformed email 400;
  missing-baseCurrency 400; SEC-4 rate limit trips on the 6th attempt.
- `tests/integration/auth-verify.test.ts` (10) — verification email sent on registration; valid
  token verifies; already-used token rejected; expired token rejected (via injected clock);
  wrong-type (`PASSWORD_RESET`) token rejected; missing token rejected; resend-verification
  401 without auth, 403 without CSRF, 200 + new email for unverified, 409 `ALREADY_VERIFIED` for
  verified.
- `tests/integration/schema-constraints.test.ts` (6) — pre-existing Phase 1 constraint tests,
  unaffected.

**Static checks:** `npm run lint` — clean. `npm run typecheck` — clean. `npm run format:check` —
clean (the only remaining warning, `.claude/settings.local.json`, is pre-existing and unrelated to
this phase).

## 8. Security-Sensitive Decisions

- **Password hashing:** argon2id via the `argon2` package, production parameters
  `memoryCost: 19456, timeCost: 2, parallelism: 1` (SEC-1's OWASP-minimum figures); reduced test-only
  parameters (`memoryCost: 1024, timeCost: 1`) gated on `NODE_ENV === 'test'`.
- **Access token:** JWT, HS256, `jose`, ~15-minute expiry, claims limited to `{ sub: userId }` —
  no mutable user fields cached in the token (CLAUDE.md §14 Finding B).
- **Refresh/verification tokens:** opaque, `crypto.randomBytes(32)`, stored only as a SHA-256 hash.
- **CSRF:** `@fastify/csrf-protection` with `@fastify/cookie` as the secret store (`_csrf`,
  httpOnly); a second, non-httpOnly `csrf_token` cookie carries the client-readable double-submit
  value; verification requires the `X-CSRF-Token` header to match. Applied to every authenticated
  mutating route registered so far (`resend-verification`); register/verify-email are exempt (no
  session yet).
- **Rate limiting:** `@fastify/rate-limit`, `global: false` (opt-in per route), 5 attempts / 15
  minutes, keyed by `${ip}:${email}` where an email is available in the body, else by IP alone;
  applied to `register` and `resend-verification` so far.
- **Cookies:** access/refresh tokens httpOnly + `SameSite=Lax`; `Secure` flag tied to
  `NODE_ENV === 'production'` (allows local HTTP testing without disabling the flag in real
  deployments).
- **No-enumeration:** not yet applicable to login/password-reset (unimplemented); registration's
  duplicate-email path does return a distinguishing `409`, per FR-1.2 (registration is not subject
  to a no-enumeration rule in the spec — only login and password-reset are, per FR-3.2/FR-5.1).

## 9. Deviations from the Approved Plan

1. **`src/db/prisma.ts` was added**, not explicitly named in the plan's Task 1 file list. It is the
   single shared Prisma client instance architecture.md §20 already specifies as part of the
   overall project structure; Phase 1 had not yet created it (Phase 1 only added the schema). No
   new dependency was introduced — it wires together `@prisma/client`/`@prisma/adapter-pg`, both
   already installed in Phase 1.
2. **`AppContext`/`app.decorate('ctx', ...)` and `BuildAppOverrides` (injectable `clock`/
   `emailSender` on `buildApp`)** were introduced as a DI wiring mechanism; not named in the plan
   text, but a direct implementation of testing-strategy.md §14's clock-injection requirement and
   §22's fake-`EmailSender` requirement, both of which the plan did call for without specifying the
   exact mechanism.
3. **Bug found and fixed during test-writing: `@fastify/rate-limit` throws its
   `errorResponseBuilder` return value rather than calling `reply.send()` itself.** The initial
   implementation returned a plain object, which the centralized error handler didn't recognize,
   causing every rate-limited request to surface as a `500` instead of `429`. Fixed by introducing
   a typed `RateLimitedError` (carrying `code`/`statusCode`) and a matching branch in
   `registerErrorHandler`. Caught by the SEC-4 rate-limit integration test.
4. **Bug found and fixed during test-writing: cross-file test race on the shared Testcontainers
   database.** Vitest ran `auth-register.test.ts` and `auth-verify.test.ts` as parallel worker
   processes, so one file's `beforeEach` truncate could wipe rows an in-flight assertion in the
   other file still needed. Fixed by setting `fileParallelism: false` in
   `vitest.integration.config.ts`, since all integration tests share one truncate-between-tests
   database (testing-strategy.md §6) and were never designed to run concurrently across files.
5. **Node version mismatch:** the shell's active Node (`22.17.0`) didn't satisfy
   `package.json`'s `engines.node` (`>=22.22.0 <23.0.0`), blocking `npm install` outright. Resolved
   by switching to the already-installed `22.23.2` via `nvm` before any install — no config file
   changed, since `.nvmrc` already specified `22.23.2` (set in Phase 1).

None of the above changed any requirement ID's behavior, endpoint contract, or database schema —
all five are implementation/tooling-level, not scope changes.

## 10. Known Limitations

- **Tasks 4–8 are not implemented:** no login, logout, refresh-token rotation/reuse-detection, or
  password reset exists yet. FR-3.1–3.5, FR-4, FR-5.1–5.4, and SEC-8 are **not yet satisfied**.
  The phase-level end-to-end flow (register → login-while-unverified → authenticated call →
  verify → refresh → logout → replay-rejection) has not been built or run.
- **Default category list is not yet formally locked in the source documents.**
  `product-spec.md` §7.4 still reads as an illustrative "e.g." list; the plan's resolution (§6,
  item 1) is implemented in code but the corresponding one-line doc-sync note to
  `product-spec.md` §7.4 (and to `api-spec.md` §25 for the CSRF-exemption gap noted in §6 item 6)
  has **not** been made, per CLAUDE.md §22's doc-sync rule.
- **`npm audit`'s pre-existing `deepmerge-ts`/`prisma` finding** (first logged in
  `docs/phases/phase-0.md`) remains unresolved and unrelated to this phase's work; still deferred
  to the hardening phase.
- **No `/security-review` pass has been run yet** on the shared-auth-infrastructure code
  (token issuance, CSRF, rate limiting) — planned per development-workflow.md §21 before merge,
  not yet performed.
- **No code review (`/code-review`) has been run** on this work.

## 11. Commit/PR Information

**No commit has been created and no PR has been opened.** All Phase 3 work described above exists
only in the working directory on branch `chore/phase-0-scaffolding` — the same branch Phase 1's
uncommitted work sits on (per `docs/phases/phase-1.md` §11, that phase was also never committed as
of its own completion record). `git status` at the time of writing this record:

```
 M package-lock.json
 M package.json
 M src/app.ts
 M src/config/index.ts
 M vitest.integration.config.ts
?? src/db/
?? src/modules/
?? src/shared/
?? tests/helpers/
?? tests/integration/auth-register.test.ts
?? tests/integration/auth-verify.test.ts
?? tests/unit/
```

The plan's intended PR boundaries (not yet acted on): PR1 = Task 1 (`feat: shared auth,
validation, and error-handling infrastructure`); PR2 = Tasks 2+3 (`feat: registration with
default-category seeding and email verification (FR-1, FR-2, FR-6)`).

## 12. Final Acceptance Status

**Phase 3 is NOT complete and NOT accepted as done.**

- Tasks 1–3 (PR1 + PR2 scope): implemented, tested (61/61 tests passing), lint/typecheck/format
  clean, but **not yet code-reviewed, security-reviewed, committed, or merged**.
- Tasks 4–8 (PR3 + PR4 scope, and the phase-closing end-to-end test): **not started.**
- The phase's own acceptance criterion from `implementation-plan.md` — the full register → verify
  → login → refresh → logout → replay-rejection flow — **cannot yet be demonstrated**, since login,
  refresh, and logout don't exist.
- Per CLAUDE.md §24 (Definition of Done), this phase cannot be marked done until: Tasks 4–8 are
  implemented and tested; the two pending doc-sync notes (§10) are made; `/code-review` and
  `/security-review` passes are completed; and the work is committed and reviewed per
  `development-workflow.md` §13–§14.
