// The Home page walkthrough's admin-configured pace
// (site_settings.journey_step_seconds).
//
// Half API, half browser, because the setting has two halves that can fail
// independently: the route has to refuse a value that would make the widget
// unreadable, and the widget has to actually run at whatever value survives.
// A rotation interval is only observable as elapsed time in a real browser,
// so the second half is browser-driven like section-nav.spec.ts.
import { test, expect, request, type Page, type APIRequestContext } from "@playwright/test";
import { BASE, QA_EMAILS, adminClient, browserCookiesFor, cookieHeaderFor } from "./helpers";

const db = adminClient();

// Restored in afterAll -- every other spec renders the home page too, and a
// leftover 0 would silently disable the rotation for the rest of the run.
const DEFAULT_SECONDS = 4;

async function setSeconds(value: number) {
  const { error } = await db
    .from("site_settings")
    .update({ journey_step_seconds: value })
    .eq("id", true);
  if (error) throw new Error(`could not set journey_step_seconds=${value}: ${error.message}`);
}

async function contextFor(email: string): Promise<APIRequestContext> {
  return request.newContext({
    baseURL: BASE,
    extraHTTPHeaders: { Cookie: await cookieHeaderFor(email) },
  });
}

function save(ctx: APIRequestContext, value: unknown) {
  return ctx.post("/api/admin/update-setting", {
    data: { key: "journey_step_seconds", value },
  });
}

async function settleScroll(page: Page) {
  let last = -1;
  for (let i = 0; i < 40; i++) {
    const y = await page.evaluate(() => Math.round(window.scrollY));
    if (y === last) return;
    last = y;
    await page.waitForTimeout(100);
  }
}

const activeTab = (page: Page) =>
  page.locator('[role="tablist"][aria-label="How the process works"] [role="tab"][aria-selected="true"]');

async function activeStep(page: Page): Promise<string> {
  return ((await activeTab(page).getAttribute("id")) ?? "").replace("journey-tab-", "");
}

// The pointer starts wherever the last action left it; the widget pauses
// under a pointer by design, so every timing check parks it in the corner
// first or measures a paused component.
async function openHome(page: Page) {
  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
  await page.mouse.move(5, 5);
  await activeTab(page).waitFor();
}

test.describe("Home walkthrough pace", () => {
  let adminCtx: APIRequestContext;
  let patientCtx: APIRequestContext;

  test.beforeAll(async () => {
    adminCtx = await contextFor(QA_EMAILS.admin);
    patientCtx = await contextFor(QA_EMAILS.patientA);
  });

  test.afterAll(async () => {
    await setSeconds(DEFAULT_SECONDS);
    await adminCtx.dispose();
    await patientCtx.dispose();
  });

  test("JP-001 rejects a value below the readable floor", async () => {
    const res = await save(adminCtx, 1);
    expect(res.status()).toBe(400);
  });

  test("JP-002 rejects a value above the ceiling", async () => {
    expect((await save(adminCtx, 61)).status()).toBe(400);
  });

  test("JP-003 rejects a fraction", async () => {
    expect((await save(adminCtx, 3.5)).status()).toBe(400);
  });

  test("JP-004 rejects a number sent as text", async () => {
    expect((await save(adminCtx, "4")).status()).toBe(400);
  });

  test("JP-005 rejects a negative", async () => {
    expect((await save(adminCtx, -1)).status()).toBe(400);
  });

  test("JP-006 accepts 0, which means do not rotate", async () => {
    expect((await save(adminCtx, 0)).ok()).toBe(true);
    const { data } = await db.from("site_settings").select("journey_step_seconds").maybeSingle();
    expect(data?.journey_step_seconds).toBe(0);
  });

  test("JP-007 accepts a value inside the range", async () => {
    expect((await save(adminCtx, 6)).ok()).toBe(true);
    const { data } = await db.from("site_settings").select("journey_step_seconds").maybeSingle();
    expect(data?.journey_step_seconds).toBe(6);
  });

  test("JP-008 a patient cannot change it", async () => {
    const res = await save(patientCtx, 30);
    expect(res.status()).toBe(403);
    const { data } = await db.from("site_settings").select("journey_step_seconds").maybeSingle();
    expect(data?.journey_step_seconds).not.toBe(30);
  });

  test("JP-009 steps advance in order at the configured pace", async ({ page }) => {
    await setSeconds(2);
    await openHome(page);

    const first = await activeStep(page);
    // Generous windows: what is under test is that it advances on roughly
    // this cadence, not the exact millisecond -- a strict bound would fail
    // on a slow CI box for reasons that have nothing to do with the setting.
    await expect
      .poll(() => activeStep(page), { timeout: 4000, intervals: [100] })
      .not.toBe(first);
    const second = await activeStep(page);
    await expect
      .poll(() => activeStep(page), { timeout: 4000, intervals: [100] })
      .not.toBe(second);
    const third = await activeStep(page);

    expect(new Set([first, second, third]).size).toBe(3);
    // ...and it wraps rather than stopping on the last step.
    await expect
      .poll(() => activeStep(page), { timeout: 4000, intervals: [100] })
      .toBe(first);
  });

  test("JP-010 does not advance faster than the configured pace", async ({ page }) => {
    await setSeconds(30);
    await openHome(page);
    const before = await activeStep(page);
    await page.waitForTimeout(6000);
    expect(await activeStep(page)).toBe(before);
  });

  test("JP-011 zero switches the rotation off entirely", async ({ page }) => {
    await setSeconds(0);
    await openHome(page);
    const before = await activeStep(page);
    await page.waitForTimeout(7000);
    expect(await activeStep(page)).toBe(before);
  });

  test("JP-012 a pointer inside the widget pauses it", async ({ page }) => {
    await setSeconds(2);
    await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
    const tablist = page.locator('[role="tablist"][aria-label="How the process works"]');
    await tablist.waitFor();
    // Settle the scroll before parking the pointer. hover() scrolls the
    // widget into view and the page keeps easing afterwards, so a pointer
    // placed immediately is left behind as the element slides out from under
    // it -- the browser then reports it as genuinely outside, and what looks
    // like a broken pause is really a moving target. A visitor hovers
    // something that has stopped moving.
    // Let the page stop moving before parking the pointer.
    //
    // globals.css sets `scroll-behavior: smooth`, and hover() scrolls the
    // element into view before placing the cursor -- so the easing carries on
    // after the pointer has been put down, and the widget slides out from
    // under it. The browser then correctly reports the pointer as outside,
    // and a working pause looks broken. A visitor hovers something that has
    // stopped moving; this waits for the same thing, on window.scrollY
    // rather than the element's own box, which plateaus mid-ease.
    await tablist.scrollIntoViewIfNeeded();
    await settleScroll(page);
    await tablist.hover();
    await settleScroll(page);
    await tablist.hover();
    const before = await activeStep(page);
    await page.waitForTimeout(6000);
    expect(await activeStep(page)).toBe(before);
  });

  test("JP-013 choosing a step restarts the clock rather than finishing the tick", async ({
    page,
  }) => {
    await setSeconds(6);
    await openHome(page);
    // Wait most of one tick, then pick a step by hand: if the running timer
    // were left alone the choice would be swapped away almost immediately.
    await page.waitForTimeout(4500);
    const tabs = page.locator('[role="tablist"][aria-label="How the process works"] [role="tab"]');
    await tabs.nth(2).click();
    await page.mouse.move(5, 5);
    expect(await activeStep(page)).toBe("recover");
    await page.waitForTimeout(3000);
    expect(await activeStep(page)).toBe("recover");
  });

  test("JP-014 never rotates under prefers-reduced-motion", async ({ browser }) => {
    await setSeconds(2);
    const ctx = await browser.newContext({ reducedMotion: "reduce" });
    const page = await ctx.newPage();
    await openHome(page);
    const before = await activeStep(page);
    await page.waitForTimeout(7000);
    expect(await activeStep(page)).toBe(before);
    await ctx.close();
  });

  // The one case that exercises the admin form itself rather than the route
  // behind it: the field has its own client-side bounds, so a form that
  // never posts (or posts the wrong key) would leave every case above green.
  test("JP-015 an admin can change it from Settings -> Public Site", async ({ browser }) => {
    await setSeconds(DEFAULT_SECONDS);
    const ctx = await browser.newContext();
    await ctx.addCookies(await browserCookiesFor(QA_EMAILS.admin));
    const page = await ctx.newPage();
    await page.goto(`${BASE}/admin/dashboard?section=settings&tab=public`, {
      waitUntil: "domcontentloaded",
    });
    const section = page.locator("div", { hasText: "Home Page Walkthrough" }).last();
    const input = section.locator('input[type="number"]');
    await input.waitFor();
    await input.fill("7");
    await section.getByRole("button", { name: "Save" }).click();
    await expect(section.getByText("Saved.")).toBeVisible({ timeout: 15000 });
    const { data } = await db.from("site_settings").select("journey_step_seconds").maybeSingle();
    expect(data?.journey_step_seconds).toBe(7);
    await ctx.close();
  });

  test("JP-016 an admin saving it is recorded in the activity log", async () => {
    expect((await save(adminCtx, 5)).ok()).toBe(true);
    const { data } = await db
      .from("admin_activity_log")
      .select("action, target_label")
      .eq("target_label", "journey_step_seconds")
      .order("created_at", { ascending: false })
      .limit(1);
    expect(data?.[0]?.action).toBe("setting.update");
  });
});
