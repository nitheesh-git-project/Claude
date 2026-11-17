// Trusted-patient codes: an admin pre-approves pay later for one named person,
// and that person redeems it from their own account (schema.sql, "Trusted-
// patient codes"). Never a discount -- it moves no money. Dependency-free so
// every rule here is unit-tested.

import { EMAIL_RE } from "@/lib/devReachout";

export const TRUSTED_CODE_RE = /^TRUST-[A-Z0-9]{6}$/;
// No 0/O or 1/I: a code is read aloud over the phone as often as it is pasted.
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const MIN_TRUSTED_REASON = 10;

/** A fresh code from six random draws (the caller passes crypto randomness). */
export function makeTrustedCode(randomInts: (n: number) => number[]): string {
  return "TRUST-" + randomInts(6).map((r) => ALPHABET[Math.abs(r) % ALPHABET.length]).join("");
}

/** What a person typed, as a code: case, spaces and a missing prefix forgiven. */
export function normalizeTrustedCode(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  let s = raw.toUpperCase().replace(/[\s_]/g, "");
  if (!s.startsWith("TRUST-")) s = "TRUST-" + s.replace(/^TRUST/, "");
  return TRUSTED_CODE_RE.test(s) ? s : null;
}

const digits = (s: string) => s.replace(/\D/g, "");

export type TrustedCodeInput = {
  patientName: string;
  reason: string;
  note: string | null;
  email: string | null;
  phone: string | null;
};

export function validateTrustedCodeInput(
  raw: Record<string, unknown>
): { ok: true; value: TrustedCodeInput } | { ok: false; error: string } {
  const text = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const patientName = text(raw.patientName);
  const reason = text(raw.reason);
  const note = text(raw.note) || null;
  const email = text(raw.email).toLowerCase() || null;
  const phone = text(raw.phone) || null;
  if (!patientName || patientName.length > 120) return { ok: false, error: "Give the patient's name." };
  if (reason.length < MIN_TRUSTED_REASON) {
    return {
      ok: false,
      error: `Say why this patient may pay later, in at least ${MIN_TRUSTED_REASON} characters. It is the only record of why the clinic took this on.`,
    };
  }
  if (reason.length > 500) return { ok: false, error: "Keep the reason under 500 characters." };
  if (note && note.length > 1000) return { ok: false, error: "Keep the note under 1,000 characters." };
  if (!email && !phone) {
    return { ok: false, error: "Give the email or phone number of the patient it is for - only that account can use it." };
  }
  if (email && !EMAIL_RE.test(email)) return { ok: false, error: "That email address does not look right." };
  if (phone && digits(phone).length < 8) return { ok: false, error: "That phone number does not look right." };
  return { ok: true, value: { patientName, reason, note, email, phone } };
}

/** Whether the account redeeming is the one the code was made for: the
 *  email (case-insensitive) or the phone (digits only) must match. */
export function trustedCodeMatches(
  code: { match_email: string | null; match_phone: string | null },
  account: { email: string | null; phone: string | null }
): boolean {
  if (code.match_email && account.email && code.match_email.trim().toLowerCase() === account.email.trim().toLowerCase()) {
    return true;
  }
  if (code.match_phone && account.phone) {
    const a = digits(code.match_phone);
    const b = digits(account.phone);
    if (a.length >= 8 && a === b) return true;
  }
  return false;
}
