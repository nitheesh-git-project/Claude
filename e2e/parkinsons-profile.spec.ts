// The Parkinson's sub-profile's server side (Health Profile redesign, phase
// 4a): the neurological condition group and its conditional follow-ups at
// the onboarding route, the patient diary's add and confirm gates, and the
// written "Where things stand" (set_summary). No screen draws the diary or
// the Parkinson's view yet (phase 4b), so this drives the routes and asserts
// the rows and the RLS beneath them, the measurements.spec.ts way.
//
// Fixtures: two throwaway neurological patients -- one onboarded here as
// Parkinson's disease, one onboarded as a stroke -- each with one completed
// session with QA Therapist A. QA Therapist B has no relationship to either.
//
// patient_diary_entries and care_status_events are append-only (a trigger
// refuses update and delete; the diary allows only the one-time
// confirmation stamp), so the rows this writes stay -- disposable projects
// only, and the fixture accounts cannot be deleted afterwards; the cleanup
// says so rather than failing the run.
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
  "writes append-only diary entries and summaries; set E2E_ALLOW_APPEND_ONLY_WRITES=1 on a disposable project"
);

test.describe.configure({ mode: "serial" });

const MARKER = "E2E parkinsons profile";
const db = adminClient();
let parkinsons: { id: string; email: string; name: string } | undefined;
let stroke: { id: string; email: string; name: string } | undefined;
let therapistAId = "";
let fallEntryId = "";

function minutesAgo(n: number) {
  return new Date(Date.now() - n * 60_000).toISOString();
}

async function post(request: APIRequestContext, path: string, email: string | null, data: unknown) {
  return request.post(`${BASE}${path}`, {
    headers: { ...(email ? { cookie: await cookieHeaderFor(email) } : {}), "content-type": "application/json" },
    data,
  });
}

const BASE_NEURO = {
  neuro_diagnosis: "E2E neurological condition, 2024",
  neuro_affected_side: "Both sides",
  neuro_mobility: "Walk with a stick or frame",
  neuro_independence: "6",
};

test.beforeAll(async () => {
  therapistAId = await profileIdFor(db, QA_EMAILS.therapistA);
  parkinsons = await createFixtureAccount("Parkinsons Profile PD");
  stroke = await createFixtureAccount("Parkinsons Profile Stroke");
  for (const patient of [parkinsons, stroke]) {
    // A delivered session: what makes Therapist A "assigned".
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
  await deleteFixtureAccount(parkinsons?.id);
  await deleteFixtureAccount(stroke?.id);
});

test("PDP-001: the Parkinson's follow-ups are required only when the condition group says Parkinson's", async ({ request }) => {
  const onboard = (patientId: string, data: Record<string, string>) =>
    post(request, "/api/therapist/condition-profile/onboard", QA_EMAILS.therapistA, { patientId, specialty: "neuro", data, triageData: {} });

  // Parkinson's chosen, its two required follow-ups blank: refused.
  const missing = await onboard(parkinsons!.id, { ...BASE_NEURO, neuro_subtype: "Parkinson's disease" });
  expect(missing.status(), await missing.text()).toBe(400);

  // With them: live, and the record is the Parkinson's sub-profile.
  const ok = await onboard(parkinsons!.id, {
    ...BASE_NEURO,
    neuro_subtype: "Parkinson's disease",
    neuro_pd_year_diagnosed: "2019",
    neuro_pd_freezing: "Most days",
    neuro_pd_medication_times: "7 am, 1 pm, 7 pm",
  });
  expect(ok.status(), await ok.text()).toBe(200);
  const { data: row } = await db.from("patient_condition_profiles").select("data, schema_version").eq("patient_id", parkinsons!.id).single();
  expect(row?.data).toMatchObject({ neuro_subtype: "Parkinson's disease", neuro_pd_freezing: "Most days" });
  expect(row?.schema_version).toBe(2);

  // A stroke patient never sees the follow-ups and is not refused for them;
  // the condition group itself is optional.
  const strokeOk = await onboard(stroke!.id, { ...BASE_NEURO, neuro_subtype: "Stroke or brain injury" });
  expect(strokeOk.status(), await strokeOk.text()).toBe(200);
  const noGroup = await onboard(stroke!.id, { ...BASE_NEURO });
  expect(noGroup.status(), await noGroup.text()).toBe(200);

  // A key no question owns is still refused.
  const unknown = await onboard(stroke!.id, { ...BASE_NEURO, neuro_pd_unknown: "x" });
  expect(unknown.status()).toBe(400);
});

test("PDP-002: a patient writes in their own diary; the kind follows the profile and nobody else writes there", async ({ request }) => {
  const path = "/api/patient/diary/add";
  const fall = { kind: "fall", occurredAt: minutesAgo(90), details: { injured: false, gotUpAlone: true, place: "indoors_home" }, note: "In the kitchen" };

  const res = await post(request, path, parkinsons!.email, fall);
  expect(res.status(), await res.text()).toBe(200);
  const body = await res.json();
  expect(body).toMatchObject({ success: true, duplicate: false });
  expect(body.entry).toMatchObject({ kind: "fall", enteredByRole: "patient", patientId: parkinsons!.id, confirmedAt: null });
  fallEntryId = body.entry.id;

  // The same entry again is the first one, not a second fall.
  const again = await post(request, path, parkinsons!.email, fall);
  expect(again.status()).toBe(200);
  expect((await again.json()).duplicate).toBe(true);
  const { count } = await db.from("patient_diary_entries").select("id", { count: "exact", head: true }).eq("patient_id", parkinsons!.id).eq("kind", "fall");
  expect(count).toBe(1);

  // Freezing is a Parkinson's entry: offered here, refused for a stroke patient.
  const freezing = await post(request, path, parkinsons!.email, { kind: "freezing", occurredAt: minutesAgo(30), details: { period: "day", count: 3, medicationState: "off" } });
  expect(freezing.status(), await freezing.text()).toBe(200);
  const strokeFreezing = await post(request, path, stroke!.email, { kind: "freezing", occurredAt: minutesAgo(30), details: { period: "episode", count: 1 } });
  expect(strokeFreezing.status()).toBe(400);
  expect((await strokeFreezing.json()).code).toBe("diary_kind_not_offered");

  // Bad details and a future time are 400s; a therapist and an anonymous caller are refused.
  expect((await post(request, path, parkinsons!.email, { kind: "freezing", occurredAt: minutesAgo(5), details: { period: "episode", count: 4 } })).status()).toBe(400);
  expect((await post(request, path, parkinsons!.email, { ...fall, occurredAt: new Date(Date.now() + 86_400_000).toISOString() })).status()).toBe(400);
  expect((await post(request, path, QA_EMAILS.therapistA, fall)).status()).toBe(403);
  expect((await post(request, path, null, fall)).status()).toBe(401);

  // The body cannot name another patient: the row is the caller's own.
  const smuggled = await post(request, path, stroke!.email, { kind: "near_miss", occurredAt: minutesAgo(20), patientId: parkinsons!.id });
  expect(smuggled.status(), await smuggled.text()).toBe(200);
  expect((await smuggled.json()).entry.patientId).toBe(stroke!.id);

  // RLS: the patient reads their own; another patient and an unassigned therapist see nothing.
  const own = await rlsClientFor(parkinsons!.email);
  const { data: theirs } = await own.from("patient_diary_entries").select("id").eq("patient_id", parkinsons!.id);
  expect((theirs ?? []).map((r) => r.id)).toContain(fallEntryId);
  const other = await rlsClientFor(stroke!.email);
  const { data: notTheirs } = await other.from("patient_diary_entries").select("id").eq("patient_id", parkinsons!.id);
  expect(notTheirs ?? []).toHaveLength(0);
  const outsider = await rlsClientFor(QA_EMAILS.therapistB);
  const { data: outsiderRows } = await outsider.from("patient_diary_entries").select("id").eq("patient_id", parkinsons!.id);
  expect(outsiderRows ?? []).toHaveLength(0);

  // Nobody rewrites it, the service role included.
  const { error: rewrite } = await db.from("patient_diary_entries").update({ note: "Rewritten" }).eq("id", fallEntryId);
  expect(rewrite?.message ?? "").toMatch(/append-only/);
});

test("PDP-003: only the assigned therapist confirms a diary entry, once", async ({ request }) => {
  const path = "/api/therapist/diary/confirm";
  expect((await post(request, path, QA_EMAILS.therapistB, { entryId: fallEntryId })).status()).toBe(403);
  expect((await post(request, path, parkinsons!.email, { entryId: fallEntryId })).status()).toBe(403);
  expect((await post(request, path, QA_EMAILS.therapistA, { entryId: "not-a-uuid" })).status()).toBe(400);
  expect((await post(request, path, QA_EMAILS.therapistA, { entryId: "00000000-0000-4000-8000-000000000000" })).status()).toBe(404);

  const res = await post(request, path, QA_EMAILS.therapistA, { entryId: fallEntryId });
  expect(res.status(), await res.text()).toBe(200);
  const body = await res.json();
  expect(body).toMatchObject({ success: true, unchanged: false });
  expect(body.entry).toMatchObject({ confirmedBy: therapistAId, confirmedByRole: "therapist" });
  expect(body.entry.confirmedAt).toBeTruthy();

  const twice = await post(request, path, QA_EMAILS.therapistA, { entryId: fallEntryId });
  expect(twice.status()).toBe(200);
  expect((await twice.json()).unchanged).toBe(true);

  // The assigned therapist reads the entry at RLS.
  const asTherapist = await rlsClientFor(QA_EMAILS.therapistA);
  const { data: seen } = await asTherapist.from("patient_diary_entries").select("id").eq("id", fallEntryId);
  expect(seen ?? []).toHaveLength(1);
});

test("PDP-004: the physiotherapist writes Where things stand; the patient reads it; it is history, not a cell", async ({ request }) => {
  const path = "/api/therapist/care-status/set";
  const text = "Walking further each week.\nNext: turning in the kitchen without stopping.";

  expect((await post(request, path, QA_EMAILS.therapistA, { patientId: parkinsons!.id, action: "set_summary", text: "   " })).status()).toBe(400);
  expect((await post(request, path, QA_EMAILS.therapistA, { patientId: parkinsons!.id, action: "set_summary", text: "x".repeat(1201) })).status()).toBe(400);
  expect((await post(request, path, QA_EMAILS.therapistB, { patientId: parkinsons!.id, action: "set_summary", text })).status()).toBe(403);
  expect((await post(request, path, parkinsons!.email, { patientId: parkinsons!.id, action: "set_summary", text })).status()).toBe(403);

  const res = await post(request, path, QA_EMAILS.therapistA, { patientId: parkinsons!.id, action: "set_summary", text });
  expect(res.status(), await res.text()).toBe(200);
  const body = await res.json();
  expect(body).toMatchObject({ success: true, unchanged: false });
  expect(body.state.summary).toMatchObject({ text, setByRole: "therapist" });

  const again = await post(request, path, QA_EMAILS.therapistA, { patientId: parkinsons!.id, action: "set_summary", text });
  expect((await again.json()).unchanged).toBe(true);

  // The admin writes one too, with an audit row; the newest is in force and the first is kept.
  const asAdmin = await post(request, "/api/admin/care-status/set", QA_EMAILS.admin, {
    patientId: parkinsons!.id,
    action: "set_summary",
    text: "Seen by the clinic while the physiotherapist is away. Keep going with the walking.",
  });
  expect(asAdmin.status(), await asAdmin.text()).toBe(200);
  expect((await asAdmin.json()).state.summary).toMatchObject({ setByRole: "admin" });
  const { data: audit } = await db
    .from("admin_activity_log")
    .select("action")
    .eq("action", "care_status.set")
    .order("created_at", { ascending: false })
    .limit(1);
  expect(audit?.[0]?.action).toBe("care_status.set");

  const own = await rlsClientFor(parkinsons!.email);
  const { data: rows } = await own.from("care_status_events").select("kind, value").eq("patient_id", parkinsons!.id).eq("kind", "summary");
  expect((rows ?? []).map((r) => r.value)).toContain(text);
  expect(rows ?? []).toHaveLength(2);
});
