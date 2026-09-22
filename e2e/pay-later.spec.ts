import { test, expect, type Page } from "@playwright/test";
import { BASE, adminClient, browserCookiesFor, cookieHeaderFor, wholeHourFromNow, QA_EMAILS } from "./helpers";

/**
 * Pay later, end to end, in a real browser.
 *
 * The rest of this suite talks to the HTTP API; this one drives the screens,
 * because half of what pay later got wrong the first time round was what a
 * person reads rather than what a route returns -- a delivered session that
 * said "Unpaid", a feed telling a patient their booked session was not
 * booked, an alert linking to a screen that could not clear it. Those are
 * invisible to an API test and obvious in a screenshot.
 *
 * It runs in one file and in order, because it is one journey: the grant, a
 * booking with no payment step, completion putting the money in three places
 * at once, settling from the pool, and the two ways money goes back out.
 */

const PATIENT_E = "qa.patient.e@example.test";
const SHOTS = "e2e/screenshots/pay-later";

let patientId = "";
let categoryId = "";
let categoryPricePaise = 0;
let therapistId = "";
let bookedId = "";

const db = adminClient();

// This file drives real screens against a real server: a page render, a
// server round trip per step, and on a cold dev server a route compiling the
// first time it is called. The suite default of 30s is written for an API
// call, not a journey.
test.setTimeout(180_000);

async function shot(page: Page, name: string) {
  await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
}

/** Sign the browser in as somebody, by injecting a Node-minted session. */
async function signIn(page: Page, email: string) {
  const cookies = await browserCookiesFor(email);
  await page.context().clearCookies();
  await page.context().addCookies(cookies);
}

/** What the clinic earned and owes, read the way the Money screens read it.
 *  Used to assert the figures do not move either side of a settlement or a
 *  write-off -- the two claims this whole feature rests on. */
async function moneyFigures() {
  const { data } = await db
    .from("appointments")
    .select("status,payment_status,payment_terms,amount_paid_paise,amount_due_paise,pay_later_outcome,therapist_id,slot_time")
    .eq("patient_id", patientId);
  let gross = 0;
  let therapistEarning = 0;
  for (const a of data ?? []) {
    const counted =
      a.payment_status === "paid" ||
      (a.payment_terms === "pay_later" && a.status === "completed");
    if (!counted) continue;
    const amount = a.amount_paid_paise ?? a.amount_due_paise ?? 0;
    gross += amount;
    if (a.status === "completed") therapistEarning += amount;
  }
  return { gross, therapistEarning };
}

async function setting(key: string, value: unknown) {
  await db.from("site_settings").update({ [key]: value }).eq("id", true);
}

test.beforeAll(async () => {
  const { data: p } = await db.from("profiles").select("id").eq("email", PATIENT_E).single();
  patientId = p!.id;

  // Start from nothing. This file books, completes, settles, writes off and
  // refunds against a real database, so a second run that read the first
  // run's rows would assert against state it did not create -- which is how
  // "nothing is owed yet" fails on a working product.
  const { data: old } = await db.from("appointments").select("id").eq("patient_id", patientId);
  const oldIds = (old ?? []).map((a) => a.id);
  if (oldIds.length) {
    await db.from("business_expenses").delete().in("source_appointment_id", oldIds);
    await db.from("appointments").delete().in("id", oldIds);
  }
  // `pay_later_payments` is append-only by trigger, so this file cannot clear
  // its own money history the way it clears its appointments -- the delete is
  // refused, and swallowing that refusal is exactly what hid the problem the
  // first time: a leftover confirmed payment's unallocated remainder nets off
  // the next run's owed figure, so the widget read less than the sessions
  // listed under it and PL-UI-005 failed on a working product.
  //
  // So say so instead of pretending. `npm run clean:e2e -- --apply` is the
  // one path that removes them, and it is the same path and the same
  // reasoning the credit ledger's fixture rows already use.
  const { data: leftover } = await db
    .from("pay_later_payments")
    .select("id,status,unallocated_paise")
    .eq("patient_id", patientId);
  if ((leftover ?? []).length > 0) {
    throw new Error(
      `Patient E still carries ${leftover!.length} pay-later payment(s) from an earlier run ` +
        `(${leftover!.map((r) => `${r.status}, ₹${(r.unallocated_paise ?? 0) / 100} unallocated`).join("; ")}). ` +
        "They are append-only and this file cannot remove them. Run:\n\n" +
        "    npm run clean:e2e -- --apply\n"
    );
  }
  const { data: c } = await db
    .from("treatment_categories")
    .select("id,price_paise")
    .eq("active", true)
    .order("price_paise", { ascending: false })
    .limit(1)
    .single();
  categoryId = c!.id;
  categoryPricePaise = c!.price_paise;
  const { data: t } = await db
    .from("profiles")
    .select("id")
    .eq("role", "therapist")
    .eq("approved", true)
    .eq("active", true)
    .limit(1)
    .single();
  therapistId = t!.id;
});

test("PL-UI-001 the master switch, and the screen it lives on", async ({ page }) => {
  await setting("pay_later_enabled", false);
  await signIn(page, QA_EMAILS.admin);
  await page.goto("/admin/dashboard?section=money&tab=owing");
  await expect(page.getByRole("heading", { name: "Owed by patients", exact: true })).toBeVisible();
  await shot(page, "01-owing-switch-off");
});

test("PL-UI-002 the grant card, before and after the switch", async ({ page }) => {
  await db.from("profiles").update({ pay_later_enabled: false, pay_later_reason: null }).eq("id", patientId);
  await signIn(page, QA_EMAILS.admin);

  // Switch off: the card must say a grant would do nothing yet.
  await page.goto(`/admin/dashboard/patients/${patientId}`);
  await expect(page.getByRole("heading", { name: "Pay later", exact: true })).toBeVisible();
  await shot(page, "02-grant-card-switch-off");

  // Turn the clinic switch on, then grant.
  await setting("pay_later_enabled", true);
  await page.goto(`/admin/dashboard/patients/${patientId}`);
  await shot(page, "03-grant-card-switch-on");

  await page.getByLabel(/Why this patient may pay later/i).fill("Patient of six years, settles monthly by bank transfer");
  await page.getByRole("button", { name: /Allow this patient to pay later/i }).click();
  await expect(page.getByRole("button", { name: /Stop pay later/i })).toBeVisible();
  await shot(page, "04-granted");

  const { data: after } = await db
    .from("profiles")
    .select("pay_later_enabled,pay_later_reason,pay_later_granted_at")
    .eq("id", patientId)
    .single();
  expect(after!.pay_later_enabled).toBe(true);
  expect(after!.pay_later_reason).toContain("six years");
  expect(after!.pay_later_granted_at).toBeTruthy();
});

test("PL-UI-003 booking on terms, with no payment step", async ({ page }) => {
  // Stand this test up on its own rather than on PL-UI-002's side effect.
  // Both halves are re-derived server-side by the quote, so if either is off
  // the wizard correctly shows the ordinary prepaid checkout -- and the
  // failure then reads as "pay later is broken" when what actually happened
  // is that a retry, a restored database or a run of this file against a
  // clinic that had switched the feature back off left the grant behind.
  // That is exactly what happened once, and it cost a diagnosis.
  await setting("pay_later_enabled", true);
  await db
    .from("profiles")
    .update({
      pay_later_enabled: true,
      pay_later_reason: "Patient of six years, settles monthly by bank transfer",
    })
    .eq("id", patientId);

  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });

  await signIn(page, PATIENT_E);
  await page.goto("/book");
  await page.waitForLoadState("networkidle");
  await shot(page, "05-book-step1");

  // Step 1 is the slot, and it opens with a bookable day and hour already
  // chosen -- so this only has to move on.
  await page.getByRole("button", { name: /Continue to Medical Details/i }).click();
  await page.waitForTimeout(1200);
  await shot(page, "06-book-step2-details");

  // Step 2 is the patient's own details. Signed in, the account fields are
  // already theirs; all that is left is the concern and the consent.
  const concern = page.locator("select").filter({
    has: page.locator("option", { hasText: /Select what you need help with/i }),
  });
  await concern.selectOption({ index: 1 });
  await page.getByRole("checkbox").first().check();
  await page.waitForTimeout(300);
  await shot(page, "07-book-step2-filled");

  await page.getByRole("button", { name: /Review Booking/i }).click();
  // The quote is a server round trip; screenshot what a patient sees while
  // it is in flight as well as after it lands, because the first of those is
  // the screen they actually read first.
  await page.waitForTimeout(700);
  await shot(page, "08a-step3-while-quoting");
  await page.waitForTimeout(6000);
  await shot(page, "08b-step3-quoted");

  // The point of the whole phase: the primary action does not ask for money.
  await expect(page.getByRole("button", { name: /Confirm booking - pay later/i })).toBeVisible();

  // And the choice the arrangement must never take away. This link used to be
  // gated on an appointment id that does not exist until the account does, so
  // for a patient booking on terms it never rendered at all.
  await expect(page.getByRole("button", { name: /Or pay .* now instead/i })).toBeVisible();

  // The notice, in its own words: it quoted the refund window at somebody who
  // owes nothing until the session happens, which describes money they never
  // paid. Both prepaid shapes are asserted absent rather than just the one
  // wording, so a future rewrite of that branch cannot leak into this one
  // unnoticed.
  //
  // The spacing regression that shipped alongside this lives on the prepaid
  // branch, which quotes a number where this one does not -- so asserting it
  // here could never have failed. `booking-rules.spec.ts` BR-CANCEL-001/002
  // are where that is actually pinned now; this line stays only to catch a
  // numbered sentence leaking onto a screen that should carry none.
  const notice = (await page.textContent("body")) ?? "";
  expect(notice).toContain("Cancel any time before your slot");
  expect(notice).not.toContain("Free cancellation");
  expect(notice).not.toContain("so cancelling it isn't refunded");
  expect(notice).not.toMatch(/\d+hours/);

  await page.getByRole("button", { name: /Confirm booking - pay later/i }).click();
  await page.waitForTimeout(4000);
  await shot(page, "08c-after-confirm-click");

  // Polled rather than waited out: the confirmation is a server round trip
  // and, on a cold dev server, the route compiles first.
  await expect
    .poll(async () => {
      const { data } = await db
        .from("appointments")
        .select("payment_terms")
        .eq("patient_id", patientId)
        .order("created_at", { ascending: false })
        .limit(1)
        .single();
      return data?.payment_terms ?? null;
    }, { timeout: 60_000 })
    .toBe("pay_later");

  await page.waitForTimeout(1500);
  await shot(page, "09-booking-confirmed");
  console.log("CONSOLE ERRORS:", JSON.stringify(errors.slice(0, 6), null, 2));

  const { data: appt } = await db
    .from("appointments")
    .select("id,status,payment_status,payment_terms,amount_due_paise,list_price_paise,paid_at,meet_link,therapist_id")
    .eq("patient_id", patientId)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();
  console.log("BOOKED ROW:", JSON.stringify(appt));
  bookedId = appt!.id;
  expect(appt!.payment_status).toBe("unpaid");
  expect(appt!.paid_at).toBeNull();
  expect(appt!.amount_due_paise).toBeGreaterThan(0);
  // `requested` rather than `confirmed`: auto-assignment is off for this
  // clinic, so a booking on terms waits in the admin's queue exactly as a
  // paid one does. The admin assigning it is what confirms it, which is the
  // next step of the journey rather than a gap in this one.
  expect(["requested", "confirmed"]).toContain(appt!.status);
});

test("PL-UI-004 completion puts the money in three places at once", async ({ page }) => {
  const adminCookie = await cookieHeaderFor(QA_EMAILS.admin);
  const post = (path: string, body: unknown) =>
    fetch(`${BASE}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie: adminCookie },
      body: JSON.stringify(body),
    });

  // Assigning is what confirms a booking on terms -- without that arm it
  // never leaves `requested` and could never be completed.
  const assigned = await post("/api/admin/assign-appointment", {
    appointmentId: bookedId,
    therapistId,
  });
  expect(assigned.status).toBe(200);
  const { data: afterAssign } = await db
    .from("appointments")
    .select("status,payment_terms")
    .eq("id", bookedId)
    .single();
  expect(afterAssign!.status).toBe("confirmed");

  // Nothing is owed until the work is done.
  const { data: beforeRows } = await db
    .from("appointments")
    .select("id,amount_due_paise,status,payment_terms,pay_later_outcome,payment_status")
    .eq("patient_id", patientId);
  const owedBefore = (beforeRows ?? []).filter(
    (r) => r.id === bookedId && r.status === "completed"
  );
  expect(owedBefore).toHaveLength(0);

  // Deliver it.
  const completed = await post("/api/appointments/complete-session", {
    appointmentId: bookedId,
  });
  expect(completed.status).toBe(200);

  const { data: done } = await db
    .from("appointments")
    .select("status,payment_status,payment_terms,amount_due_paise,completed_at")
    .eq("id", bookedId)
    .single();
  console.log("COMPLETED ROW:", JSON.stringify(done));
  expect(done!.status).toBe("completed");
  expect(done!.payment_status).toBe("unpaid");
  expect(done!.completed_at).toBeTruthy();

  // 1. What the patient owes.
  await signIn(page, QA_EMAILS.admin);
  await page.goto("/admin/dashboard?section=money&tab=owing");
  await page.waitForLoadState("networkidle");
  await shot(page, "10-owing-after-completion");
  // Scoped to the card: every admin screen is rendered at once behind
  // `hidden`, so an unscoped text match can resolve to the activity feed.
  await expect(
    page.locator("text=Who owes what").locator("xpath=ancestor::*[self::div][3]").getByText("QA Patient E").first()
  ).toBeVisible();

  // 2. The clinic's revenue, and 3. the therapist's share, are the same
  //    screen's arithmetic -- checked here rather than eyeballed.
  await page.goto("/admin/dashboard?section=money&tab=summary");
  await page.waitForLoadState("networkidle");
  await shot(page, "11-money-summary");
});

test("PL-UI-005 the patient sees what they owe, and can say they have paid", async ({ page }) => {
  // The first-visit tour sits over the dashboard and swallows clicks.
  await db.from("profiles").update({ onboarding_seen_at: new Date().toISOString() }).eq("id", patientId);

  await signIn(page, PATIENT_E);
  await page.goto("/patient/dashboard");
  await page.waitForLoadState("networkidle");
  const skip = page.getByRole("button", { name: /^Skip$/i });
  if (await skip.isVisible().catch(() => false)) await skip.click();
  await page.waitForTimeout(400);
  await shot(page, "12-patient-widget");

  // The feed must never scold a trusted patient for an arrangement the
  // clinic offered them.
  const feedText = (await page.textContent("body")) ?? "";
  expect(feedText).not.toContain("isn't booked until payment goes through");
  expect(feedText).toContain("Nothing to pay up front");

  await expect(page.getByText(/You owe so far/i)).toBeVisible();
  await expect(page.getByRole("button", { name: /I've already paid/i })).toBeVisible();

  // Declaring settles nothing: that is the whole rule.
  await page.getByRole("button", { name: /I've already paid/i }).click();
  await page.waitForTimeout(600);
  await shot(page, "13-declare-form");
  await page.getByRole("button", { name: /Tell the clinic/i }).click();

  await expect
    .poll(async () => {
      const { count } = await db
        .from("pay_later_payments")
        .select("id", { count: "exact", head: true })
        .eq("patient_id", patientId)
        .eq("status", "pending");
      return count ?? 0;
    }, { timeout: 60_000 })
    .toBe(1);

  await page.reload();
  await page.waitForLoadState("networkidle");
  await shot(page, "14-declared-being-checked");
  await expect(page.getByText(/checking your payment/i)).toBeVisible();

  // And the figure has not moved.
  const { data: still } = await db
    .from("appointments")
    .select("payment_status")
    .eq("id", bookedId)
    .single();
  expect(still!.payment_status).toBe("unpaid");

  // Their own session list is the other surface that used to print
  // `payment_status` raw: a delivered session on terms offered a Pay Now
  // button that `create-order` refuses outright, so it read wrong *and* led
  // nowhere. It reads the shared module now, in the patient's own voice.
  await page.goto("/patient/dashboard/sessions");
  await page.waitForLoadState("networkidle");
  await shot(page, "14b-patient-sessions");
  const past = page.getByRole("button", { name: /^Past$/i });
  if (await past.isVisible().catch(() => false)) {
    await past.click();
    await page.waitForTimeout(400);
    await shot(page, "14c-patient-sessions-past");
  }
  const sessionsText = (await page.textContent("body")) ?? "";
  expect(sessionsText).not.toContain("Pay Now");
  expect(sessionsText).toContain("Owed");
});

test("PL-UI-006 confirming the payment settles the session", async ({ page }) => {
  await signIn(page, QA_EMAILS.admin);
  await page.goto("/admin/dashboard?section=money&tab=owing");
  await page.waitForLoadState("networkidle");
  await shot(page, "15-settlement-queue");
  await expect(page.getByRole("heading", { name: /Payments waiting/i })).toBeVisible();

  // Every money figure must be identical either side of this.
  const before = await moneyFigures();

  await page.getByRole("button", { name: /Confirm it arrived/i }).first().click();
  await expect
    .poll(async () => {
      const { data } = await db
        .from("appointments")
        .select("payment_status,amount_paid_paise,pay_later_outcome")
        .eq("id", bookedId)
        .single();
      return data?.payment_status ?? null;
    }, { timeout: 60_000 })
    .toBe("paid");

  const { data: settled } = await db
    .from("appointments")
    .select("amount_paid_paise,amount_due_paise,pay_later_outcome,pay_later_payment_id")
    .eq("id", bookedId)
    .single();
  console.log("SETTLED ROW:", JSON.stringify(settled));
  // The whole safety case: the session is settled at its own frozen price,
  // never at the payment's share of it.
  expect(settled!.amount_paid_paise).toBe(settled!.amount_due_paise);
  expect(settled!.pay_later_outcome).toBe("settled");
  expect(settled!.pay_later_payment_id).toBeTruthy();

  const after = await moneyFigures();
  console.log("MONEY BEFORE:", JSON.stringify(before));
  console.log("MONEY AFTER: ", JSON.stringify(after));
  expect(after).toEqual(before);

  await page.reload();
  await page.waitForLoadState("networkidle");
  await shot(page, "16-after-settlement");
});

/** Book and deliver one more session on terms, through the real routes.
 *  The screens for booking are covered above; this is the fixture the two
 *  money-out journeys need, not a second test of the wizard. */
async function deliverAnotherSession(): Promise<string> {
  const patientCookie = await cookieHeaderFor(PATIENT_E);
  const adminCookie = await cookieHeaderFor(QA_EMAILS.admin);
  const post = (path: string, body: unknown, cookie: string) =>
    fetch(`${BASE}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie },
      body: JSON.stringify(body),
    });

  const created = await post(
    "/api/appointments/create",
    {
      categoryId,
      slotTime: wholeHourFromNow(36),
      timezone: "Asia/Kolkata",
      notes: "pay-later journey fixture",
    },
    patientCookie
  );
  const { appointmentId } = await created.json();
  expect(appointmentId).toBeTruthy();

  const confirmed = await post("/api/appointments/confirm-pay-later", { appointmentId }, patientCookie);
  expect(confirmed.status).toBe(200);
  await post("/api/admin/assign-appointment", { appointmentId, therapistId }, adminCookie);
  const done = await post("/api/appointments/complete-session", { appointmentId }, adminCookie);
  expect(done.status).toBe(200);
  return appointmentId as string;
}

test("PL-UI-007 writing a session off is a cost, and it can be undone", async ({ page }) => {
  const secondId = await deliverAnotherSession();

  const before = await moneyFigures();

  await signIn(page, QA_EMAILS.admin);
  await page.goto("/admin/dashboard?section=money&tab=owing");
  await page.waitForLoadState("networkidle");

  // Giving money away asks once more before it happens, through the app's own
  // ConfirmDialog rather than the browser's -- so there is no `page.on("dialog")`
  // to catch it, and a run that skipped the "Yes" looked exactly like a route
  // that had silently refused.
  await page.getByRole("button", { name: /^Write it off$/i }).first().click();
  await page.waitForTimeout(500);
  await page.getByLabel(/^Why$/i).fill("Moved away last year and has not been reachable since");
  await shot(page, "17-write-off-form");
  await page.getByRole("button", { name: /^Write it off$/i }).last().click();
  // The dialog's own button, not its message: "Stop chasing ₹2,499" is also
  // the form's own heading, so asserting the text matched before the dialog
  // had even opened.
  const confirmYes = page.getByRole("button", { name: /^Yes$/i });
  await expect(confirmYes).toBeVisible();
  await shot(page, "17b-write-off-confirm");
  await confirmYes.click();

  await expect
    .poll(async () => {
      const { data } = await db
        .from("appointments")
        .select("pay_later_outcome")
        .eq("id", secondId)
        .single();
      return data?.pay_later_outcome ?? null;
    }, { timeout: 60_000 })
    .toBe("written_off");

  // A write-off is a cost, not a revenue reduction: nothing the clinic
  // earned and nothing the therapist is owed may move.
  const after = await moneyFigures();
  console.log("WRITE-OFF BEFORE:", JSON.stringify(before), "AFTER:", JSON.stringify(after));
  expect(after).toEqual(before);

  // And the loss is recorded where a loss belongs.
  const { data: cost } = await db
    .from("business_expenses")
    .select("amount_paise,category,source_appointment_id")
    .eq("source_appointment_id", secondId)
    .maybeSingle();
  console.log("BAD DEBT ROW:", JSON.stringify(cost));
  expect(cost?.category).toBe("Bad debt");

  await page.reload();
  await page.waitForLoadState("networkidle");
  await shot(page, "18-written-off-listed");
  await expect(page.getByRole("heading", { name: /^Written off$/i })).toBeVisible();

  // The undo has to be a control, not a claim.
  await page.getByRole("button", { name: /Ask for it again/i }).first().click();
  await page.waitForTimeout(500);
  await page.getByLabel(/^Why$/i).fill("They have been back in touch and want to settle");
  await page.getByRole("button", { name: /Ask for it again/i }).last().click();
  // Reversing re-imposes a debt somebody was told was forgiven, so it asks too.
  const reverseYes = page.getByRole("button", { name: /^Yes$/i });
  await expect(reverseYes).toBeVisible();
  await reverseYes.click();

  await expect
    .poll(async () => {
      const { data } = await db
        .from("appointments")
        .select("pay_later_outcome")
        .eq("id", secondId)
        .single();
      return data?.pay_later_outcome;
    }, { timeout: 60_000 })
    .toBeNull();

  const { count: costsLeft } = await db
    .from("business_expenses")
    .select("id", { count: "exact", head: true })
    .eq("source_appointment_id", secondId);
  expect(costsLeft).toBe(0);
  await shot(page, "19-write-off-reversed");
});
