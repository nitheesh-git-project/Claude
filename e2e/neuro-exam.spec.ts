// The neurological examination chart (QA F-17): a therapist records an
// exam from the patient's record, it reads back as a summary, a second exam
// is compared with the first, the patient reads it on their own Health
// Profile, and a therapist who is not on the patient can neither write it
// nor read it.
//
// Fixtures: a throwaway neurological patient of its own (so the counts and
// the "since" comparison are about this spec's rows only), one completed
// session with QA Therapist A, and QA Therapist B as the clinician with no
// relationship to the patient.
//
// neuro_assessments is append-only (a trigger refuses update and delete),
// so the exams this writes stay -- disposable projects only. For the same
// reason the fixture account cannot be deleted afterwards; the cleanup says
// so rather than failing the run.
import { test, expect, type Browser } from "@playwright/test";
import {
  BASE,
  QA_EMAILS,
  adminClient,
  browserCookiesFor,
  cookieHeaderFor,
  createFixtureAccount,
  deleteFixtureAccount,
  insertPastFixtureAppointment,
  markDashboardTourSeen,
  pageUntilVisible,
  profileIdFor,
  rlsClientFor,
  waitForSplashToClear,
} from "./helpers";

test.skip(
  process.env.E2E_ALLOW_APPEND_ONLY_WRITES !== "1" && process.env.CI_LOCAL_STACK !== "1",
  "writes append-only neurological exams; set E2E_ALLOW_APPEND_ONLY_WRITES=1 on a disposable project"
);

test.describe.configure({ mode: "serial" });

const MARKER = "E2E neuro-exam";
const db = adminClient();
let patient: { id: string; email: string; name: string } | undefined;
let therapistAId = "";

test.beforeAll(async () => {
  therapistAId = await profileIdFor(db, QA_EMAILS.therapistA);
  await markDashboardTourSeen(QA_EMAILS.therapistA);
  await markDashboardTourSeen(QA_EMAILS.therapistB);
  patient = await createFixtureAccount("Neuro Exam");
  const { error: profileError } = await db.from("patient_condition_profiles").insert({
    patient_id: patient.id,
    specialty: "neuro",
    status: "active",
    data: { neuro_diagnosis: "E2E stroke, left side" },
  });
  expect(profileError, profileError?.message).toBeNull();
  // A delivered session: what makes Therapist A "assigned" and what the
  // exam gate (hasStartedSessionWithPatient) asks for.
  await insertPastFixtureAppointment(db, {
    patient_id: patient.id,
    therapist_id: therapistAId,
    status: "completed",
    payment_status: "paid",
    visit_mode: "online",
    duration_minutes: 30,
    concern: MARKER,
  });
});

test.afterAll(async () => {
  await deleteFixtureAccount(patient?.id);
});

async function openAs(browser: Browser, email: string, path: string) {
  const ctx = await browser.newContext();
  await ctx.addCookies(await browserCookiesFor(email));
  const page = await ctx.newPage();
  const response = await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded" });
  return { page, response };
}

function examCard(page: import("@playwright/test").Page) {
  // The card is the innermost block holding its own heading.
  return page
    .locator("div")
    .filter({ has: page.getByRole("heading", { level: 2, name: "Neurological examination" }) })
    .last();
}

function scale(dialog: import("@playwright/test").Locator, group: string, grade: RegExp) {
  return dialog.getByRole("radiogroup", { name: group }).getByRole("radio", { name: grade });
}

// Done on a neurological patient's session leads with the neurological
// examination, not the Pain Map, and the note will not finish the session
// without one. Runs first, while this fixture patient has no exam at all --
// any exam recorded later in the file falls inside every past session's
// window. The finish is refused before any request, so no settlement row
// is written; the route's own refusal and the finish after an exam are
// finish-session.spec.ts FS-004.
test("NE-000: Done on a neuro session asks for the neurological exam, never the Pain Map", async ({ browser }) => {
  test.setTimeout(90_000);
  const concern = `${MARKER} done`;
  let seeded = false;
  for (let h = 1; h <= 6 && !seeded; h++) {
    const slot = new Date(Date.now() - h * 60 * 60 * 1000);
    slot.setMinutes(0, 0, 0);
    const { error } = await db.from("appointments").insert({
      patient_id: patient!.id,
      therapist_id: therapistAId,
      slot_time: slot.toISOString(),
      status: "confirmed",
      payment_status: "paid",
      visit_mode: "online",
      duration_minutes: 30,
      concern,
    });
    seeded = !error;
  }
  expect(seeded, "no free started hour for the Done session").toBe(true);

  const { page } = await openAs(browser, QA_EMAILS.therapistA, "/therapist/dashboard/sessions");
  try {
    const card = page.locator("div.rounded-xl", { hasText: concern }).first();
    expect(await pageUntilVisible(page, "sessions", card)).toBe(true);
    await card.getByRole("button", { name: "Done", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText("Finish session · write the note")).toBeVisible();
    await expect(dialog.getByText("Neurological examination", { exact: false }).first()).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Record the examination" })).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Update the Pain Map" })).toHaveCount(0);

    await dialog.getByLabel("What did you treat today?").fill("Gait and balance retraining");
    await dialog.getByLabel("How did the patient respond?").fill("Steadier by the end");
    await dialog.getByLabel("Plan for the next session").fill("Progress standing balance");
    await dialog.getByRole("button", { name: /Save note & finish session/ }).click();
    await expect(
      dialog.getByText("Record the neurological examination for this session before finishing it.")
    ).toBeVisible();
    const { data: still } = await db.from("appointments").select("status").eq("concern", concern).single();
    expect(still!.status).toBe("confirmed");
  } finally {
    await page.context().close();
  }
});

test("NE-001: record an exam, reopen the record, re-examine, and read the change", async ({ browser }) => {
  test.setTimeout(120_000);
  const { page } = await openAs(browser, QA_EMAILS.therapistA, `/therapist/dashboard/health-profile/${patient!.id}`);
  try {
    await waitForSplashToClear(page);
    const card = examCard(page);
    await expect(card).toBeVisible({ timeout: 60_000 });
    // The deferred notice is gone for a neurological patient.
    await expect(page.getByText("is still being built")).toHaveCount(0);
    await expect(card.getByText("No neurological examination recorded yet")).toBeVisible();

    // --- First examination ---
    await card.getByRole("button", { name: "Record an examination" }).click();
    let dialog = page.getByRole("dialog", { name: /Examining/ });
    await expect(dialog).toBeVisible();
    // Every grade carries its meaning as part of its name.
    await expect(scale(dialog, "Elbow flexors, left", /^1\+, Slight increase/)).toBeVisible();
    // Not tested is the starting state, and a real choice.
    await expect(scale(dialog, "Elbow flexors, left", /^Not tested$/)).toHaveAttribute("aria-checked", "true");

    await scale(dialog, "Elbow flexors, left", /^2,/).click();
    await scale(dialog, "Elbow flexors, right", /^0,/).click();
    await expect(scale(dialog, "Elbow flexors, left", /^2,/)).toHaveAttribute("aria-checked", "true");
    // Keyboard: arrows move along the scale and choose as they go.
    await scale(dialog, "Shoulder abduction, left", /^Not tested$/).focus();
    for (let i = 0; i < 4; i++) await page.keyboard.press("ArrowRight"); // -, 0, 1, 2, 3
    await expect(scale(dialog, "Shoulder abduction, left", /^3,/)).toHaveAttribute("aria-checked", "true");
    await scale(dialog, "Shoulder abduction, right", /^5,/).click();
    // "Mark the rest normal" fills only what was not scored.
    await dialog
      .getByRole("region", { name: "Reflexes" })
      .getByRole("button", { name: "Mark the rest normal" })
      .click();
    await expect(scale(dialog, "Plantar response, left", /^Down,/)).toHaveAttribute("aria-checked", "true");

    await dialog.getByRole("spinbutton", { name: "Berg Balance Scale" }).fill("38");
    await expect(dialog.getByText(/Medium fall risk - 21-40/)).toBeVisible();
    await dialog.getByRole("button", { name: /^Hemiplegic/ }).click();
    await dialog.getByRole("button", { name: /^Walking stick/ }).click();
    await dialog.getByRole("spinbutton", { name: "Timed Up and Go" }).fill("18.5");
    await expect(dialog.getByText(/13.5 s or more - raised fall risk/)).toBeVisible();
    await dialog.getByRole("textbox", { name: "Clinical notes" }).fill(`${MARKER}: first examination`);

    await dialog.getByRole("button", { name: "Save examination" }).click();
    await expect(page.getByText(`Neurological examination saved for ${patient!.name}`)).toBeVisible();
    await expect(dialog).toHaveCount(0);

    // --- Reopen: the record, read back ---
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(card.getByText("38/56").first()).toBeVisible({ timeout: 60_000 });
    await expect(card.getByText(/Medium fall risk/).first()).toBeVisible();
    await expect(card.getByText("L≠R").first()).toBeVisible();
    await expect(card.getByText(`${MARKER}: first examination`)).toBeVisible();
    await expect(card.getByText("The first examination on record.", { exact: false })).toBeVisible();

    // --- Re-examination, compared with the first ---
    await card.getByRole("button", { name: "Record a re-examination" }).click();
    dialog = page.getByRole("dialog", { name: /Examining/ });
    await expect(dialog.getByText("Last time: L 2 · R 0")).toBeVisible();
    await scale(dialog, "Elbow flexors, left", /^1,/).click();
    await scale(dialog, "Elbow flexors, right", /^0,/).click();
    await scale(dialog, "Shoulder abduction, left", /^4,/).click();
    await dialog.getByRole("spinbutton", { name: "Berg Balance Scale" }).fill("44");
    await dialog.getByRole("button", { name: "Save examination" }).click();
    await expect(dialog).toHaveCount(0);

    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(card.getByText("44/56").first()).toBeVisible({ timeout: 60_000 });
    const since = card.getByRole("region", { name: "Change since the previous examination" });
    await expect(since).toBeVisible();
    await expect(since.getByText(/Better \(3\)/)).toBeVisible();
    await expect(since.getByText(/Berg Balance Scale: 38\/56/)).toBeVisible();
    // Both exams are on record and the older one can be opened.
    const history = card.getByRole("group", { name: /Examinations on record \(2\)/ });
    await expect(history.getByRole("button")).toHaveCount(2);
    await history.getByRole("button").nth(1).click();
    // The score shows twice -- the headline tile and the Balance section.
    await expect(card.getByText("38/56").first()).toBeVisible();
  } finally {
    await page.context().close();
  }
});

test("NE-002: the patient reads the exam on their own Health Profile, read-only", async ({ browser }) => {
  test.setTimeout(90_000);
  const { page } = await openAs(browser, patient!.email, "/patient/dashboard/health-profile");
  try {
    await waitForSplashToClear(page);
    await expect(page.getByRole("heading", { name: "Your examination" })).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText("Balance score").first()).toBeVisible();
    await expect(page.getByText("44/56").first()).toBeVisible();
    await expect(page.getByText("is still being built")).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Record a/ })).toHaveCount(0);
  } finally {
    await page.context().close();
  }
});

test("NE-003: the server refuses a value its scale does not offer", async ({ request }) => {
  const res = await request.post(`${BASE}/api/therapist/neuro-assessments/submit`, {
    headers: { cookie: await cookieHeaderFor(QA_EMAILS.therapistA), "content-type": "application/json" },
    data: { patientId: patient!.id, findings: { bilateral: { tone_elbow_flexors: { left: "2+" } } } },
  });
  expect(res.status()).toBe(400);
  expect((await res.json()).error).toMatch(/Modified Ashworth/);

  const empty = await request.post(`${BASE}/api/therapist/neuro-assessments/submit`, {
    headers: { cookie: await cookieHeaderFor(QA_EMAILS.therapistA), "content-type": "application/json" },
    data: { patientId: patient!.id, findings: {} },
  });
  expect(empty.status()).toBe(400);
});

test("NE-004: a therapist not on the patient can neither record nor read the exam", async ({ browser, request }) => {
  test.setTimeout(90_000);
  const write = await request.post(`${BASE}/api/therapist/neuro-assessments/submit`, {
    headers: { cookie: await cookieHeaderFor(QA_EMAILS.therapistB), "content-type": "application/json" },
    data: { patientId: patient!.id, findings: { bilateral: { power_hip_flexion: { left: "5", right: "5" } } } },
  });
  expect(write.status()).toBe(403);

  // The record itself is not theirs to open.
  const { page, response } = await openAs(browser, QA_EMAILS.therapistB, `/therapist/dashboard/health-profile/${patient!.id}`);
  try {
    expect(response?.status()).toBe(404);
  } finally {
    await page.context().close();
  }

  // And at the row: RLS returns nothing to them, while the treating
  // therapist reads both exams -- both halves, so a policy that refused
  // everybody could not pass.
  const outsider = await rlsClientFor(QA_EMAILS.therapistB);
  const { data: theirs, error: theirError } = await outsider
    .from("neuro_assessments")
    .select("id")
    .eq("patient_id", patient!.id);
  expect(theirError).toBeNull();
  expect(theirs ?? []).toHaveLength(0);
  const treating = await rlsClientFor(QA_EMAILS.therapistA);
  const { data: ours } = await treating.from("neuro_assessments").select("id").eq("patient_id", patient!.id);
  expect((ours ?? []).length).toBeGreaterThanOrEqual(2);
  // Append-only, at the database: an update raises even for the service role.
  const { error: rewrite } = await db
    .from("neuro_assessments")
    .update({ findings: { notes: "rewritten" } })
    .eq("patient_id", patient!.id);
  expect(rewrite?.message ?? "").toMatch(/append-only/);
});
