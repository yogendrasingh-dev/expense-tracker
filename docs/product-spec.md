# Expense Tracker — Product Specification

Status: Draft v1
Owner: Yogendra Singh
Last updated: 2026-08-18

## 1. Product Vision

A production-quality personal finance web application that helps an individual understand and
control where their money goes. Users record expenses and income, organize them with categories,
set monthly budgets, and see their financial picture at a glance through a dashboard and reports.
The product favors clarity and trustworthiness of data over breadth of features — it should feel
like a tool a user can rely on daily, not a spreadsheet replacement bolted onto a bank feed.

## 2. Problem Statement

Most people do not have a simple, low-friction way to see where their money went last month, know
whether they're on track against a budget, or spot spending trends before they become a problem.
Spreadsheets require manual discipline and offer no real-time feedback; many existing apps are
either too complex (requiring bank-account linking and trusting a third party with credentials) or
too simplistic (no budgeting or reporting). This product provides a manually-entered, private,
single-owner record of income and expenses with just enough structure (categories, budgets,
reports) to turn raw transactions into decisions.

## 3. Target Users

- **Primary persona — the Individual Budgeter**: a single person tracking their own personal
  finances. They want to log expenses/income quickly, assign them to categories, set a monthly
  spending limit per category, and check a dashboard to see how they're doing.
- Out of scope for v1: households or multiple people sharing one set of finances. The data model is
  intentionally single-owner (every record belongs to exactly one user), but is designed so that a
  future "household/shared budget" feature could be added without a full rewrite (see
  [13. Future Features](#13-future-features)).

## 4. Goals

- Make it fast to record an expense or income entry (target: under 15 seconds for a typical entry).
- Give users an accurate, categorized view of their spending and income at any time.
- Let users set a monthly budget per category and see clearly whether they are under, near, or over
  budget.
- Surface trends (spending by category, income vs. expense over time) without requiring the user to
  build their own reports.
- Be trustworthy: no silent data loss, correct arithmetic, clear validation errors.

## 5. Non-Goals

The following are explicitly **not** goals for this product (v1 or otherwise unplanned):

- Linking to bank accounts or payment providers (e.g., Plaid, Yodlee) to auto-import transactions.
- Multi-tenant B2B / team expense management (e.g., corporate expense reports, approval workflows).
- Investment tracking, net worth tracking, or tax preparation.
- Native mobile apps (the product is a web application; responsive design is a goal, native apps
  are not).
- Automatic currency conversion or multi-currency aggregation.

## 6. MVP Scope

### 6.1 In Scope

- User registration and login (email + password, with required email verification).
- Expense management: create, view, edit, delete expense entries.
- Income management: create, view, edit, delete income entries.
- Categories: default starter categories provided on signup; users can create, edit, and delete
  their own categories.
- Budgets: one budget per category per calendar month; users can create, edit, delete budgets and
  see spend-vs-budget status.
- Dashboard: at-a-glance summary of current month's income, expenses, net, and budget status.
- Reports: spending-by-category breakdown and income-vs-expense trend, over a fixed set of preset
  periods.
- User settings: profile info, base currency selection, password change.

### 6.2 Out of Scope (Deferred to Future Features)

- Recurring transactions (automatic generation of repeating expenses/income).
- Multi-currency support (each user has exactly one base currency).
- Receipt/attachment uploads.
- CSV/PDF export and custom date-range filtering in reports.
- Shared/household accounts.
- Notifications/alerts (e.g., "you're over budget").

## 7. Core Features

### 7.1 Authentication & User Accounts

Users register with an email address and password. A verification email must be confirmed before
the account has full access to the application (see [12. Security Requirements](#12-security-requirements)
for handling of unverified accounts). Users can log in, log out, and reset a forgotten password.

### 7.2 Expense Management

Users record expenses with an amount, category, date, and optional description/note. Expenses can
be listed (with basic filtering by category and date range), viewed, edited, and deleted.

### 7.3 Income Management

Users record income with an amount, category (e.g., Salary, Freelance, Gift), date, and optional
description/note. Income entries support the same list/view/edit/delete operations as expenses.

### 7.4 Categories

Categories classify both expenses and income. On signup, a user's account is seeded with a default
set of common categories (e.g., Food, Rent, Transport, Utilities, Entertainment, Salary, Other).
Users can add their own categories, edit any category's name, and delete categories. Default
categories are not special-cased — a user may edit or delete them like any other (see
[11. Business Rules](#11-business-rules) for what happens when a category in use is deleted).

### 7.5 Budgets

A budget is an amount set for a specific category for a specific calendar month. The system
compares actual expenses in that category/month against the budgeted amount and reports status
(under budget, near limit, over budget).

### 7.6 Dashboard

A single summary view showing, for the current month: total income, total expenses, net
(income − expenses), and a budget status summary across categories with active budgets.

### 7.7 Reports

Two report types for MVP:

- **Spending by category** — breakdown of expense totals grouped by category for a selected preset
  period.
- **Income vs. expense trend** — a time-series comparison of income and expense totals across a
  selected preset period.

Preset periods for MVP: This Month, Last Month, Last 3 Months, This Year.

### 7.8 User Settings

Users can view/update their profile (name, email), set their base currency (chosen once at signup,
editable in settings — see [11. Business Rules](#11-business-rules) on what changing it means),
and change their password.

## 8. User Journeys

1. **Sign up and get started**: A new user registers with email/password → receives a verification
   email → verifies their account → logs in → sees their account seeded with default categories →
   lands on an empty dashboard.
2. **Record a transaction**: A logged-in user adds a new expense (amount, category, date) → the
   expense appears in their expense list → the dashboard's current-month totals update.
3. **Set and track a budget**: A user sets a monthly budget of $400 for "Food" → over the month they
   log several food expenses → the dashboard shows their spend against the $400 budget and flags
   when they are near or over the limit.
4. **Review spending trends**: A user opens the Reports section → views a spending-by-category
   breakdown for "This Month" → switches to the income-vs-expense trend for "This Year" to see how
   their finances have moved over time.
5. **Manage categories**: A user renames a default category, adds a new custom category, and
   deletes a category they no longer use, then continues logging transactions using the updated
   list.

## 9. Functional Requirements

Grouped by feature area. IDs are stable identifiers for traceability into later technical specs,
implementation tasks, and tests.

**Authentication & Accounts**

- FR-1: The system shall allow a new user to register with an email and password.
- FR-2: The system shall send a verification email upon registration and require the link to be
  used before granting full account access.
- FR-3: The system shall allow a verified user to log in with email and password.
- FR-4: The system shall allow a user to log out.
- FR-5: The system shall allow a user to request a password reset via email.
- FR-6: The system shall seed a new user's account with a default set of categories upon
  successful registration.

**Expenses**

- FR-7: The system shall allow a user to create an expense with amount, category, date, and
  optional description. The date must not be in the future (see BR-8).
- FR-8: The system shall allow a user to view a list of their expenses, filterable by category and
  date range.
- FR-9: The system shall allow a user to edit an existing expense they own.
- FR-10: The system shall allow a user to delete an expense they own.

**Income**

- FR-11: The system shall allow a user to create an income entry with amount, category, date, and
  optional description. The date must not be in the future (see BR-8).
- FR-12: The system shall allow a user to view a list of their income entries, filterable by
  category and date range.
- FR-13: The system shall allow a user to edit an existing income entry they own.
- FR-14: The system shall allow a user to delete an income entry they own.

**Categories**

- FR-15: The system shall allow a user to create a custom category.
- FR-16: The system shall allow a user to edit a category's name (default or custom).
- FR-17: The system shall allow a user to delete a category (default or custom) that has no
  associated expenses, income, or budgets.
- FR-17a: The system shall, when a user attempts to delete a category that has associated records,
  require the user to select a replacement category, then reassign all affected records to it and
  delete the original category as a single atomic operation (see BR-3).

**Budgets**

- FR-18: The system shall allow a user to set a monthly budget amount for a category.
- FR-19: The system shall allow a user to edit or delete an existing budget.
- FR-20: The system shall calculate, for a given category and month, total actual spend against the
  budgeted amount and expose a status (under / near limit / over).

**Dashboard**

- FR-21: The system shall display, for the current month, total income, total expenses, and net
  (income − expenses).
- FR-22: The system shall display budget status for each category that has an active budget for the
  current month.

**Reports**

- FR-23: The system shall generate a spending-by-category report for a user-selected preset period
  (This Month, Last Month, Last 3 Months, or This Year).
- FR-24: The system shall generate an income-vs-expense trend report for a user-selected preset
  period (This Month, Last Month, Last 3 Months, or This Year).

**Settings**

- FR-25: The system shall allow a user to view and update their profile (name, email).
- FR-26: The system shall allow a user to select their base currency.
- FR-27: The system shall allow a user to change their password.

## 10. Non-Functional Requirements

- **Performance**: Typical read operations (dashboard, lists, reports) should respond in under
  500ms at expected personal-use data volumes (a few thousand transactions per user).
- **Reliability**: No user-initiated write (create/edit/delete) may silently fail; the user must
  always receive clear success or error feedback.
- **Data integrity**: Monetary calculations (totals, budget comparisons) must be exact — no
  floating-point rounding errors in displayed sums.
- **Usability**: Core actions (add expense, add income, check budget status) must be reachable in
  no more than 2-3 interactions from the dashboard.
- **Accessibility**: UI should meet basic WCAG 2.1 AA expectations (keyboard navigability, sufficient
  color contrast, labeled form inputs) — full audit is out of scope for MVP but should not be
  actively violated.
- **Maintainability**: Business rules (budget calculations, category deletion behavior, etc.) should
  be centrally implemented and covered by automated tests, since this spec will be the basis for a
  test-driven implementation.
- **Availability**: No formal SLA for this learning project; the system should behave correctly and
  predictably rather than optimizing for uptime guarantees.

## 11. Business Rules

- BR-1: Expense and income amounts must be greater than zero.
- BR-2: All monetary values for a given user are recorded and displayed in that user's selected
  base currency; no conversion between currencies is performed.
- BR-3: A category that has existing expenses, income entries, or budgets associated with it cannot
  be deleted outright. To delete such a category, the user must select a replacement category; the
  system then reassigns all affected records to the replacement and deletes the original category,
  as a single atomic (transactional) operation. A category with no associated records may be
  deleted directly with no replacement step.
- BR-4: A budget is uniquely identified by (user, category, month) — a category can have at most one
  budget per calendar month.
- BR-5: Budget status thresholds: "under budget" (< 90% of budgeted amount spent), "near limit"
  (90-100%), "over budget" (> 100%). These thresholds are fixed for all budgets in v1 (not
  user-configurable).
- BR-6: An unverified user account can log in but has restricted access (e.g., can view/resend
  verification, cannot create financial records) until the email is verified.
- BR-7: Self-service account deletion is out of scope for MVP (see [13. Future Features](#13-future-features)).
  When it is implemented, it must delete or anonymize all of that user's expenses, income,
  categories, and budgets — no orphaned records.
- BR-8: Expense and income dates may be any date up to and including today. Dates in the future are
  not permitted; the system rejects such entries with a validation error.

## 12. Security Requirements

- Passwords must be hashed using a strong, adaptive algorithm (e.g., bcrypt or argon2) — plaintext
  or reversibly-encrypted passwords are never stored.
- All authenticated endpoints must verify the requesting user owns the resource being accessed,
  edited, or deleted (no cross-user data access).
- Email verification tokens and password reset tokens must be single-use, time-limited, and
  cryptographically random.
- Authentication endpoints (login, registration, password reset) must be rate-limited to mitigate
  brute-force and enumeration attacks.
- All communication must occur over HTTPS in any deployed environment.
- Session/token-based authentication must use secure, expiring credentials (exact mechanism — JWT
  vs. server-side sessions — is a technical decision for a later spec, not this product spec).
- Input validation must be enforced server-side for all user-supplied data, regardless of
  client-side validation.

## 13. Future Features (Post-MVP)

- Recurring transactions (auto-generated repeating expenses/income).
- Multi-currency support with conversion.
- Shared/household accounts with multiple users collaborating on shared budgets and categories.
- Receipt/attachment uploads on expenses.
- CSV import/export and custom date-range report filtering.
- Budget periods other than monthly (weekly, yearly, custom range).
- Notifications/alerts (e.g., budget threshold warnings, email digests).
- Social login (e.g., Google OAuth) as an alternative to email/password.
- Self-service account deletion (with cascading delete of all owned data).
- Configurable budget status thresholds (per-budget custom warning percentage, instead of the
  fixed 90%/100% default).

## 14. Acceptance Criteria

Representative Given/When/Then criteria, mapped to the functional requirements above. The full set
will be expanded during implementation planning; these establish the pattern.

- **AC for FR-1/FR-2** (registration + verification):
  Given a new visitor provides a valid email and password,
  When they submit the registration form,
  Then an account is created in an unverified state and a verification email is sent;
  And the user cannot access financial features until they click the verification link.

- **AC for FR-7** (create expense):
  Given a verified, logged-in user on the "Add Expense" form,
  When they submit an amount > 0, a valid category, and a date,
  Then a new expense is saved and appears in their expense list and in current-month dashboard
  totals.

- **AC for FR-17a / BR-3** (delete category in use):
  Given a category that has one or more expenses assigned to it,
  When the user attempts to delete that category and selects a replacement category,
  Then all affected expenses, income entries, and budgets are reassigned to the replacement
  category and the original category is deleted, as a single atomic operation.

- **AC for FR-20** (budget status):
  Given a user has set a $400 monthly budget for "Food" and logged $380 in Food expenses this
  month,
  When the user views their dashboard,
  Then the Food budget shows a "near limit" status (per BR-5's threshold).

- **AC for FR-23** (spending-by-category report):
  Given a user has expenses across multiple categories in the current month,
  When they open the "Spending by Category" report for "This Month,"
  Then the report shows a total per category that sums to the user's total expenses for that
  period.

## Appendix: Open Questions & Assumptions Log

All product-owner decisions made to date are recorded in-line in the relevant sections above. The
five assumptions originally logged here (report preset periods, budget status thresholds,
future-dated transactions, category deletion behavior, and account deletion in MVP) have been
resolved by the product owner and incorporated directly into §7.7, §13, BR-3, BR-5, BR-7, BR-8,
FR-7, FR-11, FR-17/FR-17a, FR-23, and FR-24. No open assumptions remain at this time.

New entries should be added here as they arise while drafting the next technical spec (API/data
model), so they stay visible rather than getting silently baked into implementation.
