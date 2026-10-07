import { describe, expect, it } from "vitest";
import {
  escapeOffered,
  isPaymentTryFlow,
  isPaymentTryOutcome,
  isServerFailureStatus,
  triesUnlockAccess,
} from "./paymentTries";

describe("payment tries", () => {
  it("knows its outcomes and flows", () => {
    expect(isPaymentTryOutcome("dismissed")).toBe(true);
    expect(isPaymentTryOutcome("server_error")).toBe(true);
    expect(isPaymentTryOutcome("paid")).toBe(false);
    expect(isPaymentTryFlow("home_visit")).toBe(true);
    expect(isPaymentTryFlow("package")).toBe(false);
  });

  it("unlocks at the limit, not before", () => {
    expect(triesUnlockAccess(2, 3)).toBe(false);
    expect(triesUnlockAccess(3, 3)).toBe(true);
    expect(triesUnlockAccess(1, 0)).toBe(true);
  });

  it("offers the dashboard only to an account that can open it", () => {
    expect(escapeOffered({ unlocked: false, justUnlocked: false, failuresThisVisit: 9, limit: 3 })).toBe(false);
    expect(escapeOffered({ unlocked: true, justUnlocked: true, failuresThisVisit: 1, limit: 3 })).toBe(true);
    expect(escapeOffered({ unlocked: true, justUnlocked: false, failuresThisVisit: 2, limit: 3 })).toBe(false);
    expect(escapeOffered({ unlocked: true, justUnlocked: false, failuresThisVisit: 3, limit: 3 })).toBe(true);
  });

  it("counts only our own failures as a try", () => {
    expect(isServerFailureStatus(500)).toBe(true);
    expect(isServerFailureStatus(503)).toBe(true);
    expect(isServerFailureStatus(409)).toBe(false);
    expect(isServerFailureStatus(400)).toBe(false);
  });
});
