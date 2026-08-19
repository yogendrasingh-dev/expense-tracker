// FR-6: default categories seeded atomically with registration. Locked in from product-spec.md
// §7.4's illustrative example list (resolved during Phase 3 planning).
export const DEFAULT_CATEGORY_NAMES = [
  'Food',
  'Rent',
  'Transport',
  'Utilities',
  'Entertainment',
  'Salary',
  'Other',
] as const;

export function normalizeCategoryName(name: string): string {
  return name.trim().toLowerCase();
}
