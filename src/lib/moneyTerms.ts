// What every money figure means, and whether it moves with the date range.
//
// This used to live inside MoneyGlossary as a list of prose entries at the
// bottom of five screens -- the definition as far as it could possibly be
// from the figure it defined, and repeated five times. It is a module now so
// that the glossary and the (i) beside each figure read the same sentence:
// two copies of a definition is exactly the "one word, one figure" failure
// this vocabulary exists to prevent, one level up.
//
// `scope` is the other half. An admin changing the dates watches some figures
// move and others sit still, which reads as a bug and is not: a flow is
// measured over a stretch of time, a balance is true at this instant, and a
// setting is neither. Saying which is a property of the figure, so it belongs
// beside its meaning rather than in a sentence somebody remembers to write.

export type MoneyScope =
  // Measured over the dates in view. Changing the range changes it.
  | "range"
  // True right now, all time. The range does not touch it -- a debt does not
  // stop existing outside a date filter.
  | "now"
  // Neither: a rate or a rule, not an amount.
  | "setting";

export type MoneyTerm = {
  term: string;
  meaning: string;
  scope: MoneyScope;
};

export const MONEY_TERMS = {
  gross_revenue: {
    term: "Gross revenue",
    meaning:
      "Everything charged for sessions whose slot falls in the range, before refunds. The top line.",
    scope: "range",
  },
  refunded: {
    term: "Refunded",
    meaning:
      "Refunds that actually processed. A refund that failed or was never eligible is not here.",
    scope: "range",
  },
  net_revenue: {
    term: "Net revenue",
    meaning:
      "Gross revenue minus refunds — what the clinic kept. Every share below is taken out of this.",
    scope: "range",
  },
  therapist_share: {
    term: "Therapists' share",
    meaning:
      "What therapists earned on sessions they actually delivered, at each therapist's own rate, plus any home-visit travel reimbursement in full. A session that was booked and paid for but never delivered earns nobody a share.",
    scope: "range",
  },
  partner_share: {
    term: "Partners' share",
    meaning:
      "A referring hospital's commission on the money the clinic kept from patients they sent. Taken on net revenue, so a refund reverses the commission with it.",
    scope: "range",
  },
  clinic_share: {
    term: "Clinic share",
    meaning:
      "Net revenue less both shares — what is left before the clinic has paid for anything of its own. Not profit: see Operating profit, which is this figure after costs.",
    scope: "range",
  },
  excluded_from_split: {
    term: "Left out of the split",
    meaning:
      "Paid sessions counted in revenue but excluded from the three shares, because no split can be worked out: the therapist has no revenue share set, or the patient came from a partner whose share is not configured. Set the percentages in People and they disappear.",
    scope: "range",
  },
  payment_fees: {
    term: "Payment fees",
    meaning:
      "The payment gateway's cut of everything collected online, worked out automatically from the fee percentage set on the Costs screen. Charged on the gross amount, because a processor keeps its fee even when a payment is refunded.",
    scope: "range",
  },
  running_costs: {
    term: "Running costs",
    meaning:
      "What the clinic itself spends — salaries, rent, software, marketing — entered by hand on the Costs screen and dated to the day the cost was incurred, not the day it was typed in.",
    scope: "range",
  },
  operating_profit: {
    term: "Operating profit",
    meaning:
      "Clinic share less payment fees and running costs. The only figure here entitled to the word profit, and still before tax. With no costs recorded for a period it is a ceiling, not the real number.",
    scope: "range",
  },
  owed_to_therapists: {
    term: "Owed to therapists",
    meaning:
      "What the clinic owes right now, all time — not scoped to the dates in view, because a debt does not stop existing outside a date range. Already net of any cash therapists are holding, so it is exactly what a payout run would transfer.",
    scope: "now",
  },
  paid_to_therapists: {
    term: "Paid to therapists",
    meaning: "Already transferred, for sessions scheduled in the range in view.",
    scope: "range",
  },
  package_cash_collected: {
    term: "Package cash collected",
    meaning:
      "The full price of package purchases paid up front — money in the bank. Deliberately not added to revenue, which recognises the same money gradually, one session at a time as they get scheduled. Both are real; they answer different questions.",
    scope: "range",
  },
  bookings: {
    term: "Bookings",
    meaning: "Sessions whose slot falls in the range, paid or not.",
    scope: "range",
  },
  travel_fee: {
    term: "Travel fee",
    meaning:
      "A home visit's travel reimbursement. Paid to the therapist in full and never counted as revenue — folding it in would mean a therapist funding their own transport.",
    scope: "range",
  },
  cash_collected: {
    term: "Cash collected",
    meaning:
      "Money a therapist took at a patient's door on a cash-on-visit home visit. It belongs to the clinic but is physically with the therapist.",
    scope: "now",
  },
  cash_remitted: {
    term: "Cash remitted",
    meaning:
      "Collected cash the clinic has back. Until then it nets off that therapist's next payout — and settling a payout that absorbs it records it as remitted, so the same rupees are never deducted twice.",
    scope: "now",
  },
  manual_refund_pending: {
    term: "Manual refund pending",
    meaning:
      "A cancelled cash visit where money was collected and there is no Razorpay payment to reverse — a human has to hand it back. It stays on the Cash Ledger until someone confirms they did.",
    scope: "now",
  },
  unpaid_home_visit: {
    term: "Unpaid (home visit)",
    meaning:
      "Normal for cash-on-visit before the therapist records the collection. It does not mean nobody will ever pay — check the payment mode before reading it as a debt.",
    scope: "now",
  },
  discounts_given: {
    term: "Discounts given",
    meaning:
      "What the clinic gave away to win patients, split by which rule did it. Stated, never deducted: less was collected, so it is already inside gross revenue as a smaller number, and subtracting it again would understate profit by exactly the amount given away.",
    scope: "range",
  },
  gateway_fee_percent: {
    term: "Gateway fee %",
    meaning:
      "What your payment provider charges you per online payment. Payment fees above are worked out from it; it is a setting, not an amount, so the dates in view do not touch it.",
    scope: "setting",
  },
} as const satisfies Record<string, MoneyTerm>;

export type MoneyTermKey = keyof typeof MONEY_TERMS;

export function moneyTerm(key: MoneyTermKey): MoneyTerm {
  return MONEY_TERMS[key];
}

/** The one-line label a figure carries so an admin can tell, without reading
 *  any prose, why one number moved when they changed the dates and the one
 *  beside it did not. */
export const SCOPE_LABEL: Record<MoneyScope, string> = {
  range: "These dates",
  now: "Right now",
  setting: "A setting",
};

/** Glossary order: the subtraction chain first, in the order the screens
 *  perform it, then the balances, then the rest. Alphabetical would split
 *  gross from net, which is the one pairing a reader needs kept together. */
export const GLOSSARY_ORDER: MoneyTermKey[] = [
  "gross_revenue",
  "refunded",
  "net_revenue",
  "therapist_share",
  "partner_share",
  "clinic_share",
  "excluded_from_split",
  "payment_fees",
  "running_costs",
  "operating_profit",
  "owed_to_therapists",
  "paid_to_therapists",
  "package_cash_collected",
  "bookings",
  "discounts_given",
  "travel_fee",
  "cash_collected",
  "cash_remitted",
  "manual_refund_pending",
  "unpaid_home_visit",
  "gateway_fee_percent",
];
