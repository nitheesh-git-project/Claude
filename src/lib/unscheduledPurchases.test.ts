import { describe, it, expect } from "vitest";
import {
  isAwaitingFirstBooking,
  countAwaitingFirstBooking,
  PURCHASE_UNSCHEDULED_AFTER_HOURS,
  type SchedulablePurchase,
} from "./unscheduledPurchases";

const NOW = Date.parse("2026-03-10T12:00:00Z");
const HOUR = 3_600_000;

function purchase(overrides: Partial<SchedulablePurchase> = {}): SchedulablePurchase {
  return {
    status: "active",
    paymentStatus: "paid",
    paymentMode: null,
    completedCount: 0,
    scheduledCount: 0,
    createdAt: new Date(NOW - 48 * HOUR).toISOString(),
    ...overrides,
  };
}

describe("isAwaitingFirstBooking", () => {
  it("finds a paid programme two days old with nothing booked", () => {
    expect(isAwaitingFirstBooking(purchase(), NOW)).toBe(true);
  });

  // A cash home-visit purchase sits at `unpaid` for its whole life by
  // design, so judging by payment status alone would drop every one of them
  // silently -- which is the audit item this half exists for.
  it("counts a cash home visit agreed at the door", () => {
    expect(
      isAwaitingFirstBooking(purchase({ paymentStatus: "unpaid", paymentMode: "cash_on_visit" }), NOW)
    ).toBe(true);
  });

  // An abandoned checkout is unpaid with no mode. It is not a purchase, and
  // putting it on a call list would have the clinic ringing people who never
  // bought anything.
  it("ignores an abandoned checkout", () => {
    expect(isAwaitingFirstBooking(purchase({ paymentStatus: "unpaid" }), NOW)).toBe(false);
  });

  // The finding is a run that never started, not one with sessions left --
  // almost every active purchase has sessions left, by definition.
  it("ignores a purchase that has had anything booked at all", () => {
    expect(isAwaitingFirstBooking(purchase({ scheduledCount: 1 }), NOW)).toBe(false);
    expect(isAwaitingFirstBooking(purchase({ completedCount: 1 }), NOW)).toBe(false);
  });

  // A refund, a cancellation or an expiry is a decision somebody made.
  it("ignores a purchase that is no longer active", () => {
    for (const status of ["refunded", "cancelled", "expired", "completed"]) {
      expect(isAwaitingFirstBooking(purchase({ status }), NOW)).toBe(false);
    }
  });

  // A purchase on its way to the scheduler must not be reported as a fault
  // seconds after it is made, or the row is permanently on.
  it("waits out the grace window, and fires exactly at it", () => {
    const justBought = purchase({ createdAt: new Date(NOW - HOUR).toISOString() });
    expect(isAwaitingFirstBooking(justBought, NOW)).toBe(false);

    const exactly = purchase({
      createdAt: new Date(NOW - PURCHASE_UNSCHEDULED_AFTER_HOURS * HOUR).toISOString(),
    });
    expect(isAwaitingFirstBooking(exactly, NOW)).toBe(true);
  });

  // A clinic that wants to be told sooner can be, and zero means "the
  // moment it is bought" rather than "never".
  it("honours a window the caller chooses", () => {
    const twoHours = purchase({ createdAt: new Date(NOW - 2 * HOUR).toISOString() });
    expect(isAwaitingFirstBooking(twoHours, NOW, 1)).toBe(true);
    expect(isAwaitingFirstBooking(twoHours, NOW, 6)).toBe(false);
    expect(isAwaitingFirstBooking(purchase({ createdAt: new Date(NOW).toISOString() }), NOW, 0)).toBe(
      true
    );
  });

  // A row this cannot date is a row it cannot judge. Inventing an age would
  // put somebody on a call list because of an unreadable timestamp.
  it("does not treat an unreadable date as old", () => {
    expect(isAwaitingFirstBooking(purchase({ createdAt: "not a date" }), NOW)).toBe(false);
  });
});

describe("countAwaitingFirstBooking", () => {
  it("counts only the rows that qualify", () => {
    expect(
      countAwaitingFirstBooking(
        [purchase(), purchase({ scheduledCount: 2 }), purchase({ status: "refunded" }), purchase()],
        NOW
      )
    ).toBe(2);
  });

  it("is zero on an empty list rather than anything else", () => {
    expect(countAwaitingFirstBooking([], NOW)).toBe(0);
  });
});
