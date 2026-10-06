// Pure aggregation for rating displays -- kept separate so the same math
// backs the therapist dashboard's own readout and both admin profile pages
// without a 3rd copy of it, and so it's testable without rendering
// anything. The public-page equivalent lives in two SQL views
// (public_therapist_profiles, public_rating_summary) instead of here,
// since those need to run without an authenticated session at all.

export function computeRatingAggregate(
  rows: { rating: number | null; excluded: boolean }[]
): {
  average: number | null;
  count: number;
  excludedCount: number;
  /** How many included ratings gave 1, 2, 3, 4 and 5 stars -- index 0 is
   *  one star. Excluded ratings are left out, so the bars add up to `count`. */
  distribution: number[];
} {
  const included = rows.filter((r) => r.rating !== null && !r.excluded);
  const excludedCount = rows.filter((r) => r.rating !== null && r.excluded).length;
  const distribution = [0, 0, 0, 0, 0];
  for (const r of included) {
    const star = Math.round(r.rating as number);
    if (star >= 1 && star <= 5) distribution[star - 1] += 1;
  }
  if (included.length === 0) {
    return { average: null, count: 0, excludedCount, distribution };
  }
  const sum = included.reduce((total, r) => total + (r.rating as number), 0);
  return {
    average: Math.round((sum / included.length) * 100) / 100,
    count: included.length,
    excludedCount,
    distribution,
  };
}
