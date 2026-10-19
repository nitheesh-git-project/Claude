// The public booking wizards' service picker, driven through a real browser.
//
// Browser-only, and deliberately so: nothing here changes a route, a request
// body or a row. `/api/appointments/create` still receives a `categoryId` and
// nothing else, and still re-derives the concern, the duration and the lead
// time from the category row. What changed is entirely what a patient reads
// and taps -- a native `<select>` of one line per option became a grid of
// cards with the clinic's own photographs -- and every regression that
// matters here is invisible to an API test:
//
//  - the dropdown coming back,
//  - `View details` opening a *second* dialog over the first, which the
//    public Modal's `backdrop-blur-sm` would position against the first
//    panel's box rather than the viewport,
//  - a cover losing its focal point between the card's 4:3 and the dialog's
//    16:9, so a photograph reads as badly cropped,
//  - the heading drifting back on top of the photograph,
//  - `Continue` being offered before a service has been chosen.
//
// Run against `next dev`, not `next start`: the public pages are ISR-cached,
// so a production server serves HTML generated before the fixtures below
// existed. `catalog-detail.spec.ts` carries the same warning.
import { test, expect, type Page } from "@playwright/test";
import { adminClient, BASE, browserCookiesFor, QA_EMAILS } from "./helpers";

const WITH_COVER = "QA Picker Covered Condition";
const NO_COVER = "QA Picker Bare Condition";

/** Deliberately off centre, and deliberately not 50/50: a focal point equal
 *  to the default proves nothing, since `object-fit: cover` centres unaided. */
const FOCAL_X = 78;
const FOCAL_Y = 24;

let coveredId = "";
let bareId = "";

test.describe("Public booking service picker", () => {
  test.beforeAll(async () => {
    const admin = adminClient();

    const { data: covered } = await admin
      .from("treatment_categories")
      .insert({
        title: WITH_COVER,
        description: "A condition seeded by the service picker spec.",
        points: ["Picker point one", "Picker point two"],
        price_paise: 133700,
        duration_minutes: 45,
        active: true,
        // A data URI rather than a real upload: this spec is about where the
        // photograph is drawn and how it is positioned, not about Storage,
        // and `catalog-cover-image.spec.ts` already covers the upload route.
        image_url:
          "data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22800%22%20height%3D%22600%22%3E%3Crect%20width%3D%22800%22%20height%3D%22600%22%20fill%3D%22%230f766e%22%2F%3E%3C%2Fsvg%3E",
        image_focal_x: FOCAL_X,
        image_focal_y: FOCAL_Y,
      })
      .select("id")
      .single();
    coveredId = covered?.id ?? "";
    expect(coveredId, "seeded covered category").not.toBe("");

    const { data: bare } = await admin
      .from("treatment_categories")
      .insert({
        title: NO_COVER,
        description: "A condition with no cover photograph yet.",
        points: ["Bare point one"],
        price_paise: 111100,
        duration_minutes: 30,
        active: true,
        image_url: null,
      })
      .select("id")
      .single();
    bareId = bare?.id ?? "";
    expect(bareId, "seeded bare category").not.toBe("");
  });

  test.afterAll(async () => {
    const admin = adminClient();
    for (const id of [coveredId, bareId].filter(Boolean)) {
      await admin.from("treatment_categories").delete().eq("id", id);
    }
  });

  test.beforeEach(async ({ page }) => {
    // Deliberately no `skipWithoutBrowserEgress`, unlike the specs that walk
    // further into these wizards. Nothing here needs the browser to reach
    // Supabase: the conditions arrive in the server render, and the picker
    // is client state over those props. The wizards do resolve their
    // signed-in state with a browser-side `auth.getUser()`, but with no
    // egress that call *rejects* rather than hanging, and both wizards then
    // carry on as a guest booking -- which is exactly the state these cases
    // drive. Skipping here would mean this spec never ran in the one
    // environment where it can.
    await page.setViewportSize({ width: 1440, height: 1000 });
  });

  /** The card carries two controls whose accessible name starts "View full
   *  details" -- the cover, labelled "View full details for <title>", and the
   *  footer button. Both open the same view; the footer one is named exactly
   *  so a locator cannot match both. */
  const DETAILS = "View full details →";

  /** Opens the picker from Step 1 and returns the dialog.
   *
   *  Two controls open it, and which one is on screen depends on whether the
   *  screen is already answered: an unchosen picker is the dashed trigger,
   *  and a chosen one offers Change. Step 1 normally opens answered, on the
   *  general consultation, so Change is the usual path -- but a project
   *  whose fallback row has been deleted opens unanswered, and this helper
   *  should not be the reason such a run fails. */
  async function openPicker(page: Page) {
    await page.goto(`${BASE}/book`);
    const change = page.getByRole("button", { name: "Change" }).first();
    const trigger = page.getByRole("button", { name: /What would you like help with/ }).first();
    await expect(change.or(trigger).first()).toBeVisible();
    await ((await change.count()) > 0 ? change : trigger).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    return dialog;
  }

  test("SP-001: neither wizard offers a native dropdown of services", async ({ page }) => {
    // The whole point of the change, and the one regression a careless
    // revert would produce. Scoped to the two public wizards; the admin
    // screens keep their selects.
    // Scoped to the wizard, not the document. The pre-launch debug bar is on
    // in every environment by design (isDebugNavVisible) and renders a
    // `<select>` page picker of its own, so a document-wide count asserts
    // something this spec never meant and fails on a correct page. Switching
    // the bar off for the suite would be worse: it ships on, so the tests
    // would stop exercising what a visitor actually gets.
    for (const path of ["/book", "/book-home-visit"]) {
      await page.goto(`${BASE}${path}`);
      await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
      await expect(page.locator("main select")).toHaveCount(0);
    }
  });

  test("SP-002: the picker opens on Step 1 and keeps the dialog contract", async ({ page }) => {
    const dialog = await openPicker(page);

    // One card per active condition, including the two seeded here.
    await expect(dialog.getByRole("heading", { name: WITH_COVER })).toBeVisible();
    await expect(dialog.getByRole("heading", { name: NO_COVER })).toBeVisible();

    // The same contract `catalog-detail.spec.ts` asserts for the marketing
    // dialogs: labelled, Close focused, background scroll locked, and on
    // Escape the lock released and focus handed back to what opened it.
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
  });

  test("SP-003: View details swaps the view inside the one dialog, and Back returns", async ({
    page,
  }) => {
    const dialog = await openPicker(page);
    const card = dialog.locator("article").filter({ hasText: WITH_COVER });
    await card.getByRole("button", { name: DETAILS }).click();

    // The assertion this case exists for. A second dialog would be measured
    // against this panel's scrolling box rather than the viewport, because
    // the public Modal is not portalled and sets `backdrop-blur-sm`.
    await expect(page.getByRole("dialog")).toHaveCount(1);
    await expect(dialog.getByText("Picker point one")).toBeVisible();

    await dialog.getByRole("button", { name: /Back to all services/ }).click();
    await expect(page.getByRole("dialog")).toHaveCount(1);
    await expect(dialog.getByRole("heading", { name: NO_COVER })).toBeVisible();
  });

  test("SP-004: nothing is laid over the photograph in the detail view", async ({ page }) => {
    const dialog = await openPicker(page);
    await dialog
      .locator("article")
      .filter({ hasText: WITH_COVER })
      .getByRole("button", { name: DETAILS })
      .click();

    // Geometric rather than by class name, so a restyle that puts the
    // heading back over the image fails even if the markup changes shape.
    // Same assertion as catalog-cover-image.spec.ts CI-009.
    const image = dialog.locator("img").first();
    const heading = dialog.getByRole("heading", { name: WITH_COVER });
    const imageBox = await image.boundingBox();
    const headingBox = await heading.boundingBox();
    expect(imageBox).not.toBeNull();
    expect(headingBox).not.toBeNull();
    expect(headingBox!.y).toBeGreaterThanOrEqual(imageBox!.y + imageBox!.height - 1);
  });

  test("SP-005: the focal point applies on the card and again in the dialog", async ({ page }) => {
    const dialog = await openPicker(page);
    const expected = `${FOCAL_X}% ${FOCAL_Y}%`;

    const cardImage = dialog
      .locator("article")
      .filter({ hasText: WITH_COVER })
      .locator("img")
      .first();
    expect(
      await cardImage.evaluate((el) => getComputedStyle(el).objectPosition)
    ).toBe(expected);

    await dialog
      .locator("article")
      .filter({ hasText: WITH_COVER })
      .getByRole("button", { name: DETAILS })
      .click();

    // The same percentages in a different aspect ratio -- 4:3 on the card,
    // 16:9 here. That is the whole reason the column is two percentages
    // rather than a crop baked into the file.
    expect(
      await dialog.locator("img").first().evaluate((el) => getComputedStyle(el).objectPosition)
    ).toBe(expected);
  });

  test("SP-006: choosing closes the dialog and the wizard states what was chosen", async ({
    page,
  }) => {
    const dialog = await openPicker(page);
    await dialog
      .locator("article")
      .filter({ hasText: WITH_COVER })
      .getByRole("button", { name: "Choose this session" })
      .click();

    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.getByRole("heading", { name: WITH_COVER })).toBeVisible();

    // And the wizard header stops saying "pricing shown once you pick a
    // concern" and starts quoting the figure, from Step 1 rather than from
    // Step 3. ₹1,337 is the seeded price.
    // Twice on purpose: the wizard header and the chosen summary card. The
    // header's line is the one that used to say "pricing shown once you pick
    // a concern", so name it rather than loosening the match.
    await expect(page.getByText("₹1,337 INR", { exact: false })).toBeVisible();
    await expect(page.getByText("₹1,337 · 45 min", { exact: false })).toBeVisible();
    await expect(
      page.getByText("pricing shown once you pick a concern", { exact: false })
    ).toHaveCount(0);
  });

  test("SP-007: a plain Book tap opens on the general consultation, changeably", async ({
    page,
  }) => {
    // Somebody who tapped "Book" named no condition, so Step 1 opens on the
    // standing fallback schema.sql keeps seeded for exactly that -- a
    // bookable session with a real price in the header, rather than an
    // unanswered control. Not the first category by display order: see
    // defaultCategoryId and its tests for why that would be a choice nobody
    // made.
    await page.goto(`${BASE}/book`);

    await expect(
      page.getByRole("heading", { name: "General Consultation" })
    ).toBeVisible();
    // The header quotes it from the first screen, rather than saying pricing
    // arrives once a concern is picked.
    await expect(
      page.getByText("pricing shown once you pick a concern", { exact: false })
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: /Continue to Medical Details/ })
    ).toBeVisible();

    // A default is only acceptable because it is one tap from being changed.
    await page.getByRole("button", { name: "Change" }).first().click();
    await page
      .getByRole("dialog")
      .locator("article")
      .filter({ hasText: WITH_COVER })
      .getByRole("button", { name: "Choose this session" })
      .click();

    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.getByRole("heading", { name: WITH_COVER })).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "General Consultation" })
    ).toHaveCount(0);
  });

  test("SP-011: the chosen service is stated on Step 2, inside the card", async ({ page }) => {
    // The regression this case exists for shipped once: Step 2 hand-rolled
    // its own version of Step 1's summary and sized the thumbnail with
    // `h-10 w-auto`, CatalogImage's own `w-full` won, and the photograph
    // stretched the full width of the row and pushed the text outside the
    // wizard card entirely. Both now render one component.
    await page.goto(`${BASE}/book`);
    await page.getByRole("button", { name: /Continue to Medical Details/ }).click();

    const summary = page.getByRole("heading", { name: "General Consultation" });
    await expect(summary).toBeVisible();
    await expect(page.getByRole("button", { name: "Change" })).toBeVisible();

    // Geometric, because the failure was a layout one: the statement has to
    // sit inside the wizard's own card, and the thumbnail has to stay a
    // thumbnail rather than filling the row.
    const card = await page.locator("div.bg-white.rounded-3xl").first().boundingBox();
    const summaryBox = await summary.boundingBox();
    const thumb = await page.locator("img").first().boundingBox();
    expect(card).not.toBeNull();
    expect(summaryBox).not.toBeNull();
    expect(thumb).not.toBeNull();
    expect(summaryBox!.x).toBeGreaterThanOrEqual(card!.x - 1);
    expect(summaryBox!.x + summaryBox!.width).toBeLessThanOrEqual(card!.x + card!.width + 1);
    expect(thumb!.width).toBeLessThan(card!.width / 3);

    // And Change goes back to the picker rather than nowhere.
    await page.getByRole("button", { name: "Change" }).click();
    await expect(
      page.getByRole("button", { name: /Continue to Medical Details/ })
    ).toBeVisible();
  });

  test("SP-013: the consent terms can be read before agreeing, and name the chosen service", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    // F-04: the checkbox asked a patient to agree to terms they had no way
    // to read, and called every service "musculoskeletal care".
    await page.goto(`${BASE}/book?category=${coveredId}`);
    await expect(page.getByRole("heading", { name: WITH_COVER })).toBeVisible();
    await page.getByRole("button", { name: /Continue to Medical Details/ }).click();

    const consent = page.getByRole("checkbox", { name: /I agree to the Consent terms/ });
    await expect(consent).toBeVisible();
    await expect(consent).toHaveAccessibleName(new RegExp(`my ${WITH_COVER} video session`));
    await expect(consent).not.toHaveAccessibleName(/musculoskeletal/i);

    const open = page.getByRole("button", { name: "Consent terms & emergency disclaimer" });
    await open.click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("heading", { name: "Consent terms & emergency disclaimer" })).toBeVisible();
    await expect(dialog).toContainText(`your ${WITH_COVER} session`);
    await expect(dialog).toContainText("Not for emergencies");
    await expect(dialog).not.toContainText(/musculoskeletal/i);

    // Reading the terms is not agreeing to them.
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(consent).not.toBeChecked();
    await expect(open).toBeFocused();
  });

  test("SP-008: a deep link lands on Step 1 with that service already chosen", async ({
    page,
  }) => {
    // The link `/conditions` and the patient dashboard's booking hub both
    // produce. What the link asked for always wins over the default SP-007
    // covers -- a condition somebody chose is not overridden by a fallback.
    await page.goto(`${BASE}/book?category=${coveredId}`);

    await expect(page.getByRole("heading", { name: WITH_COVER })).toBeVisible();
    await expect(page.getByRole("button", { name: "Change" })).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Continue to Medical Details/ })
    ).toBeVisible();
  });

  test("SP-009: the home visit states which condition it is for, with no count", async ({ page }) => {
    // The home-visit picker lists conditions now, each as one visit at its
    // home-visit price (its own, else the clinic-wide one -- global-setup
    // seeds the clinic-wide "Single Home Visit" row). A plain Book tap opens
    // on the general consultation, the same default /book uses.
    const admin = adminClient();
    const { data: general } = await admin
      .from("treatment_categories")
      .select("title")
      .eq("id", "00000000-0000-0000-0000-000000000001")
      .eq("active", true)
      .maybeSingle();
    test.skip(!general, "no general consultation in this project");

    await page.goto(`${BASE}/book-home-visit`);

    // Whatever the catalogue holds, the patient is told what the visit is
    // for before the pincode is asked for.
    const chosen = page.getByRole("heading", { name: general!.title });
    await expect(chosen).toBeVisible();
    // The seeded conditions are on offer too, so there is something to change to.
    await expect(page.getByRole("button", { name: "Change" })).toBeVisible();
    // One visit, always: no count and no days on what is for sale.
    await expect(page.getByText(/Single visit|\d+ visits\b|\bdays?\b/)).toHaveCount(0);

    // The condition is chosen above the pincode precisely because the
    // serviceable answer has to say whether travel is added on top.
    const pincode = page.getByPlaceholder("600020");
    const visitBox = await chosen.boundingBox();
    const pincodeBox = await pincode.boundingBox();
    expect(visitBox).not.toBeNull();
    expect(pincodeBox).not.toBeNull();
    expect(visitBox!.y).toBeLessThan(pincodeBox!.y);

    // And a deep link from a home-visit card lands on that condition.
    await page.goto(`${BASE}/book-home-visit?category=${coveredId}`);
    await expect(page.getByRole("heading", { name: WITH_COVER })).toBeVisible();
  });

  test("SP-010: a condition with no cover renders at the same height as one with", async ({
    page,
  }) => {
    const dialog = await openPicker(page);
    const covered = dialog.locator("article").filter({ hasText: WITH_COVER });
    const bare = dialog.locator("article").filter({ hasText: NO_COVER });

    // A card with no photograph must look like a card whose photo has not
    // been chosen yet, never like one whose image failed to load -- so the
    // frame keeps its height and the placeholder fills it.
    const coveredCover = await covered.locator("img").first().boundingBox();
    const bareCover = await bare.locator("div").first().boundingBox();
    expect(coveredCover).not.toBeNull();
    expect(bareCover).not.toBeNull();
    expect(Math.abs(coveredCover!.height - bareCover!.height)).toBeLessThan(2);

    // And it is still fully a card: its facts and its own action are there.
    await expect(bare.getByText("Bare point one")).toBeVisible();
    await expect(bare.getByRole("button", { name: "Choose this session" })).toBeVisible();
  });
  test("SP-012: the admin's Default on booking switch decides where /book opens, one at a time", async ({
    page,
    browser,
  }) => {
    test.setTimeout(90_000);
    // The owner's "General Consultation" meant their General Physiotherapy
    // consultation, so the default is an admin switch (Catalog -> Conditions)
    // rather than the seeded row: whichever service it is on, /book opens
    // there; the database keeps it to one; off everywhere opens unanswered.
    const db = adminClient();
    const before = await db.from("treatment_categories").select("id").eq("is_default", true);
    expect(before.error, "is_default is readable").toBeNull();
    const previous = (before.data?.[0]?.id as string | undefined) ?? null;
    // The admin flips the switch from their own session; the page stays an
    // anonymous visitor, which is who a booking default is for.
    const adminContext = await browser.newContext();
    await adminContext.addCookies(await browserCookiesFor(QA_EMAILS.admin));
    const setDefault = (id: string | null) =>
      adminContext.request.post(`${BASE}/api/admin/set-default-treatment-category`, { data: { id } });

    try {
      expect((await setDefault(coveredId)).status()).toBe(200);
      const after = await db.from("treatment_categories").select("id").eq("is_default", true);
      expect((after.data ?? []).map((r) => r.id)).toEqual([coveredId]);

      await page.goto(`${BASE}/book`);
      await expect(page.getByRole("heading", { name: WITH_COVER })).toBeVisible();
      await expect(page.getByRole("heading", { name: "General Consultation" })).toHaveCount(0);
      // A link that names a service still wins over the default.
      await page.goto(`${BASE}/book?category=${bareId}`);
      await expect(page.getByRole("heading", { name: NO_COVER })).toBeVisible();

      // Off everywhere: nothing is picked for a stranger.
      expect((await setDefault(null)).status()).toBe(200);
      await page.goto(`${BASE}/book`);
      await expect(page.getByRole("heading", { name: WITH_COVER })).toHaveCount(0);
      await expect(page.getByRole("heading", { name: "General Consultation" })).toHaveCount(0);

      // Refused, not half-done: a body that is not an id, and a service gone.
      expect((await setDefault(42 as unknown as string)).status()).toBe(400);
      expect((await setDefault("00000000-0000-0000-0000-00000000dead")).status()).toBe(404);
    } finally {
      await setDefault(previous);
      await adminContext.close();
    }
  });
});
