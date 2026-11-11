import { describe, expect, it } from "vitest";
import { ADMIN_SECTIONS } from "./adminNav";
import { ADMIN_SEARCH_TOPICS, searchAdminScreens, type AdminScreenRef } from "./adminSearchTopics";

const all: AdminScreenRef[] = ADMIN_SECTIONS.flatMap((s) =>
  s.tabs.map((t) => ({ section: s.key, sectionLabel: s.label, tab: t.key, label: t.label, blurb: t.blurb }))
);

describe("admin search: screens and topics", () => {
  it("every topic points at a screen that exists", () => {
    const keys = new Set(all.map((s) => `${s.section}:${s.tab}`));
    for (const t of ADMIN_SEARCH_TOPICS) expect(keys.has(`${t.section}:${t.tab}`), t.label).toBe(true);
  });

  it("finds promo codes by the words people use, on the screen they live on", () => {
    for (const q of ["promo", "Promo code", "coupon", "discount code"]) {
      const [first] = searchAdminScreens(all, q);
      expect(first, q).toMatchObject({ label: "Promo codes", section: "money", tab: "costs", where: "Money › Costs" });
    }
  });

  it("finds a screen by its own name, its section, or its description", () => {
    expect(searchAdminScreens(all, "payouts").some((r) => r.section === "money" && r.tab === "payouts")).toBe(true);
    expect(searchAdminScreens(all, "signed in as").some((r) => r.tab === "signed-in-as")).toBe(true);
    expect(searchAdminScreens(all, "pincode")[0]).toMatchObject({ section: "catalog", tab: "areas" });
  });

  it("finds a payment by a Razorpay id's prefix", () => {
    expect(searchAdminScreens(all, "pay_TqSITHLtez0T67")[0]).toMatchObject({ section: "money", tab: "transactions" });
  });

  it("offers only screens this viewer can open, and needs two letters", () => {
    const clinical = all.filter((s) => s.section !== "money");
    expect(searchAdminScreens(clinical, "promo")).toEqual([]);
    expect(searchAdminScreens(all, "p")).toEqual([]);
  });
});
