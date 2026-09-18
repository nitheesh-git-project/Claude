import { describe, it, expect } from "vitest";
import {
  normalizePincode,
  isValidPincodeShape,
  findAreaForPincode,
  type ServiceArea,
} from "./homeVisitAreas";

const area = (pincode: string, active = true): ServiceArea => ({
  id: `a-${pincode}`,
  city: "Bengaluru",
  area_name: "Indiranagar",
  pincode,
  travel_fee_paise: 15000,
  active,
});

describe("normalizePincode", () => {
  // The documented reason this function exists: patients type separators and
  // Google Places returns them, so a serviceable area must never be missed
  // over one.
  it("looks past the separators people actually type", () => {
    expect(normalizePincode("600 020")).toBe("600020");
    expect(normalizePincode(" 560001 ")).toBe("560001");
    expect(normalizePincode("560-001")).toBe("560001");
    expect(normalizePincode("560–001")).toBe("560001"); // en dash
  });

  it("keeps every other character, so junk stays junk", () => {
    // It used to strip `\D` outright, which meant any string with six digits
    // buried in it normalised to a pincode -- an audit probe sent
    // `560001'; drop table profiles; --` and the route answered a confident
    // "yes, we visit that area". Nothing was injected, but this is the one
    // place the app promises to send a therapist to an address, so answering
    // a question nobody asked is the failure worth closing.
    expect(normalizePincode("560001'; drop table profiles; --")).not.toBe("560001");
    expect(normalizePincode("560001abc")).not.toBe("560001");
  });

  it("is empty for anything that is not a string", () => {
    expect(normalizePincode(null)).toBe("");
    expect(normalizePincode(undefined)).toBe("");
  });
});

describe("isValidPincodeShape", () => {
  it("accepts six digits, separators and all", () => {
    expect(isValidPincodeShape("560001")).toBe(true);
    expect(isValidPincodeShape("600 020")).toBe(true);
  });

  it("refuses junk, a leading zero, and the wrong length", () => {
    expect(isValidPincodeShape("560001'; drop table profiles; --")).toBe(false);
    expect(isValidPincodeShape("<script>560001</script>")).toBe(false);
    expect(isValidPincodeShape("060001")).toBe(false);
    expect(isValidPincodeShape("56001")).toBe(false);
    expect(isValidPincodeShape("5600011")).toBe(false);
    expect(isValidPincodeShape("")).toBe(false);
  });
});

describe("findAreaForPincode", () => {
  it("matches across separators on both sides", () => {
    expect(findAreaForPincode([area("600 020")], "600020")?.pincode).toBe("600 020");
    expect(findAreaForPincode([area("600020")], "600 020")?.pincode).toBe("600020");
  });

  it("never returns an inactive area", () => {
    expect(findAreaForPincode([area("560001", false)], "560001")).toBeNull();
  });

  it("returns null rather than guessing for an unserviceable pincode", () => {
    expect(findAreaForPincode([area("560001")], "560002")).toBeNull();
    expect(findAreaForPincode([area("560001")], "")).toBeNull();
  });
});
