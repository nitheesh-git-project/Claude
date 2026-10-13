import { describe, it, expect } from "vitest";
import {
  awaitsPatientPayment,
  needsTherapist,
  programmePickWarning,
  programmeTherapistFor,
  type AssignQueueRow,
} from "./sessionAssignQueue";

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

describe("programmeTherapistFor", () => {
  const locks = {
    packagePurchases: new Map<string, string | null>([
      ["pp-locked", "t-1"],
      ["pp-open", null],
    ]),
    homeVisitPurchases: new Map<string, string | null>([["hv-locked", "t-2"]]),
  };

  it("pre-picks the programme's therapist for an unassigned programme session", () => {
    expect(
      programmeTherapistFor({ therapist_id: null, status: "requested", package_purchase_id: "pp-locked" }, locks)
    ).toBe("t-1");
    expect(
      programmeTherapistFor({ therapist_id: null, status: "requested", home_visit_purchase_id: "hv-locked" }, locks)
    ).toBe("t-2");
  });

  it("has no pre-pick for a programme nobody has been locked to yet", () => {
    expect(
      programmeTherapistFor({ therapist_id: null, status: "requested", package_purchase_id: "pp-open" }, locks)
    ).toBeNull();
  });

  it("has none for a single consultation, an assigned session or a closed one", () => {
    expect(programmeTherapistFor({ therapist_id: null, status: "requested" }, locks)).toBeNull();
    expect(
      programmeTherapistFor({ therapist_id: "t-9", status: "requested", package_purchase_id: "pp-locked" }, locks)
    ).toBeNull();
    expect(
      programmeTherapistFor({ therapist_id: null, status: "cancelled", package_purchase_id: "pp-locked" }, locks)
    ).toBeNull();
  });

  it("follows the purchase, so a reassigned programme moves the pre-pick", () => {
    const moved = { ...locks, packagePurchases: new Map([["pp-locked", "t-3"]]) };
    expect(
      programmeTherapistFor({ therapist_id: null, status: "requested", package_purchase_id: "pp-locked" }, moved)
    ).toBe("t-3");
  });
});

describe("programmePickWarning", () => {
  it("is null while the pre-picked therapist is free", () => {
    expect(programmePickWarning({ therapistId: "t", therapistName: "Dr Ananya", blocks: [] })).toBeNull();
  });
  it("names them when they no longer are", () => {
    expect(
      programmePickWarning({ therapistId: "t", therapistName: "Dr Ananya", blocks: ["On leave."] })
    ).toBe("Dr Ananya is no longer free at this time - pick someone else or move it.");
  });
});
