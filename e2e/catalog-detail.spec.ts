// The public catalog's detail dialogs -- session packages, home-visit
// packages and programmes -- driven through a real browser.
//
// Browser-only, like admin-dashboard-ui.spec.ts and section-nav.spec.ts:
// what is under test is a dialog's accessibility contract and whether the
// booking route survives the redesign, neither of which is visible from the
// API. The booking links are the money-critical part here -- a card that
// opens a dialog instead of navigating is exactly the change that can
// silently drop the `?package=` / `?category=` parameter the booking wizard
// reads.
import { test, expect, type Page } from "@playwright/test";
import { adminClient, BASE } from "./helpers";

const CATEGORY_TITLE = "QA Detail Programme";
const PACKAGE_TITLE = "QA Detail Package";

let categoryId = "";
let packageId = "";

test.describe("Catalog detail dialogs", () => {
  test.beforeAll(async () => {
    // Seeded here rather than in global-setup because these two rows are
    // only this spec's business, and they are removed again in afterAll so
    // the QA project's catalog is left as it was found.
    const admin = adminClient();

    const { data: category } = await admin
      .from("treatment_categories")
      .insert({
        title: CATEGORY_TITLE,
        description: "A programme seeded by the catalog detail spec.",
        points: ["First point", "Second point"],
        price_paise: 120000,
        duration_minutes: 60,
        active: true,
      })
      .select("id")
      .single();
    categoryId = category?.id ?? "";
    expect(categoryId, "seeded category").not.toBe("");

    const { data: pkg } = await admin
      .from("treatment_category_packages")
      .insert({
        category_id: categoryId,
        title: PACKAGE_TITLE,
        session_count: 4,
        price_paise: 400000,
        compare_at_paise: 480000,
        promises: ["Promise one", "Promise two"],
        description: "Long-form package copy the card has no room for.",
        terms: "Seeded terms.",
        active: true,
        visible_on_home: true,
        visible_on_conditions: true,
      })
      .select("id")
      .single();
    packageId = pkg?.id ?? "";
    expect(packageId, "seeded package").not.toBe("");

    await admin.from("site_settings").update({ session_packages_visible: true }).not("id", "is", null);
  });

  test.afterAll(async () => {
    const admin = adminClient();
    if (packageId) await admin.from("treatment_category_packages").delete().eq("id", packageId);
    if (categoryId) await admin.from("treatment_categories").delete().eq("id", categoryId);
  });

  test.beforeEach(async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 1440, height: 1000 });
  });

  // The dialog contract, asserted once per card type: opening one labels it,
  // moves focus to Close, and locks background scroll; Escape closes it,
  // releases the lock and hands focus back to the card that opened it.
  async function assertDialogContract(page: Page, cardText: string, expectedTitle: string) {
    await page.getByText(cardText, { exact: false }).first().click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("heading", { name: expectedTitle })).toBeVisible();
    await expect(page.getByRole("button", { name: /^Close/ })).toBeFocused();
    expect(await page.evaluate(() => document.body.style.overflow)).toBe("hidden");

    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    expect(await page.evaluate(() => document.body.style.overflow)).not.toBe("hidden");
    expect(
      await page.evaluate(
        () => document.activeElement?.getAttribute("aria-haspopup") === "dialog"
      )
    ).toBe(true);
  }

  test("CD-001: a package card opens its dialog and honours the dialog contract", async ({
    page,
  }) => {
    await page.goto(`${BASE}/`);
    await assertDialogContract(page, PACKAGE_TITLE, PACKAGE_TITLE);
  });

  test("CD-002: a programme card opens its dialog on both pages that show it", async ({
    page,
  }) => {
    for (const path of ["/", "/conditions"]) {
      await page.goto(`${BASE}${path}`);
      await assertDialogContract(page, CATEGORY_TITLE, CATEGORY_TITLE);
    }
  });

  test("CD-003: a home-visit package card opens its dialog", async ({ page }) => {
    // Seeded by global-setup, which the whole suite already depends on.
    await page.goto(`${BASE}/home-visit`);
    await assertDialogContract(page, "4-Visit Home Recovery Programme", "4-Visit Home Recovery Programme");
  });

  test("CD-004: a programme card sells a first session, never the programme", async ({
    page,
  }) => {
    await page.goto(`${BASE}/`);

    // The checkout link is gone from the card and from the dialog. This is
    // the assertion that would catch the consultation-first cutover being
    // partially reverted -- a card that still linked to package checkout
    // would take money for something the server now refuses.
    await expect(page.locator(`a[href*="/book?package="]`)).toHaveCount(0);

    const cardProgramme = page.locator(`a[href="/book?category=${categoryId}"]`);
    await expect(cardProgramme.first()).toBeVisible();

    await page.getByText(PACKAGE_TITLE, { exact: false }).first().click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.locator(`a[href*="/book?package="]`)).toHaveCount(0);
    await expect(dialog.getByRole("link", { name: /Book a first session/i })).toBeVisible();
  });

  test("CD-005: the dialog's book button starts a first session", async ({ page }) => {
    await page.goto(`${BASE}/`);
    await page.getByText(PACKAGE_TITLE, { exact: false }).first().click();
    await page.getByRole("dialog").getByRole("link", { name: /Book a first session/i }).click();
    // The destination is the plain booking page, carrying no package id --
    // asserted on the URL rather than on the wizard's contents, because the
    // wizard resolves the signed-in role against Supabase from the browser
    // and that egress is not available in every environment this suite runs
    // in (see AGENTS.md).
    await page.waitForURL(/\/book(\?|$)/);
    expect(new URL(page.url()).searchParams.get("package")).toBeNull();
  });

  test("CD-007: a stale programme link explains itself instead of selling one session", async ({
    page,
  }) => {
    // Links outlive features -- an old email, a bookmark, a printed card.
    // Silently selling a single session to somebody who came to buy six is
    // the one outcome a removed checkout must not produce.
    await page.goto(`${BASE}/book?package=${packageId}`);
    await expect(page.getByText(/Programmes come from your therapist now/i)).toBeVisible();
    await expect(page.getByRole("link", { name: /Book a first session/i })).toBeVisible();
    // No payment control anywhere on that screen.
    await expect(page.getByRole("button", { name: /Pay /i })).toHaveCount(0);
  });

  test("CD-006: the dialog carries the detail the card leaves out", async ({ page }) => {
    await page.goto(`${BASE}/`);
    await page.getByText(PACKAGE_TITLE, { exact: false }).first().click();
    const dialog = page.getByRole("dialog");
    // Long description and terms exist only in the dialog -- the card shows
    // neither, which is the whole reason the dialog exists.
    await expect(dialog).toContainText("Long-form package copy");
    await expect(dialog).toContainText("Seeded terms.");
    // 4 sessions at ₹4,000 against a ₹4,800 compare-at is a 17% saving.
    await expect(dialog).toContainText("Save 17%");
  });

  test("CD-007: a backdrop click closes the dialog", async ({ page }) => {
    await page.goto(`${BASE}/`);
    await page.getByText(PACKAGE_TITLE, { exact: false }).first().click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.mouse.click(12, 12);
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });
});
