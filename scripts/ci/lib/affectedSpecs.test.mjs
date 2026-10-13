import { describe, it, expect } from "vitest";
import { ALWAYS_RUN, selectSpecs, tokensForFile, urlForAppFile } from "./affectedSpecs.mjs";

const SPECS = {
  "programme-checkout.spec.ts": 'await page.goto(`${BASE}/patient/dashboard/suggested/checkout?plan=${id}`); post(`${BASE}/api/care-plan/quote`);',
  "recommendation-course.spec.ts": 'import { programmeDisplay } from "../src/lib/programmeDisplay"; goto(`${BASE}/patient/dashboard/suggested`);',
  "booking.spec.ts": 'goto(`${BASE}/book`); post("/api/appointments/create")',
  "admin-multi-admin.spec.ts": "admin",
  "layout-audit.spec.ts": "layout",
};

describe("urlForAppFile", () => {
  it("maps pages, layouts and routes to the URL they serve", () => {
    expect(urlForAppFile("src/app/patient/dashboard/suggested/checkout/page.tsx")).toBe("/patient/dashboard/suggested/checkout");
    expect(urlForAppFile("src/app/api/care-plan/quote/route.ts")).toBe("/api/care-plan/quote");
    expect(urlForAppFile("src/app/(marketing)/team/page.tsx")).toBe("/team");
    expect(urlForAppFile("src/app/therapist/dashboard/health-profile/[id]/page.tsx")).toBe("/therapist/dashboard/health-profile");
    expect(urlForAppFile("src/lib/x.ts")).toBeNull();
  });
});

describe("tokensForFile", () => {
  it("names a module by its basename and skips generic or test files", () => {
    expect(tokensForFile("src/lib/programmeDisplay.ts")).toEqual(["programmeDisplay"]);
    expect(tokensForFile("src/components/packages/ProgrammeCheckout.tsx")).toEqual(["ProgrammeCheckout"]);
    expect(tokensForFile("src/lib/utils.ts")).toEqual([]);
    expect(tokensForFile("src/lib/promoCodes.test.ts")).toEqual([]);
    expect(tokensForFile("docs/rules/booking.md")).toEqual([]);
  });
});

describe("selectSpecs", () => {
  it("picks the specs that visit a changed page or call a changed route, plus the always-run guards", () => {
    const r = selectSpecs(["src/app/api/care-plan/quote/route.ts", "src/app/patient/dashboard/suggested/page.tsx"], SPECS);
    expect(r.specs).toEqual(["admin-multi-admin.spec.ts", "layout-audit.spec.ts", "programme-checkout.spec.ts", "recommendation-course.spec.ts"]);
    expect(r.wholeSuite).toBe(false);
  });

  it("does not let a URL match a longer one that merely starts the same way", () => {
    const r = selectSpecs(["src/app/api/appointments/create/route.ts"], { ...SPECS, "x.spec.ts": 'post("/api/appointments/create-order")' });
    expect(r.specs).toContain("booking.spec.ts");
    expect(r.specs).not.toContain("x.spec.ts");
  });

  it("picks a spec that imports a changed module, and a changed spec itself", () => {
    const r = selectSpecs(["src/lib/programmeDisplay.ts", "e2e/booking.spec.ts"], SPECS);
    expect(r.reasons["recommendation-course.spec.ts"]).toEqual(["src/lib/programmeDisplay.ts"]);
    expect(r.reasons["booking.spec.ts"]).toEqual(["spec changed"]);
  });

  it("runs the whole suite when a shared fixture changes, and flags a schema change", () => {
    const r = selectSpecs(["e2e/helpers.ts", "supabase/schema.sql"], SPECS);
    expect(r.wholeSuite).toBe(true);
    expect(r.schemaChanged).toBe(true);
    expect(r.specs).toHaveLength(Object.keys(SPECS).length);
  });

  it("always includes the guards that exist", () => {
    const r = selectSpecs(["README.md"], SPECS);
    expect(r.specs).toEqual([...ALWAYS_RUN].sort());
  });
});
