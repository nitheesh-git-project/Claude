// "Are you getting better?" draws one point per exam (the ortho layout's
// progress graph, a dot per review). It used to be one
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
  waitForSplashToClear, openProfileBlocks } from "./helpers";

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
  // Back to back, a minute apart: health-profile.spec runs earlier in the
  // same runner and leaves its own readings for this patient, and two hours
  // apart those landed between these two, so the line's last two points were
  // somebody else's.
  const now = Date.now();
  const { error } = await db.from("pain_assessments").insert([
    { patient_id: patientId, region: "upper_back", side: "na", answers: {}, pain_percent: 80, submitted_by: therapistId, submitted_by_role: "therapist", created_at: new Date(now - 120_000).toISOString() },
    { patient_id: patientId, region: "upper_back", side: "na", answers: {}, pain_percent: 30, submitted_by: therapistId, submitted_by_role: "therapist", created_at: new Date(now - 60_000).toISOString() },
  ]);
  expect(error, error?.message).toBeNull();

  await page.context().addCookies(await browserCookiesFor(QA_EMAILS.patientA));
  await page.goto(`${BASE}/patient/dashboard/health-profile`);
  await openProfileBlocks(page);
  await waitForSplashToClear(page);
  // The ortho layout's progress graph (ProfileProgressSection): one dot per
  // review, the Pain Map's 0-10 score among its lines. The old
  // PainTrendChart is only the fallback for a database without the Health
  // Profile tables, which is not what a patient here sees.
  const section = page.getByRole("region", { name: "Progress" });
  await expect(section).toContainText("Are you getting better?");
  const chart = section.getByRole("img", { name: /^Pain score: / });
  const label = (await chart.getAttribute("aria-label")) ?? "";
  const reviews = Number(/over (\d+) reviews/.exec(label)?.[1] ?? "0");
  // Both of today's exams are on the line, one dot each.
  expect(reviews, label).toBeGreaterThanOrEqual(2);
  const dots = chart.locator("circle");
  expect(await dots.count()).toBe(reviews);
  // The latest is the re-score (30% -> 3/10)...
  expect(label, label).toMatch(/, 3 on [^,]+, over \d+ reviews/);
  // ...and today's 80 was not swallowed into a daily average: it is still
  // its own dot, drawn higher than the 3 after it (higher pain is higher up).
  const ys = await dots.evaluateAll((els) => els.map((el) => Number(el.getAttribute("cy"))));
  const [prevY, lastY] = ys.slice(-2);
  expect(prevY).toBeLessThan(lastY);
  await section.scrollIntoViewIfNeeded();
  await section.screenshot({ path: "test-results/pain-trend.png" });
});
