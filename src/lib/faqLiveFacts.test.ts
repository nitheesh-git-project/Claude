import { describe, expect, it } from "vitest";
import { homeVisitCoverageFaq, LIVE_HOME_VISIT_FAQ_ID, quotesDriftingFigure } from "./faqLiveFacts";

describe("homeVisitCoverageFaq (F-05)", () => {
  it("names the cities the live service areas cover, once each, in order", () => {
    const faq = homeVisitCoverageFaq(["Chennai", "Bengaluru", " Chennai ", null, ""]);
    expect(faq?.id).toBe(LIVE_HOME_VISIT_FAQ_ID);
    expect(faq?.answer).toContain("parts of Bengaluru and Chennai.");
  });

  it("quotes no pincode and no price -- it points to where the live ones are", () => {
    const faq = homeVisitCoverageFaq(["Chennai"])!;
    expect(quotesDriftingFigure(faq.answer)).toBe(false);
    expect(faq.answer).toMatch(/pincode/);
    expect(faq.answer).toMatch(/Home Visit page/);
  });

  it("says nothing when no area is served", () => {
    expect(homeVisitCoverageFaq([])).toBeNull();
    expect(homeVisitCoverageFaq([null, "  "])).toBeNull();
  });

  it("lists three or more cities with commas", () => {
    expect(homeVisitCoverageFaq(["Pune", "Chennai", "Bengaluru"])?.answer).toContain(
      "parts of Bengaluru, Chennai and Pune."
    );
  });
});

describe("quotesDriftingFigure", () => {
  it("catches the stale staging answer's pincode and prices", () => {
    expect(quotesDriftingFigure("We cover 600020.")).toBe(true);
    expect(quotesDriftingFigure("We cover 600 020.")).toBe(true);
    expect(quotesDriftingFigure("A visit is ₹499 plus ₹100 travel.")).toBe(true);
    expect(quotesDriftingFigure("Rs. 1,500 per visit")).toBe(true);
    expect(quotesDriftingFigure("INR 150 travel")).toBe(true);
  });

  it("leaves ordinary answers alone", () => {
    expect(quotesDriftingFigure("Sessions run over video, one-to-one.")).toBe(false);
    expect(quotesDriftingFigure("Cancel up to 24 hours before for a full refund.")).toBe(false);
    expect(quotesDriftingFigure("Call 9876543210")).toBe(false);
  });
});
