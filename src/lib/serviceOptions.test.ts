import { describe, it, expect } from "vitest";
import {
  categoryServiceOption,
  homeVisitConditionOption,
  defaultCategoryId,
  DEFAULT_SERVICE_DURATION_MINUTES,
  GENERAL_CONSULTATION_CATEGORY_ID,
} from "./serviceOptions";
import { focalPosition } from "./catalogImage";

const category = {
  id: "cat-1",
  title: "Back & Neck Pain",
  price_paise: 120000,
  duration_minutes: 45,
  description: "Desk-related stiffness and sciatica.",
  points: ["Posture screening", "Home exercise plan"],
  image_url: "https://example.test/cover.jpg",
  image_focal_x: 70,
  image_focal_y: 30,
};

// A condition offered as a home visit, at its home-visit price.
const visit = {
  id: "cat-1",
  title: "Back & Neck Pain",
  price_paise: 180000,
  visit_duration_minutes: 60,
  travel_fee_included: false,
  description: "Desk-related stiffness and sciatica.",
  points: ["Posture screening", "Home exercise plan"],
};

describe("categoryServiceOption", () => {
  it("carries the fields the card and the dialog both read", () => {
    const o = categoryServiceOption(category);
    expect(o.title).toBe("Back & Neck Pain");
    expect(o.summary).toBe("Desk-related stiffness and sciatica.");
    expect(o.points).toEqual(["Posture screening", "Home exercise plan"]);
    expect(o.pricePaise).toBe(120000);
    expect(o.priceUnit).toBe("/ 45 min session");
    expect(o.durationMinutes).toBe(45);
    expect(o.meta).toContain("45 min");
  });

  // The three cover columns are migration-dependent and read in their own
  // queries, so every one of them can be genuinely absent on a live database.
  it("reports an absent cover as null rather than an empty string", () => {
    const o = categoryServiceOption({
      id: "c",
      title: "T",
      price_paise: 1,
      duration_minutes: 30,
    });
    expect(o.imageUrl).toBeNull();
  });

  it("treats a blank image_url as no cover", () => {
    const o = categoryServiceOption({ ...category, image_url: "   " });
    expect(o.imageUrl).toBeNull();
  });

  // The whole reason focal points are nullable rather than defaulted here:
  // `Number(null)` and `Number("")` are both 0, and 0 is a real position --
  // the top-left corner. An absent column has to stay absent all the way to
  // `clampFocal`, which is the one place that answers it with dead centre.
  it("never turns an absent focal point into a number", () => {
    const o = categoryServiceOption({
      id: "c",
      title: "T",
      price_paise: 1,
      duration_minutes: 30,
    });
    expect(o.focalX).toBeNull();
    expect(o.focalY).toBeNull();
    expect(focalPosition({ image_focal_x: o.focalX, image_focal_y: o.focalY })).toBe("50% 50%");
  });

  it("keeps a real zero, which is a position and not an absence", () => {
    const o = categoryServiceOption({ ...category, image_focal_x: 0, image_focal_y: 0 });
    expect(o.focalX).toBe(0);
    expect(focalPosition({ image_focal_x: o.focalX, image_focal_y: o.focalY })).toBe("0% 0%");
  });

  it("passes a set focal point through unchanged", () => {
    const o = categoryServiceOption(category);
    expect(focalPosition({ image_focal_x: o.focalX, image_focal_y: o.focalY })).toBe("70% 30%");
  });

  // `points` is jsonb, so a hand-edited row can hold anything at all.
  it.each([
    ["an object", { a: 1 }],
    ["a bare string", "not a list"],
    ["null", null],
    ["undefined", undefined],
  ])("renders no list when points is %s", (_label, value) => {
    const o = categoryServiceOption({ ...category, points: value });
    expect(o.points).toEqual([]);
  });

  it("drops non-string and blank entries rather than rendering them", () => {
    const o = categoryServiceOption({ ...category, points: ["Real", "", "  ", 42, null, "Also real"] });
    expect(o.points).toEqual(["Real", "Also real"]);
  });

  it("falls back to the column's own default duration when it is missing", () => {
    const o = categoryServiceOption({ id: "c", title: "T", price_paise: 1 });
    expect(o.durationMinutes).toBe(DEFAULT_SERVICE_DURATION_MINUTES);
    expect(o.priceUnit).toBe(`/ ${DEFAULT_SERVICE_DURATION_MINUTES} min session`);
  });

  it("treats a blank description as nothing to say", () => {
    const o = categoryServiceOption({ ...category, description: "   " });
    expect(o.summary).toBeNull();
    expect(o.about).toBeNull();
  });

  it("offers no badge, no compare-at and no saving for a consultation", () => {
    const o = categoryServiceOption(category);
    expect(o.badge).toBeNull();
    expect(o.compareAtPaise).toBeNull();
    expect(o.savingsPaise).toBeNull();
    expect(o.highlight).toBe(false);
  });
});

describe("defaultCategoryId", () => {
  const general = { id: GENERAL_CONSULTATION_CATEGORY_ID };
  const back = { id: "cat-back" };
  const knee = { id: "cat-knee" };

  it("honours what the link asked for", () => {
    expect(defaultCategoryId([back, general, knee], "cat-knee")).toBe("cat-knee");
  });

  it("opens on the general consultation when the link names none", () => {
    expect(defaultCategoryId([back, general, knee])).toBe(GENERAL_CONSULTATION_CATEGORY_ID);
    expect(defaultCategoryId([back, general, knee], null)).toBe(
      GENERAL_CONSULTATION_CATEGORY_ID
    );
    expect(defaultCategoryId([back, general, knee], "")).toBe(
      GENERAL_CONSULTATION_CATEGORY_ID
    );
  });

  // The rule the old comment was right about and this keeps: which condition
  // sorts first is an ordering decision about a list, and each one carries
  // its own price, so pre-filling from it books somebody for a concern they
  // never chose.
  it("never falls back to the first row when the fallback row is gone", () => {
    expect(defaultCategoryId([back, knee])).toBe("");
    expect(defaultCategoryId([])).toBe("");
  });

  it("ignores a link naming a condition that is not on offer", () => {
    // A stale bookmark, or a category an admin switched off. It must not
    // preselect something that is not in the list, and it must still fall
    // back to the general consultation rather than to nothing.
    expect(defaultCategoryId([back, general], "cat-deleted")).toBe(
      GENERAL_CONSULTATION_CATEGORY_ID
    );
    expect(defaultCategoryId([back, knee], "cat-deleted")).toBe("");
  });

  it("finds the fallback wherever it sits in the list", () => {
    // It is seeded at display_order 999, so it is usually last -- but an
    // admin can reorder it, and this is keyed on the id either way.
    expect(defaultCategoryId([general, back, knee])).toBe(GENERAL_CONSULTATION_CATEGORY_ID);
  });
});

describe("homeVisitConditionOption", () => {
  it("is one visit of a condition, at the visit price, with no count anywhere", () => {
    const o = homeVisitConditionOption(visit);
    expect(o.id).toBe("cat-1");
    expect(o.title).toBe("Back & Neck Pain");
    expect(o.pricePaise).toBe(180000);
    expect(o.priceUnit).toBe("/ visit");
    expect(o.meta).toEqual(["60 min", "At your address", "Travel by area"]);
    const words = [...o.meta, o.priceUnit, ...o.stats.map((s) => `${s.label} ${s.value}`)].join(" ");
    expect(words).not.toMatch(/single visit|\d+ visits?\b|each|same therapist/i);
    expect(o.stats.find((s) => s.label === "Visits")).toBeUndefined();
  });

  it("says whether travel is included, in the chip and in the figures", () => {
    const added = homeVisitConditionOption(visit);
    expect(added.meta).toContain("Travel by area");
    expect(added.stats.find((s) => s.label === "Travel")?.value).toBe("Added for your area");

    const included = homeVisitConditionOption({ ...visit, travel_fee_included: true });
    expect(included.meta).toContain("Travel included");
    expect(included.stats.find((s) => s.label === "Travel")?.value).toBe("Included");
  });

  // An absent column must not read as "travel is included" -- that is the
  // direction that quotes a patient less than they will be charged.
  it("treats an absent travel flag as travel being added", () => {
    const o = homeVisitConditionOption({ ...visit, travel_fee_included: undefined });
    expect(o.meta).toContain("Travel by area");
  });

  it("uses the condition's own copy and points", () => {
    const o = homeVisitConditionOption(visit);
    expect(o.summary).toBe("Desk-related stiffness and sciatica.");
    expect(o.about).toBe("Desk-related stiffness and sciatica.");
    expect(o.points).toEqual(["Posture screening", "Home exercise plan"]);
    expect(homeVisitConditionOption({ ...visit, points: { a: 1 } }).points).toEqual([]);
  });

  it("offers no badge, no compare-at and no saving", () => {
    const o = homeVisitConditionOption(visit);
    expect(o.badge).toBeNull();
    expect(o.compareAtPaise).toBeNull();
    expect(o.savingsPaise).toBeNull();
  });

  it("falls back to the column's own default length when it is missing", () => {
    const o = homeVisitConditionOption({ ...visit, visit_duration_minutes: null });
    expect(o.durationMinutes).toBe(DEFAULT_SERVICE_DURATION_MINUTES);
  });

  it("never turns an absent focal point into a number", () => {
    const o = homeVisitConditionOption(visit);
    expect(o.focalX).toBeNull();
    expect(o.focalY).toBeNull();
    expect(focalPosition({ image_focal_x: o.focalX, image_focal_y: o.focalY })).toBe("50% 50%");
  });

  it("never states a validity in days", () => {
    const option = homeVisitConditionOption(visit);
    expect(option.meta.join(" ")).not.toMatch(/\bdays?\b/);
    expect(option.stats.find((s) => s.label === "Book within")).toBeUndefined();
  });
});
