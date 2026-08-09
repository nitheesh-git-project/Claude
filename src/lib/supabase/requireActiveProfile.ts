import { createAdminClient } from "@/lib/supabase/admin";

// Suspending a patient/therapist (profiles.active = false) is meant to lock
// them out entirely (see the column's own comment in supabase/schema.sql),
// but that was previously only enforced by the dashboard-navigation proxy —
// a suspended user's still-valid session cookie could keep calling
// self-service API routes directly (devtools, a stale open tab, curl) with
// no server-side check at all. This re-checks the flag at the one point
// every such route already has an authenticated user id, so the suspension
// is actually enforced rather than just a UI gate.
//
// `approved` is checked here for exactly the same reason: both self-serve
// roles (therapist applications and, now, patient registrations) start
// unapproved, and the proxy only gates dashboard *navigation*. Without this,
// a not-yet-approved patient holding a valid session could still call
// /api/razorpay/create-order and friends directly and book a session the
// admin never approved them for.
export async function isProfileActiveAndApproved(userId: string): Promise<boolean> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("profiles")
    .select("active, approved")
    .eq("id", userId)
    .single();
  return data?.active !== false && data?.approved !== false;
}
