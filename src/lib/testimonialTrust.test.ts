import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  SEEDED_TESTIMONIAL_QUOTES,
  isSeededTestimonial,
  publicTestimonials,
} from "./testimonialTrust";

describe("illustrative testimonials never reach the public pages", () => {
  it("drops the seeded rows and keeps a real one", () => {
    const rows = [
      { id: "1", quote: SEEDED_TESTIMONIAL_QUOTES[0] },
      { id: "2", quote: "  " + SEEDED_TESTIMONIAL_QUOTES[1].replace(/ /g, "  ") },
      { id: "3", quote: "A real patient said this, with consent." },
    ];
    expect(publicTestimonials(rows).map((r) => r.id)).toEqual(["3"]);
  });

  it("leaves nothing to render when only the seed exists", () => {
    expect(publicTestimonials(SEEDED_TESTIMONIAL_QUOTES.map((quote) => ({ quote })))).toEqual([]);
    expect(publicTestimonials(null)).toEqual([]);
  });

  it("an admin who rewrites a seeded row has adopted it", () => {
    expect(isSeededTestimonial({ quote: SEEDED_TESTIMONIAL_QUOTES[2] + " Edited." })).toBe(false);
  });

  // The list is only as good as its match with what schema.sql seeds.
  it("lists exactly the sentences schema.sql seeds", () => {
    const sql = readFileSync(join(process.cwd(), "supabase/schema.sql"), "utf8");
    for (const quote of SEEDED_TESTIMONIAL_QUOTES) {
      expect(sql, quote.slice(0, 40)).toContain(quote);
    }
    expect((sql.match(/\/photos\/testimonial-[a-z]+\.jpg/g) ?? []).length).toBe(SEEDED_TESTIMONIAL_QUOTES.length);
  });
});
