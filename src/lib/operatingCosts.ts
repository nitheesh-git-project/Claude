// What it costs to run the clinic, kept dependency-free like the rest of the
// business maths so it can be reasoned about without rendering.
//
// This module exists to close a real gap: the Money screens could show what
// was left after the therapist and partner splits, but nothing after that.
// "Clinic share" is a gross figure -- it has never had a payment-gateway
// fee, a salary or a software subscription taken out of it -- which is why
// no screen in this app was allowed to use the word profit. Costs come from
// two places, deliberately kept apart:
//
//   1. The payment-gateway fee, which is charged per transaction and
//      automatically. Nobody should have to remember to type it in, so it is
//      derived from the sessions that were actually paid for online.
//   2. Everything else -- salaries, rent, software, marketing -- which only a
//      person knows about, recorded by hand in `business_expenses`.

export const EXPENSE_CATEGORIES = [
  "Salaries",
  "Rent",
  "Software",
  "Marketing",
  "Equipment",
  "Professional fees",
  "Other",
] as const;
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

/** Razorpay's standard domestic card/UPI rate at the time of writing. An
 *  admin can change it in Settings -> Booking Rules; this is only what a
 *  clinic that has never touched the setting gets. */
export const DEFAULT_PAYMENT_GATEWAY_FEE_PERCENT = 2;

export type ExpenseRow = {
  id: string;
  incurred_on: string;
  category: string;
  description: string | null;
  amount_paise: number;
};

export type GatewayFeeAppointment = {
  payment_status: string;
  amount_paid_paise: number | null;
  slot_time: string | null;
  /** 'cash' for a cash-on-visit home visit, which never touches the gateway. */
  payment_method?: string | null;
};

/**
 * The gateway's cut of everything collected online in [fromMs, toMs).
 *
 * Charged on the **gross** amount, not net of refunds: a payment processor
 * keeps its fee when a payment is reversed, so a refunded session costs the
 * clinic the fee twice over -- once on the way in, and again as the refund
 * itself. Netting it off would flatter the number.
 *
 * Cash collections are excluded because no gateway was involved. That is the
 * same `payment_method` check the rest of the home-visit code uses, and the
 * reason this takes appointments rather than a single revenue total: whether
 * a fee was charged is a per-payment fact, not a percentage of turnover.
 */
export function gatewayFeePaise(
  appointments: GatewayFeeAppointment[],
  feePercent: number,
  fromMs: number,
  toMs: number
): number {
  if (!(feePercent > 0)) return 0;
  let total = 0;
  for (const a of appointments) {
    if (a.payment_status !== "paid" || !a.slot_time) continue;
    if (a.payment_method === "cash") continue;
    const ms = new Date(a.slot_time).getTime();
    if (Number.isNaN(ms) || ms < fromMs || ms >= toMs) continue;
    total += Math.round(((a.amount_paid_paise ?? 0) * feePercent) / 100);
  }
  return total;
}

/**
 * Recorded expenses in [fromMs, toMs), by the day they were incurred.
 *
 * `incurred_on` is a plain date, so it is read at midnight IST -- the
 * clinic's own timezone, matching how every other date range on the Money
 * screens is anchored. Reading it as UTC would push an expense entered on
 * the 1st into the previous month for the five and a half hours before
 * midnight UTC.
 */
export function expensesInRange(
  expenses: ExpenseRow[],
  fromMs: number,
  toMs: number
): ExpenseRow[] {
  return expenses.filter((e) => {
    const ms = new Date(`${e.incurred_on}T00:00:00+05:30`).getTime();
    return !Number.isNaN(ms) && ms >= fromMs && ms < toMs;
  });
}

export function sumExpensesPaise(expenses: ExpenseRow[]): number {
  return expenses.reduce((sum, e) => sum + Math.max(0, e.amount_paise), 0);
}

export function expensesByCategory(
  expenses: ExpenseRow[]
): { category: string; amountPaise: number; count: number }[] {
  const byCategory = new Map<string, { amountPaise: number; count: number }>();
  for (const e of expenses) {
    const current = byCategory.get(e.category) ?? { amountPaise: 0, count: 0 };
    current.amountPaise += Math.max(0, e.amount_paise);
    current.count += 1;
    byCategory.set(e.category, current);
  }
  return [...byCategory.entries()]
    .map(([category, v]) => ({ category, ...v }))
    .sort((a, b) => b.amountPaise - a.amountPaise);
}

export type OperatingResult = {
  clinicSharePaise: number;
  gatewayFeePaise: number;
  recordedExpensesPaise: number;
  totalCostsPaise: number;
  operatingProfitPaise: number;
  /** Operating profit as a share of net revenue, or null when there was no
   *  revenue to take a percentage of. */
  marginPercent: number | null;
};

/**
 * The bottom line: what the clinic actually kept.
 *
 * `clinicSharePaise` is what is left of net revenue after the therapist and
 * partner splits (moneyByBucketFor). Taking the two cost figures off it is
 * the only place in this codebase entitled to the word profit -- and even
 * here it is *operating* profit: tax and depreciation are a filing, not a
 * dashboard.
 */
export function operatingResult({
  clinicSharePaise,
  gatewayFeePaise: gateway,
  recordedExpensesPaise,
  netRevenuePaise,
}: {
  clinicSharePaise: number;
  gatewayFeePaise: number;
  recordedExpensesPaise: number;
  netRevenuePaise: number;
}): OperatingResult {
  const totalCostsPaise = gateway + recordedExpensesPaise;
  const operatingProfitPaise = clinicSharePaise - totalCostsPaise;
  return {
    clinicSharePaise,
    gatewayFeePaise: gateway,
    recordedExpensesPaise,
    totalCostsPaise,
    operatingProfitPaise,
    marginPercent:
      netRevenuePaise > 0 ? (operatingProfitPaise / netRevenuePaise) * 100 : null,
  };
}
