import { describe, expect, it } from "vitest";
import { filterPromoClaims, toPromoClaim, type RawPromoClaimRow } from "@/lib/promoClaims";

const lookups = {
  codes: new Map([
    ["c1", { code: "DIWALI", description: "Diwali campaign" }],
    ["c2", { code: "WELCOME", description: null }],
  ]),
  people: new Map([
    ["p1", { name: "Ram Kumar", patientCode: "PT0001" }],
    ["p2", { name: "Asha", patientCode: null }],
  ]),
};
const row = (over: Partial<RawPromoClaimRow>): RawPromoClaimRow => ({
  id: "a1",
  promo_code_id: "c1",
  patient_id: "p1",
  promo_claimed_at: "2026-11-01T10:00:00Z",
  discount_paise: 20000,
  payment_status: "paid",
  status: "confirmed",
  title: "Back pain",
  ...over,
});

describe("promo claims", () => {
  it("shapes a row, and labels unpaid and cancelled honestly", () => {
    expect(toPromoClaim("session", row({}), lookups)).toMatchObject({
      patientName: "Ram Kumar",
      code: "DIWALI",
      campaign: "Diwali campaign",
      forWhat: "Back pain",
      state: "paid",
      discountPaise: 20000,
    });
    expect(toPromoClaim("session", row({ payment_status: "unpaid" }), lookups)?.state).toBe("unpaid");
    expect(toPromoClaim("session", row({ status: "cancelled" }), lookups)?.state).toBe("cancelled");
    expect(toPromoClaim("session", row({ promo_code_id: null }), lookups)).toBeNull();
    expect(toPromoClaim("programme", row({ title: null }), lookups)?.forWhat).toBe("Programme");
  });

  it("filters by text, code, kind, state and day, newest first", () => {
    const claims = [
      toPromoClaim("session", row({}), lookups)!,
      toPromoClaim("programme", row({ id: "b", promo_code_id: "c2", patient_id: "p2", promo_claimed_at: "2026-11-05T10:00:00Z" }), lookups)!,
      toPromoClaim("session", row({ id: "c", payment_status: "unpaid", promo_claimed_at: "2026-11-03T10:00:00Z" }), lookups)!,
    ];
    const day = (iso: string) => iso.slice(0, 10);
    const all = { query: "", codeId: "", kind: "all" as const, state: "all" as const, from: "", to: "" };
    expect(filterPromoClaims(claims, all, day).map((c) => c.claimedAt.slice(0, 10))).toEqual(["2026-11-05", "2026-11-03", "2026-11-01"]);
    expect(filterPromoClaims(claims, { ...all, query: "pt0001" }, day)).toHaveLength(2);
    expect(filterPromoClaims(claims, { ...all, codeId: "c2" }, day)).toHaveLength(1);
    expect(filterPromoClaims(claims, { ...all, kind: "programme" }, day)).toHaveLength(1);
    expect(filterPromoClaims(claims, { ...all, state: "paid" }, day)).toHaveLength(2);
    expect(filterPromoClaims(claims, { ...all, from: "2026-11-02", to: "2026-11-04" }, day)).toHaveLength(1);
  });
});
