// Catalog -> Conditions -> Home visits: one clinic-wide home-visit price, and
// any condition may set its own. One visit each -- no count, no validity, no
// days. The old Packages screen (Session Packages + Home Visit Packages) is
// gone; a stale ?tab=packages link lands on Conditions.
//
// What is asserted is the whole chain an owner relies on: the admin row says
// which price a condition uses, a change lands as exactly one active price
// row, the booking wizard quotes the new figure, and a hands-on
// recommendation is written at it. The money rule itself (own price, else
// clinic-wide, never another condition's) is unit-tested in
// src/lib/homeVisitRates.test.ts.
//
// Writes only rows it removes again: a condition seeded here and deleted in
// afterAll (its price rows go with it), and the clinic-wide price, which is
// put back to what it was. HVP-005 writes append-only care-plan versions, so
// it runs on a disposable project only, the same opt-in recommendation-course
// uses.
import { test, expect, request, type APIRequestContext } from "@playwright/test";
import {
  BASE,
  QA_EMAILS,
  adminClient,
  browserCookiesFor,
  cookieHeaderFor,
  markDashboardTourSeen,
  pageUntilVisible,
  profileIdFor,
} from "./helpers";

const db = adminClient();
const TITLE = `QA Home Visit Price ${Date.now()}`;
const PRICE_ROUTE = `${BASE}/api/admin/set-home-visit-price`;

let categoryId = "";
let clinicWide: { id: string; price_paise: number; visit_duration_minutes: number } | null = null;
let adminApi: APIRequestContext;

function inr(paise: number) {
  return `₹${(paise / 100).toLocaleString("en-IN")}`;
}

async function activeOwnRows(id: string) {
  const { data } = await db
    .from("home_visit_packages")
    .select("id, price_paise, visit_count, validity_days, active")
    .eq("category_id", id)
    .eq("visit_count", 1)
    .eq("care_plan_course", false)
    .eq("active", true);
  return data ?? [];
}

test.describe("Catalog -> Conditions -> Home visits", () => {
  test.beforeAll(async () => {
    const { data: category, error } = await db
      .from("treatment_categories")
      .insert({
        title: TITLE,
        description: "A condition seeded by the home-visit price spec.",
        points: ["Price point"],
        price_paise: 99900,
        duration_minutes: 45,
        active: true,
      })
      .select("id")
      .single();
    expect(error, error?.message).toBeNull();
    categoryId = category!.id;

    const { data: clinic } = await db
      .from("home_visit_packages")
      .select("id, price_paise, visit_duration_minutes")
      .eq("active", true)
      .eq("visit_count", 1)
      .eq("care_plan_course", false)
      .is("category_id", null)
      .maybeSingle();
    clinicWide = clinic ?? null;
    adminApi = await request.newContext({
      extraHTTPHeaders: { Cookie: await cookieHeaderFor(QA_EMAILS.admin) },
    });
  });

  test.afterAll(async () => {
    // The clinic-wide price back to what it was, then the fixture and every
    // price row it grew. Nothing bought one, so nothing holds them.
    if (clinicWide) {
      await db
        .from("home_visit_packages")
        .update({
          price_paise: clinicWide.price_paise,
          visit_duration_minutes: clinicWide.visit_duration_minutes,
        })
        .eq("id", clinicWide.id);
    }
    if (categoryId) {
      await db.from("home_visit_packages").delete().eq("category_id", categoryId);
      await db.from("treatment_categories").delete().eq("id", categoryId);
    }
    await adminApi?.dispose();
  });

  test("HVP-001: Conditions is the one catalogue screen, with Online sessions then Home visits", async ({
    browser,
  }) => {
    test.setTimeout(90_000);
    const context = await browser.newContext();
    await context.addCookies(await browserCookiesFor(QA_EMAILS.admin));
    const page = await context.newPage();
    try {
      // A stale link to the removed Packages screen falls back to Conditions.
      await page.goto(`${BASE}/admin/dashboard?section=catalog&tab=packages`);
      await expect(
        // .first(): the shell's own screen title can read "Conditions" too.
        page.getByRole("heading", { name: "Conditions", exact: true }).filter({ visible: true }).first()
      ).toBeVisible({ timeout: 60_000 });
      const online = page
        .getByRole("heading", { name: "Online sessions", exact: true })
        .filter({ visible: true })
        .first();
      const home = page
        .getByRole("heading", { name: "Home visits", exact: true })
        .filter({ visible: true })
        .first();
      await expect(online).toBeVisible();
      await expect(home).toBeVisible();
      expect((await online.boundingBox())!.y).toBeLessThan((await home.boundingBox())!.y);

      // Neither old editor is anywhere on the page, visible or hidden.
      await expect(page.getByRole("heading", { name: "Session Packages" })).toHaveCount(0);
      await expect(page.getByRole("heading", { name: "Home Visit Packages" })).toHaveCount(0);
      await expect(page.getByRole("button", { name: /Add Package/i })).toHaveCount(0);

      await expect(page.getByTestId("home-visit-clinic-wide").filter({ visible: true })).toBeVisible();
      await expect(page.getByText(/Travel is added per visit from/).filter({ visible: true })).toBeVisible();
    } finally {
      await context.close();
    }
  });

  test("HVP-002: set own price, then use clinic-wide -- the row, the rows and the wizard all follow", async ({
    browser,
  }) => {
    test.setTimeout(120_000);
    test.skip(!clinicWide, "no clinic-wide home-visit price in this project");
    const OWN = 123400;
    const cleanup: (() => Promise<void>)[] = [];
    const context = await browser.newContext();
    await context.addCookies(await browserCookiesFor(QA_EMAILS.admin));
    const page = await context.newPage();
    try {
      await page.goto(`${BASE}/admin/dashboard?section=catalog&tab=conditions`);
      const row = page
        .getByTestId("home-visit-price-line")
        .filter({ hasText: TITLE })
        .filter({ visible: true });
      expect(await pageUntilVisible(page, "conditions", row, { timeout: 60_000 })).toBe(true);
      await expect(row).toContainText(`Clinic-wide (${inr(clinicWide!.price_paise)})`);

      // Set own price.
      await row.getByRole("button", { name: `Set an own home-visit price for ${TITLE}` }).click();
      await row.getByLabel(`Own price for ${TITLE} (₹)`).fill(String(OWN / 100));
      await row.getByRole("button", { name: "Save" }).click();
      await expect(row).toContainText(inr(OWN), { timeout: 30_000 });
      await expect(row).toContainText(/own price/i);

      const own = await activeOwnRows(categoryId);
      expect(own).toHaveLength(1);
      expect(own[0]).toMatchObject({ price_paise: OWN, visit_count: 1, validity_days: null });

      // The wizard quotes it -- a dynamic page, so no cache stands between.
      // Its own signed-out context: under the admin's cookies the wizard
      // answers "this account can't book" instead of showing the visit.
      const guest = await browser.newContext();
      cleanup.push(() => guest.close());
      const wizard = await guest.newPage();
      await wizard.goto(`${BASE}/book-home-visit?category=${categoryId}`);
      await expect(wizard.getByRole("heading", { name: TITLE })).toBeVisible();
      await expect(wizard.getByText(inr(OWN)).first()).toBeVisible();

      // Use clinic-wide.
      await row.getByRole("button", { name: `Use the clinic-wide home-visit price for ${TITLE}` }).click();
      await expect(row).toContainText(`Clinic-wide (${inr(clinicWide!.price_paise)})`, { timeout: 30_000 });
      expect(await activeOwnRows(categoryId)).toHaveLength(0);

      await wizard.reload();
      await expect(wizard.getByRole("heading", { name: TITLE })).toBeVisible();
      await expect(wizard.getByText(inr(clinicWide!.price_paise)).first()).toBeVisible();
      await expect(wizard.getByText(inr(OWN))).toHaveCount(0);
    } finally {
      for (const close of cleanup) await close();
      await context.close();
    }
  });

  test("HVP-003: the route re-checks everything it is sent, and only an admin may call it", async () => {
    test.setTimeout(90_000);
    for (const data of [
      { categoryId, pricePaise: 0 },
      { categoryId, pricePaise: 12.5 },
      { categoryId, pricePaise: -100 },
      { categoryId: null, useClinicWide: true },
      { categoryId: null, pricePaise: 150000, durationMinutes: 5 },
    ]) {
      const res = await adminApi.post(PRICE_ROUTE, { data });
      expect(res.status(), JSON.stringify(data)).toBe(400);
      expect((await res.json()).error).toEqual(expect.any(String));
    }
    const malformed = await adminApi.post(PRICE_ROUTE, {
      headers: { "content-type": "application/json" },
      data: "{not json",
    });
    expect(malformed.status()).toBe(400);

    const missing = await adminApi.post(PRICE_ROUTE, {
      data: { categoryId: "00000000-0000-4000-8000-000000000000", pricePaise: 100000 },
    });
    expect(missing.status()).toBe(404);

    const patient = await request.newContext({
      extraHTTPHeaders: { Cookie: await cookieHeaderFor(QA_EMAILS.patientA) },
    });
    try {
      const refused = await patient.post(PRICE_ROUTE, { data: { categoryId, pricePaise: 100 } });
      expect(refused.status()).toBe(403);
    } finally {
      await patient.dispose();
    }
    expect(await activeOwnRows(categoryId)).toHaveLength(0);

    // The clinic-wide price and its visit length move together, and are put
    // back in afterAll.
    test.skip(!clinicWide, "no clinic-wide home-visit price in this project");
    const moved = await adminApi.post(PRICE_ROUTE, {
      data: { categoryId: null, pricePaise: clinicWide!.price_paise + 10000, durationMinutes: 50 },
    });
    expect(moved.status(), await moved.text()).toBe(200);
    const { data: after } = await db
      .from("home_visit_packages")
      .select("price_paise, visit_duration_minutes, active")
      .eq("id", clinicWide!.id)
      .single();
    expect(after).toMatchObject({
      price_paise: clinicWide!.price_paise + 10000,
      visit_duration_minutes: 50,
      active: true,
    });
    const restored = await adminApi.post(PRICE_ROUTE, {
      data: {
        categoryId: null,
        pricePaise: clinicWide!.price_paise,
        durationMinutes: clinicWide!.visit_duration_minutes,
      },
    });
    expect(restored.status()).toBe(200);
  });

  test("HVP-004: two admins setting one condition's price at once leave exactly one price", async () => {
    // Either order is fine: overlapping, the unique index refuses the second
    // insert (409 with a sentence); serialised, the second edits the first's
    // row in place (200). What must never happen is two active prices.
    const [a, b] = await Promise.all([
      adminApi.post(PRICE_ROUTE, { data: { categoryId, pricePaise: 111100 } }),
      adminApi.post(PRICE_ROUTE, { data: { categoryId, pricePaise: 122200 } }),
    ]);
    const statuses = [a.status(), b.status()].sort();
    expect([[200, 200], [200, 409]]).toContainEqual(statuses);
    if (statuses[1] === 409) {
      const loser = a.status() === 409 ? a : b;
      expect((await loser.json()).error).toMatch(/at the same moment/);
    }
    expect(await activeOwnRows(categoryId)).toHaveLength(1);

    const back = await adminApi.post(PRICE_ROUTE, { data: { categoryId, useClinicWide: true } });
    expect(back.status()).toBe(200);
    expect(await activeOwnRows(categoryId)).toHaveLength(0);
  });
});

test.describe("A hands-on recommendation is priced at the condition's home-visit price", () => {
  test.skip(
    process.env.E2E_ALLOW_APPEND_ONLY_WRITES !== "1" && process.env.CI_LOCAL_STACK !== "1",
    "writes append-only care-plan rows; set E2E_ALLOW_APPEND_ONLY_WRITES=1 on a disposable project"
  );

  // Found or made, and never deleted: append-only care-plan versions go on
  // pointing at it. Switched off again in afterAll so it leaves no card on
  // the public pages.
  const CONDITION = "QA Home Visit Rate Condition";
  const MARKER = "E2E catalog-home-visit-prices";
  let conditionId = "";
  let patientId = "";
  let appointmentId = "";
  let therapist: APIRequestContext;
  let adminCtx: APIRequestContext;

  async function clearOpenPlans() {
    await db
      .from("care_plans")
      .update({ status: "withdrawn" })
      .eq("patient_id", patientId)
      .in("status", ["active", "pending_review"]);
  }

  async function handsOnSnapshotPrice(): Promise<number> {
    await clearOpenPlans();
    const res = await therapist.post(`${BASE}/api/therapist/care-plan/submit`, {
      data: {
        patientId,
        appointmentId,
        categoryId: conditionId,
        sessionCount: 2,
        handsOnRequired: true,
        frequencyPerWeek: 1,
        clinicalRationale: MARKER,
        instructions: "",
      },
    });
    expect(res.status(), await res.text()).toBe(200);
    const { versionId } = await res.json();
    const { data: version } = await db
      .from("care_plan_versions")
      .select("offer_kind, offer_snapshot")
      .eq("id", versionId)
      .single();
    expect(version?.offer_kind).toBe("home_visit_package");
    return (version!.offer_snapshot as { perSessionPaise: number }).perSessionPaise;
  }

  test.beforeAll(async () => {
    patientId = await profileIdFor(db, QA_EMAILS.patientB);
    const therapistId = await profileIdFor(db, QA_EMAILS.therapistA);
    await markDashboardTourSeen(QA_EMAILS.patientB);

    const { data: existing } = await db
      .from("treatment_categories")
      .select("id")
      .eq("title", CONDITION)
      .maybeSingle();
    if (existing) {
      conditionId = existing.id;
      await db.from("treatment_categories").update({ active: true }).eq("id", conditionId);
    } else {
      const { data: created, error } = await db
        .from("treatment_categories")
        .insert({
          title: CONDITION,
          description: "A condition seeded by the home-visit price spec.",
          points: ["Hands-on"],
          price_paise: 70000,
          duration_minutes: 60,
          active: true,
        })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      conditionId = created.id;
    }

    const { data: done } = await db
      .from("appointments")
      .select("id")
      .eq("concern", MARKER)
      .eq("status", "completed")
      .limit(1)
      .maybeSingle();
    if (done) {
      appointmentId = done.id;
    } else {
      // Other specs park completed sessions for the same therapist in the
      // past too, so walk back until an hour is free rather than assuming
      // a fixed one is (appointments_one_therapist_per_slot).
      let lastError = "";
      for (let attempt = 0; attempt < 40 && !appointmentId; attempt++) {
        const slot = new Date(Date.now() - (8 + Math.floor(attempt / 8)) * 86_400_000);
        slot.setUTCHours(4 + (attempt % 8), 30, 0, 0);
        const { data, error } = await db
          .from("appointments")
          .insert({
            patient_id: patientId,
            therapist_id: therapistId,
            category_id: conditionId,
            concern: MARKER,
            slot_time: slot.toISOString(),
            duration_minutes: 60,
            status: "completed",
            payment_status: "paid",
            amount_paid_paise: 70000,
            visit_mode: "online",
          })
          .select("id")
          .single();
        if (data) appointmentId = data.id;
        else if (error?.code === "23505" || error?.code === "23P01") lastError = error.message;
        else throw new Error(error?.message ?? "could not create the fixture session");
      }
      if (!appointmentId) throw new Error(`no free past hour for the fixture session: ${lastError}`);
    }
    therapist = await request.newContext({
      extraHTTPHeaders: { Cookie: await cookieHeaderFor(QA_EMAILS.therapistA) },
    });
    adminCtx = await request.newContext({
      extraHTTPHeaders: { Cookie: await cookieHeaderFor(QA_EMAILS.admin) },
    });
  });

  test.afterAll(async () => {
    await clearOpenPlans();
    await adminCtx?.post(PRICE_ROUTE, { data: { categoryId: conditionId, useClinicWide: true } });
    if (conditionId) await db.from("treatment_categories").update({ active: false }).eq("id", conditionId);
    await therapist?.dispose();
    await adminCtx?.dispose();
  });

  test("HVP-005: own price, then clinic-wide -- the recommendation follows each", async () => {
    test.setTimeout(90_000);
    const { data: clinic } = await db
      .from("home_visit_packages")
      .select("price_paise")
      .eq("active", true)
      .eq("visit_count", 1)
      .eq("care_plan_course", false)
      .is("category_id", null)
      .maybeSingle();
    test.skip(!clinic, "no clinic-wide home-visit price in this project");

    const own = await adminCtx.post(PRICE_ROUTE, { data: { categoryId: conditionId, pricePaise: 177700 } });
    expect(own.status(), await own.text()).toBe(200);
    expect(await handsOnSnapshotPrice()).toBe(177700);

    const back = await adminCtx.post(PRICE_ROUTE, { data: { categoryId: conditionId, useClinicWide: true } });
    expect(back.status(), await back.text()).toBe(200);
    expect(await handsOnSnapshotPrice()).toBe(clinic!.price_paise);
  });
});
