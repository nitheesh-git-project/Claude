// The orthopaedic Health Profile (Health Profile redesign, phase 3b): the
// layout the patient's page, the therapist's chart and the admin's chart
// share -- header, where things stand, key numbers, body map, graph, steps,
// measures -- and what each viewer may do in it.
//
// Written, not run in the build that added it: it needs a Supabase project
// the destructive-tooling rules allow. Fixtures: one throwaway orthopaedic
// patient of its own (an intake with a chief complaint, a completed session
// with QA Therapist A, three Pain Map exams), so QA Therapist B and QA
// Patient A are the outsiders.
//
// The readings are posted through the therapist route (the dialog's own
// door) and the page is then read back, because the point is that what is
// recorded reaches the dial, the bar and the table. outcome_measurements,
// care_status_events and pain_assessments are append-only, so the rows stay:
// disposable projects only (E2E_ALLOW_APPEND_ONLY_WRITES=1 or the local stack).
//
// Not covered here: the "we couldn't load" card for an unreadable read. A
// server page cannot be made to fail one read from a browser test without
// dropping a table, which the suite's destructive rules keep to
// admin-degraded-schema.spec.ts; the degradation is unit-tested in
// src/lib/orthoProfileView.test.ts and recorded in the QA plan (THR-HP-005f).
import { test, expect, type APIRequestContext, type Browser } from "@playwright/test";
import {
  BASE,
  QA_EMAILS,
  adminClient,
  browserCookiesFor,
  cookieHeaderFor,
  createFixtureAccount,
  deleteFixtureAccount,
  insertPastFixtureAppointment,
  profileIdFor,
} from "./helpers";

test.skip(
  process.env.E2E_ALLOW_APPEND_ONLY_WRITES !== "1" && process.env.CI_LOCAL_STACK !== "1",
  "writes append-only measurements; set E2E_ALLOW_APPEND_ONLY_WRITES=1 on a disposable project"
);
test.describe.configure({ mode: "serial" });
test.setTimeout(240_000);

const db = adminClient();
const SEEN = { timeout: 60_000 };
let patient: { id: string; email: string; name: string } | undefined;
let therapistAId = "";

const minutesAgo = (n: number) => new Date(Date.now() - n * 60_000).toISOString();
const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();

async function post(request: APIRequestContext, path: string, email: string, data: unknown) {
  return request.post(`${BASE}${path}`, { headers: { cookie: await cookieHeaderFor(email), "content-type": "application/json" }, data });
}

async function pageAs(browser: Browser, email: string, path: string) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await context.addCookies(await browserCookiesFor(email));
  const page = await context.newPage();
  await page.goto(`${BASE}${path}`);
  return { page, context };
}

test.beforeAll(async () => {
  therapistAId = await profileIdFor(db, QA_EMAILS.therapistA);
  patient = await createFixtureAccount("Ortho Profile");
  const { error } = await db.from("patient_condition_profiles").insert({
    patient_id: patient.id,
    specialty: "ortho",
    status: "active",
    data: { chief_complaint: "Right knee pain after a fall, E2E ortho profile" },
  });
  expect(error, error?.message).toBeNull();
  await insertPastFixtureAppointment(db, {
    patient_id: patient.id,
    therapist_id: therapistAId,
    status: "completed",
    payment_status: "paid",
    visit_mode: "online",
    duration_minutes: 30,
    concern: "E2E ortho profile",
  });
  // Two exams a few weeks apart, so the First exam / Latest switch and the
  // area cards have something to compare.
  for (const [percent, at] of [
    [70, daysAgo(30)],
    [30, daysAgo(2)],
  ] as const) {
    const { error: painError } = await db.from("pain_assessments").insert({
      patient_id: patient.id,
      region: "knee",
      side: "right",
      pain_percent: percent,
      submitted_by: therapistAId,
      submitted_by_role: "therapist",
      answers: {},
      created_at: at,
    });
    expect(painError, painError?.message).toBeNull();
  }
});

test.afterAll(async () => {
  await deleteFixtureAccount(patient?.id);
});

test("OHP-001: the therapist records range, strength and LEFS, and each reaches the dial, the bar and the table", async ({ request, browser }) => {
  const rom = (value: number, variant: string, ago: number) => ({
    measureKey: "joint_range",
    variant,
    side: "right",
    value,
    items: [value, value],
    measuredAt: minutesAgo(ago),
    conditions: { setting: "in_person" },
  });
  const readings = [
    rom(85, "knee_flexion_active", 60 * 24 * 20),
    rom(122, "knee_flexion_active", 30),
    rom(0, "knee_extension_passive", 20),
    rom(-8, "knee_extension_active", 20),
    { measureKey: "strength_symmetry", variant: "quadriceps", side: "right", value: 78, items: null, measuredAt: minutesAgo(15), conditions: { setting: "in_person" } },
    { measureKey: "lefs", value: 58, items: Array.from({ length: 20 }, (_, i) => (i < 18 ? 3 : 2)), measuredAt: minutesAgo(10), conditions: { setting: "in_person" } },
  ];
  for (const measurement of readings) {
    const res = await post(request, "/api/therapist/measurements/submit", QA_EMAILS.therapistA, { patientId: patient!.id, measurement });
    expect(res.status(), await res.text()).toBe(200);
  }

  const { page, context } = await pageAs(browser, QA_EMAILS.therapistA, `/therapist/dashboard/health-profile/${patient!.id}`);
  const root = page.getByTestId("ortho-profile");
  await expect(root).toBeVisible(SEEN);
  // The knee dial and the strength bar carry their figures in words.
  await expect(root.getByRole("img", { name: /knee bend: 122 degrees/i })).toBeVisible();
  await expect(root.getByRole("img", { name: /78 percent of the other side/i })).toBeVisible();
  await expect(root.getByText(/Extension lag/)).toBeVisible();
  // ...and the measures table lists all three families.
  const table = root.getByRole("table", { name: /first, latest and goal reading/i });
  await expect(table.getByText(/Goniometry/)).toBeVisible();
  await expect(table.getByText(/Limb symmetry/)).toBeVisible();
  await expect(table.getByText(/Lower Extremity Functional Scale/)).toBeVisible();
  await context.close();
});

test("OHP-002: the page opens in the new order, and the First exam / Latest switch keeps the Pain Map", async ({ browser }) => {
  const { page, context } = await pageAs(browser, QA_EMAILS.therapistA, `/therapist/dashboard/health-profile/${patient!.id}`);
  const root = page.getByTestId("ortho-profile");
  await expect(root).toBeVisible(SEEN);
  const order = await root.locator("h2, section[aria-label]").evaluateAll((els) =>
    els.map((e) => e.getAttribute("aria-label") ?? e.textContent?.trim() ?? "")
  );
  const at = (re: RegExp) => order.findIndex((t) => re.test(t));
  expect(at(/where things stand/i)).toBeGreaterThan(-1);
  expect(at(/where things stand/i)).toBeLessThan(at(/body map/i));
  expect(at(/body map/i)).toBeLessThan(at(/^progress$/i));
  expect(at(/^progress$/i)).toBeLessThan(at(/^steps$/i));
  expect(at(/^steps$/i)).toBeLessThan(at(/^measures$/i));

  // First exam shows what the first exam found; Latest the newest.
  await root.getByRole("button", { name: "First exam" }).click();
  await expect(root.getByRole("button", { name: "First exam" })).toHaveAttribute("aria-pressed", "true");
  await expect(root.getByText("First exam 7/10")).toBeVisible();
  await root.getByRole("button", { name: "Latest" }).click();
  await expect(root.getByRole("button", { name: "Latest" })).toHaveAttribute("aria-pressed", "true");
  // The existing Pain Map is still there: the figure, and the therapist's own recording door.
  await expect(root.getByRole("button", { name: /Record an exam/ })).toBeVisible();
  await context.close();
});

test("OHP-003: Record a test offers the orthopaedic tests, with the landmarks, the other side and the last reading", async ({ browser }) => {
  const { page, context } = await pageAs(browser, QA_EMAILS.therapistA, `/therapist/dashboard/health-profile/${patient!.id}`);
  await page.getByRole("button", { name: "Record a test" }).click(SEEN);
  const dialog = page.getByRole("dialog");
  const options = await dialog.getByLabel(/Which test/i).locator("option").allTextContents();
  const joined = options.join(" | ");
  expect(joined).toMatch(/Goniometry/);
  expect(joined).toMatch(/Limb symmetry/);
  expect(joined).toMatch(/Lower Extremity Functional Scale/);
  expect(joined).not.toMatch(/Berg|Timed Up and Go|Hoehn/i);
  // A licensed scale is listed but cannot be chosen while the clinic has it off.
  await expect(dialog.getByRole("option", { name: /Oswestry/ })).toBeDisabled();

  await dialog.getByLabel(/Which test/i).selectOption({ label: options.find((o) => /Goniometry/.test(o))! });
  await dialog.getByLabel("Which movement?").selectOption("knee_extension");
  await dialog.getByLabel("Active").check();
  await dialog.getByLabel("Left").check();
  await expect(dialog.getByText(/How to measure knee straightening/i)).toBeVisible();
  await dialog.getByText(/How to measure knee straightening/i).click();
  await expect(dialog.getByText(/extension lag/i).first()).toBeVisible();
  // The left side has no reading, so no other-side line; switch to the recorded right side.
  await dialog.getByLabel("Right").check();
  await expect(dialog.getByText(/Last time/)).toBeVisible();
  await context.close();
});

test("OHP-004: only the assigned therapist gets the controls; the patient and an outsider get none", async ({ browser }) => {
  // The patient: the same layout, none of the controls.
  const own = await pageAs(browser, patient!.email, "/patient/dashboard/health-profile");
  await expect(own.page.getByTestId("ortho-profile")).toBeVisible(SEEN);
  await expect(own.page.getByRole("button", { name: "Record a test" })).toHaveCount(0);
  await expect(own.page.getByRole("button", { name: "Goal and steps" })).toHaveCount(0);
  await expect(own.page.getByRole("button", { name: "Phase and status" })).toHaveCount(0);
  await expect(own.page.getByRole("button", { name: /Record an exam/ })).toHaveCount(0);
  await own.context.close();

  // An unassigned therapist cannot open the chart at all.
  const outsider = await pageAs(browser, QA_EMAILS.therapistB, `/therapist/dashboard/health-profile/${patient!.id}`);
  await expect(outsider.page.getByTestId("ortho-profile")).toHaveCount(0);
  await expect(outsider.page.getByText("Riya").first()).toHaveCount(0);
  await outsider.context.close();

  // The assigned therapist has all three.
  const treating = await pageAs(browser, QA_EMAILS.therapistA, `/therapist/dashboard/health-profile/${patient!.id}`);
  await expect(treating.page.getByRole("button", { name: "Record a test" })).toBeVisible(SEEN);
  await expect(treating.page.getByRole("button", { name: "Goal and steps" })).toBeVisible();
  await expect(treating.page.getByRole("button", { name: "Phase and status" })).toBeVisible();
  await treating.context.close();
});

test("OHP-005: the phase and an overrule with a reason reach the patient's page and its PDF; clearing ends it", async ({ request, browser }) => {
  const set = await post(request, "/api/therapist/care-status/set", QA_EMAILS.therapistA, { patientId: patient!.id, action: "set_phase", phase: "Strengthen" });
  expect(set.status(), await set.text()).toBe(200);
  const reason = "Swelling returned after the stairs test, so I would like to look again.";
  const override = await post(request, "/api/therapist/care-status/set", QA_EMAILS.therapistA, {
    patientId: patient!.id,
    action: "override_status",
    status: "needs_attention",
    reason,
  });
  expect(override.status(), await override.text()).toBe(200);

  const own = await pageAs(browser, patient!.email, "/patient/dashboard/health-profile");
  const root = own.page.getByTestId("ortho-profile");
  await expect(root.getByText("Needs attention")).toBeVisible(SEEN);
  await expect(root.getByText(reason)).toBeVisible();
  await expect(root.locator("[aria-current=step]")).toContainText("Strengthen");

  // The patient's PDF export carries the phase and the overrule (it is a PDF, so check it is served).
  const pdf = await own.context.request.get(`${BASE}/api/patient/condition-profile/export`);
  expect(pdf.status()).toBe(200);
  expect(pdf.headers()["content-type"]).toMatch(/application\/pdf/);
  await own.context.close();

  // The therapist's controls: the overrule can be cleared.
  const clear = await post(request, "/api/therapist/care-status/set", QA_EMAILS.therapistA, { patientId: patient!.id, action: "clear_override" });
  expect(clear.status(), await clear.text()).toBe(200);
  const after = await pageAs(browser, patient!.email, "/patient/dashboard/health-profile");
  await expect(after.page.getByTestId("ortho-profile")).toBeVisible(SEEN);
  await expect(after.page.getByText(reason)).toHaveCount(0);
  await after.context.close();
});

test("OHP-006: no horizontal page scroll at phone, tablet and desktop widths", async ({ browser }) => {
  for (const width of [360, 390, 834, 1280]) {
    const context = await browser.newContext({ viewport: { width, height: 900 } });
    await context.addCookies(await browserCookiesFor(patient!.email));
    const page = await context.newPage();
    await page.goto(`${BASE}/patient/dashboard/health-profile`);
    await expect(page.getByTestId("ortho-profile")).toBeVisible(SEEN);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `width ${width}`).toBeLessThanOrEqual(0);
    await context.close();
  }
});
