import { describe, expect, it } from "vitest";
import { parsePublicSectionVisibility, PUBLIC_SECTION_TOGGLES } from "@/lib/publicSectionVisibility";

describe("parsePublicSectionVisibility", () => {
  it("shows everything unless a switch is explicitly off", () => {
    expect(parsePublicSectionVisibility(null)).toEqual({ promises: true, limits: true, testimonials: true });
    expect(parsePublicSectionVisibility({ promises_section_visible: null })).toMatchObject({ promises: true });
    expect(
      parsePublicSectionVisibility({ limits_section_visible: false, testimonials_section_visible: true })
    ).toEqual({ promises: true, limits: false, testimonials: true });
  });
  it("names three distinct columns", () => {
    expect(new Set(PUBLIC_SECTION_TOGGLES.map((t) => t.column)).size).toBe(3);
  });
});
