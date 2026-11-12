import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { LEGAL_PAGES, formatEffectiveDate, legalDoc, type LegalContext } from "@/lib/legal/legalDocs";
import { LEGAL_FACTS, missingLegalFacts, type LegalFacts } from "@/lib/legal/legalFacts";

const BLANK: LegalFacts = {
  entityName: "",
  registeredAddress: "",
  registrationNumber: "",
  grievanceOfficerName: "",
  grievanceOfficerEmail: "",
  grievanceOfficerPhone: "",
  jurisdictionCity: "",
  effectiveDate: "",
};

const FULL: LegalFacts = {
  entityName: "Example Health Pvt Ltd",
  registeredAddress: "1 Example Road, Chennai 600001",
  registrationNumber: "CIN U00000TN2026PTC000000",
  grievanceOfficerName: "A. Officer",
  grievanceOfficerEmail: "grievance@example.com",
  grievanceOfficerPhone: "+91 90000 00000",
  jurisdictionCity: "Chennai",
  effectiveDate: "2026-11-12",
};

const ctx = (facts: LegalFacts, over: Partial<LegalContext> = {}): LegalContext => ({
  siteName: "MoveRestore",
  contactEmail: "hello@example.com",
  leadTimeHours: 12,
  refundHours: 24,
  facts,
  ...over,
});

function textOf(slug: (typeof LEGAL_PAGES)[number]["slug"], c: LegalContext): string {
  const doc = legalDoc(slug, c);
  return JSON.stringify(doc);
}

describe("legal pages", () => {
  it("every listed page has a route file", () => {
    for (const page of LEGAL_PAGES) {
      expect(page.href).toBe(`/${page.slug}`);
      expect(existsSync(join(process.cwd(), "src/app", page.slug, "page.tsx"))).toBe(true);
    }
  });

  it("every document has sections with unique ids and no empty blocks", () => {
    for (const { slug } of LEGAL_PAGES) {
      const doc = legalDoc(slug, ctx(FULL));
      expect(doc.slug).toBe(slug);
      expect(doc.sections.length).toBeGreaterThan(0);
      const ids = doc.sections.map((s) => s.id);
      expect(new Set(ids).size).toBe(ids.length);
      for (const s of doc.sections) expect(s.blocks.length).toBeGreaterThan(0);
    }
  });

  it("never prints a placeholder when the owner's facts are blank", () => {
    for (const { slug } of LEGAL_PAGES) {
      const text = textOf(slug, ctx(BLANK));
      expect(text).not.toMatch(/undefined|null|\[[A-Z][a-z]+ ?[a-z]*\]|TODO|TBD/);
      expect(text).not.toContain("Example Health");
    }
  });

  it("names the entity, officer and courts once they are supplied", () => {
    expect(textOf("privacy", ctx(FULL))).toContain("Example Health Pvt Ltd");
    expect(textOf("grievances", ctx(FULL))).toContain("A. Officer");
    expect(textOf("grievances", ctx(FULL))).toContain("grievance@example.com");
    expect(textOf("terms", ctx(FULL))).toContain("courts at Chennai");
  });

  it("falls back to the site's contact email for grievances", () => {
    expect(textOf("grievances", ctx(BLANK))).toContain("hello@example.com");
  });

  it("quotes the live refund window and booking notice, not a typed number", () => {
    expect(textOf("refunds", ctx(FULL, { refundHours: 6 }))).toContain("at least 6 hours before");
    expect(textOf("refunds", ctx(FULL, { refundHours: 1 }))).toContain("at least 1 hour before");
    expect(textOf("terms", ctx(FULL, { leadTimeHours: 48 }))).toContain("48 hours' notice");
  });

  it("the cookie policy lists every cookie and storage key the code sets", () => {
    const text = textOf("cookies", ctx(FULL));
    const sources: [string, string][] = [
      ["src/lib/countryGeo.ts", "mr_geo"],
      ["src/lib/countryPricing.ts", "mr_country"],
      ["src/lib/proxyProfileCache.ts", "mr_profile_cache"],
    ];
    for (const [file, name] of sources) {
      expect(readFileSync(join(process.cwd(), file), "utf8")).toContain(`"${name}"`);
      expect(text).toContain(name);
    }
    for (const key of ["mr_analytics_consent", "mr_analytics_asked_at", "mr_ga_purchases"]) {
      expect(readFileSync(join(process.cwd(), "src/lib/analytics.ts"), "utf8")).toContain(`"${key}"`);
      expect(text).toContain(key);
    }
  });
});

describe("formatEffectiveDate", () => {
  it("formats a calendar date without a zone shift", () => {
    expect(formatEffectiveDate("2026-11-12")).toBe("12 November 2026");
    expect(formatEffectiveDate("2027-01-01")).toBe("1 January 2027");
  });
  it("returns blank for anything else", () => {
    expect(formatEffectiveDate("")).toBe("");
    expect(formatEffectiveDate("2026-13-01")).toBe("");
    expect(formatEffectiveDate("12/11/2026")).toBe("");
  });
});

describe("missingLegalFacts", () => {
  it("lists blank fields", () => {
    expect(missingLegalFacts(FULL)).toEqual([]);
    expect(missingLegalFacts(BLANK)).toContain("grievanceOfficerName");
  });
  it("the shipped effective date is a valid date", () => {
    expect(formatEffectiveDate(LEGAL_FACTS.effectiveDate)).not.toBe("");
  });
});
