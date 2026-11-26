import { describe, expect, it } from "vitest";
import {
  availabilitySummary,
  progressHeadline,
  paymentsSummary,
  recommendationsWaiting,
  sessionsSummary,
  trendSentence,
} from "./tabSummaries";
import type { PatientReceipt } from "./receipts";

const NOW = Date.parse("2026-11-24T06:00:00Z");
const H = 3_600_000;
const at = (h: number) => new Date(NOW + h * H).toISOString();

describe("sessionsSummary", () => {
  it("counts by the Sessions list's own rule and finds the soonest upcoming", () => {
    const s = sessionsSummary(
      [
        { id: "a", status: "confirmed", slotTime: at(48) },
        { id: "b", status: "confirmed", slotTime: at(5) },
        { id: "c", status: "completed", slotTime: at(-100) },
        { id: "d", status: "completed", slotTime: at(-200), noShow: true },
        { id: "e", status: "cancelled", slotTime: at(10) },
        // Inside the open-session grace: still upcoming on the list.
        { id: "f", status: "confirmed", slotTime: at(-2) },
      ],
      NOW
    );
    expect(s).toMatchObject({ upcoming: 3, done: 1, cancelled: 1 });
    expect(s.next?.id).toBe("f");
  });

  it("has no next session when nothing is ahead", () => {
    expect(sessionsSummary([], NOW).next).toBeNull();
  });
});

describe("paymentsSummary", () => {
  const booking = (p: Partial<Extract<PatientReceipt, { kind: "booking" }>>): PatientReceipt => ({
    kind: "booking",
    id: p.id ?? "b",
    appointmentId: "a",
    packagePurchaseId: null,
    stage: "payment_confirmed",
    isPackageCovered: false,
    title: "Orthopaedic care",
    slotTime: null,
    slotTimezone: null,
    amountPaise: 199900,
    listPricePaise: null,
    discountPaise: 0,
    discountLabel: null,
    transactionId: null,
    date: "2026-11-10T10:00:00Z",
    refund: null,
    ...p,
  }) as PatientReceipt;

  it("counts payments, refunds and failures, and names the latest payment", () => {
    const s = paymentsSummary([
      booking({ id: "1" }),
      booking({ id: "2", date: "2026-11-17T10:00:00Z", amountPaise: 249900, title: "Home visit" }),
      booking({ id: "3", isPackageCovered: true, date: "2026-11-20T10:00:00Z" }),
      booking({ id: "4", refund: { state: "processed" } as never }),
      {
        kind: "payment_failed",
        id: "f",
        appointmentId: null,
        packagePurchaseId: null,
        title: "Home visit",
        amountPaise: 249900,
        errorCode: null,
        errorReason: null,
        errorDescription: null,
        date: "2026-11-21T10:00:00Z",
        transactionId: null,
        orderId: null,
      },
    ]);
    expect(s).toMatchObject({ payments: 3, refunds: 1, failed: 1 });
    expect(s.latest).toEqual({ title: "Home visit", date: "2026-11-17T10:00:00Z", amountPaise: 249900 });
  });

  it("has no latest payment with nothing paid", () => {
    expect(paymentsSummary([]).latest).toBeNull();
  });
});

describe("recommendationsWaiting", () => {
  it("counts an offer once plus each proposed time", () => {
    expect(recommendationsWaiting(true, 2)).toBe(3);
    expect(recommendationsWaiting(false, 0)).toBe(0);
  });
});

describe("trendSentence", () => {
  it("reads pain going down as better", () => {
    expect(trendSentence([8, 7, 5, 4], "down", "/ 10")).toEqual({ text: "down from 8 to 4 / 10", verdict: "better" });
  });
  it("reads independence going up as better", () => {
    expect(trendSentence([3, 6], "up")).toEqual({ text: "up from 3 to 6", verdict: "better" });
  });
  it("says nothing about one reading", () => {
    expect(trendSentence([5], "down")).toBeNull();
  });
  it("says steady when nothing moved", () => {
    expect(trendSentence([4, 4], "down")?.verdict).toBe("same");
  });
});

describe("availabilitySummary", () => {
  it("adds up the weekly template and finds the next date that differs", () => {
    const s = availabilitySummary(
      [
        { day_of_week: 1, hour: 9 },
        { day_of_week: 1, hour: 10 },
        { day_of_week: 3, hour: 9 },
      ],
      [
        { date: "2026-12-04", available: true },
        { date: "2026-11-28", available: false },
      ]
    );
    expect(s).toEqual({ hoursPerWeek: 3, workingDays: 2, nextException: { date: "2026-11-28", available: false } });
  });
});


describe("progressHeadline", () => {
  it("waits for the first session before saying anything", () => {
    expect(progressHeadline({ verdict: "better" }, { awaitingTherapist: true, parent: false })).toMatch(/first session/);
  });
  it("speaks in the parent's voice for a child's record", () => {
    expect(progressHeadline({ verdict: "better" }, { awaitingTherapist: false, parent: true })).toBe("Yes, your child is improving");
  });
  it("never alarms on a reading that went the wrong way", () => {
    expect(progressHeadline({ verdict: "worse" }, { awaitingTherapist: false, parent: false })).toBe("Worth raising at your next session");
  });
  it("asks for two readings before it reads a trend", () => {
    expect(progressHeadline(null, { awaitingTherapist: false, parent: false })).toMatch(/two readings/);
  });
});
