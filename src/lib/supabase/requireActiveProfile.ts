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

// The suspension half of the check above, without the approval gate.
//
// Used only by the home-visit purchase routes. A self-signup patient starts
// approved = false, so requiring approval there would mean nobody could buy
// a home visit on the same visit they discovered it -- they would sign up,
// be told to wait for a human, and mostly not come back. For that product
// the gate buys nothing anyway: a completed Razorpay payment against an
// address inside a serviceable pincode is itself the vetting `approved`
// provides, and an admin still assigns a therapist before anyone travels.
// /api/patient/register-via-referral already applies the same judgement from
// the other direction, setting approved = true because the admin vetted the
// patient by another route.
//
// Suspension is still enforced, so a suspended account cannot buy its way
// back in. Do not reach for this in place of isProfileActiveAndApproved on
// any other route -- everywhere else, the approval gate is doing real work.
export async function isProfileActive(userId: string): Promise<boolean> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("profiles")
    .select("active")
    .eq("id", userId)
    .single();
  return data?.active !== false;
}
