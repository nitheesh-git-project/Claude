// What cancelling a session will do with the money, said before the admin
// confirms it.
//
// The drawer's cancel dialog used to say "it's within 24 hours of the slot, so
// the patient won't be refunded" with a constant (CANCELLATION_FULL_REFUND_HOURS)
// that the clinic can change under Settings -> Booking Rules and Programmes &
// Home Visits, and with no amount. An admin cancelling a home visit under a
// 48-hour window was told "24 hours". This mirrors the decision
// `cancelAppointmentAndRefund` (cancelAppointment.ts) actually makes -- same
// inputs, same branches -- so the sentence and the outcome cannot disagree.
// It explains the rule; the route remains the rule.
//
// Dependency-free so the wording is unit-tested rather than found on a live
// clinic's money. Money is integer paise.

import { formatInr } from "@/lib/formatMoney";

export type CancelOutcomeKind =
  | "card_refund"
  | "card_late"
  | "already_refunded"
  | "credit_back"
  | "credit_forfeited"
  | "cash_hand_back"
  | "cash_late"
  | "unpaid";

export type CancelOutcomeInput = {
  /** The session's slot, or null when it has none (lateness cannot be judged). */
  slotTime: string | null;
  nowMs: number;
  /** The window in force for this kind of session: the home-visit one for a
   *  visit, the online one otherwise. Hours. */
  windowHours: number;
  /** Paid on the session itself with a gateway payment (not a programme). */
  paidDirect: boolean;
  /** Drawn from a package or a home-visit programme -- no card payment on it. */
  viaProgramme: boolean;
  /** A cash home visit whose cash has already been taken at the door. */
  cashCollected: boolean;
  cashCollectedPaise: number | null;
  /** What is still the patient's to get back on a direct payment (charge less
   *  earlier refunds), from `describeRefundPosition`. */
  refundablePaise: number;
};

export type CancelOutcome = {
  kind: CancelOutcomeKind;
  /** One sentence for the dialog. */
  text: string;
  /** Money that goes back to the patient (card) or has to be handed back
   *  (cash); null when no money moves. */
  amountPaise: number | null;
};

export function hoursUntil(slotTime: string | null, nowMs: number): number | null {
  if (!slotTime) return null;
  const t = new Date(slotTime).getTime();
  if (Number.isNaN(t)) return null;
  return (t - nowMs) / (1000 * 60 * 60);
}

function windowLabel(hours: number): string {
  return `${hours} h`;
}

export function describeCancelOutcome(input: CancelOutcomeInput): CancelOutcome {
  const hours = hoursUntil(input.slotTime, input.nowMs);
  // The route's own test: a session with no readable slot is never "late".
  const counts = input.paidDirect || input.viaProgramme;
  const late = counts && hours !== null && hours < input.windowHours;
  const lateWords = `within ${windowLabel(input.windowHours)} of the slot`;

  if (input.paidDirect) {
    if (late) {
      return { kind: "card_late", text: `No refund - ${lateWords}.`, amountPaise: null };
    }
    if (input.refundablePaise <= 0) {
      return {
        kind: "already_refunded",
        text: "Nothing more goes back - this session has already been refunded in full.",
        amountPaise: null,
      };
    }
    return {
      kind: "card_refund",
      text: `${formatInr(input.refundablePaise)} goes back to the patient's card.`,
      amountPaise: input.refundablePaise,
    };
  }

  if (input.viaProgramme) {
    if (late) {
      // A cash visit with cash already taken keeps it on a late cancellation
      // (the route only hands cash back when the cancellation is not late).
      return {
        kind: input.cashCollected ? "cash_late" : "credit_forfeited",
        text: input.cashCollected
          ? `No refund - ${lateWords}. The cash already collected stays with the clinic and the visit is used up.`
          : `No refund - ${lateWords}. The session is used up.`,
        amountPaise: null,
      };
    }
    if (input.cashCollected && (input.cashCollectedPaise ?? 0) > 0) {
      return {
        kind: "cash_hand_back",
        text: `${formatInr(input.cashCollectedPaise ?? 0)} collected in cash has to be handed back to the patient. The visit goes back to their programme.`,
        amountPaise: input.cashCollectedPaise,
      };
    }
    return {
      kind: "credit_back",
      text: "No money moves. The session goes back to the patient's programme.",
      amountPaise: null,
    };
  }

  return { kind: "unpaid", text: "Nothing was paid for this session, so there is nothing to refund.", amountPaise: null };
}

/** The whole dialog message: the question, the outcome, then the ask. */
export function cancelDialogMessage(outcome: CancelOutcome): string {
  return `Cancel this session? ${outcome.text} Add a reason (optional):`;
}

/**
 * The same decision in the patient's own words, for their Cancel dialog.
 *
 * The patient's dialog used to speak only about a paid session ("refund the
 * payment" / "won't be refunded"). A pay-later, unpaid or programme session
 * got a bare "Cancel this session?", and the booking page's "cancelling
 * inside 24 hours is not refunded" then read as a contradiction when such a
 * cancel cost nothing. It now says what will happen to the money in every
 * case, from the very branches the route takes.
 */
export function patientCancelMessage(input: CancelOutcomeInput & { payLater: boolean }): string {
  const o = describeCancelOutcome(input);
  const window = `${input.windowHours} hours`;
  let money: string;
  switch (o.kind) {
    case "card_refund":
      money = `${formatInr(o.amountPaise ?? 0)} will be refunded to the card or account you paid with.`;
      break;
    case "card_late":
      money = `It's within ${window} of your session, so it won't be refunded.`;
      break;
    case "already_refunded":
      money = "This session has already been refunded in full.";
      break;
    case "credit_back":
      money = "Nothing is charged. The session goes back to your programme to book again.";
      break;
    case "credit_forfeited":
      money = `It's within ${window} of your session, so the session is used up and doesn't go back to your programme.`;
      break;
    case "cash_hand_back":
      money = `The ${formatInr(o.amountPaise ?? 0)} you paid in cash will be handed back, and the visit goes back to your programme.`;
      break;
    case "cash_late":
      money = `It's within ${window} of your visit, so the cash you paid isn't returned and the visit is used up.`;
      break;
    default:
      money = input.payLater
        ? "You were going to pay after the session, so nothing is owed for a session cancelled before it happens."
        : "You haven't paid for this session, so there's nothing to refund.";
  }
  return `Cancel this session? ${money} You can add a reason (optional):`;
}
