import { describe, it, expect } from "vitest";
import {
  categoryForLegacyPackageLink,
  clinicWideHomeVisitRate,
  effectiveHomeVisitRate,
  homeVisitPriceListing,
  homeVisitRatesFor,
  isHomeVisitPriceRow,
  ownHomeVisitRate,
  parseRupeesToPaise,
  resolveHomeVisitSale,
  type HomeVisitPriceRow,
} from "./homeVisitRates";

const BACK = "11111111-1111-1111-1111-111111111111";
const KNEE = "22222222-2222-2222-2222-222222222222";

function row(over: Partial<HomeVisitPriceRow> & { id: string }): HomeVisitPriceRow {
  return {
    category_id: null,
    price_paise: 150000,
    visit_count: 1,
    visit_duration_minutes: 60,
    travel_fee_included: false,
    care_plan_course: false,
    active: true,
    created_at: "2026-01-01T00:00:00Z",
    ...over,
  };
}

const clinic = row({ id: "a-clinic" });
const kneeOwn = row({ id: "b-knee", category_id: KNEE, price_paise: 180000, visit_duration_minutes: 45 });

describe("isHomeVisitPriceRow", () => {
  it("takes an active one-visit row that is not a course", () => {
    expect(isHomeVisitPriceRow(clinic)).toBe(true);
  });
  it("refuses a programme, a course anchor, a switched-off row and a zero price", () => {
    expect(isHomeVisitPriceRow({ ...clinic, visit_count: 4 })).toBe(false);
    expect(isHomeVisitPriceRow({ ...clinic, care_plan_course: true })).toBe(false);
    expect(isHomeVisitPriceRow({ ...clinic, active: false })).toBe(false);
    expect(isHomeVisitPriceRow({ ...clinic, price_paise: 0 })).toBe(false);
  });
  it("reads absent active and course flags as an ordinary active row", () => {
    expect(isHomeVisitPriceRow({ ...clinic, active: undefined, care_plan_course: undefined })).toBe(true);
  });
});

describe("effectiveHomeVisitRate", () => {
  it("uses the condition's own price when it has one", () => {
    const rate = effectiveHomeVisitRate([clinic, kneeOwn], KNEE);
    expect(rate).toMatchObject({ packageId: "b-knee", pricePaise: 180000, durationMinutes: 45, source: "own" });
  });
  it("falls back to the clinic-wide price", () => {
    const rate = effectiveHomeVisitRate([clinic, kneeOwn], BACK);
    expect(rate).toMatchObject({ packageId: "a-clinic", pricePaise: 150000, source: "clinic", rowCategoryId: null });
  });
  it("is null with no own price and no clinic-wide price -- never another condition's", () => {
    expect(effectiveHomeVisitRate([kneeOwn], BACK)).toBeNull();
  });
  it("ignores a programme row filed under the condition", () => {
    const programme = row({ id: "c-prog", category_id: BACK, visit_count: 4, price_paise: 100 });
    expect(effectiveHomeVisitRate([clinic, programme], BACK)?.packageId).toBe("a-clinic");
  });
  it("defaults an absent visit length to an hour and an absent travel flag to added", () => {
    const rate = clinicWideHomeVisitRate([{ ...clinic, visit_duration_minutes: null, travel_fee_included: null }]);
    expect(rate?.durationMinutes).toBe(60);
    expect(rate?.travelFeeIncluded).toBe(false);
  });
});

describe("picking one row per key, the way the migration does", () => {
  it("keeps the cheapest", () => {
    const dearer = row({ id: "z-dear", price_paise: 200000 });
    expect(clinicWideHomeVisitRate([dearer, clinic])?.packageId).toBe("a-clinic");
  });
  it("breaks a price tie on the oldest, then the lowest id", () => {
    const older = row({ id: "y-old", created_at: "2025-06-01T00:00:00Z" });
    expect(clinicWideHomeVisitRate([clinic, older])?.packageId).toBe("y-old");
    const twin = row({ id: "0-twin" });
    expect(clinicWideHomeVisitRate([clinic, twin])?.packageId).toBe("0-twin");
  });
  it("sorts an unknown creation time last", () => {
    const unknown = row({ id: "0-unknown", created_at: null });
    expect(clinicWideHomeVisitRate([unknown, clinic])?.packageId).toBe("a-clinic");
  });
  it("finds a condition's own price separately from the clinic-wide one", () => {
    expect(ownHomeVisitRate([clinic], KNEE)).toBeNull();
    expect(ownHomeVisitRate([clinic, kneeOwn], KNEE)?.packageId).toBe("b-knee");
  });
});

describe("homeVisitRatesFor", () => {
  it("prices every condition, keeping the order given and dropping the unpriced", () => {
    const listed = homeVisitRatesFor([{ id: KNEE }, { id: BACK }], [kneeOwn]);
    expect(listed.map((l) => l.category.id)).toEqual([KNEE]);
    const all = homeVisitRatesFor([{ id: KNEE }, { id: BACK }], [clinic, kneeOwn]);
    expect(all.map((l) => [l.category.id, l.rate.pricePaise])).toEqual([
      [KNEE, 180000],
      [BACK, 150000],
    ]);
  });
});

describe("homeVisitPriceListing", () => {
  it("lists the clinic-wide price and each condition's own or inherited figure", () => {
    const { clinicWide, lines } = homeVisitPriceListing([clinic, kneeOwn], [
      { id: BACK, title: "Back" },
      { id: KNEE, title: "Knee" },
    ]);
    expect(clinicWide?.pricePaise).toBe(150000);
    expect(lines.map((l) => [l.title, l.own?.pricePaise ?? null, l.effective?.pricePaise ?? null])).toEqual([
      ["Back", null, 150000],
      ["Knee", 180000, 180000],
    ]);
  });
  it("says a condition with no own price is not on sale while no clinic-wide price is set", () => {
    const { clinicWide, lines } = homeVisitPriceListing([kneeOwn], [{ id: BACK, title: "Back" }]);
    expect(clinicWide).toBeNull();
    expect(lines[0].effective).toBeNull();
  });
});

describe("resolveHomeVisitSale", () => {
  const active = new Set([BACK, KNEE]);
  const priceRows = [clinic, kneeOwn];

  it("sells a condition at its effective price", () => {
    const sale = resolveHomeVisitSale({ priceRows, activeCategoryIds: active, categoryId: KNEE });
    expect(sale).toMatchObject({ ok: true, categoryId: KNEE, rate: { packageId: "b-knee", pricePaise: 180000 } });
    const back = resolveHomeVisitSale({ priceRows, activeCategoryIds: active, categoryId: BACK });
    expect(back).toMatchObject({ ok: true, categoryId: BACK, rate: { packageId: "a-clinic" } });
  });
  it("refuses a condition that is not offered, and one with nothing to sell it at", () => {
    expect(
      resolveHomeVisitSale({ priceRows, activeCategoryIds: new Set([KNEE]), categoryId: BACK })
    ).toEqual({ ok: false, reason: "unknown_condition" });
    expect(resolveHomeVisitSale({ priceRows: [kneeOwn], activeCategoryIds: active, categoryId: BACK })).toEqual({
      ok: false,
      reason: "unpriced",
    });
  });
  it("lets the condition win over a package id sent alongside it", () => {
    const sale = resolveHomeVisitSale({
      priceRows,
      activeCategoryIds: active,
      categoryId: BACK,
      packageId: "b-knee",
      requestedRow: kneeOwn,
    });
    expect(sale).toMatchObject({ ok: true, rate: { packageId: "a-clinic" } });
  });
  it("honours an old link to a current price row", () => {
    expect(
      resolveHomeVisitSale({ priceRows, activeCategoryIds: active, packageId: "a-clinic", requestedRow: clinic })
    ).toMatchObject({ ok: true, categoryId: null, rate: { source: "clinic" } });
    expect(
      resolveHomeVisitSale({ priceRows, activeCategoryIds: active, packageId: "b-knee", requestedRow: kneeOwn })
    ).toMatchObject({ ok: true, categoryId: KNEE, rate: { source: "own" } });
  });
  it("answers an old programme link as a programme", () => {
    const programme = row({ id: "c-prog", visit_count: 4 });
    expect(
      resolveHomeVisitSale({ priceRows, activeCategoryIds: active, packageId: "c-prog", requestedRow: programme })
    ).toEqual({ ok: false, reason: "programme" });
  });
  it("refuses an old link to a row that is no longer the current price", () => {
    const replaced = row({ id: "z-old", price_paise: 900000 });
    expect(
      resolveHomeVisitSale({
        priceRows: [...priceRows, replaced],
        activeCategoryIds: active,
        packageId: "z-old",
        requestedRow: replaced,
      })
    ).toEqual({ ok: false, reason: "unavailable" });
    const off = row({ id: "b-knee", category_id: KNEE, active: false });
    expect(
      resolveHomeVisitSale({ priceRows: [clinic], activeCategoryIds: active, packageId: "b-knee", requestedRow: off })
    ).toEqual({ ok: false, reason: "unavailable" });
  });
  it("refuses an old link whose condition is switched off, a missing row and an empty request", () => {
    expect(
      resolveHomeVisitSale({ priceRows, activeCategoryIds: new Set([BACK]), packageId: "b-knee", requestedRow: kneeOwn })
    ).toEqual({ ok: false, reason: "unavailable" });
    expect(
      resolveHomeVisitSale({ priceRows, activeCategoryIds: active, packageId: "nope", requestedRow: null })
    ).toEqual({ ok: false, reason: "unavailable" });
    expect(resolveHomeVisitSale({ priceRows, activeCategoryIds: active })).toEqual({
      ok: false,
      reason: "missing",
    });
  });
});

describe("categoryForLegacyPackageLink", () => {
  const offered = new Set([BACK, KNEE]);
  it("opens a condition's own price on that condition", () => {
    expect(categoryForLegacyPackageLink({ category_id: KNEE, visit_count: 1 }, offered, BACK)).toEqual({
      programme: false,
      categoryId: KNEE,
    });
  });
  it("opens the clinic-wide price, a gone condition or an unknown row on the fallback", () => {
    expect(categoryForLegacyPackageLink({ category_id: null, visit_count: 1 }, offered, BACK)).toEqual({
      programme: false,
      categoryId: BACK,
    });
    expect(
      categoryForLegacyPackageLink({ category_id: "gone", visit_count: 1 }, offered, BACK)
    ).toMatchObject({ categoryId: BACK });
    expect(categoryForLegacyPackageLink(null, offered, BACK)).toMatchObject({ categoryId: BACK });
  });
  it("answers a course of visits as a programme", () => {
    expect(categoryForLegacyPackageLink({ category_id: KNEE, visit_count: 6 }, offered, BACK)).toEqual({
      programme: true,
    });
  });
});

describe("parseRupeesToPaise", () => {
  it("reads whole rupees, paise and grouping commas", () => {
    expect(parseRupeesToPaise("1500")).toBe(150000);
    expect(parseRupeesToPaise(" 1,499.5 ")).toBe(149950);
    expect(parseRupeesToPaise("0.01")).toBe(1);
  });
  it("refuses zero, negatives, three decimals and words", () => {
    for (const bad of ["0", "-5", "1.234", "abc", "", "1e3"]) {
      expect(parseRupeesToPaise(bad)).toBeNull();
    }
  });
});
