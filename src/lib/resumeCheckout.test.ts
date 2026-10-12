import { describe, it, expect } from "vitest";
import {
  canResumeInWizard,
  decideResume,
  resumeCheckoutHref,
  wizardSlotParts,
  type ResumableRow,
} from "./resumeCheckout";

const NOW = Date.parse("2026-10-12T06:00:00Z");
const HOUR = 3_600_000;
const LEAD = 12 * HOUR;

const draft: ResumableRow = {
  status: "requested",
  payment_status: "unpaid",
  payment_terms: "prepaid",
  visit_mode: "online",
  therapist_id: null,
  package_purchase_id: null,
  home_visit_purchase_id: null,
  referral_id: null,
  pay_later_outcome: null,
  slot_time: new Date(NOW + 48 * HOUR).toISOString(),
};

const decide = (row: ResumableRow, replaceable = true) =>
  decideResume(row, { nowMs: NOW, leadTimeMs: LEAD, replaceable });

describe("decideResume", () => {
  it("opens Step 3 for an unpaid online booking still far enough ahead", () => {
    expect(decide(draft)).toEqual({ state: "ready" });
  });

  it("says a paid booking needs nothing", () => {
    expect(decide({ ...draft, payment_status: "paid" })).toEqual({ state: "paid" });
  });

  it("refuses a cancelled booking in words", () => {
    const d = decide({ ...draft, status: "cancelled" });
    expect(d.state).toBe("not_resumable");
  });

  it("sends a draft whose time is inside the lead time to pick a new one", () => {
    expect(decide({ ...draft, slot_time: new Date(NOW + 2 * HOUR).toISOString() })).toEqual({
      state: "pick_new_time",
    });
    expect(decide({ ...draft, slot_time: new Date(NOW - HOUR).toISOString() })).toEqual({
      state: "pick_new_time",
    });
  });

  it("does not offer a new time for a booking create cannot replace", () => {
    const late = { ...draft, therapist_id: "t1", slot_time: new Date(NOW + HOUR).toISOString() };
    expect(decide(late, false).state).toBe("not_resumable");
  });

  it("still lets an assigned but unpaid booking be paid while its time stands", () => {
    expect(decide({ ...draft, therapist_id: "t1" }, false)).toEqual({ state: "ready" });
  });

  it("leaves home visits, programmes and sessions on terms to their own paths", () => {
    expect(decide({ ...draft, visit_mode: "home_visit" }).state).toBe("not_resumable");
    expect(decide({ ...draft, package_purchase_id: "p1" }).state).toBe("not_resumable");
    expect(decide({ ...draft, payment_terms: "pay_later" }).state).toBe("not_resumable");
    expect(decide({ ...draft, pay_later_outcome: "written_off" }).state).toBe("not_resumable");
  });
});

describe("canResumeInWizard", () => {
  it("is an online prepaid session not drawn from a purchase", () => {
    expect(canResumeInWizard(draft)).toBe(true);
    expect(canResumeInWizard({ ...draft, visit_mode: null, payment_terms: null })).toBe(true);
    expect(canResumeInWizard({ ...draft, home_visit_purchase_id: "h1" })).toBe(false);
  });
});

describe("wizardSlotParts", () => {
  it("round-trips through the wizard's own date-and-hour composition", () => {
    const iso = new Date(2026, 9, 20, 18, 0, 0).toISOString();
    const parts = wizardSlotParts(iso)!;
    const composed = `${parts.dateKey}T${String(parts.hour).padStart(2, "0")}:00`;
    expect(new Date(composed).toISOString()).toBe(iso);
  });
  it("answers null for a bad timestamp", () => {
    expect(wizardSlotParts("nope")).toBeNull();
  });
});

describe("resumeCheckoutHref", () => {
  it("points at /book with the booking named", () => {
    expect(resumeCheckoutHref("abc")).toBe("/book?resume=abc");
  });
});
