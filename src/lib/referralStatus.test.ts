import { describe, it, expect } from "vitest";
import {
  REFERRAL_STATUSES,
  formatReferralStatus,
  isReferralAccepted,
  isReferralClosed,
  isReferralWithClinic,
  isReferralWithdrawable,
} from "./referralStatus";

describe("referral statuses", () => {
  it("every status the column can hold has a label", () => {
    // The gap this exists to close: the hospital dashboard filtered for
    // "pending" and "accepted", which the CHECK cannot hold, so two counts
    // read zero for every partner for ever.
    for (const s of REFERRAL_STATUSES) {
      expect(formatReferralStatus(s)).not.toBe(s);
    }
  });

  it("does not invent a label for a status that does not exist", () => {
    expect(formatReferralStatus("pending")).toBe("pending");
  });

  it("counts only the two statuses genuinely waiting on the clinic", () => {
    expect(REFERRAL_STATUSES.filter(isReferralWithClinic)).toEqual([
      "pending_review",
      "therapist_assigned",
    ]);
  });

  it("treats a therapist being assigned as accepted", () => {
    // From the partner's side, a clinician being on it is the acceptance.
    // Waiting for the patient to register is not the partner's business.
    expect(isReferralAccepted("therapist_assigned")).toBe(true);
    expect(isReferralAccepted("invite_sent")).toBe(true);
    expect(isReferralAccepted("converted")).toBe(true);
    expect(isReferralAccepted("pending_review")).toBe(false);
    expect(isReferralAccepted("declined")).toBe(false);
  });

  it("closes on registration, a decline or a withdrawal, and nothing else", () => {
    expect(REFERRAL_STATUSES.filter(isReferralClosed)).toEqual([
      "converted",
      "declined",
      "withdrawn",
    ]);
  });

  it("keeps a partner's withdrawal apart from the clinic's decline", () => {
    expect(isReferralWithdrawable("withdrawn")).toBe(false);
    expect(isReferralAccepted("withdrawn")).toBe(false);
    expect(isReferralWithClinic("withdrawn")).toBe(false);
  });

  it("allows withdrawal only before a link has gone out", () => {
    // Once the patient holds a registration link, withdrawing it behind
    // their back is not the partner's call.
    expect(isReferralWithdrawable("invite_sent")).toBe(false);
    expect(REFERRAL_STATUSES.filter(isReferralWithdrawable)).toEqual([
      "pending_review",
      "therapist_assigned",
    ]);
  });
});
