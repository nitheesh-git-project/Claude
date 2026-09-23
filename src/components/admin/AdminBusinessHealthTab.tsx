"use client";

import AdminScreenLink from "@/components/admin/AdminScreenLink";

import { useMemo, useState } from "react";
import SurfaceCard, { EmptyState } from "@/components/dashboard/SurfaceCard";
import StatStrip from "@/components/dashboard/StatStrip";
import MoneyFigure, { MoneyTermInfo } from "@/components/admin/MoneyFigure";
import DataExportButtons from "@/components/admin/DataExportButtons";
import {
  COST_COLOR,
  CompositionBars,
  GroupedBarChart,
  NEUTRAL_COLOR,
  PROFIT_COLOR,
  REVENUE_COLOR,
  TargetBar,
  TrendBarChart,
  TrendLineChart,
} from "@/components/admin/TrendCharts";
import {
  buildBuckets,
  filterByDimension,
  filterBySlotRange,
  moneyByBucketFor,
  explainMoneyLines,
  type BucketGranularity,
  type MetricsAppointment,
  type Person,
} from "@/lib/adminMetrics";
import { gatewayFeePaise, expensesInRange } from "@/lib/operatingCosts";
import { computeTherapistPayoutSummary } from "@/lib/therapistPayouts";
import {
  MARKETING_CHANNEL_LABELS,
  campaignSpendByBucket,
  computeBreakEven,
  computeRoas,
  computeRoi,
  computeRunRate,
  computeWorkingCapital,
  expensePaiseByBucket,
  marginPercentByBucket,
  profitAndLoss,
  readWorkingCapitalRatio,
  unitEconomics,
  writeOffPaiseByBucket,
  type BalanceSheetEntry,
  type CapitalInvestment,
  type FinanceExpenseRow,
  type FinanceSettings,
  type MarketingCampaign,
  type MoneyLineItem,
} from "@/lib/financeMetrics";
import { adminScreenHref } from "@/lib/adminNav";
import { MONEY_TERMS } from "@/lib/moneyTerms";
import { istDateKey } from "@/lib/formatSlotRange";
import type { CsvColumn } from "@/lib/csvExport";

// Business Health: the seven figures a bank, an investor or an accountant
// asks for, over this clinic's own money.
//
// It reads the same arithmetic the Money summary does -- `moneyByBucketFor`
// for the revenue split, `gatewayFeePaise` for the processor's cut -- rather
// than deriving revenue a second way, so the two screens cannot disagree
// about what the clinic earned. What it adds is the layer above: the standard
// ratios, and the handful of numbers only an owner can supply.
//
// Three rules run through the whole screen and are what make it trustworthy
// rather than merely full:
//
//  1. **A figure that cannot be worked out says so, and says what to do.**
//     Every one of these ratios has an input this app may not have. Showing a
//     zero would be read as a measurement -- "our return on ads is nil" -- so
//     each card falls back to the sentence naming the missing input and a
//     link to the screen that takes it.
//  2. **Every figure carries its formula and its sources behind the (i).**
//     These are not sums of rows an admin can eyeball; they are divisions of
//     two other figures, and half of them stand on something typed in. A
//     reader who cannot name the inputs cannot argue with the answer.
//  3. **Filtering narrows revenue, not costs.** Rent is not attributable to a
//     therapist, so a dimension filter makes every profit figure on this
//     screen a comparison of one therapist's revenue against the whole
//     clinic's costs. That is occasionally what somebody wants and is never
//     what they should read by accident, so the screen says so, loudly, while
//     a filter is on.

type Category = { id: string; title: string };

function formatInr(paise: number) {
  const sign = paise < 0 ? "-" : "";
  return `${sign}₹${Math.abs(Math.round(paise / 100)).toLocaleString("en-IN")}`;
}

function formatPercent(value: number | null, digits = 1) {
  if (value === null || !Number.isFinite(value)) return "-";
  return `${value.toFixed(digits)}%`;
}

function formatRatio(value: number | null) {
  if (value === null || !Number.isFinite(value)) return "-";
  return `${value.toFixed(2)}×`;
}

function toDateInputValue(d: Date) {
  return istDateKey(d.toISOString());
}

function daysAgo(n: number, fromMs: number) {
  return new Date(fromMs - n * 86_400_000);
}

function nowTimestamp() {
  return Date.now();
}

/** A row of the profit chain. `emphasis` is what a reader follows down the
 *  card: the three figures that are answers, rather than the subtractions
 *  between them. */
type ChainRow = {
  term: Parameters<typeof MoneyFigure>[0]["term"];
  amountPaise: number;
  emphasis?: boolean;
  negative?: boolean;
  lines?: MoneyLineItem[];
};

export default function AdminBusinessHealthTab({
  appointments,
  therapists,
  categories,
  patients,
  expenses,
  gatewayFeePercent,
  therapistSharePercent,
  therapistHomeVisitSharePercent,
  patientHospitalSharePercent,
  hospitalReferredPatientIds,
  investments,
  campaigns,
  balanceEntries,
  promoCodeIdByAppointmentId,
  promoCodeNameById,
  unusedPaidSessionsPaise,
  settings,
  canManageMoney,
  nowMs,
}: {
  /** The payout-enriched array, exactly as the Money summary takes it: without
   *  visit_mode, travel_fee_paise and the cash columns, every home visit's
   *  travel reimbursement drops out of the therapists' share and reappears as
   *  profit. */
  appointments: MetricsAppointment[];
  therapists: Person[];
  categories: Category[];
  patients: Person[];
  expenses: FinanceExpenseRow[];
  gatewayFeePercent: number;
  therapistSharePercent: Record<string, number>;
  therapistHomeVisitSharePercent: Record<string, number>;
  patientHospitalSharePercent: Record<string, number>;
  hospitalReferredPatientIds: Record<string, true>;
  investments: CapitalInvestment[];
  campaigns: MarketingCampaign[];
  balanceEntries: BalanceSheetEntry[];
  /** appointmentId -> the promo code it claimed. Loaded in its own query, so
   *  a database without the promo columns costs this screen its ad
   *  attribution and nothing else. */
  promoCodeIdByAppointmentId: Record<string, string>;
  promoCodeNameById: Record<string, string>;
  /** Money taken for sessions and visits nobody has had yet -- a real current
   *  liability, computed from the purchase rows the Catalog screen already
   *  loads. */
  unusedPaidSessionsPaise: number;
  settings: FinanceSettings;
  /** Whether this admin may change the readings on Your Numbers. Finance and
   *  Master Admin can; a scope holding Money at `view` reads the figures and
   *  is not offered links to forms it would be refused at. */
  canManageMoney: boolean;
  nowMs: number;
}) {
  const [fromDate, setFromDate] = useState(() => toDateInputValue(daysAgo(90, nowMs)));
  const [toDate, setToDate] = useState(() => toDateInputValue(new Date(nowMs)));
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [therapistFilter, setTherapistFilter] = useState("all");
  const [patientFilter, setPatientFilter] = useState("all");
  const [visitModeFilter, setVisitModeFilter] = useState<"all" | "online" | "home_visit">("all");
  const [paymentModeFilter, setPaymentModeFilter] = useState<"all" | "gateway" | "cash">("all");
  const [channelFilter, setChannelFilter] = useState("all");
  const [granularity, setGranularity] = useState<BucketGranularity>("auto");

  const earliestSlotDate = useMemo(() => {
    let earliest: number | null = null;
    for (const a of appointments) {
      if (!a.slot_time) continue;
      const ms = new Date(a.slot_time).getTime();
      if (Number.isNaN(ms)) continue;
      if (earliest === null || ms < earliest) earliest = ms;
    }
    return earliest === null ? null : toDateInputValue(new Date(earliest));
  }, [appointments]);

  function setQuickRange(days: number | null) {
    const now = nowTimestamp();
    setToDate(toDateInputValue(new Date(now)));
    setFromDate(
      days === null
        ? earliestSlotDate ?? toDateInputValue(daysAgo(365, now))
        : toDateInputValue(daysAgo(days, now))
    );
  }

  function clearFilters() {
    setCategoryFilter("all");
    setTherapistFilter("all");
    setPatientFilter("all");
    setVisitModeFilter("all");
    setPaymentModeFilter("all");
    setChannelFilter("all");
  }

  // Parsed at midnight IST, never the runtime's local midnight: the server
  // renders this component first and the browser hydrates it, and an unpinned
  // zone gives the two different bucket boundaries.
  const fromMs = useMemo(() => new Date(`${fromDate}T00:00:00+05:30`).getTime(), [fromDate]);
  const toMs = useMemo(
    () => new Date(`${toDate}T00:00:00+05:30`).getTime() + 86_400_000,
    [toDate]
  );

  const narrowed = useMemo(() => {
    const byDimension = filterByDimension(
      appointments,
      categoryFilter,
      therapistFilter,
      patientFilter
    );
    return byDimension.filter((a) => {
      if (visitModeFilter !== "all") {
        const mode = a.visit_mode ?? "online";
        if (mode !== visitModeFilter) return false;
      }
      if (paymentModeFilter !== "all") {
        const isCash = a.payment_method === "cash";
        if (paymentModeFilter === "cash" ? !isCash : isCash) return false;
      }
      return true;
    });
  }, [
    appointments,
    categoryFilter,
    therapistFilter,
    patientFilter,
    visitModeFilter,
    paymentModeFilter,
  ]);

  const revenueFiltered =
    categoryFilter !== "all" ||
    therapistFilter !== "all" ||
    patientFilter !== "all" ||
    visitModeFilter !== "all" ||
    paymentModeFilter !== "all";

  const inRange = useMemo(() => filterBySlotRange(narrowed, fromMs, toMs), [narrowed, fromMs, toMs]);
  const buckets = useMemo(
    () => buildBuckets(fromMs, toMs, granularity),
    [fromMs, toMs, granularity]
  );

  const rates = useMemo(
    () => ({
      therapistSharePercent,
      patientHospitalSharePercent,
      hospitalReferredPatientIds,
      therapistHomeVisitSharePercent,
    }),
    [
      therapistSharePercent,
      patientHospitalSharePercent,
      hospitalReferredPatientIds,
      therapistHomeVisitSharePercent,
    ]
  );

  const money = useMemo(
    () =>
      moneyByBucketFor(
        inRange,
        buckets,
        therapistSharePercent,
        patientHospitalSharePercent,
        hospitalReferredPatientIds,
        therapistHomeVisitSharePercent
      ),
    [
      inRange,
      buckets,
      therapistSharePercent,
      patientHospitalSharePercent,
      hospitalReferredPatientIds,
      therapistHomeVisitSharePercent,
    ]
  );

  // The same per-session function the totals above accumulate, so anything
  // this screen says about one session agrees with the figure it sits under.
  const moneyLines = useMemo(
    () => explainMoneyLines(inRange, buckets, rates),
    [inRange, buckets, rates]
  );

  const sum = (values: number[]) => values.reduce((s, v) => s + v, 0);
  const netRevenuePaise = sum(money.netRevenuePaise);
  const therapistCutPaise = sum(money.therapistCutPaise);
  const partnerCutPaise = sum(money.hospitalCutPaise);

  const rangeExpenses = useMemo(
    () => expensesInRange(expenses, fromMs, toMs) as FinanceExpenseRow[],
    [expenses, fromMs, toMs]
  );

  const gatewayPaise = useMemo(
    () => gatewayFeePaise(inRange, gatewayFeePercent, fromMs, toMs),
    [inRange, gatewayFeePercent, fromMs, toMs]
  );

  const pl = useMemo(
    () =>
      profitAndLoss({
        netRevenuePaise,
        therapistCutPaise,
        partnerCutPaise,
        gatewayFeePaise: gatewayPaise,
        expenses: rangeExpenses,
        investments,
        fromMs,
        toMs,
        settings,
      }),
    [
      netRevenuePaise,
      therapistCutPaise,
      partnerCutPaise,
      gatewayPaise,
      rangeExpenses,
      investments,
      fromMs,
      toMs,
      settings,
    ]
  );

  const roi = useMemo(
    () => computeRoi({ netProfitPaise: pl.netProfitPaise, investments }),
    [pl.netProfitPaise, investments]
  );

  // Revenue per promo code, built from the very lines the profit figures are
  // built from. An ad campaign's return is therefore the same money as the
  // revenue above it, rather than a second count of the same bookings.
  const revenueByPromoCodeId = useMemo(() => {
    const totals: Record<string, number> = {};
    for (const line of moneyLines) {
      const codeId = promoCodeIdByAppointmentId[line.appointmentId];
      if (!codeId) continue;
      totals[codeId] = (totals[codeId] ?? 0) + line.netPaise;
    }
    return totals;
  }, [moneyLines, promoCodeIdByAppointmentId]);

  const visibleCampaigns = useMemo(
    () => (channelFilter === "all" ? campaigns : campaigns.filter((c) => c.channel === channelFilter)),
    [campaigns, channelFilter]
  );

  const roas = useMemo(
    () =>
      computeRoas({
        campaigns: visibleCampaigns,
        revenueByPromoCodeId,
        fromMs,
        toMs,
        nowMs,
      }),
    [visibleCampaigns, revenueByPromoCodeId, fromMs, toMs, nowMs]
  );

  // The balances this app already holds, for working capital. Computed over
  // the **whole** appointments array rather than the filtered range: a debt
  // does not stop existing because it fell outside the dates in view, which
  // is the same rule the Money summary's "owed to therapists" follows.
  const derivedBalances = useMemo(() => {
    let owedToTherapistsPaise = 0;
    for (const t of therapists) {
      const own = appointments.filter((a) => a.therapist_id === t.id);
      owedToTherapistsPaise += computeTherapistPayoutSummary(
        t.id,
        therapistSharePercent[t.id] ?? null,
        own,
        nowMs,
        therapistHomeVisitSharePercent[t.id] ?? null
      ).netOwedPaise;
    }

    let cashTherapistsHoldPaise = 0;
    let refundsToHandBackPaise = 0;
    for (const a of appointments) {
      if (a.cash_collected_at && !a.cash_remitted_at) {
        cashTherapistsHoldPaise += Math.max(0, a.cash_collected_amount_paise ?? 0);
      }
      if (a.refund_status === "manual_pending" || a.refund_status === "failed") {
        refundsToHandBackPaise += Math.max(
          0,
          a.refund_amount_paise ?? a.amount_paid_paise ?? 0
        );
      }
    }

    return {
      owedToTherapistsPaise: Math.max(0, owedToTherapistsPaise),
      cashTherapistsHoldPaise,
      refundsToHandBackPaise,
      unusedPaidSessionsPaise,
    };
  }, [
    appointments,
    therapists,
    therapistSharePercent,
    therapistHomeVisitSharePercent,
    unusedPaidSessionsPaise,
    nowMs,
  ]);

  const workingCapital = useMemo(
    () =>
      computeWorkingCapital({
        entries: balanceEntries,
        asOfMs: toMs,
        derived: derivedBalances,
        includeAppBalances: settings.includeAppBalances,
      }),
    [balanceEntries, toMs, derivedBalances, settings.includeAppBalances]
  );
  const ratioReading = readWorkingCapitalRatio(workingCapital.ratio);

  const paidSessionCount = moneyLines.length;
  const economics = useMemo(
    () =>
      unitEconomics({
        netRevenuePaise,
        variableCostPaise: pl.cogsPaise,
        paidSessionCount,
        settings,
      }),
    [netRevenuePaise, pl.cogsPaise, paidSessionCount, settings]
  );

  // Everything owed whether or not anybody is treated. The write-offs,
  // interest and tax belong here as well as the running costs: break-even is
  // "what has to be covered", and a loan repayment has to be covered.
  const fixedCostsPaise =
    pl.operatingExpensesPaise +
    pl.depreciationPaise +
    pl.amortizationPaise +
    pl.interestPaise +
    pl.taxPaise;

  const breakEven = useMemo(
    () => computeBreakEven({ fixedCostsPaise, economics }),
    [fixedCostsPaise, economics]
  );

  const runRate = useMemo(
    () =>
      computeRunRate({
        periodRevenuePaise: netRevenuePaise,
        fromMs,
        toMs,
        basis: settings.runRateBasis,
      }),
    [netRevenuePaise, fromMs, toMs, settings.runRateBasis]
  );

  // --- Series for the charts ----------------------------------------------

  const costSeries = useMemo(() => {
    const direct = expensePaiseByBucket(rangeExpenses, buckets, ["direct"]);
    const fixed = expensePaiseByBucket(rangeExpenses, buckets, [
      "fixed",
      "interest",
      "tax",
      "depreciation",
    ]);
    const writeOffs = writeOffPaiseByBucket(investments, buckets);
    // The per-bucket gateway fee, worked out the same way the total is: from
    // the sessions in each bucket rather than by splitting the total, so a
    // bucket with no online payments correctly costs nothing.
    const gateway = buckets.map((b) =>
      gatewayFeePaise(inRange, gatewayFeePercent, b.startMs, b.endMs)
    );
    return { direct, fixed, writeOffs, gateway };
  }, [rangeExpenses, buckets, investments, inRange, gatewayFeePercent]);

  const cogsByBucket = useMemo(
    () =>
      buckets.map((_, i) => {
        let total = costSeries.direct[i] ?? 0;
        if (settings.cogsIncludesTherapistShare) total += money.therapistCutPaise[i] ?? 0;
        if (settings.cogsIncludesPartnerShare) total += money.hospitalCutPaise[i] ?? 0;
        if (settings.cogsIncludesPaymentFees) total += costSeries.gateway[i] ?? 0;
        return total;
      }),
    [buckets, costSeries, money, settings]
  );

  const grossProfitByBucket = useMemo(
    () => buckets.map((_, i) => (money.netRevenuePaise[i] ?? 0) - (cogsByBucket[i] ?? 0)),
    [buckets, money, cogsByBucket]
  );

  const allCostsByBucket = useMemo(
    () =>
      buckets.map(
        (_, i) =>
          (cogsByBucket[i] ?? 0) +
          (costSeries.fixed[i] ?? 0) +
          (costSeries.writeOffs[i] ?? 0) +
          // A gateway fee the owner counts as an overhead is still a cost;
          // it is added here exactly once either way.
          (settings.cogsIncludesPaymentFees ? 0 : costSeries.gateway[i] ?? 0) +
          (settings.cogsIncludesTherapistShare ? 0 : money.therapistCutPaise[i] ?? 0) +
          (settings.cogsIncludesPartnerShare ? 0 : money.hospitalCutPaise[i] ?? 0)
      ),
    [buckets, cogsByBucket, costSeries, money, settings]
  );

  const netProfitByBucket = useMemo(
    () => buckets.map((_, i) => (money.netRevenuePaise[i] ?? 0) - (allCostsByBucket[i] ?? 0)),
    [buckets, money, allCostsByBucket]
  );

  const grossMarginSeries = useMemo(
    () => marginPercentByBucket(grossProfitByBucket, money.netRevenuePaise),
    [grossProfitByBucket, money.netRevenuePaise]
  );
  const netMarginSeries = useMemo(
    () => marginPercentByBucket(netProfitByBucket, money.netRevenuePaise),
    [netProfitByBucket, money.netRevenuePaise]
  );

  const adSpendSeries = useMemo(
    () => campaignSpendByBucket(visibleCampaigns, buckets, nowMs),
    [visibleCampaigns, buckets, nowMs]
  );
  const adRevenueSeries = useMemo(
    () =>
      buckets.map((bucket) => {
        let total = 0;
        for (const line of moneyLines) {
          if (line.slotMs < bucket.startMs || line.slotMs >= bucket.endMs) continue;
          const codeId = promoCodeIdByAppointmentId[line.appointmentId];
          if (!codeId) continue;
          if (!visibleCampaigns.some((c) => c.promo_code_id === codeId)) continue;
          total += line.netPaise;
        }
        return total;
      }),
    [buckets, moneyLines, promoCodeIdByAppointmentId, visibleCampaigns]
  );

  const sessionsByBucket = useMemo(
    () =>
      buckets.map(
        (bucket) =>
          moneyLines.filter(
            (line) => line.slotMs >= bucket.startMs && line.slotMs < bucket.endMs
          ).length
      ),
    [buckets, moneyLines]
  );

  const rangeSubtitle = `Sessions dated ${fromDate} to ${toDate}${
    revenueFiltered ? " (filtered - costs are clinic-wide)" : ""
  }.`;

  // --- The profit chain, as rows -------------------------------------------

  const chain: ChainRow[] = [
    { term: "net_revenue", amountPaise: netRevenuePaise, emphasis: true },
    {
      term: "cost_of_delivery",
      amountPaise: pl.cogsPaise,
      negative: true,
      lines: pl.cogsLines,
    },
    { term: "gross_profit", amountPaise: pl.grossProfitPaise, emphasis: true },
    {
      term: "running_the_clinic",
      amountPaise: pl.operatingExpensesPaise,
      negative: true,
      lines: pl.operatingExpenseLines,
    },
    { term: "ebitda", amountPaise: pl.ebitdaPaise, emphasis: true },
    { term: "depreciation", amountPaise: pl.depreciationPaise, negative: true },
    { term: "amortization", amountPaise: pl.amortizationPaise, negative: true },
    { term: "operating_income", amountPaise: pl.operatingIncomePaise },
    { term: "interest_cost", amountPaise: pl.interestPaise, negative: true },
    { term: "tax_cost", amountPaise: pl.taxPaise, negative: true },
    { term: "net_profit", amountPaise: pl.netProfitPaise, emphasis: true },
  ];

  const chainColumns = useMemo<CsvColumn<ChainRow>[]>(
    () => [
      { header: "Line", value: (r) => r.term.replace(/_/g, " ") },
      { header: "Amount (INR)", value: (r) => (r.negative ? -r.amountPaise : r.amountPaise) / 100 },
    ],
    []
  );

  const campaignColumns = useMemo<CsvColumn<(typeof roas.byCampaign)[number]>[]>(
    () => [
      { header: "Campaign", value: (r) => r.name },
      {
        header: "Where",
        value: (r) => MARKETING_CHANNEL_LABELS[r.channel as keyof typeof MARKETING_CHANNEL_LABELS] ?? r.channel,
      },
      { header: "Spend in range (INR)", value: (r) => r.spendPaise / 100 },
      { header: "Revenue traced (INR)", value: (r) => r.revenuePaise / 100 },
      { header: "Return per rupee", value: (r) => (r.ratio === null ? "not traceable" : r.ratio.toFixed(2)) },
      {
        header: "How it was traced",
        value: (r) =>
          r.attribution === "promo_code"
            ? "Promo code"
            : r.attribution === "entered_by_hand"
            ? "Entered by hand"
            : "Not traced",
      },
    ],
    []
  );

  const yourNumbersHref = adminScreenHref("money", "inputs");

  return (
    <div className="space-y-6">
      <SurfaceCard
        title="Filters"
        icon="fa-filter"
        subtitle="Every figure and chart on this screen reads these dates. Narrowing by therapist, condition or patient narrows the revenue side only - see the note on the profit card."
      >
        <div className="flex flex-wrap items-end gap-4 text-xs">
          <label className="flex flex-col gap-1">
            <span className="font-semibold text-slate-500">From</span>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="rounded-lg border border-slate-300 px-2.5 py-1.5"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="font-semibold text-slate-500">To</span>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="rounded-lg border border-slate-300 px-2.5 py-1.5"
            />
          </label>
          <div className="flex flex-wrap items-center gap-1.5">
            {[
              { label: "30d", days: 30 },
              { label: "90d", days: 90 },
              { label: "6mo", days: 182 },
              { label: "12mo", days: 365 },
              { label: "All Time", days: null },
            ].map((q) => (
              <button
                key={q.label}
                type="button"
                onClick={() => setQuickRange(q.days)}
                className="rounded-lg border border-slate-200 px-2.5 py-1.5 font-semibold text-slate-600 hover:bg-slate-50"
              >
                {q.label}
              </button>
            ))}
          </div>
          <label className="flex flex-col gap-1">
            <span className="font-semibold text-slate-500">Chart steps</span>
            <select
              value={granularity}
              onChange={(e) => setGranularity(e.target.value as BucketGranularity)}
              className="rounded-lg border border-slate-300 px-2.5 py-1.5"
            >
              <option value="auto">Fit to the range</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="font-semibold text-slate-500">Condition</span>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="rounded-lg border border-slate-300 px-2.5 py-1.5"
            >
              <option value="all">Every condition</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="font-semibold text-slate-500">Therapist</span>
            <select
              value={therapistFilter}
              onChange={(e) => setTherapistFilter(e.target.value)}
              className="rounded-lg border border-slate-300 px-2.5 py-1.5"
            >
              <option value="all">Every therapist</option>
              {therapists.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.full_name ?? "Unknown"}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="font-semibold text-slate-500">Patient</span>
            <select
              value={patientFilter}
              onChange={(e) => setPatientFilter(e.target.value)}
              className="rounded-lg border border-slate-300 px-2.5 py-1.5"
            >
              <option value="all">Every patient</option>
              {patients.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.full_name ?? "Unknown"}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="font-semibold text-slate-500">Delivered</span>
            <select
              value={visitModeFilter}
              onChange={(e) =>
                setVisitModeFilter(e.target.value as "all" | "online" | "home_visit")
              }
              className="rounded-lg border border-slate-300 px-2.5 py-1.5"
            >
              <option value="all">Both ways</option>
              <option value="online">Video only</option>
              <option value="home_visit">Home visits only</option>
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="font-semibold text-slate-500">Paid</span>
            <select
              value={paymentModeFilter}
              onChange={(e) => setPaymentModeFilter(e.target.value as "all" | "gateway" | "cash")}
              className="rounded-lg border border-slate-300 px-2.5 py-1.5"
            >
              <option value="all">Any way</option>
              <option value="gateway">Online only</option>
              <option value="cash">Cash at the door only</option>
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="font-semibold text-slate-500">Ads from</span>
            <select
              value={channelFilter}
              onChange={(e) => setChannelFilter(e.target.value)}
              className="rounded-lg border border-slate-300 px-2.5 py-1.5"
            >
              <option value="all">Every channel</option>
              {Object.entries(MARKETING_CHANNEL_LABELS).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          {(revenueFiltered || channelFilter !== "all") && (
            <button
              type="button"
              onClick={clearFilters}
              className="rounded-lg border border-slate-300 px-2.5 py-1.5 font-semibold text-slate-600 hover:bg-slate-50"
            >
              Clear filters
            </button>
          )}
        </div>
      </SurfaceCard>

      {/* The four an owner scans first: two ratios and two plans. Every one of
          them carries its own (i) on the card below; the strip is the glance. */}
      <StatStrip
        cells={[
          {
            label: "Net profit margin",
            value: formatPercent(pl.netMarginPercent),
            note: `${formatInr(pl.netProfitPaise)} kept out of ${formatInr(netRevenuePaise)}`,
            accent: pl.netProfitPaise >= 0 ? "bg-emerald-500" : "bg-red-500",
            valueClass: pl.netProfitPaise < 0 ? "text-red-600" : "text-slate-800",
            scopeNote: "These dates",
          },
          {
            label: "EBITDA",
            value: formatInr(pl.ebitdaPaise),
            note: "Before interest, tax and wearing-out",
            accent: pl.ebitdaPaise >= 0 ? "bg-teal-500" : "bg-red-500",
            scopeNote: "These dates",
          },
          {
            label: "Break-even",
            value: breakEven.sessions === null ? "-" : `${breakEven.sessions} sessions`,
            note:
              breakEven.sessions === null
                ? "Not workable yet - see below"
                : `${breakEven.actualSessions} delivered in these dates`,
            accent:
              breakEven.sessions !== null && breakEven.actualSessions >= breakEven.sessions
                ? "bg-emerald-500"
                : "bg-amber-500",
            scopeNote: "These dates",
          },
          {
            label: "Revenue run rate",
            value: formatInr(runRate.annualisedPaise),
            note: runRate.confident
              ? `This period ${runRate.basisLabel}`
              : "Under a month of data - read with care",
            accent: "bg-slate-400",
            scopeNote: "These dates",
          },
        ]}
      />

      {/* 4. PROFIT MARGIN, and the chain that produces both margins. */}
      <SurfaceCard
        title="From revenue to profit"
        icon="fa-layer-group"
        subtitle="Each line comes off the one above it. Tap the (i) beside any of them for the formula and where its numbers come from."
        actions={
          <DataExportButtons
            filename="business-health-profit"
            title="Profit and loss"
            subtitle={rangeSubtitle}
            rows={chain}
            columns={chainColumns}
          />
        }
      >
        {revenueFiltered && (
          // The one way this screen can mislead, so it is said where the
          // figures are rather than in a footnote: rent is not attributable
          // to a therapist, so a filter compares one slice's revenue with the
          // whole clinic's costs.
          <p className="mb-4 rounded-xl bg-amber-50 px-3 py-2 text-[11px] font-semibold leading-relaxed text-amber-800">
            A filter is on. Revenue and delivery costs are narrowed to what you picked, but rent,
            salaries and every other running cost belong to the whole clinic and are shown in full -
            so the profit figures below are not this slice&apos;s profit. Clear the filters for a
            true bottom line.
          </p>
        )}

        <ul className="divide-y divide-slate-100">
          {chain.map((row) => (
            <li key={row.term} className="py-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="flex flex-wrap items-center gap-2">
                  <span
                    className={`text-xs ${
                      row.emphasis ? "font-bold text-slate-900" : "font-semibold text-slate-600"
                    }`}
                  >
                    {row.negative ? "less " : ""}
                    <MoneyLabel term={row.term} />
                  </span>
                  <MoneyTermInfo term={row.term} />
                </span>
                <span
                  className={`text-sm tabular-nums ${
                    row.emphasis ? "font-bold text-slate-900" : "font-semibold text-slate-600"
                  } ${row.amountPaise < 0 ? "text-red-600" : ""}`}
                >
                  {row.negative && row.amountPaise > 0 ? "-" : ""}
                  {formatInr(row.amountPaise)}
                </span>
              </div>
              {row.lines && row.lines.length > 0 && (
                <ul className="mt-1.5 space-y-1 pl-4">
                  {row.lines.map((line) => (
                    <li
                      key={line.label}
                      className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500"
                    >
                      <span>{line.label}</span>
                      <span className="tabular-nums">{formatInr(line.amountPaise)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <MoneyFigure
            term="gross_margin"
            icon="fa-percent"
            value={formatPercent(pl.grossMarginPercent)}
            note="What survives delivering the treatment"
            highlight
          />
          <MoneyFigure
            term="net_margin"
            icon="fa-percent"
            value={formatPercent(pl.netMarginPercent)}
            valueClass={pl.netProfitPaise < 0 ? "text-red-600" : "text-slate-900"}
            note="What you finally keep out of every rupee"
            highlight
          />
        </div>

        <div className="mt-6">
          <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">
            Money in against money out
          </h3>
          <GroupedBarChart
            buckets={buckets}
            series={[
              { label: "Net revenue", color: REVENUE_COLOR, values: money.netRevenuePaise },
              { label: "All costs", color: COST_COLOR, values: allCostsByBucket },
            ]}
            formatValue={formatInr}
            ariaLabel="Revenue against costs"
          />
        </div>

        <div className="mt-6">
          <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">
            Both margins over time
          </h3>
          <TrendLineChart
            buckets={buckets}
            series={[
              { label: "Gross margin", color: NEUTRAL_COLOR, values: grossMarginSeries },
              { label: "Net margin", color: PROFIT_COLOR, values: netMarginSeries },
            ]}
            formatValue={(v) => `${v.toFixed(1)}%`}
            ariaLabel="Gross and net margin over time"
          />
          <p className="mt-2 text-[11px] text-slate-500">
            A gap in a line is a period with no revenue at all - not a month at zero margin.
          </p>
        </div>
      </SurfaceCard>

      {/* 1. RETURN ON INVESTMENT */}
      <SurfaceCard
        title="Return on investment"
        icon="fa-arrow-trend-up"
        subtitle="What this period earned against everything you have put into the clinic, and what those things are worth now."
      >
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <MoneyFigure
            term="roi"
            icon="fa-chart-line"
            value={formatPercent(roi.returnPercent)}
            valueClass={
              roi.returnPercent !== null && roi.returnPercent < 0
                ? "text-red-600"
                : "text-slate-900"
            }
            note={`${formatInr(pl.netProfitPaise)} profit ÷ ${formatInr(roi.costOfInvestmentPaise)} invested`}
            highlight
          />
          <MoneyFigure
            term="roi_on_value"
            icon="fa-scale-balanced"
            value={formatPercent(roi.valueReturnPercent)}
            note={
              roi.valuedCount === 0
                ? "Nothing valued yet"
                : `${roi.valuedCount} valued, ${roi.unvaluedCount} not`
            }
            showScope
          />
          <MoneyFigure
            term="cost_of_investment"
            icon="fa-sack-dollar"
            value={formatInr(roi.costOfInvestmentPaise)}
            note={`${investments.length} thing${investments.length === 1 ? "" : "s"} recorded`}
            showScope
          />
          <MoneyFigure
            term="present_value"
            icon="fa-gem"
            value={formatInr(roi.presentValuePaise)}
            note="Your own valuation, over the ones you have valued"
            showScope
          />
        </div>

        {roi.reason && (
          <p className="mt-4 rounded-xl bg-slate-50 px-3 py-2 text-[11px] leading-relaxed text-slate-600">
            {roi.reason}{" "}
            {canManageMoney && (
              <a href={yourNumbersHref} className="font-semibold text-teal-700 hover:underline">
                Record what you have put in →
              </a>
            )}
          </p>
        )}

        {investments.length > 0 && (
          <div className="mt-5">
            <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">
              What is being written off in these dates
            </h3>
            {pl.depreciationPaise + pl.amortizationPaise === 0 ? (
              <p className="text-[11px] text-slate-500">
                Nothing. Either none of your investments has a life set, or their lives have already
                run out - both mean they cost these dates nothing.
              </p>
            ) : (
              <CompositionBars
                rows={[
                  { label: "Depreciation", amountPaise: pl.depreciationPaise },
                  { label: "Amortization", amountPaise: pl.amortizationPaise },
                ].filter((row) => row.amountPaise > 0)}
                formatValue={formatInr}
                color={NEUTRAL_COLOR}
              />
            )}
          </div>
        )}
      </SurfaceCard>

      {/* 2. RETURN ON ADVERTISING SPEND */}
      <SurfaceCard
        title="Return on ad spend"
        icon="fa-bullhorn"
        subtitle="What advertising cost over these dates, and what can honestly be traced back to it."
        actions={
          roas.byCampaign.length > 0 ? (
            <DataExportButtons
              filename="business-health-campaigns"
              title="Advertising campaigns"
              subtitle={rangeSubtitle}
              rows={roas.byCampaign}
              columns={campaignColumns}
            />
          ) : undefined
        }
      >
        <div className="grid gap-4 sm:grid-cols-3">
          <MoneyFigure
            term="roas"
            icon="fa-arrow-right-arrow-left"
            value={formatRatio(roas.ratio)}
            note={
              roas.ratio === null
                ? "Nothing traceable yet"
                : `₹${roas.ratio.toFixed(2)} of revenue per ₹1 spent`
            }
            highlight
          />
          <MoneyFigure
            term="ad_spend"
            icon="fa-money-bill-wave"
            value={formatInr(roas.spendPaise)}
            note={
              roas.unattributedSpendPaise > 0
                ? `${formatInr(roas.unattributedSpendPaise)} of it not traced to anything`
                : "All of it traced"
            }
          />
          <MoneyFigure
            term="ad_revenue"
            icon="fa-hand-holding-dollar"
            value={formatInr(roas.revenuePaise)}
            note="Only what a campaign can be traced to"
          />
        </div>

        {roas.reason && (
          <p className="mt-4 rounded-xl bg-slate-50 px-3 py-2 text-[11px] leading-relaxed text-slate-600">
            {roas.reason}{" "}
            {canManageMoney && (
              <a href={yourNumbersHref} className="font-semibold text-teal-700 hover:underline">
                Record a campaign →
              </a>
            )}
          </p>
        )}

        {roas.byCampaign.length > 0 && (
          <>
            <div className="mt-5 overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-slate-500">
                    <th className="pb-2 pr-3 font-semibold">Campaign</th>
                    <th className="pb-2 pr-3 font-semibold">Where</th>
                    <th className="pb-2 pr-3 text-right font-semibold">Spend here</th>
                    <th className="pb-2 pr-3 text-right font-semibold">Revenue traced</th>
                    <th className="pb-2 pr-3 text-right font-semibold">Per ₹1</th>
                    <th className="pb-2 font-semibold">Traced by</th>
                  </tr>
                </thead>
                <tbody>
                  {roas.byCampaign.map((c) => (
                    <tr key={c.id} className="border-b border-slate-100">
                      <td className="py-2.5 pr-3 font-semibold text-slate-800">{c.name}</td>
                      <td className="py-2.5 pr-3 text-slate-500">
                        {MARKETING_CHANNEL_LABELS[
                          c.channel as keyof typeof MARKETING_CHANNEL_LABELS
                        ] ?? c.channel}
                      </td>
                      <td className="py-2.5 pr-3 text-right tabular-nums text-slate-700">
                        {formatInr(c.spendPaise)}
                        {c.overlapDays < c.spanDays && (
                          <span className="block text-[10px] text-slate-500">
                            {Math.round(c.overlapDays)} of {Math.round(c.spanDays)} days
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 pr-3 text-right tabular-nums text-slate-700">
                        {c.attribution === "none" ? "-" : formatInr(c.revenuePaise)}
                      </td>
                      <td className="py-2.5 pr-3 text-right font-bold tabular-nums text-slate-900">
                        {formatRatio(c.ratio)}
                      </td>
                      <td className="py-2.5 text-[11px]">
                        {c.attribution === "promo_code" ? (
                          <span className="text-teal-700">
                            Promo code
                            {c.promoCodeId && promoCodeNameById[c.promoCodeId]
                              ? ` (${promoCodeNameById[c.promoCodeId]})`
                              : ""}
                          </span>
                        ) : c.attribution === "entered_by_hand" ? (
                          <span className="text-amber-700">Your own figure</span>
                        ) : (
                          <span className="text-slate-500">Not traced</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-6">
              <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">
                Spend against what it brought in
              </h3>
              <GroupedBarChart
                buckets={buckets}
                series={[
                  { label: "Ad spend", color: COST_COLOR, values: adSpendSeries },
                  { label: "Revenue traced", color: PROFIT_COLOR, values: adRevenueSeries },
                ]}
                formatValue={formatInr}
                ariaLabel="Advertising spend against traced revenue"
              />
            </div>
          </>
        )}
      </SurfaceCard>

      {/* 3. WORKING CAPITAL */}
      <SurfaceCard
        title="Working capital"
        icon="fa-scale-unbalanced"
        subtitle={
          workingCapital.snapshotDate
            ? `What you own against what you owe, as of ${workingCapital.snapshotDate}.`
            : "What you own against what you owe."
        }
      >
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <MoneyFigure
            term="working_capital"
            icon="fa-wallet"
            value={formatInr(workingCapital.netWorkingCapitalPaise)}
            valueClass={
              workingCapital.netWorkingCapitalPaise < 0 ? "text-red-600" : "text-slate-900"
            }
            note={ratioReading.sentence}
            highlight
            showScope
          />
          <MoneyFigure
            term="working_capital_ratio"
            icon="fa-divide"
            value={formatRatio(workingCapital.ratio)}
            valueClass={
              ratioReading.verdict === "tight" ? "text-red-600" : "text-slate-900"
            }
            note={
              ratioReading.verdict === "tight"
                ? "Under 1 - what is due is more than what is there"
                : ratioReading.verdict === "healthy"
                ? "In the comfortable band"
                : ratioReading.verdict === "idle"
                ? "Over 2 - money sitting unused"
                : "Nothing owed within the year"
            }
            showScope
          />
          <MoneyFigure
            term="current_assets"
            icon="fa-piggy-bank"
            value={formatInr(workingCapital.currentAssetsPaise)}
            note={`${workingCapital.assetLines.length} line${
              workingCapital.assetLines.length === 1 ? "" : "s"
            }`}
            showScope
          />
          <MoneyFigure
            term="current_liabilities"
            icon="fa-file-invoice-dollar"
            value={formatInr(workingCapital.currentLiabilitiesPaise)}
            note={`${workingCapital.liabilityLines.length} line${
              workingCapital.liabilityLines.length === 1 ? "" : "s"
            }`}
            showScope
          />
        </div>

        {workingCapital.reason ? (
          <p className="mt-4 rounded-xl bg-slate-50 px-3 py-2 text-[11px] leading-relaxed text-slate-600">
            {workingCapital.reason}{" "}
            {canManageMoney && (
              <a href={yourNumbersHref} className="font-semibold text-teal-700 hover:underline">
                Enter what you own and owe →
              </a>
            )}
          </p>
        ) : (
          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <div>
              <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">
                What you own
              </h3>
              {workingCapital.assetLines.length === 0 ? (
                <p className="text-[11px] text-slate-500">Nothing entered.</p>
              ) : (
                <CompositionBars
                  rows={workingCapital.assetLines}
                  formatValue={formatInr}
                  color={PROFIT_COLOR}
                />
              )}
            </div>
            <div>
              <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">
                What you owe
              </h3>
              {workingCapital.liabilityLines.length === 0 ? (
                <p className="text-[11px] text-slate-500">Nothing owed within the year.</p>
              ) : (
                <CompositionBars
                  rows={workingCapital.liabilityLines}
                  formatValue={formatInr}
                  color={COST_COLOR}
                />
              )}
            </div>
          </div>
        )}

        <p className="mt-4 text-[11px] leading-relaxed text-slate-500">
          A snapshot, not a period: it is true as of the latest date you entered, whatever dates are
          picked above.{" "}
          {settings.includeAppBalances
            ? "Balances this app already knows - what therapists are owed, cash they are holding, refunds to hand back, and sessions paid for but not used - are included."
            : "Only the figures you entered yourself are included; the balances this app knows are switched off on Your Numbers."}
        </p>
      </SurfaceCard>

      {/* 6. BREAK-EVEN POINT */}
      <SurfaceCard
        title="Break-even point"
        icon="fa-equals"
        subtitle="How many sessions these dates needed before the clinic had covered everything that does not move."
      >
        <div className="grid gap-4 sm:grid-cols-3">
          <MoneyFigure
            term="break_even_sessions"
            icon="fa-flag-checkered"
            value={breakEven.sessions === null ? "-" : String(breakEven.sessions)}
            note={
              breakEven.revenuePaise === null
                ? "Not workable yet"
                : `${formatInr(breakEven.revenuePaise)} of billing`
            }
            highlight
          />
          <MoneyFigure
            term="contribution_per_session"
            icon="fa-hand-holding-heart"
            value={
              breakEven.contributionPaise === null ? "-" : formatInr(breakEven.contributionPaise)
            }
            note={
              economics.pricePaise === null
                ? "No session to read a price off"
                : `${formatInr(economics.pricePaise)} charged, ${formatInr(
                    economics.variableCostPaise ?? 0
                  )} to deliver`
            }
          />
          <MoneyFigure
            term="fixed_costs"
            icon="fa-building"
            value={formatInr(fixedCostsPaise)}
            note="Running costs, write-offs, interest and tax"
          />
        </div>

        {breakEven.reason ? (
          <p className="mt-4 rounded-xl bg-amber-50 px-3 py-2 text-[11px] font-semibold leading-relaxed text-amber-800">
            {breakEven.reason}
          </p>
        ) : (
          <div className="mt-5 space-y-3">
            <TargetBar
              actual={breakEven.actualSessions}
              target={breakEven.sessions ?? 0}
              actualLabel={`${breakEven.actualSessions} sessions delivered`}
              targetLabel={`${breakEven.sessions} needed to break even`}
            />
            <p className="text-[11px] leading-relaxed text-slate-500">
              {breakEven.surplusSessions !== null && breakEven.surplusSessions >= 0
                ? `${breakEven.surplusSessions} session${
                    breakEven.surplusSessions === 1 ? "" : "s"
                  } past break-even. Everything after the line is profit.`
                : `${Math.abs(breakEven.surplusSessions ?? 0)} session${
                    Math.abs(breakEven.surplusSessions ?? 0) === 1 ? "" : "s"
                  } short of covering the costs that do not move.`}
              {economics.priceSource === "entered_by_hand" ||
              economics.costSource === "entered_by_hand"
                ? " Using the price or cost you entered on Your Numbers rather than what your sessions actually did."
                : " Using what your own sessions actually charged and cost."}
            </p>
          </div>
        )}

        <div className="mt-6">
          <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">
            Paid sessions, period by period
          </h3>
          <TrendBarChart
            buckets={buckets}
            values={sessionsByBucket}
            formatValue={(v) => String(v)}
            ariaLabel="Paid sessions per period"
          />
        </div>
      </SurfaceCard>

      {/* 7. REVENUE RUN RATE */}
      <SurfaceCard
        title="Revenue run rate"
        icon="fa-gauge-high"
        subtitle="This period's revenue, as if the whole year carried on the same way."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <MoneyFigure
            term="revenue_run_rate"
            icon="fa-forward"
            value={formatInr(runRate.annualisedPaise)}
            note={`${formatInr(netRevenuePaise)} ${runRate.basisLabel}`}
            highlight
          />
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
              How much to trust it
            </p>
            <p
              className={`mt-2 text-sm font-semibold ${
                runRate.confident ? "text-emerald-700" : "text-amber-700"
              }`}
            >
              {runRate.confident
                ? "The window is long enough to read as a rate."
                : "Under a month of data - this is arithmetic, not a forecast."}
            </p>
            <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
              A run rate assumes the rest of the year looks like these dates. It does not know about
              a festival week, a therapist on leave, or the campaign that ends on Friday.
            </p>
          </div>
        </div>

        <div className="mt-6">
          <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">
            Net revenue, period by period
          </h3>
          <TrendBarChart
            buckets={buckets}
            values={money.netRevenuePaise}
            formatValue={formatInr}
            ariaLabel="Net revenue per period"
          />
        </div>
      </SurfaceCard>

      {canManageMoney && (
        <SurfaceCard title="Where these numbers come from" icon="fa-circle-question">
          <p className="text-xs leading-relaxed text-slate-600">
            Everything about sessions, therapists, partners and payment fees is worked out from this
            app&apos;s own bookings. Four things are not, and cannot be: what you have invested, what
            you spend on advertising, what you own and owe outside this app, and your interest and
            tax. The first three live on{" "}
            <a href={yourNumbersHref} className="font-semibold text-teal-700 hover:underline">
              Your Numbers
            </a>
            ; interest and tax are ordinary costs on{" "}
            <AdminScreenLink
              href={adminScreenHref("money", "costs")}
              className="font-semibold text-teal-700 hover:underline"
            >
              Costs
            </AdminScreenLink>
            , filed under their own kind.
          </p>
        </SurfaceCard>
      )}

      {appointments.length === 0 && (
        <EmptyState
          icon="fa-chart-pie"
          title="No sessions yet"
          body="These figures are worked out from paid sessions. Once the clinic has taken its first payment, every one of them fills in."
        />
      )}
    </div>
  );
}

/** The figure's own name, from the money vocabulary, so a heading on this
 *  screen and the glossary entry behind its (i) can never be two different
 *  words for one thing. */
function MoneyLabel({ term }: { term: Parameters<typeof MoneyFigure>[0]["term"] }) {
  return <>{MONEY_TERM_NAMES[term]}</>;
}

const MONEY_TERM_NAMES: Record<string, string> = Object.fromEntries(
  Object.entries(MONEY_TERMS).map(([key, value]) => [key, value.term])
);
