// The paediatric examination (Health Profile redesign, phases 5a and 5b): a therapist records an exam at the
// route and the family reads it at RLS; the route refuses what the chart
// does not have (an unknown milestone, a date before birth or in the
// future, the two timed counts that belong to Record a test); a patient not
// recorded as paediatric is a 400 at both doors; a therapist not on the
// patient is refused and reads nothing; the admin door writes an audit row;
// and the Done gate.
//
// THE DONE GATE: a paediatric Done requires this exam, like the Pain Map and
// the neurological exam (PEDS_EXAM_REQUIRED_FOR_DONE is true since phase 5b,
// which shipped the dialog and SessionPedsExamStep). PE-005 asserts the gate
// is ON: refused 409 peds_exam_required until this session's exam exists,
// passes after it. PE-006 to PE-008 are the screens: the page structure for
// the parent and the therapist, the implausible date of birth, and a rough
// ("approximate") date.
//
// Fixtures: a throwaway paediatric patient (born at 30 weeks, a date of
// birth on the profile), a throwaway neurological patient, one completed
// session each with QA Therapist A; QA Therapist B has no relationship.
//
// peds_assessments is append-only (a trigger refuses update and delete), so
// the exams this writes stay -- disposable projects only. For the same
// reason the fixture accounts cannot be deleted afterwards; the cleanup
// says so rather than failing the run.
import { test, expect, request as playwrightRequest, type Browser } from "@playwright/test";
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
  rlsClientFor,
} from "./helpers";
import { PEDS_EXAM_REQUIRED_FOR_DONE } from "../src/lib/sessionCompletion";

test.skip(
  process.env.E2E_ALLOW_APPEND_ONLY_WRITES !== "1" && process.env.CI_LOCAL_STACK !== "1",
  "writes append-only paediatric exams; set E2E_ALLOW_APPEND_ONLY_WRITES=1 on a disposable project"
);

test.describe.configure({ mode: "serial" });

const MARKER = "E2E peds-exam";
const HOUR = 60 * 60 * 1000;
const BIRTH_DATE = "2025-06-01";
const db = adminClient();
let child: { id: string; email: string; name: string } | undefined;
let neuroPatient: { id: string; email: string; name: string } | undefined;
let therapistAId = "";

const FINDINGS = {
  milestones: {
    sitting_without_support: { status: "achieved", firstSeenOn: "2026-01-10", source: "seen" },
    hands_knees_crawling: { status: "achieved", firstSeenOn: "2026-03-02", source: "reported" },
    walking_alone: { status: "not_yet" },
  },
  equipment: "Ankle splints both sides",
  notes: `${MARKER}: first examination`,
};

test.beforeAll(async () => {
  therapistAId = await profileIdFor(db, QA_EMAILS.therapistA);
  child = await createFixtureAccount("Peds Exam", { date_of_birth: BIRTH_DATE, gender: "Female" });
  const { error: childProfile } = await db.from("patient_condition_profiles").insert({
    patient_id: child.id,
    specialty: "pediatrics",
    status: "active",
    data: {
      peds_caregiver_name: "Priya Sharma",
      peds_caregiver_relationship: "Mother",
      peds_concern: `${MARKER}: not walking yet`,
      peds_weeks_at_birth: "30 weeks",
    },
  });
  expect(childProfile, childProfile?.message).toBeNull();
  neuroPatient = await createFixtureAccount("Peds Exam Neuro");
  const { error: neuroProfile } = await db.from("patient_condition_profiles").insert({
    patient_id: neuroPatient.id,
    specialty: "neuro",
    status: "active",
    data: { neuro_diagnosis: `${MARKER}: stroke` },
  });
  expect(neuroProfile, neuroProfile?.message).toBeNull();
  // A delivered session each: what makes Therapist A "assigned" and what
  // the exam gate (hasStartedSessionWithPatient) asks for.
  for (const patient of [child, neuroPatient]) {
    await insertPastFixtureAppointment(db, {
      patient_id: patient.id,
      therapist_id: therapistAId,
      status: "completed",
      payment_status: "paid",
      visit_mode: "online",
      duration_minutes: 30,
      concern: MARKER,
    });
  }
});

test.afterAll(async () => {
  await db.from("appointments").delete().like("concern", `${MARKER}%`).eq("status", "confirmed");
  await deleteFixtureAccount(child?.id);
  await deleteFixtureAccount(neuroPatient?.id);
});

async function post(path: string, email: string, data: unknown) {
  const ctx = await playwrightRequest.newContext({ extraHTTPHeaders: { Cookie: await cookieHeaderFor(email) } });
  try {
    const res = await ctx.post(`${BASE}${path}`, { data });
    const text = await res.text();
    let body: Record<string, unknown> = {};
    try {
      body = JSON.parse(text);
    } catch {
      /* not JSON */
    }
    return { status: res.status(), body, text };
  } finally {
    await ctx.dispose();
  }
}

const THERAPIST_ROUTE = "/api/therapist/peds-assessments/submit";
const ADMIN_ROUTE = "/api/admin/peds-assessments/submit";

test("PE-001: a therapist records a paediatric exam and the family reads it back, append-only", async () => {
  const res = await post(THERAPIST_ROUTE, QA_EMAILS.therapistA, { patientId: child!.id, findings: FINDINGS });
  expect(res.status, res.text).toBe(200);

  const { data: rows } = await db
    .from("peds_assessments")
    .select("id, submitted_by, submitted_by_role, schema_version, findings")
    .eq("patient_id", child!.id);
  expect(rows ?? []).toHaveLength(1);
  const row = rows![0];
  expect(row.submitted_by).toBe(therapistAId);
  expect(row.submitted_by_role).toBe("therapist");
  expect(row.schema_version).toBe(1);
  // Stored exactly as validated: not assessed is absent, not yet is a value.
  const findings = row.findings as { milestones: Record<string, unknown> };
  expect(Object.keys(findings.milestones).sort()).toEqual(["hands_knees_crawling", "sitting_without_support", "walking_alone"]);
  expect(findings.milestones.walking_alone).toEqual({ status: "not_yet" });

  // The family reads their own; the treating therapist reads it too.
  const family = await rlsClientFor(child!.email);
  const { data: own } = await family.from("peds_assessments").select("id").eq("patient_id", child!.id);
  expect(own ?? []).toHaveLength(1);
  const treating = await rlsClientFor(QA_EMAILS.therapistA);
  const { data: ours } = await treating.from("peds_assessments").select("id").eq("patient_id", child!.id);
  expect(ours ?? []).toHaveLength(1);

  // Append-only at the database: an update raises even for the service role.
  const { error: rewrite } = await db.from("peds_assessments").update({ findings: { notes: "rewritten" } }).eq("id", row.id);
  expect(rewrite?.message ?? "").toMatch(/append-only/);
  const { error: removal } = await db.from("peds_assessments").delete().eq("id", row.id);
  expect(removal?.message ?? "").toMatch(/append-only/);
});

test("PE-002: the route refuses what the chart does not have", async () => {
  const refusals: [unknown, RegExp][] = [
    [{ milestones: { running: { status: "achieved", firstSeenOn: "2026-05-01", source: "seen" } } }, /milestone this chart does not have/],
    [{ milestones: { standing_alone: { status: "achieved", source: "seen" } } }, /date it was first seen/],
    [{ milestones: { standing_alone: { status: "achieved", source: "seen", firstSeenOn: "2025-05-01" } } }, /before the child's date of birth/],
    [{ milestones: { standing_alone: { status: "achieved", source: "seen", firstSeenOn: "2099-01-01" } } }, /in the future/],
    [{ milestones: { standing_alone: { status: "emerging" } } }, /saw it or the family reported it/],
    [{ milestones: {}, standingSeconds: 8 }, /Record a test/],
    [{ milestones: {}, independentSteps: 3 }, /Record a test/],
    [{ gmfcsLevel: 6 }, /Level I to Level V/],
    [{}, /at least one finding/],
  ];
  for (const [findings, message] of refusals) {
    const res = await post(THERAPIST_ROUTE, QA_EMAILS.therapistA, { patientId: child!.id, findings });
    expect(res.status, JSON.stringify(findings)).toBe(400);
    expect(String(res.body.error)).toMatch(message);
  }
  // A malformed body is a 400, not a 500 (parseJsonBody).
  const ctx = await playwrightRequest.newContext({ extraHTTPHeaders: { Cookie: await cookieHeaderFor(QA_EMAILS.therapistA) } });
  const broken = await ctx.post(`${BASE}${THERAPIST_ROUTE}`, { headers: { "content-type": "application/json" }, data: "{not json" });
  expect(broken.status()).toBe(400);
  await ctx.dispose();
  // Nothing refused was written.
  const { count } = await db.from("peds_assessments").select("id", { count: "exact", head: true }).eq("patient_id", child!.id);
  expect(count).toBe(1);
});

test("PE-003: a patient not recorded as paediatric is a 400 at both doors", async () => {
  const findings = { milestones: { walking_alone: { status: "not_yet" } } };
  const therapist = await post(THERAPIST_ROUTE, QA_EMAILS.therapistA, { patientId: neuroPatient!.id, findings });
  expect(therapist.status, therapist.text).toBe(400);
  expect(therapist.body.code).toBe("not_paediatric");
  const admin = await post(ADMIN_ROUTE, QA_EMAILS.admin, { patientId: neuroPatient!.id, findings });
  expect(admin.status, admin.text).toBe(400);
  expect(admin.body.code).toBe("not_paediatric");
  const { count } = await db.from("peds_assessments").select("id", { count: "exact", head: true }).eq("patient_id", neuroPatient!.id);
  expect(count).toBe(0);
});

test("PE-004: a therapist not on the patient, and the patient, are refused and read nothing", async () => {
  const findings = { milestones: { walking_alone: { status: "not_yet" } } };
  const outsiderWrite = await post(THERAPIST_ROUTE, QA_EMAILS.therapistB, { patientId: child!.id, findings });
  expect(outsiderWrite.status).toBe(403);
  const patientWrite = await post(THERAPIST_ROUTE, child!.email, { patientId: child!.id, findings });
  expect(patientWrite.status).toBe(403);
  const patientAdminDoor = await post(ADMIN_ROUTE, child!.email, { patientId: child!.id, findings });
  expect(patientAdminDoor.status).toBe(403);

  // Both halves at RLS, so a policy that refused everybody could not pass.
  const outsider = await rlsClientFor(QA_EMAILS.therapistB);
  const { data: theirs, error } = await outsider.from("peds_assessments").select("id").eq("patient_id", child!.id);
  expect(error).toBeNull();
  expect(theirs ?? []).toHaveLength(0);
  const treating = await rlsClientFor(QA_EMAILS.therapistA);
  const { data: ours } = await treating.from("peds_assessments").select("id").eq("patient_id", child!.id);
  expect((ours ?? []).length).toBeGreaterThanOrEqual(1);
});

test("PE-004b: an admin records one on the family's behalf, with an audit row", async () => {
  const adminId = await profileIdFor(db, QA_EMAILS.admin);
  const res = await post(ADMIN_ROUTE, QA_EMAILS.admin, {
    patientId: child!.id,
    findings: { milestones: { standing_with_help: { status: "emerging", source: "reported" } }, gmfcsLevel: 2 },
  });
  expect(res.status, res.text).toBe(200);
  const { data: row } = await db
    .from("peds_assessments")
    .select("submitted_by, submitted_by_role")
    .eq("patient_id", child!.id)
    .eq("submitted_by_role", "admin")
    .single();
  expect(row?.submitted_by).toBe(adminId);
  const { data: audit } = await db
    .from("admin_activity_log")
    .select("actor_id")
    .eq("action", "peds_assessment.create")
    .eq("target_id", child!.id)
    .limit(1)
    .maybeSingle();
  expect(audit?.actor_id).toBe(adminId);
});

async function startedAppointment(patientId: string, concern: string): Promise<string> {
  for (let h = 2; h <= 12; h++) {
    const slot = new Date(Date.now() - h * HOUR);
    slot.setMinutes(0, 0, 0);
    const { data } = await db
      .from("appointments")
      .insert({
        patient_id: patientId,
        therapist_id: therapistAId,
        slot_time: slot.toISOString(),
        status: "confirmed",
        payment_status: "paid",
        visit_mode: "online",
        duration_minutes: 30,
        concern,
      })
      .select("id")
      .single();
    if (data) return data.id as string;
  }
  throw new Error("no free started hour for the Done session");
}

async function noteFor(appointmentId: string) {
  const note = await post("/api/therapist/session-notes/submit", QA_EMAILS.therapistA, {
    appointmentId,
    data: { treated: "Supported standing play", response: "Improved", next_plan: "Cruising along the sofa" },
    freeText: "",
    baseUpdatedAt: null,
  });
  expect(note.status, note.text).toBe(200);
}

test("PE-005: a paediatric Done requires the exam - refused without it, passes with it", async () => {
  test.setTimeout(120_000);
  // The gate is ON (the dialog and SessionPedsExamStep exist).
  expect(PEDS_EXAM_REQUIRED_FOR_DONE).toBe(true);
  // A child with no exam at all, so nothing sits in the window.
  const bare = await createFixtureAccount("Peds Exam Bare", { date_of_birth: BIRTH_DATE, gender: "Male" });
  try {
    await db.from("patient_condition_profiles").insert({ patient_id: bare.id, specialty: "pediatrics", status: "active", data: { peds_concern: `${MARKER}: bare` } });
    const appointmentId = await startedAppointment(bare.id, `${MARKER} done`);
    await noteFor(appointmentId);
    const refused = await post("/api/appointments/complete-session", QA_EMAILS.therapistA, { appointmentId });
    expect(refused.status).toBe(409);
    expect(refused.body.code).toBe("peds_exam_required");
    const exam = await post(THERAPIST_ROUTE, QA_EMAILS.therapistA, {
      patientId: bare.id,
      findings: { milestones: { standing_alone: { status: "emerging", source: "seen" } } },
    });
    expect(exam.status, exam.text).toBe(200);
    const done = await post("/api/appointments/complete-session", QA_EMAILS.therapistA, { appointmentId });
    expect(done.status, done.text).toBe(200);
  } finally {
    await deleteFixtureAccount(bare.id);
  }
});

test("PE-005b: a paediatric Done with this session's exam already recorded passes on the note", async () => {
  test.setTimeout(90_000);
  const appointmentId = await startedAppointment(child!.id, `${MARKER} done with exam`);
  await noteFor(appointmentId);
  // PE-001's exam sits inside the window (it was written after the slot opened).
  const done = await post("/api/appointments/complete-session", QA_EMAILS.therapistA, { appointmentId });
  expect(done.status, done.text).toBe(200);
});

async function pageAs(browser: Browser, email: string, path: string, viewport = { width: 1280, height: 900 }) {
  const context = await browser.newContext({ viewport });
  await context.addCookies(await browserCookiesFor(email));
  const page = await context.newPage();
  await page.goto(`${BASE}${path}`);
  return { page, context };
}

const SEEN = { timeout: 60_000 };

test("PE-006: the page is the milestone chart, in the parent's voice and the clinician's", async ({ browser }) => {
  test.setTimeout(120_000);
  // The parent: the child's name, who told us, the chart, the checklist; no clinician words.
  const own = await pageAs(browser, child!.email, "/patient/dashboard/health-profile", { width: 390, height: 844 });
  await expect(own.page.getByTestId("peds-profile")).toBeVisible(SEEN);
  await expect(own.page.getByText("Told by Priya Sharma, her mother")).toBeVisible();
  await expect(own.page.getByRole("heading", { name: "How your child is moving" })).toBeVisible();
  await expect(own.page.getByTestId("peds-chart")).toBeVisible();
  await expect(own.page.getByRole("button", { name: /Record the paediatric exam|Record a re-examination/ })).toHaveCount(0);
  const text = await own.page.getByTestId("peds-profile").innerText();
  expect(text).not.toMatch(/triage|specialty|referral|doctor's review|GMFCS level/i);
  expect(await own.page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await own.context.close();

  // The treating therapist: the same layout with the recording button and the dialog.
  const treating = await pageAs(browser, QA_EMAILS.therapistA, `/therapist/dashboard/health-profile/${child!.id}`);
  await expect(treating.page.getByTestId("peds-profile")).toBeVisible(SEEN);
  await treating.page.getByRole("button", { name: "Record a re-examination" }).click();
  const dialog = treating.page.getByTestId("peds-exam-dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText(/Standing time and independent steps are not here/)).toBeVisible();
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toHaveCount(0);
  await treating.context.close();

  // Done and Done-gate surface: the admin sees the same layout.
  const admin = await pageAs(browser, QA_EMAILS.admin, `/admin/dashboard/conditions/${child!.id}`);
  await expect(admin.page.getByTestId("peds-profile")).toBeVisible(SEEN);
  await admin.context.close();
});

test("PE-007: an implausible date of birth is not charted - a card to the clinician, a neutral line to the family", async ({ browser }) => {
  test.setTimeout(120_000);
  await db.from("profiles").update({ date_of_birth: "1990-04-01" }).eq("id", child!.id);
  try {
    const treating = await pageAs(browser, QA_EMAILS.therapistA, `/therapist/dashboard/health-profile/${child!.id}`);
    await expect(treating.page.getByTestId("peds-dob-card")).toContainText("Check the date of birth", SEEN);
    await expect(treating.page.locator("[data-testid=peds-chart]")).toHaveCount(0);
    await treating.context.close();
    const own = await pageAs(browser, child!.email, "/patient/dashboard/health-profile");
    await expect(own.page.getByTestId("peds-dob-card")).toContainText("We're checking your child's date of birth", SEEN);
    await expect(own.page.locator("[data-testid=peds-chart]")).toHaveCount(0);
    await own.context.close();
  } finally {
    await db.from("profiles").update({ date_of_birth: BIRTH_DATE }).eq("id", child!.id);
  }
});

test("PE-008: a parent's rough date is kept as approximate; a seen date must be exact", async () => {
  const rough = await post(THERAPIST_ROUTE, QA_EMAILS.therapistA, {
    patientId: child!.id,
    findings: { milestones: { standing_with_help: { status: "achieved", firstSeenOn: "2026-02-01", source: "reported", approximate: true } } },
  });
  expect(rough.status, rough.text).toBe(200);
  const { data } = await db.from("peds_assessments").select("findings").eq("patient_id", child!.id).order("created_at", { ascending: false }).limit(1).single();
  expect((data!.findings as { milestones: Record<string, { approximate?: boolean }> }).milestones.standing_with_help.approximate).toBe(true);
  const seen = await post(THERAPIST_ROUTE, QA_EMAILS.therapistA, {
    patientId: child!.id,
    findings: { milestones: { standing_with_help: { status: "achieved", firstSeenOn: "2026-02-01", source: "seen", approximate: true } } },
  });
  expect(seen.status).toBe(400);
  expect(String(seen.body.error)).toMatch(/exact/);
});
