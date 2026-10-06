import { describe, expect, it } from "vitest";
import { isBookBarRoute, isDeveloperRoute, isNavHiddenRoute } from "./dashboardShellRoutes";

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

describe("the /dashboard hop", () => {
  it("hides the public chrome while it resolves, like the dashboards it leads to", () => {
    expect(isNavHiddenRoute("/dashboard")).toBe(true);
    expect(isNavHiddenRoute("/dashboards")).toBe(false);
    expect(isNavHiddenRoute("/how-it-works")).toBe(false);
  });
});

describe("isBookBarRoute", () => {
  it("shows on the marketing pages, Mission included", () => {
    for (const p of ["/", "/conditions", "/how-it-works", "/home-visit", "/team", "/mission", "/faq", "/hospitals"]) {
      expect(isBookBarRoute(p), p).toBe(true);
    }
  });
  it("stays off the pages that are already a task", () => {
    for (const p of [
      "/get-started",
      "/book",
      "/book-home-visit",
      "/patient/login",
      "/patient/register",
      "/patient/dashboard",
      "/admin/dashboard",
      "/developer",
      "/reset-password",
    ]) {
      expect(isBookBarRoute(p), p).toBe(false);
    }
    expect(isBookBarRoute(null)).toBe(false);
  });
});
