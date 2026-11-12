// The public legal pages: /privacy, /terms, /refunds, /cookies,
// /medical-disclaimer and /grievances. Content lives in
// src/lib/legal/legalDocs.ts (unit-tested there); this proves the pages
// render, the footer reaches every one, and the refund page quotes the live
// admin setting rather than a typed number. Read-only: nothing is written.
import { test, expect } from "@playwright/test";
import { BASE, adminClient, waitForSplashToClear } from "./helpers";

const PAGES = [
  { href: "/privacy", title: "Privacy policy" },
  { href: "/terms", title: "Terms of use" },
  { href: "/refunds", title: "Refunds & cancellations" },
  { href: "/cookies", title: "Cookie policy" },
  { href: "/medical-disclaimer", title: "Medical disclaimer" },
  { href: "/grievances", title: "Grievances" },
];

test("LEG-001 every legal page renders its title, date and contents list", async ({ page }) => {
  for (const { href, title } of PAGES) {
    const res = await page.goto(`${BASE}${href}`);
    expect(res?.status(), href).toBe(200);
    await waitForSplashToClear(page);
    await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
    await expect(page.getByText(/^Last updated \d{1,2} [A-Z][a-z]+ \d{4}$/)).toBeVisible();
    await expect(page.getByRole("navigation", { name: "On this page" })).toBeVisible();
    // A blank owner fact is left out, never shown as a placeholder.
    await expect(page.locator("body")).not.toContainText(/undefined|\[Company|TODO/);
  }
});

test("LEG-002 the footer links to every legal page", async ({ page }) => {
  await page.goto(`${BASE}/`);
  await waitForSplashToClear(page);
  const legal = page.getByRole("contentinfo").getByRole("navigation", { name: "Legal" });
  for (const { href } of PAGES) {
    await expect(legal.locator(`a[href="${href}"]`)).toHaveCount(1);
  }
  await legal.locator('a[href="/privacy"]').click();
  await expect(page).toHaveURL(/\/privacy$/);
});

test("LEG-003 the refund page quotes the admin's refund window", async ({ page }) => {
  const { data } = await adminClient()
    .from("site_settings")
    .select("online_cancellation_refund_hours")
    .eq("id", true)
    .single();
  const hours = data?.online_cancellation_refund_hours;
  test.skip(typeof hours !== "number" || hours <= 0, "no refund window configured");
  await page.goto(`${BASE}/refunds`);
  const n = Math.round(hours as number);
  await expect(page.getByText(`at least ${n === 1 ? "1 hour" : `${n} hours`} before`)).toBeVisible();
});
