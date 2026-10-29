import { describe, expect, it } from "vitest";
import {
  cleanPageLocation,
  daysAheadBucket,
  isTrackablePath,
  paiseToAmount,
  priceBand,
  sanitizeEvent,
  timeOfDay,
} from "./analytics";

describe("isTrackablePath", () => {
  it("allows the public pages and the booking widget", () => {
    for (const p of ["/", "/book", "/book-home-visit", "/faq", "/hospitals", "/conditions/back"]) {
      expect(isTrackablePath(p)).toBe(true);
    }
  });
  it("never records the signed-in trees or the back office", () => {
    for (const p of [
      "/admin/dashboard",
      "/dashboard",
      "/patient/sessions",
      "/therapist/roster",
      "/hospital/referrals",
      "/api/x",
      "/reset-password",
    ]) {
      expect(isTrackablePath(p)).toBe(false);
    }
  });
  it("rejects what is not a path", () => {
    expect(isTrackablePath(null)).toBe(false);
    expect(isTrackablePath("")).toBe(false);
  });
});

describe("sanitizeEvent", () => {
  it("drops an event that is not on the list", () => {
    expect(sanitizeEvent("patient_name_entered", {})).toBeNull();
  });
  it("keeps only the parameters the event lists", () => {
    const e = sanitizeEvent("cta_click", { location: "hero", label: "Book", email: "a@b.c", phone: "999" });
    expect(e?.params).toEqual({ location: "hero", label: "book" });
  });
  it("reduces a string to a short token", () => {
    const e = sanitizeEvent("cta_click", { location: "Hero <script>", label: "x".repeat(200) });
    expect(e?.params.location).toBe("hero script");
    expect(String(e?.params.label).length).toBe(40);
  });
  it("drops a value of the wrong type", () => {
    const e = sanitizeEvent("booking_step_view", { step_name: "slot", step_index: "2" });
    expect(e?.params).toEqual({ step_name: "slot" });
  });
  it("sends the service name and visit mode on service_selected", () => {
    const e = sanitizeEvent("service_selected", {
      visit_mode: "home",
      service_id: "abc",
      service_name: "Lower Back Pain",
      pincode: "560001",
    });
    expect(e?.params).toEqual({ visit_mode: "home", service_id: "abc", service_name: "lower back pain" });
  });
  it("records a failed promo attempt without the code", () => {
    const e = sanitizeEvent("promo_attempt", { visit_mode: "video", success: false, code: "SAVE50" });
    expect(e?.params).toEqual({ visit_mode: "video", success: false });
  });
  it("carries purchase value as a number", () => {
    const e = sanitizeEvent("purchase", { transaction_id: "ab12", value: 799, currency: "INR" });
    expect(e?.params).toEqual({ transaction_id: "ab12", value: 799, currency: "inr" });
  });
});

describe("buckets", () => {
  it("bands a price without revealing it", () => {
    expect(priceBand(0)).toBe("free");
    expect(priceBand(49_900)).toBe("under_500");
    expect(priceBand(50_000)).toBe("500_999");
    expect(priceBand(150_000)).toBe("1000_1999");
    expect(priceBand(200_000)).toBe("2000_plus");
  });
  it("converts paise to rupees once", () => {
    expect(paiseToAmount(79_900)).toBe(799);
    expect(paiseToAmount(12_345)).toBe(123.45);
  });
  it("buckets lead time and time of day", () => {
    expect(daysAheadBucket(0)).toBe("0_1");
    expect(daysAheadBucket(3)).toBe("2_3");
    expect(daysAheadBucket(7)).toBe("4_7");
    expect(daysAheadBucket(20)).toBe("8_plus");
    expect(timeOfDay(9)).toBe("morning");
    expect(timeOfDay(14)).toBe("afternoon");
    expect(timeOfDay(18)).toBe("evening");
  });
  it("drops the query string and fragment from the page address", () => {
    expect(cleanPageLocation("https://x.in", "/book")).toBe("https://x.in/book");
  });
});
