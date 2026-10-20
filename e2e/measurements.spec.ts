// The shared measurement layer and the milestone layer, at the routes
// (Health Profile redesign, phase 2a -- no screen draws them yet, so this
// drives the API the way neuro-exam.spec.ts NE-003/NE-004 do and asserts
// the rows and the RLS beneath it).
//
// Fixtures: two throwaway neurological patients of their own -- one whose
// intake says Parkinson's disease (profile kind neuro_parkinsons, where the
// Timed Up and Go is stored here with ON/OFF and three trials), one
// ordinary neurological patient (whose TUG belongs to the neurological
// exam, so storing it here is refused) -- each with one completed session
// with QA Therapist A. QA Therapist B has no relationship to either.
//
// Phase 3a adds MS-006 to MS-008: the phase and status override
// (care_status_events, /api/{therapist,admin}/care-status/set), the chair
// stand's used-arms rule at the route, and the six-minute walk equation
// setting.
//
// outcome_measurements, care_milestone_events and care_status_events are
// append-only (a trigger
// refuses update and delete), so the rows this writes stay -- disposable
// projects only. For the same reason the fixture accounts cannot be deleted
// afterwards; the cleanup says so rather than failing the run.
import { test, expect, type APIRequestContext } from "@playwright/test";
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

test.skip(
  process.env.E2E_ALLOW_APPEND_ONLY_WRITES !== "1" && process.env.CI_LOCAL_STACK !== "1",
  "writes append-only measurements; set E2E_ALLOW_APPEND_ONLY_WRITES=1 on a disposable project"
);

test.describe.configure({ mode: "serial" });

const MARKER = "E2E measurements";
const db = adminClient();
let parkinsons: { id: string; email: string; name: string } | undefined;
let stroke: { id: string; email: string; name: string } | undefined;
let therapistAId = "";
let provingMeasurementId = "";
let milestoneId = "";
let originalLicensed: unknown = [];
let originalWalkEquation: unknown = null;

function minutesAgo(n: number) {
  return new Date(Date.now() - n * 60_000).toISOString();
}

/** A Parkinson's TUG: ON, the last dose, all three trials averaging 11.0 s. */
function parkinsonsTug(value = 11, items: number[] = [10.8, 11.1, 11.1]) {
  return {
    measureKey: "tug",
    value,
    items,
    measuredAt: minutesAgo(10),
    conditions: { setting: "in_person", medicationState: "on", lastDoseAt: minutesAgo(120), walkingAid: "Stick" },
  };
}

async function post(request: APIRequestContext, path: string, email: string, data: unknown) {
  return request.post(`${BASE}${path}`, {
    headers: { cookie: await cookieHeaderFor(email), "content-type": "application/json" },
    data,
  });
}

test.beforeAll(async () => {
  therapistAId = await profileIdFor(db, QA_EMAILS.therapistA);
  const { data: settings } = await db.from("site_settings").select("enabled_licensed_measures").eq("id", true).maybeSingle();
  originalLicensed = settings?.enabled_licensed_measures ?? [];
  const { data: walk } = await db.from("site_settings").select("six_minute_walk_equation").eq("id", true).maybeSingle();
  originalWalkEquation = walk?.six_minute_walk_equation ?? null;

  parkinsons = await createFixtureAccount("Measurements Parkinsons");
  stroke = await createFixtureAccount("Measurements Stroke");
  for (const [patient, data] of [
    [parkinsons, { neuro_diagnosis: "E2E Parkinson's", neuro_subtype: "Parkinson's disease" }],
    [stroke, { neuro_diagnosis: "E2E stroke, left side" }],
  ] as const) {
    const { error } = await db.from("patient_condition_profiles").insert({
      patient_id: patient.id,
      specialty: "neuro",
      status: "active",
      data,
    });
    expect(error, error?.message).toBeNull();
    // A delivered session: what makes Therapist A "assigned" and what the
    // measurement gate (hasStartedSessionWithPatient) asks for.
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
  await db.from("site_settings").update({ enabled_licensed_measures: originalLicensed }).eq("id", true);
  await db.from("site_settings").update({ six_minute_walk_equation: originalWalkEquation }).eq("id", true);
  await deleteFixtureAccount(parkinsons?.id);
  await deleteFixtureAccount(stroke?.id);
});

test("MS-001: the treating therapist records a Parkinson's TUG with ON/OFF and three trials", async ({ request }) => {
  const res = await post(request, "/api/therapist/measurements/submit", QA_EMAILS.therapistA, {
    patientId: parkinsons!.id,
    measurement: parkinsonsTug(),
  });
  expect(res.status(), await res.text()).toBe(200);
  const body = await res.json();
  expect(body.measurement).toMatchObject({
    measureKey: "tug",
    value: 11,
    items: [10.8, 11.1, 11.1],
    recordedByRole: "therapist",
  });
  expect(body.measurement.conditions.medicationState).toBe("on");
  provingMeasurementId = body.measurement.id;

  // Fewer than three trials, or a value that is not their average, is refused.
  const short = await post(request, "/api/therapist/measurements/submit", QA_EMAILS.therapistA, {
    patientId: parkinsons!.id,
    measurement: parkinsonsTug(11, [10.8, 11.2]),
  });
  expect(short.status()).toBe(400);
  expect((await short.json()).error).toMatch(/all 3 trials/);

  // The patient reads it at RLS; nobody can rewrite it, the service role included.
  const own = await rlsClientFor(parkinsons!.email);
  const { data: theirs } = await own.from("outcome_measurements").select("id").eq("patient_id", parkinsons!.id);
  expect((theirs ?? []).map((r) => r.id)).toContain(provingMeasurementId);
  const { error: rewrite } = await db.from("outcome_measurements").update({ value: 9 }).eq("id", provingMeasurementId);
  expect(rewrite?.message ?? "").toMatch(/append-only/);
});

test("MS-002: an unassigned therapist and a patient are refused, and RLS shows the outsider nothing", async ({ request }) => {
  const outsider = await post(request, "/api/therapist/measurements/submit", QA_EMAILS.therapistB, {
    patientId: parkinsons!.id,
    measurement: parkinsonsTug(),
  });
  expect(outsider.status()).toBe(403);

  for (const email of [parkinsons!.email, QA_EMAILS.patientA]) {
    const res = await post(request, "/api/therapist/measurements/submit", email, {
      patientId: parkinsons!.id,
      measurement: parkinsonsTug(),
    });
    expect(res.status(), email).toBe(403);
  }

  const outsiderDb = await rlsClientFor(QA_EMAILS.therapistB);
  const { data: none, error } = await outsiderDb.from("outcome_measurements").select("id").eq("patient_id", parkinsons!.id);
  expect(error).toBeNull();
  expect(none ?? []).toHaveLength(0);
  // ...while the treating therapist reads it, so a policy refusing
  // everybody could not pass.
  const treating = await rlsClientFor(QA_EMAILS.therapistA);
  const { data: ours } = await treating.from("outcome_measurements").select("id").eq("patient_id", parkinsons!.id);
  expect((ours ?? []).length).toBeGreaterThanOrEqual(1);

  // The goal and milestone routes share the gate.
  const goal = await post(request, "/api/therapist/care-goals/save", QA_EMAILS.therapistB, {
    patientId: parkinsons!.id,
    goal: { goalText: "Walk to the market again" },
  });
  expect(goal.status()).toBe(403);
});

test("MS-003: an ordinary neurological patient's TUG belongs to the neurological exam", async ({ request }) => {
  const res = await post(request, "/api/therapist/measurements/submit", QA_EMAILS.therapistA, {
    patientId: stroke!.id,
    measurement: { measureKey: "tug", value: 14.2, measuredAt: minutesAgo(10), conditions: { setting: "in_person" } },
  });
  expect(res.status()).toBe(400);
  expect((await res.json()).error).toMatch(/neurological examination/);
  const { count } = await db
    .from("outcome_measurements")
    .select("id", { count: "exact", head: true })
    .eq("patient_id", stroke!.id);
  expect(count ?? 0).toBe(0);
});

test("MS-004: a licensed scale is refused while the clinic's switch is off", async ({ request }) => {
  const { error } = await db.from("site_settings").update({ enabled_licensed_measures: [] }).eq("id", true);
  expect(error, error?.message).toBeNull();
  const res = await post(request, "/api/therapist/measurements/submit", QA_EMAILS.therapistA, {
    patientId: parkinsons!.id,
    measurement: {
      measureKey: "mds_updrs_3",
      value: 30,
      measuredAt: minutesAgo(10),
      conditions: { setting: "in_person", medicationState: "on", lastDoseAt: minutesAgo(120) },
    },
  });
  expect(res.status()).toBe(400);
  expect((await res.json()).error).toMatch(/licence/);

  // And the admin's door refuses it the same way.
  const viaAdmin = await post(request, "/api/admin/measurements/submit", QA_EMAILS.admin, {
    patientId: parkinsons!.id,
    measurement: {
      measureKey: "mds_updrs_3",
      value: 30,
      measuredAt: minutesAgo(10),
      conditions: { setting: "in_person", medicationState: "on", lastDoseAt: minutesAgo(120) },
    },
  });
  expect(viaAdmin.status()).toBe(400);
});

test("MS-005: a milestone reached by its measurement reopens only with a reason, and leaves a record", async ({ request }) => {
  const goal = await post(request, "/api/therapist/care-goals/save", QA_EMAILS.therapistA, {
    patientId: parkinsons!.id,
    goal: { goalText: "Walk to the temple and back without stopping" },
  });
  expect(goal.status(), await goal.text()).toBe(200);
  const savedGoal = (await goal.json()).goal;
  const goalId = savedGoal.id as string;
  // The kind is re-derived from the intake answer, never sent.
  expect(savedGoal.profileKind).toBe("neuro_parkinsons");

  const created = await post(request, "/api/therapist/care-milestones/save", QA_EMAILS.therapistA, {
    patientId: parkinsons!.id,
    action: "create",
    goalId,
    milestone: {
      title: "Stand up, walk and sit in under 11.5 seconds",
      criterion: "Timed Up and Go 11.5 seconds or less, ON, average of three",
      linkedMeasureKey: "tug",
      targetValue: 11.5,
      templateKey: "pd_tug_under_11_5",
      status: "working",
    },
  });
  expect(created.status(), await created.text()).toBe(200);
  milestoneId = (await created.json()).milestone.id;

  // Reached needs the proof, and the proof must meet the target.
  const noProof = await post(request, "/api/therapist/care-milestones/save", QA_EMAILS.therapistA, {
    patientId: parkinsons!.id,
    action: "mark_reached",
    milestoneId,
  });
  expect(noProof.status()).toBe(400);
  const reached = await post(request, "/api/therapist/care-milestones/save", QA_EMAILS.therapistA, {
    patientId: parkinsons!.id,
    action: "mark_reached",
    milestoneId,
    measurementId: provingMeasurementId,
  });
  expect(reached.status(), await reached.text()).toBe(200);
  expect((await reached.json()).milestone).toMatchObject({ status: "reached", reachedMeasurementId: provingMeasurementId });

  // A reached milestone is not edited by the therapist, and the database
  // refuses to clear it even for the service role.
  const edit = await post(request, "/api/therapist/care-milestones/save", QA_EMAILS.therapistA, {
    patientId: parkinsons!.id,
    action: "update",
    milestoneId,
    milestone: { status: "working" },
  });
  expect(edit.status()).toBe(409);
  const { error: unreach } = await db
    .from("care_milestones")
    .update({ status: "working", reached_at: null })
    .eq("id", milestoneId);
  expect(unreach?.message ?? "").toMatch(/stays reached/);

  // The clinic reopens it -- but only with a reason.
  const noReason = await post(request, "/api/admin/care-milestones/reopen", QA_EMAILS.admin, {
    patientId: parkinsons!.id,
    milestoneId,
    reason: "oops",
  });
  expect(noReason.status()).toBe(400);
  expect((await noReason.json()).code).toBe("reason_required");
  const notAdmin = await post(request, "/api/admin/care-milestones/reopen", QA_EMAILS.therapistA, {
    patientId: parkinsons!.id,
    milestoneId,
    reason: "Marked reached on the wrong patient record",
  });
  expect(notAdmin.status()).toBe(403);

  const reopened = await post(request, "/api/admin/care-milestones/reopen", QA_EMAILS.admin, {
    patientId: parkinsons!.id,
    milestoneId,
    reason: "Marked reached on the wrong patient record",
  });
  expect(reopened.status(), await reopened.text()).toBe(200);
  const { eventId } = await reopened.json();

  const { data: after } = await db.from("care_milestones").select("status, reached_at").eq("id", milestoneId).single();
  expect(after).toEqual({ status: "working", reached_at: null });
  const { data: event } = await db.from("care_milestone_events").select("reason, previous_measurement_id").eq("id", eventId).single();
  expect(event).toEqual({ reason: "Marked reached on the wrong patient record", previous_measurement_id: provingMeasurementId });
  const { error: rewrite } = await db.from("care_milestone_events").update({ reason: "rewritten" }).eq("id", eventId);
  expect(rewrite?.message ?? "").toMatch(/append-only/);

  // Nothing left to reopen.
  const again = await post(request, "/api/admin/care-milestones/reopen", QA_EMAILS.admin, {
    patientId: parkinsons!.id,
    milestoneId,
    reason: "Marked reached on the wrong patient record",
  });
  expect(again.status()).toBe(409);
});

test("MS-006: the phase and a status override are set by the assigned therapist, with a reason, and kept as history", async ({ request }) => {
  const path = "/api/therapist/care-status/set";

  // An override needs a reason of at least 10 characters.
  const noReason = await post(request, path, QA_EMAILS.therapistA, {
    patientId: parkinsons!.id,
    action: "override_status",
    status: "needs_attention",
    reason: "fell",
  });
  expect(noReason.status()).toBe(400);
  expect((await noReason.json()).code).toBe("reason_required");

  // An unassigned therapist is refused, and so is a patient.
  const outsider = await post(request, path, QA_EMAILS.therapistB, {
    patientId: parkinsons!.id,
    action: "set_phase",
    phase: "Learn strategies",
  });
  expect(outsider.status()).toBe(403);
  expect((await outsider.json()).code).toBe("not_assigned");
  const asPatient = await post(request, path, parkinsons!.email, {
    patientId: parkinsons!.id,
    action: "set_phase",
    phase: "Learn strategies",
  });
  expect(asPatient.status()).toBe(403);

  // The phase must be one of this profile kind's (re-derived: Parkinson's).
  const wrongKind = await post(request, path, QA_EMAILS.therapistA, {
    patientId: parkinsons!.id,
    action: "set_phase",
    phase: "Strengthen",
  });
  expect(wrongKind.status()).toBe(400);

  const phase = await post(request, path, QA_EMAILS.therapistA, {
    patientId: parkinsons!.id,
    action: "set_phase",
    phase: "Learn strategies",
  });
  expect(phase.status(), await phase.text()).toBe(200);
  expect((await phase.json()).state.phase).toMatchObject({ phase: "Learn strategies", setByRole: "therapist" });
  // The same phase again writes nothing.
  const again = await post(request, path, QA_EMAILS.therapistA, {
    patientId: parkinsons!.id,
    action: "set_phase",
    phase: "Learn strategies",
  });
  expect((await again.json()).unchanged).toBe(true);

  const override = await post(request, path, QA_EMAILS.therapistA, {
    patientId: parkinsons!.id,
    action: "override_status",
    status: "needs_attention",
    reason: "Freezing at doorways is worse this week",
  });
  expect(override.status(), await override.text()).toBe(200);
  const overrideBody = await override.json();
  expect(overrideBody.state.override).toMatchObject({ status: "needs_attention", reason: "Freezing at doorways is worse this week" });
  const overrideId = overrideBody.event.id as string;

  // History, not a cell: the row cannot be rewritten, the service role included.
  const { error: rewrite } = await db.from("care_status_events").update({ value: "improving" }).eq("id", overrideId);
  expect(rewrite?.message ?? "").toMatch(/append-only/);

  // The patient reads it at RLS; the outsider sees nothing.
  const own = await rlsClientFor(parkinsons!.email);
  const { data: theirs } = await own.from("care_status_events").select("id").eq("patient_id", parkinsons!.id);
  expect((theirs ?? []).map((r) => r.id)).toContain(overrideId);
  const outsiderDb = await rlsClientFor(QA_EMAILS.therapistB);
  const { data: none } = await outsiderDb.from("care_status_events").select("id").eq("patient_id", parkinsons!.id);
  expect(none ?? []).toHaveLength(0);

  // Clearing ends it; clearing again has nothing to end.
  const cleared = await post(request, path, QA_EMAILS.therapistA, { patientId: parkinsons!.id, action: "clear_override" });
  expect(cleared.status(), await cleared.text()).toBe(200);
  expect((await cleared.json()).state.override).toBeNull();
  const clearedAgain = await post(request, path, QA_EMAILS.therapistA, { patientId: parkinsons!.id, action: "clear_override" });
  expect(clearedAgain.status()).toBe(409);
  expect((await clearedAgain.json()).code).toBe("no_override");

  // The admin's door: "people" scope, a therapist refused there.
  const notAdmin = await post(request, "/api/admin/care-status/set", QA_EMAILS.therapistA, {
    patientId: parkinsons!.id,
    action: "set_phase",
    phase: "Build capacity",
  });
  expect(notAdmin.status()).toBe(403);
  const viaAdmin = await post(request, "/api/admin/care-status/set", QA_EMAILS.admin, {
    patientId: parkinsons!.id,
    action: "set_phase",
    phase: "Build capacity",
  });
  expect(viaAdmin.status(), await viaAdmin.text()).toBe(200);
  expect((await viaAdmin.json()).event).toMatchObject({ kind: "phase", value: "Build capacity", setByRole: "admin" });
});

test("MS-007: the used-arms tick is the chair stand's alone", async ({ request }) => {
  // The 30-second chair stand is a geriatric measure, and no condition type
  // resolves to the geriatric profile yet (profileKind.ts), so the rule's
  // positive half -- usedArms true stores 0 with items.standsWithArms -- is
  // covered by outcomeMeasures.test.ts. At the route: a usedArms on a test
  // without the rule is refused, and nothing is stored.
  const { count: before } = await db
    .from("outcome_measurements")
    .select("id", { count: "exact", head: true })
    .eq("patient_id", parkinsons!.id);
  const res = await post(request, "/api/therapist/measurements/submit", QA_EMAILS.therapistA, {
    patientId: parkinsons!.id,
    measurement: { ...parkinsonsTug(), conditions: { ...parkinsonsTug().conditions, usedArms: true } },
  });
  expect(res.status()).toBe(400);
  expect((await res.json()).error).toMatch(/does not record whether the arms were used/);

  const chair = await post(request, "/api/therapist/measurements/submit", QA_EMAILS.therapistA, {
    patientId: parkinsons!.id,
    measurement: {
      measureKey: "chair_stand_30s",
      value: 0,
      items: { standsWithArms: 6 },
      measuredAt: minutesAgo(10),
      conditions: { setting: "in_person", usedArms: true, medicationState: "on", lastDoseAt: minutesAgo(120) },
    },
  });
  expect(chair.status()).toBe(400);
  const { count: after } = await db
    .from("outcome_measurements")
    .select("id", { count: "exact", head: true })
    .eq("patient_id", parkinsons!.id);
  expect(after).toBe(before);
});

test("MS-008: the six-minute walk equation is chosen by an admin from the table, and can be cleared", async ({ request }) => {
  const set = (value: unknown, email: string = QA_EMAILS.admin) =>
    post(request, "/api/admin/update-setting", email, { key: "six_minute_walk_equation", value });

  const unknown = await set("enright");
  expect(unknown.status()).toBe(400);
  const notAdmin = await set("enright_sherrill_1998", QA_EMAILS.therapistA);
  expect(notAdmin.status()).toBe(403);

  // Start from "not chosen" so the compare-and-swap has a known previous value.
  await db.from("site_settings").update({ six_minute_walk_equation: null }).eq("id", true);
  const chosen = await set("enright_sherrill_1998");
  expect(chosen.status(), await chosen.text()).toBe(200);
  const { data: row } = await db.from("site_settings").select("six_minute_walk_equation").eq("id", true).single();
  expect(row?.six_minute_walk_equation).toBe("enright_sherrill_1998");

  // The placeholder key is stored as null: "not chosen yet".
  const placeholder = await set("indian_adult_tbd");
  expect(placeholder.status(), await placeholder.text()).toBe(200);
  const { data: cleared } = await db.from("site_settings").select("six_minute_walk_equation").eq("id", true).single();
  expect(cleared?.six_minute_walk_equation).toBeNull();
});
