// The neurological and Parkinson's Health Profile (Health Profile redesign,
// phase 4b): the layout the patient's page, the therapist's chart and the
// admin's chart share -- header, where things stand, four key numbers, the
// condition picture (the neurological examination with a First exam / Latest
// switch), the diary, the graph, steps and measures -- and what each viewer
// may do in it.
//
// Written, not run in the build that added it: it needs a Supabase project
// the destructive-tooling rules allow. Fixtures: one throwaway stroke patient
// and one throwaway Parkinson's patient (an intake, a completed session with
// QA Therapist A, two neurological examinations a few weeks apart for the
// stroke patient), so QA Therapist B and QA Patient A are the outsiders.
//
// patient_diary_entries, care_status_events and neuro_assessments are
// append-only, so the rows stay: disposable projects only
// (E2E_ALLOW_APPEND_ONLY_WRITES=1 or the local stack).
//
// Not covered here: the "we couldn't load" cards for an unreadable read. A
// server page cannot be made to fail one read from a browser test without
// dropping a table, which the suite's destructive rules keep to
// admin-degraded-schema.spec.ts; the degradation is unit-tested in
// src/lib/neuroProfileView.test.ts and recorded in the QA plan (THR-HP-005i).
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
  "writes append-only exams, diary entries and status events; set E2E_ALLOW_APPEND_ONLY_WRITES=1 on a disposable project"
);
test.describe.configure({ mode: "serial" });
test.setTimeout(240_000);

const db = adminClient();
const SEEN = { timeout: 60_000 };
let stroke: { id: string; email: string; name: string } | undefined;
let parkinsons: { id: string; email: string; name: string } | undefined;
let therapistAId = "";

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();
const minutesAgo = (n: number) => new Date(Date.now() - n * 60_000).toISOString();

async function post(request: APIRequestContext, path: string, email: string, data: unknown) {
  return request.post(`${BASE}${path}`, { headers: { cookie: await cookieHeaderFor(email), "content-type": "application/json" }, data });
}

async function pageAs(browser: Browser, email: string, path: string, viewport = { width: 1280, height: 900 }) {
  const context = await browser.newContext({ viewport });
  await context.addCookies(await browserCookiesFor(email));
  const page = await context.newPage();
  await page.goto(`${BASE}${path}`);
  return { page, context };
}

async function addExam(patientId: string, at: string, berg: number, walkSeconds: number) {
  const { error } = await db.from("neuro_assessments").insert({
    patient_id: patientId,
    submitted_by: therapistAId,
    submitted_by_role: "therapist",
    schema_version: 1,
    created_at: at,
    findings: {
      bilateral: { power_elbow_flexion: { left: berg > 40 ? "4" : "3", right: "5" } },
      balance: { bergTotal: berg },
      gait: { patterns: [], aids: [], tenMetreWalkSeconds: walkSeconds },
    },
  });
  expect(error, error?.message).toBeNull();
}

test.beforeAll(async () => {
  therapistAId = await profileIdFor(db, QA_EMAILS.therapistA);
  stroke = await createFixtureAccount("Neuro Profile Stroke");
  parkinsons = await createFixtureAccount("Neuro Profile PD");
  const profiles = [
    {
      patient: stroke,
      data: {
        neuro_diagnosis: "Stroke on 2 Jun, left side weaker, E2E neuro profile",
        neuro_subtype: "Stroke or brain injury",
        neuro_affected_side: "Left side",
        neuro_mobility: "Walk with a stick or frame",
        neuro_independence: "6",
        neuro_falls: "One",
      },
    },
    {
      patient: parkinsons,
      data: {
        neuro_diagnosis: "Parkinson's, diagnosed 2021, E2E neuro profile",
        neuro_subtype: "Parkinson's disease",
        neuro_affected_side: "Both sides",
        neuro_mobility: "Walk unaided",
        neuro_independence: "8",
        neuro_pd_year_diagnosed: "2021",
        neuro_pd_freezing: "Most days",
        neuro_pd_medication_times: "7 am, 1 pm and 7 pm",
      },
    },
  ];
  for (const { patient, data } of profiles) {
    const { error } = await db
      .from("patient_condition_profiles")
      .insert({ patient_id: patient.id, specialty: "neuro", status: "active", schema_version: 2, last_submitted_role: "therapist", data });
    expect(error, error?.message).toBeNull();
    await insertPastFixtureAppointment(db, {
      patient_id: patient.id,
      therapist_id: therapistAId,
      status: "completed",
      payment_status: "paid",
      visit_mode: "online",
      duration_minutes: 30,
      concern: "E2E neuro profile",
    });
  }
  // Two examinations a few weeks apart: the First exam / Latest switch and the
  // balance and walking-speed lines have something to compare.
  await addExam(stroke.id, daysAgo(30), 28, 25);
  await addExam(stroke.id, daysAgo(3), 46, 14);
});

test.afterAll(async () => {
  await deleteFixtureAccount(stroke?.id);
  await deleteFixtureAccount(parkinsons?.id);
});

test("NHP-001: the neurological chart opens in the shared layout, with the examination as its picture and the exam's lines on the graph", async ({ browser }) => {
  const { page, context } = await pageAs(browser, QA_EMAILS.therapistA, `/therapist/dashboard/health-profile/${stroke!.id}`);
  const root = page.getByTestId("neuro-profile");
  await expect(root).toBeVisible(SEEN);
  await expect(root).toHaveAttribute("data-profile-kind", "neuro");

  // The order: where things stand, key numbers, picture, diary, graph, steps, measures.
  const order = await root.locator("h2, section[aria-label]").evaluateAll((els) =>
    els.map((e) => e.getAttribute("aria-label") ?? e.textContent?.trim() ?? "")
  );
  const at = (re: RegExp) => order.findIndex((t) => re.test(t));
  expect(at(/where things stand/i)).toBeGreaterThan(-1);
  expect(at(/where things stand/i)).toBeLessThan(at(/condition picture/i));
  expect(at(/condition picture/i)).toBeLessThan(at(/^diary$/i));
  expect(at(/^diary$/i)).toBeLessThan(at(/^progress$/i));
  expect(at(/^progress$/i)).toBeLessThan(at(/^steps$/i));
  expect(at(/^steps$/i)).toBeLessThan(at(/^measures$/i));

  // Four key numbers, always four: balance and walking speed come from the exams.
  await expect(root.getByText("Falls, last 3 months")).toBeVisible();
  await expect(root.getByText("46", { exact: true }).first()).toBeVisible();

  // The Berg line is drawn from the examinations (one dot each), and is in the table once.
  await root.getByRole("button", { name: /Balance/ }).first().click();
  const table = root.getByRole("table", { name: /first, latest and goal reading/i });
  await expect(table.getByRole("rowheader", { name: /Berg Balance Scale/ })).toHaveCount(1);

  // The picture: the figure for the affected side, the switch, and the existing
  // "Record a re-examination" door.
  await expect(root.getByTestId("affected-side")).toContainText("Left side");
  await root.getByRole("button", { name: "First exam" }).click();
  await expect(root.getByRole("button", { name: "First exam" })).toHaveAttribute("aria-pressed", "true");
  await expect(root.getByText(/Examined .*Compared with/)).toHaveCount(0);
  await root.getByRole("button", { name: "Latest" }).click();
  await expect(root.getByRole("button", { name: /Record a re-examination/ })).toBeVisible();
  await context.close();
});

test("NHP-002: a patient writes a fall in their diary; it is theirs until the physiotherapist confirms it, and only then moves the status", async ({ browser }) => {
  // The patient writes it through the dialog: only the kinds a stroke record keeps.
  const own = await pageAs(browser, stroke!.email, "/patient/dashboard/health-profile");
  await expect(own.page.getByTestId("neuro-profile")).toBeVisible(SEEN);
  await own.page.getByRole("button", { name: /Log a fall or a near miss/ }).click();
  const dialog = own.page.getByRole("dialog");
  await expect(dialog.getByLabel("A fall")).toBeVisible();
  await expect(dialog.getByLabel("Nearly fell")).toBeVisible();
  await expect(dialog.getByLabel("Feet getting stuck")).toHaveCount(0);
  await dialog.getByLabel("A fall").check();
  await dialog.getByLabel("No, I was not hurt").check();
  await dialog.getByRole("button", { name: "Save in my diary" }).click();
  await expect(own.page.getByTestId("diary-panel").getByText(/A fall, not hurt/)).toBeVisible(SEEN);
  await expect(own.page.getByTestId("diary-panel").getByText("You noted this").first()).toBeVisible();
  // Unconfirmed: the pill is not "Needs attention" because of it.
  await expect(own.page.getByTestId("neuro-profile").getByText("Needs attention")).toHaveCount(0);
  // The patient has no Confirm control.
  await expect(own.page.getByRole("button", { name: /^Confirm/ })).toHaveCount(0);
  await own.context.close();

  // An admin reads the diary and nothing more: no log button, no Confirm.
  const admin = await pageAs(browser, QA_EMAILS.admin, `/admin/dashboard/conditions/${stroke!.id}`);
  await expect(admin.page.getByTestId("diary-panel")).toBeVisible(SEEN);
  await expect(admin.page.getByTestId("diary-panel").getByText(/A fall, not hurt|Fall, not hurt/)).toBeVisible();
  await expect(admin.page.getByRole("button", { name: /^Confirm/ })).toHaveCount(0);
  await expect(admin.page.getByRole("button", { name: /^Log / })).toHaveCount(0);
  await admin.context.close();

  // The assigned therapist sees it waiting and confirms it.
  const treating = await pageAs(browser, QA_EMAILS.therapistA, `/therapist/dashboard/health-profile/${stroke!.id}`);
  const waiting = treating.page.getByTestId("diary-awaiting");
  await expect(waiting).toBeVisible(SEEN);
  await waiting.getByRole("button", { name: /^Confirm/ }).first().click();
  await expect(treating.page.getByTestId("diary-awaiting")).toHaveCount(0, SEEN);
  // A confirmed fall after the last review is "a new fall": the pill needs attention.
  await expect(treating.page.getByTestId("neuro-profile").getByText("Needs attention").first()).toBeVisible(SEEN);
  await treating.context.close();

  const patientAgain = await pageAs(browser, stroke!.email, "/patient/dashboard/health-profile");
  await expect(patientAgain.page.getByTestId("neuro-profile").getByText("Needs attention").first()).toBeVisible(SEEN);
  await patientAgain.context.close();
});

test("NHP-003: the Parkinson's profile adds the ON-time chip, the freezing diary and the freezing kind; a stroke record is refused it", async ({ request, browser }) => {
  const asStroke = await post(request, "/api/patient/diary/add", stroke!.email, {
    kind: "freezing",
    occurredAt: minutesAgo(30),
    details: { period: "episode", count: 1 },
  });
  expect(asStroke.status()).toBe(400);
  expect((await asStroke.json()).code).toBe("diary_kind_not_offered");

  // The Parkinson's therapist records ON-time tests, then the chart says so.
  const dose = new Date(Date.now() - 90 * 60_000).toISOString();
  for (const [value, ago] of [
    [14.2, 60 * 24 * 20],
    [10.8, 30],
  ] as const) {
    const res = await post(request, "/api/therapist/measurements/submit", QA_EMAILS.therapistA, {
      patientId: parkinsons!.id,
      measurement: {
        measureKey: "tug",
        value,
        items: [value, value, value],
        measuredAt: minutesAgo(ago),
        conditions: { setting: "in_person", medicationState: "on", lastDoseAt: dose },
      },
    });
    expect(res.status(), await res.text()).toBe(200);
  }

  const own = await pageAs(browser, parkinsons!.email, "/patient/dashboard/health-profile");
  const root = own.page.getByTestId("neuro-profile");
  await expect(root).toBeVisible(SEEN);
  await expect(root).toHaveAttribute("data-profile-kind", "neuro_parkinsons");
  await expect(root.getByText(/Tested in ON time/)).toBeVisible();
  await expect(root.getByTestId("freezing-card")).toBeVisible();
  await root.getByRole("button", { name: /Log feet getting stuck, a fall or a near miss/ }).click();
  const dialog = own.page.getByRole("dialog");
  await dialog.getByLabel("Feet getting stuck").check();
  await dialog.getByLabel("A whole week, added up").check();
  await dialog.getByLabel(/How many times/).fill("6");
  await dialog.getByLabel("Turning round").check();
  await dialog.getByRole("button", { name: "Save in my diary" }).click();
  await expect(root.getByTestId("diary-panel").getByText(/Feet got stuck 6 times in a week/)).toBeVisible(SEEN);
  await own.context.close();
});

test("NHP-004: the patient's PDF export carries the diary as counts, and the clinic's written summary names the physiotherapist", async ({ request, browser }) => {
  const summary = "Arun now manages most of his day on his own. Next: stairs.";
  const set = await post(request, "/api/therapist/care-status/set", QA_EMAILS.therapistA, { patientId: stroke!.id, action: "set_summary", text: summary });
  expect(set.status(), await set.text()).toBe(200);

  const own = await pageAs(browser, stroke!.email, "/patient/dashboard/health-profile");
  const stand = own.page.getByRole("region", { name: "Where things stand" });
  await expect(stand).toContainText(summary, SEEN);
  // The byline names the physiotherapist and the date, never a bare "written by".
  await expect(stand).toContainText(/QA Therapist A|Therapist A/i);
  await own.context.close();

  const pdf = await request.get(`${BASE}/api/patient/condition-profile/export`, { headers: { cookie: await cookieHeaderFor(stroke!.email) } });
  expect(pdf.status()).toBe(200);
  expect(pdf.headers()["content-type"]).toContain("application/pdf");
  const json = await request.get(`${BASE}/api/patient/condition-profile/export?format=json`, { headers: { cookie: await cookieHeaderFor(stroke!.email) } });
  const payload = await json.json();
  expect(payload.patient_diary_entries.length).toBeGreaterThan(0);
});

test("NHP-005: an outsider cannot open the chart, and a patient's own page has none of the therapist's controls", async ({ browser }) => {
  const own = await pageAs(browser, stroke!.email, "/patient/dashboard/health-profile");
  await expect(own.page.getByTestId("neuro-profile")).toBeVisible(SEEN);
  await expect(own.page.getByRole("button", { name: "Record a test" })).toHaveCount(0);
  await expect(own.page.getByRole("button", { name: "Goal and steps" })).toHaveCount(0);
  await expect(own.page.getByRole("button", { name: "Phase and status" })).toHaveCount(0);
  await expect(own.page.getByRole("button", { name: /Record a re-examination|Record an examination/ })).toHaveCount(0);
  await own.context.close();

  const outsider = await pageAs(browser, QA_EMAILS.therapistB, `/therapist/dashboard/health-profile/${stroke!.id}`);
  await expect(outsider.page.getByTestId("neuro-profile")).toHaveCount(0);
  await outsider.context.close();

  const treating = await pageAs(browser, QA_EMAILS.therapistA, `/therapist/dashboard/health-profile/${stroke!.id}`);
  await expect(treating.page.getByRole("button", { name: "Record a test" })).toBeVisible(SEEN);
  await expect(treating.page.getByRole("button", { name: "Goal and steps" })).toBeVisible();
  await expect(treating.page.getByRole("button", { name: "Phase and status" })).toBeVisible();
  await treating.context.close();
});
