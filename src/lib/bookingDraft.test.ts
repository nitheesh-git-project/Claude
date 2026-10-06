import { describe, expect, it } from "vitest";
import { isReplaceableDraft, overlapsSlot, type DraftCandidate } from "./bookingDraft";

const draft: DraftCandidate = {
  status: "requested",
  payment_status: "unpaid",
  therapist_id: null,
  visit_mode: "online",
  payment_terms: "prepaid",
  package_purchase_id: null,
  home_visit_purchase_id: null,
  referral_id: null,
  pay_later_outcome: null,
};

describe("isReplaceableDraft", () => {
  it("accepts the wizard's own unpaid draft", () => {
    expect(isReplaceableDraft(draft)).toBe(true);
    expect(isReplaceableDraft({ ...draft, visit_mode: null, payment_terms: null })).toBe(true);
  });

  it("refuses anything somebody is relying on", () => {
    expect(isReplaceableDraft({ ...draft, status: "confirmed" })).toBe(false);
    expect(isReplaceableDraft({ ...draft, payment_status: "paid" })).toBe(false);
    expect(isReplaceableDraft({ ...draft, therapist_id: "t1" })).toBe(false);
    expect(isReplaceableDraft({ ...draft, visit_mode: "home_visit" })).toBe(false);
    expect(isReplaceableDraft({ ...draft, payment_terms: "pay_later" })).toBe(false);
    expect(isReplaceableDraft({ ...draft, package_purchase_id: "p1" })).toBe(false);
    expect(isReplaceableDraft({ ...draft, home_visit_purchase_id: "h1" })).toBe(false);
    expect(isReplaceableDraft({ ...draft, referral_id: "r1" })).toBe(false);
    expect(isReplaceableDraft({ ...draft, pay_later_outcome: "written_off" })).toBe(false);
  });
});

describe("overlapsSlot", () => {
  const hour = 3_600_000;
  it("treats touching sessions as not overlapping", () => {
    expect(overlapsSlot(0, 60, hour, 60)).toBe(false);
    expect(overlapsSlot(hour, 60, 0, 60)).toBe(false);
  });
  it("catches the same slot and a partial overlap", () => {
    expect(overlapsSlot(0, 60, 0, 60)).toBe(true);
    expect(overlapsSlot(0, 90, hour, 60)).toBe(true);
  });
});
