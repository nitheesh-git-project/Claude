import { describe, expect, it } from "vitest";
import { buildSuggestedTeaser } from "./suggestedTeaser";

const NOW = Date.parse("2026-10-06T00:00:00Z");
const snapshot = { title: "Spine Conditions", sessionCount: 4, pricePaise: 199600, imageUrl: "/x.jpg" };
const plan = (status: string, expiresAt: string | null = null) => ({
  status,
  version: { offerKind: "session_package", offerSnapshot: snapshot, expiresAt },
});

describe("buildSuggestedTeaser", () => {
  it("names a recommendation waiting for the patient", () => {
    expect(buildSuggestedTeaser(plan("active"), 0, NOW)).toEqual({
      kind: "plan",
      title: "Spine Conditions",
      sessionCount: 4,
      isHomeVisit: false,
      pricePaise: 199600,
      imageUrl: "/x.jpg",
    });
  });

  it("puts the recommendation ahead of proposed times", () => {
    expect(buildSuggestedTeaser(plan("active"), 2, NOW)?.kind).toBe("plan");
  });

  it("says nothing about a plan the patient cannot act on", () => {
    expect(buildSuggestedTeaser(plan("pending_review"), 0, NOW)).toBeNull();
    expect(buildSuggestedTeaser(plan("active", "2026-10-01T00:00:00Z"), 0, NOW)).toBeNull();
  });

  it("falls back to proposed times", () => {
    expect(buildSuggestedTeaser(plan("accepted"), 3, NOW)).toEqual({ kind: "times", count: 3 });
    expect(buildSuggestedTeaser(null, 1, NOW)).toEqual({ kind: "times", count: 1 });
  });

  it("is empty when nothing waits", () => {
    expect(buildSuggestedTeaser(null, 0, NOW)).toBeNull();
  });
});
