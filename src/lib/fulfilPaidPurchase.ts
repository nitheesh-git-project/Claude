import type { createAdminClient } from "@/lib/supabase/admin";
import { mirrorEnsureEntitlement } from "@/lib/sessionCreditMirror";
import { DEFAULT_ADMIN_SETTINGS } from "@/lib/adminSettings";

type AdminClient = ReturnType<typeof createAdminClient>;

export type PurchaseKind = "session_package" | "home_visit_package";

/**
 * Everything a paid package purchase needs beyond `payment_status = 'paid'`:
 * its expiry, its credits, and -- for a purchase made from a care plan -- the
 * plan closed as accepted.
 *
 * `record_payment_capture` only marks the row paid. The browser-callback
 * verify routes used to do the rest inline, so a patient who paid and closed
 * the tab (the webhook-only path) was left with a purchase that was paid but
 * had no expiry, no credits to book against and a plan still reading as
 * open. Both paths now call this, and it is idempotent, so whichever arrives
 * second finds the work done.
 *
 * Never throws; a step that fails is logged and reported in the result.
 */
export async function fulfilPaidPurchase(
  admin: AdminClient,
  { kind, purchaseId }: { kind: PurchaseKind; purchaseId: string }
): Promise<{ ok: boolean; entitlementId: string | null }> {
  const table = kind === "session_package" ? "patient_package_purchases" : "home_visit_package_purchases";
  try {
    const { data: purchase, error } = await admin
      .from(table)
      .select("id, package_id, care_plan_version_id, payment_status, paid_at, expires_at")
      .eq("id", purchaseId)
      .maybeSingle();
    if (error || !purchase) {
      console.error("fulfilPaidPurchase: could not read purchase", purchaseId, error?.message);
      return { ok: false, entitlementId: null };
    }
    if (purchase.payment_status !== "paid") return { ok: false, entitlementId: null };

    let ok = true;

    // Validity counts from the moment payment cleared, not from checkout.
    // Claimed on `expires_at is null`, so a second caller never moves a
    // window that is already running.
    if (!purchase.expires_at) {
      const validityDays = await readValidityDays(admin, kind, purchase.package_id);
      const paidMs = purchase.paid_at ? Date.parse(purchase.paid_at) : Date.now();
      const expiresAt = new Date(paidMs + validityDays * 86_400_000).toISOString();
      const { error: expiryError } = await admin
        .from(table)
        .update({ expires_at: expiresAt })
        .eq("id", purchaseId)
        .is("expires_at", null);
      if (expiryError) {
        ok = false;
        console.error("fulfilPaidPurchase: could not set expiry", purchaseId, expiryError.message);
      }
    }

    const entitlementId = await mirrorEnsureEntitlement(
      admin,
      kind === "session_package" ? { packagePurchaseId: purchaseId } : { homeVisitPurchaseId: purchaseId }
    );
    if (!entitlementId) ok = false;

    // Close the recommendation. Claimed on `status = 'active'` so two
    // concurrent callers cannot both accept it, and a plan a therapist
    // withdrew in the meantime is not silently reopened as accepted.
    if (purchase.care_plan_version_id) {
      const { data: version, error: versionError } = await admin
        .from("care_plan_versions")
        .select("id, care_plan_id")
        .eq("id", purchase.care_plan_version_id)
        .maybeSingle();
      if (versionError || !version) {
        ok = false;
        console.error("fulfilPaidPurchase: could not read plan version", purchaseId, versionError?.message);
      } else {
        const acceptedAt = purchase.paid_at ?? new Date().toISOString();
        const { error: acceptError } = await admin
          .from("care_plans")
          .update({
            status: "accepted",
            accepted_version_id: version.id,
            accepted_at: acceptedAt,
            entitlement_id: entitlementId,
            updated_at: new Date().toISOString(),
          })
          .eq("id", version.care_plan_id)
          .eq("status", "active");
        if (acceptError) {
          ok = false;
          console.error(
            "Care plan paid for but could not be marked accepted",
            version.care_plan_id,
            acceptError.message
          );
        }
      }
    }

    return { ok, entitlementId };
  } catch (err) {
    console.error("fulfilPaidPurchase threw", purchaseId, err);
    return { ok: false, entitlementId: null };
  }
}

/** The package's own validity, falling back to the site-wide default. */
async function readValidityDays(admin: AdminClient, kind: PurchaseKind, packageId: string): Promise<number> {
  const isOnline = kind === "session_package";
  const [{ data: pkg }, { data: settings }] = await Promise.all([
    admin
      .from(isOnline ? "treatment_category_packages" : "home_visit_packages")
      .select("validity_days")
      .eq("id", packageId)
      .maybeSingle(),
    admin
      .from("site_settings")
      .select("package_default_validity_days, home_visit_default_validity_days")
      .maybeSingle(),
  ]);
  const fallback = isOnline
    ? settings?.package_default_validity_days ?? DEFAULT_ADMIN_SETTINGS.packageDefaultValidityDays
    : settings?.home_visit_default_validity_days ?? DEFAULT_ADMIN_SETTINGS.homeVisitDefaultValidityDays;
  return pkg?.validity_days ?? fallback;
}
