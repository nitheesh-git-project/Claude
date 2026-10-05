import { test, expect, type Page } from "@playwright/test";
import { QA_EMAILS, BASE, adminClient, browserCookiesFor, chooseAnyServiceOnStepOne } from "./helpers";

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
