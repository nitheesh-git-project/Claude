import { describe, expect, it } from "vitest";
import {
  joinHeldForPayment,
  missedWithoutTherapist,
  needsPaymentOnHome,
  normaliseRescueHours,
  patientPaymentView,
  unassignedRescueState,
  type SessionActionRow,
} from "./sessionPatientActions";

const NOW = Date.parse("2026-11-26T10:00:00Z");
const H = 3_600_000;
const at = (ms: number) => new Date(ms).toISOString();

function row(over: Partial<SessionActionRow> = {}): SessionActionRow {
  return {
    status: "requested",
    no_show: false,
    therapist_id: null,
    slot_time: at(NOW + 48 * H),
    payment_status: "paid",
    payment_terms: "prepaid",
    package_purchase_id: null,
    home_visit_purchase_id: null,
    visit_mode: "online",
    ...over,
  };
}

describe("unassignedRescueState", () => {
  it("is none at exactly four hours to go and at_risk from 3 h 59 min", () => {
    expect(unassignedRescueState(row({ slot_time: at(NOW + 4 * H) }), NOW)).toBe("none");
    expect(unassignedRescueState(row({ slot_time: at(NOW + 4 * H - 60_000) }), NOW)).toBe("at_risk");
  });
  it("is lapsed once the time has come", () => {
    expect(unassignedRescueState(row({ slot_time: at(NOW) }), NOW)).toBe("lapsed");
    expect(unassignedRescueState(row({ slot_time: at(NOW - H) }), NOW)).toBe("lapsed");
  });
  it("never applies with a therapist, or to a session that is not live", () => {
    expect(unassignedRescueState(row({ slot_time: at(NOW + H), therapist_id: "t" }), NOW)).toBe("none");
    expect(unassignedRescueState(row({ slot_time: at(NOW - H), status: "cancelled" }), NOW)).toBe("none");
    expect(unassignedRescueState(row({ slot_time: at(NOW - H), status: "completed" }), NOW)).toBe("none");
    expect(unassignedRescueState(row({ slot_time: at(NOW - H), no_show: true }), NOW)).toBe("none");
    expect(unassignedRescueState(row({ slot_time: null }), NOW)).toBe("none");
  });
  it("honours the clinic's window and falls back on a bad one", () => {
    expect(unassignedRescueState(row({ slot_time: at(NOW + 5 * H) }), NOW, 6)).toBe("at_risk");
    expect(normaliseRescueHours(0)).toBe(4);
    expect(normaliseRescueHours("8")).toBe(4);
    expect(normaliseRescueHours(8)).toBe(8);
  });
});

describe("patientPaymentView", () => {
  const unpaid = { payment_status: "unpaid" } as const;
  it("offers Pay only for a live session ahead", () => {
    expect(patientPaymentView(row({ ...unpaid }), NOW).kind).toBe("pay");
    expect(patientPaymentView(row({ ...unpaid, therapist_id: "t", status: "confirmed" }), NOW).kind).toBe("pay");
  });
  it("never offers Pay once the time has passed (Past)", () => {
    const v = patientPaymentView(row({ ...unpaid, therapist_id: "t", slot_time: at(NOW - H) }), NOW);
    expect(v.kind).toBe("no_action");
  });
  it("offers Pay on a delivered online session that is still unpaid", () => {
    const done = patientPaymentView(row({ ...unpaid, status: "completed", therapist_id: "t", slot_time: at(NOW - 2 * H) }), NOW);
    expect(done.kind).toBe("pay");
  });
  it("still offers no Pay on a completed no-show, a cash home visit or a programme session", () => {
    const base = { ...unpaid, status: "completed", therapist_id: "t", slot_time: at(NOW - 2 * H) };
    expect(patientPaymentView(row({ ...base, no_show: true }), NOW)).toMatchObject({ kind: "no_action", label: "Payment due" });
    expect(patientPaymentView(row({ ...base, visit_mode: "home_visit" }), NOW)).toMatchObject({ kind: "no_action", label: "Payment due" });
    expect(patientPaymentView(row({ ...base, package_purchase_id: "p" }), NOW)).toMatchObject({ kind: "no_action", label: "Payment due" });
  });
  it("never offers Pay on a cancelled session, nor once a completed one is paid", () => {
    expect(patientPaymentView(row({ ...unpaid, status: "cancelled" }), NOW)).toMatchObject({ label: "Not charged" });
    expect(
      patientPaymentView(row({ ...unpaid, payment_status: "paid", status: "completed", therapist_id: "t", slot_time: at(NOW - 2 * H) }), NOW).kind
    ).toBe("paid");
  });
  it("keeps a delivered session off Home's \"keep your time\" card", () => {
    const done = row({ ...unpaid, status: "completed", therapist_id: "t", slot_time: at(NOW - 2 * H) });
    expect(patientPaymentView(done, NOW).kind).toBe("pay");
    expect(needsPaymentOnHome(done, NOW)).toBe(false);
  });
  it("takes no payment while nobody can be confirmed in time", () => {
    expect(patientPaymentView(row({ ...unpaid, slot_time: at(NOW + H) }), NOW)).toMatchObject({ label: "No payment taken" });
  });
  it("pay later and programme sessions are not Pay buttons", () => {
    expect(patientPaymentView(row({ ...unpaid, payment_terms: "pay_later" }), NOW).kind).toBe("terms");
    expect(patientPaymentView(row({ ...unpaid, visit_mode: "home_visit", home_visit_purchase_id: "p" }), NOW)).toMatchObject({
      label: "Pay at the visit",
    });
    expect(patientPaymentView(row(), NOW).kind).toBe("paid");
  });
  it("Home's card follows the same rule", () => {
    expect(needsPaymentOnHome(row({ ...unpaid }), NOW)).toBe(true);
    expect(needsPaymentOnHome(row({ ...unpaid, slot_time: at(NOW - H) }), NOW)).toBe(false);
  });
});

describe("joinHeldForPayment", () => {
  it("holds an unpaid prepaid online session, admin-booked or not", () => {
    expect(joinHeldForPayment(row({ payment_status: "unpaid", status: "confirmed", therapist_id: "t" }))).toBe(true);
  });
  it("does not hold paid, pay-later or programme sessions", () => {
    expect(joinHeldForPayment(row())).toBe(false);
    expect(joinHeldForPayment(row({ payment_status: "unpaid", payment_terms: "pay_later" }))).toBe(false);
    expect(joinHeldForPayment(row({ payment_status: "unpaid", package_purchase_id: "p" }))).toBe(false);
  });
});

describe("missedWithoutTherapist", () => {
  it("is a passed, live, unassigned session", () => {
    expect(missedWithoutTherapist(row({ slot_time: at(NOW - H) }), NOW)).toBe(true);
    expect(missedWithoutTherapist(row({ slot_time: at(NOW + H) }), NOW)).toBe(false);
    expect(missedWithoutTherapist(row({ slot_time: at(NOW - H), therapist_id: "t" }), NOW)).toBe(false);
  });
});
