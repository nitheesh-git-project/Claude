import { describe, expect, it } from "vitest";
import { exitLinkHidden, MAX_ATTEMPTS_BEFORE_ESCAPE } from "./bookingPaymentTrouble";

describe("exitLinkHidden", () => {
  it("shows the link on every step but payment", () => {
    expect(exitLinkHidden({ onPaymentStep: false, failedAttempts: 0 })).toBe(false);
  });
  it("hides it on the payment step for a fresh attempt", () => {
    expect(exitLinkHidden({ onPaymentStep: true, failedAttempts: 0 })).toBe(true);
  });
  it("keeps it hidden through the first failures", () => {
    expect(
      exitLinkHidden({ onPaymentStep: true, failedAttempts: MAX_ATTEMPTS_BEFORE_ESCAPE - 1 })
    ).toBe(true);
  });
  it("brings it back once paying has plainly stopped working", () => {
    expect(
      exitLinkHidden({ onPaymentStep: true, failedAttempts: MAX_ATTEMPTS_BEFORE_ESCAPE })
    ).toBe(false);
  });
});
