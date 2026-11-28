import { describe, expect, it } from "vitest";
import { awaitsPatientPayment, missedNeedsFollowUp, needsTherapist } from "./sessionAssignQueue";

const NOW = Date.parse("2026-11-26T10:00:00Z");
const past = new Date(NOW - 3_600_000).toISOString();
const ahead = new Date(NOW + 3_600_000).toISOString();
const paid = { therapist_id: null, status: "requested", payment_status: "paid", payment_terms: "prepaid" };

describe("a session whose time has passed with nobody on it", () => {
  it("is no longer 'needs a therapist' -- it is a missed follow-up", () => {
    expect(needsTherapist({ ...paid, slot_time: ahead }, false, NOW)).toBe(true);
    expect(needsTherapist({ ...paid, slot_time: past }, false, NOW)).toBe(false);
    expect(missedNeedsFollowUp({ ...paid, slot_time: past }, false, NOW)).toBe(true);
  });
  it("an abandoned unpaid checkout is neither waiting on payment nor a follow-up once past", () => {
    const draft = { ...paid, payment_status: "unpaid", slot_time: past };
    expect(awaitsPatientPayment(draft, false, NOW)).toBe(false);
    expect(missedNeedsFollowUp(draft, false, NOW)).toBe(false);
  });
  it("a home visit or pay-later booking is followed up", () => {
    expect(missedNeedsFollowUp({ ...paid, payment_status: "unpaid", slot_time: past }, true, NOW)).toBe(true);
    expect(missedNeedsFollowUp({ ...paid, payment_status: "unpaid", payment_terms: "pay_later", slot_time: past }, false, NOW)).toBe(true);
  });
  it("a row with no time is never called past", () => {
    expect(needsTherapist({ ...paid }, false, NOW)).toBe(true);
  });
});
