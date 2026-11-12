// Cookie consent pop-up (src/components/system/Analytics.tsx) and the record
// it writes (/api/consent -> cookie_consents). The pop-up half needs the app
// built or started with NEXT_PUBLIC_GA_MEASUREMENT_ID set (any "G-..." value;
// Google is stubbed below, so nothing leaves the machine).
//
// What is asserted is the promise the pop-up makes: nothing optional is
// requested before a yes, Accept all and Reject all are the same size, a
// refusal sticks, it opens 2 s after load or on the first scroll and never
// by itself inside a booking, an ignored pop-up rests for a day, and the
// signed-in trees never show it.
import { test, expect, type Page } from "@playwright/test";
import { BASE, adminClient } from "./helpers";

const GA = !!process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;
const GOOGLE = /googletagmanager\.com|google-analytics\.com/;

async function watchGoogle(page: Page) {
  const hits: string[] = [];
  await page.route(GOOGLE, async (route) => {
    hits.push(route.request().url());
    await route.fulfill({ status: 200, contentType: "text/javascript", body: "" });
  });
  return hits;
}

/** Records what the page posts to /api/consent and answers it here, so the
 *  pop-up tests write no append-only rows (CC-001 covers the real write). */
async function watchRecords(page: Page) {
  const bodies: Record<string, unknown>[] = [];
  await page.route("**/api/consent", async (route) => {
    try {
      bodies.push(JSON.parse(route.request().postData() ?? "{}"));
    } catch {
      bodies.push({});
    }
    await route.fulfill({ status: 200, contentType: "application/json", body: '{"success":true}' });
  });
  return bodies;
}

const popup = (page: Page) => page.getByRole("dialog", { name: "Help us do better" });
const stored = (page: Page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem("mr_cookie_consent") ?? "null"));

test.describe("cookie consent pop-up", () => {
  test.skip(!GA, "Set NEXT_PUBLIC_GA_MEASUREMENT_ID on the app under test and on this run.");
  test.beforeEach(async ({ page }) => {
    await watchRecords(page);
  });

  test("AC-001: nothing reaches Google before a choice; it opens after load, and Accept all loads it and records the choice", async ({ page }) => {
    const hits = await watchGoogle(page);
    await page.unroute("**/api/consent");
    const records = await watchRecords(page);
    await page.goto(`${BASE}/faq`);
    await expect(popup(page)).toBeVisible({ timeout: 10_000 });
    expect(hits).toHaveLength(0);

    await popup(page).getByRole("button", { name: "Accept all" }).click();
    await expect(popup(page)).toBeHidden();
    await expect.poll(() => hits.some((u) => u.includes("gtag/js"))).toBe(true);
    expect(await stored(page)).toMatchObject({ analytics: true });
    await expect.poll(() => records.length).toBe(1);
    expect(records[0]).toMatchObject({ action: "accept_all", analytics: true, pagePath: "/faq" });
  });

  test("AC-002: Reject all is the same size as Accept all, and sticks across a reload", async ({ page }) => {
    const hits = await watchGoogle(page);
    await page.goto(`${BASE}/faq`);
    const accept = popup(page).getByRole("button", { name: "Accept all" });
    const reject = popup(page).getByRole("button", { name: "Reject all" });
    await expect(reject).toBeVisible({ timeout: 10_000 });
    // Measured once the rise-in animation (a slight scale) has settled.
    await page.waitForTimeout(800);
    const [a, r] = [await accept.boundingBox(), await reject.boundingBox()];
    expect(a && r).toBeTruthy();
    expect(Math.abs(a!.height - r!.height)).toBeLessThanOrEqual(1);
    expect(Math.abs(a!.width - r!.width)).toBeLessThanOrEqual(1);
    expect(r!.height).toBeGreaterThanOrEqual(44);

    await reject.click();
    await expect(popup(page)).toBeHidden();
    expect(await stored(page)).toMatchObject({ analytics: false, marketing: false });
    await page.reload();
    await page.waitForTimeout(3500);
    await expect(popup(page)).toBeHidden();
    expect(hits).toHaveLength(0);
  });

  test("AC-003: the first scroll opens it before the two seconds are up", async ({ page }) => {
    await watchGoogle(page);
    await page.goto(`${BASE}/faq`);
    await page.waitForLoadState("load");
    // Hydrated (the footer link's handler exists), so the scroll listener is on.
    await expect(page.getByRole("link", { name: "Cookie settings" })).toBeVisible();
    const scrolledAt = Date.now();
    await page.evaluate(() => window.scrollBy(0, 600));
    await expect(popup(page)).toBeVisible({ timeout: 1500 });
    expect(Date.now() - scrolledAt).toBeLessThan(1900);
  });

  test("AC-004: an accepted visitor sends page views from public pages only", async ({ page }) => {
    const hits = await watchGoogle(page);
    await page.addInitScript(() =>
      localStorage.setItem(
        "mr_cookie_consent",
        JSON.stringify({ version: "2026-11-12", analytics: true, marketing: false, at: Date.now() })
      )
    );
    await page.goto(`${BASE}/faq`);
    await expect.poll(() => hits.some((u) => u.includes("gtag/js"))).toBe(true);
    await expect
      .poll(() =>
        page.evaluate(() =>
          (window.dataLayer ?? []).some((e) => {
            const a = Array.from(e as ArrayLike<unknown>);
            return a[0] === "event" && a[1] === "page_view";
          })
        )
      )
      .toBe(true);
  });

  test("AC-005: Cookie settings reopens it, and switching analytics off stops tracking", async ({ page }) => {
    await watchGoogle(page);
    await page.addInitScript(() =>
      localStorage.setItem(
        "mr_cookie_consent",
        JSON.stringify({ version: "2026-11-12", analytics: true, marketing: false, at: Date.now() })
      )
    );
    await page.goto(`${BASE}/faq`);
    await page.getByRole("link", { name: "Cookie settings" }).click();
    await expect(popup(page)).toBeVisible();
    await popup(page).getByRole("button", { name: "Choose what to allow" }).click();
    const choose = page.getByRole("dialog", { name: "Choose what to allow" });
    const analytics = choose.getByRole("switch", { name: "Analytics" });
    await expect(analytics).toHaveAttribute("aria-checked", "true");
    await analytics.click();
    await choose.getByRole("button", { name: "Save my choices" }).click();
    await expect(choose).toBeHidden();
    expect(await stored(page)).toMatchObject({ analytics: false });
    expect(
      await page.evaluate(
        (id) => (window as unknown as Record<string, unknown>)[`ga-disable-${id}`],
        process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID
      )
    ).toBe(true);
  });

  test("AC-006: an earlier analytics-only answer still counts, but is asked again under the new policy", async ({ page }) => {
    const hits = await watchGoogle(page);
    await page.addInitScript(() => localStorage.setItem("mr_analytics_consent", "granted"));
    await page.goto(`${BASE}/faq`);
    // Honoured until they answer again...
    await expect.poll(() => hits.some((u) => u.includes("gtag/js"))).toBe(true);
    // ...and asked again, because it predates this policy.
    await expect(popup(page)).toBeVisible({ timeout: 10_000 });
  });

  test("AC-007: an ignored pop-up stays in its own tab, rests in new tabs for a day, then asks once more", async ({ page, context }) => {
    await watchGoogle(page);
    await page.goto(`${BASE}/faq`);
    await expect(popup(page)).toBeVisible({ timeout: 10_000 });

    const second = await context.newPage();
    await watchGoogle(second);
    await second.goto(`${BASE}/faq`);
    await second.waitForTimeout(3500);
    await expect(popup(second)).toBeHidden();

    await second.evaluate(() =>
      localStorage.setItem("mr_cookie_asked_at", String(Date.now() - 25 * 60 * 60 * 1000))
    );
    const third = await context.newPage();
    await watchGoogle(third);
    await third.goto(`${BASE}/faq`);
    await expect(popup(third)).toBeVisible({ timeout: 10_000 });
  });

  test("AC-008: it never opens by itself inside a booking", async ({ page }) => {
    await watchGoogle(page);
    await page.goto(`${BASE}/book`);
    await page.waitForTimeout(3500);
    await page.mouse.wheel(0, 400);
    await page.waitForTimeout(500);
    await expect(popup(page)).toBeHidden();
  });

  for (const path of ["/admin/login", "/patient/login", "/therapist/login", "/hospital/login"]) {
    test(`AC-009: ${path} never shows it`, async ({ page }) => {
      await watchGoogle(page);
      await page.goto(`${BASE}${path}`);
      await page.waitForTimeout(3500);
      await expect(popup(page)).toBeHidden();
    });
  }
});

// The record. Runs without GA: the route is there either way. Writes
// append-only rows, so only on a disposable project.
test.describe("cookie consent record", () => {
  test.skip(
    process.env.E2E_ALLOW_APPEND_ONLY_WRITES !== "1" && process.env.CI_LOCAL_STACK !== "1",
    "writes append-only cookie_consents rows; set E2E_ALLOW_APPEND_ONLY_WRITES=1 on a disposable project"
  );

  test("CC-001: /api/consent refuses a malformed or self-contradicting body, and records a valid one", async ({ request }) => {
    const bad = await request.post(`${BASE}/api/consent`, {
      headers: { "Content-Type": "application/json" },
      data: "{not json",
    });
    expect(bad.status()).toBe(400);

    const visitorId = crypto.randomUUID();
    const contradicting = await request.post(`${BASE}/api/consent`, {
      data: { visitorId, analytics: true, marketing: false, action: "reject_all", policyVersion: "2026-11-12", pagePath: "/" },
    });
    expect(contradicting.status()).toBe(400);

    const ok = await request.post(`${BASE}/api/consent`, {
      data: { visitorId, analytics: true, marketing: false, action: "accept_all", policyVersion: "2026-11-12", pagePath: "/faq?x=1" },
    });
    expect(ok.status()).toBe(200);

    const { data, error } = await adminClient()
      .from("cookie_consents")
      .select("action, analytics, marketing, page_path, user_id")
      .eq("visitor_id", visitorId);
    expect(error).toBeNull();
    expect(data).toEqual([
      { action: "accept_all", analytics: true, marketing: false, page_path: "/faq", user_id: null },
    ]);
  });

  test("CC-002: a recorded choice cannot be edited or deleted", async ({ request }) => {
    const visitorId = crypto.randomUUID();
    const ok = await request.post(`${BASE}/api/consent`, {
      data: { visitorId, analytics: false, marketing: false, action: "reject_all", policyVersion: "2026-11-12", pagePath: "/" },
    });
    expect(ok.status()).toBe(200);
    const db = adminClient();
    const upd = await db.from("cookie_consents").update({ analytics: true }).eq("visitor_id", visitorId);
    expect(upd.error?.message ?? "").toMatch(/append-only/);
    const del = await db.from("cookie_consents").delete().eq("visitor_id", visitorId);
    expect(del.error?.message ?? "").toMatch(/append-only/);
  });
});
