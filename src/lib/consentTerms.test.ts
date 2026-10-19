import { describe, expect, it } from "vitest";
import { CONSENT_TERMS_TITLE, consentCheckboxText, consentTerms } from "./consentTerms";

const allText = (title: string | null) => {
  const t = consentTerms(title);
  const box = consentCheckboxText(title);
  return [t.title, t.intro, ...t.sections.flatMap((s) => [s.heading, s.body]), box.before, box.linkText, box.after].join(" ");
};

describe("consent terms (F-04)", () => {
  it("names the service the patient chose", () => {
    expect(consentTerms("Stroke Rehabilitation").intro).toContain("your Stroke Rehabilitation session");
    expect(consentCheckboxText("Stroke Rehabilitation").after).toContain("my Stroke Rehabilitation video session");
  });

  it("reads sensibly with no service chosen", () => {
    expect(consentTerms(null).intro).toContain("your session");
    expect(consentCheckboxText("  ").after).toBe(
      " for my video session. I understand it is not an emergency service."
    );
  });

  it("makes no specialty-specific claim, whatever the service", () => {
    for (const title of ["Paediatric Development", "Stroke Rehabilitation", "Back & Neck Pain", null]) {
      expect(allText(title)).not.toMatch(/musculoskeletal|orthopaedic|neurolog|paediatric care/i);
    }
  });

  it("the checkbox links to the same terms the dialog shows", () => {
    expect(consentCheckboxText(null).linkText).toBe(CONSENT_TERMS_TITLE);
    expect(consentTerms(null).title).toBe(CONSENT_TERMS_TITLE);
    // The emergency disclaimer the checkbox promises is actually in the terms.
    expect(consentTerms(null).sections.map((s) => s.heading)).toContain("Not for emergencies");
  });
});
