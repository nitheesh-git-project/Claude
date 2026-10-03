import { describe, expect, it } from "vitest";
import { isDeveloperRoute, isNavHiddenRoute } from "./dashboardShellRoutes";

describe("isDeveloperRoute", () => {
  it("matches the developer pages and nothing that merely starts the same", () => {
    expect(isDeveloperRoute("/developer")).toBe(true);
    expect(isDeveloperRoute("/developer/lets-talk")).toBe(true);
    expect(isDeveloperRoute("/developers")).toBe(false);
    expect(isDeveloperRoute("/faq")).toBe(false);
    expect(isDeveloperRoute(null)).toBe(false);
  });

  it("hides the Navbar on them", () => {
    expect(isNavHiddenRoute("/developer")).toBe(true);
    expect(isNavHiddenRoute("/developer/lets-talk")).toBe(true);
    expect(isNavHiddenRoute("/faq")).toBe(false);
  });
});
