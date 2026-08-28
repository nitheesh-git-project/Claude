// The brand splash: what a visitor sees for the first second or two of a
// cold open, what they don't see the rest of the time, and what the admin
// can change about it (site_settings.splash_*).
//
// Half browser, half API, like journey-pace.spec.ts. Every timing rule is
// only observable as elapsed time in a real browser; the route's bounds are
// only observable from an admin request. Both halves can fail
// independently, so both are covered.
import { test, expect, request, type APIRequestContext, type Page } from "@playwright/test";
import { BASE, QA_EMAILS, adminClient, cookieHeaderFor } from "./helpers";

const db = adminClient();

// What the columns default to (schema.sql / splashScreen.ts). Restored in
// afterAll: every other browser spec loads these pages too, and a leftover
// "switched off" would quietly make this suite's coverage meaningless on
// the next run.
const DEFAULTS = {
  splash_enabled: true,
  // Blank is the shipped state: the splash follows the site name.
  splash_brand_line: "",
  splash_phrase: "Movement Is Medicine",
  splash_hold_seconds: 1.5,
  splash_revisit_minutes: 15,
};

const HIDDEN_AT_KEY = "dpp.splash.hiddenAt";

async function setSplash(values: Partial<typeof DEFAULTS>) {
  const { error } = await db.from("site_settings").update(values).eq("id", true);
  if (error) throw new Error(`could not update splash settings: ${error.message}`);
}

async function adminContext(): Promise<APIRequestContext> {
  return request.newContext({
    baseURL: BASE,
    extraHTTPHeaders: { Cookie: await cookieHeaderFor(QA_EMAILS.admin) },
  });
}

const splashState = (page: Page) =>
  page.evaluate(() => document.documentElement.getAttribute("data-splash"));

// Waits for the greeting to be completely gone rather than sleeping out its
// nominal duration: the timers start when the component mounts, which under
// `next dev` can be several hundred ms after domcontentloaded, and a fixed
// sleep then reads a frame mid-fade and fails a working splash.
const settle = (page: Page) =>
  page.waitForFunction(() => !document.documentElement.hasAttribute("data-splash"), null, {
    timeout: 15_000,
  });

// Fakes a tab going away and coming back. visibilityState is read-only, so
// it is redefined for the page; the component reads it on every event, so
// this exercises the real handler rather than a test-only branch.
async function leaveAndReturn(page: Page, awayMs: number) {
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await page.evaluate(
    ([key, ms]) => sessionStorage.setItem(key as string, String(Date.now() - (ms as number))),
    [HIDDEN_AT_KEY, awayMs] as const
  );
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));
  });
}

test.describe("brand splash", () => {
  test.beforeAll(async () => {
    await setSplash(DEFAULTS);
  });
  test.afterAll(async () => {
    await setSplash(DEFAULTS);
  });

  test("SP-001 covers the site on a cold open, then hands it back", async ({ page }) => {
    await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });

    // Set by the inline boot script, so it is true at first paint — the
    // greeting is never seen arriving on top of a page already on screen.
    expect(await splashState(page)).toBe("on");
    await expect(page.getByText(DEFAULTS.splash_phrase)).toBeVisible();

    await settle(page);

    // Attribute gone, not merely transparent: that is what returns the
    // sheet to visibility:hidden so it stops swallowing clicks.
    expect(await splashState(page)).toBeNull();
    await expect(page.locator(".splash-screen")).toBeHidden();
    expect(await page.evaluate(() => getComputedStyle(document.body).overflow)).not.toBe("hidden");
  });

  test("SP-002 stays quiet on a reload of the same tab", async ({ page }) => {
    await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
    await settle(page);

    await page.reload({ waitUntil: "domcontentloaded" });
    expect(await splashState(page)).toBeNull();
  });

  test("SP-003 replays only after the configured time away", async ({ page }) => {
    await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
    await settle(page);

    // A minute away is someone fetching an OTP or approving a UPI payment
    // in their bank's app. Splashing over a checkout in progress is the one
    // thing this must never do.
    await leaveAndReturn(page, 60_000);
    expect(await splashState(page)).toBeNull();

    await leaveAndReturn(page, (DEFAULTS.splash_revisit_minutes + 1) * 60_000);
    expect(await splashState(page)).toBe("on");
    await settle(page);
  });

  test("SP-004 does not run at all under reduced motion", async ({ browser }) => {
    const context = await browser.newContext({ reducedMotion: "reduce" });
    const page = await context.newPage();
    await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });

    // Decoration over content that is already rendered, so the honest
    // answer to "don't animate" is not to show it rather than to snap it.
    expect(await splashState(page)).toBeNull();
    await expect(page.locator(".splash-screen")).toBeHidden();
    await context.close();
  });

  test("SP-005 honours the admin's wording, hold and off switch", async ({ page }) => {
    await setSplash({ splash_phrase: "Care that meets you at home", splash_hold_seconds: 0.6 });
    await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
    await expect(page.getByText("Care that meets you at home")).toBeVisible();
    await settle(page);

    // Off means the overlay is not in the page at all, and neither is the
    // script that would paint it — not merely hidden by CSS.
    await setSplash({ splash_enabled: false });
    const fresh = await page.context().browser()?.newContext();
    if (!fresh) throw new Error("no browser context");
    const offPage = await fresh.newPage();
    await offPage.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
    expect(await splashState(offPage)).toBeNull();
    await expect(offPage.locator(".splash-screen")).toHaveCount(0);
    await fresh.close();
  });

  test("SP-006 names the site by default and the override when set", async ({ page }) => {
    const { data: brand } = await db.from("site_settings").select("site_name").maybeSingle();
    const siteName = brand?.site_name ?? "";
    expect(siteName).not.toBe("");

    // Blank override: the greeting and the navbar say the same thing, which
    // is what stops the two drifting apart on their own.
    await setSplash({ splash_brand_line: "" });
    await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
    await expect(page.locator(".splash-screen__brand")).toHaveText(siteName);
    await settle(page);

    await setSplash({ splash_brand_line: "Pooja Physiotherapy Clinic" });
    const fresh = await page.context().browser()?.newContext();
    if (!fresh) throw new Error("no browser context");
    const overridden = await fresh.newPage();
    await overridden.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
    await expect(overridden.locator(".splash-screen__brand")).toHaveText(
      "Pooja Physiotherapy Clinic"
    );
    await fresh.close();
    await setSplash({ splash_brand_line: "" });
  });

  test("SP-007 zero minutes means first load only", async ({ page }) => {
    await setSplash({ splash_revisit_minutes: 0 });
    await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
    await settle(page);

    // No length of absence earns a replay at 0 — the admin has said "greet
    // the first load of a tab and nothing else".
    await leaveAndReturn(page, 24 * 60 * 60_000);
    expect(await splashState(page)).toBeNull();
  });

  test("SP-008 the route refuses values the splash could not honour", async () => {
    const ctx = await adminContext();
    const post = (key: string, value: unknown) =>
      ctx.post("/api/admin/update-setting", { data: { key, value } });

    // Too quick to read, and long enough to feel like a hang.
    expect((await post("splash_hold_seconds", 0.1)).status()).toBe(400);
    expect((await post("splash_hold_seconds", 30)).status()).toBe(400);
    // A blank line leaves a full screen of teal that reads as a failed
    // load; switching the splash off is the way to have no greeting.
    expect((await post("splash_phrase", "   ")).status()).toBe(400);
    expect((await post("splash_phrase", "x".repeat(200))).status()).toBe(400);
    expect((await post("splash_revisit_minutes", -1)).status()).toBe(400);
    expect((await post("splash_revisit_minutes", 4.5)).status()).toBe(400);
    expect((await post("splash_enabled", "yes")).status()).toBe(400);
    expect((await post("splash_brand_line", "x".repeat(200))).status()).toBe(400);
    // Blank is how an admin *undoes* the override, so it must be accepted
    // here even though every other text setting refuses an empty string.
    expect((await post("splash_brand_line", "  ")).status()).toBe(200);

    // And accepts the values in range, writing them where the layout reads.
    expect((await post("splash_hold_seconds", 2)).status()).toBe(200);
    expect((await post("splash_phrase", "Movement Is Medicine")).status()).toBe(200);
    const { data } = await db
      .from("site_settings")
      .select("splash_hold_seconds, splash_phrase")
      .maybeSingle();
    expect(Number(data?.splash_hold_seconds)).toBe(2);
    expect(data?.splash_phrase).toBe("Movement Is Medicine");
    await ctx.dispose();
  });
});
