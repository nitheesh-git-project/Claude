import { describe, expect, it } from "vitest";
import { describeHomeVisitCommitment } from "./homeVisitAreaCommitments";

describe("describeHomeVisitCommitment", () => {
  it("says nothing when nothing is outstanding", () => {
    expect(describeHomeVisitCommitment({ purchases: 0, visits: 0 })).toEqual({
      note: null,
      confirm: null,
    });
  });

  it("says nothing when the caller did not ask", () => {
    expect(describeHomeVisitCommitment(undefined)).toEqual({ note: null, confirm: null });
  });

  it("says it could not be read rather than reading as zero", () => {
    const { note, confirm } = describeHomeVisitCommitment(null);
    // The whole point: on this switch a zero reads as permission.
    expect(note).toMatch(/could not check/i);
    expect(confirm).toMatch(/could not check/i);
    expect(note).not.toMatch(/\b0\b/);
  });

  it("names the number, and says the switch cancels none of it", () => {
    const { note, confirm } = describeHomeVisitCommitment({ purchases: 3, visits: 11 });
    expect(note).toContain("11 paid visits");
    expect(note).toContain("3 purchases");
    expect(note).toMatch(/does not cancel/i);
    expect(confirm).toContain("11 paid visits");
    expect(confirm).toMatch(/only stops new sales/i);
  });

  it("reads singular for one of each", () => {
    const { note } = describeHomeVisitCommitment({ purchases: 1, visits: 1 });
    expect(note).toContain("1 paid visit ");
    expect(note).toContain("1 purchase ");
  });

  it("counts a purchase once however many visits it owes", () => {
    const { note } = describeHomeVisitCommitment({ purchases: 1, visits: 6 });
    expect(note).toContain("6 paid visits across 1 purchase");
  });
});
