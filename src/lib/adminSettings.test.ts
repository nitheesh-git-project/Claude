import { describe, it, expect } from "vitest";
import { parseAdminSettings, isContactScanMode } from "@/lib/adminSettings";

describe("contact controls", () => {
  it("fails safe on an unknown scan mode", () => {
    expect(parseAdminSettings({ contact_scan_mode: "nonsense" }).contactScanMode).toBe(
      "flag_and_block"
    );
    expect(parseAdminSettings({}).contactScanMode).toBe("flag_and_block");
  });

  it("accepts every real mode", () => {
    for (const mode of ["off", "flag_only", "flag_and_block"]) {
      expect(isContactScanMode(mode)).toBe(true);
      expect(parseAdminSettings({ contact_scan_mode: mode }).contactScanMode).toBe(mode);
    }
    expect(isContactScanMode("blocking")).toBe(false);
  });

  it("keeps masking on unless it is explicitly off", () => {
    expect(parseAdminSettings({}).contactMaskingEnabled).toBe(true);
    expect(parseAdminSettings({ contact_masking_enabled: false }).contactMaskingEnabled).toBe(false);
  });

  it("keeps the detectors on unless they are explicitly off", () => {
    expect(parseAdminSettings({}).riskSignalsEnabled).toBe(true);
    expect(parseAdminSettings({ risk_signals_enabled: false }).riskSignalsEnabled).toBe(false);
  });
});
