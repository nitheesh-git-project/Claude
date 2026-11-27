import { describe, expect, it } from "vitest";
import { referralIsAssignable, referralNotAssignableMessage } from "./referralAssignable";

describe("referralIsAssignable", () => {
  it("allows only the two states before an invite", () => {
    expect(referralIsAssignable("pending_review")).toBe(true);
    expect(referralIsAssignable("therapist_assigned")).toBe(true);
    for (const s of ["declined", "converted", "invite_sent", null]) expect(referralIsAssignable(s)).toBe(false);
  });
  it("says a declined referral was declined", () => {
    expect(referralNotAssignableMessage("declined")).toMatch(/was declined/);
  });
});
