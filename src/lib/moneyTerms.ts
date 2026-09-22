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
  /**
   * The arithmetic, written out, for a figure that is one.
   *
   * Optional because most figures on the Money summary are a sum of rows
   * rather than a formula over other figures -- "gross revenue" has nothing
   * to show. The Business Health screen's figures are the opposite: every one
   * of them is a division or a subtraction of two figures beside it, and an
   * owner who cannot see which two is being asked to trust a ratio.
   */
  formula?: string;
  /**
   * Where each number in that formula comes from -- which screen, which table,
   * or which website an owner has to open to find it.
   *
   * This is the half that makes a figure actionable rather than merely
   * defined. "Return on ad spend" is self-explanatory; "and the spend comes
   * from the campaigns you record on Your Numbers, taken off your Google Ads
   * billing page" is what lets somebody fix it when it looks wrong.
   */
  source?: string;
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
      "Gross revenue minus refunds - what the clinic kept. Every share below is taken out of this.",
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
      "Net revenue less both shares - what is left before the clinic has paid for anything of its own. Not profit: see Operating profit, which is this figure after costs.",
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
      "What the clinic itself spends - salaries, rent, software, marketing - entered by hand on the Costs screen and dated to the day the cost was incurred, not the day it was typed in.",
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
      "What the clinic owes right now, all time - not scoped to the dates in view, because a debt does not stop existing outside a date range. Already net of any cash therapists are holding, so it is exactly what a payout run would transfer.",
    scope: "now",
  },
  owed_by_patients: {
    term: "Owed by patients",
    meaning:
      "What trusted patients who pay after their treatment still have to settle. All time, not scoped to the dates in view, because a debt does not stop existing outside a date range. Counted only once a session has been delivered -- a booked session owes nothing, and neither does one that was cancelled. Net of any money already received and not yet applied to a session.",
    formula: "Delivered, unsettled sessions at their agreed price, less money received and not yet applied",
    source:
      "The sessions themselves. Their price is fixed when the session is booked, so re-pricing a treatment later never changes what somebody already owes. Note this is the cash side only: a delivered session counts as revenue the day it happens, so a figure here is revenue already reported and not yet collected.",
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
      "The full price of package purchases paid up front - money in the bank. Deliberately not added to revenue, which recognises the same money gradually, one session at a time as they get scheduled. Both are real; they answer different questions.",
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
      "A home visit's travel reimbursement. Paid to the therapist in full and never counted as revenue - folding it in would mean a therapist funding their own transport.",
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
      "Collected cash the clinic has back. Until then it nets off that therapist's next payout - and settling a payout that absorbs it records it as remitted, so the same rupees are never deducted twice.",
    scope: "now",
  },
  manual_refund_pending: {
    term: "Manual refund pending",
    meaning:
      "A cancelled cash visit where money was collected and there is no Razorpay payment to reverse - a human has to hand it back. It stays on the Cash Ledger until someone confirms they did.",
    scope: "now",
  },
  unpaid_home_visit: {
    term: "Unpaid (home visit)",
    meaning:
      "Normal for cash-on-visit before the therapist records the collection. It does not mean nobody will ever pay - check the payment mode before reading it as a debt.",
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

  // --- Business Health ---------------------------------------------------
  //
  // The seven figures a bank, an investor or an accountant asks for. Each one
  // carries a formula and a source as well as a meaning, because unlike the
  // figures above -- which are sums of rows this app wrote -- every one of
  // these is a division or a subtraction of two other figures, and some of
  // them stand on numbers only the owner can supply. A ratio whose inputs a
  // reader cannot name is a ratio they cannot argue with, and these are the
  // figures most likely to be quoted at somebody.
  cost_of_delivery: {
    term: "Cost of delivering sessions",
    meaning:
      "What it cost to deliver the sessions this revenue came from - the money that would not have been spent if the sessions had not happened. Accountants call it cost of goods sold.",
    formula: "Therapists' share + partners' share + payment fees + costs you filed as delivery costs",
    source:
      "The first three are worked out from your own sessions, exactly as the Summary screen works them out. The fourth is any cost you recorded on Money → Costs and filed as a delivery cost. Which of the first three count is yours to decide, on Your Numbers.",
    scope: "range",
  },
  gross_profit: {
    term: "Gross profit",
    meaning:
      "What is left of net revenue once the sessions have been delivered and paid for, before a single overhead. If this figure is thin, no amount of cutting rent will fix the business.",
    formula: "Net revenue − cost of delivering sessions",
    source: "Both figures come from the sessions in view. Nothing here is typed in.",
    scope: "range",
  },
  gross_margin: {
    term: "Gross profit margin",
    meaning:
      "Gross profit as a percentage of net revenue - how much of every rupee taken survives delivering the treatment. The figure to watch when you change a price or a therapist's share.",
    formula: "(Net revenue − cost of delivering sessions) ÷ net revenue × 100",
    source: "Derived from the sessions in view. With no revenue in the range there is no margin at all, and the screen says so rather than showing 0%.",
    scope: "range",
  },
  running_the_clinic: {
    term: "Running the clinic",
    meaning:
      "Costs you carry whether you treat one patient or a hundred - rent, salaries, software, marketing. Recorded by hand, and dated to the day the cost was incurred.",
    formula: "Every cost you filed as “Running the clinic”, in these dates",
    source: "Money → Costs. Each cost carries a kind, and this is the total of that one.",
    scope: "range",
  },
  ebitda: {
    term: "EBITDA",
    meaning:
      "What the clinic earns from trading, before interest, tax and the wearing-out of what you bought. The figure a buyer or a lender asks for, because it strips out how you financed the business and shows only how it trades.",
    formula: "Operating income + depreciation + amortization",
    source:
      "Operating income comes from the chain above it. The two write-offs come from the investments you record on Your Numbers - each spread evenly over the life you gave it - plus any cost you filed as a write-off yourself.",
    scope: "range",
  },
  operating_income: {
    term: "Operating income",
    meaning:
      "Gross profit less the cost of running the clinic and less the wearing-out of what you bought. Interest and tax are still to come, which is exactly what separates it from net profit.",
    formula: "Gross profit − running the clinic − depreciation − amortization",
    source: "Every part is derived from the sessions, the costs and the investments in view.",
    scope: "range",
  },
  depreciation: {
    term: "Depreciation",
    meaning:
      "A share of something physical you bought earlier, charged to these dates - a couch bought for ₹60,000 and expected to last five years costs the business ₹1,000 a month whether or not you paid anything this month.",
    formula: "For each investment: amount ÷ its life, for the days in view",
    source:
      "The investments you record on Your Numbers. One with no life set writes off nothing - a life is you saying how long it lasts, and this will never invent one for you.",
    scope: "range",
  },
  amortization: {
    term: "Amortization",
    meaning:
      "The same idea as depreciation, for something you cannot touch - a website build, a logo, a software licence bought outright. Kept separate because the two are the D and the A of EBITDA.",
    formula: "For each investment: amount ÷ its life, for the days in view",
    source: "The investments you record on Your Numbers and mark as amortized rather than depreciated.",
    scope: "range",
  },
  interest_cost: {
    term: "Interest",
    meaning:
      "What borrowing costs you over these dates. Held out of operating profit and out of EBITDA, and taken off only at the very bottom - which is the whole reason those two figures exist.",
    formula: "Every cost you filed as “Interest on borrowing”, in these dates",
    source: "Money → Costs, filed under that kind. Take the figure off your loan statement.",
    scope: "range",
  },
  tax_cost: {
    term: "Tax",
    meaning:
      "Tax charged against these dates. Recorded by you, because only your accountant knows what is due - nothing in this app calculates or files it.",
    formula: "Every cost you filed as “Tax”, in these dates",
    source: "Money → Costs, filed under that kind.",
    scope: "range",
  },
  net_profit: {
    term: "Net profit",
    meaning:
      "The bottom line: what the business actually kept once everything is paid, including interest and tax. This is the figure the return on investment is measured on.",
    formula: "Operating income − interest − tax",
    source:
      "Derived from everything above it. Record your interest and tax on Money → Costs, or this reads the same as operating income and flatters itself.",
    scope: "range",
  },
  net_margin: {
    term: "Net profit margin",
    meaning:
      "Net profit as a percentage of net revenue - how much of every rupee taken you finally keep. The single most comparable figure between one clinic and another.",
    formula: "Net profit ÷ net revenue × 100",
    source: "Derived. With no revenue in the range there is no margin, and the screen says so rather than showing 0%.",
    scope: "range",
  },
  cost_of_investment: {
    term: "Cost of investment",
    meaning:
      "Everything put into the business that was not a running cost - the couch, the laptops, the fit-out, the website build. All of it, not only what falls in the dates in view: you are measuring a return on the whole of what you put in.",
    formula: "The sum of every investment you have recorded",
    source:
      "Your Numbers → What you invested. Take the figures off the invoices, or your accountant's fixed-asset register.",
    scope: "now",
  },
  present_value: {
    term: "What it is worth now",
    meaning:
      "Your own valuation of what those things would fetch or are worth today. An opinion with a date on it, which is why the date is recorded beside it and shown wherever the figure is.",
    formula: "The sum of the valuations you have entered",
    source:
      "Your Numbers → What you invested. Only investments you have valued count towards the second return below - the rest are listed and left out, rather than being counted at their purchase price.",
    scope: "now",
  },
  roi: {
    term: "Return on investment",
    meaning:
      "What this period's profit is worth against everything put into the business. 25% means the period earned a quarter of what was invested - not that a quarter has been paid back.",
    formula: "Net profit ÷ cost of investment × 100",
    source:
      "Net profit is derived from the sessions and costs in these dates. Cost of investment is what you recorded on Your Numbers. With nothing recorded there is no return to show, and the screen says so rather than showing 0%.",
    scope: "range",
  },
  roi_on_value: {
    term: "Return on what it is worth",
    meaning:
      "The second reading of the same question: what the things you bought are worth now against what they cost. Nothing to do with this period's trading - it is about the assets, not the takings.",
    formula: "(What it is worth now − what it cost) ÷ what it cost × 100",
    source:
      "Your Numbers → What you invested, over the valued investments only. An unvalued one is left out of both halves rather than counted at its purchase price, which would report a 0% return on it.",
    scope: "now",
  },
  ad_spend: {
    term: "Advertising spend",
    meaning:
      "What was spent on advertising over these dates. A campaign is recorded once with its own start and end, and the part of it falling inside the dates in view is what counts here.",
    formula: "For each campaign: spend ÷ its own length × the days in view",
    source:
      "Your Numbers → Advertising. Google Ads → Billing → Summary, Meta Ads Manager → Billing → Transactions, or the invoice for anything offline.",
    scope: "range",
  },
  ad_revenue: {
    term: "Revenue from ads",
    meaning:
      "Net revenue that can be traced to a campaign - never an estimate. A campaign is traced by giving it a promo code, and then it is worth exactly what the bookings that typed that code brought in.",
    formula: "Net revenue of every booking that claimed the campaign's promo code",
    source:
      "Your own bookings. For a campaign that makes the phone ring instead, enter what you believe it brought in and the screen will label that figure as yours rather than blending it in silently.",
    scope: "range",
  },
  roas: {
    term: "Return on ad spend",
    meaning:
      "Revenue per rupee of advertising. 4 means every ₹1 of ads brought back ₹4 of revenue - revenue, not profit, so compare it against your gross margin before calling it a win.",
    formula: "Revenue from ads ÷ advertising spend",
    source:
      "Both from Your Numbers → Advertising. Spend that cannot be traced to any revenue is kept out of the division and shown separately, because leaving it in reports a campaign as a failure for the sole reason that nobody tagged it.",
    scope: "range",
  },
  current_assets: {
    term: "Current assets",
    meaning:
      "What the clinic owns that is cash, or turns into cash within the year - the bank balance, money owed to you, cash a therapist is holding on your behalf.",
    formula: "Your latest snapshot + the balances this app already knows",
    source:
      "Your Numbers → What you own and owe, for the bank balance and anything else. The cash therapists are holding comes from your own Cash Ledger.",
    scope: "now",
  },
  current_liabilities: {
    term: "Current liabilities",
    meaning:
      "What the clinic owes within the year - bills, tax due, a loan repayment falling this year, what therapists are owed, and sessions patients have paid for and not yet had.",
    formula: "Your latest snapshot + the balances this app already knows",
    source:
      "Your Numbers → What you own and owe, for bills and tax. What is owed to therapists, refunds still to hand back and unused paid sessions come from this app's own records.",
    scope: "now",
  },
  working_capital: {
    term: "Net working capital",
    meaning:
      "What is available to keep the clinic running: everything that is cash within the year, less everything owed within the year. A negative figure means today's bills are bigger than today's money.",
    formula: "Current assets − current liabilities",
    source:
      "A snapshot, not a period - it is true as of the latest date you entered, whatever dates are in view above.",
    scope: "now",
  },
  working_capital_ratio: {
    term: "Working capital ratio",
    meaning:
      "The same comparison as a ratio rather than an amount, which is what makes it readable against another business. Under 1 is tight, 1 to 2 is the comfortable band, over 2 means money is sitting idle.",
    formula: "Current assets ÷ current liabilities",
    source: "The same two figures. With nothing owed there is no ratio at all - not an infinitely healthy one.",
    scope: "now",
  },
  fixed_costs: {
    term: "Costs that do not move",
    meaning:
      "Everything owed over these dates whether you treat one patient or none - running the clinic, the write-offs, interest and tax. What break-even has to cover.",
    formula: "Running the clinic + depreciation + amortization + interest + tax",
    source: "Money → Costs, plus the investments you recorded on Your Numbers.",
    scope: "range",
  },
  contribution_per_session: {
    term: "Left over per session",
    meaning:
      "What one session leaves towards the costs that do not move, once its own delivery cost is paid. If this is zero or less, no number of sessions can cover the overheads.",
    formula: "Price of a session − what it costs to deliver one",
    source:
      "Both averaged over the sessions in view, because this clinic sells at several prices. Override either on Your Numbers when you are modelling a change rather than reading what happened.",
    scope: "range",
  },
  break_even_sessions: {
    term: "Break-even point",
    meaning:
      "How many sessions these dates needed before the clinic covered its costs. Everything after that number is profit; everything before it is not.",
    formula: "Costs that do not move ÷ left over per session, rounded up",
    source:
      "Rounded up always, because a session is not sold in halves and rounding down reports you as covered when you are one session short.",
    scope: "range",
  },
  revenue_run_rate: {
    term: "Revenue run rate",
    meaning:
      "This period's revenue as if the whole year carried on the same way. A projection, not a fact - and a poor one off a short or unusual stretch, which is why the screen says when the window is too short to trust.",
    formula: "Revenue for the period × the number of those periods in a year",
    source:
      "Revenue comes from the sessions in view. How the period is stretched to a year is yours to set on Your Numbers - by default it is read off the length of the dates you picked.",
    scope: "range",
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
  // Beside the therapist balances rather than alphabetically, because it is
  // the same kind of figure pointing the other way -- money out, money in.
  "owed_by_patients",
  "package_cash_collected",
  "bookings",
  "discounts_given",
  "travel_fee",
  "cash_collected",
  "cash_remitted",
  "manual_refund_pending",
  "unpaid_home_visit",
  "gateway_fee_percent",
  // Business Health, in the order the screen performs the arithmetic: the
  // profit chain first, then the four figures built on top of it, then the
  // two balance-sheet figures, then the planning pair. Same rule as above --
  // alphabetical would split gross profit from gross margin.
  "cost_of_delivery",
  "gross_profit",
  "gross_margin",
  "running_the_clinic",
  "ebitda",
  "depreciation",
  "amortization",
  "operating_income",
  "interest_cost",
  "tax_cost",
  "net_profit",
  "net_margin",
  "cost_of_investment",
  "present_value",
  "roi",
  "roi_on_value",
  "ad_spend",
  "ad_revenue",
  "roas",
  "current_assets",
  "current_liabilities",
  "working_capital",
  "working_capital_ratio",
  "fixed_costs",
  "contribution_per_session",
  "break_even_sessions",
  "revenue_run_rate",
];
