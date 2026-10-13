/**
 * Why an application was turned down, and finding it again.
 *
 * Declining a patient or therapist signup deletes their account (the email
 * is freed so they can apply again), and declining a hospital inquiry only
 * flipped its status. Neither asked why, so a declined application left
 * nothing behind but one "Declined account" line in the activity log -- the
 * next admin could not tell who had been turned away, or that the person now
 * sitting in Approvals had been turned away last month.
 *
 * So a decline now carries a reason, and `decline_pending_account()` /
 * `decline_b2b_lead()` write a snapshot of the applicant into
 * `declined_applications` (append-only) in the same transaction as the
 * decline. People -> Declined reads it, and Approvals matches each new
 * signup against it (`findPriorDecline`).
 *
 * Rules, shared by the dialog and the routes so they cannot disagree:
 *
 * 1. **A reason is required**, picked from the codes offered for that kind
 *   of applicant. The codes are the CHECK in schema.sql; keep them in step.
 * 2. **"Other" needs a note of at least ten characters** -- the same floor
 *   every other decline in this app holds (a referral, a pay-later
 *   rejection). A note on a listed reason is optional.
 * 3. **The note is capped**, because it is shown on a list.
 */

export type DeclineKind = "patient" | "therapist" | "hospital";

export type DeclineReasonCode =
  | "incomplete_details"
  | "credentials_unverified"
  | "specialty_not_offered"
  | "outside_service_area"
  | "duplicate"
  | "unreachable"
  | "not_a_fit"
  | "other";

export const DECLINE_REASON_LABELS: Record<DeclineReasonCode, string> = {
  incomplete_details: "Incomplete details",
  credentials_unverified: "Credentials couldn't be verified",
  specialty_not_offered: "Specialisation we don't offer",
  outside_service_area: "Outside our service area",
  duplicate: "Duplicate",
  unreachable: "Couldn't reach them",
  not_a_fit: "Not a fit right now",
  other: "Other",
};

/** The chips each kind of applicant is offered, in the order shown. */
export const DECLINE_REASONS_BY_KIND: Record<DeclineKind, DeclineReasonCode[]> = {
  therapist: [
    "credentials_unverified",
    "incomplete_details",
    "specialty_not_offered",
    "duplicate",
    "other",
  ],
  patient: ["incomplete_details", "outside_service_area", "duplicate", "not_a_fit", "other"],
  hospital: ["outside_service_area", "not_a_fit", "unreachable", "duplicate", "other"],
};

export const DECLINE_KIND_LABELS: Record<DeclineKind, string> = {
  patient: "Patient",
  therapist: "Therapist",
  hospital: "Hospital",
};

export const DECLINE_NOTE_MIN_FOR_OTHER = 10;
export const DECLINE_NOTE_MAX_LENGTH = 500;

export function declineReasonLabel(code: string | null | undefined): string {
  if (code && code in DECLINE_REASON_LABELS) {
    return DECLINE_REASON_LABELS[code as DeclineReasonCode];
  }
  return code ? code : "No reason recorded";
}

export type DeclineReasonResult =
  | { ok: true; reasonCode: DeclineReasonCode; note: string | null }
  | { ok: false; error: string };

/** Validates what the dialog (or any caller) sent for a decline of `kind`. */
export function parseDeclineReason(
  kind: DeclineKind,
  input: { reasonCode?: unknown; note?: unknown }
): DeclineReasonResult {
  const code = typeof input.reasonCode === "string" ? input.reasonCode : "";
  if (!code) {
    return { ok: false, error: "Pick a reason for declining." };
  }
  if (!(DECLINE_REASONS_BY_KIND[kind] as string[]).includes(code)) {
    return { ok: false, error: "That reason isn't one of the options." };
  }
  if (input.note !== undefined && input.note !== null && typeof input.note !== "string") {
    return { ok: false, error: "The note must be text." };
  }
  const note = typeof input.note === "string" ? input.note.trim() : "";
  if (note.length > DECLINE_NOTE_MAX_LENGTH) {
    return {
      ok: false,
      error: `Keep the note under ${DECLINE_NOTE_MAX_LENGTH} characters.`,
    };
  }
  if (code === "other" && note.length < DECLINE_NOTE_MIN_FOR_OTHER) {
    return {
      ok: false,
      error: `Say why in a few words (at least ${DECLINE_NOTE_MIN_FOR_OTHER} characters).`,
    };
  }
  return { ok: true, reasonCode: code as DeclineReasonCode, note: note || null };
}

/** One row of `declined_applications`, as the dashboard reads it. */
export type DeclinedApplication = {
  id: string;
  kind: DeclineKind;
  source_id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  details: Record<string, unknown> | null;
  applied_at: string | null;
  reason_code: string;
  reason_note: string | null;
  declined_by: string | null;
  declined_at: string;
};

function emailKey(email: string | null | undefined): string | null {
  const e = email?.trim().toLowerCase();
  return e ? e : null;
}

/**
 * The last ten digits, so "+91 98765 43210" and "9876543210" are one
 * number. Fewer than eight digits is not a number worth matching on.
 */
export function phoneKey(phone: string | null | undefined): string | null {
  const digits = (phone ?? "").replace(/\D/g, "");
  if (digits.length < 8) return null;
  return digits.slice(-10);
}

/**
 * The most recent earlier decline of the same person, matched on email or
 * phone, or null. `kinds` limits the match -- a hospital inquiry is matched
 * against hospital declines only, a signup against patient and therapist
 * declines. A decline of the very row being shown (same source id) is not
 * "before".
 */
export function findPriorDecline(
  applicant: { id?: string; email?: string | null; phone?: string | null },
  declines: readonly DeclinedApplication[],
  kinds: readonly DeclineKind[]
): DeclinedApplication | null {
  const email = emailKey(applicant.email);
  const phone = phoneKey(applicant.phone);
  if (!email && !phone) return null;
  let best: DeclinedApplication | null = null;
  for (const d of declines) {
    if (!kinds.includes(d.kind)) continue;
    if (applicant.id && d.source_id === applicant.id) continue;
    const matches =
      (email !== null && emailKey(d.email) === email) ||
      (phone !== null && phoneKey(d.phone) === phone);
    if (!matches) continue;
    if (!best || d.declined_at > best.declined_at) best = d;
  }
  return best;
}
