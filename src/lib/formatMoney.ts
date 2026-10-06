// One way to print an amount of money. Amounts are integer paise everywhere
// (CLAUDE.md); this turns them into the rupee figure a person reads.
//
// Thirty components each had their own `(paise / 100).toLocaleString()`, and
// they disagreed: one printed ₹3,118.8, another ₹3,118.80, a third rounded to
// ₹3,119. A whole number of rupees prints with no decimals (₹499); anything
// with paise always prints two (₹3,118.80), never one.

export function formatRupees(paise: number): string {
  const value = Math.round(Number.isFinite(paise) ? paise : 0) / 100;
  return value.toLocaleString(
    "en-IN",
    Number.isInteger(value)
      ? { maximumFractionDigits: 0 }
      : { minimumFractionDigits: 2, maximumFractionDigits: 2 }
  );
}

/** `formatRupees` with the rupee sign. */
export function formatInr(paise: number): string {
  return `₹${formatRupees(paise)}`;
}
