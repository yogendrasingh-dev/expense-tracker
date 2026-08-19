# Expense Tracker — Database Design

Status: Draft v1
Owner: Yogendra Singh
Last updated: 2026-08-18
Source: `docs/product-spec.md` (v1, approved), `docs/requirements.md` (v2, approved),
`docs/architecture.md` (v1, approved)

## Purpose & Scope

This document translates architecture.md's conceptual data shapes into a concrete relational
design: entities, keys, constraints, indexes, and cascade behavior. It does **not** define the
literal Prisma schema file (a later, mechanical step) or any API endpoint (a separate document),
and introduces no table, column, or behavior beyond what product-spec.md and requirements.md
approved. Every decision below cites the requirement ID(s) or architecture section it implements.

Three schema-level questions could not be derived from the approved documents and were resolved
with the product owner before this document was finalized; they're called out inline and
summarized in the Appendix.

## 1. Database Design Goals

- Mirror application-level invariants as database constraints wherever feasible — architecture
  §12's rule that DB-level constraints are "a required second line of defense against races, not a
  replacement for application-level pre-checks."
- Make per-user data isolation structural: every domain table carries its own `userId`, directly
  supporting architecture §8's decision to filter `(id, userId)` together on every query.
- Preserve exact monetary precision end-to-end (DI-5) and calendar-date semantics decoupled from
  time-of-day (architecture §13).
- Support the multi-table atomic operations architecture.md requires (FR-17a.5 category
  reassignment, FR-3.5 refresh-token rotation, registration) without any schema feature that would
  make transactions awkward.
- Introduce nothing for anything on product-spec's out-of-scope list — recurring transactions,
  multi-currency, attachments, shared accounts, notifications, self-service account deletion,
  social login, configurable thresholds.

## 2. All Required Entities

Derived directly from architecture.md §4/§5's modules and domains:

| Entity                | Domain (architecture §5) |
| --------------------- | ------------------------ |
| **User**              | Identity & Access        |
| **RefreshToken**      | Identity & Access        |
| **VerificationToken** | Identity & Access        |
| **Category**          | Ledger                   |
| **Expense**           | Ledger                   |
| **Income**            | Ledger                   |
| **Budget**            | Budgeting                |

No separate "Session" table — the access token is a stateless JWT (architecture §7), so there's
nothing to persist for it. No Household/Account, Attachment, or RecurringRule entities: all are
explicitly out of scope.

## 3. Entity Responsibilities

- **User** — identity, credentials, verification status, pending email, currency, timezone.
  Traces to FR-1, FR-3, FR-25, FR-26, FR-27, BR-2, BR-6.
- **RefreshToken** — session continuity, rotation, reuse detection. Traces to FR-3.4, FR-3.5,
  FR-4, SEC-6, SEC-8.
- **VerificationToken** — single-use proof of email control for verify/reset/email-change. Traces
  to FR-2.1–2.4, FR-5.1–5.4, FR-25.3–25.5, SEC-3.
- **Category** — user-defined classification for Expense/Income/Budget. Traces to FR-15–FR-17a,
  BR-3.
- **Expense** — a single spend record. Traces to FR-7–FR-10, BR-1, BR-8.
- **Income** — a single income record. Traces to FR-11–FR-14, BR-1, BR-8.
- **Budget** — a spending cap for one category in one calendar month. Traces to FR-18–FR-20,
  BR-4, BR-5.

## 4. Primary Keys

**Decision:** UUID primary keys on every table, not auto-increment integers. This avoids leaking
record counts/sequential enumeration — a reasonable default for a personal-finance app — and
removes any need to coordinate ID-generation ordering across the multi-insert transactions
architecture.md requires (registration's User+Categories, FR-17a's reassignment). A low-stakes,
easily-revisited technical convention, not a product decision.

## 5. Foreign Keys

- `RefreshToken.userId → User.id`
- `VerificationToken.userId → User.id`
- `Category.userId → User.id`
- `Expense.userId → User.id`, `Expense.categoryId → Category.id`
- `Income.userId → User.id`, `Income.categoryId → Category.id`
- `Budget.userId → User.id`, `Budget.categoryId → Category.id`

**Decision:** `userId` is stored directly on Expense, Income, and Budget — it is not left to be
derived transitively through `Category.userId`. This denormalization is a direct consequence of
architecture §8 ("every Prisma query filters by `(id, userId)` together"): ownership must be
checkable without a join, by construction.

**RefreshToken family design** (how "revoke the whole session on reuse" works, per SEC-8): rather
than a self-referential `replacedByTokenId` chain — which would need to be walked recursively to
revoke a whole session — each RefreshToken carries a `familyId`, a stable value shared by every
token descended from one login. Revoking a compromised session on reuse detection becomes a single
`WHERE familyId = X` operation, not a chain walk. No self-referential foreign key is needed.

## 6. Relationships and Cardinality

- User 1 — 0..\* Category, Expense, Income, Budget, RefreshToken, VerificationToken
- Category 1 — 0..\* Expense, Income, Budget

All relationships are many-to-one from child to parent; there is no many-to-many relationship
anywhere in this schema, since product-spec has no shared-category or shared-account concept in
v1.

## 7. Required Unique Constraints

- `User.email` — unique (FR-1.2).
- `Category (userId, normalizedName)` — unique, where `normalizedName` is a stored lowercase copy
  of `name` (FR-15.1/FR-16's case-insensitive uniqueness). A stored normalized column is used
  rather than a raw Postgres expression index, since Prisma's schema model works more directly
  with a real column — a technical implementation choice, not a product one.
- `Budget (userId, categoryId, month)` — unique (BR-4, DI-1).
- `RefreshToken.tokenHash` — unique.
- `VerificationToken.tokenHash` — unique.

## 8. Required Indexes

- `Expense (userId, date)` and `Expense (userId, categoryId)` — date-range filtering (FR-8.3),
  category filtering (FR-8.2), and month-based aggregation (FR-20.1, FR-21.2, FR-23.1, FR-24.1).
- `Income (userId, date)` and `Income (userId, categoryId)` — same rationale (FR-12.3, FR-12.2,
  FR-21.1, FR-24.1).
- `Budget (userId, month)` — "all budgets in the current month" (FR-22), in addition to the
  uniqueness index above (which already indexes `(userId, categoryId, month)`).
- `Category (userId)` — virtually every category query is scoped this way; name lookups are
  already covered by the uniqueness index.
- `RefreshToken (familyId)` — supports the SEC-8 mass-revocation operation.
- `VerificationToken (userId, type)` — FR-2.4's "does this user have an active token to resend"
  lookup.

## 9. Delete/Update Behavior

- **User → (Category, Expense, Income, Budget, RefreshToken, VerificationToken): `Cascade`.**
  Self-service account deletion isn't built in MVP (BR-7 deferred), but the schema stays
  consistent with DI-4's eventual requirement ("no orphaned records") now, so no future migration
  is needed just to make deletion safe.
- **Category → (Expense, Income, Budget): `Restrict`**, not `Cascade` or `SetNull`. This is the
  most important cascade decision in the schema: it makes DI-2 ("a category may not be removed
  while such references exist except via the reassign-and-delete flow") a database-enforced fact,
  not just an application convention. `Cascade` would silently delete a user's financial history
  when they delete a category — never intended by any FR; `SetNull` isn't applicable since
  `categoryId` is required (`NOT NULL`) on all three child tables — every expense/income/budget
  always has a category (FR-7.1, FR-11.1, FR-18.1).

## 10. Transaction Boundaries That Affect the Schema

- **FR-17a.5** (category delete + reassign): the `Restrict` FK from §9 means reassignment
  `UPDATE`s must complete before the `DELETE` on Category — exactly the order architecture §15
  already specifies, so schema and application flow agree by construction.
- **BR-4/DI-1** (budget uniqueness): the unique constraint on Budget is the database-level backstop
  for FR-17a.4's conflict check — if application logic ever raced past its own pre-check, the
  constraint still rejects a duplicate `(userId, categoryId, month)`.
- **FR-3.5** (refresh rotation): with the `familyId` design (§5), "mark old token used + insert new
  token" is a simple two-statement transaction, with no chain-walking required.
- **FR-1.1/FR-1.5/FR-6** (registration): insert User + insert N default Category rows in one
  transaction — ordinary FK ordering, no special schema feature needed.
- **FR-25.3/FR-25.4** (email change): set `User.pendingEmail` and insert one VerificationToken
  atomically.

## 11. Money/Decimal Representation

- All monetary columns (`Expense.amount`, `Income.amount`, `Budget.amount`) are Postgres
  `NUMERIC`, never `FLOAT`/`DOUBLE` (DI-5; architecture §11/§14).
- **Decision:** `NUMERIC(12, 2)` — two decimal places covers ordinary currency minor units, and 12
  total digits (up to roughly 10 billion) is far beyond any personal-finance amount (NFR-1
  concerns record _count_, not magnitude). A safe, easily-migrated default, not a product-facing
  decision.
- `CHECK (amount > 0)` on Expense, Income, and Budget (BR-1, including its extension to budgets).

## 12. Date and Timezone Representation

- `Expense.date`, `Income.date` — Postgres `DATE` (no time-of-day, no offset), per architecture
  §13's explicit "plain calendar dates" decision.
- `Budget.month` — **Decision:** also a `DATE`, normalized to the first day of the month (e.g.
  `2026-08-01`), rather than a string like `"2026-08"`. This keeps it directly
  comparable/sortable, consistent with Expense/Income's date type, and Postgres's
  `date_trunc('month', ...)` makes month-boundary queries straightforward.
- `User.timezone` — `TEXT`, an IANA timezone identifier (e.g. `Asia/Kolkata`), per architecture
  §13.
- Audit timestamps (§20) are the only columns using `TIMESTAMPTZ` — business dates are
  deliberately timezone-naive by design (§13); audit trails are not.

## 13. User Currency Representation

- `User.baseCurrency` — `VARCHAR(3)`, an ISO 4217 code (e.g. `USD`, `INR`), set at signup
  (FR-26.1).
- Immutability once any Expense/Income/Budget exists (FR-26.2) is enforced at the application
  layer, per architecture §14's explicit assignment of that check to the service layer — no
  database trigger is introduced, consistent with architecture.md's own design.
- Per architecture §14's resolved decision: **no currency column on Expense, Income, or Budget** —
  amounts are always interpreted in the owning user's current `baseCurrency`.

## 14. Authentication/Session/Token Data Model

**RefreshToken**: `id`, `userId` (FK, cascade), `familyId`, `tokenHash` (unique), `expiresAt`
(~30 days, FR-3.4), `usedAt` (nullable — set on rotation), `revokedAt` (nullable — set on logout or
SEC-8 mass revocation), `createdAt`. A token is valid for refresh only if `usedAt IS NULL AND
revokedAt IS NULL AND expiresAt > now()`. Logout (FR-4) sets `revokedAt` on every token in the
current family, ending that session; SEC-8 reuse detection does the same across the family the
instant a used token is replayed.

**VerificationToken** (one unified table — see §15): `id`, `userId` (FK, cascade), `type`
(`EMAIL_VERIFY` / `PASSWORD_RESET` / `EMAIL_CHANGE`), `tokenHash` (unique), `expiresAt` (1 hour,
SEC-3), `usedAt` (nullable — single-use), `createdAt`. No `newEmail` column here — the pending new
address lives on `User.pendingEmail` (below), so a token only ever needs to authorize "activate
the currently pending value"; issuing a new email-change request replaces any existing pending
email/token rather than allowing several to coexist.

**User** additions beyond the obvious (email, passwordHash, name): `verified` (bool, BR-6),
`pendingEmail` (nullable, FR-25.3), `timezone`, `baseCurrency`.

## 15. Email Verification/Reset/Email-Change Token Storage

**Resolved decision:** a single unified `VerificationToken` table, with a `type` discriminator
distinguishing `EMAIL_VERIFY`, `PASSWORD_RESET`, and `EMAIL_CHANGE`, rather than three separate
tables. The three token types are behaviorally identical (single-use, hash-only storage,
time-limited), so a discriminator column captures the real difference without repeating the same
five or six columns three times, and gives the system one migration and one cleanup job instead of
three.

## 16. Category Deletion/Reassignment Implications

- No `isInUse` flag on Category — "in use" is computed on demand via existence checks against
  Expense/Income/Budget (FR-17), avoiding a denormalized flag that could drift out of sync.
- The `Restrict` foreign key (§9) is the schema-level guarantee that FR-17a's reassign-then-delete
  flow is the _only_ possible path — the database physically refuses a dangling delete.
- Budget's unique constraint (§7) is what makes FR-17a.4's conflict detection meaningful even if
  application logic were ever buggy.
- **Resolved decision (email-change collision, related pattern):** when a user requests an email
  change (FR-25.3), the target address is checked against both `User.email` and
  `User.pendingEmail` across all users _at request time_, not deferred to confirmation. This
  mirrors the same philosophy as the category-conflict check above — surface a conflict as early
  and clearly as possible rather than failing later on a database constraint the caller can't
  interpret.

## 17. Budget Uniqueness Rules

- `UNIQUE (userId, categoryId, month)` — BR-4, DI-1.
- `CHECK (amount > 0)` — BR-1's extension to budgets.
- No additional uniqueness is needed; a budget is fully identified by owner + category + month.

## 18. Data Ownership and Tenant Isolation

Every domain table (Category, Expense, Income, Budget, RefreshToken, VerificationToken) has a
non-nullable `userId` — the sole "tenant" concept in this schema (no organization/household
concept exists in v1, per product-spec §3 non-goals). This directly operationalizes architecture
§8's structural-ownership decision at the schema level.

**Resolved decision:** no Postgres Row-Level Security (RLS) for MVP. Tenant isolation relies
solely on the application-layer structural enforcement architecture §8 already specifies. RLS
would add a genuine second line of defense against an entire class of application bugs, but also
real operational complexity (session-variable plumbing through Prisma's connection pooling, policy
definitions, extra test setup) that isn't justified for a single-developer learning project's MVP.
It remains available as a future hardening pass that would require no changes to the table shapes
defined here.

## 19. Cascading Behavior

Summary of §9: User → children is `Cascade` (keeps the schema ready for DI-4 without a later
migration); Category → (Expense, Income, Budget) is `Restrict` (enforces DI-2/FR-17a at the
database level, not just by application convention).

## 20. Audit/Created/Updated Timestamps

- Every table gets `createdAt` (`TIMESTAMPTZ`, default now()).
- Category, Expense, Income, Budget, and User additionally get `updatedAt` (auto-updated on
  write) — standard practice supporting NFR-5's maintainability/testability goal.
- RefreshToken and VerificationToken skip `updatedAt`: they aren't edited in the normal CRUD
  sense, only transitioned once via `usedAt`/`revokedAt`, which already serve as their own state
  markers.

## 21. Data Retention Considerations

- No product requirement exists for soft-deletes or an undo/trash feature (FR-10, FR-14, FR-19.2
  all describe plain deletion) — the schema uses hard deletes throughout; no `deletedAt` columns
  anywhere.
- Expired/used tokens (RefreshToken, VerificationToken) will accumulate indefinitely without a
  cleanup job. This is an operational consideration, not a schema blocker: an expired or
  used/revoked token is already permanently invalid regardless of whether the row still exists, so
  deferring cleanup causes no correctness issue. A periodic deletion job (e.g., rows past
  `expiresAt` by some margin) is noted as a future operational nicety, not built now.
- BR-7/DI-4 (account deletion) stays deferred — the schema is _ready_ for it (§9's cascade
  behavior) but no anonymization columns or soft-delete machinery are added now, since the feature
  itself isn't in MVP scope.

## 22. Requirement Traceability

| Schema element                                    | Requirement / architecture source                                               |
| ------------------------------------------------- | ------------------------------------------------------------------------------- |
| `User.email` unique                               | FR-1.2                                                                          |
| `User.passwordHash`                               | FR-1.1, SEC-1                                                                   |
| `User.verified`                                   | BR-6, FR-2.2                                                                    |
| `User.pendingEmail`                               | FR-25.3, FR-25.5                                                                |
| `User.timezone`                                   | FR-1.5, FR-26.3, BR-8, architecture §13                                         |
| `User.baseCurrency`                               | FR-26.1, FR-26.2, BR-2, architecture §14                                        |
| `RefreshToken` table + `familyId`                 | FR-3.4, FR-3.5, FR-4, SEC-6, SEC-8, architecture §16                            |
| `VerificationToken` table (unified, `type`)       | FR-2.1–2.4, FR-5.1–5.4, FR-25.3–25.5, SEC-3, architecture §16                   |
| `Category (userId, normalizedName)` unique        | FR-15.1, FR-16                                                                  |
| `Category` → child `Restrict` FK                  | BR-3, DI-2, FR-17, FR-17a.1–17a.5                                               |
| `Expense`/`Income`/`Budget.userId` (denormalized) | Architecture §8                                                                 |
| `Expense`/`Income.date` as `DATE`                 | BR-8, FR-7.4, FR-11.4, architecture §13                                         |
| `Budget.month` as normalized `DATE`               | FR-18.1, FR-20.1, architecture §13                                              |
| `Budget (userId, categoryId, month)` unique       | BR-4, DI-1                                                                      |
| `amount > 0` checks                               | BR-1                                                                            |
| `NUMERIC(12,2)` money columns                     | DI-5, architecture §11/§14                                                      |
| No currency column on Expense/Income/Budget       | Architecture §14 (AA-2)                                                         |
| No RLS                                            | Architecture §8 (application-layer enforcement); resolved schema decision above |
| `createdAt`/`updatedAt` audit columns             | NFR-5                                                                           |
| Hard deletes only, no `deletedAt`                 | FR-10, FR-14, FR-19.2                                                           |
| No account-deletion machinery yet                 | BR-7, DI-4 (deferred)                                                           |

## 23. Potential Schema Risks and Trade-offs

- Denormalizing `userId` onto Expense/Income/Budget (rather than deriving it via Category)
  duplicates data that could theoretically drift if a category were ever reassigned to a different
  user — but no FR allows categories to change owners, so this risk is theoretical, and the
  ownership-safety benefit (§5) outweighs it.
- Fixed `NUMERIC(12,2)` is a judgment call; a future currency needing different precision (out of
  scope now) would need a migration — acceptable, and consistent with architecture.md's own
  future-work notes on multi-currency.
- No row-level security means tenant isolation relies entirely on application-layer discipline; a
  service-layer bug that omitted a `userId` filter would not be caught by the database itself.
  Accepted for MVP; revisitable later with no schema changes.
- Token-table accumulation is unbounded without an operational cleanup job — low risk, purely a
  storage-growth concern, not a correctness one.

## Appendix: Schema-Level Decisions Resolved With the Product Owner

| ID   | Question                                                                                | Decision                                                          | Sections Affected |
| ---- | --------------------------------------------------------------------------------------- | ----------------------------------------------------------------- | ----------------- |
| SA-1 | One unified token table vs. three separate tables for verify/reset/email-change         | One unified `VerificationToken` table with a `type` discriminator | §14, §15          |
| SA-2 | Should a requested email change be checked against other users' emails at request time? | Yes — checked at request time, rejected immediately on conflict   | §16               |
| SA-3 | Should Postgres Row-Level Security be added as defense-in-depth?                        | No RLS for MVP; application-layer enforcement only                | §18, §23          |

No open schema-level ambiguities remain. The next step — writing the literal `prisma/schema.prisma`
file — can proceed from this document without further product-owner input.
