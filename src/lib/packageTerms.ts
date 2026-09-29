import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * The terms a patient actually bought, rather than the ones on sale today.
 *
 * `session_entitlements.package_snapshot` has always held the whole catalog
 * row as it stood at purchase, frozen by trigger -- and the booking rules
 * were being read from the *live* row anyway. So an admin editing a
 * programme changed the contract under everybody who had already bought it:
 * a package sold as "twice a week, 48 hours apart, 45-minute sessions"
 * silently became whatever the row says now, including for a patient
 * half-way through it. Nothing on any screen said so, and the patient's own
 * Programmes screen went on describing what they bought.
 *
 * The same reasoning `sessions_granted` and `package_snapshot` are frozen
 * for, applied to the rules that decide when those sessions may be used --
 * which is the half that was left live.
 *
 * Resolution order, and the fallback is deliberate:
 *   1. the purchase's own frozen snapshot;
 *   2. the live package row.
 *
 * Two is not a shrug. A purchase made before the ledger backfill ran has no
 * snapshot, and the live row is the only description of it that exists;
 * refusing to book would punish a patient for a migration. It is also why
 * `source` is returned -- a caller that wants to say "these are the terms
 * you bought" can tell whether that is actually true.
 */
export type PackageTerms = {
  sessionDurationMinutes: number | null;
  minGapHours: number | null;
  maxSessionsPerWeek: number | null;
  /** Where these came from, so a caller need not guess. */
  source: "snapshot" | "live" | "none";
};

const EMPTY: PackageTerms = {
  sessionDurationMinutes: null,
  minGapHours: null,
  maxSessionsPerWeek: null,
  source: "none",
};

/**
 * Pull the terms out of a stored snapshot blob.
 *
 * Dependency-free and separately tested, because the blob is `to_jsonb()` of
 * whatever the catalog row looked like on the day -- so a column added since
 * is simply absent from an older snapshot, and a column *removed* since is
 * still in it. Reading it has to tolerate both without inventing a value:
 * an absent key is null, never a default, or a programme sold with no weekly
 * cap would acquire one the first time somebody set one on the live row.
 */
export function termsFromSnapshot(snapshot: unknown): PackageTerms {
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) {
    return EMPTY;
  }
  const row = snapshot as Record<string, unknown>;

  // An empty jsonb is what the column defaults to, and it means the
  // snapshot was never written rather than "a package with no rules".
  if (Object.keys(row).length === 0) return EMPTY;

  const num = (value: unknown): number | null => {
    if (value === null || value === undefined || value === "") return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  };

  // The two catalogs name these differently -- a session package has
  // `session_duration_minutes` / `max_sessions_per_week`, a home-visit
  // package `visit_duration_minutes` / `max_visits_per_week` -- and a
  // snapshot is `to_jsonb()` of whichever row it came from. Reading both
  // names here is what lets one resolver serve both, rather than two that
  // can grow different ideas of what a frozen term means.
  return {
    sessionDurationMinutes: num(row.session_duration_minutes ?? row.visit_duration_minutes),
    minGapHours: num(row.min_gap_hours),
    maxSessionsPerWeek: num(row.max_sessions_per_week ?? row.max_visits_per_week),
    source: "snapshot",
  };
}

/**
 * The terms for one session-package purchase, snapshot first.
 *
 * Read in its own isolated call rather than joined into a caller's existing
 * select: `session_entitlements` is the newer table and this must degrade to
 * the live row on a database that has not been backfilled, not take the
 * booking down with it.
 */
export async function readPackageTerms(
  admin: SupabaseClient,
  purchaseId: string,
  packageId: string | null
): Promise<PackageTerms> {
  try {
    const { data: entitlement } = await admin
      .from("session_entitlements")
      .select("package_snapshot")
      .eq("legacy_purchase_id", purchaseId)
      .maybeSingle();

    const fromSnapshot = termsFromSnapshot(entitlement?.package_snapshot);
    if (fromSnapshot.source === "snapshot") return fromSnapshot;
  } catch (err) {
    // A missing table or column is the unmigrated case, and falling through
    // to the live row is the right answer for it. Logged rather than
    // silent, because falling through *routinely* would mean the freeze is
    // not actually in force.
    console.error("Could not read frozen package terms for purchase", purchaseId, err);
  }

  if (!packageId) return EMPTY;

  const { data: live } = await admin
    .from("treatment_category_packages")
    .select("session_duration_minutes, min_gap_hours, max_sessions_per_week")
    .eq("id", packageId)
    .maybeSingle();

  if (!live) return EMPTY;
  return {
    sessionDurationMinutes: live.session_duration_minutes ?? null,
    minGapHours: live.min_gap_hours ?? null,
    maxSessionsPerWeek: live.max_sessions_per_week ?? null,
    source: "live",
  };
}

/** The home-visit half. Same rules, different table and column names. */
export async function readHomeVisitPackageTerms(
  admin: SupabaseClient,
  purchaseId: string,
  packageId: string | null
): Promise<PackageTerms> {
  try {
    const { data: entitlement } = await admin
      .from("session_entitlements")
      .select("package_snapshot")
      .eq("legacy_home_visit_purchase_id", purchaseId)
      .maybeSingle();

    const fromSnapshot = termsFromSnapshot(entitlement?.package_snapshot);
    if (fromSnapshot.source === "snapshot") return fromSnapshot;
  } catch (err) {
    console.error(
      "Could not read frozen home-visit package terms for purchase",
      purchaseId,
      err
    );
  }

  if (!packageId) return EMPTY;

  const { data: live } = await admin
    .from("home_visit_packages")
    .select("visit_duration_minutes, min_gap_hours, max_visits_per_week")
    .eq("id", packageId)
    .maybeSingle();

  if (!live) return EMPTY;
  return {
    sessionDurationMinutes: live.visit_duration_minutes ?? null,
    minGapHours: live.min_gap_hours ?? null,
    maxSessionsPerWeek: live.max_visits_per_week ?? null,
    source: "live",
  };
}
