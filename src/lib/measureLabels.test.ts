import { describe, expect, it } from "vitest";
import { shortSeriesLabel, type LabelLine } from "@/lib/measureLabels";

const joint = (variant: string, side: "left" | "right" | null = "right"): LabelLine => ({
  measureKey: "joint_range",
  variant,
  side,
  medicationState: null,
  label: "Goniometry",
  plainName: "How far a joint moves",
  variantLabel: null,
});
const other = (measureKey: string, over: Partial<LabelLine> = {}): LabelLine => ({
  measureKey,
  variant: null,
  side: null,
  medicationState: null,
  label: "Full clinical name",
  plainName: "Full plain name",
  variantLabel: null,
  ...over,
});

describe("shortSeriesLabel", () => {
  it("drops the measure's long name and the mode when only one mode exists", () => {
    const bend = joint("knee_flexion_active");
    expect(shortSeriesLabel(bend, "patient", [bend])).toBe("Knee bend (right)");
    expect(shortSeriesLabel(bend, "clinician", [bend])).toBe("Knee bend (right)");
  });
  it("keeps active and passive apart when both exist on a side", () => {
    const a = joint("knee_extension_active");
    const p = joint("knee_extension_passive");
    const all = [a, p];
    expect(shortSeriesLabel(a, "patient", all)).toBe("Knee straightening - on your own (right)");
    expect(shortSeriesLabel(p, "patient", all)).toBe("Knee straightening - moved by physio (right)");
    expect(shortSeriesLabel(a, "clinician", all)).toBe("Knee straightening, active (right)");
    expect(shortSeriesLabel(p, "clinician", all)).toBe("Knee straightening, passive (right)");
  });
  it("does not pair a right-side line with a left-side one", () => {
    const a = joint("knee_extension_active", "right");
    const p = joint("knee_extension_passive", "left");
    expect(shortSeriesLabel(a, "patient", [a, p])).toBe("Knee straightening (right)");
  });
  it("names strength by muscle group, the leg score and pain plainly", () => {
    expect(shortSeriesLabel(other("strength_symmetry", { variant: "quadriceps", side: "right" }), "patient")).toBe("Thigh strength (right)");
    expect(shortSeriesLabel(other("strength_symmetry"), "patient")).toBe("Strength");
    expect(shortSeriesLabel(other("lefs"), "patient")).toBe("Everyday tasks (legs)");
    expect(shortSeriesLabel(other("lefs"), "clinician")).toBe("LEFS");
    expect(shortSeriesLabel(other("pain_nprs"), "patient")).toBe("Pain score");
  });
  it("falls back to the full name for a measure it has no short name for", () => {
    expect(shortSeriesLabel(other("berg", { variantLabel: "Sitting" }), "patient")).toBe("Full plain name - Sitting");
    expect(shortSeriesLabel(other("berg", { medicationState: "off" }), "clinician")).toBe("Full clinical name (OFF)");
  });
});
