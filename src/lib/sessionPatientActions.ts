// What a patient may do with one session, decided in one place: whether the
// clinic has run out of time to put a physiotherapist on it, whether a Pay
// button means anything, and whether the video link may be opened.
//
// Three bugs had one root. Each surface read `payment_status` alone and
// never asked about the time or the status: a session whose time had passed
// still offered Pay now in "Past", a completed session still offered Pay
// now, and an unpaid session an admin booked and confirmed offered "Tap to
// Join" as though it were paid. Meanwhile a session nobody was ever put on
// sat in the admin's "Sessions with no therapist" long after it should have
// started, still asking to be assigned.
//
// The owner's rules:
// - No physiotherapist confirmed with under `rescueHours` (default 4) to go
//   -- from 3 h 59 min onwards -- and the patient is offered a full refund
//   and a new time. The clinic missed its side, so neither counts against
//   them: the refund window and the "once" limit on moving do not apply.
// - Once the time has passed with nobody assigned, the session is missed,
//   not something to assign: the same two options stay with the patient,
//   and the admin sees it as a follow-up, never as "assign a therapist".
// - Pay is offered for a live session whose time is still ahead and that the
//   clinic can still run, and for a delivered (completed) online session that
//   is still unpaid -- settled from the card, never through the booking
//   wizard.
// - An unpaid session paid up front cannot be joined until it is paid. Pay
//   later, programme sessions (paid on the purchase) and home visits are
//   not held.
//
// Dependency-free and unit-tested (sessionPatientActions.test.ts).

/** The owner's window: under this many hours to go with no physiotherapist. */
export const DEFAULT_UNASSIGNED_RESCUE_HOURS = 4;

export type SessionActionRow = {
  status: string;
  no_show?: boolean | null;
  therapist_id: string | null;
  slot_time: string | null;
  payment_status: string;
  payment_terms?: string | null;
  package_purchase_id?: string | null;
  home_visit_purchase_id?: string | null;
  visit_mode?: string | null;
};

/**
 * `at_risk`: live, nobody assigned, and it starts in under `rescueHours`.
 * `lapsed`: live, nobody assigned, and its time has come.
 */
export type RescueState = "none" | "at_risk" | "lapsed";

function isLive(row: Pick<SessionActionRow, "status" | "no_show">): boolean {
  return (row.status === "requested" || row.status === "confirmed") && !row.no_show;
}

function slotMsOf(row: Pick<SessionActionRow, "slot_time">): number | null {
  const ms = row.slot_time ? Date.parse(row.slot_time) : NaN;
  return Number.isFinite(ms) ? ms : null;
}

export function normaliseRescueHours(value: unknown): number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 48
    ? value
    : DEFAULT_UNASSIGNED_RESCUE_HOURS;
}

export function unassignedRescueState(
  row: Pick<SessionActionRow, "status" | "no_show" | "therapist_id" | "slot_time">,
  nowMs: number,
  rescueHours: number = DEFAULT_UNASSIGNED_RESCUE_HOURS
): RescueState {
  if (row.therapist_id || !isLive(row)) return "none";
  const slotMs = slotMsOf(row);
  if (slotMs === null) return "none";
  if (slotMs <= nowMs) return "lapsed";
  if (slotMs - nowMs < normaliseRescueHours(rescueHours) * 3_600_000) return "at_risk";
  return "none";
}

/** Settled afterwards (pay later): never a Pay button, never held at Join. */
function onTerms(row: Pick<SessionActionRow, "payment_terms">): boolean {
  return row.payment_terms === "pay_later";
}

/** Paid on a purchase, or a home visit settled at the door. */
function paidElsewhere(row: Pick<SessionActionRow, "package_purchase_id" | "home_visit_purchase_id" | "visit_mode">): boolean {
  return !!row.package_purchase_id || !!row.home_visit_purchase_id || row.visit_mode === "home_visit";
}

export type PatientPaymentView =
  /** Show the Pay button. */
  | { kind: "pay" }
  | { kind: "paid" }
  /** Pay later: the terms pill from sessionPaymentState says what is owed. */
  | { kind: "terms" }
  /** Unpaid, and there is nothing to press: a pill and, where useful, a line. */
  | { kind: "no_action"; label: string; note: string | null; tone: "neutral" | "warn" };

export function patientPaymentView(
  row: SessionActionRow,
  nowMs: number,
  rescueHours: number = DEFAULT_UNASSIGNED_RESCUE_HOURS
): PatientPaymentView {
  if (onTerms(row)) return { kind: "terms" };
  if (row.payment_status === "paid") return { kind: "paid" };

  if (row.status === "cancelled") {
    return { kind: "no_action", label: "Not charged", note: null, tone: "neutral" };
  }
  if (row.visit_mode === "home_visit" || row.home_visit_purchase_id) {
    // Cash at the door: the physiotherapist collects it, there is no online
    // checkout for it.
    if (row.status === "completed") {
      return { kind: "no_action", label: "Payment due", note: "The clinic will be in touch about paying for this visit.", tone: "warn" };
    }
    return { kind: "no_action", label: "Pay at the visit", note: null, tone: "neutral" };
  }
  if (row.status === "completed") {
    // Delivered and still unpaid -- an admin closed it, or the payment never
    // landed. The patient can settle it online from the card: the clinic
    // already did its part, and "we'll be in touch" left a patient who wanted
    // to pay with nothing to press. A no-show is the clinic's call, so it
    // stays a follow-up rather than a button; a session paid on a programme
    // is not paid here.
    if (!row.no_show && !paidElsewhere(row)) return { kind: "pay" };
    return {
      kind: "no_action",
      label: "Payment due",
      note: "The clinic will be in touch about paying for this session.",
      tone: "warn",
    };
  }
  if (row.no_show) return { kind: "no_action", label: "Not charged", note: null, tone: "neutral" };
  if (!isLive(row)) return { kind: "no_action", label: "Not paid", note: null, tone: "neutral" };

  // Nobody can run it in time: taking money now would be taking it for a
  // session the clinic may not deliver. The rescue options are shown instead.
  if (unassignedRescueState(row, nowMs, rescueHours) !== "none") {
    return { kind: "no_action", label: "No payment taken", note: null, tone: "neutral" };
  }
  const slotMs = slotMsOf(row);
  if (slotMs !== null && slotMs <= nowMs) {
    return {
      kind: "no_action",
      label: "Not paid",
      note: "This time has passed without payment, so the session didn't go ahead. Book a new time whenever suits you.",
      tone: "neutral",
    };
  }
  return { kind: "pay" };
}

/**
 * True when the video link must stay shut until the patient pays: an
 * online session paid up front, not on a programme, still unpaid.
 */
export function joinHeldForPayment(row: SessionActionRow): boolean {
  if (row.payment_status === "paid" || onTerms(row) || paidElsewhere(row)) return false;
  return true;
}

export const JOIN_HELD_MESSAGE = "Pay for this session to unlock the video link.";

/**
 * The patient's Home shows a "Finish paying" card for each of these: an
 * online session still waiting for payment, whose time is ahead, that the
 * clinic can run. Same rule as the Pay button, so the two cannot disagree --
 * except that a completed session's Pay lives on its card only.
 */
export function needsPaymentOnHome(row: SessionActionRow, nowMs: number, rescueHours?: number): boolean {
  // A delivered session is paid from its card, not from "keep your time".
  return row.status !== "completed" && patientPaymentView(row, nowMs, rescueHours).kind === "pay";
}

/**
 * Admin side. A live session nobody was put on, whose time has passed: a
 * follow-up (refund or a new time), never "assign a therapist" -- there is
 * no session left to run at that time.
 */
export function missedWithoutTherapist(
  row: Pick<SessionActionRow, "status" | "no_show" | "therapist_id" | "slot_time">,
  nowMs: number
): boolean {
  return unassignedRescueState(row, nowMs) === "lapsed";
}
