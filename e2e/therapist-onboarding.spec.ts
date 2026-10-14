// A patient nobody has onboarded yet, from the therapist's side: the banner
// at the top of Home, the "Onboarding needed" strip on the session card,
// "Start onboarding" going straight into the triage, and the "How
// onboarding works" guide walking every condition type.
//
// Fixtures: QA Patient B and QA Therapist A, as in health-profile.spec.ts.
// Patient B's condition record is wiped before each case (so they need
// onboarding) and after the file, and the one session seeded here is
// deleted afterwards.
import { test, expect, type Browser } from "@playwright/test";
import {
  BASE,
  QA_EMAILS,
  adminClient,
  browserCookiesFor,
  markDashboardTourSeen,
  pageUntilVisible,
  profileIdFor,
} from "./helpers";

test.setTimeout(180_000);

const MARKER = "E2E onboarding-guide";
const admin = adminClient();
let patientId = "";
let therapistId = "";
let patientName = "";

async function resetProfile() {
  await admin.from("pain_assessments").delete().eq("patient_id", patientId);
  await admin.from("condition_change_requests").delete().eq("patient_id", patientId);
  await admin.from("condition_access_grants").delete().eq("patient_id", patientId);
  await admin.from("patient_condition_profiles").delete().eq("patient_id", patientId);
}

async function openAs(browser: Browser, path: string) {
  const ctx = await browser.newContext();
  await ctx.addCookies(await browserCookiesFor(QA_EMAILS.therapistA));
  const page = await ctx.newPage();
  await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded" });
  return page;
}

test.beforeAll(async () => {
  patientId = await profileIdFor(admin, QA_EMAILS.patientB);
  therapistId = await profileIdFor(admin, QA_EMAILS.therapistA);
  const { data } = await admin.from("profiles").select("full_name").eq("id", patientId).single();
  patientName = data!.full_name as string;
  await markDashboardTourSeen(QA_EMAILS.therapistA);
  await admin.from("appointments").delete().eq("concern", MARKER);
  // A confirmed session a few days out, at a free hour for this patient.
  for (let tries = 0; tries < 12; tries++) {
    const slot = new Date(Date.now() + (3 + tries) * 86_400_000);
    slot.setUTCMinutes(0, 0, 0);
    const { error } = await admin.from("appointments").insert({
      patient_id: patientId,
      therapist_id: therapistId,
      slot_time: slot.toISOString(),
      status: "confirmed",
      payment_status: "paid",
      visit_mode: "online",
      duration_minutes: 30,
      concern: MARKER,
    });
    if (!error) return;
  }
  throw new Error("no free hour to seed the session");
});

test.beforeEach(async () => {
  await resetProfile();
});

test.afterAll(async () => {
  await resetProfile();
  await admin.from("appointments").delete().eq("concern", MARKER);
});

test("OG-001: Home leads with who needs onboarding, and the guide walks every condition type", async ({ browser }) => {
  const page = await openAs(browser, "/therapist/dashboard");
  try {
    const banner = page.getByRole("region", { name: "Patients who need onboarding" });
    await expect(banner).toBeVisible({ timeout: 60_000 });
    const row = banner.getByRole("listitem").filter({ hasText: patientName });
    // The banner names three and counts the rest, so Patient B may be in
    // the count only on a database with many un-onboarded patients.
    if (await row.count()) {
      await expect(row.getByRole("link", { name: "Start onboarding" })).toHaveAttribute(
        "href",
        `/therapist/dashboard/health-profile/${patientId}?start=onboarding`
      );
    }

    await banner.getByRole("button", { name: "How onboarding works" }).click();
    const guide = page.getByTestId("tutorial");
    await expect(page.getByRole("heading", { name: "What onboarding is" })).toBeVisible();
    for (const title of [
      "Before the session",
      "Step 1 - four questions decide the condition type",
      "Orthopaedic - the pain questions",
      "Neurological - function and safety",
      "Paediatric - the parent answers",
      "Save - it's live straight away",
      "If the case turns out to be something else",
    ]) {
      await guide.getByRole("button", { name: "Next" }).click();
      await expect(page.getByRole("heading", { name: title })).toBeVisible();
    }
    // The question scenes read the real sets: a neurological-only question
    // and the paediatric caregiver step are on screen when their step is.
    await page.getByRole("button", { name: "Back" }).click();
    await page.getByRole("button", { name: "Back" }).click();
    await expect(page.getByTestId("tutorial-scene").getByText("Birth history", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Back" }).click();
    await expect(page.getByTestId("tutorial-scene").getByText("Affected side", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Close the tour" }).click();
    await expect(guide).toHaveCount(0, { timeout: 10_000 });
  } finally {
    await page.context().close();
  }
});

test("OG-002: the session card says onboarding is needed, and Start onboarding opens the triage", async ({ browser }) => {
  const page = await openAs(browser, "/therapist/dashboard/sessions");
  try {
    const card = page.locator("div.rounded-xl", { hasText: MARKER }).first();
    expect(await pageUntilVisible(page, "sessions", card, { timeout: 60_000 })).toBe(true);
    await expect(card.getByText("Onboarding needed")).toBeVisible();
    await expect(card.getByRole("button", { name: "How onboarding works" })).toBeVisible();
    await card.getByRole("link", { name: "Start onboarding" }).click();
    await expect(page.getByRole("dialog", { name: "Which condition type is this?" })).toBeVisible({
      timeout: 60_000,
    });
    // Consumed on arrival, so a reload does not reopen it.
    await expect(page).not.toHaveURL(/start=onboarding/);
  } finally {
    await page.context().close();
  }
});

test("OG-003: once onboarded, the banner row and the card's strip are gone", async ({ browser }) => {
  await admin.from("patient_condition_profiles").insert({
    patient_id: patientId,
    specialty: "ortho",
    status: "active",
    data: { chief_complaint: "Knee pain", since_when: "6 weeks", severity: "5" },
    schema_version: 2,
    last_submitted_by: therapistId,
    last_submitted_role: "therapist",
  });
  const page = await openAs(browser, "/therapist/dashboard/sessions");
  try {
    const card = page.locator("div.rounded-xl", { hasText: MARKER }).first();
    expect(await pageUntilVisible(page, "sessions", card, { timeout: 60_000 })).toBe(true);
    await expect(card.getByText("Onboarding needed")).toHaveCount(0);
    await page.goto(`${BASE}/therapist/dashboard`, { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: /Your practice today|Welcome/ }).first()).toBeVisible({
      timeout: 60_000,
    });
    await expect(
      page.getByRole("region", { name: "Patients who need onboarding" }).getByText(patientName)
    ).toHaveCount(0);
  } finally {
    await page.context().close();
  }
});
