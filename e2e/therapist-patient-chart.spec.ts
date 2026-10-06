// A patient's chart (/therapist/dashboard/health-profile/[id]) sits inside the
// dashboard shell: the sidebar keeps My Patients lit as the way back, so the
// page carries no "Back to My Patients" link of its own.
import { test, expect } from "@playwright/test";
import { BASE, QA_EMAILS, adminClient, browserCookiesFor, markDashboardTourSeen, profileIdFor, waitForSplashToClear } from "./helpers";

const db = adminClient();
const MARKER = "E2E patient-chart";

let patientId: string;

test.beforeAll(async () => {
  patientId = await profileIdFor(db, QA_EMAILS.patientA);
  const therapistId = await profileIdFor(db, QA_EMAILS.therapistA);
  await markDashboardTourSeen(QA_EMAILS.therapistA);
  await db.from("appointments").delete().eq("concern", MARKER);
  // Assignment is what opens the chart; a session three days out is enough.
  const slot = new Date(Date.now() + 3 * 86_400_000);
  slot.setMinutes(0, 0, 0);
  const { error } = await db.from("appointments").insert({
    patient_id: patientId,
    therapist_id: therapistId,
    slot_time: slot.toISOString(),
    status: "confirmed",
    payment_status: "paid",
    duration_minutes: 30,
    visit_mode: "online",
    concern: MARKER,
  });
  if (error) throw new Error(`could not seed a session: ${error.message}`);
});

test.afterAll(async () => {
  await db.from("appointments").delete().eq("concern", MARKER);
});

test("PC-001: the chart has no back link and the sidebar keeps My Patients lit", async ({ page }) => {
  await page.context().addCookies(await browserCookiesFor(QA_EMAILS.therapistA));
  await page.goto(`${BASE}/therapist/dashboard/health-profile/${patientId}`);
  await expect(page.getByText("Health profile", { exact: false }).first()).toBeVisible();
  await expect(page.getByText("Back to My Patients")).toHaveCount(0);
  const nav = page.getByRole("link", { name: "My Patients" }).first();
  await expect(nav).toHaveAttribute("aria-current", "page");
  await waitForSplashToClear(page);
  await page.screenshot({ path: "test-results/patient-chart.png" });
});
