import { describe, expect, it } from "vitest";
import {
  describeAreaPrefill,
  paiseToInrInput,
  type ServiceAreaLike,
} from "./homeVisitWaitlistArea";

const areas: ServiceAreaLike[] = [
  { city: "Bengaluru", area_name: "Indiranagar", pincode: "560038", travel_fee_paise: 15000 },
  { city: "Bengaluru", area_name: "Koramangala", pincode: "560034", travel_fee_paise: 15000 },
  { city: "Bengaluru", area_name: "Whitefield", pincode: "560066", travel_fee_paise: 25000 },
  { city: "Mysuru", area_name: null, pincode: "570001", travel_fee_paise: 30000 },
];

describe("describeAreaPrefill", () => {
  it("fills the city from the request", () => {
    const p = describeAreaPrefill({ pincode: "560001", city: "Bengaluru" }, areas);
    expect(p.alreadyServed).toBe(false);
    expect(p.city).toBe("Bengaluru");
  });

  it("takes the travel fee the clinic already charges in that city", () => {
    // 150 twice against 250 once: the commonest, not the highest.
    const p = describeAreaPrefill({ pincode: "560001", city: "Bengaluru" }, areas);
    expect(p.travelFeeInr).toBe("150");
    expect(p.travelFeeSource).toBe("city");
  });

  it("leaves the fee at zero and says so where the city is new", () => {
    // Zero here is a placeholder rather than a price, which is what the
    // source field exists to let the screen say.
    const p = describeAreaPrefill({ pincode: "110001", city: "Delhi" }, areas);
    expect(p.travelFeeInr).toBe("0");
    expect(p.travelFeeSource).toBe("none");
  });

  it("matches a city whatever case or spacing it was typed in", () => {
    const p = describeAreaPrefill({ pincode: "560002", city: "  bengaluru " }, areas);
    expect(p.travelFeeInr).toBe("150");
  });

  it("reports a pincode that is already served, with the clinic's own row", () => {
    // Offering to add it would be offering an insert the route refuses.
    const p = describeAreaPrefill({ pincode: "560066", city: "Bangalore" }, areas);
    expect(p.alreadyServed).toBe(true);
    expect(p.city).toBe("Bengaluru");
    expect(p.areaName).toBe("Whitefield");
    expect(p.travelFeeInr).toBe("250");
  });

  it("handles a request that never said which city", () => {
    const p = describeAreaPrefill({ pincode: "600001", city: null }, areas);
    expect(p.city).toBe("");
    expect(p.travelFeeInr).toBe("0");
    expect(p.travelFeeSource).toBe("none");
  });

  it("breaks a tie towards the lower fee", () => {
    const tied: ServiceAreaLike[] = [
      { city: "Pune", area_name: null, pincode: "411001", travel_fee_paise: 20000 },
      { city: "Pune", area_name: null, pincode: "411002", travel_fee_paise: 10000 },
    ];
    expect(describeAreaPrefill({ pincode: "411003", city: "Pune" }, tied).travelFeeInr).toBe("100");
  });
});

describe("paiseToInrInput", () => {
  it("keeps whole rupees whole and shows paise where there are any", () => {
    expect(paiseToInrInput(15000)).toBe("150");
    expect(paiseToInrInput(12550)).toBe("125.50");
    expect(paiseToInrInput(0)).toBe("0");
  });
});
