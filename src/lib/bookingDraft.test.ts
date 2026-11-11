import { describe, expect, it } from "vitest";
import { isReplaceableDraft, overlapsSlot, type DraftCandidate } from "./bookingDraft";
import { ownSlotConflict } from "./bookingDraft";

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

describe("ownSlotConflict", () => {
  const row = (over: Record<string, unknown> = {}) => ({
    id: "a1",
    slot_time: "2026-11-20T12:30:00Z",
    duration_minutes: 60,
    status: "confirmed",
    payment_status: "paid",
    therapist_id: "t1",
    visit_mode: "online",
    payment_terms: "prepaid",
    package_purchase_id: null,
    home_visit_purchase_id: null,
    referral_id: null,
    pay_later_outcome: null,
    ...over,
  });
  const at = (iso: string) => Date.parse(iso);

  it("flags a time that overlaps a real booking", () => {
    expect(ownSlotConflict([row()], at("2026-11-20T13:00:00Z"), 60, 60).conflict).toBe(true);
    expect(ownSlotConflict([row()], at("2026-11-20T13:30:00Z"), 60, 60).conflict).toBe(false);
  });

  it("does not count the patient's own unpaid draft, which the new booking replaces", () => {
    const draft = row({ status: "requested", payment_status: "unpaid", therapist_id: null });
    const result = ownSlotConflict([draft], at("2026-11-20T12:30:00Z"), 60, 60);
    expect(result.conflict).toBe(false);
    expect(result.replaceable.map((r) => r.id)).toEqual(["a1"]);
  });

  it("treats a named draft as replaceable even when it does not overlap", () => {
    const draft = row({ id: "d1", status: "requested", payment_status: "unpaid", therapist_id: null, slot_time: "2026-11-21T12:30:00Z" });
    expect(ownSlotConflict([draft], at("2026-11-20T12:30:00Z"), 60, 60, "d1").replaceable.map((r) => r.id)).toEqual(["d1"]);
  });
});
