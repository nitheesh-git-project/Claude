// Settings -> Public Site can hide What We Promise, What We Will Not Do and
// Testimonials without deleting them, and each switch asks first. Restores
// every switch it touches.
import { test, expect } from "@playwright/test";
import { BASE, QA_EMAILS, adminClient, browserCookiesFor, cookieHeaderFor } from "./helpers";

const COLUMNS = ["promises_section_visible", "limits_section_visible", "testimonials_section_visible"] as const;

async function readSwitches() {
  const { data } = await adminClient().from("site_settings").select(COLUMNS.join(", ")).limit(1).single();
  return data as unknown as Record<(typeof COLUMNS)[number], boolean>;
}
async function setSwitch(column: (typeof COLUMNS)[number], value: unknown) {
  return fetch(`${BASE}/api/admin/update-setting`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: await cookieHeaderFor(QA_EMAILS.admin) },
    body: JSON.stringify({ key: column, value }),
  });
}

test.describe("public section switches", () => {
  test.setTimeout(180_000);
  let before: Record<(typeof COLUMNS)[number], boolean>;
  test.beforeAll(async () => {
    before = await readSwitches();
  });
  test.afterAll(async () => {
    for (const c of COLUMNS) await setSwitch(c, before[c] ?? true);
  });

  test("PSV-001: hiding What We Will Not Do asks first, and Our Mission drops the band", async ({ browser, page }) => {
    await setSwitch("limits_section_visible", true);
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await ctx.addCookies(await browserCookiesFor(QA_EMAILS.admin));
    const admin = await ctx.newPage();
    await admin.goto(`${BASE}/admin/dashboard?section=settings&tab=public`);
    const card = admin.getByTestId("section-visibility-limits");
    await expect(card).toBeVisible({ timeout: 60_000 });
    const toggle = card.getByRole("switch", { name: "Show What We Will Not Do on the website" });
    await expect(toggle).toHaveAttribute("aria-checked", "true");

    // No changes nothing.
    await toggle.click();
    await admin.getByRole("alertdialog").getByRole("button", { name: "Keep it shown" }).click();
    await admin.waitForTimeout(1_000);
    expect((await readSwitches()).limits_section_visible).toBe(true);

    await toggle.click();
    await admin.getByRole("alertdialog").getByRole("button", { name: "Hide it" }).click();
    await expect.poll(async () => (await readSwitches()).limits_section_visible, { timeout: 15_000 }).toBe(false);
    await expect(toggle).toHaveAttribute("aria-checked", "false");
    await ctx.close();

    await page.goto(`${BASE}/mission`);
    await expect(page.locator("#what-we-promise")).toBeVisible();
    await expect(page.locator("#what-we-wont-do")).toHaveCount(0);
  });

  test("PSV-002: hiding What We Promise takes it off the home page and Our Mission; the route takes only a boolean", async ({
    page,
  }) => {
    expect((await setSwitch("promises_section_visible", "no")).status).toBe(400);
    expect((await setSwitch("promises_section_visible", false)).status).toBe(200);
    await page.goto(`${BASE}/mission`);
    await expect(page.locator("#what-we-promise")).toHaveCount(0);
    await expect(page.locator('a[href^="/mission#"]')).toHaveCount(0);

    expect((await setSwitch("promises_section_visible", true)).status).toBe(200);
    await page.goto(`${BASE}/mission`);
    await expect(page.locator("#what-we-promise")).toBeVisible();
  });
});
