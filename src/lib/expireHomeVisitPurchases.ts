import type { createAdminClient } from "@/lib/supabase/admin";

type AdminClient = ReturnType<typeof createAdminClient>;

// The home-visit twin of expirePackagePurchases.ts. Same reasoning applies
// unchanged: there is no cron or background worker in this deployment (see
// AGENTS.md/README), so anything that needs to happen "when time passes"
// runs as a cheap, idempotent sweep at the top of whichever dashboard page
// renders next. Concurrent sweeps are safe -- the UPDATE's own WHERE clause
// only matches rows still genuinely due, so a second sweep finds nothing
// left to do.
//
// bookHomeVisitSession() blocks new bookings past expires_at regardless of
// this column, as a guard against the sweep simply not having run yet on a
// brand-new request. This exists so `status` itself stays true for anything
// that reads it directly: the admin Programmes filter, and the patient
// widget's status pill.
export async function expireDueHomeVisitPurchases(admin: AdminClient): Promise<void> {
  const { data: expired } = await admin
    .from("home_visit_package_purchases")
    .update({ status: "expired" })
    .eq("status", "active")
    .not("expires_at", "is", null)
    .lte("expires_at", new Date().toISOString())
    .select("id");

  if (!expired || expired.length === 0) return;

  const { error: eventError } = await admin.from("home_visit_purchase_events").insert(
    expired.map((p) => ({
      purchase_id: p.id,
      event_type: "expired" as const,
      actor_id: null,
      detail: {},
    }))
  );
  if (eventError) {
    console.error("Failed to log expired events for home visit purchases", expired, eventError);
  }
}
