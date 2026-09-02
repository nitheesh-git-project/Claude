import { test, expect, request as playwrightRequest } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  BASE,
  QA_EMAILS,
  adminClient,
  browserCookiesFor,
  cookieHeaderFor,
  profileIdFor,
} from "./helpers";

const FAKE_ID = "00000000-0000-4000-8000-000000000000";

// The two things an admin may do to a recommendation, and the many they may
// not. A care plan is the only route by which a patient buys a programme, so
// these routes decide whether the clinic can act at all when the author
// cannot -- and how far that reach goes.
test.describe("Admin reach over recommendations", () => {
  test("ACP-001: both routes refuse an unauthenticated caller", async ({ request }) => {
    for (const path of ["/api/admin/withdraw-care-plan", "/api/admin/author-care-plan"]) {
      const res = await request.post(`${BASE}${path}`, {
        headers: { "content-type": "application/json" },
        data: { carePlanId: FAKE_ID, reason: "a long enough reason" },
      });
      expect(res.status(), path).toBe(403);
    }
  });

  test("ACP-002: both routes refuse a patient and a therapist session", async ({ request }) => {
    for (const who of [QA_EMAILS.patientA, QA_EMAILS.therapistA]) {
      const cookie = await cookieHeaderFor(who);
      for (const path of ["/api/admin/withdraw-care-plan", "/api/admin/author-care-plan"]) {
        const res = await request.post(`${BASE}${path}`, {
          headers: { cookie, "content-type": "application/json" },
          data: { carePlanId: FAKE_ID, reason: "a long enough reason" },
        });
        expect(res.status(), `${path} for ${who}`).toBe(403);
      }
    }
  });

  test("ACP-003: withdrawing needs a real reason, not a keystroke", async ({ request }) => {
    const cookie = await cookieHeaderFor(QA_EMAILS.admin);
    for (const reason of ["", "   ", "too short"]) {
      const res = await request.post(`${BASE}/api/admin/withdraw-care-plan`, {
        headers: { cookie, "content-type": "application/json" },
        data: { carePlanId: FAKE_ID, reason },
      });
      expect(res.status(), `reason ${JSON.stringify(reason)}`).toBe(400);
      expect(await res.text()).toContain("at least");
    }
  });

  test("ACP-004: authoring on behalf needs a reason too", async ({ request }) => {
    const cookie = await cookieHeaderFor(QA_EMAILS.admin);
    const res = await request.post(`${BASE}/api/admin/author-care-plan`, {
      headers: { cookie, "content-type": "application/json" },
      data: {
        patientId: FAKE_ID,
        appointmentId: FAKE_ID,
        packageId: FAKE_ID,
        offerKind: "session_package",
        reason: "short",
      },
    });
    expect(res.status()).toBe(400);
    expect(await res.text()).toContain("at least");
  });

  test("ACP-005: authoring refuses an unknown programme type", async ({ request }) => {
    const cookie = await cookieHeaderFor(QA_EMAILS.admin);
    const res = await request.post(`${BASE}/api/admin/author-care-plan`, {
      headers: { cookie, "content-type": "application/json" },
      data: {
        patientId: FAKE_ID,
        appointmentId: FAKE_ID,
        packageId: FAKE_ID,
        offerKind: "whatever_they_like",
        reason: "the therapist is on leave until Monday",
      },
    });
    expect(res.status()).toBe(400);
  });

  test("ACP-006: there is no price, session count or discount to send", async ({ request }) => {
    // The point of the whole design: those columns do not exist on a version,
    // so smuggling them in a body changes nothing. Asserted by sending them
    // and confirming the route still refuses on its ordinary grounds rather
    // than accepting a cheaper programme.
    const cookie = await cookieHeaderFor(QA_EMAILS.admin);
    const res = await request.post(`${BASE}/api/admin/author-care-plan`, {
      headers: { cookie, "content-type": "application/json" },
      data: {
        patientId: FAKE_ID,
        appointmentId: FAKE_ID,
        packageId: FAKE_ID,
        offerKind: "session_package",
        reason: "the therapist is on leave until Monday",
        pricePaise: 1,
        sessionCount: 99,
        discountPercent: 100,
      },
    });
    expect(res.status()).not.toBe(200);
  });

  test("ACP-007: the Recommendations screen is on Sessions and renders", async ({ browser }) => {
    const ctx = await browser.newContext();
    await ctx.addCookies(await browserCookiesFor(QA_EMAILS.admin));
    const page = await ctx.newPage();
    await page.goto(`${BASE}/admin/dashboard?section=sessions&tab=recommendations`);
    await expect(page.getByText("Waiting on a patient")).toBeVisible({ timeout: 30_000 });
    const landed = new URL(page.url()).searchParams;
    expect(`${landed.get("section")}/${landed.get("tab")}`).toBe("sessions/recommendations");
    await ctx.close();
  });
});

// ---------------------------------------------------------------------------
// The successful write.
//
// Everything above proves the door is shut to the wrong people; this proves it
// opens for the right one. It needs fixtures nothing else in the suite seeds --
// a recommendable package and a completed session that a named therapist ran --
// which is why it lives in its own describe with its own setup rather than
// leaning on another spec's leftovers.
// ---------------------------------------------------------------------------

const AUTHOR_CATEGORY_TITLE = "QA Author-On-Behalf Condition";
const AUTHOR_PACKAGE_TITLE = "QA Author-On-Behalf Programme";

test.describe("Admin writes a recommendation on a therapist's behalf", () => {
  let admin: SupabaseClient;
  let therapistId = "";
  let patientId = "";
  let adminId = "";
  let categoryId = "";
  let packageId = "";
  let appointmentId = "";

  // Every seeded slot is unique across runs.
  //
  // `appointments_one_therapist_per_slot` is a unique index, so a fixture
  // pinned to a round hour collides with the one an earlier run left behind
  // and the insert fails inside beforeAll -- which then reads as every test
  // in this file failing on state it never created. The minute comes from
  // the clock, so a rerun never lands on the same slot.
  const slotMinute = new Date().getMinutes();
  let slotCursor = 0;

  /** A slot in the past: the source session has to be one already delivered. */
  function pastSlot(daysAgo: number): string {
    const d = new Date();
    d.setDate(d.getDate() - daysAgo);
    slotCursor += 1;
    d.setHours(11 + slotCursor, slotMinute, 0, 0);
    return d.toISOString();
  }

  /**
   * Closes whatever recommendation the QA patient is carrying.
   *
   * `care_plans_one_active_per_patient` allows exactly one live plan, so a
   * plan left behind by an aborted run makes the next write version 2 of a
   * thread this file never opened, and hides the fixture session from the
   * admin panel (which offers only patients with nothing outstanding).
   *
   * It withdraws rather than deletes on purpose: `care_plan_versions` is
   * append-only by trigger, so a delete raises, the plan row's delete then
   * fails on the foreign key, and the "cleanup" silently leaves everything
   * exactly where it was. Withdrawing frees the partial index, which is all
   * this needs.
   */
  async function clearLivePlans() {
    const { error } = await admin
      .from("care_plans")
      .update({ status: "withdrawn" })
      .eq("patient_id", patientId)
      // Both open states: the one-open-plan index covers a queued plan too,
      // so a submission an aborted run left waiting blocks the next write
      // exactly the way a published one does.
      .in("status", ["active", "pending_review"]);
    expect(error, "clearing the QA patient's live plan").toBeNull();
  }

  test.beforeAll(async () => {
    admin = adminClient();
    therapistId = await profileIdFor(admin, QA_EMAILS.therapistA);
    patientId = await profileIdFor(admin, QA_EMAILS.patientB);
    adminId = await profileIdFor(admin, QA_EMAILS.admin);

    // Found or created, never deleted and recreated.
    //
    // A written recommendation points at all three of these -- its source
    // appointment, its package, and through the package its category -- and
    // `care_plan_versions` is append-only, so nothing referenced can be
    // removed afterwards. Deleting in an afterAll therefore fails quietly
    // and the next run collides with its own leftovers. Reusing them makes
    // this file rerunnable against one database, which the suite as a whole
    // is not.
    // Oldest first, so a database carrying more than one row from an
    // earlier run resolves to the same one every time. Which row is picked
    // does not matter; picking a *different* one per lookup does -- the
    // package and the session are matched to this category, and a picker
    // narrowed by category would then offer neither.
    const { data: category } = await admin
      .from("treatment_categories")
      .select("id")
      .eq("title", AUTHOR_CATEGORY_TITLE)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    categoryId =
      category?.id ??
      (
        await admin
          .from("treatment_categories")
          .insert({
            title: AUTHOR_CATEGORY_TITLE,
            points: [],
            price_paise: 130000,
            duration_minutes: 45,
            active: true,
          })
          .select("id")
          .single()
      ).data?.id ??
      "";

    const { data: pkg } = await admin
      .from("treatment_category_packages")
      .select("id")
      .eq("title", AUTHOR_PACKAGE_TITLE)
      .eq("category_id", categoryId)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    packageId =
      pkg?.id ??
      (
        await admin
          .from("treatment_category_packages")
          .insert({
            category_id: categoryId,
            title: AUTHOR_PACKAGE_TITLE,
            session_count: 6,
            price_paise: 600000,
            active: true,
            recommendable: true,
            therapist_locked: true,
          })
          .select("id")
          .single()
      ).data?.id ??
      "";

    // The source session: completed, paid, this therapist's, this patient's.
    const { data: existingAppointment } = await admin
      .from("appointments")
      .select("id")
      .eq("patient_id", patientId)
      .eq("therapist_id", therapistId)
      .eq("concern", AUTHOR_CATEGORY_TITLE)
      .eq("status", "completed")
      .eq("category_id", categoryId)
      .order("slot_time", { ascending: true })
      .limit(1)
      .maybeSingle();
    appointmentId =
      existingAppointment?.id ??
      (
        await admin
          .from("appointments")
          .insert({
            patient_id: patientId,
            therapist_id: therapistId,
            category_id: categoryId,
            concern: AUTHOR_CATEGORY_TITLE,
            slot_time: pastSlot(3),
            duration_minutes: 45,
            status: "completed",
            payment_status: "paid",
            amount_paid_paise: 130000,
            visit_mode: "online",
          })
          .select("id")
          .single()
      ).data?.id ??
      "";

    expect(categoryId, "seeded category").not.toBe("");
    expect(packageId, "seeded package").not.toBe("");
    expect(appointmentId, "seeded completed session").not.toBe("");

    await clearLivePlans();
  });

  // Only the plan is cleaned up. The fixtures stay: they are reused on the
  // next run, and a version that already points at them cannot be unpointed.
  test.afterAll(async () => {
    if (admin) await clearLivePlans();
  });

  test("ACP-008: the write lands, attributed to the clinician and typed by the admin", async () => {
    await clearLivePlans();
    const ctx = await playwrightRequest.newContext({
      extraHTTPHeaders: { cookie: await cookieHeaderFor(QA_EMAILS.admin) },
    });
    const reason = "Dr A is on leave until the 14th and asked us to send this";
    const res = await ctx.post(`${BASE}/api/admin/author-care-plan`, {
      data: {
        patientId,
        appointmentId,
        offerKind: "session_package",
        packageId,
        handsOnRequired: true,
        frequencyPerWeek: 2,
        clinicalRationale: "Your range is improving but the pain returns after a desk day.",
        instructions: "Keep walking between sessions.",
        reason,
      },
    });
    expect(res.status(), await res.text()).toBe(200);
    const created = await res.json();
    expect(created.carePlanId).toBeTruthy();
    expect(created.versionNo).toBe(1);

    const { data: plan } = await admin
      .from("care_plans")
      .select("id, patient_id, therapist_id, status, current_version_id")
      .eq("id", created.carePlanId)
      .single();
    expect(plan?.status).toBe("active");
    expect(plan?.patient_id).toBe(patientId);
    // The plan belongs to the clinician, not to the admin who typed it.
    expect(plan?.therapist_id).toBe(therapistId);
    expect(plan?.current_version_id).toBe(created.versionId);

    const { data: version } = await admin
      .from("care_plan_versions")
      .select(
        "id, authored_by, entered_by, source_appointment_id, session_package_id, offer_snapshot, hands_on_required, frequency_per_week, is_current"
      )
      .eq("id", created.versionId)
      .single();
    // The split attribution is the whole point of the second door: naming
    // only the therapist would be a quiet lie about who was at the keyboard,
    // naming only the admin a louder one about whose judgement it is.
    expect(version?.authored_by).toBe(therapistId);
    expect(version?.entered_by).toBe(adminId);
    expect(version?.source_appointment_id).toBe(appointmentId);
    expect(version?.session_package_id).toBe(packageId);
    expect(version?.hands_on_required).toBe(true);
    expect(version?.frequency_per_week).toBe(2);
    expect(version?.is_current).toBe(true);
    // Price and count come from the catalog row the admin picked, never from
    // anything the request could have carried.
    const snapshot = version?.offer_snapshot as { sessionCount: number; pricePaise: number };
    expect(snapshot.sessionCount).toBe(6);
    expect(snapshot.pricePaise).toBe(600000);

    const { data: audit } = await admin
      .from("admin_activity_log")
      .select("action, actor_id, details")
      .eq("action", "care_plan.author_on_behalf")
      .eq("target_id", created.carePlanId)
      .maybeSingle();
    expect(audit?.actor_id).toBe(adminId);
    expect((audit?.details as { reason?: string })?.reason).toBe(reason);

    await ctx.dispose();
  });

  test("ACP-009: it is refused for a session that therapist did not run", async () => {
    await clearLivePlans();
    const otherTherapist = await profileIdFor(admin, QA_EMAILS.therapistB);
    const { data: foreign } = await admin
      .from("appointments")
      .insert({
        patient_id: patientId,
        therapist_id: otherTherapist,
        category_id: categoryId,
        concern: AUTHOR_CATEGORY_TITLE,
        slot_time: pastSlot(4),
        duration_minutes: 45,
        // Booked, never delivered. A recommendation is written off the back
        // of a session that happened.
        status: "confirmed",
        payment_status: "paid",
        visit_mode: "online",
      })
      .select("id")
      .single();

    const ctx = await playwrightRequest.newContext({
      extraHTTPHeaders: { cookie: await cookieHeaderFor(QA_EMAILS.admin) },
    });
    const res = await ctx.post(`${BASE}/api/admin/author-care-plan`, {
      data: {
        patientId,
        appointmentId: foreign?.id,
        offerKind: "session_package",
        packageId,
        reason: "trying it against a session nobody has delivered yet",
      },
    });
    expect(res.status()).toBe(409);
    expect(await res.text()).toContain("marked complete");
    await ctx.dispose();
    if (foreign?.id) await admin.from("appointments").delete().eq("id", foreign.id);
  });

  test("ACP-010: the patient sees it as their therapist's recommendation", async ({
    browser,
  }) => {
    await clearLivePlans();
    const ctx = await playwrightRequest.newContext({
      extraHTTPHeaders: { cookie: await cookieHeaderFor(QA_EMAILS.admin) },
    });
    const res = await ctx.post(`${BASE}/api/admin/author-care-plan`, {
      data: {
        patientId,
        appointmentId,
        offerKind: "session_package",
        packageId,
        clinicalRationale: "A structured block will hold the gains you have made.",
        reason: "Dr A is off sick and asked us to send this on",
      },
    });
    expect(res.status(), await res.text()).toBe(200);
    await ctx.dispose();

    const browserCtx = await browser.newContext();
    await browserCtx.addCookies(await browserCookiesFor(QA_EMAILS.patientB));
    const page = await browserCtx.newPage();
    await page.goto(`${BASE}/patient/dashboard/suggested`);
    // Named as the clinician's, with no trace of the admin who typed it --
    // who was at the keyboard is an audit fact, not something to tell a
    // patient about their own care.
    await expect(page.getByText("Recommended by QA Therapist A")).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByText(AUTHOR_PACKAGE_TITLE).first()).toBeVisible();
    await expect(page.getByText("QA Admin", { exact: false })).toHaveCount(0);
    await browserCtx.close();
  });

  test("ACP-011: the admin panel offers that session and states whose name it goes out in", async ({
    browser,
  }) => {
    await clearLivePlans();
    const ctx = await browser.newContext();
    await ctx.addCookies(await browserCookiesFor(QA_EMAILS.admin));
    const page = await ctx.newPage();
    await page.goto(`${BASE}/admin/dashboard?section=sessions&tab=recommendations`);

    const picker = page.getByLabel("Which session does this follow?");
    await expect(picker).toBeVisible({ timeout: 30_000 });
    await expect(picker).toContainText("QA Patient B with QA Therapist A");
    await picker.selectOption(appointmentId);
    await expect(picker).toHaveValue(appointmentId);

    await page.getByRole("button", { name: "Add a recommendation" }).click();
    // The picker asks for a condition and a number of sessions, never a
    // programme by name -- so what is asserted is that the seeded
    // condition is on offer and that a session-count chip carrying the
    // seeded package's price appears once it is chosen.
    const condition = page.getByLabel("Condition", { exact: true });
    await expect(condition).toContainText(AUTHOR_CATEGORY_TITLE);
    await expect(
      page.getByRole("button", { name: /6 sessions/ }).first()
    ).toBeVisible();

    // Attribution stated at the button, not two screens up.
    await expect(
      page.getByText("sees this as QA Therapist A's recommendation")
    ).toBeVisible();

    // The reason gate holds in the browser as well as in the route.
    const send = page.getByRole("button", { name: /^Send it to/ });
    await expect(send).toBeDisabled();
    await page.getByLabel("Why is the clinic writing this instead of the therapist?").fill(
      "Dr A is on leave and asked us to send this"
    );
    await expect(send).toBeEnabled();
    await ctx.close();
  });

  test("ACP-012: sending it from the panel works, and leaves the panel usable", async ({
    browser,
  }) => {
    await clearLivePlans();
    const ctx = await browser.newContext();
    await ctx.addCookies(await browserCookiesFor(QA_EMAILS.admin));
    const page = await ctx.newPage();
    await page.goto(`${BASE}/admin/dashboard?section=sessions&tab=recommendations`);

    const picker = page.getByLabel("Which session does this follow?");
    await expect(picker).toBeVisible({ timeout: 30_000 });
    await picker.selectOption(appointmentId);
    // The programmes on offer are narrowed by the selected session, so the
    // click below must not race the state update behind it -- otherwise the
    // panel is still offering the previous session's category and this reads
    // as a missing package.
    await expect(picker).toHaveValue(appointmentId);
    await page.getByRole("button", { name: "Add a recommendation" }).click();
    // Condition first, then how many. The panel seeds itself with the first
    // programme for that condition, so the chip click is what pins it to the
    // seeded six-session one rather than whatever happened to be first.
    await page.getByLabel("Condition", { exact: true }).selectOption(categoryId);
    await page.getByRole("button", { name: /6 sessions/ }).first().click();
    await page
      .getByLabel("Why is the clinic writing this instead of the therapist?")
      .fill("Dr A is off sick and asked us to send this on");
    await page.getByRole("button", { name: /^Send it to/ }).click();

    await expect(
      page.getByText("Sent to QA Patient B, in QA Therapist A's name.")
    ).toBeVisible({ timeout: 30_000 });

    const { data: plan } = await admin
      .from("care_plans")
      .select("id, therapist_id, status, current_version_id")
      .eq("patient_id", patientId)
      .eq("status", "active")
      .maybeSingle();
    expect(plan?.therapist_id).toBe(therapistId);
    const { data: version } = await admin
      .from("care_plan_versions")
      .select("authored_by, entered_by")
      .eq("id", plan?.current_version_id ?? "")
      .maybeSingle();
    expect(version?.authored_by).toBe(therapistId);
    expect(version?.entered_by).toBe(adminId);

    // The write refreshes the page and drops this patient off the list, so
    // the id held in state names a session that is gone. The picker must
    // still be showing a real one rather than a blank the next submit would
    // reject -- or, if that was the only session left, say so.
    const stillHasSessions = await picker.isVisible();
    if (stillHasSessions) {
      expect(await picker.inputValue()).not.toBe("");
    } else {
      await expect(page.getByText("No session to write against")).toBeVisible();
    }
    await ctx.close();
  });
});

// ---------------------------------------------------------------------------
// The review step.
//
// A therapist's recommendation now lands in the clinic's queue rather than
// on the patient's dashboard. What matters is the gap between those two: a
// queued plan must be invisible and unbuyable until an admin decides, and
// the decision has to be traceable to a person. These tests walk one
// recommendation through the whole of that.
// ---------------------------------------------------------------------------

const REVIEW_CATEGORY_TITLE = "QA Review Condition";
const REVIEW_PACKAGE_TITLE = "QA Review Programme";

test.describe("The clinic approves a recommendation", () => {
  let admin: SupabaseClient;
  let therapistId = "";
  let patientId = "";
  let categoryId = "";
  let packageId = "";
  let appointmentId = "";

  const slotMinute = new Date().getMinutes();
  let slotCursor = 0;

  function pastSlot(daysAgo: number): string {
    const d = new Date();
    d.setDate(d.getDate() - daysAgo);
    slotCursor += 1;
    d.setHours(8 + slotCursor, slotMinute, 0, 0);
    return d.toISOString();
  }

  /** Frees the one-open-plan slot. Withdraws rather than deletes, because
   *  `care_plan_versions` is append-only and a delete raises. */
  async function clearOpenPlans() {
    await admin
      .from("care_plans")
      .update({ status: "withdrawn" })
      .eq("patient_id", patientId)
      .in("status", ["active", "pending_review"]);
  }

  /** The therapist's own door. Returns the plan id it opened. */
  async function submitAsTherapist(): Promise<string> {
    const ctx = await playwrightRequest.newContext({
      extraHTTPHeaders: { cookie: await cookieHeaderFor(QA_EMAILS.therapistA) },
    });
    const res = await ctx.post(`${BASE}/api/therapist/care-plan/submit`, {
      data: {
        patientId,
        appointmentId,
        offerKind: "session_package",
        packageId,
        handsOnRequired: false,
        frequencyPerWeek: 2,
        clinicalRationale: "Your range is better but the pain returns after a desk day.",
        instructions: "Keep the daily mobility drill going between sessions.",
      },
    });
    expect(res.status(), await res.text()).toBe(200);
    const body = await res.json();
    await ctx.dispose();
    return body.carePlanId as string;
  }

  test.beforeAll(async () => {
    admin = adminClient();
    therapistId = await profileIdFor(admin, QA_EMAILS.therapistA);
    patientId = await profileIdFor(admin, QA_EMAILS.patientB);

    // Approval on, explicitly. The default is on, but a previous run or a
    // hand-flipped setting would otherwise make every test here fail on a
    // feature that works.
    await admin
      .from("site_settings")
      .update({ care_plan_requires_approval: true })
      .not("id", "is", null);

    // Found-or-created, never deleted: an append-only version pointing at
    // any of these makes it undeletable, so a cleanup would fail quietly
    // and the next run would collide with its own leftovers.
    const { data: category } = await admin
      .from("treatment_categories")
      .select("id")
      .eq("title", REVIEW_CATEGORY_TITLE)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    categoryId =
      category?.id ??
      (
        await admin
          .from("treatment_categories")
          .insert({
            title: REVIEW_CATEGORY_TITLE,
            points: [],
            price_paise: 140000,
            duration_minutes: 45,
            active: true,
          })
          .select("id")
          .single()
      ).data?.id ??
      "";

    const { data: pkg } = await admin
      .from("treatment_category_packages")
      .select("id")
      .eq("title", REVIEW_PACKAGE_TITLE)
      .eq("category_id", categoryId)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    packageId =
      pkg?.id ??
      (
        await admin
          .from("treatment_category_packages")
          .insert({
            category_id: categoryId,
            title: REVIEW_PACKAGE_TITLE,
            session_count: 8,
            price_paise: 900000,
            active: true,
            recommendable: true,
            therapist_locked: true,
          })
          .select("id")
          .single()
      ).data?.id ??
      "";

    const { data: existing } = await admin
      .from("appointments")
      .select("id")
      .eq("patient_id", patientId)
      .eq("therapist_id", therapistId)
      .eq("concern", REVIEW_CATEGORY_TITLE)
      .eq("status", "completed")
      .eq("category_id", categoryId)
      .order("slot_time", { ascending: true })
      .limit(1)
      .maybeSingle();
    appointmentId =
      existing?.id ??
      (
        await admin
          .from("appointments")
          .insert({
            patient_id: patientId,
            therapist_id: therapistId,
            category_id: categoryId,
            concern: REVIEW_CATEGORY_TITLE,
            slot_time: pastSlot(5),
            duration_minutes: 45,
            status: "completed",
            payment_status: "paid",
            amount_paid_paise: 140000,
            visit_mode: "online",
          })
          .select("id")
          .single()
      ).data?.id ??
      "";

    expect(categoryId, "seeded category").not.toBe("");
    expect(packageId, "seeded package").not.toBe("");
    expect(appointmentId, "seeded completed session").not.toBe("");

    await clearOpenPlans();
  });

  test.afterAll(async () => {
    if (admin) await clearOpenPlans();
  });

  test("ACP-013: a therapist's submission lands in the queue, not on the patient", async () => {
    await clearOpenPlans();
    const planId = await submitAsTherapist();

    const { data: plan } = await admin
      .from("care_plans")
      .select("status, submitted_at, reviewed_at, current_version_id")
      .eq("id", planId)
      .single();
    expect(plan?.status).toBe("pending_review");
    expect(plan?.submitted_at, "submitted_at is stamped").not.toBeNull();
    expect(plan?.reviewed_at, "nobody has decided yet").toBeNull();

    // The offer window is stamped at approval, not at authoring -- a plan
    // that waits two days in the queue must not reach the patient with two
    // days already gone.
    const { data: version } = await admin
      .from("care_plan_versions")
      .select("expires_at")
      .eq("id", plan?.current_version_id ?? "")
      .single();
    expect(version?.expires_at, "no window until it is published").toBeNull();
  });

  test("ACP-014: a queued recommendation cannot be bought", async () => {
    await clearOpenPlans();
    const planId = await submitAsTherapist();
    const { data: plan } = await admin
      .from("care_plans")
      .select("current_version_id")
      .eq("id", planId)
      .single();

    // Straight at the API with the patient's own session, around any UI
    // that is simply not rendering the card. This is the assertion that
    // matters: hiding it is presentation, refusing it is the rule.
    const ctx = await playwrightRequest.newContext({
      extraHTTPHeaders: { cookie: await cookieHeaderFor(QA_EMAILS.patientB) },
    });
    const res = await ctx.post(`${BASE}/api/care-plan/create-order`, {
      data: { carePlanVersionId: plan?.current_version_id },
    });
    expect(res.status(), await res.text()).toBe(409);
    await ctx.dispose();
  });

  test("ACP-015: a reason is asked for where it is owed, and nowhere else", async () => {
    await clearOpenPlans();
    const planId = await submitAsTherapist();
    const ctx = await playwrightRequest.newContext({
      extraHTTPHeaders: { cookie: await cookieHeaderFor(QA_EMAILS.admin) },
    });

    // A rejection is acted on by the therapist, so it owes them a reason.
    const shortReject = await ctx.post(`${BASE}/api/admin/review-care-plan`, {
      data: { carePlanId: planId, decision: "rejected", reason: "ok" },
    });
    expect(shortReject.status()).toBe(400);

    const unknown = await ctx.post(`${BASE}/api/admin/review-care-plan`, {
      data: { carePlanId: planId, decision: "maybe", reason: "a long enough reason" },
    });
    expect(unknown.status()).toBe(400);

    // Still queued after both refusals.
    const { data: plan } = await admin
      .from("care_plans")
      .select("status")
      .eq("id", planId)
      .single();
    expect(plan?.status).toBe("pending_review");

    // Saying plain yes needs nothing typed. This is the path the queue
    // exists to let through, and taxing it is how a reason column fills up
    // with "ok" and stops being worth reading.
    const bareApproval = await ctx.post(`${BASE}/api/admin/review-care-plan`, {
      data: { carePlanId: planId, decision: "approved" },
    });
    expect(bareApproval.status(), await bareApproval.text()).toBe(200);
    await ctx.dispose();
  });

  test("ACP-021: an offer the catalogue no longer supports is not published", async () => {
    // Checkout re-reads the package and refuses on a mismatch, which is
    // right -- but approving a stale recommendation would mean the patient
    // discovers the clinic's stale data by having their payment refused.
    // The admin is the one who can fix it, and they are the one looking.
    await clearOpenPlans();
    const planId = await submitAsTherapist();

    const { data: before } = await admin
      .from("treatment_category_packages")
      .select("price_paise")
      .eq("id", packageId)
      .single();

    await admin
      .from("treatment_category_packages")
      .update({ price_paise: (before?.price_paise ?? 900000) + 50000 })
      .eq("id", packageId);

    const ctx = await playwrightRequest.newContext({
      extraHTTPHeaders: { cookie: await cookieHeaderFor(QA_EMAILS.admin) },
    });
    const res = await ctx.post(`${BASE}/api/admin/review-care-plan`, {
      data: { carePlanId: planId, decision: "approved" },
    });
    expect(res.status(), await res.text()).toBe(409);
    expect(await res.text()).toContain("charge another");

    // Refused, not half-applied: still queued, and still nobody's decision.
    const { data: plan } = await admin
      .from("care_plans")
      .select("status, reviewed_by")
      .eq("id", planId)
      .single();
    expect(plan?.status).toBe("pending_review");
    expect(plan?.reviewed_by).toBeNull();

    // Turning it down is still allowed -- refusing to let an admin close a
    // thread because its package moved would trap exactly the one that
    // most needs closing.
    const rejected = await ctx.post(`${BASE}/api/admin/review-care-plan`, {
      data: {
        carePlanId: planId,
        decision: "rejected",
        reason: "The programme has been re-priced since this was written.",
      },
    });
    expect(rejected.status(), await rejected.text()).toBe(200);

    await admin
      .from("treatment_category_packages")
      .update({ price_paise: before?.price_paise ?? 900000 })
      .eq("id", packageId);
    await ctx.dispose();
  });

  test("ACP-016: approving publishes it, stamps its window and records who decided", async () => {
    await clearOpenPlans();
    const planId = await submitAsTherapist();
    const ctx = await playwrightRequest.newContext({
      extraHTTPHeaders: { cookie: await cookieHeaderFor(QA_EMAILS.admin) },
    });
    const reason = "Matches the assessment findings and what the patient asked for";
    const res = await ctx.post(`${BASE}/api/admin/review-care-plan`, {
      data: { carePlanId: planId, decision: "approved", reason },
    });
    expect(res.status(), await res.text()).toBe(200);

    const { data: plan } = await admin
      .from("care_plans")
      .select("status, reviewed_by, reviewed_at, current_version_id")
      .eq("id", planId)
      .single();
    expect(plan?.status).toBe("active");
    expect(plan?.reviewed_by, "the decision names a person").not.toBeNull();
    expect(plan?.reviewed_at).not.toBeNull();

    const { data: version } = await admin
      .from("care_plan_versions")
      .select("expires_at")
      .eq("id", plan?.current_version_id ?? "")
      .single();
    expect(version?.expires_at, "the window starts at approval").not.toBeNull();

    const { data: review } = await admin
      .from("care_plan_reviews")
      .select("decision, reason")
      .eq("care_plan_id", planId)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();
    expect(review?.decision).toBe("approved");
    expect(review?.reason).toBe(reason);

    // Deciding twice is refused rather than silently applied again.
    const again = await ctx.post(`${BASE}/api/admin/review-care-plan`, {
      data: { carePlanId: planId, decision: "rejected", reason: "changed my mind entirely" },
    });
    expect(again.status()).toBe(409);
    await ctx.dispose();
  });

  test("ACP-017: turning one down closes the thread and keeps the reason", async () => {
    await clearOpenPlans();
    const planId = await submitAsTherapist();
    const ctx = await playwrightRequest.newContext({
      extraHTTPHeaders: { cookie: await cookieHeaderFor(QA_EMAILS.admin) },
    });
    const reason = "This patient still has four unused sessions on their current plan";
    const res = await ctx.post(`${BASE}/api/admin/review-care-plan`, {
      data: { carePlanId: planId, decision: "rejected", reason },
    });
    expect(res.status(), await res.text()).toBe(200);

    const { data: plan } = await admin
      .from("care_plans")
      .select("status")
      .eq("id", planId)
      .single();
    expect(plan?.status).toBe("rejected");

    const { data: review } = await admin
      .from("care_plan_reviews")
      .select("decision, reason")
      .eq("care_plan_id", planId)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();
    expect(review?.decision).toBe("rejected");
    expect(review?.reason).toBe(reason);

    // A rejected thread frees the slot, so the therapist can rewrite.
    const nextPlanId = await submitAsTherapist();
    expect(nextPlanId).not.toBe(planId);
    await ctx.dispose();
  });

  test("ACP-018: approving with changes writes a new version, not an edit", async () => {
    await clearOpenPlans();
    const planId = await submitAsTherapist();
    const { data: before } = await admin
      .from("care_plan_versions")
      .select("id, version_no")
      .eq("care_plan_id", planId)
      .order("version_no", { ascending: false })
      .limit(1)
      .single();

    const ctx = await playwrightRequest.newContext({
      extraHTTPHeaders: { cookie: await cookieHeaderFor(QA_EMAILS.admin) },
    });
    const res = await ctx.post(`${BASE}/api/admin/edit-and-approve-care-plan`, {
      data: {
        carePlanId: planId,
        offerKind: "session_package",
        packageId,
        handsOnRequired: true,
        frequencyPerWeek: 1,
        clinicalRationale: "Approved at a lower weekly frequency to suit the patient.",
        instructions: "Same home programme, one session a week.",
        reason: "Frequency reduced to match what this patient can attend",
      },
    });
    expect(res.status(), await res.text()).toBe(200);

    const { data: versions } = await admin
      .from("care_plan_versions")
      .select("id, version_no, authored_by, entered_by, is_current")
      .eq("care_plan_id", planId)
      .order("version_no", { ascending: true });

    // The therapist's original is still there, untouched, and superseded.
    const original = (versions ?? []).find((v) => v.id === before?.id);
    expect(original, "the original version survives").toBeTruthy();
    expect(original?.is_current).toBe(false);

    // The new one is the clinician's judgement, typed by the admin.
    const current = (versions ?? []).find((v) => v.is_current);
    expect(current?.version_no).toBe((before?.version_no ?? 0) + 1);
    expect(current?.authored_by, "still the clinician's recommendation").toBe(therapistId);
    expect(current?.entered_by, "recorded as typed by the admin").not.toBeNull();

    const { data: plan } = await admin
      .from("care_plans")
      .select("status")
      .eq("id", planId)
      .single();
    expect(plan?.status).toBe("active");

    const { data: review } = await admin
      .from("care_plan_reviews")
      .select("decision")
      .eq("care_plan_id", planId)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();
    expect(review?.decision).toBe("edited_and_approved");
    await ctx.dispose();
  });

  test("ACP-019: the review routes refuse everyone but an admin", async ({ request }) => {
    for (const path of [
      "/api/admin/review-care-plan",
      "/api/admin/edit-and-approve-care-plan",
    ]) {
      const anon = await request.post(`${BASE}${path}`, {
        headers: { "content-type": "application/json" },
        data: { carePlanId: FAKE_ID, decision: "approved", reason: "a long enough reason" },
      });
      expect(anon.status(), `${path} anonymous`).toBe(403);

      for (const who of [QA_EMAILS.patientA, QA_EMAILS.therapistA]) {
        const res = await request.post(`${BASE}${path}`, {
          headers: { cookie: await cookieHeaderFor(who), "content-type": "application/json" },
          data: { carePlanId: FAKE_ID, decision: "approved", reason: "a long enough reason" },
        });
        expect(res.status(), `${path} for ${who}`).toBe(403);
      }
    }
  });

  test("ACP-020: the queue renders on the Recommendations screen", async ({ browser }) => {
    await clearOpenPlans();
    await submitAsTherapist();

    const ctx = await browser.newContext();
    await ctx.addCookies(await browserCookiesFor(QA_EMAILS.admin));
    const page = await ctx.newPage();
    await page.goto(`${BASE}/admin/dashboard?section=sessions&tab=recommendations`);
    await expect(page.getByText("Waiting for your decision")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("button", { name: "Approve", exact: true }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /Turn it down/i }).first()).toBeVisible();
    // The card is aged, not dated: an admin has to be able to tell nine
    // minutes from nine hours, because a patient is on the other side of it.
    await expect(page.getByText(/^Waiting /).first()).toBeVisible();
    await ctx.close();
  });
});
