import { test, expect, type Browser } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import {
  BASE,
  QA_EMAILS,
  SUPABASE_ANON_KEY,
  SUPABASE_URL,
  adminClient,
  assertDisposableStack,
  browserCookiesFor,
  cookieHeaderFor,
  createFixtureAccount,
  deleteFixtureAccount,
  pageUntilVisible,
  profileIdFor,
  rlsClientFor,
  setQaAdminScope,
  waitForSplashToClear,
} from "./helpers";

/**
 * The patient's session summary (F-09): the "Shared with the patient" half
 * of the therapist's note dialog, which the patient reads on their session
 * card -- and the private session note, which they never do.
 *
 *   therapist writes the note, then the summary, then finishes the session
 *   -> only the session's own therapist can write it; the patient it is
 *      filed under comes from the session, never the body
 *   -> the patient reads their own summary (RLS and the Sessions screen),
 *      another patient and an unrelated therapist read nothing, and no word
 *      of the private note reaches the patient's screen
 *   -> edits are versioned, compare-and-set, and cannot blank it
 *   -> a desk that manages Sessions sees it in the drawer's read; Finance
 *      and a therapist do not
 *   -> the public pages promise the summary, not the note
 *
 * Writes rows that cannot be removed (session settlements, summary
 * revisions -- append-only by trigger), so it runs only on the quality
 * gate's disposable stack, against a patient of its own.
 */

const THERAPIST = QA_EMAILS.therapistB;
const OUTSIDER = QA_EMAILS.therapistC;
const OTHER_PATIENT = QA_EMAILS.patientB;
const RUN = Date.now().toString(36);
const CONCERN = `E2E session summary ${RUN}`;
const NOTE_TREATED = `PRIVATE-NOTE-${RUN} L4-L5 segmental mobilisation`;
const NOTE_PLAN = `PRIVATE-PLAN-${RUN} progress to loaded hinge`;
const NOTE_FREE = `PRIVATE-FREE-${RUN} query central sensitisation`;
const DID = `Summary ${RUN}: we worked on getting up from a chair without pushing off.`;
const NEXT = `Summary ${RUN}: heel slides, 10 at a time, morning and evening.`;
const HOUR = 60 * 60 * 1000;

const db = adminClient();
let patient: { id: string; email: string; name: string };
let therapistId = "";
let therapistName = "";
let appointmentId = "";

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
    // reported through `text`
  }
  return { status: res.status, json, text };
}

async function sessionsPageText(browser: Browser, email: string, past = true): Promise<{ text: string; summaryVisible: boolean }> {
  const ctx = await browser.newContext();
  try {
    await ctx.addCookies(await browserCookiesFor(email));
    const page = await ctx.newPage();
    await page.goto(`${BASE}/patient/dashboard/sessions`);
    await waitForSplashToClear(page);
    await expect(page.getByRole("heading", { name: "Your Sessions" }).first()).toBeVisible({ timeout: 60_000 });
    if (past) await page.getByRole("button", { name: /^Past/ }).first().click();
    const summary = page.getByTestId("patient-session-summary").filter({ hasText: DID });
    const summaryVisible = await pageUntilVisible(page, "sessions", summary, { timeout: 15_000 });
    return { text: await page.locator("main").innerText(), summaryVisible };
  } finally {
    await ctx.close();
  }
}

test.describe.configure({ mode: "serial" });
test.setTimeout(90_000);

test.beforeAll(async () => {
  assertDisposableStack("patient-session-summary completes a session and writes append-only summary revisions");
  therapistId = await profileIdFor(db, THERAPIST);
  const { data: t } = await db.from("profiles").select("full_name").eq("id", therapistId).single();
  therapistName = t?.full_name ?? "";
  expect(therapistName, "the therapist fixture has a name to attribute the summary to").toBeTruthy();

  patient = await createFixtureAccount("Session Summary Patient");
  // Neurological, so Done needs the note alone and no Pain Map step.
  const { error: profileError } = await db
    .from("patient_condition_profiles")
    .upsert({ patient_id: patient.id, specialty: "neuro", status: "active" }, { onConflict: "patient_id" });
  expect(profileError, profileError?.message).toBeNull();

  // A confirmed session that has started, in the first hour the therapist
  // has free -- other specs park sessions for the same QA therapist.
  for (const h of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) {
    const slot = new Date(Date.now() - h * HOUR);
    slot.setMinutes(0, 0, 0);
    const { data } = await db
      .from("appointments")
      .insert({
        patient_id: patient.id,
        therapist_id: therapistId,
        slot_time: slot.toISOString(),
        status: "confirmed",
        payment_status: "paid",
        amount_paid_paise: 120000,
        duration_minutes: 30,
        visit_mode: "online",
        concern: CONCERN,
      })
      .select("id")
      .single();
    if (data) {
      appointmentId = data.id as string;
      break;
    }
  }
  expect(appointmentId, "seeding the session to finish").toBeTruthy();
});

test.afterAll(async () => {
  // Best-effort: the settlement and any revision are append-only, so this
  // warns rather than fails on the disposable stack.
  await deleteFixtureAccount(patient?.id);
});

test("PSS-001: the session's therapist writes the summary on completion; nobody else can", async () => {
  const note = await post("/api/therapist/session-notes/submit", THERAPIST, {
    appointmentId,
    data: { treated: NOTE_TREATED, response: "Improved", next_plan: NOTE_PLAN },
    freeText: NOTE_FREE,
    baseUpdatedAt: null,
  });
  expect(note.status, note.text).toBe(200);

  const outsider = await post("/api/therapist/session-summary/submit", OUTSIDER, {
    appointmentId,
    whatWeDid: "Overwritten",
  });
  expect(outsider.status, "a therapist who did not run the session").toBe(403);

  const tooLong = await post("/api/therapist/session-summary/submit", THERAPIST, {
    appointmentId,
    whatWeDid: "x".repeat(601),
  });
  expect(tooLong.status).toBe(400);

  const otherPatientId = await profileIdFor(db, OTHER_PATIENT);
  const res = await post("/api/therapist/session-summary/submit", THERAPIST, {
    appointmentId,
    whatWeDid: DID,
    beforeNextTime: NEXT,
    baseUpdatedAt: null,
    // Never trusted: the patient comes from the session.
    patientId: otherPatientId,
  });
  expect(res.status, res.text).toBe(200);
  expect(res.json.written).toBe(true);

  const done = await post("/api/appointments/complete-session", THERAPIST, { appointmentId });
  expect(done.status, done.text).toBe(200);

  const { data: stored } = await db
    .from("session_summaries")
    .select("patient_id, therapist_id, what_we_did, before_next_time")
    .eq("appointment_id", appointmentId)
    .single();
  expect(stored).toMatchObject({ patient_id: patient.id, therapist_id: therapistId, what_we_did: DID, before_next_time: NEXT });
});

test("PSS-002: the patient reads their own summary and no note; nobody unrelated reads either", async () => {
  const own = await rlsClientFor(patient.email);
  const { data: mine } = await own.from("session_summaries").select("what_we_did").eq("appointment_id", appointmentId);
  expect(mine?.map((r) => r.what_we_did)).toEqual([DID]);
  const { data: noteView } = await own.from("session_notes").select("id").eq("appointment_id", appointmentId);
  expect(noteView ?? [], "session_notes has no patient select policy").toHaveLength(0);

  const other = await rlsClientFor(OTHER_PATIENT);
  const { data: leaked } = await other.from("session_summaries").select("id").eq("appointment_id", appointmentId);
  expect(leaked ?? [], "another patient reads nothing of this session").toHaveLength(0);

  const outsider = await rlsClientFor(OUTSIDER);
  const { data: outsiderView } = await outsider.from("session_summaries").select("id").eq("appointment_id", appointmentId);
  expect(outsiderView ?? [], "a therapist with no care relationship reads nothing").toHaveLength(0);

  const anon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data: anonView } = await anon.from("session_summaries").select("id").eq("appointment_id", appointmentId);
  expect(anonView ?? []).toHaveLength(0);

  // No browser session can write one: only the route, as the service role.
  const { error: directInsert } = await own.from("session_summaries").insert({
    appointment_id: appointmentId,
    patient_id: patient.id,
    therapist_id: therapistId,
    what_we_did: "typed by the patient",
  });
  expect(directInsert, "authenticated has no insert grant").not.toBeNull();
});

test("PSS-003: the patient sees it on Past sessions, named and dated; the note never reaches them", async ({ browser }) => {
  const mine = await sessionsPageText(browser, patient.email);
  expect(mine.summaryVisible, "the summary on the patient's own session card").toBe(true);
  expect(mine.text).toContain(DID);
  expect(mine.text).toContain(NEXT);
  expect(mine.text).toContain(`From ${therapistName}`);
  for (const secret of [NOTE_TREATED, NOTE_PLAN, NOTE_FREE]) {
    expect(mine.text, "nothing of the private note on the patient's screen").not.toContain(secret);
  }

  const theirs = await sessionsPageText(browser, OTHER_PATIENT);
  expect(theirs.summaryVisible).toBe(false);
  expect(theirs.text).not.toContain(DID);
});

test("PSS-004: an edit is versioned, compare-and-set, and cannot blank the summary", async () => {
  const { data: before } = await db
    .from("session_summaries")
    .select("id, created_at, updated_at")
    .eq("appointment_id", appointmentId)
    .single();
  const base = before!.updated_at ?? before!.created_at;

  const stale = await post("/api/therapist/session-summary/submit", THERAPIST, {
    appointmentId,
    whatWeDid: `${DID} (edited)`,
    baseUpdatedAt: "2020-01-01T00:00:00.000Z",
  });
  expect(stale.status, "a save from an older version").toBe(409);

  const blank = await post("/api/therapist/session-summary/submit", THERAPIST, {
    appointmentId,
    whatWeDid: "",
    beforeNextTime: "",
    baseUpdatedAt: base,
  });
  expect(blank.status, "a summary the patient may have read cannot be removed").toBe(400);

  const edit = await post("/api/therapist/session-summary/submit", THERAPIST, {
    appointmentId,
    whatWeDid: `${DID} (edited)`,
    beforeNextTime: NEXT,
    baseUpdatedAt: base,
  });
  expect(edit.status, edit.text).toBe(200);

  const { data: revisions } = await db
    .from("session_summary_revisions")
    .select("id, what_we_did")
    .eq("summary_id", before!.id);
  expect(revisions?.map((r) => r.what_we_did)).toEqual([DID]);

  // Append-only by trigger, so even the service role cannot rewrite one.
  const { error: rewrite } = await db
    .from("session_summary_revisions")
    .update({ what_we_did: "rewritten" })
    .eq("id", revisions![0].id);
  expect(rewrite?.message ?? "").toContain("append-only");

  // Put the original text back for nothing else to depend on: a second edit.
  const { data: now } = await db.from("session_summaries").select("updated_at").eq("id", before!.id).single();
  const restore = await post("/api/therapist/session-summary/submit", THERAPIST, {
    appointmentId,
    whatWeDid: DID,
    beforeNextTime: NEXT,
    baseUpdatedAt: now!.updated_at,
  });
  expect(restore.status, restore.text).toBe(200);
});

test("PSS-005: the drawer's read is for a desk that manages Sessions", async () => {
  const adminId = await profileIdFor(db, QA_EMAILS.admin);
  try {
    await setQaAdminScope(db, adminId, "full");
    const full = await post("/api/admin/session-summary", QA_EMAILS.admin, { appointmentId });
    expect(full.status, full.text).toBe(200);
    expect((full.json.summary as { whatWeDid?: string })?.whatWeDid).toBe(DID);
    expect(JSON.stringify(full.json)).not.toContain(NOTE_TREATED);

    await setQaAdminScope(db, adminId, "finance");
    const finance = await post("/api/admin/session-summary", QA_EMAILS.admin, { appointmentId });
    expect(finance.status, "Finance reads Sessions for money, not what a patient was told").toBe(403);
  } finally {
    await db.from("profiles").update({ admin_scope: "full" }).eq("id", adminId);
  }

  const therapist = await post("/api/admin/session-summary", THERAPIST, { appointmentId });
  expect(therapist.status).toBe(403);
});

test("PSS-006: the public pages promise the summary, not the private note", async ({ page }) => {
  await page.goto(`${BASE}/how-it-works`);
  await waitForSplashToClear(page);
  const howItWorks = await page.locator("main").innerText();
  expect(howItWorks).toContain("a short summary after each session");
  expect(howItWorks).not.toContain("written record, updated every session");

  await page.goto(`${BASE}/mission`);
  await waitForSplashToClear(page);
  const mission = (await page.locator("main").innerText()).toLowerCase();
  expect(mission).not.toContain("every session's notes");
  expect(mission).toContain("a short summary after each session");
});
