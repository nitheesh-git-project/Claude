// ADMIN-DELETE: deleting an account that has nothing behind it.
//
// Two bugs met on this button and both ended in the same sentence -- "the
// database refused to delete that account and did not say why" -- which is the
// route's fallback for "something points at it that this screen did not
// count".
//
// 1. **No admin account could be deleted at all.**
//    `profiles_keep_one_master_admin` had no `security definer`, so it ran as
//    whoever issued the statement. `auth.admin.deleteUser` runs as GoTrue's
//    own role, which cannot SELECT `public.profiles`, so the guard's count was
//    refused and took the whole cascade with it. Patients and therapists were
//    unaffected, because the guard returns before that count when the
//    statement removed no Master Admin -- which is exactly why it read as a
//    data problem.
// 2. **22 of the 35 blocking foreign keys were not counted.** The route kept a
//    hand-written probe list; it covered 13. For the rest the screen offered a
//    delete the database then refused, unexplained.
//
// Driven as screens because both failures are invisible to a unit test: the
// first one only happens inside GoTrue's own cascade, and the second is about
// which sentence a person reads.
import { test, expect, type Page } from "@playwright/test";
import { BASE, browserCookiesFor, QA_EMAILS, adminClient } from "./helpers";

const SLOW = 240_000;
const MARKER = "ZZ QA delete";

type Admin = ReturnType<typeof adminClient>;

async function makeAccount(admin: Admin, label: string, patch?: Record<string, unknown>) {
  const email = `zz.qa.delete.${Date.now()}.${Math.random().toString(36).slice(2, 7)}@example.test`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: "QaTest!2024pass",
    email_confirm: true,
    user_metadata: { full_name: `${MARKER} ${label}` },
  });
  expect(error, `seeding ${label}: ${error?.message ?? ""}`).toBeFalsy();
  const id = data?.user?.id;
  expect(id, `seeded ${label} has an id`).toBeTruthy();
  await admin
    .from("profiles")
    .update({ approved: true, active: true, ...(patch ?? {}) })
    .eq("id", id!);
  return id!;
}

async function stillExists(admin: Admin, id: string) {
  const { data } = await admin.from("profiles").select("id").eq("id", id).maybeSingle();
  return !!data;
}

/** Removes the account however it has to be, so a failed assertion never
 *  leaves a fixture login behind. */
async function cleanUp(admin: Admin, id: string) {
  await admin.auth.admin.deleteUser(id).catch(() => {});
  if (await stillExists(admin, id)) {
    await admin.from("profiles").delete().eq("id", id);
    await admin.auth.admin.deleteUser(id).catch(() => {});
  }
}

async function openDashboard(page: Page, url: string) {
  await page.goto(url);
  await page
    .waitForFunction(() => !document.documentElement.hasAttribute("data-splash"), null, {
      timeout: 30_000,
    })
    .catch(() => {});
  await page.waitForLoadState("networkidle");
}

/** The back-office directory pages its rows, so a freshly created account
 *  can land on page two and read as missing. Widen the page rather than
 *  clicking Next until it appears -- the assertion is about the delete, not
 *  about where the row happened to fall. */
async function showEveryRow(page: Page, plural: string) {
  const size = page.getByLabel(`How many ${plural} to show per page`);
  if (await size.count()) {
    await size.first().fill("100");
    await size.first().blur();
    await page.waitForTimeout(300);
  }
}

async function pressDelete(page: Page) {
  const open = page.locator("button:visible", { hasText: "Delete account" }).first();
  await expect(open).toBeVisible({ timeout: 60_000 });
  await open.scrollIntoViewIfNeeded();
  await open.click();
  const confirm = page.locator("button:visible", { hasText: "Delete permanently" }).first();
  await expect(confirm).toBeVisible();
  await confirm.click();
}

test.describe("deleting an account", () => {
  test("AD-DEL-001: an admin account with no history is deleted", async ({ page, context }) => {
    test.setTimeout(SLOW);
    const admin = adminClient();
    // The case that could never succeed: role admin, so the Master Admin
    // guard runs its count inside GoTrue's cascade.
    const id = await makeAccount(admin, "admin", {
      role: "admin",
      admin_scope: "full",
    });

    try {
      await context.addCookies(await browserCookiesFor(QA_EMAILS.admin));
      await openDashboard(page, `${BASE}/admin/dashboard?section=settings&tab=access`);

      await showEveryRow(page, "admins");
      const row = page.locator("li:visible").filter({ hasText: `${MARKER} admin` }).first();
      await expect(row).toBeVisible({ timeout: 60_000 });
      await row.scrollIntoViewIfNeeded();
      await row.locator("button", { hasText: "Delete account" }).first().click();
      const confirm = page.locator("button:visible", { hasText: "Delete permanently" }).first();
      await expect(confirm).toBeVisible();
      await confirm.click();

      // The screen says it is gone, and the database agrees. Both, because
      // GoTrue reporting success is not the same as the row being gone --
      // which is the distinction the route re-reads the profile for.
      //
      // Scoped to the dialog: every admin screen stays mounted behind
      // `hidden`, and the activity feed on another screen carries the words
      // "Deleted an account" the moment this succeeds.
      await expect(
        page.locator("[role='dialog']:visible").filter({ hasText: "Account deleted" }).first()
      ).toBeVisible({ timeout: 60_000 });
      await expect
        .poll(() => stillExists(admin, id), { timeout: 30_000 })
        .toBe(false);
      await page.screenshot({ path: "/tmp/delete-01-admin-gone.png" });
    } finally {
      await cleanUp(admin, id);
    }
  });

  test("AD-DEL-002: a therapist account with no history is deleted from their profile", async ({
    page,
    context,
  }) => {
    test.setTimeout(SLOW);
    const admin = adminClient();
    const id = await makeAccount(admin, "therapist", { role: "therapist" });

    try {
      await context.addCookies(await browserCookiesFor(QA_EMAILS.admin));
      await openDashboard(page, `${BASE}/admin/dashboard/therapists/${id}`);
      await pressDelete(page);

      await expect
        .poll(() => stillExists(admin, id), { timeout: 60_000 })
        .toBe(false);
      await page.screenshot({ path: "/tmp/delete-02-therapist-gone.png" });
    } finally {
      await cleanUp(admin, id);
    }
  });

  test("AD-DEL-003: an account with history is refused by name, never 'did not say why'", async ({
    page,
    context,
  }) => {
    test.setTimeout(SLOW);
    const admin = adminClient();
    const id = await makeAccount(admin, "held", { role: "admin", admin_scope: "full" });
    // The note hangs off a therapist this spec creates, never a seeded one:
    // `therapist_admin_notes` is keyed on the therapist, so writing to an
    // existing row would overwrite a real note and a real issued password,
    // and removing it afterwards would take them with it.
    const noteTherapist = await makeAccount(admin, "note-holder", { role: "therapist" });

    // `therapist_admin_notes.updated_by` is one of the 22 blocking foreign
    // keys the old probe list never counted, so this is the exact shape that
    // produced the unexplained refusal.
    const { error: noteError } = await admin
      .from("therapist_admin_notes")
      .upsert({ therapist_id: noteTherapist, updated_by: id });
    expect(noteError, `seeding the note: ${noteError?.message ?? ""}`).toBeFalsy();

    try {
      await context.addCookies(await browserCookiesFor(QA_EMAILS.admin));
      await openDashboard(page, `${BASE}/admin/dashboard?section=settings&tab=access`);

      await showEveryRow(page, "admins");
      const row = page.locator("li:visible").filter({ hasText: `${MARKER} held` }).first();
      await expect(row).toBeVisible({ timeout: 60_000 });
      await row.scrollIntoViewIfNeeded();
      await row.locator("button", { hasText: "Delete account" }).first().click();
      const confirm = page.locator("button:visible", { hasText: "Delete permanently" }).first();
      await expect(confirm).toBeVisible();
      await confirm.click();

      const refusal = page.locator("text=/Not deleted/i").first();
      await expect(refusal).toBeVisible({ timeout: 60_000 });
      const panel = page.locator("[role='dialog']:visible").first();
      // It names what is holding it and offers the real alternative...
      await expect(panel).toContainText(/back-office action/i);
      await expect(panel).toContainText(/Suspend/i);
      // ...rather than the fallback that means "the list was out of date".
      await expect(panel).not.toContainText(/did not say why/i);
      // And nothing was removed.
      expect(await stillExists(admin, id)).toBe(true);
      await page.screenshot({ path: "/tmp/delete-03-refused-by-name.png" });
    } finally {
      // The note row cascades away with the therapist it is keyed on, so
      // removing that account first clears the reference holding the admin.
      await cleanUp(admin, noteTherapist);
      await cleanUp(admin, id);
    }
  });
});
