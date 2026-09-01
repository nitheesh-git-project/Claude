import { describe, it, expect } from "vitest";
import {
  computeHomeVisitTotal,
  computePerVisitFeePaise,
  computeHomeVisitTherapistPayoutPaise,
} from "@/lib/homeVisitPricing";

describe("computeHomeVisitTotal", () => {
  it("charges travel once per visit, not once per purchase", () => {
    // The therapist makes the trip for every visit in the programme. This
    // is the arithmetic the care-plan offer card must mirror, or the button
    // states a different figure than Razorpay takes.
    const t = computeHomeVisitTotal({
      packagePricePaise: 1200000, travelFeePaise: 15000, travelIncluded: false, visitCount: 4,
    });
    expect(t.totalPaise).toBe(1200000 + 15000 * 4);
    expect(t.travelLabel).toBe("added");
  });

  it("adds nothing when travel is already in the price", () => {
    const t = computeHomeVisitTotal({
      packagePricePaise: 1200000, travelFeePaise: 15000, travelIncluded: true, visitCount: 4,
    });
    expect(t.totalPaise).toBe(1200000);
    expect(t.travelLabel).toBe("included");
  });

  it("says 'none' when the area has no fee, whatever the flag", () => {
    for (const travelIncluded of [true, false]) {
      const t = computeHomeVisitTotal({
        packagePricePaise: 300000, travelFeePaise: 0, travelIncluded, visitCount: 1,
      });
      expect(t.totalPaise).toBe(300000);
      expect(t.travelLabel).toBe("none");
    }
  });

  it("never lets a negative fee reduce the price", () => {
    const t = computeHomeVisitTotal({
      packagePricePaise: 300000, travelFeePaise: -5000, travelIncluded: false, visitCount: 2,
    });
    expect(t.totalPaise).toBe(300000);
  });

  it("treats a zero visit count as one rather than dividing by zero", () => {
    const t = computeHomeVisitTotal({
      packagePricePaise: 300000, travelFeePaise: 10000, travelIncluded: false, visitCount: 0,
    });
    expect(t.perVisitPaise).toBe(310000);
  });
});

describe("computePerVisitFeePaise", () => {
  it("splits the programme price across its visits", () => {
    expect(computePerVisitFeePaise(1200000, 4)).toBe(300000);
  });

  it("survives a missing amount or count", () => {
    expect(computePerVisitFeePaise(null, 4)).toBe(0);
    // Zero visits means zero per visit, not the whole purchase -- this
    // figure is what a therapist is credited for one visit.
    expect(computePerVisitFeePaise(1200000, 0)).toBe(0);
    expect(computePerVisitFeePaise(0, 4)).toBe(0);
  });
});

describe("computeHomeVisitTherapistPayoutPaise", () => {
  it("passes the travel fee through in full, on top of the share", () => {
    // Travel is a reimbursement, never revenue. Folding it into the share
    // would make a therapist fund their own transport.
    const payout = computeHomeVisitTherapistPayoutPaise({
      feePaise: 300000, travelFeePaise: 15000, homeVisitSharePercent: 60, defaultSharePercent: 40,
    });
    expect(payout).toBe(Math.round(300000 * 0.6) + 15000);
  });

  it("still reimburses travel at a zero share", () => {
    expect(
      computeHomeVisitTherapistPayoutPaise({
        feePaise: 300000, travelFeePaise: 15000, homeVisitSharePercent: 0, defaultSharePercent: 40,
      })
    ).toBe(15000);
  });

  it("falls back to the ordinary share when no home-visit rate is set", () => {
    expect(
      computeHomeVisitTherapistPayoutPaise({
        feePaise: 300000, travelFeePaise: 0, homeVisitSharePercent: null, defaultSharePercent: 50,
      })
    ).toBe(150000);
  });

  it("returns null rather than implying zero when neither share is set", () => {
    // Showing 0 would read as "you earned nothing" where the truth is
    // "nobody has configured your rate".
    expect(
      computeHomeVisitTherapistPayoutPaise({
        feePaise: 300000, travelFeePaise: 15000, homeVisitSharePercent: null, defaultSharePercent: null,
      })
    ).toBeNull();
  });
});
