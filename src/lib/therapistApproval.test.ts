import { describe, it, expect } from "vitest";
import {
  parseSharePercent,
  parseTherapistApprovalSetup,
  APPROVAL_NOTE_MAX_LENGTH,
} from "./therapistApproval";

const money = { canSetRevenueShare: true };
const noMoney = { canSetRevenueShare: false };

describe("parseSharePercent", () => {
  it("accepts 0, 100 and two decimals", () => {
    expect(parseSharePercent(0)).toBe(0);
    expect(parseSharePercent("100")).toBe(100);
    expect(parseSharePercent("62.5")).toBe(62.5);
    expect(parseSharePercent(33.33)).toBe(33.33);
  });

  it("refuses out of range, three decimals, blanks and non-numbers", () => {
    for (const bad of [-1, 100.01, "33.333", "", "  ", null, undefined, "abc", true, {}]) {
      expect(parseSharePercent(bad)).toBeNull();
    }
  });
});

describe("parseTherapistApprovalSetup", () => {
  it("requires the share from an admin who can set it", () => {
    const result = parseTherapistApprovalSetup({}, money);
    expect(result).toMatchObject({ ok: false, code: "revenue_share_required" });
  });

  it("saves the share, and a blank home-visit share as null (same as ordinary)", () => {
    const result = parseTherapistApprovalSetup(
      { revenueSharePercent: "60", homeVisitSharePercent: "", visibleOnTeam: true },
      money
    );
    expect(result).toEqual({
      ok: true,
      setup: { revenueSharePercent: 60, homeVisitSharePercent: null, visibleOnTeam: true, note: null },
    });
  });

  it("keeps a separate home-visit share", () => {
    const result = parseTherapistApprovalSetup(
      { revenueSharePercent: 60, homeVisitSharePercent: 70 },
      money
    );
    expect(result.ok && result.setup.homeVisitSharePercent).toBe(70);
  });

  it("refuses an invalid share rather than saving a wrong rate", () => {
    expect(parseTherapistApprovalSetup({ revenueSharePercent: 120 }, money)).toMatchObject({
      ok: false,
      code: "invalid",
    });
    expect(
      parseTherapistApprovalSetup({ revenueSharePercent: 50, homeVisitSharePercent: -5 }, money)
    ).toMatchObject({ ok: false, code: "invalid" });
  });

  it("lets an admin without money approve with no share", () => {
    const result = parseTherapistApprovalSetup({ visibleOnTeam: false }, noMoney);
    expect(result).toEqual({
      ok: true,
      setup: { revenueSharePercent: null, homeVisitSharePercent: null, visibleOnTeam: false, note: null },
    });
  });

  it("refuses a share sent by an admin without money instead of dropping it", () => {
    expect(parseTherapistApprovalSetup({ revenueSharePercent: 50 }, noMoney)).toMatchObject({
      ok: false,
      code: "forbidden_money",
    });
  });

  it("leaves visibility alone when not sent, and refuses a non-boolean", () => {
    const result = parseTherapistApprovalSetup({ revenueSharePercent: 50 }, money);
    expect(result.ok && result.setup.visibleOnTeam).toBeUndefined();
    expect(
      parseTherapistApprovalSetup({ revenueSharePercent: 50, visibleOnTeam: "yes" }, money)
    ).toMatchObject({ ok: false, code: "invalid" });
  });

  it("trims the note and caps its length", () => {
    const ok = parseTherapistApprovalSetup({ revenueSharePercent: 50, note: "  licence checked  " }, money);
    expect(ok.ok && ok.setup.note).toBe("licence checked");
    expect(
      parseTherapistApprovalSetup(
        { revenueSharePercent: 50, note: "x".repeat(APPROVAL_NOTE_MAX_LENGTH + 1) },
        money
      )
    ).toMatchObject({ ok: false, code: "invalid" });
  });
});
