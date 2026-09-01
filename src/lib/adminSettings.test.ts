import { describe, it, expect } from "vitest";
import { parseAdminSettings, DEFAULT_ADMIN_SETTINGS, isContactScanMode } from "@/lib/adminSettings";

describe("showProgrammePrices", () => {
  it("reads the new column when it is there", () => {
    expect(parseAdminSettings({ show_programme_prices: false }).showProgrammePrices).toBe(false);
    expect(parseAdminSettings({ show_programme_prices: true }).showProgrammePrices).toBe(true);
  });

  it("falls back to the column it was renamed from", () => {
    // A database mid-migration has the old column and not the new one. An
    // admin who switched programme prices off must not have them switched
    // back on by a deploy.
    expect(
      parseAdminSettings({ session_packages_visible: false }).showProgrammePrices
    ).toBe(false);
  });

  it("prefers the new column when both disagree", () => {
    expect(
      parseAdminSettings({ show_programme_prices: true, session_packages_visible: false })
        .showProgrammePrices
    ).toBe(true);
  });

  it("defaults to shown when neither column exists", () => {
    expect(parseAdminSettings({}).showProgrammePrices).toBe(
      DEFAULT_ADMIN_SETTINGS.showProgrammePrices
    );
    expect(parseAdminSettings(null).showProgrammePrices).toBe(true);
  });
});

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
