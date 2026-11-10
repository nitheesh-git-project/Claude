import { test, expect, type APIRequestContext, type Browser, type Page } from "@playwright/test";
import {
  BASE,
  QA_EMAILS,
  adminClient,
  browserCookiesFor,
  cookieHeaderFor,
  markDashboardTourSeen,
  profileIdFor,
  rlsClientFor,
  waitForSplashToClear,
} from "./helpers";

/**
 * Announcements (a banner an admin puts on top of the patient, therapist and
 * hospital dashboards, with a pop-up behind it) and the notebook (every
 * account's private diary).
 *
 * The rules are unit-tested where they live (src/lib/announcements.test.ts,
 * src/lib/notebook.test.ts, src/lib/richText.test.ts). What needs a server
 * and a browser is the part nothing else can see: that a published row
 * really lands on the right role's dashboard and no other's, that closing
 * one sticks for that person only, that the pop-up draws the admin's table
 * and button, and that a notebook page written by one account cannot be
 * read by another -- or by an admin.
 *
 * Every announcement here carries the `[e2e]` title prefix and is removed
 * afterwards; the notebook cases write only to the two QA patients' own
 * notebooks, which are emptied before and after.
 */

const PREFIX = "[e2e]";

const BODY_WITH_TABLE = {
  type: "doc",
  content: [
    { type: "paragraph", content: [{ type: "text", text: "Timings change this week." }] },
    {
      type: "table",
      content: [
        {
          type: "tableRow",
          content: [
            { type: "tableHeader", content: [{ type: "paragraph", content: [{ type: "text", text: "Day" }] }] },
            { type: "tableHeader", content: [{ type: "paragraph", content: [{ type: "text", text: "Video" }] }] },
          ],
        },
        {
          type: "tableRow",
          content: [
            { type: "tableCell", content: [{ type: "paragraph", content: [{ type: "text", text: "Friday" }] }] },
            { type: "tableCell", content: [{ type: "paragraph", content: [{ type: "text", text: "10 AM to 4 PM" }] }] },
          ],
        },
      ],
    },
  ],
};

async function asAdmin(request: APIRequestContext, path: string, data: unknown) {
  return request.post(`${BASE}${path}`, {
    headers: { cookie: await cookieHeaderFor(QA_EMAILS.admin) },
    data,
  });
}

async function publish(request: APIRequestContext, overrides: Record<string, unknown>): Promise<string> {
  const res = await asAdmin(request, "/api/admin/announcements", {
    title: `${PREFIX} Festival timings`,
    audiences: ["patient", "therapist"],
    body: BODY_WITH_TABLE,
    ctaLabel: "Book a session",
    ctaTargets: {
      patient: { kind: "screen", key: "book" },
      therapist: { kind: "screen", key: "availability" },
    },
    durationMinutes: 60,
    dismissible: true,
    autoOpen: false,
    publish: true,
    ...overrides,
  });
  expect(res.status(), await res.text()).toBe(200);
  return ((await res.json()) as { id: string }).id;
}

async function pageFor(browser: Browser, email: string, viewport = { width: 1280, height: 800 }): Promise<Page> {
  const context = await browser.newContext({ viewport });
  await context.addCookies(await browserCookiesFor(email));
  return context.newPage();
}

async function clearFixtures() {
  const admin = adminClient();
  await admin.from("announcements").delete().like("title", `${PREFIX}%`);
  for (const email of [QA_EMAILS.patientA, QA_EMAILS.patientB]) {
    const id = await profileIdFor(admin, email);
    await admin.from("notebook_pages").delete().eq("user_id", id);
  }
}

test.describe("announcements and the notebook", () => {
  test.describe.configure({ mode: "serial" });
  test.setTimeout(180_000);

  test.beforeAll(async () => {
    await clearFixtures();
    for (const email of [QA_EMAILS.patientA, QA_EMAILS.patientB, QA_EMAILS.therapistA, QA_EMAILS.hospital]) {
      await markDashboardTourSeen(email);
    }
  });

  test.afterAll(async () => {
    await clearFixtures();
  });

  test("ANN-001: only an admin may publish, and what cannot work is refused", async ({ request }) => {
    const asPatient = await request.post(`${BASE}/api/admin/announcements`, {
      headers: { cookie: await cookieHeaderFor(QA_EMAILS.patientA) },
      data: { title: `${PREFIX} not allowed`, audiences: ["patient"], durationMinutes: 60 },
    });
    expect(asPatient.status()).toBe(403);

    const anonymous = await request.post(`${BASE}/api/admin/announcements`, {
      data: { title: `${PREFIX} not allowed`, audiences: ["patient"], durationMinutes: 60 },
    });
    expect(anonymous.status()).toBe(403);

    const noAudience = await asAdmin(request, "/api/admin/announcements", {
      title: `${PREFIX} nobody`,
      audiences: [],
      durationMinutes: 60,
    });
    expect(noAudience.status()).toBe(400);
    expect(((await noAudience.json()) as { error: string }).error).toMatch(/at least one dashboard/i);

    // A button needs somewhere real to go for every dashboard it is shown on.
    const badLink = await asAdmin(request, "/api/admin/announcements", {
      title: `${PREFIX} bad link`,
      audiences: ["patient"],
      ctaLabel: "Open",
      ctaTargets: { patient: { kind: "web", url: "http://insecure.example.test" } },
      durationMinutes: 60,
    });
    expect(badLink.status()).toBe(400);
    expect(((await badLink.json()) as { error: string }).error).toMatch(/https/i);

    const wrongScreen = await asAdmin(request, "/api/admin/announcements", {
      title: `${PREFIX} wrong screen`,
      audiences: ["therapist"],
      ctaLabel: "Open",
      // A patient screen is not a place a therapist's button may lead.
      ctaTargets: { therapist: { kind: "screen", key: "book" } },
      durationMinutes: 60,
    });
    expect(wrongScreen.status()).toBe(400);

    const noEnd = await asAdmin(request, "/api/admin/announcements", {
      title: `${PREFIX} for ever`,
      audiences: ["patient"],
    });
    expect(noEnd.status()).toBe(400);

    const { count } = await adminClient()
      .from("announcements")
      .select("id", { count: "exact", head: true })
      .like("title", `${PREFIX}%`);
    expect(count).toBe(0);
  });

  test("ANN-002: a published announcement is on its roles' dashboards, with its pop-up, and on no other role's", async ({
    browser,
    request,
  }) => {
    await publish(request, {});

    const patient = await pageFor(browser, QA_EMAILS.patientA);
    await patient.goto(`${BASE}/patient/dashboard`);
    const banner = patient.getByTestId("announcement-banner").first();
    await expect(banner).toBeVisible({ timeout: 60_000 });
    await expect(banner).toContainText("Festival timings");
    await waitForSplashToClear(patient);
    await patient.screenshot({ path: "e2e/screenshots/announcements/patient-banner-desktop.png" });

    await banner.click();
    const dialog = patient.getByTestId("announcement-dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("heading", { name: /Festival timings/ })).toBeVisible();
    // The admin's table arrives as a table, header row and all.
    await expect(dialog.getByRole("columnheader", { name: "Video" })).toBeVisible();
    await expect(dialog.getByRole("cell", { name: "10 AM to 4 PM" })).toBeVisible();
    const cta = dialog.getByTestId("announcement-dialog-cta");
    await expect(cta).toHaveText(/Book a session/);
    await expect(cta).toHaveAttribute("href", "/patient/dashboard/book");
    await patient.screenshot({ path: "e2e/screenshots/announcements/patient-popup-desktop.png" });

    // Escape closes it, and focus goes back to the banner that opened it.
    await patient.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);

    // On another screen it is one line, not a banner.
    await patient.goto(`${BASE}/patient/dashboard/book`);
    await expect(patient.getByTestId("announcement-strip")).toContainText("Festival timings", { timeout: 60_000 });
    await expect(patient.getByTestId("announcement-bar")).toHaveCount(0);
    await patient.context().close();

    // The therapist's button leads to a therapist screen.
    const therapist = await pageFor(browser, QA_EMAILS.therapistA);
    await therapist.goto(`${BASE}/therapist/dashboard`);
    await therapist.getByTestId("announcement-banner").first().click({ timeout: 60_000 });
    await expect(therapist.getByTestId("announcement-dialog-cta")).toHaveAttribute(
      "href",
      "/therapist/dashboard/availability"
    );
    await therapist.context().close();

    // Not ticked for hospitals, so not on a hospital's dashboard.
    const hospital = await pageFor(browser, QA_EMAILS.hospital);
    await hospital.goto(`${BASE}/hospital/dashboard`);
    await expect(hospital.getByRole("heading", { level: 1 })).toBeVisible({ timeout: 60_000 });
    await expect(hospital.getByTestId("announcement-bar")).toHaveCount(0);
    await expect(hospital.getByTestId("notebook-button")).toBeVisible();
    await hospital.context().close();
  });

  test("ANN-003: closing a banner sticks for that person, and only for them", async ({ browser }) => {
    const patient = await pageFor(browser, QA_EMAILS.patientA, { width: 390, height: 844 });
    await patient.goto(`${BASE}/patient/dashboard`);
    await expect(patient.getByTestId("announcement-banner").first()).toBeVisible({ timeout: 60_000 });
    await waitForSplashToClear(patient);
    await patient.screenshot({ path: "e2e/screenshots/announcements/patient-banner-phone.png" });
    await patient.getByTestId("announcement-close").first().click();
    await expect(patient.getByTestId("announcement-bar")).toHaveCount(0);

    // Straight away, before the close has been recorded: it stays closed.
    await patient.reload();
    await expect(patient.getByRole("heading", { level: 1 })).toBeVisible({ timeout: 60_000 });
    await expect(patient.getByTestId("announcement-bar")).toHaveCount(0);

    // And once recorded it is closed for the account, not just this tab: a
    // fresh browser with the same sign-in does not show it either.
    const patientId = await profileIdFor(adminClient(), QA_EMAILS.patientA);
    await expect
      .poll(async () => {
        const { data } = await adminClient()
          .from("announcement_receipts")
          .select("dismissed_at")
          .eq("user_id", patientId)
          .maybeSingle();
        return !!data?.dismissed_at;
      })
      .toBe(true);
    await patient.context().close();
    const patient2 = await pageFor(browser, QA_EMAILS.patientA);
    await patient2.goto(`${BASE}/patient/dashboard`);
    await expect(patient2.getByRole("heading", { level: 1 })).toBeVisible({ timeout: 60_000 });
    await expect(patient2.getByTestId("announcement-bar")).toHaveCount(0);
    await patient2.context().close();

    // Somebody else's banner is untouched.
    const other = await pageFor(browser, QA_EMAILS.patientB);
    await other.goto(`${BASE}/patient/dashboard`);
    await expect(other.getByTestId("announcement-banner").first()).toBeVisible({ timeout: 60_000 });
    await other.context().close();
  });

  test("ANN-004: a notice that cannot be closed has no close button, and its pop-up opens once by itself", async ({
    browser,
    request,
  }) => {
    await adminClient().from("announcements").delete().like("title", `${PREFIX}%`);
    const id = await publish(request, {
      title: `${PREFIX} Clinic closed tomorrow`,
      audiences: ["patient"],
      ctaLabel: "",
      ctaTargets: {},
      dismissible: false,
      autoOpen: true,
    });

    const patient = await pageFor(browser, QA_EMAILS.patientB);
    await patient.goto(`${BASE}/patient/dashboard`);
    const dialog = patient.getByTestId("announcement-dialog");
    await expect(dialog).toBeVisible({ timeout: 60_000 });
    await expect(dialog.getByRole("heading", { name: /Clinic closed tomorrow/ })).toBeVisible();
    await expect(dialog.getByTestId("announcement-dialog-cta")).toHaveCount(0);
    await dialog.getByRole("button", { name: "Close" }).click();
    await expect(dialog).toHaveCount(0);
    await expect(patient.getByTestId("announcement-banner").first()).toBeVisible();
    await expect(patient.getByTestId("announcement-close")).toHaveCount(0);

    // Once is once: the next visit shows the banner and leaves the pop-up shut.
    await expect
      .poll(async () => {
        const { data } = await adminClient()
          .from("announcement_receipts")
          .select("popup_seen_at")
          .eq("announcement_id", id)
          .maybeSingle();
        return !!data?.popup_seen_at;
      })
      .toBe(true);
    await patient.reload();
    await expect(patient.getByTestId("announcement-banner").first()).toBeVisible({ timeout: 60_000 });
    await patient.waitForTimeout(2500);
    await expect(dialog).toHaveCount(0);

    // And the route refuses a "close" it was told not to accept.
    const refused = await request.post(`${BASE}/api/announcements/receipt`, {
      headers: { cookie: await cookieHeaderFor(QA_EMAILS.patientB) },
      data: { id, action: "dismiss" },
    });
    expect(refused.status()).toBe(403);
    await patient.context().close();
  });

  test("ANN-005: End now takes it off the dashboard, and a hospital cannot write a receipt for a patient notice", async ({
    browser,
    request,
  }) => {
    const { data: live } = await adminClient()
      .from("announcements")
      .select("id")
      .like("title", `${PREFIX}%`)
      .limit(1)
      .single();
    const id = live?.id as string;

    const wrongRole = await request.post(`${BASE}/api/announcements/receipt`, {
      headers: { cookie: await cookieHeaderFor(QA_EMAILS.hospital) },
      data: { id, action: "seen" },
    });
    expect(wrongRole.status()).toBe(404);

    const ended = await asAdmin(request, "/api/admin/announcements/end", { id });
    expect(ended.status()).toBe(200);

    const patient = await pageFor(browser, QA_EMAILS.patientB);
    await patient.goto(`${BASE}/patient/dashboard`);
    await expect(patient.getByRole("heading", { level: 1 })).toBeVisible({ timeout: 60_000 });
    await expect(patient.getByTestId("announcement-bar")).toHaveCount(0);
    await patient.context().close();

    // Ending twice is refused rather than silently moving the end again.
    const again = await asAdmin(request, "/api/admin/announcements/end", { id });
    expect(again.status()).toBe(409);
  });

  test("ANN-006: the admin screen lists it, and the form builds a table and previews the banner", async ({ browser }) => {
    const page = await pageFor(browser, QA_EMAILS.admin, { width: 1440, height: 900 });
    await page.goto(`${BASE}/admin/dashboard?section=settings&tab=announcements`);
    const manager = page.getByTestId("announcements-manager");
    await expect(manager).toBeVisible({ timeout: 60_000 });
    await expect(
      page.getByTestId("announcements-ended").getByTestId("announcement-row").filter({ hasText: "Clinic closed tomorrow" })
    ).toHaveCount(1);

    await manager.getByRole("button", { name: "New announcement" }).click();
    const form = page.getByTestId("announcement-form");
    await expect(form).toBeVisible();
    await form.getByLabel("Title").fill(`${PREFIX} Diwali wishes`);
    await expect(page.getByTestId("announcement-preview")).toContainText("Diwali wishes");

    const editor = page.getByTestId("announcement-body-editor");
    await expect(editor).toBeVisible({ timeout: 30_000 });
    await editor.click();
    await page.keyboard.type("Wishing you a bright festival.");
    await page.keyboard.press("Enter");
    await form.getByRole("button", { name: "Insert table" }).click();
    await expect(editor.locator("table")).toHaveCount(1);
    await expect(form.getByRole("toolbar", { name: "Table tools" })).toBeVisible();
    await page.keyboard.type("Day");
    await page.screenshot({ path: "e2e/screenshots/announcements/admin-form.png", fullPage: true });

    await form.getByLabel("Therapists").check();
    await form.getByLabel("Words on the button").fill("Book a session");
    await expect(form.getByLabel("Patients", { exact: true }).last()).toBeVisible();
    await expect(page.getByTestId("announcement-window")).toContainText(/7 days later/);

    await page.getByTestId("announcement-publish").click();
    await expect(
      page.getByTestId("announcements-live").getByTestId("announcement-row").filter({ hasText: "Diwali wishes" })
    ).toHaveCount(1, { timeout: 60_000 });
    await page.screenshot({ path: "e2e/screenshots/announcements/admin-list.png", fullPage: true });

    const { data: row } = await adminClient()
      .from("announcements")
      .select("audiences, body, cta_label, cta_targets, duration_minutes, published_at")
      .eq("title", `${PREFIX} Diwali wishes`)
      .single();
    expect(row?.audiences).toEqual(["patient", "therapist"]);
    expect(row?.body).toContain('"table"');
    expect(row?.cta_label).toBe("Book a session");
    expect(row?.cta_targets).toMatchObject({ patient: { kind: "screen", key: "book" } });
    expect(row?.duration_minutes).toBe(7 * 24 * 60);
    expect(row?.published_at).not.toBeNull();
    await page.context().close();
  });

  test("NB-001: the notebook opens from its button, saves by itself, and keeps what was written", async ({ browser }) => {
    const page = await pageFor(browser, QA_EMAILS.patientA);
    await page.goto(`${BASE}/patient/dashboard`);
    await page.getByTestId("notebook-button").click({ timeout: 60_000 });
    const notebook = page.getByTestId("notebook");
    await expect(notebook).toBeVisible({ timeout: 30_000 });
    await expect(notebook).toHaveAttribute("data-stage", "open", { timeout: 15_000 });
    await expect(notebook.getByText("Only you can read this")).toBeVisible();

    const editor = page.getByTestId("notebook-editor");
    await expect(editor).toBeVisible({ timeout: 30_000 });
    await editor.click();
    await page.keyboard.type("Knee felt better after the stretches.");
    await expect(page.getByTestId("notebook-save-state")).toHaveText("Saved", { timeout: 20_000 });
    await expect(page.getByTestId("notebook-page-number")).toHaveText("Page 1 of 1");
    await page.screenshot({ path: "e2e/screenshots/announcements/notebook-desktop.png" });

    await notebook.getByRole("button", { name: "New page" }).click();
    await expect(page.getByTestId("notebook-page-number")).toHaveText("Page 2 of 2", { timeout: 20_000 });
    // One blank page at the end is enough.
    await notebook.getByRole("button", { name: "New page" }).click();
    await expect(page.getByTestId("notebook-page-number")).toHaveText("Page 2 of 2");

    await page.getByTestId("notebook-close").click();
    await expect(notebook).toHaveCount(0);

    // A fresh visit, on a phone: the page is still there.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload();
    await page.getByTestId("notebook-button").click({ timeout: 60_000 });
    await expect(page.getByTestId("notebook")).toHaveAttribute("data-stage", "open", { timeout: 15_000 });
    // Through the list of pages, which is how an old page is found again.
    await page.getByTestId("notebook").getByRole("button", { name: "All pages" }).click();
    await page.getByTestId("notebook-index").getByRole("button", { name: /Page 1/ }).click();
    await expect(page.getByTestId("notebook-editor")).toContainText("Knee felt better after the stretches.", {
      timeout: 30_000,
    });
    await page.screenshot({ path: "e2e/screenshots/announcements/notebook-phone.png" });
    await page.context().close();
  });

  test("NB-002: a notebook page is read by its owner and by nobody else", async ({ request }) => {
    const admin = adminClient();
    const ownerId = await profileIdFor(admin, QA_EMAILS.patientA);
    const { data: pages } = await admin
      .from("notebook_pages")
      .select("id, body")
      .eq("user_id", ownerId)
      .order("created_at", { ascending: true });
    expect(pages?.length).toBe(2);
    const pageId = pages?.[0].id as string;
    expect(pages?.[0].body).toContain("Knee felt better");

    // Another patient, asking for that page by id through the route.
    const cookie = await cookieHeaderFor(QA_EMAILS.patientB);
    const read = await request.get(`${BASE}/api/notebook?page=${pageId}`, { headers: { cookie } });
    expect(read.status()).toBe(404);
    const overwrite = await request.post(`${BASE}/api/notebook`, {
      headers: { cookie },
      data: { action: "save", id: pageId, content: { type: "doc", content: [] } },
    });
    expect(overwrite.status()).toBe(404);
    const remove = await request.post(`${BASE}/api/notebook`, {
      headers: { cookie },
      data: { action: "delete", id: pageId },
    });
    expect(remove.status()).toBe(200);
    const { count: still } = await admin
      .from("notebook_pages")
      .select("id", { count: "exact", head: true })
      .eq("user_id", ownerId);
    expect(still).toBe(2);

    // Nobody signed in at all.
    expect((await request.get(`${BASE}/api/notebook`)).status()).toBe(401);
    // An admin account has no notebook, and no way to list anybody's.
    const asAdminRead = await request.get(`${BASE}/api/notebook`, {
      headers: { cookie: await cookieHeaderFor(QA_EMAILS.admin) },
    });
    expect(asAdminRead.status()).toBe(403);

    // And the database says the same without the route: with their own
    // session and RLS, another patient and an admin both read zero rows.
    for (const email of [QA_EMAILS.patientB, QA_EMAILS.admin, QA_EMAILS.therapistA]) {
      const client = await rlsClientFor(email);
      const { data, error } = await client.from("notebook_pages").select("id").eq("user_id", ownerId);
      expect(error).toBeNull();
      expect(data).toEqual([]);
      const write = await client.from("notebook_pages").insert({ user_id: ownerId, body: null }).select("id");
      expect(write.error).not.toBeNull();
    }
    const own = await (await rlsClientFor(QA_EMAILS.patientA)).from("notebook_pages").select("id");
    expect(own.data?.length).toBe(2);
  });
});
