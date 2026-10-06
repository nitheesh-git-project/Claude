// Scheduling the sessions of a programme a patient already owns.
//
// The scheduler sent zone-less wall times ("2026-10-07T18:00") and the
// server read them in its *own* zone. On a UTC host -- every real deploy --
// 18:00 became 18:00 UTC, which is 23:30 in India, and every slot a patient
// picked was refused with "Sessions start on the hour." The rest of the suite
// never saw it because playwright.config.ts runs the app with
// TZ=Asia/Kolkata; run this against a server started on UTC to reproduce the
// original failure.
import { test, expect, request, type APIRequestContext } from "@playwright/test";
import {
  BASE,
  QA_EMAILS,
  adminClient,
  browserCookiesFor,
  cookieHeaderFor,
  markDashboardTourSeen,
  profileIdFor,
  waitForSplashToClear,
} from "./helpers";

const db = adminClient();
const CATEGORY = "QA Scheduling Condition";
const PACKAGE = "QA Scheduling Programme";

let patientId = "";
let categoryId = "";
let packageId = "";
let patient: APIRequestContext;
const purchases: string[] = [];

/** "YYYY-MM-DD" in India, `days` from now. */
function istDateKey(days: number): string {
  return new Date(Date.now() + 5.5 * 3_600_000 + days * 86_400_000).toISOString().slice(0, 10);
}

async function freshPurchase(): Promise<{ id: string; code: string | null }> {
  const { data, error } = await db
    .from("patient_package_purchases")
    .insert({
      patient_id: patientId,
      package_id: packageId,
      category_id: categoryId,
      session_count: 3,
      sessions_used: 0,
      amount_paid_paise: 300000,
      payment_status: "paid",
      status: "active",
      paid_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 120 * 86_400_000).toISOString(),
    })
    .select("id, purchase_code")
    .single();
  if (error) throw new Error(error.message);
  purchases.push(data.id);
  return { id: data.id, code: data.purchase_code };
}

test.beforeAll(async () => {
  patientId = await profileIdFor(db, QA_EMAILS.patientB);
  await markDashboardTourSeen(QA_EMAILS.patientB);
  // Found or made. A long-lived project has both already; the gate's
  // disposable stack starts with an empty catalog, where the first run read
  // `.id` of null. Purchases below are inserted directly, so neither row is
  // ever sold or shown to anybody.
  let { data: cat } = await db.from("treatment_categories").select("id").eq("title", CATEGORY).limit(1).maybeSingle();
  if (!cat) {
    const { data, error } = await db
      .from("treatment_categories")
      .insert({
        title: CATEGORY,
        description: "A condition seeded by the programme-scheduling spec.",
        points: ["Scheduling"],
        price_paise: 100000,
        duration_minutes: 60,
        active: true,
      })
      .select("id")
      .single();
    if (error) throw new Error(`could not seed "${CATEGORY}": ${error.message}`);
    cat = data;
  }
  categoryId = cat!.id;
  let { data: pkg } = await db
    .from("treatment_category_packages")
    .select("id")
    .eq("title", PACKAGE)
    .eq("category_id", categoryId)
    .limit(1)
    .maybeSingle();
  if (!pkg) {
    const { data, error } = await db
      .from("treatment_category_packages")
      .insert({
        category_id: categoryId,
        title: PACKAGE,
        session_count: 3,
        price_paise: 300000,
        active: true,
        recommendable: false,
        therapist_locked: false,
      })
      .select("id")
      .single();
    if (error) throw new Error(`could not seed "${PACKAGE}": ${error.message}`);
    pkg = data;
  }
  packageId = pkg!.id;
  patient = await request.newContext({ extraHTTPHeaders: { Cookie: await cookieHeaderFor(QA_EMAILS.patientB) } });
});

test.afterAll(async () => {
  // Cancel what was booked and spend the rest, so these purchases stop
  // appearing as something to schedule.
  for (const id of purchases) {
    await db.from("appointments").update({ status: "cancelled" }).eq("package_purchase_id", id).neq("status", "cancelled");
    await db.from("patient_package_purchases").update({ status: "cancelled" }).eq("id", id);
  }
  await patient?.dispose();
});

test("PST-001: a zone-less wall time is read in India, not the server's zone", async () => {
  const { id } = await freshPurchase();
  const res = await patient.post(`${BASE}/api/appointments/book-package-sessions`, {
    data: { packagePurchaseId: id, slots: [{ slotDateTime: `${istDateKey(5)}T18:00` }] },
  });
  const body = await res.json();
  expect(res.status(), JSON.stringify(body)).toBe(200);
  expect(body.results?.[0]?.success, JSON.stringify(body)).toBe(true);
  const { data: appt } = await db
    .from("appointments")
    .select("slot_time")
    .eq("package_purchase_id", id)
    .neq("status", "cancelled")
    .single();
  // 18:00 in India is 12:30 UTC.
  expect(new Date(appt!.slot_time).toISOString()).toBe(`${istDateKey(5)}T12:30:00.000Z`);
});

test("PST-002: an off-the-hour time is still refused", async () => {
  const { id } = await freshPurchase();
  const res = await patient.post(`${BASE}/api/appointments/book-package-sessions`, {
    data: { packagePurchaseId: id, slots: [{ slotDateTime: `${istDateKey(5)}T18:30`, timezone: "Asia/Kolkata" }] },
  });
  expect(res.status()).toBe(400);
  expect((await res.json()).error).toContain("Sessions start on the hour");
});

test("PST-003: a patient picks a time in the scheduler and it books", async ({ page }) => {
  test.setTimeout(120_000);
  const { id, code } = await freshPurchase();
  await page.context().addCookies(await browserCookiesFor(QA_EMAILS.patientB));
  await page.goto(`${BASE}/patient/dashboard/packages`);
  await waitForSplashToClear(page);
  const card = page.locator("div", { has: page.getByText(code ?? "", { exact: true }) }).filter({
    has: page.getByRole("button", { name: "Schedule sessions" }),
  }).last();
  await card.getByRole("button", { name: "Schedule sessions" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();

  // The scheduler opens with suggested times already filling every slot it
  // can; clear them so a time can be picked by hand, as a patient would.
  const remove = dialog.getByRole("button", { name: "Remove" });
  while ((await remove.count()) > 0) await remove.first().click();

  // Pick a day five days out and its first time. Day buttons are labelled
  // with the long date ("Sunday, 11 October 2026").
  const target = new Date(`${istDateKey(5)}T12:00:00+05:30`);
  if (target.getMonth() !== new Date().getMonth()) {
    await dialog.getByRole("button", { name: "Next month" }).click();
  }
  const longDate = target.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  await dialog.getByRole("group", { name: "Choose dates" }).getByRole("button", { name: longDate }).click();
  const firstHour = dialog.getByRole("button", { name: /\d\s?(AM|PM)\s+–/i }).first();
  await firstHour.click();
  await dialog.screenshot({ path: "test-results/programme-scheduler-picked.png" });

  const booked = page.waitForResponse((r) => r.url().includes("/api/appointments/book-package-sessions"));
  await dialog.getByRole("button", { name: /^Schedule \d* ?Sessions?$/ }).click();
  const res = await booked;
  const body = await res.json();
  expect(res.status(), JSON.stringify(body)).toBe(200);
  expect(body.results.every((r: { success: boolean }) => r.success), JSON.stringify(body)).toBe(true);
  await expect(dialog.getByText("Sessions start on the hour")).toHaveCount(0);

  const { data: rows } = await db
    .from("appointments")
    .select("slot_time")
    .eq("package_purchase_id", id)
    .neq("status", "cancelled");
  expect(rows!.length).toBe(body.results.length);
  for (const r of rows!) {
    // On the hour in India: :30 past in UTC.
    expect(new Date(r.slot_time).getUTCMinutes()).toBe(30);
  }
  await dialog.screenshot({ path: "test-results/programme-scheduler-booked.png" });
});
