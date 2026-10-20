// Review & pay for a recommended programme (/patient/dashboard/suggested/
// checkout). "Accept & pay" on the Suggested card used to open Razorpay
// straight away, so there was nowhere to type a promo code. It now leads to
// this page: the programme, a code field, and a breakdown the server quoted
// (/api/care-plan/quote) -- and Pay opens Razorpay at the amount
// /api/care-plan/create-order resolved through the same module.
//
// A code applies to a programme only when its "Valid on recommended
// programmes" switch is on (promo_codes.valid_on_programmes, off by
// default); a session-only code is refused with a sentence.
//
// Razorpay's checkout.js is replaced by a stand-in that records the amount
// it was opened at and never takes a payment -- the server still mints a
// real test-mode order, so the route's half is the real one. Nothing is ever
// paid for.
//
// Writes append-only care-plan versions and reviews, so it runs on a
// disposable project only (the same opt-in recommendation-course uses).
import { test, expect, request, type APIRequestContext, type Page } from "@playwright/test";
import {
  BASE,
  QA_EMAILS,
  adminClient,
  browserCookiesFor,
  cookieHeaderFor,
  markDashboardTourSeen,
  profileIdFor,
  waitForSplashToClear, insertPastFixtureAppointment
} from "./helpers";

const db = adminClient();
const CONDITION = "Spine Conditions";
const MARKER = "E2E programme-checkout";
/** Every code this spec makes starts with this, so a crashed run's codes
 *  can be found (and paused) by name. */
const CODE_PREFIX = "E2EPROG";
const PERCENT_OFF = 20;

let patientId = "";
let therapistId = "";
let categoryId = "";
let perSessionPaise = 0;
let appointmentId = "";
let promoWasEnabled = false;
let therapist: APIRequestContext;
let adminCtx: APIRequestContext;
let patientCtx: APIRequestContext;
const versionIds: string[] = [];
const codes: { programme: { id: string; code: string }; session: { id: string; code: string } } = {
  programme: { id: "", code: "" },
  session: { id: "", code: "" },
};

test.skip(
  process.env.E2E_ALLOW_APPEND_ONLY_WRITES !== "1" && process.env.CI_LOCAL_STACK !== "1",
  "writes append-only care-plan rows; set E2E_ALLOW_APPEND_ONLY_WRITES=1 on a disposable project"
);

/** The app's own rupee format (src/lib/formatMoney.ts formatRupees). */
const inr = (paise: number) => {
  const value = Math.round(paise) / 100;
  return `₹${value.toLocaleString(
    "en-IN",
    Number.isInteger(value)
      ? { maximumFractionDigits: 0 }
      : { minimumFractionDigits: 2, maximumFractionDigits: 2 }
  )}`;
};

async function clearOpenPlans() {
  await db
    .from("care_plans")
    .update({ status: "withdrawn" })
    .eq("patient_id", patientId)
    .in("status", ["active", "pending_review"]);
}

async function recommendAndApprove(sessionCount: number) {
  await clearOpenPlans();
  const res = await therapist.post(`${BASE}/api/therapist/care-plan/submit`, {
    data: {
      patientId,
      appointmentId,
      categoryId,
      sessionCount,
      handsOnRequired: false,
      frequencyPerWeek: 2,
      clinicalRationale: MARKER,
      instructions: "",
    },
  });
  expect(res.status(), await res.text()).toBe(200);
  const created = await res.json();
  const review = await adminCtx.post(`${BASE}/api/admin/review-care-plan`, {
    data: { carePlanId: created.carePlanId, decision: "approved" },
  });
  expect(review.status(), await review.text()).toBe(200);
  versionIds.push(created.versionId);
  return created.versionId as string;
}

/** Records the amount Razorpay was opened at; never takes a payment. */
async function stubRazorpay(page: Page) {
  await page.route("https://checkout.razorpay.com/**", (route) =>
    route.fulfill({
      contentType: "application/javascript",
      body: `window.Razorpay = function (options) {
        window.__rzpAmount = options.amount;
        this.on = function () {};
        this.open = function () {
          setTimeout(function () { options.modal && options.modal.ondismiss && options.modal.ondismiss(); }, 200);
        };
      };`,
    })
  );
}

async function openCheckout(page: Page, versionId: string) {
  await page.context().addCookies(await browserCookiesFor(QA_EMAILS.patientB));
  await page.goto(`${BASE}/patient/dashboard/suggested/checkout?plan=${versionId}`);
  await waitForSplashToClear(page);
  await expect(page.getByTestId("programme-breakdown")).toBeVisible();
}

async function insertCode(code: string, validOnProgrammes: boolean, kind: "percent_off" | "amount_off", value: number) {
  const { data, error } = await db
    .from("promo_codes")
    .insert({
      code,
      kind,
      value,
      active: true,
      valid_on_programmes: validOnProgrammes,
      description: MARKER,
    })
    .select("id")
    .single();
  if (error) throw new Error(`could not seed ${code}: ${error.message}`);
  return { id: data.id as string, code };
}

test.beforeAll(async () => {
  patientId = await profileIdFor(db, QA_EMAILS.patientB);
  therapistId = await profileIdFor(db, QA_EMAILS.therapistA);
  await markDashboardTourSeen(QA_EMAILS.patientB);

  // Found or made, as recommendation-course does: a disposable stack starts
  // with an empty catalog.
  let { data: cat } = await db
    .from("treatment_categories")
    .select("id, price_paise")
    .eq("title", CONDITION)
    .maybeSingle();
  if (!cat) {
    const { data: created, error } = await db
      .from("treatment_categories")
      .insert({
        title: CONDITION,
        description: "A condition seeded by the programme-checkout spec.",
        points: ["Back and neck pain", "Posture"],
        price_paise: 49900,
        duration_minutes: 60,
        active: true,
        image_url: "/photos/care-back.jpg",
      })
      .select("id, price_paise")
      .single();
    if (error) throw new Error(`could not seed "${CONDITION}": ${error.message}`);
    cat = created;
  }
  categoryId = cat!.id;
  perSessionPaise = cat!.price_paise;

  const { data: existing } = await db
    .from("appointments")
    .select("id")
    .eq("concern", MARKER)
    .eq("status", "completed")
    .limit(1)
    .maybeSingle();
  if (existing) {
    appointmentId = existing.id;
  } else {
    appointmentId = await insertPastFixtureAppointment(
      db,
      {
        patient_id: patientId,
        therapist_id: therapistId,
        category_id: categoryId,
        concern: MARKER,
        duration_minutes: 60,
        status: "completed",
        payment_status: "paid",
        amount_paid_paise: perSessionPaise,
        visit_mode: "online",
      },
      { daysAgo: 8 }
    );
  }

  const { data: settings } = await db.from("site_settings").select("promo_codes_enabled").single();
  promoWasEnabled = settings?.promo_codes_enabled === true;
  await db.from("site_settings").update({ promo_codes_enabled: true }).not("id", "is", null);

  const stamp = String(Date.now()).slice(-6);
  codes.programme = await insertCode(`${CODE_PREFIX}${stamp}`, true, "percent_off", PERCENT_OFF);
  codes.session = await insertCode(`${CODE_PREFIX}S${stamp}`, false, "amount_off", 20000);

  therapist = await request.newContext({ extraHTTPHeaders: { Cookie: await cookieHeaderFor(QA_EMAILS.therapistA) } });
  adminCtx = await request.newContext({ extraHTTPHeaders: { Cookie: await cookieHeaderFor(QA_EMAILS.admin) } });
  patientCtx = await request.newContext({ extraHTTPHeaders: { Cookie: await cookieHeaderFor(QA_EMAILS.patientB) } });
});

test.afterAll(async () => {
  await clearOpenPlans();
  // The unpaid purchases create-order made (never paid -- the sheet is a
  // stand-in), then the codes. A code a purchase still names cannot be
  // deleted (a claimed code is only ever paused), so one that refuses is
  // paused instead.
  if (versionIds.length) {
    await db
      .from("patient_package_purchases")
      .delete()
      .in("care_plan_version_id", versionIds)
      .neq("payment_status", "paid");
  }
  for (const promo of [codes.programme, codes.session]) {
    if (!promo.id) continue;
    const { error } = await db.from("promo_codes").delete().eq("id", promo.id);
    if (error) await db.from("promo_codes").update({ active: false }).eq("id", promo.id);
  }
  await db
    .from("site_settings")
    .update({ promo_codes_enabled: promoWasEnabled })
    .not("id", "is", null);
  await therapist?.dispose();
  await adminCtx?.dispose();
  await patientCtx?.dispose();
});

test("PC-001: Accept & pay on the card goes to Review & pay, and nothing is charged from the card", async ({ page }) => {
  // First visit to the Suggested page compiles it on a cold dev server.
  test.setTimeout(90_000);
  const versionId = await recommendAndApprove(4);
  await stubRazorpay(page);
  const orders: string[] = [];
  page.on("request", (r) => {
    if (r.url().includes("/api/care-plan/create-order")) orders.push(r.url());
  });
  await page.context().addCookies(await browserCookiesFor(QA_EMAILS.patientB));
  await page.goto(`${BASE}/patient/dashboard/suggested`);
  await waitForSplashToClear(page);
  const accept = page.locator("#recommendation").getByRole("link", { name: /^Accept & pay/ });
  await expect(accept).toBeVisible();
  await accept.click();
  await page.waitForURL(new RegExp(`/patient/dashboard/suggested/checkout\\?plan=${versionId}`));
  await waitForSplashToClear(page);
  await expect(page.getByRole("heading", { name: `${CONDITION} programme` })).toBeVisible();
  await expect(page.getByRole("link", { name: "Back to Suggested" })).toBeVisible();
  expect(orders, "the card must not start a payment").toHaveLength(0);
  expect(await page.evaluate(() => (window as unknown as { __rzpAmount?: number }).__rzpAmount)).toBeUndefined();
});

test("PC-002: the page shows the breakdown, and with no code the patient pays the full price", async ({ page }) => {
  // A recommendation written and approved, then the page and two quotes:
  // past 30s against a hosted project.
  test.setTimeout(90_000);
  const versionId = await recommendAndApprove(4);
  const list = perSessionPaise * 4;

  const quote = await patientCtx.post(`${BASE}/api/care-plan/quote`, { data: { carePlanVersionId: versionId } });
  expect(quote.status(), await quote.text()).toBe(200);
  const q = await quote.json();
  expect(q).toMatchObject({ listPricePaise: list, discountPaise: 0, totalPaise: list, payable: true });

  await stubRazorpay(page);
  await openCheckout(page, versionId);
  const breakdown = page.getByTestId("programme-breakdown");
  await expect(breakdown.getByTestId("breakdown-programme")).toContainText("4 sessions");
  await expect(breakdown.getByTestId("breakdown-programme")).toContainText(inr(list));
  await expect(breakdown.getByTestId("breakdown-discount")).toHaveCount(0);
  await expect(breakdown.getByTestId("breakdown-total")).toHaveText(inr(list));
  await page.screenshot({ path: "test-results/programme-checkout-full.png", fullPage: true });

  const order = page.waitForResponse((r) => r.url().includes("/api/care-plan/create-order"));
  await page.getByRole("button", { name: `Pay ${inr(list)}` }).click();
  const res = await order;
  const body = await res.json();
  expect(res.status(), JSON.stringify(body)).toBe(200);
  expect(body.amount).toBe(list);
  await expect.poll(() => page.evaluate(() => (window as unknown as { __rzpAmount?: number }).__rzpAmount)).toBe(list);

  const { data: purchase } = await db
    .from("patient_package_purchases")
    .select("amount_paid_paise, list_price_paise, discount_paise, promo_code_id, payment_status")
    .eq("care_plan_version_id", versionId)
    .single();
  expect(purchase).toMatchObject({
    amount_paid_paise: list,
    list_price_paise: list,
    discount_paise: 0,
    promo_code_id: null,
    payment_status: "unpaid",
  });
});

test("PC-003: a code valid on programmes takes its share off the total, and Razorpay opens at the discounted figure", async ({ page }) => {
  // Two quotes, two orders and a recommendation written and approved: about
  // eight round trips to the database and Razorpay, which outruns 30s.
  test.setTimeout(90_000);
  const versionId = await recommendAndApprove(4);
  const list = perSessionPaise * 4;
  const discounted = Math.floor(list * (1 - PERCENT_OFF / 100));

  await stubRazorpay(page);
  await openCheckout(page, versionId);
  await page.getByRole("button", { name: "Have a promo code?" }).click();
  await page.getByLabel("Promo code").fill(codes.programme.code.toLowerCase());
  await page.getByRole("button", { name: "Apply" }).click();
  await expect(page.getByText(`${codes.programme.code} applied`)).toBeVisible();

  const breakdown = page.getByTestId("programme-breakdown");
  await expect(breakdown.getByTestId("breakdown-discount")).toContainText(`−${inr(list - discounted)}`);
  await expect(breakdown.getByTestId("breakdown-total")).toHaveText(inr(discounted));
  await page.screenshot({ path: "test-results/programme-checkout-code.png", fullPage: true });

  const order = page.waitForResponse((r) => r.url().includes("/api/care-plan/create-order"));
  await page.getByRole("button", { name: `Pay ${inr(discounted)}` }).click();
  const res = await order;
  const body = await res.json();
  expect(res.status(), JSON.stringify(body)).toBe(200);
  // What Razorpay is asked for is exactly the total the page printed.
  expect(body.amount).toBe(discounted);
  expect(JSON.parse(res.request().postData() ?? "{}").promoCode).toBe(codes.programme.code);
  await expect.poll(() => page.evaluate(() => (window as unknown as { __rzpAmount?: number }).__rzpAmount)).toBe(discounted);

  const { data: purchase } = await db
    .from("patient_package_purchases")
    .select("amount_paid_paise, list_price_paise, discount_paise, promo_code_id, promo_claimed_at")
    .eq("care_plan_version_id", versionId)
    .single();
  expect(purchase).toMatchObject({
    amount_paid_paise: discounted,
    list_price_paise: list,
    discount_paise: list - discounted,
    promo_code_id: codes.programme.id,
  });
  expect(purchase!.promo_claimed_at).not.toBeNull();

  // A retry with no code gives the claim back and charges the full price.
  const retry = await patientCtx.post(`${BASE}/api/care-plan/create-order`, {
    data: { carePlanVersionId: versionId },
  });
  expect(retry.status(), await retry.text()).toBe(200);
  expect((await retry.json()).amount).toBe(list);
  const { data: released } = await db
    .from("patient_package_purchases")
    .select("promo_code_id, discount_paise, amount_paid_paise")
    .eq("care_plan_version_id", versionId)
    .single();
  expect(released).toMatchObject({ promo_code_id: null, discount_paise: 0, amount_paid_paise: list });
});

test("PC-004: a session-only code is refused on a programme with a sentence, and the total stays at full price", async ({ page }) => {
  const versionId = await recommendAndApprove(4);
  const list = perSessionPaise * 4;

  await openCheckout(page, versionId);
  await page.getByRole("button", { name: "Have a promo code?" }).click();
  await page.getByLabel("Promo code").fill(codes.session.code);
  await page.getByRole("button", { name: "Apply" }).click();
  await expect(page.getByText("This code can't be used on a programme.")).toBeVisible();
  await expect(page.getByTestId("breakdown-discount")).toHaveCount(0);
  await expect(page.getByTestId("breakdown-total")).toHaveText(inr(list));

  // The order route refuses it too (409) rather than charging list price
  // for a checkout that named a code.
  const res = await patientCtx.post(`${BASE}/api/care-plan/create-order`, {
    data: { carePlanVersionId: versionId, promoCode: codes.session.code },
  });
  expect(res.status()).toBe(409);
  expect((await res.json()).error).toBe("This code can't be used on a programme.");
});

test("PC-005: a plan that is not open shows a way back, never a Pay button", async ({ page }) => {
  await clearOpenPlans();
  await page.context().addCookies(await browserCookiesFor(QA_EMAILS.patientB));
  await page.goto(`${BASE}/patient/dashboard/suggested/checkout?plan=00000000-0000-0000-0000-000000000000`);
  await waitForSplashToClear(page);
  await expect(page.getByText("We couldn't find that recommendation")).toBeVisible();
  await expect(page.getByRole("button", { name: /^Pay/ })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Back to Suggested" }).first()).toBeVisible();
});
