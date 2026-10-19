// The public catalog's detail dialogs -- conditions online and as a home
// visit -- driven through a real browser.
//
// Session programmes are no longer advertised publicly at all: a course of
// treatment is a clinical recommendation, so the pages quote a first
// consultation and nothing multi-session. Several tests here therefore
// assert an absence, and the seeded package below exists so that absence is
// tested against a row that genuinely could have rendered.
//
// Browser-only, like admin-dashboard-ui.spec.ts and section-nav.spec.ts:
// what is under test is a dialog's accessibility contract and whether the
// booking route survives the redesign, neither of which is visible from the
// API. The booking links are the money-critical part here -- a card that
// opens a dialog instead of navigating is exactly the change that can
// silently drop the `?category=` parameter both booking wizards read.
import { test, expect, type Page } from "@playwright/test";
import { adminClient, BASE } from "./helpers";

const CATEGORY_TITLE = "QA Detail Programme";
const PACKAGE_TITLE = "QA Detail Package";
const FIXTURE_MINUTES = 35;

let categoryId = "";
let packageId = "";
/** Which categories the clinic had ticked before this spec ran, so they can
 *  be put back. See the beforeAll note. */
let previouslyFeatured: string[] = [];

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
        // Deliberately not 60: the pages used to print a fixed "60-minute",
        // and a fixture at 60 would let CD-009 pass against that bug.
        duration_minutes: FIXTURE_MINUTES,
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
        active: true,
      })
      .select("id")
      .single();
    packageId = pkg?.id ?? "";
    expect(packageId, "seeded package").not.toBe("");

    // The home page leads with four featured conditions now
    // (`pickFeatured`), not every active one -- so a freshly seeded category
    // does not appear on `/` at all unless it is one of the four, and three
    // cases below open its dialog there. `pickFeatured` takes the first
    // `FEATURED_LIMIT` of the ticked rows, so ticking a fifth is not enough:
    // the fixture has to be the only one ticked while this spec runs.
    //
    // Which four an admin has chosen is their data, not the product's
    // behaviour, so the spec sets the state it needs and puts back exactly
    // what it found -- the same posture as the two rows it deletes in
    // afterAll.
    const { data: featured } = await admin
      .from("treatment_categories")
      .select("id")
      .eq("featured", true);
    previouslyFeatured = (featured ?? []).map((r) => r.id as string);
    if (previouslyFeatured.length) {
      await admin
        .from("treatment_categories")
        .update({ featured: false })
        .in("id", previouslyFeatured);
    }
    await admin.from("treatment_categories").update({ featured: true }).eq("id", categoryId);
  });

  test.afterAll(async () => {
    const admin = adminClient();
    if (packageId) await admin.from("treatment_category_packages").delete().eq("id", packageId);
    if (categoryId) await admin.from("treatment_categories").delete().eq("id", categoryId);
    // Put the clinic's own choice back. Deleting the fixture above already
    // removes its tick; this restores the four that were unticked for it,
    // and runs even when a case above failed.
    if (previouslyFeatured.length) {
      await admin
        .from("treatment_categories")
        .update({ featured: true })
        .in("id", previouslyFeatured);
    }
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

  test("CD-001: no session programme is advertised on any public page", async ({ page }) => {
    // The seeded package is active and visible on both flags, so if any
    // public page still rendered the catalogue this would find it. That is
    // the point: an absence tested against a row that could have appeared.
    for (const path of ["/", "/conditions"]) {
      await page.goto(`${BASE}${path}`);
      await expect(page.getByText(PACKAGE_TITLE, { exact: false })).toHaveCount(0);
      // Nor its price, which is the specific thing a visitor was shopping
      // from before this changed.
      await expect(page.getByText("₹4,000", { exact: false })).toHaveCount(0);
    }
  });

  test("CD-002: a programme card opens its dialog on both pages that show it", async ({
    page,
  }) => {
    for (const path of ["/", "/conditions"]) {
      await page.goto(`${BASE}${path}`);
      await assertDialogContract(page, CATEGORY_TITLE, CATEGORY_TITLE);
    }
  });

  test("CD-003: a condition's home visit opens its dialog; no programme and no count", async ({
    page,
  }) => {
    // /home-visit lists conditions, each as one visit at its home-visit
    // price -- the seeded condition has no own price, so it shows the
    // clinic-wide one global-setup seeds. Neither the price row's own title
    // nor the four-visit programme is a card: one is a price, the other a
    // recommendation.
    await page.goto(`${BASE}/home-visit`);
    await expect(
      page.getByText("4-Visit Home Recovery Programme", { exact: false })
    ).toHaveCount(0);
    await expect(page.getByText("Single Home Visit", { exact: false })).toHaveCount(0);
    await expect(page.getByText(/Single visit|\d+ visits\b/)).toHaveCount(0);
    await assertDialogContract(page, CATEGORY_TITLE, CATEGORY_TITLE);
  });

  test("CD-004: a programme card sells a first session, never a course of them", async ({
    page,
  }) => {
    await page.goto(`${BASE}/`);

    // The assertion that would catch the consultation-first cutover being
    // partially reverted -- any link to package checkout would take money
    // for something the server now refuses.
    await expect(page.locator(`a[href*="/book?package="]`)).toHaveCount(0);

    const cardProgramme = page.locator(`a[href="/book?category=${categoryId}"]`);
    await expect(cardProgramme.first()).toBeVisible();

    // And inside the programme's own dialog, where the price list of
    // courses used to sit under "Where this usually leads".
    await page.getByText(CATEGORY_TITLE, { exact: false }).first().click();
    const dialog = page.getByRole("dialog");
    // Asserted open before anything is asserted absent. Every check below is
    // a toHaveCount(0), which a dialog that never opened satisfies perfectly
    // -- and that is not hypothetical: this case stayed green through a card
    // whose title had stopped opening its dialog at all, while five of its
    // neighbours failed.
    await expect(dialog).toBeVisible();
    await expect(dialog.locator(`a[href*="/book?package="]`)).toHaveCount(0);
    await expect(dialog.getByText(PACKAGE_TITLE, { exact: false })).toHaveCount(0);
  });

  test("CD-005: the home-visit dialog's book button opens the wizard on that condition", async ({
    page,
  }) => {
    await page.goto(`${BASE}/home-visit`);
    await page.getByText(CATEGORY_TITLE, { exact: false }).first().click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    // One visit, said as one visit: no count, no validity, no days.
    await expect(dialog).not.toContainText(/\d+ visits\b|\bdays?\b|Single visit/);
    await dialog.getByRole("link", { name: /Book a home visit/i }).click();
    // Asserted on the URL rather than on the wizard's contents, because the
    // wizard resolves the signed-in role against Supabase from the browser
    // and that egress is not available in every environment this suite runs
    // in (see AGENTS.md). The condition travels as `?category=`; the server
    // prices it again at checkout.
    await page.waitForURL(/\/book-home-visit(\?|$)/);
    expect(new URL(page.url()).searchParams.get("category")).toBe(categoryId);
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
    await page.getByText(CATEGORY_TITLE, { exact: false }).first().click();
    const dialog = page.getByRole("dialog");
    // The long description and the bullet points exist only in the dialog;
    // the card shows a one-line summary, which is the whole reason the
    // dialog exists.
    await expect(dialog).toContainText("A programme seeded by the catalog detail spec.");
    await expect(dialog).toContainText("Second point");
  });

  test("CD-009: card and dialog quote the category's own length, never a fixed one", async ({
    page,
  }) => {
    // F-01: the dialog promised "the same 60-minute assessment" while the
    // card, /book and checkout said the category's own length. Every length
    // on these surfaces is now read from duration_minutes.
    await page.goto(`${BASE}/conditions`);
    const card = page.getByText(CATEGORY_TITLE, { exact: false }).first();
    await card.click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText(`${FIXTURE_MINUTES} minutes, 1-on-1`);
    await expect(dialog).toContainText(
      `Every programme opens with an assessment - ${FIXTURE_MINUTES} minutes, one-to-one.`
    );
    await expect(dialog).not.toContainText(/60[- ]minute/);
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    // Nowhere on the page claims a fixed 60 while a category says otherwise.
    await expect(page.getByText(/Same 60-minute assessment/)).toHaveCount(0);
  });

  test("CD-010: the FAQ's home-visit answer is built from the live service areas", async ({
    page,
  }) => {
    // F-05: staging's FAQ quoted 600020 and ₹499 + ₹100 travel while the
    // catalog said 600017 and ₹1,500 + ₹150. /faq now carries an answer
    // built from home_visit_areas (global-setup serves 600017, Chennai),
    // naming cities and pointing to the pincode check -- never a figure.
    const { data: areas } = await adminClient()
      .from("home_visit_areas")
      .select("city")
      .eq("active", true);
    const city = (areas ?? []).map((a) => a.city as string).find(Boolean);
    expect(city, "an active service area").toBeTruthy();

    await page.goto(`${BASE}/faq`);
    await page.getByRole("searchbox", { name: /Search frequently asked questions/ }).fill(
      "home visits in my area"
    );
    const question = page.getByRole("button", {
      name: "Do you do home visits in my area, and what do they cost?",
    });
    await expect(question).toBeVisible();
    if ((await question.getAttribute("aria-expanded")) !== "true") await question.click();
    const answer = page.getByText(/Home visits are currently available in parts of/);
    await expect(answer).toBeVisible();
    await expect(answer).toContainText(city!);
    await expect(answer).not.toContainText(/\b\d{6}\b|₹/);
  });

  test("CD-008: a backdrop click closes the dialog", async ({ page }) => {
    await page.goto(`${BASE}/`);
    await page.getByText(CATEGORY_TITLE, { exact: false }).first().click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.mouse.click(12, 12);
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });
});
