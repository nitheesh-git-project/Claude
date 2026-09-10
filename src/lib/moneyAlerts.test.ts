import { describe, it, expect } from "vitest";
import {
  buildMoneyAlerts,
  moneyAlertsHeadline,
  type MoneyAlertCounts,
} from "@/lib/moneyAlerts";

const NONE: MoneyAlertCounts = {
  payoutRequestsOpen: 0,
  cashToRemitVisits: 0,
  manualRefundsPending: 0,
  unmatchedPayments: 0,
};

const ALL_SECTIONS = ["today", "sessions", "people", "money", "catalog", "settings"];

describe("buildMoneyAlerts", () => {
  it("says nothing when nothing is waiting", () => {
    const alerts = buildMoneyAlerts(NONE, ALL_SECTIONS);
    expect(alerts).toHaveLength(0);
    expect(moneyAlertsHeadline(alerts)).toBe("Nothing in Money needs you");
  });

  // A zero row is a row an admin reads and does nothing about, every time.
  it("drops an item with nothing behind it", () => {
    const alerts = buildMoneyAlerts({ ...NONE, manualRefundsPending: 2 }, ALL_SECTIONS);
    expect(alerts.map((a) => a.key)).toEqual(["manual_refunds"]);
  });

  // Same rule as the admin home's quick actions: an action for a section
  // this scope cannot open would be redirected by findTab to some other
  // screen, and the dead link would look like it worked.
  it("drops an item whose screen this admin cannot open", () => {
    const counts = { ...NONE, unmatchedPayments: 1, payoutRequestsOpen: 1 };
    const financeSections = ["today", "people", "money"];
    const keys = buildMoneyAlerts(counts, financeSections).map((a) => a.key);
    expect(keys).toEqual(["payout_requests"]);

    const full = buildMoneyAlerts(counts, ALL_SECTIONS).map((a) => a.key);
    expect(full).toContain("unmatched_payments");
  });

  // Money that has left the clinic's control reads differently from work
  // sitting in a queue -- a payout request is somebody waiting, cash in a
  // therapist's pocket is exposure.
  it("marks the ones that are money out of the clinic's hands", () => {
    const alerts = buildMoneyAlerts(
      {
        payoutRequestsOpen: 1,
        cashToRemitVisits: 1,
        manualRefundsPending: 1,
        unmatchedPayments: 1,
      },
      ALL_SECTIONS
    );
    const urgent = alerts.filter((a) => a.urgent).map((a) => a.key);
    expect(urgent).toEqual(["cash_to_remit", "manual_refunds", "unmatched_payments"]);
  });

  it("counts things, not rows of the list", () => {
    const alerts = buildMoneyAlerts(
      { ...NONE, cashToRemitVisits: 3, manualRefundsPending: 1 },
      ALL_SECTIONS
    );
    expect(moneyAlertsHeadline(alerts)).toBe("4 things need you");
    expect(moneyAlertsHeadline(buildMoneyAlerts({ ...NONE, manualRefundsPending: 1 }, ALL_SECTIONS))).toBe(
      "1 thing needs you"
    );
  });

  it("gives every item somewhere to go and something to do", () => {
    const alerts = buildMoneyAlerts(
      {
        payoutRequestsOpen: 1,
        cashToRemitVisits: 1,
        manualRefundsPending: 1,
        unmatchedPayments: 1,
      },
      ALL_SECTIONS
    );
    for (const alert of alerts) {
      expect(alert.hint.length).toBeGreaterThan(20);
      expect(alert.tab.length).toBeGreaterThan(0);
    }
  });
});
