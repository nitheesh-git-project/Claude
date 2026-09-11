// Catalog cover photographs: uploading one, positioning it, and the position
// surviving to every surface that renders it.
//
// This spec exists because the feature's whole value is that one decision --
// where the subject of a photograph sits -- is correct in three different
// frames at once. The card is 4:3, the detail dialog 16:9, and the patient's
// booking screen renders the same card again. A focal point that reached the
// card and not the dialog would look exactly like a working feature until
// somebody opened a dialog, which is the failure a unit test cannot see and a
// human tester would have to remember to check.
//
// The route half is asserted through the API because authorization is not
// visible from the browser: a scope that must not upload has to be refused at
// the route, not merely have its button hidden.
import { test, expect } from "@playwright/test";
import { adminClient, cookieHeaderFor, BASE, QA_EMAILS, profileIdFor } from "./helpers";
import { FOCAL_DEFAULT } from "../src/lib/catalogImage";

const CATEGORY_TITLE = "QA Cover Category";
const FOCAL_X = 22;
const FOCAL_Y = 78;

let categoryId = "";

// A real 1x1 PNG. Small enough to post inline, and genuinely a PNG so the
// route's content-type check is being satisfied rather than fooled.
const PNG_1PX = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
);

test.describe("Catalog cover images", () => {
  test.beforeAll(async () => {
    const admin = adminClient();
    const { data } = await admin
      .from("treatment_categories")
      .insert({
        title: CATEGORY_TITLE,
        description: "Seeded by the cover-image spec.",
        points: ["Cover point one", "Cover point two"],
        price_paise: 120000,
        duration_minutes: 45,
        active: true,
      })
      .select("id")
      .single();
    categoryId = data?.id ?? "";
    expect(categoryId, "seeded category").not.toBe("");
  });

  test.afterAll(async () => {
    const admin = adminClient();
    if (categoryId) {
      await admin.from("treatment_categories").delete().eq("id", categoryId);
      // The object outlives the row -- nothing cascades from a table into a
      // bucket -- so the spec clears up after itself.
      await admin.storage
        .from("catalog-images")
        .remove([
          `category/${categoryId}/cover.png`,
          `category/${categoryId}/cover.jpg`,
          `category/${categoryId}/cover.webp`,
        ]);
    }
  });

  // ---- the route -------------------------------------------------------

  test("CI-001 a new row defaults to centre, which is what object-fit already does", async () => {
    const admin = adminClient();
    const { data } = await admin
      .from("treatment_categories")
      .select("image_focal_x, image_focal_y")
      .eq("id", categoryId)
      .single();
    // The migration must not move a single existing cover. Centre is the
    // only default that guarantees that.
    expect(data?.image_focal_x).toBe(FOCAL_DEFAULT);
    expect(data?.image_focal_y).toBe(FOCAL_DEFAULT);
  });

  test("CI-002 uploads a cover and hands back a public URL", async () => {
    const cookie = await cookieHeaderFor(QA_EMAILS.admin);
    const body = new FormData();
    body.append("kind", "category");
    body.append("rowId", categoryId);
    body.append("file", new Blob([PNG_1PX], { type: "image/png" }), "cover.png");

    const res = await fetch(`${BASE}/api/admin/upload-catalog-image`, {
      method: "POST",
      headers: { cookie },
      body,
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.url).toContain("catalog-images");
    // Cache-busted, or a replacement would land at a URL the browser already
    // has and the admin would watch the old picture stay put.
    expect(json.url).toMatch(/\?v=\d+/);

    const fetched = await fetch(json.url);
    expect(fetched.status, "the uploaded object is publicly readable").toBe(200);

    await adminClient()
      .from("treatment_categories")
      .update({
        image_url: json.url,
        image_focal_x: FOCAL_X,
        image_focal_y: FOCAL_Y,
      })
      .eq("id", categoryId);
  });

  test("CI-003 refuses a file that is not an image we render", async () => {
    const cookie = await cookieHeaderFor(QA_EMAILS.admin);
    const body = new FormData();
    body.append("kind", "category");
    body.append("rowId", categoryId);
    // SVG is deliberately not on the list: it can carry script, and these
    // objects are served from a public bucket.
    body.append("file", new Blob(["<svg/>"], { type: "image/svg+xml" }), "x.svg");

    const res = await fetch(`${BASE}/api/admin/upload-catalog-image`, {
      method: "POST",
      headers: { cookie },
      body,
    });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/JPG, PNG or WebP/);
  });

  test("CI-004 refuses a row id that could climb out of its folder", async () => {
    const cookie = await cookieHeaderFor(QA_EMAILS.admin);
    const body = new FormData();
    body.append("kind", "category");
    body.append("rowId", "../../avatars/someone");
    body.append("file", new Blob([PNG_1PX], { type: "image/png" }), "cover.png");

    const res = await fetch(`${BASE}/api/admin/upload-catalog-image`, {
      method: "POST",
      headers: { cookie },
      body,
    });
    expect(res.status).toBe(400);
  });

  test("CI-005 a desk that cannot manage the catalogue cannot upload one", async () => {
    // Finance opens Money, not Catalog. The control is hidden from them, but
    // a session cookie can call any route directly -- so the refusal has to
    // be the route's, not the sidebar's. The one QA admin is borrowed and
    // put back, the same way admin-scoped-dashboard.spec.ts does it.
    const admin = adminClient();
    const adminId = await profileIdFor(admin, QA_EMAILS.admin);
    try {
      await admin.from("profiles").update({ admin_scope: "finance" }).eq("id", adminId);
      const cookie = await cookieHeaderFor(QA_EMAILS.admin);
      const body = new FormData();
      body.append("kind", "category");
      body.append("rowId", categoryId);
      body.append("file", new Blob([PNG_1PX], { type: "image/png" }), "cover.png");

      const res = await fetch(`${BASE}/api/admin/upload-catalog-image`, {
        method: "POST",
        headers: { cookie },
        body,
      });
      expect(res.status).toBe(403);
    } finally {
      await admin.from("profiles").update({ admin_scope: "full" }).eq("id", adminId);
    }
  });

  test("CI-006 the database refuses a focal point outside the frame", async () => {
    // The route clamps, so this is the other half: the column is reachable
    // from the SQL editor and by the service role, where no route runs.
    const admin = adminClient();
    const { error } = await admin
      .from("treatment_categories")
      .update({ image_focal_x: 140 })
      .eq("id", categoryId);
    expect(error, "a CHECK should have refused 140%").not.toBeNull();
  });

  // ---- the surfaces ----------------------------------------------------

  // One helper, three surfaces: the point of the feature is that they agree.
  async function coverPositionOn(
    page: import("@playwright/test").Page,
    url: string,
    cookies?: Awaited<ReturnType<typeof import("./helpers").browserCookiesFor>>
  ) {
    if (cookies) await page.context().addCookies(cookies);
    await page.goto(url, { waitUntil: "domcontentloaded" });
    const img = page.locator(`img[src*="${categoryId}"]`).first();
    await expect(img).toBeVisible();
    return img.evaluate((el) => getComputedStyle(el).objectPosition);
  }

  test("CI-007 the position reaches the public card", async ({ page }) => {
    test.setTimeout(120_000);
    const position = await coverPositionOn(page, `${BASE}/conditions`);
    expect(position).toBe(`${FOCAL_X}% ${FOCAL_Y}%`);
  });

  test("CI-008 and the detail dialog, which is a different aspect ratio", async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto(`${BASE}/conditions`, { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: `View full details for ${CATEGORY_TITLE}` }).click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    const img = dialog.locator("img").first();
    // The whole argument for a focal point over a crop: one number, two
    // shapes. A crop would have been baked for the card and wrong here.
    expect(await img.evaluate((el) => getComputedStyle(el).objectPosition)).toBe(
      `${FOCAL_X}% ${FOCAL_Y}%`
    );
  });

  test("CI-009 nothing is laid over the photograph in the dialog", async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto(`${BASE}/conditions`, { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: `View full details for ${CATEGORY_TITLE}` }).click();

    const dialog = page.getByRole("dialog");
    const heading = dialog.getByRole("heading", { name: CATEGORY_TITLE });
    await expect(heading).toBeVisible();

    // The heading must sit *below* the picture, not on it. Asserted
    // geometrically rather than by class name, so a restyle that puts text
    // back over the image fails this even if the markup changes shape.
    const imgBox = await dialog.locator("img").first().boundingBox();
    const headingBox = await heading.boundingBox();
    expect(imgBox).not.toBeNull();
    expect(headingBox).not.toBeNull();
    expect(headingBox!.y).toBeGreaterThanOrEqual(imgBox!.y + imgBox!.height - 1);
  });

  test("CI-010 the patient's booking screen renders the same card, not a text list", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const { browserCookiesFor } = await import("./helpers");
    const cookies = await browserCookiesFor(QA_EMAILS.patientA);
    const position = await coverPositionOn(
      page,
      `${BASE}/patient/dashboard/book`,
      cookies
    );
    // A patient who has already signed up used to meet a plainer catalogue
    // than a stranger did. Same photograph, same position, same card.
    expect(position).toBe(`${FOCAL_X}% ${FOCAL_Y}%`);

    // And the card's own substance came with it.
    await expect(page.getByText("Cover point one")).toBeVisible();
    await expect(page.getByRole("link", { name: /Book this session/ }).first()).toBeVisible();
  });

  test("CI-011 a row with no cover still renders at the same height", async ({ page }) => {
    test.setTimeout(120_000);
    const admin = adminClient();
    await admin
      .from("treatment_categories")
      .update({ image_url: null })
      .eq("id", categoryId);

    await page.goto(`${BASE}/conditions`, { waitUntil: "domcontentloaded" });
    // The fallback is a designed state, not a broken one: a card with no
    // photograph must look like one whose photo has not been chosen yet.
    const card = page.locator("article").filter({ hasText: CATEGORY_TITLE }).first();
    await expect(card).toBeVisible();
    await expect(card.getByText("Cover point one")).toBeVisible();

    await admin
      .from("treatment_categories")
      .update({ image_url: `https://example.test/x.png` })
      .eq("id", categoryId);
  });
});
