import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Suspending a patient/therapist (profiles.active = false) is meant to lock
// them out entirely (see the column's own comment in supabase/schema.sql),
// but that was previously only enforced by the dashboard-navigation proxy -
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
//
// Three answers, not two: `null` means the read failed and nothing is known.
// It used to discard the error, so a failed read evaluated as active AND
// approved -- the check failed open exactly when it could not be run. A
// caller writing `if (!(await isProfileActiveAndApproved(id)))` now refuses
// on null as well (fail closed); the callers that can, answer null with
// `profileCheckUnavailable()` so the person is told to retry rather than
// that they are suspended.
export async function isProfileActiveAndApproved(userId: string): Promise<boolean | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("profiles")
    .select("active, approved")
    .eq("id", userId)
    .single();
  if (error) return error.code === "PGRST116" ? false : null;
  if (!data) return false;
  return data.active === true && data.approved === true;
}

/** The 503 every caller of the three checks here answers `null` with. */
export function profileCheckUnavailable(): NextResponse {
  return NextResponse.json(
    { error: "We couldn't check your account just now. Please try again." },
    { status: 503 }
  );
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
//
// Null when the read failed -- see isProfileActiveAndApproved.
export async function isProfileActive(userId: string): Promise<boolean | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("profiles")
    .select("active")
    .eq("id", userId)
    .single();
  if (error) return error.code === "PGRST116" ? false : null;
  if (!data) return false;
  return data.active === true;
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
//
// Null when the read failed -- see isProfileActiveAndApproved.
export async function isPatientProfile(userId: string): Promise<boolean | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .single();
  if (error) return error.code === "PGRST116" ? false : null;
  return data?.role === "patient";
}

/**
 * `isProfileActive` and `isPatientProfile` in one read, for the routes on the
 * path to a payment sheet. They were two sequential queries against the same
 * row on every checkout call -- `/api/appointments/create` and
 * `/api/razorpay/create-order` each paid for both, back to back, while the
 * patient watched a spinner. Same answers, same order (suspension first, so a
 * suspended account is told that rather than "wrong role"), one round trip.
 */
export type PatientCheckoutStanding = "ok" | "unavailable" | "suspended" | "not_patient";

export async function readPatientCheckoutStanding(
  userId: string
): Promise<PatientCheckoutStanding> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("profiles")
    .select("role, active")
    .eq("id", userId)
    .single();
  // A failed read is not a refusal; PGRST116 is the one genuine "no row",
  // which isProfileActive answers as not-active.
  if (error) return error.code === "PGRST116" ? "suspended" : "unavailable";
  if (!data || data.active !== true) return "suspended";
  if (data.role !== "patient") return "not_patient";
  return "ok";
}

// Unlocks a self-signup patient once a payment of theirs has been captured --
// the vetting a human admin would otherwise give. Called by both verify
// routes, the webhook (for a patient who paid and closed the tab) and
// confirm-free. It used to fire on the first Pay tap, which handed a new
// patient the dashboard after one cancelled payment sheet; now a locked
// account is unlocked by a payment, or by /api/patient/payment-try once
// `site_settings.payment_tries_before_access` tries have failed (see
// src/lib/paymentTries.ts). A standalone /patient/register signup, with no
// payment at all, still waits on a human. Idempotent and best-effort: never
// let this failing undo a payment that succeeded.
export async function approvePatientAfterPayment(userId: string): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin
    .from("profiles")
    .update({ approved: true })
    .eq("id", userId)
    .eq("approved", false);
  if (error) {
    console.error("Failed to unlock patient after a captured payment", userId, error);
  }
}

/**
 * Why a role-gated self-service route refused -- named, not a boolean.
 *
 * `not_this_role` stays deliberately opaque in what the caller is told, for
 * the same reason the admin guard's `forbidden` does. The other three are
 * facts about the caller's own account that they are entitled to, and that
 * they can act on: a suspended therapist needs to ring the clinic, one
 * awaiting approval needs to wait, and a check that did not complete needs
 * retrying. Collapsing all four into 403 "Forbidden" is what made a
 * therapist whose application had not been approved yet read the same as
 * one who had been suspended.
 */
export type ProfileStandingReason =
  | "unavailable"
  | "not_this_role"
  | "not_approved"
  | "suspended";

export type ProfileStanding =
  | { ok: true }
  | { ok: false; reason: ProfileStandingReason };

/**
 * The one answer to "may this account act as a <role> right now".
 *
 * It exists because the four checks it replaces were each written inline at
 * the route that needed one, and every one of them was missing something
 * different: the two roster routes checked role and `active` but never
 * `approved`, so a therapist whose application had not been approved could
 * publish a working week and book leave; the therapist draft route checked
 * role alone; and the patient draft route checked nothing at all beyond
 * being signed in, so a suspended patient could still rewrite their own
 * health record. None of that was reachable through the UI -- all four are
 * a session cookie and a direct POST, which is exactly the reach
 * `requireActiveProfile` was added for in the first place.
 *
 * A named helper rather than four more inline blocks is the point: a grep
 * for this function name is how the next audit finds the next gap, and an
 * inline `profile.active === false` is invisible to that grep even when it
 * is correct.
 *
 * `approved` is required for every self-service role. Admin is the one
 * exception in this codebase and has its own guard (`getAdminUser`), which
 * documents why: an admin is promoted by hand rather than through the
 * signup queue, so gating them on approval locks out the people it protects.
 */
export async function getProfileStanding(
  userId: string,
  role: "patient" | "therapist" | "hospital"
): Promise<ProfileStanding> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("profiles")
    .select("role, active, approved")
    .eq("id", userId)
    .single();

  // A read that failed is not a caller who is not allowed -- the rule this
  // codebase already holds for the admin guard and for the delete that
  // removed nothing. PGRST116 is the one genuine "no such row".
  if (error && error.code !== "PGRST116") return { ok: false, reason: "unavailable" };
  if (!data) return { ok: false, reason: "not_this_role" };

  if (data.role !== role) return { ok: false, reason: "not_this_role" };
  // Suspension is checked before approval: an account can be both, and
  // suspension is the one that decides what they are told to do about it.
  if (data.active === false) return { ok: false, reason: "suspended" };
  if (data.approved === false) return { ok: false, reason: "not_approved" };
  return { ok: true };
}

/**
 * What to say, and with which status, for a refused standing.
 *
 * One mapping rather than a sentence per route, so two screens cannot
 * describe the same account state two ways. 503 for `unavailable` marks it
 * retryable, matching the admin guard's own treatment of that outcome.
 */
export function describeProfileStanding(reason: ProfileStandingReason): {
  status: number;
  error: string;
} {
  switch (reason) {
    case "unavailable":
      return {
        status: 503,
        error: "We couldn't check your account just now. Please try again.",
      };
    case "suspended":
      return {
        status: 403,
        error:
          "Your account is suspended, so this can't be changed. Please contact the clinic.",
      };
    case "not_approved":
      return {
        status: 403,
        error:
          "Your account is still waiting to be approved, so this can't be changed yet.",
      };
    case "not_this_role":
      return { status: 403, error: "Forbidden" };
  }
}
