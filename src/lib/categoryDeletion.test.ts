import { describe, it, expect } from "vitest";
import {
  NO_REFERENCES,
  describeCategoryBlockers,
  type CategoryReferences,
} from "@/lib/categoryDeletion";

function refs(over: Partial<CategoryReferences> = {}): CategoryReferences {
  return { ...NO_REFERENCES, ...over };
}

describe("describeCategoryBlockers", () => {
  it("says nothing when nothing points at the category", () => {
    expect(describeCategoryBlockers(NO_REFERENCES)).toBeNull();
  });

  // "It has bookings" sends an admin to delete sessions and try again, only
  // to be refused a second time by something they were never told about.
  it("names which kind of row is holding it, not just that something is", () => {
    expect(describeCategoryBlockers(refs({ homeVisitPackages: 1 }))!.message).toContain(
      "1 home-visit package"
    );
    expect(describeCategoryBlockers(refs({ appointments: 3 }))!.message).toContain(
      "3 sessions"
    );
    expect(
      describeCategoryBlockers(refs({ packagePurchases: 1 }))!.message
    ).toContain("1 programme purchase");
    expect(describeCategoryBlockers(refs({ reassignments: 2 }))!.message).toContain(
      "2 reassignment records"
    );
  });

  it("counts, because one test booking and forty real ones are different decisions", () => {
    const one = describeCategoryBlockers(refs({ appointments: 1 }))!;
    expect(one.message).toContain("1 session ");
    expect(one.total).toBe(1);
    expect(describeCategoryBlockers(refs({ appointments: 40 }))!.total).toBe(40);
  });

  it("reads as a list when several kinds are in the way", () => {
    const blocked = describeCategoryBlockers(
      refs({ appointments: 2, packagePurchases: 1, homeVisitPackages: 1 })
    )!;
    expect(blocked.message).toContain(
      "2 sessions, 1 programme purchase and 1 home-visit package"
    );
    expect(blocked.total).toBe(4);
  });

  // The refusal is only useful if it says what to do instead -- turning the
  // condition off is what the admin actually wants, and it keeps the record
  // of what those patients were sold.
  it("names the alternative and what it preserves", () => {
    const blocked = describeCategoryBlockers(refs({ appointments: 1 }))!;
    expect(blocked.message).toMatch(/turn it off/i);
    expect(blocked.message).toMatch(/booking picker/i);
  });
});
