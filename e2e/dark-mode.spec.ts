// DARK: Settings -> Public Site -> Appearance -- always light, always dark,
// or each visitor's device (site_settings.site_theme, deviceTheme.ts).
//
// The mode is set through /api/admin/update-setting, not straight in the
// database: that route revalidates the root layout, which is where the head
// script that decides light or dark is rendered.
import { test, expect, type APIRequestContext, type Page } from "@playwright/test";
import { BASE, QA_EMAILS, adminClient, browserCookiesFor, cookieHeaderFor } from "./helpers";

const SHOT = "/tmp/claude-0/-home-user-Claude/92352852-44c7-581f-b775-ee8d1b4f4c9d/scratchpad/shots";
const LIGHT_PAGE = "rgb(248, 250, 252)";
const DARK_PAGE = "rgb(11, 18, 32)";

async function setMode(request: APIRequestContext, value: "light" | "dark" | "device") {
  const res = await request.post(`${BASE}/api/admin/update-setting`, {
    headers: { cookie: await cookieHeaderFor(QA_EMAILS.admin), "content-type": "application/json" },
    data: { key: "site_theme", value },
  });
  expect(res.status(), await res.text()).toBe(200);
}

async function readTheme() {
  const { data } = await adminClient().from("site_settings").select("site_theme, follow_device_theme").maybeSingle();
  return data as { site_theme: string | null; follow_device_theme: boolean } | null;
}

async function looks(page: Page) {
  return page.evaluate(() => {
    const card = document.querySelector("form")?.closest(".bg-white") as HTMLElement | null;
    const button = document.querySelector('form button[type="submit"]') as HTMLElement | null;
    return {
      theme: document.documentElement.dataset.theme ?? "light",
      page: getComputedStyle(document.body).backgroundColor,
      card: card ? getComputedStyle(card).backgroundColor : null,
      buttonBg: button ? getComputedStyle(button).backgroundColor : null,
      buttonText: button ? getComputedStyle(button).color : null,
    };
  });
}

test.describe.configure({ mode: "serial" });

test.describe("appearance: light, dark, or the device", () => {
  let before: { site_theme: string | null; follow_device_theme: boolean } | null = null;
  test.beforeAll(async () => {
    before = await readTheme();
  });
  test.afterAll(async ({ request }) => {
    const restore = (before?.site_theme ?? (before?.follow_device_theme ? "device" : "light")) as "light" | "dark" | "device";
    await setMode(request, restore);
    // Exactly as found, including "nobody has picked yet" (null).
    await adminClient()
      .from("site_settings")
      .update({ site_theme: before?.site_theme ?? null, follow_device_theme: before?.follow_device_theme ?? false })
      .eq("id", true);
  });

  test("DARK-001: Light is light even on a dark device", async ({ browser, request }) => {
    await setMode(request, "light");
    const ctx = await browser.newContext({ colorScheme: "dark" });
    const page = await ctx.newPage();
    await page.goto(`${BASE}/patient/login`);
    const l = await looks(page);
    expect(l.theme).toBe("light");
    expect(l.page).toBe(LIGHT_PAGE);
    expect(l.card).toBe("rgb(255, 255, 255)");
    await ctx.close();
  });

  test("DARK-002: Based on the device, the app is dark on a dark device and light on a light one", async ({
    browser,
    request,
  }) => {
    await setMode(request, "device");

    const dark = await browser.newContext({ colorScheme: "dark" });
    const page = await dark.newPage();
    await page.goto(`${BASE}/patient/login`);
    const d = await looks(page);
    expect(d.theme).toBe("dark");
    expect(d.page).toBe(DARK_PAGE);
    expect(d.card).toBe("rgb(17, 26, 46)");
    await page.screenshot({ path: `${SHOT}/dark-login.png` });
    await dark.close();

    const light = await browser.newContext({ colorScheme: "light" });
    const lp = await light.newPage();
    await lp.goto(`${BASE}/patient/login`);
    const l = await looks(lp);
    expect(l.theme).toBe("light");
    expect(l.page).toBe(LIGHT_PAGE);
    await light.close();

    // The brand button keeps its exact teal in both, and its white text
    // stays white -- the one class name means the same fill either way.
    expect(d.buttonBg).not.toBeNull();
    expect(d.buttonBg).toBe(l.buttonBg);
    expect(d.buttonText).toBe("rgb(255, 255, 255)");
  });

  test("DARK-003: Based on the device, it follows the device live, and printing stays light", async ({ browser, request }) => {
    await setMode(request, "device");
    const ctx = await browser.newContext({ colorScheme: "light" });
    const page = await ctx.newPage();
    await page.goto(`${BASE}/patient/login`);
    expect((await looks(page)).theme).toBe("light");

    // The device switches while the page is open: no reload.
    await page.emulateMedia({ colorScheme: "dark" });
    await expect.poll(async () => (await looks(page)).page).toBe(DARK_PAGE);
    await page.emulateMedia({ colorScheme: "light" });
    await expect.poll(async () => (await looks(page)).page).toBe(LIGHT_PAGE);

    // A dark screen still prints on white paper.
    await page.emulateMedia({ colorScheme: "dark", media: "print" });
    await expect.poll(async () => (await looks(page)).theme).toBe("dark");
    expect((await looks(page)).page).toBe(LIGHT_PAGE);
    await ctx.close();
  });

  test("DARK-005: Dark is dark even on a light device, from the first paint", async ({ browser, request }) => {
    await setMode(request, "dark");
    const ctx = await browser.newContext({ colorScheme: "light" });
    const page = await ctx.newPage();
    await page.goto(`${BASE}/patient/login`);
    const d = await looks(page);
    expect(d.theme).toBe("dark");
    expect(d.page).toBe(DARK_PAGE);
    // The device changing changes nothing.
    await page.emulateMedia({ colorScheme: "light" });
    await page.waitForTimeout(500);
    expect((await looks(page)).page).toBe(DARK_PAGE);
    await ctx.close();
  });

  test("DARK-004: Settings -> Public Site offers the three, each with a preview, and saves the one picked", async ({
    browser,
    request,
  }) => {
    test.setTimeout(180_000);
    await setMode(request, "light");
    const ctx = await browser.newContext();
    await ctx.addCookies(await browserCookiesFor(QA_EMAILS.admin));
    const page = await ctx.newPage();
    await page.goto(`${BASE}/admin/dashboard?section=settings&tab=public`);
    const group = page.getByRole("radiogroup", { name: "Appearance" });
    await group.scrollIntoViewIfNeeded();
    await expect(group.getByRole("radio")).toHaveCount(3);
    await expect(group.getByRole("radio", { name: /Light/ })).toHaveAttribute("aria-checked", "true");

    await group.getByRole("radio", { name: /^Dark/ }).click();
    await expect.poll(async () => (await readTheme())?.site_theme).toBe("dark");
    expect((await readTheme())?.follow_device_theme).toBe(false);

    await group.getByRole("radio", { name: /visitor's device/ }).click();
    await expect.poll(async () => (await readTheme())?.site_theme).toBe("device");
    // The old switch is kept meaning the same thing.
    expect((await readTheme())?.follow_device_theme).toBe(true);
    await group.screenshot({ path: `${SHOT}/appearance-three.png` }).catch(() => {});
    await ctx.close();
  });
});
