import { test, expect, type Browser } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  BASE,
  QA_EMAILS,
  SUPABASE_ANON_KEY,
  SUPABASE_URL,
  TEST_PASSWORD,
  adminClient,
  assertDisposableStack,
  browserCookiesFor,
  cookieHeaderFor,
  profileIdFor,
  waitForSplashToClear,
} from "./helpers";

/**
 * One patient's clinical record, carried across all three roles in the order
 * it is actually written (docs/rules/clinical.md):
 *
 *   therapist fills the first health profile (live, recorded, not reviewed)
 *   -> the patient reads it as their own; an unassigned therapist cannot
 *   -> the therapist writes the session note; the patient never sees notes
 *   -> the therapist recommends a programme; it waits for the clinic and the
 *      patient sees nothing and cannot buy it
 *   -> an admin approves it, with the decision recorded against them
 *   -> the patient now sees it, attributed to the therapist
 *   -> an admin reopens the session: the note, its revision history and the
 *      published recommendation all survive, and the therapist can still
 *      correct the note inside its edit window
 *
 * Every step asserts the stored rows as well as the answer, and the patient's
 * visibility is checked on the screens they read, not only at the API.
 *
 * It writes rows that can never be removed (care-plan versions and reviews,
 * session-note revisions are append-only by trigger), so it runs only on the
 * quality gate's disposable stack -- `assertDisposableStack` refuses anything
 * else -- and its patient is a fixture of its own rather than a shared one.
 */

const PATIENT_EMAIL = "qa.continuity.patient@example.test";
const THERAPIST = QA_EMAILS.therapistB;
const OUTSIDER = QA_EMAILS.therapistC;
const CATEGORY_TITLE = "QA Continuity Condition";
const PACKAGE_TITLE = "QA Continuity Programme";
const RUN = Date.now().toString(36);
const RATIONALE = `Continuity ${RUN}: knee control is improving but stairs still provoke pain.`;
const INSTRUCTIONS = `Continuity ${RUN}: quads sets twice a day, ice after long walks.`;
const NOTE_TREATED = `Continuity ${RUN} knee mobilisation`;

let db: SupabaseClient;
let patientId = "";
let therapistId = "";
let outsiderId = "";
let adminId = "";
let appointmentId = "";
let packageId = "";
let carePlanId = "";
let versionId = "";

async function rlsClientFor(email: string): Promise<SupabaseClient> {
  const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error } = await client.auth.signInWithPassword({ email, password: TEST_PASSWORD });
  if (error) throw new Error(`sign-in for ${email} failed: ${error.message}`);
  return client;
}

async function post(path: string, email: string, data: Record<string, unknown>) {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: await cookieHeaderFor(email) },
    body: JSON.stringify(data),
  });
  const text = await res.text();
  let json: Record<string, unknown> = {};
  try {
    json = JSON.parse(text);
  } catch {
    // a non-JSON body is reported through `text`
  }
  return { status: res.status, json, text };
}

async function patientPageText(browser: Browser, path: string): Promise<string> {
  const ctx = await browser.newContext();
  try {
    await ctx.addCookies(await browserCookiesFor(PATIENT_EMAIL));
    const page = await ctx.newPage();
    await page.goto(`${BASE}${path}`);
    await waitForSplashToClear(page);
    await expect(page.getByRole("heading").first()).toBeVisible({ timeout: 60_000 });
    await page.waitForLoadState("networkidle");
    return await page.locator("main").innerText();
  } finally {
    await ctx.close();
  }
}

test.describe.configure({ mode: "serial" });
test.setTimeout(180_000);

test.beforeAll(async () => {
  assertDisposableStack("clinical-continuity writes append-only care-plan versions, reviews and note revisions");
  db = adminClient();
  therapistId = await profileIdFor(db, THERAPIST);
  outsiderId = await profileIdFor(db, OUTSIDER);
  adminId = await profileIdFor(db, QA_EMAILS.admin);

  // Its own patient, so nothing another spec leaves on a shared fixture can
  // stand in for a step this file is meant to prove.
  const { data: list } = await db.auth.admin.listUsers({ page: 1, perPage: 1000 });
  let user = list.users.find((u) => u.email === PATIENT_EMAIL);
  if (!user) {
    const { data, error } = await db.auth.admin.createUser({
      email: PATIENT_EMAIL,
      password: TEST_PASSWORD,
      email_confirm: true,
      user_metadata: { role: "patient", full_name: "QA Continuity Patient" },
    });
    expect(error, "creating the continuity patient").toBeNull();
    user = data.user!;
  }
  patientId = user.id;
  await db.from("profiles").update({ role: "patient", approved: true, active: true, full_name: "QA Continuity Patient" }).eq("id", patientId);

  // A fresh record each run: the first fill is what CC-001 proves.
  await db.from("care_plans").update({ status: "withdrawn" }).eq("patient_id", patientId).in("status", ["active", "pending_review"]);
  await db.from("pain_assessments").delete().eq("patient_id", patientId);
  await db.from("condition_change_requests").delete().eq("patient_id", patientId);
  await db.from("condition_access_grants").delete().eq("patient_id", patientId);
  await db.from("patient_condition_profiles").delete().eq("patient_id", patientId);
  await db.from("site_settings").update({ care_plan_requires_approval: true }).eq("id", true);

  const { data: category } = await db.from("treatment_categories").select("id").eq("title", CATEGORY_TITLE).limit(1).maybeSingle();
  const categoryId =
    category?.id ??
    (
      await db
        .from("treatment_categories")
        .insert({ title: CATEGORY_TITLE, points: [], price_paise: 120000, duration_minutes: 60, active: true })
        .select("id")
        .single()
    ).data?.id;
  expect(categoryId, "continuity category").toBeTruthy();

  const { data: pkg } = await db
    .from("treatment_category_packages")
    .select("id")
    .eq("title", PACKAGE_TITLE)
    .eq("category_id", categoryId)
    .limit(1)
    .maybeSingle();
  packageId =
    pkg?.id ??
    (
      await db
        .from("treatment_category_packages")
        .insert({
          category_id: categoryId,
          title: PACKAGE_TITLE,
          session_count: 4,
          price_paise: 400000,
          active: true,
          recommendable: true,
          therapist_locked: true,
        })
        .select("id")
        .single()
    ).data?.id ??
    "";
  expect(packageId, "continuity package").toBeTruthy();

  // The delivered session everything hangs off: yesterday, on the hour, a
  // fresh one per run so its note starts inside the 24-hour edit window.
  const slot = new Date();
  slot.setDate(slot.getDate() - 1);
  slot.setHours(7 + (Number.parseInt(RUN.slice(-2), 36) % 12), 0, 0, 0);
  const { data: appt, error: apptError } = await db
    .from("appointments")
    .insert({
      patient_id: patientId,
      therapist_id: therapistId,
      category_id: categoryId,
      concern: `${CATEGORY_TITLE} ${RUN}`,
      slot_time: slot.toISOString(),
      duration_minutes: 60,
      status: "completed",
      completed_at: new Date().toISOString(),
      payment_status: "paid",
      amount_paid_paise: 120000,
      visit_mode: "online",
    })
    .select("id")
    .single();
  expect(apptError, `seeding the delivered session: ${apptError?.message}`).toBeNull();
  appointmentId = appt!.id;
});

test("CC-001: the therapist's first fill is live; the patient reads it, an unassigned therapist cannot", async () => {
  const res = await post("/api/therapist/condition-profile/onboard", THERAPIST, {
    patientId,
    specialty: "ortho",
    data: { chief_complaint: "Left knee pain on stairs", since_when: "About 3 months", severity: "5" },
    triageData: { age_band: "18 to 64", presenting_problem: "Injury, strain or overuse" },
  });
  expect(res.status, res.text).toBe(200);

  const { data: row } = await db.from("patient_condition_profiles").select("status, specialty, data, last_submitted_by").eq("patient_id", patientId).single();
  expect(row).toMatchObject({ status: "active", specialty: "ortho", last_submitted_by: therapistId });
  const { count: history } = await db
    .from("condition_change_requests")
    .select("id", { count: "exact", head: true })
    .eq("patient_id", patientId)
    .eq("status", "approved");
  expect(history, "the live first fill is still on the review history").toBe(1);

  const patient = await rlsClientFor(PATIENT_EMAIL);
  const { data: own } = await patient.from("patient_condition_profiles").select("data").eq("patient_id", patientId);
  expect(own?.[0]?.data?.chief_complaint).toBe("Left knee pain on stairs");

  const outsider = await rlsClientFor(OUTSIDER);
  const { data: leaked } = await outsider.from("patient_condition_profiles").select("data").eq("patient_id", patientId);
  expect(leaked ?? [], "a therapist with no care relationship reads nothing").toHaveLength(0);

  const outsiderOnboard = await post("/api/therapist/condition-profile/onboard", OUTSIDER, {
    patientId,
    specialty: "ortho",
    data: { chief_complaint: "Overwritten", since_when: "x", severity: "1" },
  });
  expect(outsiderOnboard.status).toBe(403);
  expect(outsiderId).not.toBe(therapistId);
});

test("CC-002: the note is written by the session's therapist only, and no patient can read it", async () => {
  const note = {
    appointmentId,
    data: {
      treated: NOTE_TREATED,
      techniques: "Grade II mobilisations",
      response: "Pain eased from 5 to 3 by the end",
      home_exercise: "Quads sets",
      next_plan: "Progress to step-ups",
    },
  };
  const outsider = await post("/api/therapist/session-notes/submit", OUTSIDER, note);
  expect(outsider.status).toBe(403);

  const res = await post("/api/therapist/session-notes/submit", THERAPIST, note);
  expect(res.status, res.text).toBe(200);
  const { data: stored } = await db.from("session_notes").select("id, therapist_id, data").eq("appointment_id", appointmentId).single();
  expect(stored?.therapist_id).toBe(therapistId);
  expect(stored?.data?.treated).toBe(NOTE_TREATED);

  const patient = await rlsClientFor(PATIENT_EMAIL);
  const { data: patientView } = await patient.from("session_notes").select("id").eq("appointment_id", appointmentId);
  expect(patientView ?? [], "session_notes has no patient select policy").toHaveLength(0);
  const own = await rlsClientFor(THERAPIST);
  const { data: therapistView } = await own.from("session_notes").select("id").eq("appointment_id", appointmentId);
  expect(therapistView ?? []).toHaveLength(1);

  // And the patient's own export leaves it out, by rule.
  const exportRes = await fetch(`${BASE}/api/patient/condition-profile/export?format=json`, {
    headers: { Cookie: await cookieHeaderFor(PATIENT_EMAIL) },
  });
  expect(exportRes.status).toBe(200);
  const exported = await exportRes.text();
  expect(exported).toContain("Left knee pain on stairs");
  expect(exported).not.toContain(NOTE_TREATED);
});

test("CC-003: a recommendation waits for the clinic; the patient can neither see nor buy it", async ({ browser }) => {
  const res = await post("/api/therapist/care-plan/submit", THERAPIST, {
    patientId,
    appointmentId,
    offerKind: "session_package",
    packageId,
    handsOnRequired: true,
    frequencyPerWeek: 2,
    clinicalRationale: RATIONALE,
    instructions: INSTRUCTIONS,
  });
  expect(res.status, res.text).toBe(200);
  carePlanId = String(res.json.carePlanId);
  versionId = String(res.json.versionId);
  const { data: plan } = await db.from("care_plans").select("status, therapist_id, patient_id").eq("id", carePlanId).single();
  expect(plan).toMatchObject({ status: "pending_review", therapist_id: therapistId, patient_id: patientId });

  const buy = await post("/api/care-plan/create-order", PATIENT_EMAIL, { carePlanVersionId: versionId });
  expect(buy.status, "an unreviewed recommendation cannot be bought").not.toBe(200);

  const suggested = await patientPageText(browser, "/patient/dashboard/suggested");
  expect(suggested).not.toContain(RATIONALE);
  const profile = await patientPageText(browser, "/patient/dashboard/health-profile");
  expect(profile).not.toContain(INSTRUCTIONS);
});

test("CC-004: the admin's approval is recorded against them and publishes it, attributed to the therapist", async ({ browser }) => {
  expect(carePlanId, "CC-003 submitted the plan").toBeTruthy();
  const res = await post("/api/admin/review-care-plan", QA_EMAILS.admin, { carePlanId, decision: "approved" });
  expect(res.status, res.text).toBe(200);

  const { data: plan } = await db.from("care_plans").select("status, current_version_id").eq("id", carePlanId).single();
  expect(plan?.status).toBe("active");
  const { data: version } = await db
    .from("care_plan_versions")
    .select("authored_by, entered_by, expires_at, clinical_rationale")
    .eq("id", plan!.current_version_id)
    .single();
  expect(version?.authored_by).toBe(therapistId);
  expect(version?.clinical_rationale).toBe(RATIONALE);
  expect(version?.expires_at, "the offer window is stamped at approval").toBeTruthy();
  const { data: reviews } = await db.from("care_plan_reviews").select("decision, reviewer_id").eq("care_plan_id", carePlanId);
  expect(reviews).toEqual([expect.objectContaining({ decision: "approved", reviewer_id: adminId })]);

  const suggested = await patientPageText(browser, "/patient/dashboard/suggested");
  expect(suggested).toContain(RATIONALE);
  const profile = await patientPageText(browser, "/patient/dashboard/health-profile");
  expect(profile).toContain(INSTRUCTIONS);
});

test("CC-005: reopening the session keeps the note, its history and the published plan", async ({ browser }) => {
  expect(carePlanId, "CC-003 submitted the plan").toBeTruthy();
  const reopen = await post("/api/admin/reopen-session", QA_EMAILS.admin, { appointmentId });
  expect(reopen.status, reopen.text).toBe(200);
  const { data: appt } = await db.from("appointments").select("status, completed_at").eq("id", appointmentId).single();
  expect(appt).toMatchObject({ status: "confirmed", completed_at: null });

  const { data: note } = await db.from("session_notes").select("id, data, updated_at, created_at").eq("appointment_id", appointmentId).single();
  expect(note?.data?.treated, "the note survives the reopen").toBe(NOTE_TREATED);
  const { data: plan } = await db.from("care_plans").select("status, current_version_id").eq("id", carePlanId).single();
  expect(plan?.status, "the published recommendation survives the reopen").toBe("active");

  // The session is confirmed and in the past, and the note is inside its
  // 24-hour window: the reopen must not lock the therapist out of a
  // correction the rules still allow -- and the edit keeps what it replaced.
  const edit = await post("/api/therapist/session-notes/submit", THERAPIST, {
    appointmentId,
    baseUpdatedAt: note!.updated_at ?? note!.created_at,
    data: {
      treated: `${NOTE_TREATED} (corrected)`,
      techniques: "Grade II mobilisations",
      response: "Pain eased from 5 to 3 by the end",
      home_exercise: "Quads sets",
      next_plan: "Progress to step-ups",
    },
  });
  expect(edit.status, edit.text).toBe(200);
  const { data: revisions } = await db.from("session_note_revisions").select("data").eq("note_id", note!.id);
  expect((revisions ?? []).map((r) => r.data?.treated)).toContain(NOTE_TREATED);
  const { data: after } = await db.from("session_notes").select("data").eq("id", note!.id).single();
  expect(after?.data?.treated).toBe(`${NOTE_TREATED} (corrected)`);

  const suggested = await patientPageText(browser, "/patient/dashboard/suggested");
  expect(suggested, "the patient still has their recommendation after the reopen").toContain(RATIONALE);
});

test.afterAll(async () => {
  if (!db || !patientId) return;
  // Close the thread so the patient's one-open-plan slot is free next run;
  // the versions and reviews themselves are append-only and stay.
  await db.from("care_plans").update({ status: "withdrawn" }).eq("patient_id", patientId).in("status", ["active", "pending_review"]);
});
