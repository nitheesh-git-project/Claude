// DARK: the app follows the device's light/dark setting -- only when an
// admin has switched it on (Settings -> Public Site -> Appearance).
//
// The switch is flipped through /api/admin/update-setting, not straight in
// the database: that route revalidates the root layout, which is where the
// head script that decides light or dark is rendered.
import { test, expect, type APIRequestContext, type Page } from "@playwright/test";
import { BASE, QA_EMAILS, adminClient, browserCookiesFor, cookieHeaderFor } from "./helpers";

const SHOT = "/tmp/claude-0/-home-user-Claude/92352852-44c7-581f-b775-ee8d1b4f4c9d/scratchpad/shots";
const LIGHT_PAGE = "rgb(248, 250, 252)";
const DARK_PAGE = "rgb(11, 18, 32)";

async function setFollow(request: APIRequestContext, value: boolean) {
  const res = await request.post(`${BASE}/api/admin/update-setting`, {
    headers: { cookie: await cookieHeaderFor(QA_EMAILS.admin), "content-type": "application/json" },
    data: { key: "follow_device_theme", value },
  });
  expect(res.status(), await res.text()).toBe(200);
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

test.describe("dark mode follows the device", () => {
  let before = false;
  test.beforeAll(async () => {
    const { data } = await adminClient().from("site_settings").select("follow_device_theme").maybeSingle();
    before = (data as { follow_device_theme?: boolean } | null)?.follow_device_theme === true;
  });
  test.afterAll(async ({ request }) => {
    await setFollow(request, before);
  });

  test("DARK-001: with the switch off, a dark device still gets the light app", async ({ browser, request }) => {
    await setFollow(request, false);
    const ctx = await browser.newContext({ colorScheme: "dark" });
    const page = await ctx.newPage();
    await page.goto(`${BASE}/patient/login`);
    const l = await looks(page);
    expect(l.theme).toBe("light");
    expect(l.page).toBe(LIGHT_PAGE);
    expect(l.card).toBe("rgb(255, 255, 255)");
    await ctx.close();
  });

  test("DARK-002: with the switch on, the app is dark on a dark device and light on a light one", async ({
    browser,
    request,
  }) => {
    await setFollow(request, true);

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

  test("DARK-003: it follows the device live, and printing stays light", async ({ browser, request }) => {
    await setFollow(request, true);
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

  test("DARK-004: the admin switch lives on Settings -> Public Site and saves", async ({ browser, request }) => {
    test.setTimeout(180_000);
    await setFollow(request, false);
    const ctx = await browser.newContext();
    await ctx.addCookies(await browserCookiesFor(QA_EMAILS.admin));
    const page = await ctx.newPage();
    await page.goto(`${BASE}/admin/dashboard?section=settings&tab=public`);
    const toggle = page.getByRole("switch", { name: "Follow the device's light/dark setting" });
    await toggle.scrollIntoViewIfNeeded();
    await expect(toggle).toHaveAttribute("aria-checked", "false");
    await toggle.click();
    await expect(page.getByText("Following the device: dark for dark devices, light for light ones.")).toBeVisible();
    await expect.poll(async () => {
      const { data } = await adminClient().from("site_settings").select("follow_device_theme").maybeSingle();
      return (data as { follow_device_theme?: boolean } | null)?.follow_device_theme;
    }).toBe(true);
    await page.getByRole("switch", { name: "Follow the device's light/dark setting" }).screenshot({ path: `${SHOT}/dark-switch.png` }).catch(() => {});
    await ctx.close();
  });
});
