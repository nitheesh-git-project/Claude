import type { SupabaseClient } from "@supabase/supabase-js";

type AdminClient = SupabaseClient;

// Makes the credit ledger the number the app believes, without touching a
// single screen.
//
// Every surface that shows a package balance -- the patient's widget, the
// therapist's programme list, both detail modals, the admin Purchases
// table, the bulk scheduler's remaining count -- reads it the same way:
// from a purchase row carrying `session_count` and `sessions_used`, with
// `pending = session_count - sessions_used`. So flipping the source of
// truth does not mean rewriting those consumers. It means replacing
// `sessions_used` on the row, once, where the row is loaded.
//
// The substitution:
//
//     sessions_used := sessions_granted - (granted - reserved - consumed)
//
// `session_count` is deliberately left alone, so a refunded package still
// reads "5 sessions" with none pending rather than silently becoming a
// 2-session package. Voided credits show up as used, which is what a
// patient sees anyway: they are gone.
//
// Three things this does NOT do, each on purpose:
//
//   * It does not change how a session is *claimed*. The compare-and-swap
//     on the counter is still what wins a booking race, with the ledger's
//     own row lock running beside it. Making the ledger the claiming
//     mechanism means deleting the counter writes, which is a separate
//     change with its own risk.
//   * It never applies to a purchase with no entitlement. Such a row keeps
//     its counter, so a database where the backfill has not run behaves
//     exactly as it did before.
//   * It never throws, and falls back to the counter on any failure. A
//     reporting layer that can take down the patient dashboard is worse
//     than one that is briefly out of date.

/** The shape every purchase row shares, whichever table it came from. */
type PackageRow = { id: string; session_count: number; sessions_used: number };
type HomeVisitRow = { id: string; visit_count: number; visits_used: number };

type Balance = { sessionsGranted: number; available: number };

/**
 * Reads the ledger balance for a set of legacy purchases, keyed by purchase
 * id. One query for the whole page rather than one per row -- the admin
 * Purchases table can hold hundreds.
 */
async function loadBalances(
  admin: AdminClient,
  purchaseIds: string[],
  column: "legacy_purchase_id" | "legacy_home_visit_purchase_id"
): Promise<Map<string, Balance>> {
  const out = new Map<string, Balance>();
  if (purchaseIds.length === 0) return out;
  try {
    const { data, error } = await admin
      .from("session_entitlements")
      .select(`${column}, sessions_granted, granted_count, reserved_count, consumed_count`)
      .in(column, purchaseIds);
    if (error) return out;
    for (const row of data ?? []) {
      const r = row as Record<string, unknown>;
      const key = r[column] as string | null;
      if (!key) continue;
      const granted = Number(r.granted_count ?? 0);
      const reserved = Number(r.reserved_count ?? 0);
      const consumed = Number(r.consumed_count ?? 0);
      out.set(key, {
        sessionsGranted: Number(r.sessions_granted ?? 0),
        available: Math.max(0, granted - reserved - consumed),
      });
    }
  } catch {
    // Tables not applied yet, or an unreachable database. Callers fall back
    // to the counter, which is what every screen showed before this
    // existed.
    return out;
  }
  return out;
}

/**
 * Rewrites `sessions_used` on each row from the ledger, when the ledger is
 * authoritative. A no-op when the flag is off, when a row has no
 * entitlement, or when anything fails.
 *
 * Returns the same array shape it was given, so a call site is one line and
 * nothing downstream changes.
 */
export async function applyLedgerSessionBalances<T extends PackageRow>(
  admin: AdminClient,
  rows: T[],
  { authoritative }: { authoritative: boolean }
): Promise<T[]> {
  if (!authoritative || rows.length === 0) return rows;
  const balances = await loadBalances(
    admin,
    rows.map((r) => r.id),
    "legacy_purchase_id"
  );
  if (balances.size === 0) return rows;
  return rows.map((row) => {
    const balance = balances.get(row.id);
    if (!balance) return row;
    return {
      ...row,
      sessions_used: Math.max(0, balance.sessionsGranted - balance.available),
    };
  });
}

/** The home-visit twin. Same substitution against `visits_used`. */
export async function applyLedgerVisitBalances<T extends HomeVisitRow>(
  admin: AdminClient,
  rows: T[],
  { authoritative }: { authoritative: boolean }
): Promise<T[]> {
  if (!authoritative || rows.length === 0) return rows;
  const balances = await loadBalances(
    admin,
    rows.map((r) => r.id),
    "legacy_home_visit_purchase_id"
  );
  if (balances.size === 0) return rows;
  return rows.map((row) => {
    const balance = balances.get(row.id);
    if (!balance) return row;
    return {
      ...row,
      visits_used: Math.max(0, balance.sessionsGranted - balance.available),
    };
  });
}

/** Single-row convenience for the detail routes, which load exactly one. */
export async function applyLedgerSessionBalance<T extends PackageRow>(
  admin: AdminClient,
  row: T,
  opts: { authoritative: boolean }
): Promise<T> {
  const [out] = await applyLedgerSessionBalances(admin, [row], opts);
  return out ?? row;
}

export async function applyLedgerVisitBalance<T extends HomeVisitRow>(
  admin: AdminClient,
  row: T,
  opts: { authoritative: boolean }
): Promise<T> {
  const [out] = await applyLedgerVisitBalances(admin, [row], opts);
  return out ?? row;
}

/**
 * Reads the flag on its own, for the call sites that do not already have
 * parsed settings to hand.
 *
 * Isolated and failing closed, per the migration-dependent-column rule: a
 * database that has not applied the column reads as "not authoritative",
 * which is the safe answer -- it means the app keeps believing the
 * counters, exactly as it did before any of this was built.
 */
export async function readLedgerAuthoritative(admin: AdminClient): Promise<boolean> {
  try {
    const { data, error } = await admin
      .from("site_settings")
      .select("entitlement_ledger_authoritative")
      .maybeSingle();
    if (error) return false;
    return data?.entitlement_ledger_authoritative === true;
  } catch {
    return false;
  }
}
