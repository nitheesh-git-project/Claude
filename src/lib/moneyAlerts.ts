// What is waiting on somebody in the Money section, worked out once.
//
// Money answers four questions, and three of them are on a screen: how much
// came in, who is owed, what one patient paid. The fourth -- "is anything
// wrong with the money?" -- was answerable only by opening every screen and
// knowing what a wrong figure looks like. Cash a therapist collected weeks
// ago and never handed over, a refund somebody has to hand back by hand, a
// payout request nobody has looked at: none of them is on a screen an admin
// visits unless they already suspect it.
//
// Same shape and the same rules as the System Health verdict strip, and for
// the same reason: a count that links to the rows it counted, an item that
// is dropped rather than rendered when the viewer cannot reach the screen
// behind it, and nothing here that is merely informational -- an alert an
// admin cannot act on is one they learn to scroll past.

export type MoneyAlertKey =
  | "payout_requests"
  | "cash_to_remit"
  | "manual_refunds"
  | "refunds_failed"
  | "unmatched_payments";

export type MoneyAlert = {
  key: MoneyAlertKey;
  label: string;
  count: number;
  /** What to do about it, in a clinic owner's words. */
  hint: string;
  /** Which admin section the fix lives in, so an unreachable one is dropped
   *  rather than rendered as a link that lands somewhere else. */
  section: "money" | "settings" | "sessions";
  tab: string;
  /** Preset the target screen applies to its own filters on arrival. */
  view?: string;
  /** Money that has left the clinic's control, rather than work in a queue. */
  urgent: boolean;
};

export type MoneyAlertCounts = {
  payoutRequestsOpen: number;
  cashToRemitVisits: number;
  /** Cash visits and sessions alike: both are money a patient is owed and
   *  does not have, and splitting them into two rows would make an admin
   *  add up their own total. */
  manualRefundsPending: number;
  /** Refunds the gateway refused. Counted separately because the work is
   *  different -- one is "go and hand over cash", the other is "find out
   *  why Razorpay said no" -- and because nothing else in the app was
   *  watching them at all. */
  refundsFailed: number;
  /** Captured payments nothing in the app is attached to. Read from the same
   *  accounting check System Health reports on. */
  unmatchedPayments: number;
};

export function buildMoneyAlerts(
  counts: MoneyAlertCounts,
  reachableSections: readonly string[]
): MoneyAlert[] {
  const all: MoneyAlert[] = [
    {
      key: "payout_requests",
      label: "Payout requests waiting",
      count: counts.payoutRequestsOpen,
      hint: "A therapist has asked to be paid. Review it, then mark it done.",
      section: "money",
      tab: "payouts",
      urgent: false,
    },
    {
      key: "cash_to_remit",
      label: "Cash a therapist is holding",
      count: counts.cashToRemitVisits,
      hint: "Collected at a patient's door and not handed over yet. It comes off their next payout automatically.",
      section: "money",
      tab: "payouts",
      view: "owed",
      // The clinic's money, physically with somebody else.
      urgent: true,
    },
    {
      key: "manual_refunds",
      label: "Refunds to hand back by hand",
      count: counts.manualRefundsPending,
      hint: "A cancelled cash visit with no card payment to reverse. Give the money back, then confirm it here.",
      section: "money",
      tab: "payouts",
      // A patient is owed money and does not have it.
      urgent: true,
    },
    {
      key: "refunds_failed",
      label: "Refunds that failed",
      count: counts.refundsFailed,
      hint: "The gateway refused the refund, so the patient is still out of pocket and is being told to contact you. Open the session and refund it again.",
      section: "sessions",
      tab: "all",
      view: "refund_failed",
      // Money the clinic has agreed to return and has not returned.
      urgent: true,
    },
    {
      key: "unmatched_payments",
      label: "Payments attached to nothing",
      count: counts.unmatchedPayments,
      hint: "Money was captured and the app does not know what it bought. Match it to the booking, or refund it.",
      section: "settings",
      tab: "health",
      urgent: true,
    },
  ];

  return all.filter((a) => a.count > 0 && reachableSections.includes(a.section));
}

export function moneyAlertsHeadline(alerts: MoneyAlert[]): string {
  if (alerts.length === 0) return "Nothing in Money needs you";
  const items = alerts.reduce((sum, a) => sum + a.count, 0);
  return `${items} thing${items === 1 ? "" : "s"} need${items === 1 ? "s" : ""} you`;
}
