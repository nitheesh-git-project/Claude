import { describe, it, expect } from "vitest";
import {
  DEFAULT_COST_CLASS,
  DEFAULT_FINANCE_SETTINGS,
  campaignSpendInRange,
  computeBreakEven,
  computeRoas,
  computeRoi,
  computeRunRate,
  computeWorkingCapital,
  costClassOf,
  expensePaiseByBucket,
  expenseTotalsByClass,
  istDayMs,
  marginPercentByBucket,
  percentOf,
  profitAndLoss,
  readWorkingCapitalRatio,
  unitEconomics,
  unusedPaidValuePaise,
  writeOffInRange,
  writeOffTotals,
  type CapitalInvestment,
  type FinanceExpenseRow,
  type MarketingCampaign,
} from "./financeMetrics";
import { BAD_DEBT_EXPENSE_CATEGORY, EXPENSE_CATEGORIES } from "./operatingCosts";

const RUPEE = 100;

function expense(
  partial: Partial<FinanceExpenseRow> & { amount_paise: number }
): FinanceExpenseRow {
  return {
    id: partial.id ?? Math.random().toString(36).slice(2),
    incurred_on: partial.incurred_on ?? "2026-03-10",
    category: partial.category ?? "Rent",
    description: partial.description ?? null,
    cost_class: partial.cost_class,
    amount_paise: partial.amount_paise,
  };
}

function investment(partial: Partial<CapitalInvestment> & { amount_paise: number }): CapitalInvestment {
  return {
    id: partial.id ?? Math.random().toString(36).slice(2),
    label: partial.label ?? "Physio couch",
    invested_on: partial.invested_on ?? "2026-01-01",
    amount_paise: partial.amount_paise,
    present_value_paise: partial.present_value_paise ?? null,
    present_value_as_of: partial.present_value_as_of ?? null,
    useful_life_months: partial.useful_life_months ?? null,
    write_off_as: partial.write_off_as ?? "depreciation",
  };
}

function campaign(partial: Partial<MarketingCampaign> & { spend_paise: number }): MarketingCampaign {
  return {
    id: partial.id ?? Math.random().toString(36).slice(2),
    name: partial.name ?? "March push",
    channel: partial.channel ?? "google",
    starts_on: partial.starts_on ?? "2026-03-01",
    // "ends_on" in partial, not ?? -- an explicit null is the case under test
    // (a campaign still running), and ?? would turn it back into the default.
    ends_on: "ends_on" in partial ? partial.ends_on ?? null : "2026-03-31",
    spend_paise: partial.spend_paise,
    promo_code_id: partial.promo_code_id ?? null,
    attributed_revenue_paise: partial.attributed_revenue_paise ?? null,
  };
}

describe("percentOf", () => {
  it("returns null rather than zero when there is nothing to take a share of", () => {
    // The whole reason this helper exists: a 0% margin and no revenue at all
    // read identically on screen and mean opposite things.
    expect(percentOf(500, 0)).toBeNull();
    expect(percentOf(0, 0)).toBeNull();
    expect(percentOf(-500, 0)).toBeNull();
  });

  it("is a plain percentage otherwise, including a negative one", () => {
    expect(percentOf(25, 100)).toBe(25);
    expect(percentOf(-25, 100)).toBe(-25);
  });
});

describe("cost classes", () => {
  it("reads an unset class as a running cost", () => {
    // Every row recorded before the column existed was a running cost, so the
    // default is what keeps today's figures unmoved by this feature landing.
    expect(costClassOf(expense({ amount_paise: 100, cost_class: null }))).toBe("fixed");
    expect(costClassOf(expense({ amount_paise: 100, cost_class: undefined }))).toBe("fixed");
    expect(costClassOf(expense({ amount_paise: 100, cost_class: "nonsense" }))).toBe("fixed");
  });

  it("totals each class separately", () => {
    const totals = expenseTotalsByClass([
      expense({ amount_paise: 1000, cost_class: "fixed" }),
      expense({ amount_paise: 500, cost_class: "direct" }),
      expense({ amount_paise: 250, cost_class: "interest" }),
      expense({ amount_paise: 125, cost_class: "tax" }),
      expense({ amount_paise: 60, cost_class: "depreciation" }),
      expense({ amount_paise: 40 }),
    ]);
    expect(totals).toEqual({ direct: 500, fixed: 1040, interest: 250, tax: 125, depreciation: 60 });
  });
});

describe("writeOffInRange", () => {
  it("writes off nothing without a useful life", () => {
    // A life is the owner saying how long the thing lasts. Inventing one puts
    // an expense into the accounts they never agreed to.
    const item = investment({ amount_paise: 120_000 * RUPEE, useful_life_months: null });
    expect(writeOffInRange(item, istDayMs("2026-01-01"), istDayMs("2027-01-01"))).toBe(0);
  });

  it("spreads the whole amount across the whole life and no further", () => {
    const item = investment({
      amount_paise: 120_000,
      invested_on: "2026-01-01",
      useful_life_months: 12,
    });
    const whole = writeOffInRange(item, istDayMs("2026-01-01"), istDayMs("2028-01-01"));
    expect(whole).toBe(120_000);
    // Nothing left to charge once the life is over.
    expect(writeOffInRange(item, istDayMs("2027-06-01"), istDayMs("2028-01-01"))).toBe(0);
  });

  it("charges two equal-length windows equally", () => {
    // The daily-rate rule: a trend chart of EBITDA must not be sawtoothed by
    // February being short.
    const item = investment({
      amount_paise: 365_000,
      invested_on: "2026-01-01",
      useful_life_months: 60,
    });
    const jan = writeOffInRange(item, istDayMs("2026-01-01"), istDayMs("2026-01-31"));
    const feb = writeOffInRange(item, istDayMs("2026-02-01"), istDayMs("2026-03-03"));
    expect(jan).toBe(feb);
  });

  it("splits depreciation from amortization by the recorded word, not the label", () => {
    const totals = writeOffTotals(
      [
        investment({ amount_paise: 120_000, useful_life_months: 12, write_off_as: "depreciation" }),
        investment({
          label: "Website build",
          amount_paise: 60_000,
          useful_life_months: 12,
          write_off_as: "amortization",
        }),
      ],
      istDayMs("2026-01-01"),
      // Past the end of both lives: a 12-month life is 365.25 days, so a
      // window of exactly one calendar year would leave a few hours of it
      // uncharged and the two figures would read as odd amounts.
      istDayMs("2028-01-01")
    );
    expect(totals.depreciationPaise).toBe(120_000);
    expect(totals.amortizationPaise).toBe(60_000);
    expect(totals.lines).toHaveLength(2);
  });
});

describe("profitAndLoss", () => {
  const base = {
    netRevenuePaise: 1_000_000,
    therapistCutPaise: 400_000,
    partnerCutPaise: 50_000,
    gatewayFeePaise: 20_000,
    investments: [] as CapitalInvestment[],
    fromMs: istDayMs("2026-03-01"),
    toMs: istDayMs("2026-04-01"),
  };

  it("subtracts in the order an accountant does, and the chain adds up", () => {
    const pl = profitAndLoss({
      ...base,
      expenses: [
        expense({ amount_paise: 200_000, cost_class: "fixed" }),
        expense({ amount_paise: 30_000, cost_class: "interest" }),
        expense({ amount_paise: 25_000, cost_class: "tax" }),
      ],
      settings: DEFAULT_FINANCE_SETTINGS,
    });

    expect(pl.cogsPaise).toBe(470_000);
    expect(pl.grossProfitPaise).toBe(530_000);
    expect(pl.grossMarginPercent).toBe(53);
    expect(pl.operatingExpensesPaise).toBe(200_000);
    expect(pl.ebitdaPaise).toBe(330_000);
    expect(pl.operatingIncomePaise).toBe(330_000);
    expect(pl.netProfitPaise).toBe(275_000);
    expect(pl.netMarginPercent).toBeCloseTo(27.5, 9);
  });

  it("EBITDA differs from operating income by exactly the two write-offs", () => {
    const pl = profitAndLoss({
      ...base,
      investments: [
        investment({ amount_paise: 365_000, invested_on: "2026-01-01", useful_life_months: 12 }),
        investment({
          amount_paise: 120_000,
          invested_on: "2026-01-01",
          useful_life_months: 12,
          write_off_as: "amortization",
        }),
      ],
      expenses: [expense({ amount_paise: 200_000, cost_class: "fixed" })],
      settings: DEFAULT_FINANCE_SETTINGS,
    });

    expect(pl.depreciationPaise).toBeGreaterThan(0);
    expect(pl.amortizationPaise).toBeGreaterThan(0);
    expect(pl.ebitdaPaise - pl.depreciationPaise - pl.amortizationPaise).toBe(
      pl.operatingIncomePaise
    );
  });

  it("adds a depreciation cost the owner worked out themselves to the derived line", () => {
    const pl = profitAndLoss({
      ...base,
      expenses: [expense({ amount_paise: 15_000, cost_class: "depreciation" })],
      settings: DEFAULT_FINANCE_SETTINGS,
    });
    expect(pl.depreciationPaise).toBe(15_000);
  });

  it("moves a share between gross profit and running costs without moving operating income", () => {
    // The whole point of the three switches: they are a reading of the same
    // money, not a change to it. If flipping one moved the bottom line, the
    // switch would be a way to report a different profit.
    const expenses = [expense({ amount_paise: 200_000, cost_class: "fixed" })];
    const withFees = profitAndLoss({ ...base, expenses, settings: DEFAULT_FINANCE_SETTINGS });
    const withoutFees = profitAndLoss({
      ...base,
      expenses,
      settings: { ...DEFAULT_FINANCE_SETTINGS, cogsIncludesPaymentFees: false },
    });

    expect(withoutFees.cogsPaise).toBe(withFees.cogsPaise - 20_000);
    expect(withoutFees.operatingExpensesPaise).toBe(withFees.operatingExpensesPaise + 20_000);
    expect(withoutFees.operatingIncomePaise).toBe(withFees.operatingIncomePaise);
    expect(withoutFees.netProfitPaise).toBe(withFees.netProfitPaise);
  });

  it("has no margin at all when there was no revenue", () => {
    const pl = profitAndLoss({
      ...base,
      netRevenuePaise: 0,
      therapistCutPaise: 0,
      partnerCutPaise: 0,
      gatewayFeePaise: 0,
      expenses: [expense({ amount_paise: 200_000, cost_class: "fixed" })],
      settings: DEFAULT_FINANCE_SETTINGS,
    });
    expect(pl.grossMarginPercent).toBeNull();
    expect(pl.netMarginPercent).toBeNull();
    expect(pl.netProfitPaise).toBe(-200_000);
  });
});

describe("computeRoi", () => {
  it("refuses a return when nothing has been invested", () => {
    const roi = computeRoi({ netProfitPaise: 500_000, investments: [] });
    expect(roi.returnPercent).toBeNull();
    expect(roi.reason).toMatch(/nothing to measure a return against/i);
  });

  it("is profit over cost", () => {
    const roi = computeRoi({
      netProfitPaise: 250_000,
      investments: [investment({ amount_paise: 1_000_000 })],
    });
    expect(roi.returnPercent).toBe(25);
  });

  it("measures the value formula over valued investments only", () => {
    // Letting an unvalued investment stand at its purchase price reports a 0%
    // return on it -- a wrong answer wearing the clothes of a right one.
    const roi = computeRoi({
      netProfitPaise: 0,
      investments: [
        investment({
          amount_paise: 100_000,
          present_value_paise: 150_000,
          present_value_as_of: "2026-03-01",
        }),
        investment({ amount_paise: 900_000 }),
      ],
    });
    expect(roi.valuedCostPaise).toBe(100_000);
    expect(roi.presentValuePaise).toBe(150_000);
    expect(roi.valueReturnPercent).toBe(50);
    expect(roi.unvaluedCount).toBe(1);
    // The profit-based formula still counts everything put in.
    expect(roi.costOfInvestmentPaise).toBe(1_000_000);
  });

  it("says why there is no value-based return when nothing is valued", () => {
    const roi = computeRoi({
      netProfitPaise: 10,
      investments: [investment({ amount_paise: 100 })],
    });
    expect(roi.valueReturnPercent).toBeNull();
    expect(roi.reason).toMatch(/present value/i);
  });
});

describe("campaignSpendInRange", () => {
  const now = istDayMs("2026-04-15");

  it("gives the whole spend when the range covers the whole campaign", () => {
    const result = campaignSpendInRange(
      campaign({ spend_paise: 310_000, starts_on: "2026-03-01", ends_on: "2026-03-31" }),
      istDayMs("2026-01-01"),
      istDayMs("2026-05-01"),
      now
    );
    expect(result.spendPaise).toBe(310_000);
    expect(result.spanDays).toBe(31);
  });

  it("spreads it evenly over a part-overlapping range", () => {
    const result = campaignSpendInRange(
      campaign({ spend_paise: 310_000, starts_on: "2026-03-01", ends_on: "2026-03-31" }),
      istDayMs("2026-03-01"),
      istDayMs("2026-03-11"),
      now
    );
    expect(result.overlapDays).toBe(10);
    expect(result.spendPaise).toBe(100_000);
  });

  it("runs an open-ended campaign to today rather than to the end of the range", () => {
    // Otherwise the same campaign's daily rate changes every time somebody
    // moves the dates, and one row reads as two different budgets.
    const open = campaign({ spend_paise: 100_000, starts_on: "2026-04-01", ends_on: null });
    const narrow = campaignSpendInRange(open, istDayMs("2026-04-01"), istDayMs("2026-04-06"), now);
    const wide = campaignSpendInRange(open, istDayMs("2026-04-01"), istDayMs("2026-04-16"), now);
    expect(narrow.spanDays).toBe(wide.spanDays);
    expect(wide.spendPaise).toBeGreaterThan(narrow.spendPaise);
  });

  it("contributes nothing outside its own dates", () => {
    const result = campaignSpendInRange(
      campaign({ spend_paise: 310_000, starts_on: "2026-03-01", ends_on: "2026-03-31" }),
      istDayMs("2026-05-01"),
      istDayMs("2026-06-01"),
      now
    );
    expect(result.spendPaise).toBe(0);
    expect(result.overlapDays).toBe(0);
  });
});

describe("computeRoas", () => {
  const range = { fromMs: istDayMs("2026-03-01"), toMs: istDayMs("2026-04-01") };
  const now = istDayMs("2026-04-15");

  it("attributes by promo code, from the revenue the Money screens already read", () => {
    const roas = computeRoas({
      campaigns: [campaign({ spend_paise: 100_000, promo_code_id: "code-1" })],
      revenueByPromoCodeId: { "code-1": 400_000 },
      ...range,
      nowMs: now,
    });
    expect(roas.ratio).toBe(4);
    expect(roas.byCampaign[0].attribution).toBe("promo_code");
  });

  it("keeps untraceable spend out of the ratio and names it", () => {
    // Leaving it in the denominator reports a campaign as a failure for the
    // sole reason that nobody tagged it.
    const roas = computeRoas({
      campaigns: [
        campaign({ id: "a", spend_paise: 100_000, promo_code_id: "code-1" }),
        campaign({ id: "b", spend_paise: 50_000 }),
      ],
      revenueByPromoCodeId: { "code-1": 400_000 },
      ...range,
      nowMs: now,
    });
    expect(roas.spendPaise).toBe(150_000);
    expect(roas.unattributedSpendPaise).toBe(50_000);
    expect(roas.ratio).toBe(4);
  });

  it("gives no ratio at all when nothing can be traced", () => {
    const roas = computeRoas({
      campaigns: [campaign({ spend_paise: 100_000 })],
      revenueByPromoCodeId: {},
      ...range,
      nowMs: now,
    });
    expect(roas.ratio).toBeNull();
    expect(roas.reason).toMatch(/promo code/i);
  });

  it("reads a code nobody claimed as zero revenue, not as missing", () => {
    const roas = computeRoas({
      campaigns: [campaign({ spend_paise: 100_000, promo_code_id: "code-1" })],
      revenueByPromoCodeId: {},
      ...range,
      nowMs: now,
    });
    expect(roas.byCampaign[0].attribution).toBe("promo_code");
    expect(roas.ratio).toBe(0);
  });

  it("pro-rates a hand-entered revenue the same way it pro-rates the spend", () => {
    const roas = computeRoas({
      campaigns: [
        campaign({
          spend_paise: 310_000,
          attributed_revenue_paise: 620_000,
          starts_on: "2026-03-01",
          ends_on: "2026-03-31",
        }),
      ],
      revenueByPromoCodeId: {},
      fromMs: istDayMs("2026-03-01"),
      toMs: istDayMs("2026-03-11"),
      nowMs: now,
    });
    expect(roas.spendPaise).toBe(100_000);
    expect(roas.revenuePaise).toBe(200_000);
    expect(roas.byCampaign[0].attribution).toBe("entered_by_hand");
  });
});

describe("computeWorkingCapital", () => {
  const derived = {
    owedToTherapistsPaise: 30_000,
    cashTherapistsHoldPaise: 5_000,
    refundsToHandBackPaise: 2_000,
    unusedPaidSessionsPaise: 40_000,
  };

  it("reads the most recent snapshot at or before the dates in view", () => {
    const wc = computeWorkingCapital({
      entries: [
        { id: "1", as_of: "2026-01-31", side: "asset", label: "Bank", amount_paise: 100_000 },
        { id: "2", as_of: "2026-02-28", side: "asset", label: "Bank", amount_paise: 200_000 },
        { id: "3", as_of: "2026-05-31", side: "asset", label: "Bank", amount_paise: 900_000 },
      ],
      asOfMs: istDayMs("2026-04-01"),
      derived,
      includeAppBalances: false,
    });
    expect(wc.snapshotDate).toBe("2026-02-28");
    expect(wc.currentAssetsPaise).toBe(200_000);
  });

  it("adds the balances the app already knows, on both sides", () => {
    const wc = computeWorkingCapital({
      entries: [
        { id: "1", as_of: "2026-03-31", side: "asset", label: "Bank", amount_paise: 200_000 },
        { id: "2", as_of: "2026-03-31", side: "liability", label: "GST due", amount_paise: 20_000 },
      ],
      asOfMs: istDayMs("2026-04-01"),
      derived,
      includeAppBalances: true,
    });
    expect(wc.currentAssetsPaise).toBe(205_000);
    expect(wc.currentLiabilitiesPaise).toBe(92_000);
    expect(wc.netWorkingCapitalPaise).toBe(113_000);
    expect(wc.liabilityLines.map((l) => l.label)).toContain("Sessions paid for and not used");
  });

  it("leaves them out when the owner has switched them off", () => {
    const wc = computeWorkingCapital({
      entries: [{ id: "1", as_of: "2026-03-31", side: "asset", label: "Bank", amount_paise: 200_000 }],
      asOfMs: istDayMs("2026-04-01"),
      derived,
      includeAppBalances: false,
    });
    expect(wc.currentAssetsPaise).toBe(200_000);
    expect(wc.currentLiabilitiesPaise).toBe(0);
    expect(wc.ratio).toBeNull();
  });

  it("has no ratio when nothing is owed, rather than an infinite one", () => {
    const wc = computeWorkingCapital({
      entries: [{ id: "1", as_of: "2026-03-31", side: "asset", label: "Bank", amount_paise: 1 }],
      asOfMs: istDayMs("2026-04-01"),
      derived: {
        owedToTherapistsPaise: 0,
        cashTherapistsHoldPaise: 0,
        refundsToHandBackPaise: 0,
        unusedPaidSessionsPaise: 0,
      },
      includeAppBalances: true,
    });
    expect(wc.ratio).toBeNull();
    expect(readWorkingCapitalRatio(wc.ratio).verdict).toBe("unknown");
  });

  it("reads the ratio in the bands every textbook gives", () => {
    expect(readWorkingCapitalRatio(0.8).verdict).toBe("tight");
    expect(readWorkingCapitalRatio(1.5).verdict).toBe("healthy");
    expect(readWorkingCapitalRatio(3).verdict).toBe("idle");
  });
});

describe("break-even", () => {
  it("averages the price over the sessions that actually sold", () => {
    const economics = unitEconomics({
      netRevenuePaise: 1_000_000,
      variableCostPaise: 400_000,
      paidSessionCount: 20,
      settings: DEFAULT_FINANCE_SETTINGS,
    });
    expect(economics.pricePaise).toBe(50_000);
    expect(economics.variableCostPaise).toBe(20_000);
    expect(economics.priceSource).toBe("sessions");
  });

  it("prefers the owner's own figures when they are modelling", () => {
    const economics = unitEconomics({
      netRevenuePaise: 1_000_000,
      variableCostPaise: 400_000,
      paidSessionCount: 20,
      settings: {
        ...DEFAULT_FINANCE_SETTINGS,
        breakEvenPricePaise: 60_000,
        breakEvenVariableCostPaise: 25_000,
      },
    });
    expect(economics.pricePaise).toBe(60_000);
    expect(economics.priceSource).toBe("entered_by_hand");
    expect(economics.costSource).toBe("entered_by_hand");
  });

  it("rounds up, because a session is not sold in halves", () => {
    const breakEven = computeBreakEven({
      fixedCostsPaise: 100_000,
      economics: unitEconomics({
        netRevenuePaise: 300_000,
        variableCostPaise: 0,
        paidSessionCount: 10,
        settings: DEFAULT_FINANCE_SETTINGS,
      }),
    });
    // 100,000 / 30,000 = 3.33 sessions, which is four.
    expect(breakEven.sessions).toBe(4);
    expect(breakEven.revenuePaise).toBe(120_000);
    expect(breakEven.surplusSessions).toBe(6);
  });

  it("refuses a break-even when a session leaves nothing towards the costs", () => {
    const breakEven = computeBreakEven({
      fixedCostsPaise: 100_000,
      economics: unitEconomics({
        netRevenuePaise: 100_000,
        variableCostPaise: 120_000,
        paidSessionCount: 10,
        settings: DEFAULT_FINANCE_SETTINGS,
      }),
    });
    expect(breakEven.sessions).toBeNull();
    expect(breakEven.reason).toMatch(/no number of them covers/i);
  });

  it("says so when there is no session to read a price off", () => {
    const breakEven = computeBreakEven({
      fixedCostsPaise: 100_000,
      economics: unitEconomics({
        netRevenuePaise: 0,
        variableCostPaise: 0,
        paidSessionCount: 0,
        settings: DEFAULT_FINANCE_SETTINGS,
      }),
    });
    expect(breakEven.sessions).toBeNull();
    expect(breakEven.reason).toMatch(/no session was paid for/i);
  });
});

describe("computeRunRate", () => {
  it("annualises off the length of the range when set to auto", () => {
    const rate = computeRunRate({
      periodRevenuePaise: 100_000,
      fromMs: istDayMs("2026-03-01"),
      toMs: istDayMs("2026-03-31"),
      basis: "auto",
    });
    expect(rate.periodsPerYear).toBeCloseTo(365 / 30, 6);
    expect(rate.annualisedPaise).toBe(Math.round(100_000 * (365 / 30)));
  });

  it("uses the fixed multiplier when the owner has picked one", () => {
    const rate = computeRunRate({
      periodRevenuePaise: 100_000,
      fromMs: istDayMs("2026-03-01"),
      toMs: istDayMs("2026-03-31"),
      basis: "monthly",
    });
    expect(rate.periodsPerYear).toBe(12);
    expect(rate.annualisedPaise).toBe(1_200_000);
    expect(rate.basisLabel).toBe("× 12 months");
  });

  it("flags a window too short to forecast from", () => {
    const rate = computeRunRate({
      periodRevenuePaise: 100_000,
      fromMs: istDayMs("2026-03-01"),
      toMs: istDayMs("2026-03-08"),
      basis: "auto",
    });
    expect(rate.confident).toBe(false);
  });
});

describe("unusedPaidValuePaise", () => {
  const row = {
    paidPaise: 600_000,
    total: 6,
    used: 2,
    status: "active",
    paymentStatus: "paid",
  };

  it("values what is left at what was paid, pro-rated", () => {
    // Never at the current list price: an admin re-pricing the catalogue must
    // not revalue what somebody already bought.
    expect(unusedPaidValuePaise([row])).toBe(400_000);
  });

  it("owes nothing on an expired, refunded or unpaid purchase", () => {
    expect(unusedPaidValuePaise([{ ...row, status: "expired" }])).toBe(0);
    expect(unusedPaidValuePaise([{ ...row, status: "refunded" }])).toBe(0);
    expect(unusedPaidValuePaise([{ ...row, paymentStatus: "unpaid" }])).toBe(0);
  });

  it("owes nothing once every session has been used", () => {
    expect(unusedPaidValuePaise([{ ...row, used: 6 }])).toBe(0);
    expect(unusedPaidValuePaise([{ ...row, used: 9 }])).toBe(0);
  });
});

describe("series", () => {
  const buckets = [
    { label: "Mar", startMs: istDayMs("2026-03-01"), endMs: istDayMs("2026-04-01") },
    { label: "Apr", startMs: istDayMs("2026-04-01"), endMs: istDayMs("2026-05-01") },
  ];

  it("buckets an expense by the day it was incurred, not the day it was typed", () => {
    const values = expensePaiseByBucket(
      [
        expense({ amount_paise: 1000, incurred_on: "2026-03-15", cost_class: "fixed" }),
        expense({ amount_paise: 500, incurred_on: "2026-04-02", cost_class: "fixed" }),
        expense({ amount_paise: 250, incurred_on: "2026-04-02", cost_class: "tax" }),
      ],
      buckets,
      ["fixed"]
    );
    expect(values).toEqual([1000, 500]);
  });

  it("draws a gap, not a zero, for a bucket with no revenue", () => {
    expect(marginPercentByBucket([100, 0], [1000, 0])).toEqual([10, null]);
  });
});

describe("a written-off pay-later session lands as bad debt", () => {
  // `/api/admin/write-off-pay-later-session` records the loss as one
  // `business_expenses` row at the DEFAULT cost class, and this is why that
  // is the right class rather than the convenient one. Bad debt is an
  // operating expense: the clinic delivered the session and counted the
  // revenue, so the loss sits BELOW the gross-profit line, INSIDE what
  // break-even has to cover, and is NOT added back in EBITDA the way a
  // write-off of an asset is.
  const base = {
    netRevenuePaise: 1_000_000,
    therapistCutPaise: 400_000,
    partnerCutPaise: 50_000,
    gatewayFeePaise: 20_000,
    investments: [] as CapitalInvestment[],
    fromMs: istDayMs("2026-03-01"),
    toMs: istDayMs("2026-04-01"),
  };

  const badDebt = expense({
    amount_paise: 120_000,
    category: BAD_DEBT_EXPENSE_CATEGORY,
    cost_class: DEFAULT_COST_CLASS,
  });

  it("is never a cost of delivery, so gross margin does not move", () => {
    const without = profitAndLoss({ ...base, expenses: [], settings: DEFAULT_FINANCE_SETTINGS });
    const with_ = profitAndLoss({
      ...base,
      expenses: [badDebt],
      settings: DEFAULT_FINANCE_SETTINGS,
    });
    expect(with_.cogsPaise).toBe(without.cogsPaise);
    expect(with_.grossProfitPaise).toBe(without.grossProfitPaise);
    expect(with_.grossMarginPercent).toBe(without.grossMarginPercent);
  });

  it("comes off operating income and off EBITDA, in full", () => {
    const without = profitAndLoss({ ...base, expenses: [], settings: DEFAULT_FINANCE_SETTINGS });
    const with_ = profitAndLoss({
      ...base,
      expenses: [badDebt],
      settings: DEFAULT_FINANCE_SETTINGS,
    });
    expect(with_.operatingExpensesPaise).toBe(without.operatingExpensesPaise + 120_000);
    // Not added back: unlike depreciation, money the clinic never collected
    // is a real operating loss in the period it was given up on.
    expect(with_.ebitdaPaise).toBe(without.ebitdaPaise - 120_000);
    expect(with_.depreciationPaise).toBe(without.depreciationPaise);
    expect(with_.netProfitPaise).toBe(without.netProfitPaise - 120_000);
  });

  it("reads as a running cost on a database that never got the class column", () => {
    // The route's fallback insert drops `cost_class` on an unmigrated
    // database. That must land the loss in the same place, or the figure
    // moves depending on which database wrote it.
    expect(costClassOf(expense({ amount_paise: 1, category: BAD_DEBT_EXPENSE_CATEGORY }))).toBe(
      "fixed"
    );
  });

  it("is not a category an admin can type by hand", () => {
    // Keeping it out of the hand-entry list is what makes "written-off
    // sessions should equal the bad-debt rows" a reconciliation rather than
    // a coincidence -- System Health reads exactly that.
    expect(EXPENSE_CATEGORIES as readonly string[]).not.toContain(BAD_DEBT_EXPENSE_CATEGORY);
  });
});
