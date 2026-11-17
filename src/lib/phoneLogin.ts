// Sign-in with a phone code, as pure rules (tested without Supabase).
//
// Built ready and switched OFF (Settings -> Sign-in & Security -> Phone
// sign-in, `phone_login_controls`): texting a code needs an SMS provider set
// up on the Supabase project and, in India, a DLT-registered sender -- which
// needs the company registration. Until an admin switches it on, no screen
// offers it and the routes refuse.
//
// Who may use it (owner's decision, 2026-11-17): patients, therapists and
// hospitals. **Admins never** -- they sign in with email and password only.
// That is enforced twice, not by hiding a button:
//   1. /api/auth/phone/send never asks Supabase to text a code to a number
//      whose account is an admin's (and answers exactly as for any number,
//      so nobody learns which numbers are admins);
//   2. the admin guard (requireAdmin.ts) refuses an admin session that was
//      started with a one-time code (`amr` method "otp"), so even a code
//      obtained some other way -- Supabase's API is reachable with the
//      public key -- never opens the back office.
//
// Only accounts that have linked and verified their number can use it (the
// number lives on the Supabase user, set through a verified phone change from
// the profile). A number with no account gets the same neutral answer and no
// code: phone sign-in never creates an account, so it cannot be used to
// learn who is registered, and nobody ends up without the email the clinic's
// receipts and legal notices go to.

import { toWhatsAppNumber } from "@/lib/whatsappRules";

export type PhoneLoginRole = "patient" | "therapist" | "hospital";

export const PHONE_LOGIN_ROLES: readonly PhoneLoginRole[] = ["patient", "therapist", "hospital"];

export function roleMayUsePhone(role: unknown): role is PhoneLoginRole {
  return role === "patient" || role === "therapist" || role === "hospital";
}

/** A typed or stored number in the E.164 form Supabase keeps ("+919876543210"). */
export function toE164(value: string | null | undefined): string | null {
  const digits = toWhatsAppNumber(value);
  return digits ? `+${digits}` : null;
}

/** A code exactly as Supabase sends it: six digits. */
export function cleanOtp(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const code = value.replace(/\s+/g, "");
  return /^\d{6}$/.test(code) ? code : null;
}

/** Whether a session was started with a one-time code, read from the JWT's
 *  `amr` claim (GoTrue lists each method used: "password", "otp",
 *  "recovery"...). An unreadable claim counts as not -- the admin guard uses
 *  this to refuse, and refusing every admin on a malformed token would lock
 *  the clinic out of its own back office. */
export function sessionUsedOtp(amr: unknown): boolean {
  if (!Array.isArray(amr)) return false;
  return amr.some((entry) => {
    const method = typeof entry === "string" ? entry : entry && typeof entry === "object" ? (entry as { method?: unknown }).method : null;
    return method === "otp";
  });
}

/** The claims of an access token, without verifying it -- only for a token
 *  the server has ALREADY verified with Supabase (getUser) in the same
 *  request. Null when it is not a JWT. */
export function decodeJwtClaims(token: string | null | undefined): Record<string, unknown> | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    // atob, not Buffer: this also runs where Node's Buffer is absent.
    const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const binary = atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
    const json = new TextDecoder().decode(Uint8Array.from(binary, (c) => c.charCodeAt(0)));
    const claims = JSON.parse(json);
    return claims && typeof claims === "object" ? (claims as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export type SendDecision = { send: true } | { send: false; reason: "no_account" | "admin" | "not_allowed" | "inactive" };

/** Whether to ask Supabase to text a code to this account. Every "no" is
 *  answered to the person exactly like a "yes". */
export function decideSend(account: { role: string | null; active: boolean | null } | null): SendDecision {
  if (!account || !account.role) return { send: false, reason: "no_account" };
  if (account.role === "admin") return { send: false, reason: "admin" };
  if (!roleMayUsePhone(account.role)) return { send: false, reason: "not_allowed" };
  if (account.active === false) return { send: false, reason: "inactive" };
  return { send: true };
}

/** What the person is told after asking for a code, whatever happened. */
export const NEUTRAL_SENT = "If this number is linked to an account, we've texted it a 6-digit code. It works for 10 minutes.";

export type PhoneLoginControls = { enabled: boolean };
export const DEFAULT_PHONE_LOGIN_CONTROLS: PhoneLoginControls = { enabled: false };

export function parsePhoneLoginControls(row: { enabled?: boolean | null } | null | undefined): PhoneLoginControls {
  return { enabled: row?.enabled === true };
}
