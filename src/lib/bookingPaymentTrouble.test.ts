import { describe, expect, it } from "vitest";
import { exitLinkHidden } from "./bookingPaymentTrouble";

describe("exitLinkHidden", () => {
  it("shows the link on every step but payment", () => {
    expect(exitLinkHidden({ onPaymentStep: false, escapeOpen: false })).toBe(false);
  });
  it("hides it on the payment step until the wizard offers its own way out", () => {
    expect(exitLinkHidden({ onPaymentStep: true, escapeOpen: false })).toBe(true);
  });
  it("brings it back once the wizard does", () => {
    expect(exitLinkHidden({ onPaymentStep: true, escapeOpen: true })).toBe(false);
  });
});
