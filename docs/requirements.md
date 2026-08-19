# Expense Tracker — Requirements Specification

Status: Draft v2 (all §9 ambiguities resolved)
Owner: Yogendra Singh
Last updated: 2026-08-18
Source: `docs/product-spec.md` (v1, approved — all assumptions resolved)

## 1. Purpose & Scope

`docs/product-spec.md` defines _what_ the product does and _why_ at a feature level. This document
decomposes that approved scope into detailed, individually testable requirements that later
technical artifacts — API design, Prisma schema, automated tests — can cite by ID.

This document does **not** introduce any feature, behavior, or scope not already approved in
product-spec.md. Every requirement below carries a `Source` pointing back to the product-spec
section/ID it was derived from, or to the AMB-N decision that resolved an ambiguity left open in
v1 of this document. It also does not define _how_ the system is built (no endpoint paths, no
table designs, no framework choices) — that is the next artifact in this series.

## 2. Requirement ID Scheme & Traceability Convention

- **Functional (`FR-N`)** — reuses product-spec's FR numbers. Where a product-spec FR bundles more
  than one independently testable behavior, it is decomposed into `FR-N.1`, `FR-N.2`, etc. A small
  number of sub-requirements (e.g., FR-1.5, FR-3.4/3.5, FR-25.4/25.5, FR-26.3) were added while
  resolving §9's ambiguities — each is a technical consequence of an already-approved product-spec
  FR/BR, not a new feature, and is marked accordingly in its `Source`.
- **Business Rules (`BR-N`)** — same convention, reusing product-spec's BR numbers.
- **Non-Functional (`NFR-N`)** — minted here for the first time (product-spec §10 has no IDs).
- **Security (`SEC-N`)** — minted here for the first time (product-spec §12 has no IDs). SEC-8 was
  added while resolving AMB-11 (refresh-token rotation reuse detection).
- **Data Integrity (`DI-N`)** — pulled from the NFR data-integrity bullet and BR-3/BR-4/BR-7, each
  citing its origin.

Every requirement entry has:

| Field          | Meaning                                                                     |
| -------------- | --------------------------------------------------------------------------- |
| **ID**         | Stable identifier for citation from the API spec, schema, and test suite    |
| **Statement**  | A single, pass/fail-testable "shall" statement                              |
| **Source**     | The product-spec ID/section (or AMB-N resolution) this was derived from     |
| **Depends On** | Other requirement IDs that must hold for this one to be meaningful/testable |
| **Notes**      | Any remaining clarifying note                                               |

## 3. Functional Requirements

### 3.1 Authentication & Accounts

| ID     | Statement                                                                                                                                   | Source        | Depends On     | Notes                                                  |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------- | ------------- | -------------- | ------------------------------------------------------ |
| FR-1.1 | System shall accept a registration request containing an email and a password.                                                              | FR-1          | —              |                                                        |
| FR-1.2 | System shall reject registration if the email is already registered.                                                                        | FR-1          | FR-1.1         |                                                        |
| FR-1.3 | System shall reject registration if the password is fewer than 12 characters.                                                               | FR-1 (AMB-7)  | FR-1.1         | No character-class mix is required — length only.      |
| FR-1.4 | System shall reject registration if the email is not a validly formatted address.                                                           | FR-1          | FR-1.1         |                                                        |
| FR-1.5 | System shall capture and store a timezone for the user at registration, defaulting to UTC if none is provided.                              | FR-1 (AMB-1)  | FR-1.1         | Backs every "today"/"current month" computation below. |
| FR-2.1 | System shall generate a single-use verification token, valid for 1 hour, and send a verification email upon successful registration.        | FR-2 (AMB-8)  | FR-1.1         |                                                        |
| FR-2.2 | System shall mark an account verified when a valid, unexpired verification token is presented.                                              | FR-2          | FR-2.1         |                                                        |
| FR-2.3 | System shall reject a verification token that is expired (>1 hour old) or already used.                                                     | FR-2 (AMB-8)  | FR-2.1         |                                                        |
| FR-2.4 | System shall allow an unverified user to request the verification email be resent.                                                          | FR-2, BR-6    | FR-2.1         |                                                        |
| FR-3.1 | System shall authenticate a user given a matching email/password pair.                                                                      | FR-3          | FR-1.1         |                                                        |
| FR-3.2 | System shall reject login with incorrect credentials without revealing whether the email is registered.                                     | FR-3          | FR-3.1         |                                                        |
| FR-3.3 | System shall allow an unverified account to log in but restrict it per BR-6.                                                                | FR-3, BR-6    | FR-2.1         |                                                        |
| FR-3.4 | System shall, on successful login, issue a short-lived access token (~15 min) and a long-lived refresh token (~30 days).                    | FR-3 (AMB-11) | FR-3.1         |                                                        |
| FR-3.5 | System shall allow exchanging a valid, unexpired refresh token for a new access token, rotating (replacing) the refresh token on every use. | FR-3 (AMB-11) | FR-3.4, SEC-8  |                                                        |
| FR-4   | System shall allow an authenticated user to log out, immediately revoking their current access and refresh tokens.                          | FR-4 (AMB-11) | FR-3.4         |                                                        |
| FR-5.1 | System shall accept a password-reset request for an email and send a reset link if an account exists, without revealing whether it does.    | FR-5          | —              |                                                        |
| FR-5.2 | System shall generate a single-use reset token, valid for 1 hour.                                                                           | FR-5 (AMB-8)  | FR-5.1         |                                                        |
| FR-5.3 | System shall allow setting a new password given a valid, unexpired reset token, subject to the same complexity policy as FR-1.3.            | FR-5          | FR-5.2, FR-1.3 |                                                        |
| FR-5.4 | System shall invalidate a reset token immediately after use.                                                                                | FR-5          | FR-5.3         |                                                        |
| FR-6   | System shall seed a new user's account with the default category set immediately upon successful registration.                              | FR-6          | FR-1.1         |                                                        |

### 3.2 Expenses

| ID     | Statement                                                                                                             | Source             | Depends On                     | Notes |
| ------ | --------------------------------------------------------------------------------------------------------------------- | ------------------ | ------------------------------ | ----- |
| FR-7.1 | System shall accept creation of an expense (amount, category, date, optional description) for the authenticated user. | FR-7               | FR-3.1                         |       |
| FR-7.2 | System shall reject an expense with amount ≤ 0.                                                                       | FR-7, BR-1         | FR-7.1                         |       |
| FR-7.3 | System shall reject an expense referencing a category not owned by the requesting user.                               | FR-7               | FR-7.1, FR-6/FR-15.1           |       |
| FR-7.4 | System shall reject an expense dated after today, evaluated in the user's stored timezone.                            | FR-7, BR-8 (AMB-1) | FR-7.1, FR-1.5                 |       |
| FR-7.5 | System shall record the expense amount as denominated in the user's base currency.                                    | FR-7, BR-2         | FR-7.1, FR-26.1                |       |
| FR-8.1 | System shall return a list of the authenticated user's expenses.                                                      | FR-8               | FR-7.1                         |       |
| FR-8.2 | System shall support filtering the expense list by category.                                                          | FR-8               | FR-8.1                         |       |
| FR-8.3 | System shall support filtering the expense list by date range.                                                        | FR-8               | FR-8.1                         |       |
| FR-9   | System shall allow a user to edit an expense they own, subject to FR-7.2/FR-7.3/FR-7.4.                               | FR-9               | FR-7.1, FR-7.2, FR-7.3, FR-7.4 |       |
| FR-10  | System shall allow a user to delete an expense they own.                                                              | FR-10              | FR-7.1                         |       |

### 3.3 Income

| ID      | Statement                                                                                                                  | Source              | Depends On                         | Notes |
| ------- | -------------------------------------------------------------------------------------------------------------------------- | ------------------- | ---------------------------------- | ----- |
| FR-11.1 | System shall accept creation of an income entry (amount, category, date, optional description) for the authenticated user. | FR-11               | FR-3.1                             |       |
| FR-11.2 | System shall reject an income entry with amount ≤ 0.                                                                       | FR-11, BR-1         | FR-11.1                            |       |
| FR-11.3 | System shall reject an income entry referencing a category not owned by the requesting user.                               | FR-11               | FR-11.1, FR-6/FR-15.1              |       |
| FR-11.4 | System shall reject an income entry dated after today, evaluated in the user's stored timezone.                            | FR-11, BR-8 (AMB-1) | FR-11.1, FR-1.5                    |       |
| FR-11.5 | System shall record the income amount as denominated in the user's base currency.                                          | FR-11, BR-2         | FR-11.1, FR-26.1                   |       |
| FR-12.1 | System shall return a list of the authenticated user's income entries.                                                     | FR-12               | FR-11.1                            |       |
| FR-12.2 | System shall support filtering the income list by category.                                                                | FR-12               | FR-12.1                            |       |
| FR-12.3 | System shall support filtering the income list by date range.                                                              | FR-12               | FR-12.1                            |       |
| FR-13   | System shall allow a user to edit an income entry they own, subject to FR-11.2/FR-11.3/FR-11.4.                            | FR-13               | FR-11.1, FR-11.2, FR-11.3, FR-11.4 |       |
| FR-14   | System shall allow a user to delete an income entry they own.                                                              | FR-14               | FR-11.1                            |       |

### 3.4 Categories

| ID       | Statement                                                                                                                                                                                 | Source                     | Depends On                              | Notes                                                                        |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- | --------------------------------------- | ---------------------------------------------------------------------------- |
| FR-15.1  | System shall allow the authenticated user to create a custom category with a name, rejecting any name that is a case-insensitive duplicate of an existing category name for that user.    | FR-15 (AMB-4)              | FR-3.1                                  |                                                                              |
| FR-16    | System shall allow a user to rename a category (default or custom) that they own, rejecting a new name that collides case-insensitively with a different existing category of theirs.     | FR-16 (AMB-4)              | FR-6, FR-15.1                           | Renaming to the category's own current name is a no-op success.              |
| FR-17    | System shall allow a user to delete a category (default or custom) that has zero associated expenses, income, or budgets, provided the user has more than one category remaining.         | FR-17 (AMB-3)              | FR-6, FR-15.1, FR-7.1, FR-11.1, FR-18.1 | Deleting the last remaining category is rejected.                            |
| FR-17a.1 | System shall, when deletion is requested for a category with associated records, require the caller to specify an existing replacement category owned by the same user before proceeding. | FR-17a, BR-3               | FR-17, FR-6/FR-15.1                     |                                                                              |
| FR-17a.2 | System shall reassign every expense referencing the deleted category to the replacement category.                                                                                         | FR-17a, BR-3               | FR-17a.1, FR-7.1                        |                                                                              |
| FR-17a.3 | System shall reassign every income entry referencing the deleted category to the replacement category.                                                                                    | FR-17a, BR-3               | FR-17a.1, FR-11.1                       |                                                                              |
| FR-17a.4 | System shall reject the entire category deletion (no partial writes) if the replacement category already has a budget for any month in which the category being deleted also has one.     | FR-17a, BR-3, BR-4 (AMB-6) | FR-17a.1, FR-18.1                       | The error names the conflicting month(s) so the user can resolve them first. |
| FR-17a.5 | System shall execute FR-17a.2, FR-17a.3, and the category deletion (once FR-17a.4's conflict check passes) as a single atomic transaction.                                                | FR-17a, BR-3, DI-3         | FR-17a.2, FR-17a.3, FR-17a.4            |                                                                              |

### 3.5 Budgets

| ID      | Statement                                                                                                                                                                               | Source              | Depends On             | Notes |
| ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- | ---------------------- | ----- |
| FR-18.1 | System shall allow setting a budget amount for a (category, calendar month) pair for the authenticated user.                                                                            | FR-18               | FR-6, FR-15.1          |       |
| FR-18.2 | System shall reject creating a budget for a (category, month) pair that already has one.                                                                                                | FR-18, BR-4, DI-1   | FR-18.1                |       |
| FR-18.3 | System shall reject a budget amount ≤ 0, the same rule applied to expenses and income.                                                                                                  | FR-18, BR-1 (AMB-5) | FR-18.1                |       |
| FR-19.1 | System shall allow a user to edit the amount of a budget they own.                                                                                                                      | FR-19               | FR-18.1                |       |
| FR-19.2 | System shall allow a user to delete a budget they own.                                                                                                                                  | FR-19               | FR-18.1                |       |
| FR-20.1 | System shall compute "actual spend" for a category/month as the sum of that user's expenses in that category dated within that calendar month, evaluated in the user's stored timezone. | FR-20 (AMB-1)       | FR-7.1, FR-7.4, FR-1.5 |       |
| FR-20.2 | System shall classify a budget's status as under / near limit / over per the BR-5 thresholds, given FR-20.1's actual spend and the budgeted amount.                                     | FR-20, BR-5         | FR-20.1, FR-18.1       |       |

### 3.6 Dashboard

| ID      | Statement                                                                                                        | Source        | Depends On       | Notes |
| ------- | ---------------------------------------------------------------------------------------------------------------- | ------------- | ---------------- | ----- |
| FR-21.1 | System shall compute total income for the current calendar month, as determined in the user's stored timezone.   | FR-21 (AMB-1) | FR-11.1, FR-1.5  |       |
| FR-21.2 | System shall compute total expenses for the current calendar month, as determined in the user's stored timezone. | FR-21 (AMB-1) | FR-7.1, FR-1.5   |       |
| FR-21.3 | System shall compute net (income − expenses) for the current calendar month.                                     | FR-21         | FR-21.1, FR-21.2 |       |
| FR-22   | System shall display FR-20.2's budget status for every category that has a budget for the current month.         | FR-22         | FR-20.2, FR-18.1 |       |

### 3.7 Reports

| ID      | Statement                                                                                                                                                            | Source        | Depends On              | Notes |
| ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- | ----------------------- | ----- |
| FR-23.1 | System shall compute expense totals grouped by category for a user-selected preset period, with period boundaries evaluated in the user's stored timezone.           | FR-23 (AMB-1) | FR-7.1, FR-1.5          |       |
| FR-23.2 | System shall support all four presets: This Month, Last Month, Last 3 Months, This Year.                                                                             | FR-23, §7.7   | FR-23.1                 |       |
| FR-24.1 | System shall compute income and expense totals per time bucket within a user-selected preset period, with period boundaries evaluated in the user's stored timezone. | FR-24 (AMB-1) | FR-7.1, FR-11.1, FR-1.5 |       |
| FR-24.2 | System shall support the same four presets as FR-23.2.                                                                                                               | FR-24, §7.7   | FR-24.1                 |       |

### 3.8 Settings

| ID      | Statement                                                                                                                                                                                                | Source         | Depends On     | Notes |
| ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- | -------------- | ----- |
| FR-25.1 | System shall return the authenticated user's profile (name, email).                                                                                                                                      | FR-25          | FR-3.1         |       |
| FR-25.2 | System shall allow updating the user's name.                                                                                                                                                             | FR-25          | FR-25.1        |       |
| FR-25.3 | System shall allow a user to request an email change by providing a new address; the current verified email remains active for login and recovery until the new one is confirmed.                        | FR-25 (AMB-12) | FR-25.1        |       |
| FR-25.4 | System shall send a confirmation link to the pending new email, following the same single-use/1-hour-expiry token rules as FR-2.1.                                                                       | FR-25 (AMB-12) | FR-25.3, SEC-3 |       |
| FR-25.5 | System shall activate the pending new email as the account's email only when a valid, unexpired confirmation token is presented, and shall reject an expired or invalid token without changing anything. | FR-25 (AMB-12) | FR-25.4        |       |
| FR-26.1 | System shall allow a user to set their base currency.                                                                                                                                                    | FR-26, BR-2    | FR-1.1         |       |
| FR-26.2 | System shall allow changing the base currency only while the user has zero expenses, income, and budgets; otherwise the request is rejected with a clear error.                                          | FR-26 (AMB-2)  | FR-26.1        |       |
| FR-26.3 | System shall allow a user to change their stored timezone (FR-1.5) at any time in Settings.                                                                                                              | FR-26 (AMB-1)  | FR-1.5         |       |
| FR-27   | System shall allow an authenticated user to change their password given their correct current password and a new password meeting FR-1.3's complexity policy.                                            | FR-27          | FR-3.1, FR-1.3 |       |

## 4. Non-Functional Requirements

| ID    | Statement                                                                                                                                                          | Source              |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------- |
| NFR-1 | Typical read operations (dashboard, lists, reports) shall respond within 500ms at expected personal-use data volumes (up to a few thousand transactions per user). | §10 Performance     |
| NFR-2 | Every user-initiated write (create/edit/delete) shall return an explicit success or error response; no operation may fail silently.                                | §10 Reliability     |
| NFR-3 | Core actions (add expense, add income, check budget status) shall be reachable within 2-3 interactions from the dashboard.                                         | §10 Usability       |
| NFR-4 | The UI shall meet baseline WCAG 2.1 AA expectations: keyboard navigability, sufficient color contrast, labeled form inputs.                                        | §10 Accessibility   |
| NFR-5 | Business-rule logic (budget calculation, category deletion/reassignment) shall be centrally implemented and covered by automated tests.                            | §10 Maintainability |
| NFR-6 | The system shall behave correctly and predictably; no formal uptime SLA applies to this project.                                                                   | §10 Availability    |

Note: the "data integrity" bullet from product-spec §10 is intentionally not restated here — it is
covered by the dedicated §7 Data Integrity Requirements below (DI-5).

## 5. Security Requirements

| ID    | Statement                                                                                                                                                                                                                            | Source       | Depends On              | Notes                                              |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------ | ----------------------- | -------------------------------------------------- |
| SEC-1 | Passwords shall be hashed using argon2id with OWASP-recommended minimum parameters (memory ≈19 MiB, 2 iterations, parallelism 1); plaintext or reversibly-encrypted storage is prohibited.                                           | §12 (AMB-10) | FR-1.1                  |                                                    |
| SEC-2 | Every authenticated endpoint shall verify the requesting user owns the resource being accessed, edited, or deleted; cross-user access is prohibited.                                                                                 | §12          | FR-3.1                  |                                                    |
| SEC-3 | Email-verification, password-reset, and email-change confirmation tokens shall be single-use, cryptographically random, and expire 1 hour after issuance.                                                                            | §12 (AMB-8)  | FR-2.1, FR-5.2, FR-25.4 |                                                    |
| SEC-4 | Authentication endpoints (login, registration, password reset) shall be rate-limited to 5 attempts per 15 minutes, keyed by IP and/or account.                                                                                       | §12 (AMB-9)  | FR-1.1, FR-3.1, FR-5.1  |                                                    |
| SEC-5 | All client-server communication shall occur over HTTPS in any deployed environment.                                                                                                                                                  | §12          | —                       |                                                    |
| SEC-6 | Access tokens shall be short-lived (~15 min) and refresh tokens long-lived (~30 days), per FR-3.4.                                                                                                                                   | §12 (AMB-11) | FR-3.4                  | See SEC-8 for rotation-reuse handling.             |
| SEC-7 | All user-supplied input shall be validated server-side regardless of any client-side validation.                                                                                                                                     | §12          | —                       |                                                    |
| SEC-8 | A refresh token that is presented for exchange more than once (i.e., after it has already been rotated) shall be treated as compromised: the system shall revoke the entire associated session and require the user to log in again. | §12 (AMB-11) | FR-3.5                  | Standard refresh-rotation reuse-detection control. |

## 6. Business Rules

| ID     | Statement                                                                                                                                                                                                                 | Source                    | Depends On                        | Notes |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- | --------------------------------- | ----- |
| BR-1   | Expense, income, and budget amounts must be strictly greater than zero.                                                                                                                                                   | BR-1 (extended per AMB-5) | FR-7.2, FR-11.2, FR-18.3          |       |
| BR-2   | All monetary values belonging to a user are recorded and displayed in that user's selected base currency; no cross-currency conversion is performed.                                                                      | BR-2                      | FR-7.5, FR-11.5, FR-26.1, FR-26.2 |       |
| BR-3.1 | A category with associated expenses, income, or budgets cannot be deleted directly; a category with none can be, provided the user retains at least one category.                                                         | BR-3 (AMB-3)              | FR-17                             |       |
| BR-3.2 | Deleting a category with associated records requires selecting a replacement category, after which all affected records are reassigned and the original deleted atomically, unless a budget-month conflict exists (BR-4). | BR-3 (AMB-6)              | FR-17a.1–FR-17a.5                 |       |
| BR-4   | At most one budget may exist per (user, category, calendar month) combination; an operation that would violate this (including category-deletion reassignment) is rejected.                                               | BR-4                      | FR-18.2, FR-17a.4, DI-1           |       |
| BR-5   | Budget status is "under budget" below 90% of the budgeted amount spent, "near limit" at 90–100%, and "over budget" above 100%; these thresholds are fixed, not user-configurable, in v1.                                  | BR-5                      | FR-20.2                           |       |
| BR-6   | An unverified account may log in but is restricted from creating financial records (expenses, income, budgets, categories) until email verification completes.                                                            | BR-6                      | FR-3.3, FR-2.1                    |       |
| BR-7   | Self-service account deletion is out of scope for MVP; when implemented, it must delete or anonymize all of a user's data with no orphaned records.                                                                       | BR-7                      | — (deferred feature)              |       |
| BR-8   | Expense and income dates must be today or earlier, evaluated in the user's stored timezone; future dates are rejected.                                                                                                    | BR-8 (AMB-1)              | FR-7.4, FR-11.4, FR-1.5           |       |

## 7. Data Integrity Requirements

A category not broken out separately in product-spec today; consolidated here from the NFR
data-integrity bullet and BR-3/BR-4/BR-7 for implementation clarity. No new rules are introduced
beyond what §6's Business Rules already establish.

| ID   | Statement                                                                                                                                                                                                      | Source                      | Depends On               |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- | ------------------------ |
| DI-1 | The data model shall enforce, at the storage layer, at most one budget per (user, category, month) — not just at the application layer.                                                                        | BR-4                        | FR-18.2                  |
| DI-2 | Every expense, income entry, and budget shall reference an existing category owned by the same user; a category may not be removed while such references exist except via the FR-17a reassign-and-delete flow. | BR-3                        | FR-17a.5                 |
| DI-3 | The reassignment of records and deletion of the original category (FR-17a.2–FR-17a.4 plus the delete) shall execute as a single atomic transaction — all changes commit, or none do.                           | BR-3                        | FR-17a.5                 |
| DI-4 | If/when account deletion (BR-7) is implemented, deleting a user shall delete or anonymize all of that user's expenses, income, categories, and budgets, leaving no orphaned records.                           | BR-7                        | — (deferred feature)     |
| DI-5 | All monetary amounts shall be stored and calculated using exact decimal arithmetic (not binary floating point), so that sums and budget comparisons are never subject to rounding error.                       | §10 (data integrity bullet) | FR-7.2, FR-11.2, FR-20.1 |
| DI-6 | All monetary values owned by a single user shall be stored and compared in that user's base currency; no implicit cross-currency arithmetic shall occur anywhere in the system.                                | BR-2                        | FR-7.5, FR-11.5, FR-26.2 |

## 8. Requirement Dependency Map

**Build-order dependencies** (what must exist before what can be meaningfully implemented/tested):

1. **Auth (FR-1–FR-6)** is a prerequisite for every other authenticated requirement in this
   document (all reference FR-3.1 directly or transitively) and for SEC-2. Within Auth, FR-1.5
   (timezone capture) and FR-3.4/FR-3.5 (access/refresh tokens) should be built alongside the core
   login/registration flow, not bolted on afterward, since so much else depends on them.
2. **Categories (FR-6, FR-15.1, FR-16)** must exist before Expenses (FR-7.x), Income (FR-11.x), or
   Budgets (FR-18.x) can be created, since all three reference a category.
3. **Expenses and Income (FR-7.x, FR-11.x)** must exist before Budget status (FR-20.x), Dashboard
   totals (FR-21.x), and both Reports (FR-23.x, FR-24.x) can be computed.
4. **Budgets (FR-18.x)** must exist before Budget status (FR-20.2) and the Dashboard budget summary
   (FR-22) can be computed.
5. **Category deletion (FR-17/FR-17a, BR-3, DI-2, DI-3)** is the most cross-cutting rule — it
   touches Expenses, Income, and Budgets simultaneously and must be implemented after all three
   exist, not alongside basic category CRUD.

**Notable non-obvious couplings:**

| Requirement                                    | Also depends on                                               | Why                                                                                                                                                                                             |
| ---------------------------------------------- | ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FR-17a.4 (reassign budgets on category delete) | BR-4 / DI-1 (uniqueness)                                      | Resolved via AMB-6: if the replacement category already has a budget for a month the deleted category also has one, the entire deletion is rejected — no merge, no silent drop.                 |
| FR-20.1 / FR-21.x / FR-23.x / FR-24.x          | BR-8 / FR-7.4 / FR-11.4 (no future dates) / FR-1.5 (timezone) | "Current totals" logic depends on both the no-future-dates rule and the per-user timezone (AMB-1) — every date boundary in these requirements must consistently use the user's stored timezone. |
| FR-26.2 (change base currency)                 | BR-2 / DI-6                                                   | Resolved via AMB-2: currency changes are blocked once any expense/income/budget exists, so this endpoint must check for the presence of financial records before allowing the change.           |
| SEC-3 / FR-2.1 / FR-5.2 / FR-25.4              | AMB-8 (token expiry)                                          | All token types (verification, reset, and the new email-change confirmation) share one resolved rule: 1-hour expiry, single-use.                                                                |
| FR-3.5 (refresh token exchange)                | SEC-8 (reuse detection)                                       | Rotation-on-use only provides security if reuse of a stale refresh token is actively detected and treated as a compromise signal.                                                               |
| FR-25.3–FR-25.5 (email change)                 | FR-2 (verification mechanism), SEC-3                          | Resolved via AMB-12: email changes reuse the same token infrastructure as signup verification rather than introducing a separate mechanism.                                                     |

## 9. Resolved Decisions Log

All 12 ambiguities originally logged in this section (v1 of this document) were resolved by the
product owner, one at a time, and incorporated directly into the relevant requirements above. No
open ambiguities remain.

| ID     | Question                                              | Decision                                                                                                    | Incorporated Into                                                                   |
| ------ | ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| AMB-1  | Timezone basis for "today"/"current month"            | Per-user timezone, stored on the user profile                                                               | FR-1.5, FR-7.4, FR-11.4, FR-20.1, FR-21.1, FR-21.2, FR-23.1, FR-24.1, FR-26.3, BR-8 |
| AMB-2  | Currency change after transactions exist              | Blocked once any financial record exists; free before that                                                  | FR-26.2, BR-2, DI-6                                                                 |
| AMB-3  | Deleting the last remaining category                  | Prevented — user must always retain at least one category                                                   | FR-17, BR-3.1                                                                       |
| AMB-4  | Category name uniqueness                              | Unique per user, case-insensitive                                                                           | FR-15.1, FR-16                                                                      |
| AMB-5  | Does the ">0 amount" rule extend to budgets           | Yes — same rule as expenses/income                                                                          | FR-18.3, BR-1                                                                       |
| AMB-6  | Budget conflict during category-deletion reassignment | Reject the entire deletion; no merge, no silent drop                                                        | FR-17a.4, BR-3.2, BR-4                                                              |
| AMB-7  | Password complexity policy                            | Minimum 12 characters, no forced character-class mix                                                        | FR-1.3                                                                              |
| AMB-8  | Verification/reset token expiry                       | 1 hour for both token types (and for email-change confirmation)                                             | FR-2.1, FR-2.3, FR-5.2, FR-25.4, SEC-3                                              |
| AMB-9  | Auth endpoint rate limits                             | 5 attempts / 15 minutes, keyed by IP and/or account                                                         | SEC-4                                                                               |
| AMB-10 | Password hashing parameters                           | argon2id, OWASP-recommended minimum parameters                                                              | SEC-1                                                                               |
| AMB-11 | Session/token lifetime and refresh                    | Short-lived access token (~15 min) + long-lived refresh token (~30 days), with rotation and reuse detection | FR-3.4, FR-3.5, FR-4, SEC-6, SEC-8                                                  |
| AMB-12 | Email change re-verification                          | Required — new email confirmed via link before activating; old email stays active until then                | FR-25.3, FR-25.4, FR-25.5                                                           |

## 10. Out of Scope (Reminder)

Restated from product-spec §6.2 and §13 as a guardrail — none of the following should appear as a
requirement anywhere above:

- Recurring transactions.
- Multi-currency support / currency conversion.
- Receipt/attachment uploads.
- CSV/PDF export and custom date-range report filtering.
- Shared/household accounts.
- Notifications/alerts.
- Self-service account deletion (recorded as a future DI-4/BR-7 requirement, not implemented now).
- Social login (OAuth).
- Configurable budget status thresholds.

## Appendix: Traceability Matrix (product-spec → requirements.md)

| product-spec ID/section      | requirements.md ID(s)                                                  |
| ---------------------------- | ---------------------------------------------------------------------- |
| FR-1                         | FR-1.1, FR-1.2, FR-1.3, FR-1.4, FR-1.5 (AMB-1)                         |
| FR-2                         | FR-2.1, FR-2.2, FR-2.3, FR-2.4                                         |
| FR-3                         | FR-3.1, FR-3.2, FR-3.3, FR-3.4 (AMB-11), FR-3.5 (AMB-11)               |
| FR-4                         | FR-4                                                                   |
| FR-5                         | FR-5.1, FR-5.2, FR-5.3, FR-5.4                                         |
| FR-6                         | FR-6                                                                   |
| FR-7                         | FR-7.1, FR-7.2, FR-7.3, FR-7.4, FR-7.5                                 |
| FR-8                         | FR-8.1, FR-8.2, FR-8.3                                                 |
| FR-9                         | FR-9                                                                   |
| FR-10                        | FR-10                                                                  |
| FR-11                        | FR-11.1, FR-11.2, FR-11.3, FR-11.4, FR-11.5                            |
| FR-12                        | FR-12.1, FR-12.2, FR-12.3                                              |
| FR-13                        | FR-13                                                                  |
| FR-14                        | FR-14                                                                  |
| FR-15                        | FR-15.1                                                                |
| FR-16                        | FR-16                                                                  |
| FR-17                        | FR-17                                                                  |
| FR-17a                       | FR-17a.1, FR-17a.2, FR-17a.3, FR-17a.4, FR-17a.5                       |
| FR-18                        | FR-18.1, FR-18.2, FR-18.3                                              |
| FR-19                        | FR-19.1, FR-19.2                                                       |
| FR-20                        | FR-20.1, FR-20.2                                                       |
| FR-21                        | FR-21.1, FR-21.2, FR-21.3                                              |
| FR-22                        | FR-22                                                                  |
| FR-23                        | FR-23.1, FR-23.2                                                       |
| FR-24                        | FR-24.1, FR-24.2                                                       |
| FR-25                        | FR-25.1, FR-25.2, FR-25.3 (AMB-12), FR-25.4 (AMB-12), FR-25.5 (AMB-12) |
| FR-26                        | FR-26.1, FR-26.2 (AMB-2), FR-26.3 (AMB-1)                              |
| FR-27                        | FR-27                                                                  |
| §10 Performance              | NFR-1                                                                  |
| §10 Reliability              | NFR-2                                                                  |
| §10 Data integrity           | DI-5                                                                   |
| §10 Usability                | NFR-3                                                                  |
| §10 Accessibility            | NFR-4                                                                  |
| §10 Maintainability          | NFR-5                                                                  |
| §10 Availability             | NFR-6                                                                  |
| §12 (password hashing)       | SEC-1 (AMB-10)                                                         |
| §12 (resource ownership)     | SEC-2                                                                  |
| §12 (token handling)         | SEC-3 (AMB-8)                                                          |
| §12 (rate limiting)          | SEC-4 (AMB-9)                                                          |
| §12 (HTTPS)                  | SEC-5                                                                  |
| §12 (session/token security) | SEC-6 (AMB-11), SEC-8 (AMB-11)                                         |
| §12 (server-side validation) | SEC-7                                                                  |
| BR-1                         | BR-1 (extended per AMB-5)                                              |
| BR-2                         | BR-2                                                                   |
| BR-3                         | BR-3.1 (AMB-3), BR-3.2 (AMB-6)                                         |
| BR-4                         | BR-4                                                                   |
| BR-5                         | BR-5                                                                   |
| BR-6                         | BR-6                                                                   |
| BR-7                         | BR-7                                                                   |
| BR-8                         | BR-8 (AMB-1)                                                           |

Every product-spec FR and BR appears at least once above; no requirement ID in this document lacks
a `Source` back to product-spec or to a resolved AMB-N decision.
