import { describe, expect, it } from "vitest";
import { defaultFaqs } from "./faqDefaults";
import { quotesDriftingFigure } from "./faqLiveFacts";

describe("the default FAQ", () => {
  const faqs = defaultFaqs({ leadTimeHours: 12, refundHours: 24 });

  it("has real questions with real answers", () => {
    expect(faqs.length).toBeGreaterThanOrEqual(5);
    for (const faq of faqs) {
      expect(faq.question.endsWith("?")).toBe(true);
      expect(faq.answer.length).toBeGreaterThan(30);
    }
    expect(new Set(faqs.map((f) => f.id)).size).toBe(faqs.length);
  });

  it("quotes no price and no pincode -- only the settings it is given", () => {
    for (const faq of faqs) expect(quotesDriftingFigure(faq.answer), faq.id).toBe(false);
    const cancel = faqs.find((f) => f.id === "default-cancel")!;
    expect(cancel.answer).toContain("Cancel 24 hours ahead");
    expect(defaultFaqs({ leadTimeHours: 6, refundHours: 48 }).find((f) => f.id === "default-notice")!.answer)
      .toContain("6 hours' notice");
  });

  it("makes no clinical or outcome promise", () => {
    const text = faqs.map((f) => f.answer).join(" ").toLowerCase();
    expect(text).not.toMatch(/guarantee|cure|painless|fully recover/);
  });
});
