// Multi-specialty health profile: the per-specialty question sets, the
// therapist-owned first fill, and the patient lock.
//
// Scoped like the rest of this suite -- server logic and the guards that
// protect it, driven through the real routes, plus the handful of browser
// cases where the guard being tested IS the client (a double click inside
// one frame is not observable from a request-level test).
//
// Fixtures: QA Patient B and QA Therapist A, torn down in beforeEach so a
// half-finished run cannot leave a record that makes the lock cases fail
// on working code.
import { test, expect, type APIRequestContext, type Browser } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import {
  BASE,
  QA_EMAILS,
  SUPABASE_ANON_KEY,
  SUPABASE_URL,
  adminClient,
  browserCookiesFor,
  cookieHeaderFor,
  profileIdFor,
} from "./helpers";

test.setTimeout(240_000);
const SEEN = { timeout: 60_000 };

const PATIENT = QA_EMAILS.patientB;
const THERAPIST = QA_EMAILS.therapistA;
const OTHER_THERAPIST = QA_EMAILS.therapistC;

let admin: ReturnType<typeof adminClient>;
let patientId = "";
let therapistId = "";
let otherTherapistId = "";
let patientCookie = "";
let therapistCookie = "";
let adminCookie = "";

const ORTHO_ANSWERS = {
  chief_complaint: "Right knee pain after twisting it playing football",
  since_when: "About 6 weeks",
  severity: "6",
};
const PEDS_ANSWERS = {
  peds_caregiver_name: "Priya Sharma",
  peds_caregiver_relationship: "Mother",
  peds_concern: "Not sitting without support at 11 months",
  peds_birth_history: "Premature (before 37 weeks)",
  peds_milestones: "Holds head steady\nRolls over",
};
const NEURO_ANSWERS = {
  neuro_diagnosis: "Stroke affecting the right side, March 2026",
  neuro_affected_side: "Right side",
  neuro_mobility: "Walk with a stick or frame",
  neuro_independence: "4",
};

/** Wipes every trace of this patient's condition record. */
async function resetProfile() {
  await admin.from("pain_assessments").delete().eq("patient_id", patientId);
  await admin.from("condition_change_requests").delete().eq("patient_id", patientId);
  await admin.from("condition_access_grants").delete().eq("patient_id", patientId);
  await admin.from("patient_condition_profiles").delete().eq("patient_id", patientId);
}

/** Puts a live record on file the way /onboard would. */
async function seedProfile(
  specialty: "ortho" | "neuro" | "pediatrics",
  data: Record<string, string>
) {
  await admin.from("patient_condition_profiles").insert({
    patient_id: patientId,
    specialty,
    status: "active",
    data,
    schema_version: specialty === "ortho" ? 2 : 1,
    last_submitted_by: therapistId,
    last_submitted_role: "therapist",
  });
  await admin.from("condition_change_requests").insert({
    patient_id: patientId,
    submitted_by: therapistId,
    submitted_by_role: "therapist",
    proposed_data: data,
    proposed_specialty: specialty,
    status: "approved",
    reviewed_by: therapistId,
    reviewed_at: new Date().toISOString(),
    admin_notes: "Patient onboarding by the therapist.",
  });
}

async function post(
  request: APIRequestContext,
  path: string,
  cookie: string,
  data: Record<string, unknown>
) {
  return request.post(`${BASE}${path}`, { headers: { Cookie: cookie }, data });
}

async function profileRow() {
  const { data } = await admin
    .from("patient_condition_profiles")
    .select("specialty, status, data, draft_data, draft_saved_by_role")
    .eq("patient_id", patientId)
    .maybeSingle();
  return data;
}

async function countRequests(status: string) {
  const { count } = await admin
    .from("condition_change_requests")
    .select("id", { count: "exact", head: true })
    .eq("patient_id", patientId)
    .eq("status", status);
  return count ?? 0;
}

/** Walks the wizard to its review step from wherever it opened. It resumes
 *  at the first unanswered question rather than the intro, so the opening
 *  screen differs with how much is already on file. */
async function advanceToReview(page: import("@playwright/test").Page) {
  const review = page.getByRole("button", { name: /Send for review/i });
  const intro = page.getByRole("button", { name: /^(Start|Continue)$/ });
  const next = page.getByRole("button", { name: /^(Next|Skip)$/ });
  if (await intro.isVisible().catch(() => false)) await intro.click();
  for (let i = 0; i < 12 && !(await review.isVisible().catch(() => false)); i++) {
    await next.click();
    await page.waitForTimeout(200);
  }
  await expect(review).toBeVisible(SEEN);
  return review;
}

async function pageAs(browser: Browser, email: string) {
  const ctx = await browser.newContext();
  await ctx.addCookies(await browserCookiesFor(email));
  return { ctx, page: await ctx.newPage() };
}

test.beforeAll(async () => {
  admin = adminClient();
  patientId = await profileIdFor(admin, PATIENT);
  therapistId = await profileIdFor(admin, THERAPIST);
  otherTherapistId = await profileIdFor(admin, OTHER_THERAPIST);
  [patientCookie, therapistCookie, adminCookie] = await Promise.all([
    cookieHeaderFor(PATIENT),
    cookieHeaderFor(THERAPIST),
    cookieHeaderFor(QA_EMAILS.admin),
  ]);

  // Assignment is what /onboard gates on: one past appointment is enough.
  for (const tid of [therapistId]) {
    const { count } = await admin
      .from("appointments")
      .select("id", { count: "exact", head: true })
      .eq("patient_id", patientId)
      .eq("therapist_id", tid);
    if (!count) {
      await admin.from("appointments").insert({
        patient_id: patientId,
        therapist_id: tid,
        slot_time: new Date(Date.now() - 86_400_000).toISOString(),
        status: "completed",
        payment_status: "paid",
        visit_mode: "online",
      });
    }
  }
});

test.beforeEach(async () => {
  await resetProfile();
});

test.afterAll(async () => {
  await resetProfile();
  await admin
    .from("appointments")
    .delete()
    .eq("patient_id", patientId)
    .eq("status", "completed")
    .eq("payment_status", "paid");
});

// ---------------------------------------------------------- ON: onboarding

test("ON-004/005/006: onboarding needs only assignment, writes live, audits once", async ({
  request,
}) => {
  const { count: grantsBefore } = await admin
    .from("condition_access_grants")
    .select("id", { count: "exact", head: true })
    .eq("patient_id", patientId);
  expect(grantsBefore).toBe(0);

  const res = await post(request, "/api/therapist/condition-profile/onboard", therapistCookie, {
    patientId,
    specialty: "ortho",
    data: ORTHO_ANSWERS,
    triageData: { age_band: "18 to 64", presenting_problem: "Injury, strain or overuse" },
  });
  expect(res.status()).toBe(200);

  const row = await profileRow();
  expect(row?.specialty).toBe("ortho");
  expect(row?.status).toBe("active");
  expect(await countRequests("pending")).toBe(0);
  expect(await countRequests("approved")).toBe(1);
});

test("ON-008: a switched-off condition type is refused server-side", async ({ request }) => {
  await admin.from("site_settings").update({ enabled_intake_specialties: ["ortho"] }).eq("id", true);
  try {
    const res = await post(request, "/api/therapist/condition-profile/onboard", therapistCookie, {
      patientId,
      specialty: "neuro",
      data: NEURO_ANSWERS,
    });
    expect(res.status()).toBe(400);
    expect((await res.json()).error).toMatch(/switched off/i);
  } finally {
    await admin
      .from("site_settings")
      .update({ enabled_intake_specialties: ["ortho", "neuro", "pediatrics"] })
      .eq("id", true);
  }
});

test("ON-009/010: required answers and unknown keys are re-checked server-side", async ({
  request,
}) => {
  const missing = await post(
    request,
    "/api/therapist/condition-profile/onboard",
    therapistCookie,
    { patientId, specialty: "ortho", data: { chief_complaint: "Knee" } }
  );
  expect(missing.status()).toBe(400);

  const foreign = await post(
    request,
    "/api/therapist/condition-profile/onboard",
    therapistCookie,
    { patientId, specialty: "ortho", data: { ...ORTHO_ANSWERS, neuro_diagnosis: "Stroke" } }
  );
  expect(foreign.status()).toBe(400);
  expect((await foreign.json()).error).toMatch(/unknown fields/i);
});

// --------------------------------------------------------- LK: patient lock

test("LK-004/005: the patient's write routes are shut while the record is empty", async ({
  request,
}) => {
  const submit = await post(request, "/api/patient/condition-profile/submit", patientCookie, {
    data: ORTHO_ANSWERS,
  });
  expect(submit.status()).toBe(403);

  // save-draft matters as much: it flips `status`, one of the gate's inputs.
  const draft = await post(request, "/api/patient/condition-profile/save-draft", patientCookie, {
    data: { chief_complaint: "Knee" },
  });
  expect(draft.status()).toBe(403);
});

test("LK-006: RLS refuses a locked patient going around the route", async () => {
  const anon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error: signInError } = await anon.auth.signInWithPassword({
    email: PATIENT,
    password: "QaTest!2024pass",
  });
  expect(signInError).toBeNull();

  const { error } = await anon.from("condition_change_requests").insert({
    patient_id: patientId,
    submitted_by: patientId,
    submitted_by_role: "patient",
    proposed_data: ORTHO_ANSWERS,
    status: "pending",
  });
  // The route check is convenience; this policy is the lock.
  expect(error).not.toBeNull();
  expect(error!.message).toMatch(/row-level security/i);
});

test("LK-007: the therapist's fill unlocks the patient with no admin step", async ({ request }) => {
  await post(request, "/api/therapist/condition-profile/onboard", therapistCookie, {
    patientId,
    specialty: "ortho",
    data: ORTHO_ANSWERS,
  });
  const res = await post(request, "/api/patient/condition-profile/submit", patientCookie, {
    data: { ...ORTHO_ANSWERS, notes: "Also had a hip problem two years ago." },
  });
  expect(res.status()).toBe(200);
  expect(await countRequests("pending")).toBe(1);
});

// ----------------------------------------------------- SP: specialty isolation

test("SP-004: a Pain Map exam is refused on a non-orthopaedic record", async ({ request }) => {
  await seedProfile("neuro", NEURO_ANSWERS);
  const body = {
    patientId,
    region: "knee",
    side: "right",
    answers: [{ key: "pain_type", value: "Sharp" }],
    painPercent: 50,
  };

  const asTherapist = await post(
    request,
    "/api/therapist/pain-assessments/submit",
    therapistCookie,
    body
  );
  expect(asTherapist.status()).toBe(400);
  expect((await asTherapist.json()).error).toMatch(/orthopaedic/i);

  const asAdmin = await post(request, "/api/admin/pain-assessments/submit", adminCookie, body);
  expect(asAdmin.status()).toBe(400);

  const { count } = await admin
    .from("pain_assessments")
    .select("id", { count: "exact", head: true })
    .eq("patient_id", patientId);
  expect(count).toBe(0);
});

test("SP-002/006: a paediatric profile shows milestones, no body map, and says 7", async ({
  browser,
}) => {
  await seedProfile("pediatrics", PEDS_ANSWERS);
  const { ctx, page } = await pageAs(browser, PATIENT);
  await page.goto(`${BASE}/patient/dashboard/health-profile`);
  await expect(page.getByText(/Not sitting without support/i).first()).toBeVisible(SEEN);
  await expect(page.getByText(/MILESTONES REACHED/i).first()).toBeVisible(SEEN);
  await expect(page.getByText(/Your body map/i)).toHaveCount(0);
  await expect(page.getByText(/AREAS YOU MARKED/i)).toHaveCount(0);
  const body = await page.locator("body").innerText();
  expect(body).not.toMatch(/of 9/);
  await ctx.close();
});

// ------------------------------------------------------------ AU: attribution

test("AU-001/002: a therapist-written record is not presented as the patient's to-do", async ({
  browser,
}) => {
  await seedProfile("ortho", ORTHO_ANSWERS);
  const { ctx, page } = await pageAs(browser, PATIENT);
  await page.goto(`${BASE}/patient/dashboard/health-profile`);
  await expect(page.getByText(/3 answered with your therapist · 4 you can add/i)).toBeVisible(SEEN);
  await expect(page.getByRole("button", { name: /Add more detail/i })).toBeVisible(SEEN);
  await expect(page.getByRole("button", { name: /Add the missing answers/i })).toHaveCount(0);
  await ctx.close();
});

test("AU-005: a therapist's abandoned draft is not shown back to the patient as theirs", async ({
  browser,
}) => {
  await seedProfile("ortho", ORTHO_ANSWERS);
  await admin
    .from("patient_condition_profiles")
    .update({
      draft_data: { ...ORTHO_ANSWERS, worsens: "Stairs" },
      draft_saved_by_role: "therapist",
    })
    .eq("patient_id", patientId);

  const { ctx, page } = await pageAs(browser, PATIENT);
  await page.goto(`${BASE}/patient/dashboard/health-profile`);
  await expect(page.getByText(/Right knee pain/i).first()).toBeVisible(SEEN);
  await expect(page.getByText(/You left off part-way through/i)).toHaveCount(0);
  await ctx.close();
});

// -------------------------------------------------------- RT: re-triage/merge

test("RT-001/002: re-triage keeps the earlier record and shows only the current one", async ({
  request,
  browser,
}) => {
  await seedProfile("pediatrics", PEDS_ANSWERS);
  const res = await post(request, "/api/therapist/condition-profile/onboard", therapistCookie, {
    patientId,
    specialty: "ortho",
    data: ORTHO_ANSWERS,
  });
  expect(res.status()).toBe(200);

  const row = await profileRow();
  expect(row?.specialty).toBe("ortho");
  // THE point of the merge.
  expect((row?.data as Record<string, string>).peds_concern).toBe(PEDS_ANSWERS.peds_concern);
  expect((row?.data as Record<string, string>).chief_complaint).toBe(ORTHO_ANSWERS.chief_complaint);

  const { ctx, page } = await pageAs(browser, PATIENT);
  await page.goto(`${BASE}/patient/dashboard/health-profile`);
  await expect(page.getByText(/Right knee pain/i).first()).toBeVisible(SEEN);
  await expect(page.getByText(/Not sitting without support/i)).toHaveCount(0);
  await ctx.close();
});

test("RT-003: a same-type correction is allowed", async ({ request }) => {
  await seedProfile("ortho", ORTHO_ANSWERS);
  const res = await post(request, "/api/therapist/condition-profile/onboard", therapistCookie, {
    patientId,
    specialty: "ortho",
    data: { ...ORTHO_ANSWERS, severity: "3" },
    triageData: { age_band: "18 to 64", presenting_problem: "Injury, strain or overuse" },
  });
  expect(res.status()).toBe(200);
  expect(((await profileRow())?.data as Record<string, string>).severity).toBe("3");
});

test("RT-004/005: a pending submission and a re-triage cannot cross", async ({ request }) => {
  await seedProfile("ortho", ORTHO_ANSWERS);
  await post(request, "/api/patient/condition-profile/submit", patientCookie, {
    data: { ...ORTHO_ANSWERS, notes: "Something else" },
  });
  expect(await countRequests("pending")).toBe(1);

  // RT-004: changing the type would invalidate what is queued.
  const retriage = await post(
    request,
    "/api/therapist/condition-profile/onboard",
    therapistCookie,
    { patientId, specialty: "neuro", data: NEURO_ANSWERS }
  );
  expect(retriage.status()).toBe(409);

  // RT-005: and approving a stale one after a change is refused too.
  await admin.from("patient_condition_profiles").update({ specialty: "neuro" }).eq("patient_id", patientId);
  const { data: pending } = await admin
    .from("condition_change_requests")
    .select("id")
    .eq("patient_id", patientId)
    .eq("status", "pending")
    .single();
  const decide = await post(request, "/api/admin/condition-requests/decide", adminCookie, {
    requestId: pending!.id,
    action: "approve",
  });
  expect(decide.status()).toBe(409);
});

// ---------------------------------------------------------------- AD: admin

test("AD-004/005: an admin direct edit merges, and waits for the queue", async ({ request }) => {
  await seedProfile("pediatrics", PEDS_ANSWERS);
  await admin
    .from("patient_condition_profiles")
    .update({ specialty: "ortho", data: { ...PEDS_ANSWERS, ...ORTHO_ANSWERS } })
    .eq("patient_id", patientId);

  const edit = await post(request, "/api/admin/condition-requests/direct-edit", adminCookie, {
    patientId,
    data: { ...ORTHO_ANSWERS, helps: "Ice" },
  });
  expect(edit.status()).toBe(200);
  const row = await profileRow();
  expect((row?.data as Record<string, string>).helps).toBe("Ice");
  expect((row?.data as Record<string, string>).peds_concern).toBe(PEDS_ANSWERS.peds_concern);

  // AD-005: a queued submission must be resolved first.
  await post(request, "/api/patient/condition-profile/submit", patientCookie, {
    data: { ...ORTHO_ANSWERS, notes: "Queued" },
  });
  const blocked = await post(request, "/api/admin/condition-requests/direct-edit", adminCookie, {
    patientId,
    data: { ...ORTHO_ANSWERS, helps: "Heat" },
  });
  expect(blocked.status()).toBe(409);
});

test("AD-006/007: question keys must match their tab, and ortho cannot be switched off", async ({
  request,
}) => {
  const wrongTab = await post(request, "/api/admin/intake-questions/update", adminCookie, {
    specialty: "ortho",
    questionKey: "neuro_diagnosis",
    questionText: "Nope",
    required: true,
  });
  expect(wrongTab.status()).toBe(400);

  const offAll = await post(request, "/api/admin/update-setting", adminCookie, {
    key: "enabled_intake_specialties",
    value: [],
  });
  expect(offAll.status()).toBe(200);
  const { data } = await admin
    .from("site_settings")
    .select("enabled_intake_specialties")
    .eq("id", true)
    .maybeSingle();
  // Never empty, and ortho always survives -- triage needs somewhere to land.
  expect(data!.enabled_intake_specialties).toContain("ortho");
  await admin
    .from("site_settings")
    .update({ enabled_intake_specialties: ["ortho", "neuro", "pediatrics"] })
    .eq("id", true);
});

// ------------------------------------------------------------- SEC: authz

test("SEC-001/002/005: create is not edit, and neither is open to anyone", async ({ request }) => {
  const otherCookie = await cookieHeaderFor(OTHER_THERAPIST);

  // SEC-001: a therapist with no appointment for this patient.
  const unassigned = await post(
    request,
    "/api/therapist/condition-profile/onboard",
    otherCookie,
    { patientId, specialty: "ortho", data: ORTHO_ANSWERS }
  );
  expect(unassigned.status()).toBe(403);
  expect(otherTherapistId).toBeTruthy();

  // SEC-002: assigned, but editing a live record still needs the grant.
  await seedProfile("ortho", ORTHO_ANSWERS);
  const ungrantedEdit = await post(
    request,
    "/api/therapist/condition-profile/submit",
    therapistCookie,
    { patientId, data: { ...ORTHO_ANSWERS, helps: "Ice" } }
  );
  expect(ungrantedEdit.status()).toBe(403);

  // SEC-005: the admin routes are admin-only.
  for (const cookie of [therapistCookie, patientCookie]) {
    const res = await post(request, "/api/admin/condition-requests/direct-edit", cookie, {
      patientId,
      data: ORTHO_ANSWERS,
    });
    expect(res.status()).toBe(403);
  }
});

test("SEC-003: a patient cannot choose their own condition type", async ({ request }) => {
  await seedProfile("ortho", ORTHO_ANSWERS);
  const res = await post(request, "/api/patient/condition-profile/submit", patientCookie, {
    specialty: "neuro",
    data: { ...ORTHO_ANSWERS, notes: "Trying it on" },
  });
  expect(res.status()).toBe(200);
  // The body's `specialty` is ignored; the therapist's call stands.
  expect((await profileRow())?.specialty).toBe("ortho");
});

// -------------------------------------------------------------- SPAM: spam

test("SPAM-001: spamming the onboarding submit writes exactly one audit row", async ({
  request,
}) => {
  const body = {
    patientId,
    specialty: "ortho" as const,
    data: ORTHO_ANSWERS,
    triageData: { age_band: "18 to 64", presenting_problem: "Injury, strain or overuse" },
  };
  const responses = await Promise.all(
    Array.from({ length: 10 }, () =>
      post(request, "/api/therapist/condition-profile/onboard", therapistCookie, body)
    )
  );
  // No 500s: losing a race is a handled outcome, not a crash.
  expect(responses.every((r) => r.status() < 500)).toBe(true);

  const row = await profileRow();
  expect(row?.specialty).toBe("ortho");
  expect(row?.status).toBe("active");
  // The Review History is the only record a live write happened. Ten
  // identical entries claiming to be the onboarding is not a record.
  expect(await countRequests("approved")).toBe(1);
});

test("SPAM-002: spamming the patient submit leaves exactly one pending request", async ({
  request,
}) => {
  await seedProfile("ortho", ORTHO_ANSWERS);
  const responses = await Promise.all(
    Array.from({ length: 10 }, () =>
      post(request, "/api/patient/condition-profile/submit", patientCookie, {
        data: { ...ORTHO_ANSWERS, notes: "Spam" },
      })
    )
  );
  expect(await countRequests("pending")).toBe(1);
  expect(responses.filter((r) => r.status() === 200)).toHaveLength(1);
  // The losers get a sentence, not a raw Postgres string.
  const loser = responses.find((r) => r.status() !== 200)!;
  expect(loser.status()).toBe(409);
  expect((await loser.json()).error).not.toMatch(/violates|constraint|duplicate key/i);
});

test("SPAM-003: spamming the access request leaves exactly one open grant", async ({ request }) => {
  await seedProfile("ortho", ORTHO_ANSWERS);
  const responses = await Promise.all(
    Array.from({ length: 10 }, () =>
      post(request, "/api/therapist/condition-access/request", therapistCookie, { patientId })
    )
  );
  expect(responses.every((r) => r.status() < 500)).toBe(true);
  const { count } = await admin
    .from("condition_access_grants")
    .select("id", { count: "exact", head: true })
    .eq("patient_id", patientId)
    .in("status", ["requested", "approved"]);
  expect(count).toBe(1);
});

test("SPAM-004: spamming Approve applies the change once", async ({ request }) => {
  await seedProfile("ortho", ORTHO_ANSWERS);
  await post(request, "/api/patient/condition-profile/submit", patientCookie, {
    data: { ...ORTHO_ANSWERS, notes: "Once" },
  });
  const { data: pending } = await admin
    .from("condition_change_requests")
    .select("id")
    .eq("patient_id", patientId)
    .eq("status", "pending")
    .single();

  const responses = await Promise.all(
    Array.from({ length: 10 }, () =>
      post(request, "/api/admin/condition-requests/decide", adminCookie, {
        requestId: pending!.id,
        action: "approve",
      })
    )
  );
  expect(responses.filter((r) => r.status() === 200)).toHaveLength(1);
  expect(await countRequests("pending")).toBe(0);
  expect(((await profileRow())?.data as Record<string, string>).notes).toBe("Once");
});

test("SPAM-005: a double click inside one frame sends one request", async ({ browser }) => {
  await seedProfile("ortho", ORTHO_ANSWERS);
  const { ctx, page } = await pageAs(browser, PATIENT);

  // Hold the request open so the second click lands while the first is
  // still in flight -- which is the only state the guard has to survive.
  let sent = 0;
  await page.route("**/api/patient/condition-profile/submit", async (route) => {
    sent += 1;
    await new Promise((r) => setTimeout(r, 1500));
    await route.continue();
  });

  await page.goto(`${BASE}/patient/dashboard/health-profile`);
  await page.getByRole("button", { name: /Add more detail|Review or update answers/i }).click(SEEN);
  await advanceToReview(page);

  // Three clicks in ONE task: React cannot re-render between them, so a
  // `disabled` attribute driven by state is already too late. Only a
  // synchronous ref stops the second and third.
  await page.evaluate(() => {
    const button = Array.from(document.querySelectorAll("button")).find((b) =>
      /Send for review/i.test(b.textContent ?? "")
    );
    button?.click();
    button?.click();
    button?.click();
  });
  expect(sent, `${sent} requests reached the server from one double click`).toBe(1);
  // The route handler holds the request 1.5s before letting it through, so
  // give the write time to land before counting.
  await expect.poll(() => countRequests("pending"), { timeout: 30_000 }).toBe(1);
  await ctx.close();
});

// -------------------------------------------------------- INT: interruption

test("INT-002: a dropped connection during submit is reported, not swallowed", async ({
  browser,
}) => {
  await seedProfile("ortho", ORTHO_ANSWERS);
  const { ctx, page } = await pageAs(browser, PATIENT);

  await page.goto(`${BASE}/patient/dashboard/health-profile`);
  await page.getByRole("button", { name: /Add more detail|Review or update answers/i }).click(SEEN);
  const review = await advanceToReview(page);

  // The tunnel dies at the moment of the clinical write.
  await page.route("**/api/patient/condition-profile/submit", (route) => route.abort("failed"));
  await review.click();

  // The dialog must say so. Silently returning to rest tells a person
  // their record saved when it did not.
  await expect(
    page.getByText(/could not|couldn't|try again|connection/i).first()
  ).toBeVisible({ timeout: 20_000 });
  // And their answers are still in front of them.
  await expect(review).toBeVisible();
  expect(await countRequests("pending")).toBe(0);
  await ctx.close();
});

test("INT-001/008: an interrupted fill survives the wizard closing", async ({ request }) => {
  await seedProfile("ortho", ORTHO_ANSWERS);
  const draft = await post(request, "/api/patient/condition-profile/save-draft", patientCookie, {
    data: { ...ORTHO_ANSWERS, worsens: "Stairs" },
  });
  expect(draft.status()).toBe(200);

  const row = await profileRow();
  expect((row?.draft_data as Record<string, string>).worsens).toBe("Stairs");
  // And it is attributed, so it is offered back to the right person.
  expect(row?.draft_saved_by_role).toBe("patient");
});

test("INT-005: two therapists onboarding at once leave one coherent record", async ({
  request,
}) => {
  // Give the second therapist an appointment so both are genuinely assigned.
  await admin.from("appointments").insert({
    patient_id: patientId,
    therapist_id: otherTherapistId,
    slot_time: new Date(Date.now() - 172_800_000).toISOString(),
    status: "completed",
    payment_status: "paid",
    visit_mode: "online",
  });
  const otherCookie = await cookieHeaderFor(OTHER_THERAPIST);
  try {
    const [a, b] = await Promise.all([
      post(request, "/api/therapist/condition-profile/onboard", therapistCookie, {
        patientId,
        specialty: "ortho",
        data: ORTHO_ANSWERS,
      }),
      post(request, "/api/therapist/condition-profile/onboard", otherCookie, {
        patientId,
        specialty: "neuro",
        data: NEURO_ANSWERS,
      }),
    ]);
    expect([a.status(), b.status()].every((s) => s < 500)).toBe(true);

    const row = await profileRow();
    const data = row?.data as Record<string, string>;
    // Whichever won, the record must describe one of them completely --
    // not a specialty whose own answers are missing.
    if (row?.specialty === "ortho") expect(data.chief_complaint).toBeTruthy();
    else expect(data.neuro_diagnosis).toBeTruthy();
  } finally {
    await admin
      .from("appointments")
      .delete()
      .eq("patient_id", patientId)
      .eq("therapist_id", otherTherapistId);
  }
});

test("INT-006: a patient and a therapist submitting together leave one queue entry", async ({
  request,
}) => {
  await seedProfile("ortho", ORTHO_ANSWERS);
  await admin.from("condition_access_grants").insert({
    patient_id: patientId,
    therapist_id: therapistId,
    status: "approved",
    decided_at: new Date().toISOString(),
  });

  const [p, t] = await Promise.all([
    post(request, "/api/patient/condition-profile/submit", patientCookie, {
      data: { ...ORTHO_ANSWERS, notes: "From the patient" },
    }),
    post(request, "/api/therapist/condition-profile/submit", therapistCookie, {
      patientId,
      data: { ...ORTHO_ANSWERS, notes: "From the therapist" },
    }),
  ]);
  expect([p.status(), t.status()].every((s) => s < 500)).toBe(true);
  expect(await countRequests("pending")).toBe(1);
});

// -------------------------------------------------------------- MIG

test("MIG-003: rows written before the column exists read as orthopaedic", async () => {
  await admin.from("patient_condition_profiles").insert({
    patient_id: patientId,
    status: "active",
    data: ORTHO_ANSWERS,
  });
  const row = await profileRow();
  expect(row?.specialty).toBe("ortho");
});
