import { describe, it, expect } from "vitest";
import {
  PAY_LATER_AGED_AFTER_DAYS,
  MIN_PAY_LATER_AGED_AFTER_DAYS,
  MAX_PAY_LATER_AGED_AFTER_DAYS,
  resolveAgedAfterDays,
  isOpenPayLaterSession,
  computePatientBalance,
  computeClinicReceivable,
  oldestOwedAgeDays,
  unclosedPayLaterSessions,
  type PayLaterAppointment,
  type PayLaterPaymentRow,
} from "./patientBalances";

const DAY = 86_400_000;
const NOW = Date.parse("2026-03-01T10:00:00.000Z");

function session(over: Partial<PayLaterAppointment> = {}): PayLaterAppointment {
  return {
    id: "a1",
    patient_id: "p1",
    status: "completed",
    slot_time: new Date(NOW - 10 * DAY).toISOString(),
    payment_status: "unpaid",
    payment_terms: "pay_later",
    amount_due_paise: 120000,
    pay_later_outcome: null,
    ...over,
  };
}

function payment(over: Partial<PayLaterPaymentRow> = {}): PayLaterPaymentRow {
  return { id: "pay1", patient_id: "p1", status: "confirmed", unallocated_paise: 0, ...over };
}

describe("isOpenPayLaterSession", () => {
  it("counts a delivered, unsettled pay-later session", () => {
    expect(isOpenPayLaterSession(session())).toBe(true);
  });

  // The rule the whole design rests on: nothing is owed until the work is done.
  it("does not count a booked session that has not happened", () => {
    expect(isOpenPayLaterSession(session({ status: "confirmed" }))).toBe(false);
    expect(isOpenPayLaterSession(session({ status: "requested" }))).toBe(false);
  });

  // Which is also why a late cancellation needs no special case anywhere.
  it("does not count a cancelled session", () => {
    expect(isOpenPayLaterSession(session({ status: "cancelled" }))).toBe(false);
  });

  it("does not count a settled one", () => {
    expect(isOpenPayLaterSession(session({ payment_status: "paid" }))).toBe(false);
  });

  it("does not count a written-off one -- that is a cost, not a debt", () => {
    expect(isOpenPayLaterSession(session({ pay_later_outcome: "written_off" }))).toBe(false);
  });

  // An abandoned checkout is also payment_status 'unpaid'. Telling the two
  // apart is the entire reason payment_terms exists.
  it("does not count an abandoned prepaid checkout", () => {
    expect(
      isOpenPayLaterSession(session({ payment_terms: "prepaid", status: "confirmed" }))
    ).toBe(false);
    expect(isOpenPayLaterSession(session({ payment_terms: "prepaid" }))).toBe(false);
  });

  // A database that has not run the migration reads every figure as zero,
  // which is exactly right rather than merely safe.
  it("does not count a row from before the migration", () => {
    expect(isOpenPayLaterSession(session({ payment_terms: undefined }))).toBe(false);
    expect(isOpenPayLaterSession(session({ payment_terms: null }))).toBe(false);
  });
});

describe("computePatientBalance", () => {
  it("sums the delivered sessions", () => {
    const rows = [session({ id: "a1" }), session({ id: "a2" }), session({ id: "a3" })];
    const b = computePatientBalance("p1", rows);
    expect(b.owedPaise).toBe(360000);
    expect(b.owedCount).toBe(3);
  });

  it("ignores another patient's sessions", () => {
    const rows = [session({ id: "a1" }), session({ id: "a2", patient_id: "p2" })];
    expect(computePatientBalance("p1", rows).owedPaise).toBe(120000);
  });

  // Asking twice for money already in the till is the failure this prevents.
  it("nets off money already received and not yet applied", () => {
    const rows = [session({ id: "a1" }), session({ id: "a2" })];
    const b = computePatientBalance("p1", rows, [payment({ unallocated_paise: 50000 })]);
    expect(b.owedPaise).toBe(190000);
    expect(b.unallocatedPaise).toBe(50000);
  });

  // The confirmation gate, at the level of the figure: a declaration that
  // nobody has checked must not move what anybody is asked to pay.
  it("ignores a payment that has not been confirmed", () => {
    const rows = [session()];
    const pending = payment({ status: "pending", unallocated_paise: 120000 });
    expect(computePatientBalance("p1", rows, [pending]).owedPaise).toBe(120000);
  });

  it("ignores a rejected payment", () => {
    const rows = [session()];
    const rejected = payment({ status: "rejected", unallocated_paise: 120000 });
    expect(computePatientBalance("p1", rows, [rejected]).owedPaise).toBe(120000);
  });

  it("never goes negative when more was received than is owed", () => {
    const b = computePatientBalance("p1", [session()], [payment({ unallocated_paise: 500000 })]);
    expect(b.owedPaise).toBe(0);
  });

  // A figure invented here is a figure somebody is asked to collect.
  it("contributes nothing for a session with no frozen amount", () => {
    const b = computePatientBalance("p1", [session({ amount_due_paise: null })]);
    expect(b.owedPaise).toBe(0);
    expect(b.owedCount).toBe(1);
  });

  it("reads zero for a patient who owes nothing", () => {
    expect(computePatientBalance("p1", []).owedPaise).toBe(0);
  });
});

describe("computeClinicReceivable", () => {
  it("totals every patient and sorts largest first", () => {
    const rows = [
      session({ id: "a1", patient_id: "p1" }),
      session({ id: "a2", patient_id: "p2" }),
      session({ id: "a3", patient_id: "p2" }),
    ];
    const r = computeClinicReceivable(rows);
    expect(r.totalPaise).toBe(360000);
    expect(r.balances.map((b) => b.patientId)).toEqual(["p2", "p1"]);
  });

  it("drops a patient whose payments cover everything", () => {
    const rows = [session({ id: "a1", patient_id: "p1" })];
    const r = computeClinicReceivable(rows, [payment({ unallocated_paise: 120000 })]);
    expect(r.totalPaise).toBe(0);
    expect(r.balances).toEqual([]);
  });

  // The shadow run, as a test: with nobody on terms every figure is zero.
  it("reads zero over a clinic with no pay-later patients at all", () => {
    const rows = [
      session({ payment_terms: "prepaid", payment_status: "paid" }),
      session({ id: "a2", payment_terms: "prepaid", status: "confirmed" }),
    ];
    const r = computeClinicReceivable(rows);
    expect(r.totalPaise).toBe(0);
    expect(r.balances).toEqual([]);
  });

  it("the total always equals the sum of its rows", () => {
    const rows = [
      session({ id: "a1", patient_id: "p1" }),
      session({ id: "a2", patient_id: "p2", amount_due_paise: 90000 }),
      session({ id: "a3", patient_id: "p3", status: "confirmed" }),
    ];
    const r = computeClinicReceivable(rows);
    expect(r.balances.reduce((s, b) => s + b.owedPaise, 0)).toBe(r.totalPaise);
  });
});

describe("oldestOwedAgeDays", () => {
  it("measures from the session's own slot time", () => {
    const rows = [session({ slot_time: new Date(NOW - 40 * DAY).toISOString() })];
    expect(oldestOwedAgeDays(rows, NOW)).toBe(40);
  });

  it("takes the oldest, since a queue's age is what has waited longest", () => {
    const rows = [
      session({ id: "a1", slot_time: new Date(NOW - 3 * DAY).toISOString() }),
      session({ id: "a2", slot_time: new Date(NOW - 90 * DAY).toISOString() }),
    ];
    expect(oldestOwedAgeDays(rows, NOW)).toBe(90);
  });

  it("ignores sessions that are settled or not yet delivered", () => {
    const rows = [
      session({ id: "a1", slot_time: new Date(NOW - 90 * DAY).toISOString(), payment_status: "paid" }),
      session({ id: "a2", slot_time: new Date(NOW - 5 * DAY).toISOString() }),
    ];
    expect(oldestOwedAgeDays(rows, NOW)).toBe(5);
  });

  it("is null when nothing is owed", () => {
    expect(oldestOwedAgeDays([], NOW)).toBeNull();
  });

  it("never reports a negative age", () => {
    const rows = [session({ slot_time: new Date(NOW + 5 * DAY).toISOString() })];
    expect(oldestOwedAgeDays(rows, NOW)).toBe(0);
  });

  it("skips an unreadable date rather than throwing", () => {
    const rows = [session({ id: "a1", slot_time: "not a date" }), session({ id: "a2" })];
    expect(oldestOwedAgeDays(rows, NOW)).toBe(10);
  });
});

describe("unclosedPayLaterSessions", () => {
  // The one leak: no completion means no debt, no revenue and no therapist pay.
  it("finds a session whose time has passed and was never closed", () => {
    const rows = [session({ status: "confirmed", slot_time: new Date(NOW - 2 * DAY).toISOString() })];
    expect(unclosedPayLaterSessions(rows, NOW)).toHaveLength(1);
  });

  it("leaves a session that is still in the future alone", () => {
    const rows = [session({ status: "confirmed", slot_time: new Date(NOW + 2 * DAY).toISOString() })];
    expect(unclosedPayLaterSessions(rows, NOW)).toEqual([]);
  });

  // A session that never found a therapist sits at 'requested' and can never
  // be completed, so it is the same leak by another route.
  it("finds one that never reached a therapist", () => {
    const rows = [session({ status: "requested", slot_time: new Date(NOW - DAY).toISOString() })];
    expect(unclosedPayLaterSessions(rows, NOW)).toHaveLength(1);
  });

  it("ignores completed and cancelled sessions", () => {
    const rows = [
      session({ id: "a1", status: "completed" }),
      session({ id: "a2", status: "cancelled" }),
    ];
    expect(unclosedPayLaterSessions(rows, NOW)).toEqual([]);
  });

  it("ignores prepaid sessions entirely", () => {
    const rows = [session({ status: "confirmed", payment_terms: "prepaid" })];
    expect(unclosedPayLaterSessions(rows, NOW)).toEqual([]);
  });
});

// The threshold itself. It is an admin setting with this constant as the
// default, and these are the bounds the column's CHECK, the route and the
// reader all share -- so the three cannot drift apart silently.
describe("the ageing threshold", () => {
  it("keeps a generous default, since these patients settle monthly", () => {
    expect(PAY_LATER_AGED_AFTER_DAYS).toBe(60);
  });

  // Not merely "small": a threshold of 0 reads as "chase everything" to one
  // person and "never warn me" to another, and a warning whose meaning
  // depends on who set it is worse than not having one.
  it("has no zero, and a ceiling that keeps a mistyped 3650 out", () => {
    expect(MIN_PAY_LATER_AGED_AFTER_DAYS).toBe(1);
    expect(MAX_PAY_LATER_AGED_AFTER_DAYS).toBe(365);
  });

  it("holds the default inside its own bounds", () => {
    expect(PAY_LATER_AGED_AFTER_DAYS).toBeGreaterThanOrEqual(MIN_PAY_LATER_AGED_AFTER_DAYS);
    expect(PAY_LATER_AGED_AFTER_DAYS).toBeLessThanOrEqual(MAX_PAY_LATER_AGED_AFTER_DAYS);
  });

  // The boundary the screen colours on, asserted both ways so a change from
  // >= to > is a failing test rather than a quietly different screen.
  it("counts a balance exactly at the threshold as aged", () => {
    const rows = [session({ slot_time: new Date(NOW - 60 * DAY).toISOString() })];
    expect(oldestOwedAgeDays(rows, NOW)).toBe(60);
    expect(oldestOwedAgeDays(rows, NOW)! >= 60).toBe(true);
  });

  it("does not count one a day under it", () => {
    const rows = [session({ slot_time: new Date(NOW - 59 * DAY).toISOString() })];
    expect(oldestOwedAgeDays(rows, NOW)! >= 60).toBe(false);
  });

  // A clinic settling weekly sets this low, and the same rows then read
  // differently -- which is the whole reason it is a setting.
  it("moves with the threshold rather than with the sessions", () => {
    const rows = [session({ slot_time: new Date(NOW - 10 * DAY).toISOString() })];
    const age = oldestOwedAgeDays(rows, NOW)!;
    expect(age >= 7).toBe(true);
    expect(age >= 60).toBe(false);
  });
});

describe("resolveAgedAfterDays", () => {
  it("takes the clinic's own answer when it is usable", () => {
    expect(resolveAgedAfterDays(7)).toBe(7);
    expect(resolveAgedAfterDays(1)).toBe(1);
    expect(resolveAgedAfterDays(365)).toBe(365);
  });

  // A database without the migration, and the commonest case by far.
  it("falls back to the default for an unset column", () => {
    expect(resolveAgedAfterDays(null)).toBe(PAY_LATER_AGED_AFTER_DAYS);
    expect(resolveAgedAfterDays(undefined)).toBe(PAY_LATER_AGED_AFTER_DAYS);
  });

  // Typed by hand in the SQL editor, where neither the CHECK nor the route
  // ran. Zero is the one that matters: it would paint every balance amber on
  // the one screen whose job is to make one stand out.
  it("falls back rather than clamping an out-of-range value", () => {
    expect(resolveAgedAfterDays(0)).toBe(PAY_LATER_AGED_AFTER_DAYS);
    expect(resolveAgedAfterDays(-5)).toBe(PAY_LATER_AGED_AFTER_DAYS);
    expect(resolveAgedAfterDays(3650)).toBe(PAY_LATER_AGED_AFTER_DAYS);
  });

  it("falls back for anything that is not a whole number", () => {
    expect(resolveAgedAfterDays(30.5)).toBe(PAY_LATER_AGED_AFTER_DAYS);
    expect(resolveAgedAfterDays("30")).toBe(PAY_LATER_AGED_AFTER_DAYS);
    expect(resolveAgedAfterDays(NaN)).toBe(PAY_LATER_AGED_AFTER_DAYS);
    expect(resolveAgedAfterDays(true)).toBe(PAY_LATER_AGED_AFTER_DAYS);
  });
});
