import { describe, expect, it } from "vitest";
import {
  PROFILE_STATUS_LABEL,
  STATUS_OVERRIDE_REASON_MIN,
  computeProfileStatus,
  effectiveStatus,
  statusReasonText,
  validateStatusOverride,
  type StatusMeasure,
} from "@/lib/profileStatus";

// Gait speed: MDC 0.05 m/s, MCID 0.1 m/s, higher is better.
const speed = (values: number[]): StatusMeasure => ({ measureKey: "gait_speed_4m", values, profileKind: "geriatric" });

describe("computeProfileStatus", () => {
  it("is improving when the main measure moved the good way by its meaningful change", () => {
    expect(computeProfileStatus({ main: speed([0.6, 0.7, 0.75]) })).toEqual({ status: "improving", reason: "better_meaningful" });
  });

  it("is steady, not improving, when the move is beyond error but short of meaningful", () => {
    // 0.08 is above the 0.05 MDC and below the 0.1 MCID.
    expect(computeProfileStatus({ main: speed([0.6, 0.68]) })).toEqual({ status: "steady", reason: "better_not_meaningful" });
  });

  it("is steady inside the measurement error either way", () => {
    expect(computeProfileStatus({ main: speed([0.6, 0.63]) }).status).toBe("steady");
    expect(computeProfileStatus({ main: speed([0.6, 0.57]) }).status).toBe("steady");
  });

  it("needs attention when worse than the first review beyond the MDC", () => {
    expect(computeProfileStatus({ main: speed([0.8, 0.7]) })).toEqual({ status: "needs_attention", reason: "worse_than_first" });
  });

  it("does not call a recent slip improving even if first-to-now is a gain", () => {
    const r = computeProfileStatus({ main: speed([0.5, 0.9, 0.8]) });
    expect(r).toEqual({ status: "needs_attention", reason: "worse_than_previous" });
  });

  it("a new fall or a red flag beats a good number", () => {
    expect(computeProfileStatus({ main: speed([0.5, 0.9]), newFall: true })).toEqual({ status: "needs_attention", reason: "new_fall" });
    expect(computeProfileStatus({ main: speed([0.5, 0.9]), redFlag: true })).toEqual({ status: "needs_attention", reason: "red_flag" });
    // ...and need no measure at all.
    expect(computeProfileStatus({ main: null, redFlag: true }).status).toBe("needs_attention");
  });

  it("sets a baseline on one review and says unknown with none", () => {
    expect(computeProfileStatus({ main: speed([0.6]) })).toEqual({ status: "baseline", reason: "single_review" });
    expect(computeProfileStatus({ main: speed([]) }).status).toBe("unknown");
    expect(computeProfileStatus({ main: null }).status).toBe("unknown");
  });

  it("says unknown for a measure the registry no longer holds", () => {
    expect(computeProfileStatus({ main: { measureKey: "nope", values: [1, 2], profileKind: "ortho" } }).status).toBe("unknown");
  });

  it("is steady for a measure with no better direction", () => {
    const r = computeProfileStatus({ main: { measureKey: "hoehn_yahr", values: [2, 3], profileKind: "neuro_parkinsons" } });
    expect(r).toEqual({ status: "steady", reason: "no_direction" });
  });

  it("judges a lower-is-better measure the right way round, with no MCID known", () => {
    // Timed Up and Go in Parkinson's: MDC 3.5 s, no MCID in the registry.
    const tug = (values: number[]): StatusMeasure => ({ measureKey: "tug", values, profileKind: "neuro_parkinsons" });
    expect(computeProfileStatus({ main: tug([14, 9]) }).status).toBe("improving");
    expect(computeProfileStatus({ main: tug([9, 14]) }).status).toBe("needs_attention");
    expect(computeProfileStatus({ main: tug([10, 11]) }).status).toBe("steady");
  });

  it("ignores non-finite readings", () => {
    expect(computeProfileStatus({ main: speed([0.6, Number.NaN, 0.8]) }).status).toBe("improving");
  });
});

describe("the words", () => {
  it("has a label for every status and a reason in both voices", () => {
    for (const label of Object.values(PROFILE_STATUS_LABEL)) expect(label.length).toBeGreaterThan(0);
    expect(statusReasonText("within_error", "patient")).not.toBe(statusReasonText("within_error", "clinician"));
    expect(statusReasonText("worse_than_first", "clinician")).toContain("MDC");
    expect(statusReasonText("worse_than_first", "patient")).not.toContain("MDC");
  });
});

describe("override", () => {
  it("needs a real status and a reason", () => {
    expect(validateStatusOverride({ status: "improving", reason: "x".repeat(STATUS_OVERRIDE_REASON_MIN) }).ok).toBe(true);
    expect(validateStatusOverride({ status: "improving", reason: "short" }).ok).toBe(false);
    expect(validateStatusOverride({ status: "baseline", reason: "x".repeat(20) }).ok).toBe(false);
    expect(validateStatusOverride(null).ok).toBe(false);
    expect(validateStatusOverride({ status: "steady", reason: "y".repeat(400) }).ok).toBe(false);
  });
  it("replaces the computed status and says so", () => {
    const computed = computeProfileStatus({ main: speed([0.6, 0.63]) });
    expect(effectiveStatus(computed, null)).toEqual({ status: "steady", overridden: false });
    expect(effectiveStatus(computed, { status: "needs_attention", reason: "Fell twice at home last week" })).toEqual({
      status: "needs_attention",
      overridden: true,
      reasonText: "Fell twice at home last week",
    });
  });
});

describe("an override never hides a later safety signal", () => {
  const steady = [0.6, 0.62];
  const overridden = { status: "improving" as const, reason: "Doing well in clinic, ignore the old score", setAt: "2026-10-10T05:00:00.000Z" };

  it("keeps a fall that happened after the override on top", () => {
    const computed = computeProfileStatus({ main: speed(steady), newFall: true, newFallAt: "2026-10-12T05:00:00.000Z" });
    expect(computed).toMatchObject({ status: "needs_attention", reason: "new_fall", signalAt: "2026-10-12T05:00:00.000Z" });
    expect(effectiveStatus(computed, overridden)).toEqual({ status: "needs_attention", overridden: false, overrideSuperseded: true });
  });

  it("keeps a red flag that came after the override on top", () => {
    const computed = computeProfileStatus({ main: speed(steady), redFlag: true, redFlagAt: "2026-10-11T05:00:00.000Z" });
    expect(effectiveStatus(computed, overridden)).toMatchObject({ status: "needs_attention", overridden: false, overrideSuperseded: true });
  });

  it("honours an override made after the signal, because the physiotherapist has seen it", () => {
    const computed = computeProfileStatus({ main: speed(steady), newFall: true, newFallAt: "2026-10-09T05:00:00.000Z" });
    expect(effectiveStatus(computed, overridden)).toEqual({ status: "improving", overridden: true, reasonText: overridden.reason });
  });

  it("is decided by the LATEST signal when there are two", () => {
    const computed = computeProfileStatus({
      main: speed(steady),
      redFlag: true,
      redFlagAt: "2026-10-09T05:00:00.000Z",
      newFall: true,
      newFallAt: "2026-10-13T05:00:00.000Z",
    });
    expect(computed.signalAt).toBe("2026-10-13T05:00:00.000Z");
    expect(effectiveStatus(computed, overridden).overridden).toBe(false);
  });

  it("takes the safe side when a time is not known", () => {
    const noSignalTime = computeProfileStatus({ main: speed(steady), newFall: true });
    expect(noSignalTime.signalAt).toBeUndefined();
    expect(effectiveStatus(noSignalTime, overridden)).toMatchObject({ status: "needs_attention", overrideSuperseded: true });
    // One of two signals with no time is still unknown.
    const oneUnknown = computeProfileStatus({ main: speed(steady), redFlag: true, redFlagAt: "2026-10-01T05:00:00.000Z", newFall: true });
    expect(oneUnknown.signalAt).toBeUndefined();
    const dated = computeProfileStatus({ main: speed(steady), newFall: true, newFallAt: "2026-10-12T05:00:00.000Z" });
    expect(effectiveStatus(dated, { status: "improving", reason: "no time recorded on this one" })).toMatchObject({ status: "needs_attention", overrideSuperseded: true });
  });

  it("still lets an override overrule a measure-based needs-attention", () => {
    const worse = computeProfileStatus({ main: speed([0.8, 0.6]) });
    expect(worse).toMatchObject({ status: "needs_attention", reason: "worse_than_first" });
    expect(effectiveStatus(worse, { ...overridden, status: "steady" })).toMatchObject({ status: "steady", overridden: true });
  });

  it("does not need to supersede an override that already says needs attention", () => {
    const computed = computeProfileStatus({ main: speed(steady), newFall: true, newFallAt: "2026-10-12T05:00:00.000Z" });
    expect(effectiveStatus(computed, { ...overridden, status: "needs_attention" })).toMatchObject({ status: "needs_attention", overridden: true });
  });
});
