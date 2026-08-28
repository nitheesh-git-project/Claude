import type { createAdminClient } from "@/lib/supabase/admin";
import { mirrorVoidExpiredBatch } from "@/lib/sessionCreditMirror";

type AdminClient = ReturnType<typeof createAdminClient>;

// Lazily transitions any 'active' package purchase whose expires_at has
// passed into 'expired'. There's no cron or background worker in this
// serverless deployment (see AGENTS.md/README), so this runs as a cheap,
// idempotent sweep at the top of whichever dashboard page renders next
// instead of on a schedule. Concurrent sweeps from different requests are
// safe: the UPDATE's own WHERE clause only ever matches rows still
// genuinely due, so a second sweep simply finds nothing left to do.
//
// bookPackageSession() already blocks new bookings past expires_at
// regardless of this column (belt-and-braces against this sweep just not
// having run yet on a brand-new request) -- this exists so `status` itself
// stays true for anything that *reads* it directly: the admin Purchases
// table's status filter, the "Active Packages" stat, and the patient
// widget's status pill.
export async function expireDuePackagePurchases(admin: AdminClient): Promise<void> {
  const { data: expired } = await admin
    .from("patient_package_purchases")
    .update({ status: "expired" })
    .eq("status", "active")
    .not("expires_at", "is", null)
    .lte("expires_at", new Date().toISOString())
    .select("id");

  if (!expired || expired.length === 0) return;

  const { error: eventError } = await admin.from("package_purchase_events").insert(
    expired.map((p) => ({
      purchase_id: p.id,
      event_type: "expired" as const,
      actor_id: null,
      detail: {},
    }))
  );
  // Void the unused remainder in the ledger. The counters never did this --
  // an expired purchase kept whatever balance it had, and only
  // bookPackageSession's own expires_at check stopped it being spent -- so
  // this is the ledger recording an outcome the counters left implicit.
  // Keyed on the entitlement, so re-running this sweep on every dashboard
  // render voids once.
  await mirrorVoidExpiredBatch(admin, { packagePurchaseIds: expired.map((p) => p.id) });

  if (eventError) {
    console.error("Failed to log expired events for purchases", expired, eventError);
  }
}
