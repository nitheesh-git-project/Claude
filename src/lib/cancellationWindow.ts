// What cancelling this booking will cost, said at the moment it is booked.
//
// The refund window itself is enforced in `cancelAppointment.ts`, which
// refunds when `hoursUntilSlot >= refundWindowHours` and refuses inside that.
// This module is the same judgement made one step earlier -- on the payment
// screen, where the patient can still choose a different slot -- so the two
// must agree at the boundary, which is why the comparison below is written
// the same way round rather than "close enough".
//
// It exists as a module rather than an expression in the wizard for the
// reason the rest of the business maths does: it is a promise about money,
// and it has a boundary and three outcomes, none of which is testable inside
// a component.

export type CancellationWindow =
  /** Free until a specific moment, which is the one a patient can act on. */
  | { kind: "deadline"; hours: number; deadlineMs: number }
  /** The slot is already nearer than the window: this booking is
   *  non-refundable from the moment it is made. */
  | { kind: "already_inside"; hours: number }
  /** No slot chosen yet, so state the rule and nothing more. */
  | { kind: "rule_only"; hours: number };

export function describeCancellationWindow(args: {
  /** The chosen slot as an instant, or null when nothing is chosen yet. */
  slotMs: number | null | undefined;
  refundWindowHours: number;
  nowMs: number;
}): CancellationWindow {
  const hours = Number.isFinite(args.refundWindowHours)
    ? Math.max(0, args.refundWindowHours)
    : 0;

  if (
    args.slotMs === null ||
    args.slotMs === undefined ||
    !Number.isFinite(args.slotMs)
  ) {
    return { kind: "rule_only", hours };
  }

  const deadlineMs = args.slotMs - hours * 3_600_000;

  // Strictly before, because the cancel route refunds at exactly the
  // boundary (`hoursUntilSlot < refundWindowHours` is what makes it late).
  // Saying "no refund" one millisecond early would be the screen promising
  // less than the route delivers, which is the wrong direction to be wrong
  // in on the one line a patient reads as a promise.
  if (deadlineMs < args.nowMs) return { kind: "already_inside", hours };

  return { kind: "deadline", hours, deadlineMs };
}
