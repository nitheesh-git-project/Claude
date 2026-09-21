// The seven standard finance figures, and every number that feeds them.
//
// Dependency-free like the rest of the business maths in this folder, so the
// arithmetic an owner reads as "are we making money" can be unit-tested
// without rendering anything. Nothing here queries, formats or rounds for
// display: it takes paise in and gives paise (or a percentage) out.
//
// The figures, and where each one's inputs come from:
//
//   1. Return on investment      net profit / what was invested
//   2. Return on ad spend        revenue from ads / spend on ads
//   3. Working capital           current assets - current liabilities
//   4. Profit margin             gross and net, both against net revenue
//   5. EBITDA                    operating income + depreciation + amortization
//   6. Break-even point          fixed costs / (price - variable cost)
//   7. Revenue run rate          revenue for the period x periods in a year
//
// Most of the inputs are already in this database -- revenue, refunds, the
// therapist and partner splits and the gateway fee all come out of
// adminMetrics/operatingCosts exactly as the Money summary reads them, so
// the two screens cannot disagree about what the clinic earned. Three things
// are not, and cannot be: what was put into the business, what was spent on
// advertising, and what the clinic owns and owes outside its own tables.
// Those are typed in, and every one of them is a row an owner can point at.
//
// Two rules run through the whole module and are worth stating once:
//
//   * **A figure that cannot be worked out is null, never zero.** ROI with no
//     investment recorded, ROAS with no attribution, a break-even where each
//     session loses money -- each returns null with a stated reason, because
//     a zero is read as a measurement and acted on. This is the same refusal
//     `comparePeriod` makes for a percentage off a zero baseline.
//   * **Nothing is inferred from a label.** Whether a cost is direct or fixed,
//     whether a write-off is depreciation or amortization, which campaign a
//     booking came from: all of them are recorded columns, never guessed from
//     wording that somebody will reword.

/** What kind of cost a recorded expense is.
 *
 *  One column rather than four, because break-even (fixed vs variable), gross
 *  margin (cost of delivery vs cost of running the clinic) and EBITDA
 *  (interest, tax and depreciation held out and added back by name) are the
 *  same question asked three times. */
export type CostClass = "direct" | "fixed" | "interest" | "tax" | "depreciation";

export const COST_CLASSES: CostClass[] = [
  "direct",
  "fixed",
  "interest",
  "tax",
  "depreciation",
];

/** What each class means, in the words an owner would use. Read by the form
 *  that sets it and by the (i) that explains the figures it moves, so the
 *  screen setting a class and the screen reporting it say the same thing. */
export const COST_CLASS_LABELS: Record<CostClass, string> = {
  direct: "Cost of delivering a session",
  fixed: "Running the clinic",
  interest: "Interest on borrowing",
  tax: "Tax",
  depreciation: "Wearing out over time",
};

export const COST_CLASS_HINTS: Record<CostClass, string> = {
  direct:
    "Goes up and down with how many sessions you deliver - therapist fees you pay outside the revenue share, consumables, a per-session licence.",
  fixed:
    "You pay it whether you see one patient or a hundred - rent, salaries, software, marketing.",
  interest: "What a loan or an overdraft costs you. Held out of operating profit and out of EBITDA.",
  tax: "Income tax and the like. Held out of operating profit and out of EBITDA.",
  depreciation:
    "A share of something you bought earlier, charged to this period. Usually worked out for you from the investments you record - use this only for a write-off you calculate yourself.",
};

export function isCostClass(value: unknown): value is CostClass {
  return typeof value === "string" && (COST_CLASSES as string[]).includes(value);
}

/** An expense row, as this module needs it. Widened from operatingCosts'
 *  ExpenseRow by one optional column: `cost_class` is newer than the table,
 *  so a database mid-migration hands back rows without it and every one of
 *  them has to read as the default rather than as a crash. */
export type FinanceExpenseRow = {
  id: string;
  incurred_on: string;
  category: string;
  description: string | null;
  amount_paise: number;
  cost_class?: string | null;
};

export const DEFAULT_COST_CLASS: CostClass = "fixed";

export function costClassOf(row: FinanceExpenseRow): CostClass {
  return isCostClass(row.cost_class) ? row.cost_class : DEFAULT_COST_CLASS;
}

export type CapitalInvestment = {
  id: string;
  label: string;
  invested_on: string;
  amount_paise: number;
  present_value_paise: number | null;
  present_value_as_of: string | null;
  useful_life_months: number | null;
  write_off_as: string | null;
  notes?: string | null;
};

export type MarketingChannel =
  | "google"
  | "meta"
  | "instagram"
  | "youtube"
  | "offline"
  | "other";

export const MARKETING_CHANNELS: MarketingChannel[] = [
  "google",
  "meta",
  "instagram",
  "youtube",
  "offline",
  "other",
];

export const MARKETING_CHANNEL_LABELS: Record<MarketingChannel, string> = {
  google: "Google Ads",
  meta: "Facebook / Meta",
  instagram: "Instagram",
  youtube: "YouTube",
  offline: "Offline (print, banners, events)",
  other: "Somewhere else",
};

/** Where to find the spend figure for each channel, named on the form that
 *  asks for it. An owner who has to go and look for a number will guess one,
 *  and a guessed spend produces a return-on-spend figure that decides a
 *  budget. */
export const MARKETING_CHANNEL_SOURCES: Record<MarketingChannel, string> = {
  google: "Google Ads → Billing → Summary: the amount for the dates you are entering.",
  meta: "Meta Ads Manager → Billing → Transactions, or the campaign's Amount spent column.",
  instagram: "Meta Ads Manager (Instagram ads bill through the same account).",
  youtube: "Google Ads → Billing (YouTube campaigns bill through Google Ads).",
  offline: "The invoice from the printer, the venue or the agency.",
  other: "Whatever the provider invoiced you for these dates.",
};

export function isMarketingChannel(value: unknown): value is MarketingChannel {
  return typeof value === "string" && (MARKETING_CHANNELS as string[]).includes(value);
}

export type MarketingCampaign = {
  id: string;
  name: string;
  channel: string;
  starts_on: string;
  ends_on: string | null;
  spend_paise: number;
  promo_code_id: string | null;
  attributed_revenue_paise: number | null;
  notes?: string | null;
};

export type BalanceSide = "asset" | "liability";

export type BalanceSheetEntry = {
  id: string;
  as_of: string;
  side: string;
  label: string;
  amount_paise: number;
  notes?: string | null;
};

export type RunRateBasis = "auto" | "weekly" | "monthly" | "quarterly";

export const RUN_RATE_BASES: RunRateBasis[] = ["auto", "weekly", "monthly", "quarterly"];

export function isRunRateBasis(value: unknown): value is RunRateBasis {
  return typeof value === "string" && (RUN_RATE_BASES as string[]).includes(value);
}

/** The judgements an owner is entitled to make differently, all in one place.
 *  None of these is a constant in the maths: a clinic that treats its gateway
 *  fee as an overhead rather than a cost of sale gets a different gross margin
 *  and is not wrong, and this is where they say so. */
export type FinanceSettings = {
  cogsIncludesTherapistShare: boolean;
  cogsIncludesPartnerShare: boolean;
  cogsIncludesPaymentFees: boolean;
  /** Whether the balances this app already knows join the working-capital
   *  snapshot. On by default: they are real and current, and an owner would
   *  otherwise be copying them off another screen of this same dashboard. */
  includeAppBalances: boolean;
  /** What one session sells for, when modelling. Null means "work it out from
   *  the sessions in view". */
  breakEvenPricePaise: number | null;
  /** What one session costs to deliver, when modelling. Null means the same. */
  breakEvenVariableCostPaise: number | null;
  runRateBasis: RunRateBasis;
};

export const DEFAULT_FINANCE_SETTINGS: FinanceSettings = {
  cogsIncludesTherapistShare: true,
  cogsIncludesPartnerShare: true,
  cogsIncludesPaymentFees: true,
  includeAppBalances: true,
  breakEvenPricePaise: null,
  breakEvenVariableCostPaise: null,
  runRateBasis: "auto",
};

const DAY_MS = 86_400_000;

/** A plain `date` column read at midnight IST, the clinic's own zone -- the
 *  same rule expensesInRange follows. Reading it as UTC would push a cost
 *  entered on the 1st into the previous month for five and a half hours. */
export function istDayMs(dateIso: string): number {
  return new Date(`${dateIso}T00:00:00+05:30`).getTime();
}

/** Days of [aFrom, aTo) that also fall in [bFrom, bTo). Both half-open, so a
 *  campaign ending the day another starts contributes to one of them and not
 *  to both. */
export function overlapDays(
  aFromMs: number,
  aToMs: number,
  bFromMs: number,
  bToMs: number
): number {
  const from = Math.max(aFromMs, bFromMs);
  const to = Math.min(aToMs, bToMs);
  if (!(to > from)) return 0;
  return (to - from) / DAY_MS;
}

// ---------------------------------------------------------------------------
// Costs, by class
// ---------------------------------------------------------------------------

export type ExpenseTotals = Record<CostClass, number>;

export function expenseTotalsByClass(rows: FinanceExpenseRow[]): ExpenseTotals {
  const totals: ExpenseTotals = {
    direct: 0,
    fixed: 0,
    interest: 0,
    tax: 0,
    depreciation: 0,
  };
  for (const row of rows) {
    totals[costClassOf(row)] += Math.max(0, row.amount_paise);
  }
  return totals;
}

// ---------------------------------------------------------------------------
// Depreciation and amortization, from what was invested
// ---------------------------------------------------------------------------

/**
 * A straight line, charged by the day.
 *
 * `amount / useful life`, spread evenly from the day it was bought, and only
 * the part of that line falling inside the dates in view is charged. Straight
 * line rather than anything cleverer because it is the only method an owner
 * can check by hand with the row in front of them, and a figure inside EBITDA
 * that nobody can check is a figure nobody will trust.
 *
 * An investment with no `useful_life_months` writes off nothing. That is
 * deliberate: a life is the owner saying how long the thing lasts, and
 * inventing one (three years, say) would put an expense into the accounts
 * that they never agreed to.
 */
export function writeOffInRange(
  investment: CapitalInvestment,
  fromMs: number,
  toMs: number
): number {
  const months = investment.useful_life_months;
  if (!months || months <= 0) return 0;
  const amount = Math.max(0, investment.amount_paise);
  if (amount === 0) return 0;

  const startMs = istDayMs(investment.invested_on);
  if (Number.isNaN(startMs)) return 0;
  // 30.4375 = 365.25 / 12. A month-length average rather than calendar
  // months, so the daily rate is the same every day of the life and two
  // ranges of equal length are charged equally -- which is what makes a
  // trend chart of EBITDA readable rather than sawtoothed by February.
  const lifeDays = months * 30.4375;
  const endMs = startMs + lifeDays * DAY_MS;
  const days = overlapDays(startMs, endMs, fromMs, toMs);
  if (days <= 0) return 0;
  return Math.round((amount / lifeDays) * days);
}

export type WriteOffTotals = {
  depreciationPaise: number;
  amortizationPaise: number;
  /** Every investment still being written off in this range, for the panel
   *  that shows what the two figures are made of. */
  lines: { id: string; label: string; amountPaise: number; kind: "depreciation" | "amortization" }[];
};

export function writeOffTotals(
  investments: CapitalInvestment[],
  fromMs: number,
  toMs: number
): WriteOffTotals {
  let depreciationPaise = 0;
  let amortizationPaise = 0;
  const lines: WriteOffTotals["lines"] = [];
  for (const investment of investments) {
    const amountPaise = writeOffInRange(investment, fromMs, toMs);
    if (amountPaise <= 0) continue;
    const kind = investment.write_off_as === "amortization" ? "amortization" : "depreciation";
    if (kind === "amortization") amortizationPaise += amountPaise;
    else depreciationPaise += amountPaise;
    lines.push({ id: investment.id, label: investment.label, amountPaise, kind });
  }
  lines.sort((a, b) => b.amountPaise - a.amountPaise);
  return { depreciationPaise, amortizationPaise, lines };
}

// ---------------------------------------------------------------------------
// The profit and loss chain
// ---------------------------------------------------------------------------

export type MoneyLineItem = { label: string; amountPaise: number; note?: string };

export type ProfitAndLoss = {
  netRevenuePaise: number;
  /** What it cost to deliver the sessions that revenue came from. */
  cogsPaise: number;
  cogsLines: MoneyLineItem[];
  grossProfitPaise: number;
  /** Gross profit as a share of net revenue, or null with no revenue to take
   *  a share of. */
  grossMarginPercent: number | null;
  /** What it cost to run the clinic, whether or not anyone was treated. */
  operatingExpensesPaise: number;
  operatingExpenseLines: MoneyLineItem[];
  depreciationPaise: number;
  amortizationPaise: number;
  /** Gross profit less running costs and less the write-offs. The EBIT in
   *  EBITDA's name. */
  operatingIncomePaise: number;
  /** Operating income with the two write-offs added back -- which is the same
   *  thing as gross profit less running costs, and is exactly why the two
   *  figures differ by D and A rather than by anything else. */
  ebitdaPaise: number;
  interestPaise: number;
  taxPaise: number;
  /** Operating income less interest and tax. The bottom line, and the
   *  numerator of both net margin and ROI. */
  netProfitPaise: number;
  netMarginPercent: number | null;
};

/**
 * One pass over the period's money, in the order an accountant subtracts it.
 *
 * Every figure below is derived from the one above, so the chain adds up on
 * screen and a reader can follow it without a second explanation:
 *
 *     net revenue  - cost of delivery      = gross profit
 *     gross profit - running costs - D - A = operating income
 *     operating income + D + A             = EBITDA
 *     operating income - interest - tax    = net profit
 *
 * The three `cogsIncludes*` switches decide what "cost of delivery" covers.
 * They default to all three on, which is the reading most clinics recognise:
 * the therapist's cut, the partner's commission and the processor's fee are
 * all charged per session delivered and would not exist if the session had
 * not happened.
 */
export function profitAndLoss({
  netRevenuePaise,
  therapistCutPaise,
  partnerCutPaise,
  gatewayFeePaise,
  expenses,
  investments,
  fromMs,
  toMs,
  settings,
}: {
  netRevenuePaise: number;
  therapistCutPaise: number;
  partnerCutPaise: number;
  gatewayFeePaise: number;
  /** Already scoped to the range by the caller, the same way the Summary
   *  screen scopes them. */
  expenses: FinanceExpenseRow[];
  investments: CapitalInvestment[];
  fromMs: number;
  toMs: number;
  settings: FinanceSettings;
}): ProfitAndLoss {
  const byClass = expenseTotalsByClass(expenses);
  const writeOffs = writeOffTotals(investments, fromMs, toMs);

  const cogsLines: MoneyLineItem[] = [];
  if (settings.cogsIncludesTherapistShare && therapistCutPaise > 0) {
    cogsLines.push({
      label: "Therapists' share",
      amountPaise: therapistCutPaise,
      note: "Earned on sessions actually delivered, travel included",
    });
  }
  if (settings.cogsIncludesPartnerShare && partnerCutPaise > 0) {
    cogsLines.push({
      label: "Partners' share",
      amountPaise: partnerCutPaise,
      note: "A referring hospital's commission",
    });
  }
  if (settings.cogsIncludesPaymentFees && gatewayFeePaise > 0) {
    cogsLines.push({
      label: "Payment fees",
      amountPaise: gatewayFeePaise,
      note: "The gateway's cut of what was collected online",
    });
  }
  if (byClass.direct > 0) {
    cogsLines.push({
      label: "Costs you filed as delivery costs",
      amountPaise: byClass.direct,
      note: "Recorded on the Costs screen",
    });
  }

  const cogsPaise = cogsLines.reduce((sum, line) => sum + line.amountPaise, 0);
  const grossProfitPaise = netRevenuePaise - cogsPaise;

  const operatingExpenseLines: MoneyLineItem[] = [];
  if (byClass.fixed > 0) {
    operatingExpenseLines.push({
      label: "Running the clinic",
      amountPaise: byClass.fixed,
      note: "Rent, salaries, software, marketing - recorded on the Costs screen",
    });
  }
  // A gateway fee the owner has chosen *not* to treat as a cost of delivery
  // is still a cost: it moves here rather than disappearing. The same is true
  // of the two shares, which is what keeps operating income identical however
  // the three switches are set -- only the split between gross profit and
  // running costs moves, which is precisely what those switches are for.
  if (!settings.cogsIncludesTherapistShare && therapistCutPaise > 0) {
    operatingExpenseLines.push({
      label: "Therapists' share",
      amountPaise: therapistCutPaise,
      note: "You have this set to count as an overhead, not a delivery cost",
    });
  }
  if (!settings.cogsIncludesPartnerShare && partnerCutPaise > 0) {
    operatingExpenseLines.push({
      label: "Partners' share",
      amountPaise: partnerCutPaise,
      note: "You have this set to count as an overhead, not a delivery cost",
    });
  }
  if (!settings.cogsIncludesPaymentFees && gatewayFeePaise > 0) {
    operatingExpenseLines.push({
      label: "Payment fees",
      amountPaise: gatewayFeePaise,
      note: "You have this set to count as an overhead, not a delivery cost",
    });
  }

  const operatingExpensesPaise = operatingExpenseLines.reduce(
    (sum, line) => sum + line.amountPaise,
    0
  );

  // Both sources of a write-off: the straight line off each recorded
  // investment, and anything the owner filed as a depreciation cost because
  // they worked it out themselves.
  const depreciationPaise = writeOffs.depreciationPaise + byClass.depreciation;
  const amortizationPaise = writeOffs.amortizationPaise;

  const ebitdaPaise = grossProfitPaise - operatingExpensesPaise;
  const operatingIncomePaise = ebitdaPaise - depreciationPaise - amortizationPaise;
  const netProfitPaise = operatingIncomePaise - byClass.interest - byClass.tax;

  return {
    netRevenuePaise,
    cogsPaise,
    cogsLines,
    grossProfitPaise,
    grossMarginPercent: percentOf(grossProfitPaise, netRevenuePaise),
    operatingExpensesPaise,
    operatingExpenseLines,
    depreciationPaise,
    amortizationPaise,
    operatingIncomePaise,
    ebitdaPaise,
    interestPaise: byClass.interest,
    taxPaise: byClass.tax,
    netProfitPaise,
    netMarginPercent: percentOf(netProfitPaise, netRevenuePaise),
  };
}

/** A share of something, or null when there is nothing to take a share of.
 *  Null rather than 0: "no margin" and "no revenue" are opposite readings of
 *  the same screen, and one of them is not a measurement at all. */
export function percentOf(part: number, whole: number): number | null {
  if (!Number.isFinite(whole) || whole <= 0) return null;
  return (part / whole) * 100;
}

// ---------------------------------------------------------------------------
// 1. Return on investment
// ---------------------------------------------------------------------------

export type RoiResult = {
  /** Net profit as a percentage of what was invested. Null when nothing has
   *  been recorded as an investment -- dividing by nothing is not a return of
   *  nothing. */
  returnPercent: number | null;
  costOfInvestmentPaise: number;
  netProfitPaise: number;
  /** The second formula: what the investment is worth now against what it
   *  cost. Null unless at least one investment carries a valuation. */
  valueReturnPercent: number | null;
  valuedCostPaise: number;
  presentValuePaise: number;
  valuedCount: number;
  unvaluedCount: number;
  /** Why a null is null, in one sentence an owner can act on. */
  reason: string | null;
};

/**
 * Both ROI formulas off one set of rows.
 *
 * The first is the period's net profit against everything put in; the second
 * is what those things are worth now against what they cost. They are
 * different questions -- one is about trading, the other about the assets --
 * and the deck they come from puts them side by side for that reason.
 *
 * The second is computed over the **valued** investments only, never over all
 * of them with the unvalued ones' purchase price standing in for a valuation.
 * Mixing the two reports a return of zero on everything nobody has got round
 * to valuing, which is a wrong answer wearing the clothes of a right one.
 */
export function computeRoi({
  netProfitPaise,
  investments,
}: {
  netProfitPaise: number;
  investments: CapitalInvestment[];
}): RoiResult {
  let costOfInvestmentPaise = 0;
  let valuedCostPaise = 0;
  let presentValuePaise = 0;
  let valuedCount = 0;
  let unvaluedCount = 0;

  for (const investment of investments) {
    const amount = Math.max(0, investment.amount_paise);
    costOfInvestmentPaise += amount;
    if (investment.present_value_paise !== null && investment.present_value_paise !== undefined) {
      valuedCostPaise += amount;
      presentValuePaise += Math.max(0, investment.present_value_paise);
      valuedCount += 1;
    } else {
      unvaluedCount += 1;
    }
  }

  const returnPercent =
    costOfInvestmentPaise > 0 ? (netProfitPaise / costOfInvestmentPaise) * 100 : null;
  const valueReturnPercent =
    valuedCostPaise > 0
      ? ((presentValuePaise - valuedCostPaise) / valuedCostPaise) * 100
      : null;

  const reason =
    costOfInvestmentPaise === 0
      ? "Nothing has been recorded as an investment yet, so there is nothing to measure a return against."
      : valuedCostPaise === 0
      ? "No investment carries a present value yet, so only the profit-based return can be worked out."
      : null;

  return {
    returnPercent,
    costOfInvestmentPaise,
    netProfitPaise,
    valueReturnPercent,
    valuedCostPaise,
    presentValuePaise,
    valuedCount,
    unvaluedCount,
    reason,
  };
}

// ---------------------------------------------------------------------------
// 2. Return on advertising spend
// ---------------------------------------------------------------------------

export type CampaignRoas = {
  id: string;
  name: string;
  channel: string;
  /** The code this campaign is traced by, so a screen can name it. Kept as
   *  the id rather than the code itself: this module never loads the promo
   *  table, and a stale copy of a code's text is one more thing to disagree. */
  promoCodeId: string | null;
  spendPaise: number;
  revenuePaise: number;
  /** Where the revenue figure came from, because the two are not equally
   *  strong evidence and an owner reading a ratio deserves to know which. */
  attribution: "promo_code" | "entered_by_hand" | "none";
  ratio: number | null;
  /** Of the campaign's whole spend, the share that fell inside the dates in
   *  view. Shown so a part-overlapping campaign is not read as a cheap one. */
  spanDays: number;
  overlapDays: number;
};

export type RoasResult = {
  spendPaise: number;
  revenuePaise: number;
  /** Revenue per rupee of spend. Null when nothing was spent, or when nothing
   *  spent can be attributed. */
  ratio: number | null;
  byCampaign: CampaignRoas[];
  /** Spend whose return nobody can establish. Stated rather than silently
   *  left in the denominator, which would report a campaign as a failure for
   *  the sole reason that it was never tagged. */
  unattributedSpendPaise: number;
  reason: string | null;
};

/**
 * Spend spread across the days it ran, so a range means what it says.
 *
 * A campaign is one row with a span and a total, and "the last 30 days" wants
 * the part of that total belonging to those days. Spreading it evenly is an
 * assumption, and it is the only one available from a single figure -- so the
 * screen says how many of the campaign's days the range caught, and an owner
 * who runs uneven spend enters it as a row per month instead.
 */
export function campaignSpendInRange(
  campaign: MarketingCampaign,
  fromMs: number,
  toMs: number,
  nowMs: number
): { spendPaise: number; spanDays: number; overlapDays: number } {
  const startMs = istDayMs(campaign.starts_on);
  if (Number.isNaN(startMs)) return { spendPaise: 0, spanDays: 0, overlapDays: 0 };
  // A campaign with no end date is still running, so its span runs to the end
  // of today -- never to the end of the range in view, which would make the
  // same campaign's daily rate change every time somebody moved the dates.
  const endMs = campaign.ends_on
    ? istDayMs(campaign.ends_on) + DAY_MS
    : Math.max(startMs + DAY_MS, endOfIstDay(nowMs));
  const spanDays = Math.max(1, (endMs - startMs) / DAY_MS);
  const days = overlapDays(startMs, endMs, fromMs, toMs);
  const spendPaise = Math.round((Math.max(0, campaign.spend_paise) / spanDays) * days);
  return { spendPaise, spanDays, overlapDays: days };
}

/** Midnight IST at the end of the day `ms` falls in. */
export function endOfIstDay(ms: number): number {
  const IST_OFFSET_MS = 5.5 * 3_600_000;
  return Math.ceil((ms + IST_OFFSET_MS) / DAY_MS) * DAY_MS - IST_OFFSET_MS;
}

export function computeRoas({
  campaigns,
  revenueByPromoCodeId,
  fromMs,
  toMs,
  nowMs,
}: {
  campaigns: MarketingCampaign[];
  /** Net revenue, in the range, of every booking that claimed each code. Built
   *  from the appointments the Money screens already read, so the figure here
   *  and the figure on Summary are the same money. */
  revenueByPromoCodeId: Record<string, number>;
  fromMs: number;
  toMs: number;
  nowMs: number;
}): RoasResult {
  const byCampaign: CampaignRoas[] = [];
  let spendPaise = 0;
  let revenuePaise = 0;
  let unattributedSpendPaise = 0;

  for (const campaign of campaigns) {
    const { spendPaise: spend, spanDays, overlapDays: days } = campaignSpendInRange(
      campaign,
      fromMs,
      toMs,
      nowMs
    );
    if (days <= 0) continue;

    let campaignRevenue = 0;
    let attribution: CampaignRoas["attribution"] = "none";
    if (campaign.promo_code_id && revenueByPromoCodeId[campaign.promo_code_id] !== undefined) {
      campaignRevenue = revenueByPromoCodeId[campaign.promo_code_id];
      attribution = "promo_code";
    } else if (campaign.promo_code_id) {
      // The code exists and nothing claimed it in these dates. That is a real
      // answer -- zero revenue -- not a missing one.
      campaignRevenue = 0;
      attribution = "promo_code";
    } else if (
      campaign.attributed_revenue_paise !== null &&
      campaign.attributed_revenue_paise !== undefined
    ) {
      // Pro-rated the same way the spend is, so a hand-entered total for a
      // three-month campaign does not arrive whole inside a one-week range.
      campaignRevenue = Math.round(
        (Math.max(0, campaign.attributed_revenue_paise) / spanDays) * days
      );
      attribution = "entered_by_hand";
    }

    spendPaise += spend;
    if (attribution === "none") {
      unattributedSpendPaise += spend;
    } else {
      revenuePaise += campaignRevenue;
    }

    byCampaign.push({
      id: campaign.id,
      name: campaign.name,
      channel: campaign.channel,
      promoCodeId: campaign.promo_code_id,
      spendPaise: spend,
      revenuePaise: campaignRevenue,
      attribution,
      ratio: spend > 0 && attribution !== "none" ? campaignRevenue / spend : null,
      spanDays,
      overlapDays: days,
    });
  }

  byCampaign.sort((a, b) => b.spendPaise - a.spendPaise);

  const attributedSpendPaise = spendPaise - unattributedSpendPaise;
  const ratio = attributedSpendPaise > 0 ? revenuePaise / attributedSpendPaise : null;

  const reason =
    spendPaise === 0
      ? "No advertising spend falls in these dates, so there is no return to work out."
      : attributedSpendPaise === 0
      ? "None of this spend can be traced to revenue yet. Give a campaign a promo code, or enter what you believe it brought in."
      : null;

  return {
    spendPaise,
    revenuePaise,
    ratio,
    byCampaign,
    unattributedSpendPaise,
    reason,
  };
}

// ---------------------------------------------------------------------------
// 3. Working capital
// ---------------------------------------------------------------------------

export type WorkingCapital = {
  /** The snapshot these figures came from: every hand-entered row shares one
   *  date, and this is that date. Null when nothing has been entered. */
  snapshotDate: string | null;
  assetLines: MoneyLineItem[];
  liabilityLines: MoneyLineItem[];
  currentAssetsPaise: number;
  currentLiabilitiesPaise: number;
  netWorkingCapitalPaise: number;
  /** Assets over liabilities. Null with no liabilities: a ratio against
   *  nothing is not "infinitely healthy", it is not a ratio. */
  ratio: number | null;
  reason: string | null;
};

/**
 * What the clinic owns against what it owes, within the year.
 *
 * Two sources, kept visibly apart. The hand-entered snapshot is the bank
 * balance and the bills -- things only the owner knows. The derived lines are
 * balances this app already holds and would otherwise be copied across by
 * hand from another screen of the same dashboard: what therapists are owed,
 * cash they are holding on the clinic's behalf, refunds still to be handed
 * back, and sessions patients have paid for and not yet had.
 *
 * That last one is the line most often missed and the one that matters most:
 * money taken for a session not yet delivered is a liability, not profit, and
 * a clinic reading its bank balance as working capital is counting it twice.
 */
export function computeWorkingCapital({
  entries,
  asOfMs,
  derived,
  includeAppBalances,
}: {
  entries: BalanceSheetEntry[];
  /** Read the most recent snapshot at or before this instant, normally the
   *  end of the range in view. */
  asOfMs: number;
  derived: {
    owedToTherapistsPaise: number;
    cashTherapistsHoldPaise: number;
    refundsToHandBackPaise: number;
    unusedPaidSessionsPaise: number;
    /** Trusted patients who have been treated and not yet settled. Optional
     *  so a caller that has not been updated behaves exactly as before. */
    owedByPatientsPaise?: number;
  };
  includeAppBalances: boolean;
}): WorkingCapital {
  let snapshotDate: string | null = null;
  for (const entry of entries) {
    const ms = istDayMs(entry.as_of);
    if (Number.isNaN(ms) || ms > asOfMs) continue;
    if (snapshotDate === null || entry.as_of > snapshotDate) snapshotDate = entry.as_of;
  }

  const assetLines: MoneyLineItem[] = [];
  const liabilityLines: MoneyLineItem[] = [];

  if (snapshotDate !== null) {
    for (const entry of entries) {
      if (entry.as_of !== snapshotDate) continue;
      const line = { label: entry.label, amountPaise: Math.max(0, entry.amount_paise) };
      if (entry.side === "liability") liabilityLines.push(line);
      else assetLines.push(line);
    }
  }

  if (includeAppBalances) {
    if (derived.cashTherapistsHoldPaise > 0) {
      assetLines.push({
        label: "Cash therapists are holding",
        amountPaise: derived.cashTherapistsHoldPaise,
        note: "Collected at a patient's door and not yet handed in - yours, but not with you",
      });
    }
    // The app's first receivable. Same idea as the cash a therapist is holding
    // -- yours, but not with you -- and the mirror of "Owed to therapists" on
    // the other side of the sheet. It is an asset rather than a correction to
    // revenue because the session was delivered: the clinic earned that money
    // and has not collected it, which is precisely what a receivable is.
    if ((derived.owedByPatientsPaise ?? 0) > 0) {
      assetLines.push({
        label: "Owed by patients",
        amountPaise: derived.owedByPatientsPaise ?? 0,
        note: "Treated and not yet settled - already counted as revenue, not yet in the bank",
      });
    }
    if (derived.owedToTherapistsPaise > 0) {
      liabilityLines.push({
        label: "Owed to therapists",
        amountPaise: derived.owedToTherapistsPaise,
        note: "What a payout run would transfer right now",
      });
    }
    if (derived.refundsToHandBackPaise > 0) {
      liabilityLines.push({
        label: "Refunds still to hand back",
        amountPaise: derived.refundsToHandBackPaise,
        note: "Cash refunds a person has to return, and gateway refunds that failed",
      });
    }
    if (derived.unusedPaidSessionsPaise > 0) {
      liabilityLines.push({
        label: "Sessions paid for and not used",
        amountPaise: derived.unusedPaidSessionsPaise,
        note: "Money taken for treatment not yet delivered - owed as care, not as cash",
      });
    }
  }

  assetLines.sort((a, b) => b.amountPaise - a.amountPaise);
  liabilityLines.sort((a, b) => b.amountPaise - a.amountPaise);

  const currentAssetsPaise = assetLines.reduce((sum, line) => sum + line.amountPaise, 0);
  const currentLiabilitiesPaise = liabilityLines.reduce((sum, line) => sum + line.amountPaise, 0);

  const reason =
    assetLines.length === 0 && liabilityLines.length === 0
      ? "Nothing has been entered and the app knows of no balances, so there is nothing to compare."
      : assetLines.length === 0
      ? "No current assets have been entered yet - start with what is in the bank."
      : null;

  return {
    snapshotDate,
    assetLines,
    liabilityLines,
    currentAssetsPaise,
    currentLiabilitiesPaise,
    netWorkingCapitalPaise: currentAssetsPaise - currentLiabilitiesPaise,
    ratio: currentLiabilitiesPaise > 0 ? currentAssetsPaise / currentLiabilitiesPaise : null,
    reason,
  };
}

/** How a working-capital ratio reads, in a word and a sentence. The bands are
 *  the ones every textbook gives, and they are stated on screen rather than
 *  left as a number an owner has to know how to judge. */
export function readWorkingCapitalRatio(ratio: number | null): {
  verdict: "unknown" | "tight" | "healthy" | "idle";
  sentence: string;
} {
  if (ratio === null) {
    return {
      verdict: "unknown",
      sentence: "Nothing is owed within the year, so there is no ratio to read.",
    };
  }
  if (ratio < 1) {
    return {
      verdict: "tight",
      sentence:
        "Under 1 means what is owed within the year is more than what is available to pay it. Worth acting on.",
    };
  }
  if (ratio <= 2) {
    return {
      verdict: "healthy",
      sentence: "Between 1 and 2 is the comfortable band: enough to cover what is due, without idle money.",
    };
  }
  return {
    verdict: "idle",
    sentence:
      "Over 2 means a lot is sitting unused. Not a problem, but it could be doing something.",
  };
}

// ---------------------------------------------------------------------------
// 6. Break-even
// ---------------------------------------------------------------------------

export type UnitEconomics = {
  pricePaise: number | null;
  variableCostPaise: number | null;
  /** Whether each figure was worked out from the sessions in view or typed in
   *  by the owner. Shown, because one of them describes what happened and the
   *  other describes a plan. */
  priceSource: "sessions" | "entered_by_hand" | "unknown";
  costSource: "sessions" | "entered_by_hand" | "unknown";
  sessionCount: number;
};

/**
 * What one session sells for and costs, averaged over the sessions in view.
 *
 * Averaged rather than read off the price list because this clinic sells at
 * several prices -- a consultation, a programme session, a home visit with
 * travel, any of them discounted -- so the only honest unit price is the one
 * the period actually achieved. An owner modelling a change overrides both.
 */
export function unitEconomics({
  netRevenuePaise,
  variableCostPaise,
  paidSessionCount,
  settings,
}: {
  netRevenuePaise: number;
  /** The costs that move with volume: whatever the owner counts as a delivery
   *  cost. Taken from the same P&L pass, so the two screens agree. */
  variableCostPaise: number;
  paidSessionCount: number;
  settings: FinanceSettings;
}): UnitEconomics {
  const derivedPrice =
    paidSessionCount > 0 ? Math.round(netRevenuePaise / paidSessionCount) : null;
  const derivedCost =
    paidSessionCount > 0 ? Math.round(variableCostPaise / paidSessionCount) : null;

  const price = settings.breakEvenPricePaise ?? derivedPrice;
  const cost = settings.breakEvenVariableCostPaise ?? derivedCost;

  return {
    pricePaise: price,
    variableCostPaise: cost,
    priceSource:
      settings.breakEvenPricePaise !== null
        ? "entered_by_hand"
        : derivedPrice !== null
        ? "sessions"
        : "unknown",
    costSource:
      settings.breakEvenVariableCostPaise !== null
        ? "entered_by_hand"
        : derivedCost !== null
        ? "sessions"
        : "unknown",
    sessionCount: paidSessionCount,
  };
}

export type BreakEven = {
  fixedCostsPaise: number;
  pricePaise: number | null;
  variableCostPaise: number | null;
  /** What one session leaves towards the fixed costs. */
  contributionPaise: number | null;
  /** Sessions needed to cover the fixed costs. Null when a session leaves
   *  nothing to cover them with, which is a finding rather than a gap. */
  sessions: number | null;
  /** What those sessions would bill. */
  revenuePaise: number | null;
  /** Sessions actually delivered in the range, against the figure above. */
  actualSessions: number;
  /** How far past (or short of) break-even the period ran, in sessions. */
  surplusSessions: number | null;
  reason: string | null;
};

/**
 * How many sessions cover the costs that do not move.
 *
 * `Math.ceil`, always: three-and-a-bit sessions means four, because a session
 * is not sold in halves and rounding down reports a clinic as covered when it
 * is one session short.
 */
export function computeBreakEven({
  fixedCostsPaise,
  economics,
}: {
  /** Everything that is owed whether or not anyone is treated: running costs,
   *  the write-offs, interest and tax. */
  fixedCostsPaise: number;
  economics: UnitEconomics;
}): BreakEven {
  const { pricePaise, variableCostPaise } = economics;

  if (pricePaise === null || variableCostPaise === null) {
    return {
      fixedCostsPaise,
      pricePaise,
      variableCostPaise,
      contributionPaise: null,
      sessions: null,
      revenuePaise: null,
      actualSessions: economics.sessionCount,
      surplusSessions: null,
      reason:
        "No session was paid for in these dates, so there is no price to work from. Widen the dates, or enter a price and a cost yourself.",
    };
  }

  const contributionPaise = pricePaise - variableCostPaise;
  if (contributionPaise <= 0) {
    return {
      fixedCostsPaise,
      pricePaise,
      variableCostPaise,
      contributionPaise,
      sessions: null,
      revenuePaise: null,
      actualSessions: economics.sessionCount,
      surplusSessions: null,
      reason:
        "Each session costs at least as much to deliver as it earns, so no number of them covers the fixed costs. The price or the delivery cost has to move first.",
    };
  }

  const sessions = Math.ceil(fixedCostsPaise / contributionPaise);
  return {
    fixedCostsPaise,
    pricePaise,
    variableCostPaise,
    contributionPaise,
    sessions,
    revenuePaise: sessions * pricePaise,
    actualSessions: economics.sessionCount,
    surplusSessions: economics.sessionCount - sessions,
    reason: null,
  };
}

// ---------------------------------------------------------------------------
// 7. Revenue run rate
// ---------------------------------------------------------------------------

export type RunRate = {
  periodRevenuePaise: number;
  periodsPerYear: number;
  annualisedPaise: number;
  basis: RunRateBasis;
  /** What the multiplication says, in words: "x 12 months". */
  basisLabel: string;
  /** Whether the range is long enough for the answer to mean anything. A
   *  fortnight's takings multiplied by 26 is arithmetic, not a forecast. */
  confident: boolean;
};

const RUN_RATE_PERIODS: Record<Exclude<RunRateBasis, "auto">, number> = {
  weekly: 52,
  monthly: 12,
  quarterly: 4,
};

/**
 * This period's revenue, as if the year carried on like it.
 *
 * 'auto' reads the multiplier off the length of the range in view (365 over
 * however many days it covers), which is what makes the figure move sensibly
 * when somebody changes the dates rather than only when they change a setting.
 *
 * `confident` is false under 28 days. The figure is still shown -- suppressing
 * it would be worse -- but it is labelled, because a run rate off a short,
 * unrepresentative window is the single most over-read number on a dashboard.
 */
export function computeRunRate({
  periodRevenuePaise,
  fromMs,
  toMs,
  basis,
}: {
  periodRevenuePaise: number;
  fromMs: number;
  toMs: number;
  basis: RunRateBasis;
}): RunRate {
  const days = Math.max(1, Math.round((toMs - fromMs) / DAY_MS));
  const periodsPerYear =
    basis === "auto" ? 365 / days : RUN_RATE_PERIODS[basis];
  const basisLabel =
    basis === "auto"
      ? `× ${(365 / days).toFixed(1)} (365 days over the ${days} in view)`
      : basis === "weekly"
      ? "× 52 weeks"
      : basis === "monthly"
      ? "× 12 months"
      : "× 4 quarters";

  return {
    periodRevenuePaise,
    periodsPerYear,
    annualisedPaise: Math.round(periodRevenuePaise * periodsPerYear),
    basis,
    basisLabel,
    confident: days >= 28,
  };
}

// ---------------------------------------------------------------------------
// Series, for the charts
// ---------------------------------------------------------------------------

export type SeriesBucket = { label: string; startMs: number; endMs: number };

/** Expenses of the given classes, per bucket, dated by the day they were
 *  incurred rather than the day somebody typed them in. */
export function expensePaiseByBucket(
  expenses: FinanceExpenseRow[],
  buckets: SeriesBucket[],
  classes: CostClass[]
): number[] {
  const wanted = new Set(classes);
  const sums = buckets.map(() => 0);
  for (const expense of expenses) {
    if (!wanted.has(costClassOf(expense))) continue;
    const ms = istDayMs(expense.incurred_on);
    if (Number.isNaN(ms)) continue;
    const idx = buckets.findIndex((b) => ms >= b.startMs && ms < b.endMs);
    if (idx >= 0) sums[idx] += Math.max(0, expense.amount_paise);
  }
  return sums;
}

export function writeOffPaiseByBucket(
  investments: CapitalInvestment[],
  buckets: SeriesBucket[]
): number[] {
  return buckets.map((bucket) => {
    const totals = writeOffTotals(investments, bucket.startMs, bucket.endMs);
    return totals.depreciationPaise + totals.amortizationPaise;
  });
}

export function campaignSpendByBucket(
  campaigns: MarketingCampaign[],
  buckets: SeriesBucket[],
  nowMs: number
): number[] {
  return buckets.map((bucket) =>
    campaigns.reduce(
      (sum, campaign) =>
        sum + campaignSpendInRange(campaign, bucket.startMs, bucket.endMs, nowMs).spendPaise,
      0
    )
  );
}

// ---------------------------------------------------------------------------
// Money taken for treatment not yet delivered
// ---------------------------------------------------------------------------

/** A purchase, as the deferred-revenue figure needs it. Both catalogues have
 *  this shape -- a count bought, a count claimed and what was paid -- so one
 *  function serves session programmes and home-visit packages alike. */
export type UnusedBalanceRow = {
  paidPaise: number;
  total: number;
  used: number;
  status: string;
  paymentStatus: string;
};

/**
 * What the clinic has been paid for and still owes as treatment.
 *
 * A genuine current liability, and the one most often missed: a patient who
 * bought six sessions and has had two is owed four, and the money for them is
 * in the bank looking exactly like profit. Left out, a clinic reads its bank
 * balance as working capital and counts the same rupees twice.
 *
 * Valued at what was actually paid, pro-rated over the sessions bought --
 * never at the current list price, which would revalue somebody's purchase
 * every time an admin edited the catalogue. The same reason an entitlement
 * reads its frozen `package_snapshot`.
 *
 * Only an **active, paid** purchase counts. An expired one owes nothing (the
 * validity is the deal), a refunded one has been settled in cash, and a
 * cash-on-visit purchase that was never paid was never money in the bank.
 */
export function unusedPaidValuePaise(rows: UnusedBalanceRow[]): number {
  let total = 0;
  for (const row of rows) {
    if (row.status !== "active" || row.paymentStatus !== "paid") continue;
    if (!(row.total > 0)) continue;
    const remaining = Math.max(0, row.total - row.used);
    if (remaining === 0) continue;
    total += Math.round((Math.max(0, row.paidPaise) * remaining) / row.total);
  }
  return total;
}

/** A margin per bucket, as a percentage, with null where the bucket had no
 *  revenue. Charts draw a gap rather than a zero for those: a month with no
 *  patients did not have a 0% margin, it had no margin. */
export function marginPercentByBucket(
  numerator: number[],
  denominator: number[]
): (number | null)[] {
  return numerator.map((value, i) => percentOf(value, denominator[i] ?? 0));
}
