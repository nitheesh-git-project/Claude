import { describe, expect, it } from "vitest";
import {
  LICENSED_MEASURES,
  enabledLicensedSet,
  isLicensedMeasureKey,
  normaliseLicensedMeasureSelection,
  parseEnabledLicensedMeasures,
} from "@/lib/licensedMeasures";
import { validateMeasurement } from "@/lib/outcomeMeasures";

describe("the licensed-measure switch", () => {
  it("lists every licensed scale and nothing free", () => {
    expect(LICENSED_MEASURES.length).toBeGreaterThan(5);
    expect(LICENSED_MEASURES.every((m) => m.licence === "licensed" && !m.enabledByDefault)).toBe(true);
    expect(isLicensedMeasureKey("barthel")).toBe(true);
    expect(isLicensedMeasureKey("tug")).toBe(false);
    expect(isLicensedMeasureKey(7)).toBe(false);
  });

  it("reads a stored value as known licensed keys, once each, in registry order", () => {
    const order = LICENSED_MEASURES.map((m) => m.key);
    expect(parseEnabledLicensedMeasures(["oswestry", "barthel", "barthel", "tug", "gone"])).toEqual(
      order.filter((k) => k === "barthel" || k === "oswestry")
    );
    expect(parseEnabledLicensedMeasures(null)).toEqual([]);
    expect(parseEnabledLicensedMeasures("barthel")).toEqual([]);
  });

  it("refuses a selection naming anything that is not a licensed scale", () => {
    expect(normaliseLicensedMeasureSelection(["barthel"])).toEqual({ ok: true, keys: ["barthel"] });
    expect(normaliseLicensedMeasureSelection([])).toEqual({ ok: true, keys: [] });
    expect(normaliseLicensedMeasureSelection(["barthel", "tug"]).ok).toBe(false);
    expect(normaliseLicensedMeasureSelection(["barthl"]).ok).toBe(false);
    expect(normaliseLicensedMeasureSelection("barthel").ok).toBe(false);
  });

  it("fails closed: a switch that could not be read enables nothing", () => {
    expect(enabledLicensedSet({ status: "unreadable" }).size).toBe(0);
    expect([...enabledLicensedSet({ status: "ok", keys: ["barthel"] })]).toEqual(["barthel"]);
    const barthel = {
      measureKey: "barthel",
      value: 60,
      measuredAt: "2026-10-12T09:00:00.000Z",
      conditions: { setting: "in_person" },
    };
    const ctx = { profileKind: "geriatric" as const, nowMs: Date.parse("2026-10-12T10:00:00.000Z") };
    expect(validateMeasurement(barthel, { ...ctx, enabledLicensed: enabledLicensedSet({ status: "unreadable" }) }).ok).toBe(false);
    expect(
      validateMeasurement(barthel, { ...ctx, enabledLicensed: enabledLicensedSet({ status: "ok", keys: ["barthel"] }) }).ok
    ).toBe(true);
  });
});
