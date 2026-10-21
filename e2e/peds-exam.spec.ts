// The paediatric examination's server side (Health Profile redesign, phase
// 5a; no screen draws it yet -- the dialog, the milestone-window chart and
// SessionPedsExamStep are phase 5b): a therapist records an exam at the
// route and the family reads it at RLS; the route refuses what the chart
// does not have (an unknown milestone, a date before birth or in the
// future, the two timed counts that belong to Record a test); a patient not
// recorded as paediatric is a 400 at both doors; a therapist not on the
// patient is refused and reads nothing; the admin door writes an audit row;
// and the Done gate.
//
// THE DONE GATE: the owner's decision is that a paediatric Done requires
// this exam, like the Pain Map and the neurological exam. The server half
// is built but switched off (PEDS_EXAM_REQUIRED_FOR_DONE) until the note
// dialog can record one, so PE-005 asserts whichever state the constant is
// in: off, a paediatric Done passes on the note alone; on, it is refused 409
// peds_exam_required until this session's exam exists.
//
// Fixtures: a throwaway paediatric patient (born at 30 weeks, a date of
// birth on the profile), a throwaway neurological patient, one completed
// session each with QA Therapist A; QA Therapist B has no relationship.
//
// peds_assessments is append-only (a trigger refuses update and delete), so
// the exams this writes stay -- disposable projects only. For the same
// reason the fixture accounts cannot be deleted afterwards; the cleanup
// says so rather than failing the run.
import { test, expect, request as playwrightRequest } from "@playwright/test";
import {
  BASE,
  QA_EMAILS,
  adminClient,
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

test("PE-005: a paediatric Done follows the gate's switch", async () => {
  test.setTimeout(90_000);
  let appointmentId = "";
  for (let h = 2; h <= 12 && !appointmentId; h++) {
    const slot = new Date(Date.now() - h * HOUR);
    slot.setMinutes(0, 0, 0);
    const { data } = await db
      .from("appointments")
      .insert({
        patient_id: child!.id,
        therapist_id: therapistAId,
        slot_time: slot.toISOString(),
        status: "confirmed",
        payment_status: "paid",
        visit_mode: "online",
        duration_minutes: 30,
        concern: `${MARKER} done`,
      })
      .select("id")
      .single();
    if (data) appointmentId = data.id as string;
  }
  expect(appointmentId, "no free started hour for the Done session").not.toBe("");
  const note = await post("/api/therapist/session-notes/submit", QA_EMAILS.therapistA, {
    appointmentId,
    data: { treated: "Supported standing play", response: "Improved", next_plan: "Cruising along the sofa" },
    freeText: "",
    baseUpdatedAt: null,
  });
  expect(note.status, note.text).toBe(200);

  if (!PEDS_EXAM_REQUIRED_FOR_DONE) {
    // Off until SessionPedsExamStep ships (phase 5b): the note alone
    // finishes a paediatric session, so nobody is blocked with nothing to
    // press -- whether or not an exam sits in the window.
    const done = await post("/api/appointments/complete-session", QA_EMAILS.therapistA, { appointmentId });
    expect(done.status, done.text).toBe(200);
    return;
  }

  // On: refused by its own code until this session has its exam -- unless
  // an earlier run's exam already sits inside the window.
  const { data: slotRow } = await db.from("appointments").select("slot_time").eq("id", appointmentId).single();
  const windowStart = new Date(new Date(slotRow!.slot_time as string).getTime() - HOUR).toISOString();
  const { count: inWindow } = await db
    .from("peds_assessments")
    .select("id", { count: "exact", head: true })
    .eq("patient_id", child!.id)
    .eq("submitted_by", therapistAId)
    .gte("created_at", windowStart);
  if (!inWindow) {
    const refused = await post("/api/appointments/complete-session", QA_EMAILS.therapistA, { appointmentId });
    expect(refused.status).toBe(409);
    expect(refused.body.code).toBe("peds_exam_required");
  }
  const exam = await post(THERAPIST_ROUTE, QA_EMAILS.therapistA, {
    patientId: child!.id,
    findings: { milestones: { standing_alone: { status: "emerging", source: "seen" } } },
  });
  expect(exam.status, exam.text).toBe(200);
  const done = await post("/api/appointments/complete-session", QA_EMAILS.therapistA, { appointmentId });
  expect(done.status, done.text).toBe(200);
});
