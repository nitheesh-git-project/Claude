import { describe, expect, it } from "vitest";
import { ADMIN_SECTIONS, currentAddress } from "./adminNav";
import { ADMIN_SEARCH_TOPICS, searchAdminScreens, type AdminScreenRef } from "./adminSearchTopics";

// Built the way the shell builds it: a tab with chips lists each chip.
const all: AdminScreenRef[] = ADMIN_SECTIONS.flatMap((s) =>
  s.tabs.flatMap((t) =>
    t.subs
      ? t.subs.map((x) => ({ section: s.key, sectionLabel: s.label, tab: t.key, sub: x.key, label: `${t.label}: ${x.label}`, blurb: x.blurb }))
      : [{ section: s.key, sectionLabel: s.label, tab: t.key, label: t.label, blurb: t.blurb }]
  )
);

describe("admin search: screens and topics", () => {
  it("every topic points at a screen that exists", () => {
    // A topic written before a screen moved is found where it lives now.
    for (const t of ADMIN_SEARCH_TOPICS) {
      const where = currentAddress(t.section, t.tab) ?? { section: t.section, tab: t.tab };
      expect(all.some((s) => s.section === where.section && s.tab === where.tab), t.label).toBe(true);
    }
  });

  it("finds promo codes by the words people use, on the screen they live on", () => {
    for (const q of ["promo", "Promo code", "coupon", "discount code"]) {
      const [first] = searchAdminScreens(all, q);
      expect(first, q).toMatchObject({ label: "Promo codes", section: "money", tab: "costs", where: "Money › Costs & offers" });
    }
  });

  it("finds a screen by its own name, its section, or its description", () => {
    expect(searchAdminScreens(all, "payouts").some((r) => r.section === "money" && r.tab === "payouts")).toBe(true);
    expect(searchAdminScreens(all, "signed in as").some((r) => r.tab === "history" && r.sub === "signed-in-as")).toBe(true);
    expect(searchAdminScreens(all, "pincode")[0]).toMatchObject({ section: "catalog", tab: "areas" });
  });

  it("finds a payment by a Razorpay id's prefix", () => {
    expect(searchAdminScreens(all, "pay_TqSITHLtez0T67")[0]).toMatchObject({ section: "money", tab: "transactions", sub: "transactions" });
  });

  it("offers only screens this viewer can open, and needs two letters", () => {
    const clinical = all.filter((s) => s.section !== "money");
    expect(searchAdminScreens(clinical, "promo")).toEqual([]);
    expect(searchAdminScreens(all, "p")).toEqual([]);
  });
});
