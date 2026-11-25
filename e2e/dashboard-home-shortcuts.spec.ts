// Home's shortcuts into booking, Chat to book, and the therapist's Today list.
//
// The choices are unit-tested where they live (src/lib/patientHomeCards.test.ts,
// src/lib/chatToBook.test.ts, src/lib/therapistToday.test.ts). What needs a
// server and a browser is that the real loaders feed them: a patient with
// nothing booked is offered their first session, a patient with a past session
// is offered the same care again with the same physiotherapist, Chat to book
// ends on a link into the real wizard, and the therapist's Home lists today.
import { test, expect } from "@playwright/test";
import {
  BASE,
  QA_EMAILS,
  adminClient,
  browserCookiesFor,
  createFixtureAccount,
  deleteFixtureAccount,
  profileIdFor,
  waitForSplashToClear,
} from "./helpers";

const db = adminClient();
const HOUR = 3_600_000;

let fresh: { id: string; email: string; name: string };
let returning: { id: string; email: string; name: string };
let category: { id: string; title: string };

test.beforeAll(async () => {
  fresh = await createFixtureAccount("home shortcuts fresh");
  returning = await createFixtureAccount("home shortcuts returning");
  const { data: cats, error: catError } = await db
    .from("treatment_categories")
    .select("id, title")
    .eq("active", true)
    .order("title")
    .limit(1);
  if (catError || !cats?.[0]) throw new Error(`no active category to book: ${catError?.message ?? "none"}`);
  category = cats[0];
  const therapistId = await profileIdFor(db, QA_EMAILS.therapistA);
  const slot = new Date(Date.now() - 50 * HOUR);
  slot.setMinutes(0, 0, 0);
  const { error } = await db.from("appointments").insert({
    patient_id: returning.id,
    therapist_id: therapistId,
    category_id: category.id,
    slot_time: slot.toISOString(),
    status: "confirmed",
    payment_status: "paid",
    paid_at: new Date(slot.getTime() - 72 * HOUR).toISOString(),
    amount_paid_paise: 120000,
    visit_mode: "online",
    duration_minutes: 30,
    concern: "E2E home shortcuts",
  });
  if (error) throw new Error(`could not seed the past session: ${error.message}`);
});

test.afterAll(async () => {
  await deleteFixtureAccount(fresh?.id);
  await deleteFixtureAccount(returning?.id);
});

test("HS-001: nothing booked yet -- Home offers the first session and Chat to book", async ({ page }) => {
  test.setTimeout(90_000);
  await page.context().addCookies(await browserCookiesFor(fresh.email));
  await page.goto(`${BASE}/patient/dashboard`, { waitUntil: "domcontentloaded" });
  await waitForSplashToClear(page);
  await expect(page.getByRole("heading", { name: "Book your first session" })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole("link", { name: /Chat to book/ }).first()).toBeVisible();
  await expect(page.getByText("Same again?")).toHaveCount(0);
});

test("HS-002: a past session -- Home offers the same care with the same physiotherapist", async ({ page }) => {
  test.setTimeout(90_000);
  await page.context().addCookies(await browserCookiesFor(returning.email));
  await page.goto(`${BASE}/patient/dashboard`, { waitUntil: "domcontentloaded" });
  await waitForSplashToClear(page);
  const card = page.getByRole("region", { name: category.title });
  await expect(card).toBeVisible({ timeout: 60_000 });
  await expect(card).toContainText("Same again?");
  const book = card.getByRole("link", { name: "Book this again" });
  await expect(book).toHaveAttribute("href", new RegExp(`^/book\\?from=dashboard&category=${category.id}&therapist=`));
});

test("HS-003: Chat to book ends on a link into the real booking wizard", async ({ page }) => {
  test.setTimeout(90_000);
  await page.context().addCookies(await browserCookiesFor(fresh.email));
  await page.goto(`${BASE}/patient/dashboard/chat`, { waitUntil: "domcontentloaded" });
  await waitForSplashToClear(page);
  const care = page.getByRole("group", { name: "What do you need help with?" });
  await expect(care).toBeVisible({ timeout: 60_000 });
  await care.getByRole("button", { name: category.title }).click();
  // Only asked when this care can also be a home visit.
  const mode = page.getByRole("group", { name: "Video consultation or home visit?" });
  if (await mode.isVisible({ timeout: 3_000 }).catch(() => false)) {
    await mode.getByRole("button", { name: /Video consultation/ }).click();
  }
  const pick = page.getByRole("link", { name: "Pick a time" });
  await expect(pick).toBeVisible({ timeout: 10_000 });
  await expect(pick).toHaveAttribute("href", `/book?from=dashboard&category=${category.id}`);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: "e2e/screenshots/home-shortcuts/chat-to-book-phone.png" });
});

test("HS-004: the therapist's Home lists today", async ({ page }) => {
  test.setTimeout(90_000);
  await page.context().addCookies(await browserCookiesFor(QA_EMAILS.therapistA));
  await page.goto(`${BASE}/therapist/dashboard`, { waitUntil: "domcontentloaded" });
  await waitForSplashToClear(page);
  const today = page.getByRole("region", { name: "Today" });
  await expect(today).toBeVisible({ timeout: 60_000 });
  await expect(today.getByRole("link", { name: "All sessions" })).toHaveAttribute("href", "/therapist/dashboard/sessions");
});
