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
  | "pay_later_refunds"
  | "refunds_failed"
  | "unmatched_payments"
  | "patients_owing_aged"
  | "settlements_waiting";

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
  /** A cancelled cash visit with no card payment to reverse. Worked on the
   *  Cash Ledger, which lists home visits -- which is why the pay-later half
   *  of `manual_pending` is counted separately below rather than swept in
   *  here: a count has to link to rows the screen it opens actually shows,
   *  and a count nothing on that screen can bring down is worse than no row
   *  at all. The two together are every `manual_pending` refund there is. */
  manualRefundsPending: number;
  /** A session a trusted patient had already settled, refunded and not yet
   *  handed back. No gateway payment to reverse -- the money came in as one
   *  settlement covering several sessions -- so a person has to move it, on
   *  the hand-back list on Money → Owed by Patients. */
  payLaterRefundsPending?: number;
  /** Refunds the gateway refused. Counted separately because the work is
   *  different -- one is "go and hand over cash", the other is "find out
   *  why Razorpay said no" -- and because nothing else in the app was
   *  watching them at all. */
  refundsFailed: number;
  /** Captured payments nothing in the app is attached to. Read from the same
   *  accounting check System Health reports on. */
  unmatchedPayments: number;
  /** Trusted patients whose oldest unsettled session has been owed longer
   *  than the clinic's own threshold. Counted separately from the total owed,
   *  because owing money is not a problem and owing it for four months is --
   *  and with no ceiling on what a patient may owe, this is the only
   *  automatic warning there is.
   *
   *  Optional so a caller that predates pay later is unchanged -- absent, the
   *  row counts zero and is dropped like any other empty alert. */
  patientsOwingAged?: number;
  /** Payments a patient says they have made, waiting for somebody to check
   *  the bank. Until one is answered the clinic's own figure overstates what
   *  is owed, and the patient cannot tell "being checked" from "forgotten".
   *
   *  Optional for the same reason as the row above: a caller predating the
   *  settlement table counts zero and the row is dropped. */
  settlementsWaiting?: number;
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
      key: "pay_later_refunds",
      label: "Refunds owed to trusted patients",
      count: counts.payLaterRefundsPending ?? 0,
      hint: "A session they had already settled, refunded and not yet sent back. Their money arrived as one payment covering several sessions, so nothing reverses itself - send it, then confirm it here.",
      section: "money",
      tab: "owing",
      // A patient is out of pocket and nothing automatic is going to fix it.
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
      key: "patients_owing_aged",
      label: "Patients who have owed for a while",
      count: counts.patientsOwingAged ?? 0,
      hint: "Treated a while ago and still not settled. Give them a ring - and if they have stopped paying, turn Pay later off on their profile.",
      section: "money",
      tab: "owing",
      // Money the clinic has earned and does not have, sitting with somebody
      // else -- the same kind of exposure as cash a therapist is holding.
      urgent: true,
    },
    {
      key: "settlements_waiting",
      label: "Payments waiting to be checked",
      count: counts.settlementsWaiting ?? 0,
      hint: "A patient says they have paid. Find it in your bank, then confirm it - or turn it down with a reason they will read.",
      section: "money",
      tab: "owing",
      // Work in a queue rather than money out of the clinic's control: the
      // money may well be in the bank already. Urgent is reserved for the
      // rows where it is definitely somewhere else.
      urgent: false,
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
