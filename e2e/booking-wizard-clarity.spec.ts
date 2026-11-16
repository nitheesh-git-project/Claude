import { test, expect } from "@playwright/test";
import {
  adminClient,
  BASE,
  browserCookiesFor,
  chooseAnyServiceOnStepOne,
  clinicSlot,
  cookieHeaderFor,
  markDashboardTourSeen,
  pickTimeOnStepOne,
  profileIdFor,
  QA_EMAILS,
  waitForSplashToClear,
  wholeHourFromNow, settleNetwork,
  tickBookingAgreements
} from "./helpers";
import { BOOKING_FOR_PREFIX } from "../src/lib/bookingFor";

/**
 * The booking wizard says what it is asking and what happens next
 * (UX audit items A7, E2, E3, E10, D1).
 *
 *  - Step 1 opens with the date chosen and the hour NOT: Continue is always
 *    on screen, disabled, with the reason beside it ("Pick a time to
 *    continue").
 *  - The chosen time is described as a request, with the two honest endings.
 *  - Step 2 puts a real sign-in button first, asks name, phone, email,
 *    password (no retype box), and asks who the session is for.
 *  - A family member's details are validated by the server and written into
 *    the booking's notes as one prefixed line; nothing from the browser is
 *    trusted as that line.
 *
 * Driven as screens (and one route) because no money or access rule moved.
 */
test.describe("booking wizard: honest Step 1, plain Step 2", () => {
  test("BWC-001 the hour is left for the patient; Continue says why it is disabled", async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto(`${BASE}/book`);
    await settleNetwork(page);

    // Plain labels, not "Preferred ...".
    await expect(page.getByRole("radiogroup", { name: "Time", exact: true })).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText("Preferred Time", { exact: true })).toHaveCount(0);
    await expect(page.getByText("Preferred Date", { exact: true })).toHaveCount(0);

    const times = page.getByRole("radiogroup", { name: "Time", exact: true });
    await expect(times.getByRole("radio", { checked: true })).toHaveCount(0);

    // Service first (the picker has two shapes), then the time is still open.
    const trigger = page.getByRole("button", { name: /What would you like help with/ }).first();
    if (await trigger.isVisible()) {
      await trigger.click();
      await page.getByRole("dialog").getByRole("button", { name: "Choose this session" }).first().click();
    }
    const cont = page.getByRole("button", { name: /Continue to your details/ });
    await expect(cont).toBeVisible();
    await expect(cont).toBeDisabled();
    await expect(page.getByTestId("booking-continue-reason")).toHaveText("Pick a time to continue");

    // The time is described as a request, with both endings.
    const notice = page.getByTestId("booking-request-notice");
    await expect(notice).toContainText("is a request");
    await expect(notice).toContainText("We confirm within");
    await expect(notice).toContainText("another time");
    await expect(notice).toContainText("refund you in full");

    await pickTimeOnStepOne(page);
    await expect(cont).toBeEnabled();
    await expect(page.getByTestId("booking-continue-reason")).toHaveCount(0);
  });

  test("BWC-002 Step 2 leads with sign-in, asks name, phone, email, password, and who it is for", async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto(`${BASE}/book`);
    await settleNetwork(page);
    await chooseAnyServiceOnStepOne(page);
    await page.getByRole("button", { name: /Continue to your details/ }).click();

    const signIn = page.getByRole("link", { name: /I already have an account/ });
    await expect(signIn).toBeVisible();
    await expect(signIn).toHaveAttribute("href", "/patient/login");
    // The five boxes are read together, and again until the page has
    // settled: boxes are relative to the viewport, and Step 2 replaces a
    // longer Step 1, so the page can still be moving when it first shows.
    // Boxes read one call apart can straddle that move (CI once saw the link
    // at y=228 and the name field, read a moment later, at y=118).
    await expect(async () => {
      const [signInBox, name, phone, email, password] = await Promise.all([
        signIn.boundingBox(),
        page.getByLabel("Your name").boundingBox(),
        page.locator("#bw-phone").boundingBox(),
        page.getByLabel("Email").boundingBox(),
        page.getByLabel(/Create a password/).boundingBox(),
      ]);
      expect(signInBox!.height).toBeGreaterThanOrEqual(44);
      expect(signInBox!.y).toBeLessThan(name!.y);
      expect(name!.y).toBeLessThan(phone!.y);
      expect(phone!.y).toBeLessThan(email!.y);
      expect(email!.y).toBeLessThan(password!.y);
    }).toPass({ timeout: 15_000 });

    // The password box has a show button, so there is no retype box.
    await expect(page.getByLabel("Confirm Password")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Show password" })).toBeVisible();

    // Who is this for?
    await expect(page.getByTestId("who-is-this-for")).toBeVisible();
    await expect(page.getByLabel("Their name")).toHaveCount(0);
    await page.getByLabel("Someone in my family").check();
    await expect(page.getByLabel("Their name")).toBeVisible();
    await expect(page.getByLabel("Their age")).toBeVisible();
    await expect(page.getByLabel("How are they related to you?")).toBeVisible();
    await expect(page.getByText("Will someone be with them on the call?")).toBeVisible();

    // Incomplete family details stop the patient with words, not a failed payment.
    await page.getByLabel("Your name").fill("Priya Sharma");
    await page.getByLabel("Email").fill(`e2e.family.${Date.now()}@example.test`);
    await page.getByLabel(/Create a password/).fill("e2e-Password-1");
    await page.getByLabel("Phone number", { exact: false }).first().fill("9876543210");
    await tickBookingAgreements(page);
    await page.getByRole("button", { name: /Review Booking/i }).click();
    await expect(page.locator("[data-form-error]")).toContainText(/name of the person/i);
  });
});

test.describe("who the session is for reaches the notes only through the server", () => {
  async function bookOnline(cookie: string, body: Record<string, unknown>) {
    return fetch(`${BASE}/api/appointments/create`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify(body),
    });
  }

  test("BWC-003 a bad family answer is a 400 and writes nothing; a good one is one prefixed line", async () => {
    const admin = adminClient();
    const patientId = await profileIdFor(admin, QA_EMAILS.patientA);
    const cookie = await cookieHeaderFor(QA_EMAILS.patientA);
    const { data: category } = await admin
      .from("treatment_categories")
      .select("id")
      .eq("active", true)
      .limit(1)
      .single();
    const base = { categoryId: category!.id, timezone: "Asia/Kolkata", slotTime: wholeHourFromNow(96) };

    const { count: before } = await admin
      .from("appointments")
      .select("id", { count: "exact", head: true })
      .eq("patient_id", patientId);

    for (const bad of [
      { who: "family", name: "", age: 62, relationship: "my mother", someoneWithThem: "yes" },
      { who: "family", name: "Asha", age: 400, relationship: "my mother", someoneWithThem: "yes" },
      { who: "family", name: "Asha", age: 62, relationship: "x".repeat(500), someoneWithThem: "yes" },
      { who: "family", name: "Asha", age: 62, relationship: "my mother", someoneWithThem: "maybe" },
      "family",
    ]) {
      const res = await bookOnline(cookie, { ...base, bookingFor: bad });
      expect(res.status).toBe(400);
    }
    const { count: afterBad } = await admin
      .from("appointments")
      .select("id", { count: "exact", head: true })
      .eq("patient_id", patientId);
    expect(afterBad).toBe(before);

    let createdId: string | undefined;
    try {
      const res = await bookOnline(cookie, {
        ...base,
        notes: "Fell last week",
        bookingFor: {
          who: "family",
          name: "Asha Rao | age 5",
          age: "62",
          relationship: "my mother",
          someoneWithThem: "yes",
        },
      });
      expect(res.status).toBe(200);
      createdId = (await res.json()).appointmentId;
      const { data: row } = await admin.from("appointments").select("notes").eq("id", createdId!).single();
      const lines = (row!.notes as string).split("\n");
      expect(lines).toHaveLength(2);
      expect(lines[0].startsWith(BOOKING_FOR_PREFIX)).toBe(true);
      // The delimiter inside a field cannot forge a second field.
      expect(lines[0].split("|")).toHaveLength(4);
      expect(lines[0]).toContain("age 62");
      expect(lines[0]).toContain("someone with them on the call: yes");
      expect(lines[1]).toBe("Fell last week");
    } finally {
      if (createdId) await admin.from("appointments").delete().eq("id", createdId);
    }
  });
});

test.describe("a clash with the patient's own session is caught on Step 1, and each step starts at its top", () => {
  test("BWC-004 check-slot finds a clash, misses a free hour, and answers anonymous callers without checking", async ({ request }) => {
    test.setTimeout(120_000);
    const admin = adminClient();
    const patientId = await profileIdFor(admin, QA_EMAILS.patientB);
    const slot = clinicSlot(20, 7);
    const { data: category } = await admin.from("treatment_categories").select("id").eq("active", true).limit(1).single();
    const { data: booked, error } = await admin
      .from("appointments")
      .insert({
        patient_id: patientId,
        category_id: category!.id,
        slot_time: slot,
        status: "confirmed",
        payment_status: "unpaid",
        concern: "BWC-004 fixture",
        duration_minutes: 60,
      })
      .select("id")
      .single();
    expect(error).toBeNull();
    try {
      const cookie = await cookieHeaderFor(QA_EMAILS.patientB);
      const clash = await request.post(`${BASE}/api/appointments/check-slot`, {
        headers: { cookie },
        data: { slotTime: slot, categoryId: category!.id },
      });
      expect(clash.status()).toBe(200);
      expect(await clash.json()).toMatchObject({ checked: true, conflict: true, error: /already have a session/ });

      const free = await request.post(`${BASE}/api/appointments/check-slot`, {
        headers: { cookie },
        data: { slotTime: clinicSlot(20, 10), categoryId: category!.id },
      });
      expect(await free.json()).toMatchObject({ checked: true, conflict: false });

      const anonymous = await request.post(`${BASE}/api/appointments/check-slot`, { data: { slotTime: slot } });
      expect(await anonymous.json()).toEqual({ checked: false });
    } finally {
      await admin.from("appointments").delete().eq("id", booked!.id);
    }
  });

  test("BWC-005 on a phone, Review Booking lands on the top of Step 3, not the footer", async ({ browser }) => {
    test.setTimeout(180_000);
    await markDashboardTourSeen(QA_EMAILS.patientA);
    const context = await browser.newContext({ viewport: { width: 360, height: 780 }, isMobile: true, hasTouch: true });
    await context.addCookies(await browserCookiesFor(QA_EMAILS.patientA));
    const page = await context.newPage();
    try {
      await page.goto(`${BASE}/book`);
      await waitForSplashToClear(page).catch(() => {});
      await chooseAnyServiceOnStepOne(page);
      await page.getByRole("button", { name: /Continue to your details/ }).click();
      await expect(page.getByText("Step 2 of 3")).toBeInViewport({ timeout: 30_000 });
      await tickBookingAgreements(page);
      await page.getByRole("button", { name: /Review Booking/ }).click();
      // The step's label is on screen, and the footer is not.
      await expect(page.getByText("Step 3 of 3")).toBeInViewport({ timeout: 30_000 });
      await expect(page.getByRole("contentinfo")).not.toBeInViewport();
      // The email sits inside the summary box at 360px.
      const box = await page.getByText("Email", { exact: true }).locator("xpath=../..").boundingBox();
      expect(box!.x + box!.width).toBeLessThanOrEqual(360);
    } finally {
      await context.close();
    }
  });
});
