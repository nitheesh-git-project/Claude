import { describe, it, expect } from "vitest";
import { awaitsPatientPayment, needsTherapist, type AssignQueueRow } from "./sessionAssignQueue";

const draft: AssignQueueRow = {
  therapist_id: null,
  status: "requested",
  payment_status: "unpaid",
  payment_terms: "prepaid",
  package_purchase_id: null,
};

describe("the assign queue", () => {
  it("keeps an unpaid online checkout out of it", () => {
    expect(awaitsPatientPayment(draft, false)).toBe(true);
    expect(needsTherapist(draft, false)).toBe(false);
  });

  it("holds a paid session the auto-assigner could not place", () => {
    const paid = { ...draft, payment_status: "paid" };
    expect(needsTherapist(paid, false)).toBe(true);
    expect(awaitsPatientPayment(paid, false)).toBe(false);
  });

  it("holds a session on terms, which is booked though unpaid", () => {
    const terms = { ...draft, payment_terms: "pay_later" };
    expect(needsTherapist(terms, false)).toBe(true);
  });

  it("holds a session drawn from a purchase", () => {
    expect(needsTherapist({ ...draft, package_purchase_id: "p1" }, false)).toBe(true);
  });

  it("holds an unpaid home visit, which may be cash at the door", () => {
    expect(needsTherapist(draft, true)).toBe(true);
    expect(awaitsPatientPayment(draft, true)).toBe(false);
  });

  it("counts neither an assigned nor a cancelled session", () => {
    expect(needsTherapist({ ...draft, therapist_id: "t1" }, false)).toBe(false);
    expect(awaitsPatientPayment({ ...draft, therapist_id: "t1" }, false)).toBe(false);
    expect(needsTherapist({ ...draft, status: "cancelled" }, false)).toBe(false);
    expect(awaitsPatientPayment({ ...draft, status: "cancelled" }, false)).toBe(false);
  });

  it("treats a missing payment_terms as prepaid", () => {
    expect(awaitsPatientPayment({ ...draft, payment_terms: null }, false)).toBe(true);
  });
});
