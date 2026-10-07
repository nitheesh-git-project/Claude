import { test, expect, type Page } from "@playwright/test";
import {
  QA_EMAILS,
  BASE,
  adminClient,
  browserCookiesFor,
  chooseAnyServiceOnStepOne,
  waitForSplashToClear,
} from "./helpers";

/**
 * A patient who closes the payment sheet and tries again is never refused
 * their own slot.
 *
 * The wizard creates an unpaid draft on the first Pay tap. Back, a reload or
 * reopening /book used to start a second booking at the same time, which
 * collided with that draft: "You already have a session scheduled around this
 * time". The draft is now replaced by the next booking (src/lib/bookingDraft.ts).
 *
 * Razorpay's checkout.js is replaced by a stand-in whose sheet "closes" the
 * moment it opens -- the server still mints a real test-mode order, so the
 * route's half is the real one.
 */
const OVERLAP = /already have a session scheduled around this time/i;
const NOT_COMPLETED = /Payment was not completed/i;

async function stubRazorpayThatIsClosed(page: Page) {
  await page.route("https://checkout.razorpay.com/**", (route) =>
    route.fulfill({
      contentType: "application/javascript",
      body: `window.Razorpay = function (options) {
        this.on = function () {};
        this.open = function () {
          setTimeout(function () { options.modal && options.modal.ondismiss && options.modal.ondismiss(); }, 300);
        };
      };`,
    })
  );
}

async function walkToStepThree(page: Page) {
  // The wizard reads the session on mount; a click before that lands on the
  // signed-out form.
  await page.waitForLoadState("networkidle");
  await chooseAnyServiceOnStepOne(page);
  await page.getByRole("button", { name: /Continue to Medical Details/i }).click();
  await expect(page.getByText(/Booking as/i)).toBeVisible({ timeout: 30_000 });
  await page.getByRole("checkbox").first().check();
  await page.getByRole("button", { name: /Review Booking/i }).click();
}

function payButton(page: Page) {
  return page.getByRole("button", { name: /Request Booking|Pay .* Now/i });
}

/** Taps Pay and returns the booking /api/appointments/create made for it. */
async function payAndCreate(page: Page): Promise<string> {
  const created = page.waitForResponse(
    (r) => r.url().includes("/api/appointments/create") && r.request().method() === "POST"
  );
  await payButton(page).click();
  const response = await created;
  const body = await response.json();
  expect(response.status(), JSON.stringify(body)).toBe(200);
  return body.appointmentId as string;
}

async function status(id: string) {
  const { data } = await adminClient()
    .from("appointments")
    .select("status, cancellation_reason")
    .eq("id", id)
    .single();
  return data;
}

async function patientId(): Promise<string> {
  const { data } = await adminClient()
    .from("profiles")
    .select("id")
    .eq("email", QA_EMAILS.patientA)
    .single();
  return data!.id as string;
}

async function openDrafts(id: string) {
  const { data } = await adminClient()
    .from("appointments")
    .select("id, status, cancellation_reason")
    .eq("patient_id", id)
    .eq("status", "requested")
    .eq("payment_status", "unpaid")
    .is("therapist_id", null);
  return data ?? [];
}

test.describe("retrying payment after closing the sheet", () => {
  test("RETRY-001 Back and Pay again, then a reload, never hit the overlap error", async ({ page }) => {
    test.setTimeout(240_000);
    const id = await patientId();
    await stubRazorpayThatIsClosed(page);
    await page.context().addCookies(await browserCookiesFor(QA_EMAILS.patientA));
    await page.goto(`${BASE}/book`);

    await walkToStepThree(page);
    const first = await payAndCreate(page);
    await expect(page.getByText(NOT_COMPLETED)).toBeVisible({ timeout: 60_000 });

    // Back, then Pay again: a new booking, and the old draft replaced.
    await page.getByRole("button", { name: "Back", exact: true }).click();
    await page.getByRole("button", { name: /Review Booking/i }).click();
    const second = await payAndCreate(page);
    await expect(page.getByText(NOT_COMPLETED)).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText(OVERLAP)).toHaveCount(0);
    expect(second).not.toBe(first);
    expect(await status(first)).toMatchObject({ status: "cancelled" });
    expect((await status(first))?.cancellation_reason).toMatch(/Replaced by a new booking/);

    // A reload starts over at the same slot: still no collision, and the
    // draft it collided with is replaced in turn.
    await page.reload();
    await walkToStepThree(page);
    const third = await payAndCreate(page);
    await expect(page.getByText(NOT_COMPLETED)).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText(OVERLAP)).toHaveCount(0);
    expect(await status(second)).toMatchObject({ status: "cancelled" });
    expect(await status(third)).toMatchObject({ status: "requested" });
    expect((await openDrafts(id)).map((d) => d.id)).toContain(third);
  });
});

/**
 * A new patient's account stays locked -- no dashboard -- until they pay or
 * have failed `payment_tries_before_access` times; then the wizard opens the
 * dashboard and says why.
 */
test.describe("a new patient's payment tries", () => {
  test("RETRY-002 the account unlocks on the limit, not on the first cancelled sheet", async ({ page }) => {
    test.setTimeout(300_000);
    const { data: settings } = await adminClient()
      .from("site_settings")
      .select("payment_tries_before_access")
      .single();
    const limit = settings?.payment_tries_before_access ?? 3;
    const email = `e2e.newpatient.${Date.now()}@example.test`;
    await stubRazorpayThatIsClosed(page);
    await page.goto(`${BASE}/book`);
    await page.waitForLoadState("networkidle");
    await chooseAnyServiceOnStepOne(page);
    await page.getByRole("button", { name: /Continue to Medical Details/i }).click();
    await page.getByLabel("Full Name").fill("E2E New Patient");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Phone number", { exact: false }).first().fill("9876543210");
    await page.getByLabel(/Create Password/).fill("QaTest!2024pass");
    await page.getByLabel("Confirm Password").fill("QaTest!2024pass");
    await page.getByRole("checkbox").first().check();
    await page.getByRole("button", { name: /Review Booking/i }).click();

    const profile = async () =>
      (await adminClient().from("profiles").select("id, approved").eq("email", email).maybeSingle()).data;
    try {
      for (let i = 1; i <= limit; i++) {
        const recorded = page.waitForResponse((r) => r.url().includes("/api/patient/payment-try"));
        await payButton(page).click();
        const answer = await (await recorded).json();
        expect(answer.tries).toBe(i);
        await expect(page.getByText(NOT_COMPLETED)).toBeVisible({ timeout: 60_000 });
        if (i < limit) {
          // Still locked: no way to the dashboard, and the copy does not
          // promise one.
          expect((await profile())?.approved).toBe(false);
          await expect(page.getByRole("link", { name: /Go to Dashboard/i })).toHaveCount(0);
          await expect(page.getByText(/slot is still held/i)).toBeVisible();
        }
      }
      expect((await profile())?.approved).toBe(true);
      await expect(page.getByText("Your account is ready.")).toBeVisible();
      await page.getByRole("link", { name: /Go to Dashboard/i }).click();
      await expect(page).toHaveURL(/\/patient\/dashboard/, { timeout: 60_000 });
    } finally {
      const row = await profile();
      if (row?.id) await adminClient().auth.admin.deleteUser(row.id);
    }
  });
});

/**
 * A locked booking account that signs in is shown the booking it left
 * unpaid, not "Approval Pending" -- nobody is reviewing it. A /patient/register
 * signup (no booking marker) still gets the review screen.
 */
test.describe("signing in to a locked booking account", () => {
  test("RETRY-003 shows Finish your booking with Pay now and Pick another time", async ({ page }) => {
    test.setTimeout(180_000);
    const stamp = Date.now();
    const lockedEmail = `e2e.locked.${stamp}@example.test`;
    const registeredEmail = `e2e.registered.${stamp}@example.test`;
    const make = async (email: string, signupSource?: string) => {
      const { data, error } = await adminClient().auth.admin.createUser({
        email,
        password: "QaTest!2024pass",
        email_confirm: true,
        user_metadata: { role: "patient", full_name: "E2E Locked", ...(signupSource ? { signup_source: signupSource } : {}) },
      });
      expect(error).toBeNull();
      return data.user!.id;
    };
    const lockedId = await make(lockedEmail, "booking");
    const registeredId = await make(registeredEmail);
    try {
      const slot = new Date(Date.now() + 5 * 86_400_000);
      slot.setUTCMinutes(30, 0, 0); // 30 past in UTC is on the hour in IST
      const { data: draft, error } = await adminClient()
        .from("appointments")
        .insert({
          patient_id: lockedId,
          slot_time: slot.toISOString(),
          timezone: "Asia/Kolkata",
          concern: "General Consultation",
          duration_minutes: 45,
          status: "requested",
          payment_status: "unpaid",
          visit_mode: "online",
        })
        .select("id")
        .single();
      expect(error).toBeNull();

      await page.context().addCookies(await browserCookiesFor(lockedEmail));
      await page.goto(`${BASE}/patient/dashboard`);
      await expect(page).toHaveURL(/\/pending-approval/, { timeout: 60_000 });
      await expect(page.getByRole("heading", { name: "Finish your booking" })).toBeVisible();
      await expect(page.getByText(/is waiting for payment/)).toBeVisible();
      await expect(page.getByRole("button", { name: "Pay now" })).toBeVisible();
      await expect(page.getByRole("link", { name: "Pick another time" })).toHaveAttribute(
        "href",
        `/book?replaces=${draft!.id}`
      );
      await expect(page.getByText(/removed after/)).toBeVisible();
      await waitForSplashToClear(page);
      await page.screenshot({ path: "e2e/screenshots/booking-retry/finish-booking.png" });

      await page.context().clearCookies();
      await page.context().addCookies(await browserCookiesFor(registeredEmail));
      await page.goto(`${BASE}/pending-approval`);
      await expect(page.getByRole("heading", { name: "Approval Pending" })).toBeVisible({ timeout: 60_000 });
    } finally {
      await adminClient().auth.admin.deleteUser(lockedId);
      await adminClient().auth.admin.deleteUser(registeredId);
    }
  });
});

/**
 * A locked booking account is a lead, not an approval: listed under People ->
 * Abandoned checkouts and kept out of Pending Approvals.
 */
test.describe("abandoned checkouts in the back office", () => {
  test("RETRY-004 lists the locked account under People and not in Pending Approvals", async ({ page }) => {
    test.setTimeout(240_000);
    const email = `e2e.abandoned.${Date.now()}@example.test`;
    const { data, error } = await adminClient().auth.admin.createUser({
      email,
      password: "QaTest!2024pass",
      email_confirm: true,
      user_metadata: { role: "patient", full_name: "E2E Abandoned Lead", signup_source: "booking" },
    });
    expect(error).toBeNull();
    const id = data.user!.id;
    try {
      await page.context().addCookies(await browserCookiesFor(QA_EMAILS.admin));
      await page.goto(`${BASE}/admin/dashboard?section=people&tab=abandoned`, {
        waitUntil: "domcontentloaded",
      });
      const list = page.getByRole("region", { name: "Abandoned checkouts" }).filter({ visible: true });
      await expect(list.getByText("E2E Abandoned Lead")).toBeVisible({ timeout: 90_000 });
      await expect(list.getByText(/payment tr(y|ies)/).first()).toBeVisible();
      await expect(list.getByText(/Removed on/).first()).toBeVisible();

      await page.goto(`${BASE}/admin/dashboard?section=today&tab=approvals`, {
        waitUntil: "domcontentloaded",
      });
      await expect(page.getByRole("heading", { name: /Pending Approvals/ })).toBeVisible({ timeout: 90_000 });
      // Every screen stays mounted behind `hidden`, so only what is shown counts.
      await expect(page.getByText("E2E Abandoned Lead").filter({ visible: true })).toHaveCount(0);
    } finally {
      await adminClient().auth.admin.deleteUser(id);
    }
  });
});
