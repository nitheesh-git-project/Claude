import { describe, expect, it } from "vitest";
import { isPublicCatalogTitle, PUBLIC_HIDDEN_TITLE_PATTERN } from "./publicCatalog";

describe("publicCatalog", () => {
  it("hides QA test conditions and nothing real", () => {
    expect(isPublicCatalogTitle("QA Promo Condition")).toBe(false);
    expect(isPublicCatalogTitle("qa discount condition")).toBe(false);
    expect(isPublicCatalogTitle("Spine Conditions")).toBe(true);
    expect(isPublicCatalogTitle("QAnon support")).toBe(true);
    expect(PUBLIC_HIDDEN_TITLE_PATTERN).toBe("QA %");
  });
});
