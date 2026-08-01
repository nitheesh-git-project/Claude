// Pure aggregation for rating displays -- kept separate so the same math
// backs the therapist dashboard's own readout and both admin profile pages
// without a 3rd copy of it, and so it's testable without rendering
// anything. The public-page equivalent lives in two SQL views
// (public_therapist_profiles, public_rating_summary) instead of here,
// since those need to run without an authenticated session at all.

export function computeRatingAggregate(
  rows: { rating: number | null; excluded: boolean }[]
): { average: number | null; count: number; excludedCount: number } {
  const included = rows.filter((r) => r.rating !== null && !r.excluded);
  const excludedCount = rows.filter((r) => r.rating !== null && r.excluded).length;
  if (included.length === 0) {
    return { average: null, count: 0, excludedCount };
  }
  const sum = included.reduce((total, r) => total + (r.rating as number), 0);
  return {
    average: Math.round((sum / included.length) * 100) / 100,
    count: included.length,
    excludedCount,
  };
}
