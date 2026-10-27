import { describe, expect, it } from "vitest";
import {
  homeVisitBookable,
  homeVisitComingLine,
  homeVisitWeVisitLine,
  listPlaces,
  resolveHomeVisitOffer,
} from "./homeVisitOffer";

const chennai = [
  { city: "Chennai", area_name: "Adyar" },
  { city: "Chennai", area_name: "T. Nagar" },
];

describe("home visits are bookable only when switch, area and price all hold", () => {
  it("is live with the switch on, an area and a price", () => {
    const offer = resolveHomeVisitOffer({ enabled: true, areas: chennai, hasPrice: true });
    expect(offer.state).toBe("live");
    expect(homeVisitBookable(offer)).toBe(true);
  });

  it("is off whenever the switch is off, whatever else exists", () => {
    const offer = resolveHomeVisitOffer({ enabled: false, areas: chennai, hasPrice: true });
    expect(offer.state).toBe("off");
    expect(homeVisitBookable(offer)).toBe(false);
  });

  it("is only 'coming' with no active area, or with no price", () => {
    expect(resolveHomeVisitOffer({ enabled: true, areas: [], hasPrice: true }).state).toBe("coming");
    expect(resolveHomeVisitOffer({ enabled: true, areas: chennai, hasPrice: false }).state).toBe("coming");
    expect(homeVisitBookable(resolveHomeVisitOffer({ enabled: true, areas: [], hasPrice: true }))).toBe(false);
  });

  it("treats a failed read as 'could not check', never as 'none'", () => {
    // A hiccup must not take a working service off the site.
    expect(resolveHomeVisitOffer({ enabled: true, areas: null, hasPrice: true }).state).toBe("live");
    expect(resolveHomeVisitOffer({ enabled: true, areas: chennai, hasPrice: null }).state).toBe("live");
    // ...but the switch itself fails closed.
    expect(resolveHomeVisitOffer({ enabled: false, areas: null, hasPrice: null }).state).toBe("off");
  });
});

describe("what the site says instead of a dead-end button", () => {
  it("names the cities it is coming to, and never a date", () => {
    const offer = resolveHomeVisitOffer({ enabled: true, areas: chennai, hasPrice: false });
    expect(homeVisitComingLine(offer)).toBe("Home visits are coming to Chennai.");
    const two = resolveHomeVisitOffer({
      enabled: true,
      areas: [{ city: "Pune" }, { city: "Chennai" }, { city: "Chennai" }],
      hasPrice: false,
    });
    expect(homeVisitComingLine(two)).toBe("Home visits are coming to Chennai and Pune.");
  });

  it("says 'soon' when no city is known", () => {
    const offer = resolveHomeVisitOffer({ enabled: true, areas: [], hasPrice: true });
    expect(homeVisitComingLine(offer)).toBe("Home visits are coming soon.");
  });

  it("lists the areas for one city, the cities for several", () => {
    const one = resolveHomeVisitOffer({ enabled: true, areas: chennai, hasPrice: true });
    expect(homeVisitWeVisitLine(one)).toBe("We visit: Adyar and T. Nagar, Chennai");
    const many = resolveHomeVisitOffer({
      enabled: true,
      areas: [...chennai, { city: "Pune", area_name: "Kothrud" }],
      hasPrice: true,
    });
    expect(homeVisitWeVisitLine(many)).toBe("We visit: Chennai and Pune");
    expect(homeVisitWeVisitLine(resolveHomeVisitOffer({ enabled: true, areas: [], hasPrice: true }))).toBeNull();
  });

  it("joins places the way a person would", () => {
    expect(listPlaces(["A"])).toBe("A");
    expect(listPlaces(["A", "B", "C"])).toBe("A, B and C");
  });
});
