# Expense Tracker — API Specification

Status: Draft v1
Owner: Yogendra Singh
Last updated: 2026-08-18
Source: `docs/product-spec.md` (v1), `docs/requirements.md` (v2), `docs/architecture.md` (v1),
`docs/database-design.md` (v1) — all approved

## Purpose & Scope

This document defines the literal HTTP contract between the browser client and the backend:
endpoints, request/response shapes, status codes, and the auth/CSRF/rate-limit behavior around
them. It builds strictly on the four approved documents above and introduces no feature, table, or
behavior beyond what they already decided. No Prisma schema and no application code are defined
here. Every endpoint cites the requirement ID(s) it implements.

Three API-level decisions that weren't derivable from the approved documents were resolved with
the product owner before this document was finalized; they're called out inline and summarized in
the Appendix.

## 1. API Conventions

- REST over JSON; resource-oriented URLs with plural nouns (`/expenses`, `/categories`, ...).
- Standard verbs: `GET` (read), `POST` (create or a named action), `PATCH` (partial update),
  `DELETE` (remove).
- `camelCase` field names throughout.
- **Monetary amounts are strings**, e.g. `"42.50"`, never JSON numbers — JS numbers can't safely
  round-trip arbitrary decimals, and DI-5 requires exact precision end-to-end, including across
  the API boundary.
- **Date-only fields** (Expense/Income `date`, Budget `month`) are plain `"YYYY-MM-DD"` strings
  with no time or offset, matching database-design.md §12's `DATE` columns exactly. Audit
  timestamps (`createdAt`/`updatedAt`) are full ISO 8601 UTC datetime strings (e.g.
  `"2026-08-18T09:30:00Z"`).
- Request bodies for create/update endpoints mirror the entity's own fields one-to-one; the server
  derives `id`, `userId`, and timestamps itself — a client never sends them.

## 2. Base URL and Versioning Strategy

All endpoints are served under a fixed prefix: **`/api/v1`**. A single path-prefixed version is
sufficient for a single-client, single-team project — it costs nothing now and avoids a painful
migration if the contract ever needs a breaking `v2`.

## Common Object Shapes

Referenced throughout the endpoint definitions below.

```
User          { id, email, pendingEmail, name, timezone, baseCurrency, verified, createdAt }
Category      { id, name, createdAt, updatedAt }
Expense       { id, amount, categoryId, date, description, createdAt, updatedAt }
Income        { id, amount, categoryId, date, description, createdAt, updatedAt }
Budget        { id, categoryId, month, amount, actualSpend, status, createdAt, updatedAt }
              status ∈ "under" | "near_limit" | "over"
Error         { error: { code, message, details? } }
```

## 3–8. Authentication Endpoints

All grouped under `/auth/*`. `POST`s here that mutate state require the CSRF header (§25) once a
session exists; the endpoints with no session yet (register, login, and every token-based public
confirmation) are naturally exempt.

### `POST /auth/register`

- Auth: none. Rate-limited (§24).
- Requirement(s): FR-1.1–1.5, FR-6 (one atomic transaction: account + timezone + default
  categories).
- Request: `{ email, password, name, timezone?, baseCurrency }` (`timezone` optional, defaults to
  `"UTC"` per FR-1.5; `baseCurrency` required per FR-26.1).
- Response `201`: `User` (minus password), plus sets the access/refresh/CSRF cookies (§7, §25).
- Errors: `400 VALIDATION_ERROR` (malformed email, password < 12 chars, missing `baseCurrency`),
  `409 EMAIL_ALREADY_IN_USE` (FR-1.2).

### `POST /auth/verify-email`

- Auth: none (token-based).
- Requirement(s): FR-2.1–2.3.
- Request: `{ token }`.
- Response `200`: `{ verified: true }`.
- Errors: `400 TOKEN_INVALID_OR_EXPIRED`.

### `POST /auth/resend-verification`

- Auth: **required** (current session, any verification status). Rate-limited (§24).
- Requirement(s): FR-2.4. **Decision:** requires a session rather than a bare email address — an
  unauthenticated "resend by email" endpoint would let anyone probe which emails exist and are
  unverified; BR-6 already permits unverified users to hold a session, so this costs nothing.
- Request: none (uses the authenticated user).
- Response `200`: `{ sent: true }`.
- Errors: `409 ALREADY_VERIFIED`.

### `POST /auth/login`

- Auth: none. Rate-limited (§24).
- Requirement(s): FR-3.1–3.4.
- Request: `{ email, password }`.
- Response `200`: `User`, plus sets the access/refresh/CSRF cookies.
- Errors: `401 INVALID_CREDENTIALS` (identical message whether the email doesn't exist or the
  password is wrong, per FR-3.2's no-enumeration rule).

### `POST /auth/logout`

- Auth: required.
- Requirement(s): FR-4.
- Request: none.
- Response `204`: no body; revokes (`revokedAt`) every token in the current refresh-token family
  and clears all three cookies.

### `POST /auth/refresh`

- Auth: none via access token — authenticated implicitly by the refresh cookie itself.
- Requirement(s): FR-3.5, SEC-8.
- Request: none (reads the refresh token from its httpOnly cookie).
- Response `200`: `{ }` (empty body; new access/refresh/CSRF cookies are set).
- Errors: `401 REFRESH_TOKEN_INVALID` (expired, unknown, or already-revoked token); `401
REFRESH_TOKEN_REUSED` when reuse is detected (SEC-8) — the entire token family is revoked as a
  side effect and the client must log in again.

### `POST /auth/password-reset/request`

- Auth: none. Rate-limited (§24).
- Requirement(s): FR-5.1.
- Request: `{ email }`.
- Response `200`: `{ sent: true }` **always**, regardless of whether the email exists (no
  enumeration).

### `POST /auth/password-reset/confirm`

- Auth: none (token-based).
- Requirement(s): FR-5.2–5.4.
- Request: `{ token, newPassword }`.
- Response `200`: `{ }`.
- Errors: `400 TOKEN_INVALID_OR_EXPIRED`, `400 VALIDATION_ERROR` (password < 12 chars).

### `POST /auth/change-password`

- Auth: required.
- Requirement(s): FR-27.
- Request: `{ currentPassword, newPassword }`.
- Response `200`: `{ }`.
- Errors: `400 VALIDATION_ERROR`, `401 INVALID_CREDENTIALS` (wrong `currentPassword`).

### `POST /auth/email-change/request`

- Auth: required. Rate-limited (§24, extended per §24's decision).
- Requirement(s): FR-25.3.
- Request: `{ newEmail }`.
- Response `200`: `{ pendingEmail: newEmail }`; sends a confirmation link to `newEmail`.
- Errors: `409 EMAIL_ALREADY_IN_USE` — checked against **both** `User.email` and
  `User.pendingEmail` across all users, at request time (database-design.md §16's resolved
  decision), not deferred to confirmation.

### `POST /auth/email-change/confirm`

- Auth: none (token-based), consistent with `verify-email`'s pattern — the token itself, not a
  session, authorizes the action.
- Requirement(s): FR-25.4–25.5.
- Request: `{ token }`.
- Response `200`: `{ email: <newly active email> }`.
- Errors: `400 TOKEN_INVALID_OR_EXPIRED`.

## 9. Profile/Settings

### `GET /users/me`

- Auth: required. Requirement(s): FR-25.1.
- Response `200`: `User`.

### `PATCH /users/me`

- Auth: required. Requirement(s): FR-25.2.
- Request: `{ name }`.
- Response `200`: `User`.
- Errors: `400 VALIDATION_ERROR`.

_(Resolved via AQ-1: settings are split across three endpoints by concern, rather than one
combined `PATCH /users/me` accepting any of name/timezone/currency — see §10 and the Appendix.)_

## 10. Currency and Timezone Settings

### `PATCH /users/me/currency`

- Auth: required. Requirement(s): FR-26.2.
- Request: `{ baseCurrency }`.
- Response `200`: `User`.
- Errors: `409 CURRENCY_LOCKED` — rejected if any Expense, Income, or Budget already exists for
  this user.

### `PATCH /users/me/timezone`

- Auth: required. Requirement(s): FR-26.3.
- Request: `{ timezone }` (IANA identifier).
- Response `200`: `User`. Always succeeds given a valid IANA timezone string (no business-rule
  restriction, unlike currency).
- Errors: `400 VALIDATION_ERROR` (not a recognized IANA timezone).

## 11. Category Endpoints

### `POST /categories`

- Auth: required + **verified** (BR-6). Requirement(s): FR-15.1.
- Request: `{ name }`.
- Response `201`: `Category`.
- Errors: `400 VALIDATION_ERROR`, `409 DUPLICATE_CATEGORY_NAME` (case-insensitive per user),
  `403 ACCOUNT_UNVERIFIED`.

### `GET /categories`

- Auth: required (any verification status). Requirement(s): implied by FR-7.1/FR-11.1/
  FR-17a.1/FR-18.1 — every category-referencing feature needs a way to list them; no dedicated FR
  names this endpoint, but none of those approved features can work via API without it.
- Response `200`: `{ items: Category[] }` (unpaginated — a user's category count is inherently
  small).

### `PATCH /categories/:id`

- Auth: required + verified. Requirement(s): FR-16.
- Request: `{ name }`.
- Response `200`: `Category`.
- Errors: `404 NOT_FOUND` (not owned by caller), `409 DUPLICATE_CATEGORY_NAME`.

### `DELETE /categories/:id`

- Auth: required + verified. Requirement(s): FR-17 (no associated records).
- Response `204`.
- Errors: `404 NOT_FOUND`, `409 CATEGORY_IN_USE` (has associated expenses/income/budgets — use
  `reassign-and-delete` instead), `409 LAST_CATEGORY` (would leave the user with zero categories).

### `POST /categories/:id/reassign-and-delete`

- Auth: required + verified. Requirement(s): FR-17a.1–FR-17a.5, BR-3.2, DI-2, DI-3.
- **Resolved via AQ-2:** a dedicated endpoint rather than an optional body on `DELETE`, to avoid
  DELETE-with-body interoperability issues and make this more consequential operation visible in
  the URL.
- Request: `{ replacementCategoryId }`.
- Response `204`. All reassignment + deletion happens as a single atomic transaction
  (architecture §15); on any failure, nothing is changed.
- Errors: `404 NOT_FOUND` (either category not owned by caller), `400 VALIDATION_ERROR`
  (`replacementCategoryId` equals the category being deleted), `409
CATEGORY_DELETE_BUDGET_CONFLICT` with `details: { conflictingMonths: ["2026-08-01", ...] }`
  (FR-17a.4).

## 12. Expense Endpoints

### `POST /expenses`

- Auth: required + verified. Requirement(s): FR-7.1–7.5.
- Request: `{ amount, categoryId, date, description? }`.
- Response `201`: `Expense`.
- Errors: `400 VALIDATION_ERROR` (`amount <= 0`, malformed date), `400 FUTURE_DATE_NOT_ALLOWED`
  (BR-8, evaluated in the user's stored timezone), `404 NOT_FOUND` (`categoryId` not owned by
  caller), `403 ACCOUNT_UNVERIFIED`.

### `GET /expenses`

- Auth: required. Requirement(s): FR-8.1–8.3.
- Query params: `category` (id), `startDate`, `endDate`, `limit`, `offset` (§21).
- Response `200`: `{ items: Expense[], pagination: { limit, offset, total } }`, default sort
  `date DESC`.

### `GET /expenses/:id`

- Auth: required. Requirement(s): implied by FR-9 (editing needs to load current values).
- Response `200`: `Expense`. Errors: `404 NOT_FOUND`.

### `PATCH /expenses/:id`

- Auth: required + verified. Requirement(s): FR-9.
- Request: any subset of `{ amount, categoryId, date, description }`.
- Response `200`: `Expense`. Same validation as create (`amount > 0`, no future date, category
  ownership).
- Errors: `400 VALIDATION_ERROR`, `400 FUTURE_DATE_NOT_ALLOWED`, `404 NOT_FOUND`.

### `DELETE /expenses/:id`

- Auth: required + verified. Requirement(s): FR-10.
- Response `204`. Errors: `404 NOT_FOUND`.

## 13. Income Endpoints

Identical shape to §12, mounted at `/income`, tracing to FR-11.1–11.5, FR-12.1–12.3, FR-13, FR-14.
`Income` objects use the same field shape as `Expense`.

## 14. Budget Endpoints

### `POST /budgets`

- Auth: required + verified. Requirement(s): FR-18.1–18.3.
- Request: `{ categoryId, month, amount }` (`month` as `"YYYY-MM-01"`).
- Response `201`: `Budget` (includes `actualSpend` and `status`, computed at creation time —
  `actualSpend` will typically be `"0.00"` for a newly created budget unless matching expenses
  already exist for that category/month).
- Errors: `400 VALIDATION_ERROR` (`amount <= 0`), `404 NOT_FOUND` (`categoryId`), `409
BUDGET_ALREADY_EXISTS` (BR-4/DI-1 — one budget per category per month).

### `GET /budgets`

- Auth: required. Requirement(s): FR-19 (implied list), FR-20.1–20.2, FR-22.
- Query params: `month` (optional filter).
- Response `200`: `{ items: Budget[] }` (unpaginated), each item's `actualSpend`/`status` computed
  live. **Decision:** status is embedded directly here rather than exposed via a separate
  per-budget endpoint — simpler for the client, avoids N+1 calls.

### `PATCH /budgets/:id`

- Auth: required + verified. Requirement(s): FR-19.1.
- Request: `{ amount }`.
- Response `200`: `Budget`. Errors: `400 VALIDATION_ERROR`, `404 NOT_FOUND`.

### `DELETE /budgets/:id`

- Auth: required + verified. Requirement(s): FR-19.2.
- Response `204`. Errors: `404 NOT_FOUND`.

## 15. Dashboard Endpoint

### `GET /dashboard`

- Auth: required. Requirement(s): FR-21.1–21.3, FR-22.
- Response `200`:
  ```
  {
    period: { month: "2026-08-01" },
    totalIncome: "3200.00",
    totalExpenses: "1875.40",
    net: "1324.60",
    budgets: Budget[]   // every category with an active budget this month, with status
  }
  ```
  One combined endpoint, matching product-spec §7.6's "single summary view." All figures are for
  the current month as determined in the user's stored timezone (FR-1.5).

## 16. Report Endpoints

**Period semantics** (calendar-aligned, evaluated in the user's stored timezone — FR-1.5,
architecture §13):

- `this_month` — the 1st of the current month through today.
- `last_month` — the entire previous calendar month (1st through its last day).
- `last_3_months` — the 1st of the month three calendar months ago through today.
- `this_year` — January 1 of the current year through today.

### `GET /reports/spending-by-category`

- Auth: required. Requirement(s): FR-23.1–23.2.
- Query params: `period` ∈ `this_month | last_month | last_3_months | this_year`.
- Response `200`: `{ period, categories: [{ categoryId, categoryName, total }] }`.
- Errors: `400 VALIDATION_ERROR` (unrecognized `period` value).

### `GET /reports/income-vs-expense`

- Auth: required. Requirement(s): FR-24.1–24.2.
- Query params: `period` (same enum as above).
- Response `200`: `{ period, buckets: [{ label, totalIncome, totalExpenses }] }` — one bucket per
  natural sub-period of the selected range (e.g. one bucket per month for `this_year`).
- Errors: `400 VALIDATION_ERROR`.

## 17–18. Request/Response Schema Patterns

Established once here, applied consistently above:

- Single-resource responses are returned **bare** at the top level — never wrapped in a generic
  envelope.
- List responses use `{ items: [...] }`, with `pagination` added when the endpoint paginates
  (§21).
- All errors use the fixed shape `{ error: { code, message, details? } }` (architecture §10),
  with `code` a stable string a client can `switch` on (the full enum used above: `
VALIDATION_ERROR, EMAIL_ALREADY_IN_USE, INVALID_CREDENTIALS, ALREADY_VERIFIED,
TOKEN_INVALID_OR_EXPIRED, REFRESH_TOKEN_INVALID, REFRESH_TOKEN_REUSED, CURRENCY_LOCKED,
DUPLICATE_CATEGORY_NAME, CATEGORY_IN_USE, LAST_CATEGORY, CATEGORY_DELETE_BUDGET_CONFLICT,
FUTURE_DATE_NOT_ALLOWED, BUDGET_ALREADY_EXISTS, NOT_FOUND, ACCOUNT_UNVERIFIED,
CSRF_TOKEN_INVALID, RATE_LIMITED, INTERNAL_ERROR`).

## 19. HTTP Status Codes

| Status | Used for                                                                                                                                                                    |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `200`  | Successful read or update                                                                                                                                                   |
| `201`  | Successful create                                                                                                                                                           |
| `204`  | Successful delete/logout/refresh-action with no body to return                                                                                                              |
| `400`  | Validation failure — both malformed input and business-rule violations (BR-1, BR-8); **decision:** no `400`/`422` split, one status keeps client handling simple            |
| `401`  | Missing/invalid/expired access token, or bad credentials                                                                                                                    |
| `403`  | Ownership-independent authorization failures: unverified-account write attempt (`ACCOUNT_UNVERIFIED`), CSRF mismatch (`CSRF_TOKEN_INVALID`)                                 |
| `404`  | Resource not found, **and** ownership mismatches — a request for another user's resource returns `404`, never `403`, so existence is never confirmed to a non-owner (SEC-2) |
| `409`  | State conflicts — duplicate names, uniqueness violations, currency lock, category-in-use, budget conflicts, email collisions                                                |
| `429`  | Rate limit exceeded, with a `Retry-After` header                                                                                                                            |
| `500`  | Unexpected server error — sanitized body, full detail logged server-side only                                                                                               |

## 20. Error Response Format

Fixed shape: `{ error: { code: string, message: string, details?: object } }`. `details` is used
specifically where a requirement demands structured information — most notably
`CATEGORY_DELETE_BUDGET_CONFLICT`'s `{ conflictingMonths: [...] }` (FR-17a.4, which requires
naming the specific conflicting month(s), not just reporting "conflict").

## 21. Pagination, Filtering, and Sorting

- **Offset/limit pagination** (`?limit=&offset=`) on `GET /expenses` and `GET /income` — simple
  and sufficient at NFR-1's "a few thousand records" scale; cursor-based pagination would solve
  problems (very large or real-time-changing datasets) this app doesn't have.
- Default sort: `date DESC` (most recent first) on both lists.
- `GET /categories` and `GET /budgets` return their full, unpaginated list — inherently small
  collections for any one user.
- Filters: `category`, `startDate`, `endDate` on expenses/income (FR-8.2/8.3, FR-12.2/12.3);
  `month` on budgets.

## 22. Date and Timezone Handling

- Every date-only field is a plain `"YYYY-MM-DD"` string (§1); no timezone offset is ever attached
  to a business date.
- **The client never sends a timezone or "as of" date.** "Today"/"current month" logic (BR-8
  validation, dashboard totals, report period boundaries) is computed entirely server-side, using
  the authenticated user's stored `timezone` (FR-1.5) — per requirements.md's AMB-1 resolution and
  architecture §13. No endpoint accepts a client-supplied "current date" parameter.

## 23. Authentication/Authorization Rules

- **Public** (no access token): `register`, `login`, `verify-email`, `password-reset/request`,
  `password-reset/confirm`, `email-change/confirm`, `refresh` (authenticated implicitly by its own
  refresh cookie).
- **Authenticated, any verification status**: `resend-verification`, `logout`,
  `change-password`, `email-change/request`, `GET/PATCH /users/me` and its currency/timezone
  variants, and every **read** (`GET`) endpoint on categories/expenses/income/budgets/dashboard/
  reports.
- **Authenticated AND verified**: every **write** (`POST`/`PATCH`/`DELETE`) on
  categories/expenses/income/budgets — per BR-6. Unverified writes fail `403 ACCOUNT_UNVERIFIED`.
- Every resource-scoped endpoint enforces ownership (architecture §8); a mismatch is `404`, never
  `403` (§19).

## 24. Rate Limiting Behavior

- `login`, `register`, and `password-reset/request` are rate-limited per SEC-4: **5 attempts / 15
  minutes**, keyed by IP and/or account.
- **Decision:** the same limit extends to `email-change/request` and `resend-verification` — both
  share password-reset's "sends an email, could be spammed" risk profile, even though SEC-4's
  literal text names only the first three. A direct, low-risk extension of an already-decided
  rule, not a new policy.
- Exceeding the limit returns `429 RATE_LIMITED` with a `Retry-After` header.

## 25. CSRF Behavior for Cookie-Based Authentication

**Resolved decision: double-submit CSRF token.** On successful `login` (and `register`, and
`refresh`), the server sets a third cookie — non-httpOnly, `Secure`, `SameSite=Lax` — containing a
random CSRF token. The client's JavaScript reads this cookie and must echo its value in an
`X-CSRF-Token` request header on every mutating request (`POST`/`PATCH`/`DELETE`) to an
authenticated endpoint. The server compares the header against the cookie and rejects the request
with `403 CSRF_TOKEN_INVALID` on any mismatch or absence.

This applies to every mutating endpoint **except** the endpoints with no session yet to protect:
`register`, `login`, and the token-based public confirmations (`verify-email`,
`password-reset/confirm`, `email-change/confirm`). `refresh` is also exempt, since it's
authenticated by the refresh cookie itself rather than an established CSRF-protected session.

## 26. Idempotency and Concurrency Considerations

- No idempotency-key mechanism on any `POST` endpoint — nothing in the approved documents calls
  for duplicate-submission protection, and adding one would be inventing a feature outside scope.
- No optimistic concurrency control (no ETags/version fields) on any `PATCH` endpoint —
  last-write-wins. This is a single-user personal app; no requirement anticipates simultaneous
  conflicting edits, consistent with architecture §1's "simplicity over scalability" goal.
- The two flows that do need concurrency safety — refresh-token rotation (`POST /auth/refresh`,
  FR-3.5) and category reassignment (`POST /categories/:id/reassign-and-delete`, FR-17a) — already
  have it fully specified at the architecture/database layer (transactions, `familyId`, the
  `Restrict` foreign key). These endpoints simply expose that atomicity; no additional API-level
  mechanism is required.

## 27. Requirement Traceability

| Endpoint                                       | Requirement(s)                                |
| ---------------------------------------------- | --------------------------------------------- |
| `POST /auth/register`                          | FR-1.1–1.5, FR-6                              |
| `POST /auth/verify-email`                      | FR-2.1–2.3                                    |
| `POST /auth/resend-verification`               | FR-2.4                                        |
| `POST /auth/login`                             | FR-3.1–3.4                                    |
| `POST /auth/logout`                            | FR-4                                          |
| `POST /auth/refresh`                           | FR-3.5, SEC-8                                 |
| `POST /auth/password-reset/request`            | FR-5.1                                        |
| `POST /auth/password-reset/confirm`            | FR-5.2–5.4                                    |
| `POST /auth/change-password`                   | FR-27                                         |
| `POST /auth/email-change/request`              | FR-25.3                                       |
| `POST /auth/email-change/confirm`              | FR-25.4–25.5                                  |
| `GET/PATCH /users/me`                          | FR-25.1–25.2                                  |
| `PATCH /users/me/currency`                     | FR-26.1–26.2                                  |
| `PATCH /users/me/timezone`                     | FR-1.5, FR-26.3                               |
| `POST/GET/PATCH/DELETE /categories`            | FR-15.1, FR-16, FR-17                         |
| `POST /categories/:id/reassign-and-delete`     | FR-17a.1–17a.5, BR-3.2, DI-2, DI-3            |
| `POST/GET/PATCH/DELETE /expenses`              | FR-7.1–7.5, FR-8.1–8.3, FR-9, FR-10           |
| `POST/GET/PATCH/DELETE /income`                | FR-11.1–11.5, FR-12.1–12.3, FR-13, FR-14      |
| `POST/GET/PATCH/DELETE /budgets`               | FR-18.1–18.3, FR-19.1–19.2, FR-20.1–20.2      |
| `GET /dashboard`                               | FR-21.1–21.3, FR-22                           |
| `GET /reports/spending-by-category`            | FR-23.1–23.2                                  |
| `GET /reports/income-vs-expense`               | FR-24.1–24.2                                  |
| Ownership enforcement on every scoped endpoint | SEC-2, architecture §8                        |
| Rate limiting                                  | SEC-4                                         |
| CSRF protection                                | Architecture §7/§17 (AA-1), resolved via AQ-3 |
| Server-side validation                         | SEC-7                                         |

## 28. API Security Considerations

HTTPS only (SEC-5); httpOnly, Secure cookies for both access and refresh tokens (architecture
AA-1); double-submit CSRF token on every mutating authenticated request (§25); rate limiting on
auth/email-sending endpoints (§24); server-side input validation regardless of client-side checks
(SEC-7); ownership violations return `404`, never `403` or a differentiated message, so a
resource's existence is never confirmed to a non-owner (SEC-2); no sensitive data (passwords, raw
tokens, full record contents) ever appears in an error response or log line (architecture §19);
every protected route validates the access token's signature and expiry, never trusting a
decoded-but-unverified claim.

## 29. API Testing Considerations

- Route-level tests (via Fastify's `inject()`) per endpoint: happy path, validation failures
  (`400`), ownership violations (`404`), unverified-account write attempts (`403
ACCOUNT_UNVERIFIED`), rate-limit triggering (`429`), and CSRF rejection on mutating requests with
  a missing/mismatched `X-CSRF-Token` header.
- End-to-end auth flow test: register → verify → login → call a protected route → refresh → logout
  → confirm the post-logout token chain is fully rejected, including a replay attempt against an
  already-rotated refresh token (SEC-8 reuse detection).
- Contract tests: assert every response matches its documented shape, reusing the same Zod schemas
  architecture §9 established for request validation, applied to response assertions too, so the
  two layers can't silently drift apart.

## Appendix: API-Level Decisions Resolved With the Product Owner

| ID   | Question                                           | Decision                                                                                   | Sections Affected |
| ---- | -------------------------------------------------- | ------------------------------------------------------------------------------------------ | ----------------- |
| AQ-1 | Combined vs. separate settings endpoints           | Separate: `PATCH /users/me` (name), `PATCH /users/me/currency`, `PATCH /users/me/timezone` | §9, §10           |
| AQ-2 | Category deletion-with-reassignment endpoint shape | Dedicated `POST /categories/:id/reassign-and-delete`, not an optional `DELETE` body        | §11               |
| AQ-3 | CSRF mechanism for cookie-based auth               | Double-submit CSRF token via `X-CSRF-Token` header                                         | §25               |

No open API-level ambiguities remain. The next step — implementation — can proceed from this
document, `docs/database-design.md`, and `docs/architecture.md` without further product-owner
input on design questions, though implementation may surface its own tactical questions.
