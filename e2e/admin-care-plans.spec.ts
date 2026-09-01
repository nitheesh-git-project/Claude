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
      .eq("status", "active");
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

    await page.getByRole("button", { name: "Add a recommendation" }).click();
    // Narrowed to the session's own condition: the package seeded for another
    // category must not be on offer here.
    const programme = page.getByLabel("Programme", { exact: true });
    await expect(programme).toContainText(AUTHOR_PACKAGE_TITLE);

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
    await page.getByRole("button", { name: "Add a recommendation" }).click();
    await page.getByLabel("Programme", { exact: true }).selectOption(packageId);
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
