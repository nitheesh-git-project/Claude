// "Are you getting better?" draws one point per exam. It used to be one
// point per calendar day, so a second exam on the same day replaced the
// first on the line and the patient could not see the change.
//
// pain_assessments is append-only (a trigger refuses update and delete), so
// the readings this writes stay -- disposable projects only.
import { test, expect } from "@playwright/test";
import {
  BASE,
  QA_EMAILS,
  adminClient,
  browserCookiesFor,
  markDashboardTourSeen,
  profileIdFor,
  waitForSplashToClear,
} from "./helpers";

test.skip(
  process.env.E2E_ALLOW_APPEND_ONLY_WRITES !== "1" && process.env.CI_LOCAL_STACK !== "1",
  "writes append-only pain readings; set E2E_ALLOW_APPEND_ONLY_WRITES=1 on a disposable project"
);

test("PT-001: two exams on the same day are two points, the older one kept", async ({ page }) => {
  test.setTimeout(90_000);
  const db = adminClient();
  const patientId = await profileIdFor(db, QA_EMAILS.patientA);
  const therapistId = await profileIdFor(db, QA_EMAILS.therapistA);
  await markDashboardTourSeen(QA_EMAILS.patientA);

  // Two exams of the same area, two hours apart, both today: 8/10 then 3/10.
  const now = Date.now();
  const { error } = await db.from("pain_assessments").insert([
    { patient_id: patientId, region: "upper_back", side: "na", answers: {}, pain_percent: 80, submitted_by: therapistId, submitted_by_role: "therapist", created_at: new Date(now - 2 * 3_600_000).toISOString() },
    { patient_id: patientId, region: "upper_back", side: "na", answers: {}, pain_percent: 30, submitted_by: therapistId, submitted_by_role: "therapist", created_at: new Date(now - 60_000).toISOString() },
  ]);
  expect(error, error?.message).toBeNull();

  await page.context().addCookies(await browserCookiesFor(QA_EMAILS.patientA));
  await page.goto(`${BASE}/patient/dashboard/health-profile`);
  await waitForSplashToClear(page);
  const section = page.locator("section", { has: page.getByRole("heading", { name: "Are you getting better?" }) });
  await expect(section).toBeVisible();
  const chart = section.getByRole("img", { name: /Pain recorded at each exam/ });
  const label = (await chart.getAttribute("aria-label")) ?? "";
  const entries = label.replace(/^Pain recorded at each exam: /, "").split(", ");
  // Both of today's exams are on the line, the earlier one still there.
  expect(entries.length).toBeGreaterThanOrEqual(2);
  expect(await chart.locator("circle").count()).toBe(entries.length);
  // Neither today's 80 nor its re-score was swallowed into a daily average:
  // the line moves between the last two points.
  const [prev, last] = entries.slice(-2).map((e) => Number(e.split(" ").at(-1)!.replace("/10", "")));
  expect(last).toBeLessThan(prev);
  await section.scrollIntoViewIfNeeded();
  await section.screenshot({ path: "test-results/pain-trend.png" });
});
