// BX: the way out of the booking wizard never offers a waiting screen.
//
// Driven as a screen because nothing here changes a route or a row -- the
// account, the appointment and every API answer are identical either way, and
// the whole bug was one label on one control.
//
// The bug: a patient who signs up *inside* the wizard is unapproved by
// construction (create-order flips `approved` on a genuine payment attempt,
// precisely so they land in their dashboard rather than on a waiting screen).
// Between Step 2 creating the account and Step 3 taking the payment, the exit
// link read "Approval pending" -- telling somebody their account is awaiting
// approval at the exact moment they are about to pay, and offering as its only
// way out a dead end that abandons the booking.
import { test, expect } from "@playwright/test";
import { BASE, browserCookiesFor, QA_EMAILS, adminClient, profileIdFor } from "./helpers";

test("BX-001: an unapproved patient mid-booking is not sent to the waiting screen", async ({
  page,
  context,
}) => {
  const admin = adminClient();
  const patientId = await profileIdFor(admin, QA_EMAILS.patientA);

  // Exactly the state the wizard creates for itself: signed in, account real,
  // not yet approved because nothing has been paid.
  const { data: before } = await admin
    .from("profiles")
    .select("approved")
    .eq("id", patientId)
    .single();
  await admin.from("profiles").update({ approved: false }).eq("id", patientId);

  try {
    await context.addCookies(await browserCookiesFor(QA_EMAILS.patientA));
    await page.goto(`${BASE}/book`);

    const exit = page.getByRole("link", { name: /Back to|Approval|suspended/i }).first();
    await expect(exit).toBeVisible();

    // The assertion that matters, stated in the negative because the bug was a
    // label rather than a missing control.
    await expect(exit).not.toHaveText(/Approval pending/i);
    await expect(exit).not.toHaveAttribute("href", /pending-approval/);
    await expect(exit).toHaveText(/Back to/i);
  } finally {
    await admin
      .from("profiles")
      .update({ approved: before?.approved ?? true })
      .eq("id", patientId);
  }
});

test("BX-002: an approved patient is still offered their dashboard", async ({ page, context }) => {
  // The other half: dropping the waiting screen must not drop the signed-in
  // destination with it. A patient who came from their own dashboard to book
  // is the commonest case by far, and sending them to the marketing site puts
  // it between them and the screen they started on.
  const admin = adminClient();
  const patientId = await profileIdFor(admin, QA_EMAILS.patientA);
  await admin.from("profiles").update({ approved: true }).eq("id", patientId);

  await context.addCookies(await browserCookiesFor(QA_EMAILS.patientA));
  await page.goto(`${BASE}/book`);

  const exit = page.getByRole("link", { name: /Back to/i }).first();
  await expect(exit).toHaveText(/Back to Dashboard/i);
  await expect(exit).toHaveAttribute("href", /dashboard/);
});
