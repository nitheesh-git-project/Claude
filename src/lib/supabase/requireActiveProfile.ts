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
// Used by the home-visit purchase routes and /api/razorpay/create-order
// (single online session checkout). A self-signup patient starts
// approved = false, so requiring approval there would mean nobody could pay
// for anything on the same visit they discovered the site -- they would
// sign up, be told to wait for a human, and mostly not come back. For these
// routes the gate buys nothing anyway: a completed, signature-verified
// Razorpay payment is itself the vetting `approved` provides -- for a home
// visit that's an address inside a serviceable pincode, for an online
// session it's /api/razorpay/verify, which flips approved to true itself
// the moment the payment lands. /api/patient/register-via-referral already
// applies the same judgement from the other direction, setting
// approved = true because the admin vetted the patient by another route.
//
// Suspension is still enforced, so a suspended account cannot buy its way
// back in. Do not reach for this in place of isProfileActiveAndApproved on
// any route where a real payment isn't the thing granting approval --
// everywhere else, the approval gate is doing real work.
export async function isProfileActive(userId: string): Promise<boolean> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("profiles")
    .select("active")
    .eq("id", userId)
    .single();
  return data?.active !== false;
}

// One auth user carries exactly one role (profiles.id *is* the auth user's
// id, and `role` is a single column), so a therapist, hospital or admin
// session can never also be the patient a booking is for. Booking anyway
// produced a session none of that account's own dashboards could show them
// -- the therapist dashboard lists by therapist_id, the hospital dashboard
// lists referrals, and the proxy bounces a non-patient away from
// /patient/dashboard -- so money moved for something the payer could never
// find again.
//
// The booking wizards say this in the UI (WrongAccountForBooking), but a
// valid session cookie can call these routes directly around it, which is
// the same reasoning that put isProfileActive here in the first place.
// appointments_insert_own carries the matching `role = 'patient'` clause in
// schema.sql for the one path RLS is the only enforcement point for.
//
// Scoped to the routes where a purchase *starts*. The routes that schedule
// against an already-owned purchase (book-with-package, book-package-sessions,
// book-visits) don't need it: a non-patient could never come to own the
// purchase row they require in the first place.
export async function isPatientProfile(userId: string): Promise<boolean> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .single();
  return data?.role === "patient";
}

// Grants the same vetting a human admin would, the moment a self-signup
// patient genuinely tries to pay for a single online session -- reaching
// /api/razorpay/create-order for their own appointment means a real
// Razorpay order was minted, not just a form filled in. (Home-visit and
// package purchases are a separate, stricter judgement -- see
// isProfileActive's own comment -- and don't call this.) Deliberately fires
// on the *attempt*, not a completed payment: a patient who fails or
// abandons checkout after several tries still gets straight into their
// dashboard (with the appointment sitting there as pending payment) rather
// than being bounced to /pending-approval for something a standalone
// /patient/register signup, with no payment intent at all, still has to
// wait on. That distinction -- attempted-to-pay vs merely-registered -- is
// the whole point: it keeps a bare signup from being a free way to reach
// the dashboard while not making a genuinely trying patient wait on a
// human. Idempotent and best-effort: never let this failing block the
// payment flow itself.
export async function approvePatientForGenuinePaymentAttempt(userId: string): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin
    .from("profiles")
    .update({ approved: true })
    .eq("id", userId)
    .eq("approved", false);
  if (error) {
    console.error("Failed to auto-approve patient after a genuine payment attempt", userId, error);
  }
}
