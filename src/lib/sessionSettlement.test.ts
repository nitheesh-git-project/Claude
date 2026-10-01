import { describe, expect, it } from "vitest";
import { splitSessionSettlement } from "./sessionSettlement";

describe("splitSessionSettlement", () => {
  it("always sums to gross exactly, so nothing is invented or lost to rounding", () => {
    // This is what verify_settlement_agreement() asserts on every stored row,
    // and it is why the clinic takes the remainder rather than its own
    // percentage: three independently rounded percentages of one figure do
    // not add up to it.
    for (const gross of [0, 1, 99, 100, 333, 120000, 149999]) {
      for (const sharePct of [0, 33, 50, 70, 100]) {
        for (const hospitalPct of [null, 0, 15, 33.5, 100]) {
          const split = splitSessionSettlement({
            grossPaise: gross,
            travelPaise: 0,
            therapistSharePaise: Math.round((gross * sharePct) / 100),
            hospitalSharePercent: hospitalPct,
          });
          expect(
            split.therapistSharePaise + split.partnerSharePaise + split.clinicSharePaise
          ).toBe(gross);
        }
      }
    }
  });

  it("takes the partner's cut after the therapist, never off gross", () => {
    // A partner's commission is taken on what the clinic keeps. Computing it
    // on gross pays them a share of the therapist's own money.
    const split = splitSessionSettlement({
      grossPaise: 100000,
      travelPaise: 0,
      therapistSharePaise: 60000,
      hospitalSharePercent: 50,
    });
    expect(split.therapistSharePaise).toBe(60000);
    expect(split.partnerSharePaise).toBe(20000); // half of the remaining 40000
    expect(split.clinicSharePaise).toBe(20000);
  });

  it("gives the partner nothing when no share is configured", () => {
    // Not zero-as-a-guess: `null` means unknowable, and the money modules
    // exclude such a session from the split and count it rather than
    // inventing a percentage.
    const split = splitSessionSettlement({
      grossPaise: 100000,
      travelPaise: 0,
      therapistSharePaise: 40000,
      hospitalSharePercent: null,
    });
    expect(split.partnerSharePaise).toBe(0);
    expect(split.clinicSharePaise).toBe(60000);
  });

  it("never lets a therapist's share exceed gross", () => {
    // Travel rides inside the therapist's figure and is not revenue, so a
    // cheap home visit with a long drive can compute above gross. Clamping
    // keeps the identity above true rather than producing a negative clinic
    // share that would read as the clinic owing money on a delivered session.
    const split = splitSessionSettlement({
      grossPaise: 50000,
      travelPaise: 30000,
      therapistSharePaise: 80000,
      hospitalSharePercent: 20,
    });
    expect(split.therapistSharePaise).toBe(50000);
    expect(split.partnerSharePaise).toBe(0);
    expect(split.clinicSharePaise).toBe(0);
  });
});
