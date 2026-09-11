import { describe, it, expect } from "vitest";
import {
  ACCOUNT_ALREADY_GONE,
  ACCOUNT_DELETE_REFUSED,
  CANNOT_DELETE_LAST_ADMIN,
  CANNOT_DELETE_SELF,
  NO_ACCOUNT_REFERENCES,
  countAccountReferences,
  describeAccountBlockers,
  type AccountReferences,
} from "@/lib/accountDeletion";

function refs(over: Partial<AccountReferences> = {}): AccountReferences {
  return { ...NO_ACCOUNT_REFERENCES, ...over };
}

describe("describeAccountBlockers", () => {
  it("allows an account nothing points at", () => {
    expect(describeAccountBlockers(NO_ACCOUNT_REFERENCES, "Asha Rao")).toBeNull();
  });

  it("names the one thing holding it, with its count", () => {
    const result = describeAccountBlockers(refs({ sessions: 1 }), "Asha Rao");
    expect(result?.message).toContain("Asha Rao has 1 session on file");
    expect(result?.total).toBe(1);
  });

  it("pluralises each group on its own count", () => {
    const result = describeAccountBlockers(refs({ sessions: 2, referrals: 1 }), "Asha");
    expect(result?.message).toContain("2 sessions");
    expect(result?.message).toContain("1 referral");
    expect(result?.message).not.toContain("1 referrals");
  });

  // An admin who has cancelled every session and still cannot delete the
  // account needs to know it is the audit rows, or they will keep trying.
  it("lists every group that has rows, not only the first", () => {
    const result = describeAccountBlockers(
      refs({ sessions: 3, money: 2, programmes: 1, clinical: 4, backOffice: 12, referrals: 1 }),
      "Vik"
    );
    for (const fragment of [
      "3 sessions",
      "2 money records",
      "1 programme",
      "4 clinical records",
      "12 back-office actions",
      "1 referral",
    ]) {
      expect(result?.message).toContain(fragment);
    }
    expect(result?.total).toBe(23);
  });

  it("reads as a sentence, with 'and' before the last group", () => {
    const result = describeAccountBlockers(refs({ sessions: 1, money: 1 }), "Asha");
    expect(result?.message).toContain("1 session and 1 money record");
  });

  // Suspending is what the admin actually wants, so the refusal has to say
  // so -- a refusal with no way forward is the shape this codebase keeps
  // correcting.
  it("names suspending as the alternative", () => {
    const result = describeAccountBlockers(refs({ backOffice: 1 }), "Asha");
    expect(result?.message).toMatch(/suspend/i);
    expect(result?.message).toMatch(/attributable/i);
  });
});

describe("countAccountReferences", () => {
  it("sums every group", () => {
    expect(countAccountReferences(refs({ sessions: 2, backOffice: 3 }))).toBe(5);
    expect(countAccountReferences(NO_ACCOUNT_REFERENCES)).toBe(0);
  });
});

describe("the refusals that are not about history", () => {
  it("says why, in words an admin can act on", () => {
    expect(CANNOT_DELETE_SELF).toMatch(/another Master Admin/i);
    expect(CANNOT_DELETE_LAST_ADMIN).toMatch(/last Master Admin/i);
    // Removed nothing and blocked by nothing are different situations, and
    // neither may be reported as success.
    expect(ACCOUNT_ALREADY_GONE).not.toEqual(ACCOUNT_DELETE_REFUSED);
    expect(ACCOUNT_DELETE_REFUSED).toMatch(/Nothing has changed/i);
  });
});
