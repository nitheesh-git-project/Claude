// DEV: the developer credit under the footer, its "Say hello" flow, and the
// Master-Admin-only Dev Reachouts screen that reads what it collects.
//
// Three things are held here, and each has a reason to be driven in a browser
// rather than only unit tested (`devReachout.test.ts` holds the rules):
//
//   - the flow itself -- footer link -> Say hello -> Let's talk -> a row, with
//     native validation on an empty submit and the success line after;
//   - the admin screen -- marking a reachout contacted and saving a note, and
//     that both land in the database;
//   - the master switch -- the confirm dialog on BOTH directions, that
//     cancelling changes nothing, and that the footer line and the pages
//     follow the switch.
//
// Every row this makes carries E2E_MARKERS.devReachoutName and is deleted in a
// finally, and both settings are put back as they were found.
import { test, expect, type Page } from "@playwright/test";
import { BASE, browserCookiesFor, QA_EMAILS, adminClient, E2E_MARKERS } from "./helpers";

const NAME = E2E_MARKERS.devReachoutName;
const SCREEN = `${BASE}/admin/dashboard?section=settings&tab=reachouts`;

/** Only what is on screen: AdminShell keeps every screen mounted behind
 *  `hidden`, so a bare locator matches controls on screens nobody opened. */
function onScreen(page: Page, text: string | RegExp) {
  return page.getByText(text).filter({ visible: true });
}

async function readDevSettings() {
  const { data } = await adminClient()
    .from("site_settings")
    .select("dev_contact_enabled, dev_contact_email")
    .maybeSingle();
  return {
    enabled: (data?.dev_contact_enabled as boolean | undefined) ?? true,
    email: (data?.dev_contact_email as string | undefined) ?? "",
  };
}

async function writeDevSettings(values: { enabled?: boolean; email?: string }) {
  const patch: Record<string, unknown> = {};
  if (values.enabled !== undefined) patch.dev_contact_enabled = values.enabled;
  if (values.email !== undefined) patch.dev_contact_email = values.email;
  await adminClient().from("site_settings").update(patch).not("id", "is", null);
}

async function deleteFixtures() {
  await adminClient().from("dev_reachouts").delete().like("name", `${NAME}%`);
}

test.describe("DEV -- the developer credit and its reachouts", () => {
  test("DEV-001: footer -> Say hello -> Let's talk -> a row in the database", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const original = await readDevSettings();
    await writeDevSettings({ enabled: true, email: "" });
    await deleteFixtures();
    try {
      // The credit sits under the copyright on a public page.
      await page.goto(`${BASE}/faq`, { waitUntil: "domcontentloaded" });
      const credit = page.getByRole("contentinfo");
      await expect(credit).toContainText("Nitheesh M");
      await credit.getByRole("link", { name: "Contact me" }).click();

      await expect(page).toHaveURL(/\/developer$/);
      await expect(page.getByRole("heading", { name: "Say hello!" })).toBeVisible();
      // The page stands alone: no site nav, no footer, one way out.
      await expect(page.getByRole("navigation")).toHaveCount(0);
      await expect(page.getByRole("contentinfo")).toHaveCount(0);
      await expect(page.getByRole("link", { name: "Back to home" })).toHaveCount(1);
      await page.getByRole("link", { name: "Say hey!" }).click();

      await expect(page).toHaveURL(/\/developer\/lets-talk$/);
      await expect(page.getByRole("heading", { name: /Let's build something/ })).toBeVisible();
      await expect(page.getByRole("navigation")).toHaveCount(0);
      await expect(page.getByRole("contentinfo")).toHaveCount(0);
      await expect(page.getByRole("link", { name: "Back to home" })).toHaveCount(1);
      // No address is committed, so while the setting is blank the row is gone.
      await expect(page.getByText("Prefer email?")).toHaveCount(0);

      // An empty submit stops at the browser's own validation: nothing is
      // sent, and the form is still there.
      const submit = page.getByRole("button", { name: /Let's talk/ });
      await submit.click();
      await expect(page).toHaveURL(/\/developer\/lets-talk$/);
      await expect(page.getByLabel("Full name*")).toBeFocused();

      await page.getByLabel("Full name*").fill(`${NAME} Visitor`);
      await page.getByLabel("Email*").fill("e2e-dev-reachout@example.com");
      await page.getByLabel("Message*").fill("Hello from the e2e suite.\nSecond line.");
      await submit.click();

      await expect(page.getByText(/Nitheesh will be reaching you shortly/)).toBeVisible({
        timeout: 30_000,
      });
      await expect(page.getByText("Thanks, E2E.")).toBeVisible();

      const { data } = await adminClient()
        .from("dev_reachouts")
        .select("name, email, phone, message, status")
        .like("name", `${NAME}%`);
      expect(data).toHaveLength(1);
      expect(data![0]).toMatchObject({
        email: "e2e-dev-reachout@example.com",
        phone: null,
        status: "new",
      });
      expect(data![0].message).toContain("Second line.");

      // With an address published, the row appears and is a mailto link.
      await writeDevSettings({ email: "hello@example.com" });
      await page.goto(`${BASE}/developer/lets-talk`, { waitUntil: "domcontentloaded" });
      await expect(page.getByRole("link", { name: "hello@example.com" })).toHaveAttribute(
        "href",
        "mailto:hello@example.com"
      );
    } finally {
      await deleteFixtures();
      await writeDevSettings({ enabled: original.enabled, email: original.email });
    }
  });

  test("DEV-002: a filled honeypot is answered as a success and writes nothing", async ({
    request,
  }) => {
    const original = await readDevSettings();
    await writeDevSettings({ enabled: true });
    await deleteFixtures();
    try {
      const res = await request.post(`${BASE}/api/developer/reachout`, {
        data: {
          name: `${NAME} Bot`,
          email: "bot@example.com",
          message: "buy things",
          website: "http://spam.example",
        },
      });
      expect(res.status()).toBe(200);
      expect(await res.json()).toEqual({ success: true });
      const { data } = await adminClient()
        .from("dev_reachouts")
        .select("id")
        .like("name", `${NAME}%`);
      expect(data).toHaveLength(0);

      // A body that is not JSON is a 400, not a 500.
      const bad = await request.post(`${BASE}/api/developer/reachout`, {
        headers: { "Content-Type": "application/json" },
        data: "{not json",
      });
      expect(bad.status()).toBe(400);
    } finally {
      await deleteFixtures();
      await writeDevSettings({ enabled: original.enabled });
    }
  });

  test("DEV-003: the admin marks a reachout contacted and keeps a dated thread of notes", async ({
    page,
    context,
  }) => {
    // Every action fires a router.refresh() of the whole admin dashboard.
    test.setTimeout(240_000);
    await deleteFixtures();
    const { data: seeded, error: seedError } = await adminClient()
      .from("dev_reachouts")
      .insert({
        name: `${NAME} Triage`,
        email: "triage@example.com",
        phone: "+919876543210",
        message: "Please add a dark mode.",
      })
      .select("id")
      .single();
    expect(seedError).toBeNull();
    const id = seeded!.id as string;

    try {
      await context.addCookies(await browserCookiesFor(QA_EMAILS.admin));
      await page.goto(SCREEN, { waitUntil: "domcontentloaded" });
      await expect(page.locator("h1")).toContainText("Settings", { timeout: 60_000 });

      const card = page
        .locator("li")
        .filter({ hasText: `${NAME} Triage` })
        .filter({ visible: true });
      await expect(card).toBeVisible({ timeout: 60_000 });
      await expect(card.getByRole("link", { name: "triage@example.com" })).toHaveAttribute(
        "href",
        "mailto:triage@example.com"
      );
      await expect(card.getByRole("link", { name: "+919876543210" })).toHaveAttribute(
        "href",
        "tel:+919876543210"
      );
      await expect(card).toContainText("Please add a dark mode.");

      // Notes are a dated thread: each save adds one below the last, with
      // its own time and author, and each can be edited or deleted.
      const notes = () =>
        adminClient()
          .from("dev_reachout_notes")
          .select("id, body, author_id, edited_at")
          .eq("reachout_id", id)
          .order("created_at", { ascending: true });
      const thread = card.getByRole("list", { name: `Notes on ${NAME} Triage` });

      await card.getByLabel("Add a note").fill("Replied by email on the 3rd.");
      await card.getByRole("button", { name: "Save note" }).click();
      await expect(thread.getByRole("listitem")).toHaveCount(1, { timeout: 60_000 });
      // The composer clears, ready for the next note.
      await expect(card.getByLabel("Add a note")).toHaveValue("");
      await card.getByLabel("Add a note").fill("Call booked for Friday.");
      await card.getByRole("button", { name: "Save note" }).click();
      await expect(thread.getByRole("listitem")).toHaveCount(2, { timeout: 60_000 });
      await expect(thread.getByRole("listitem").nth(1)).toContainText("Call booked for Friday.");
      // Each note carries its date and time, in the clinic's zone.
      await expect(thread.getByRole("listitem").first()).toContainText(/\d{4}, \d{1,2}:\d{2}/);
      await expect
        .poll(async () => ((await notes()).data ?? []).map((n) => n.body), { timeout: 60_000 })
        .toEqual(["Replied by email on the 3rd.", "Call booked for Friday."]);
      expect(((await notes()).data ?? []).every((n) => n.author_id !== null)).toBe(true);

      // Edit the first: it keeps its place and says it was edited.
      const first = thread.getByRole("listitem").first();
      await first.getByRole("button", { name: "Edit" }).click();
      await first.getByLabel("Edit note").fill("Replied by email on the 4th.");
      await first.getByRole("button", { name: "Save", exact: true }).click();
      await expect(first).toContainText("Replied by email on the 4th.", { timeout: 60_000 });
      await expect(first).toContainText("edited");
      await expect
        .poll(async () => (await notes()).data?.[0]?.edited_at ?? null, { timeout: 60_000 })
        .not.toBeNull();

      // Delete the second, behind a confirm.
      await thread.getByRole("listitem").nth(1).getByRole("button", { name: "Delete" }).click();
      await page.getByRole("alertdialog").getByRole("button", { name: "Yes" }).click();
      await expect(thread.getByRole("listitem")).toHaveCount(1, { timeout: 60_000 });
      await expect
        .poll(async () => ((await notes()).data ?? []).length, { timeout: 60_000 })
        .toBe(1);

      await card.getByRole("button", { name: "Mark as contacted" }).click();
      await expect
        .poll(
          async () =>
            (
              await adminClient()
                .from("dev_reachouts")
                .select("status, contacted_at, contacted_by")
                .eq("id", id)
                .single()
            ).data,
          { timeout: 60_000 }
        )
        .toMatchObject({ status: "contacted" });
      const { data: row } = await adminClient()
        .from("dev_reachouts")
        .select("contacted_at, contacted_by")
        .eq("id", id)
        .single();
      expect(row?.contacted_at).not.toBeNull();
      expect(row?.contacted_by).not.toBeNull();

      // And back again clears who and when.
      await expect(card.getByRole("button", { name: "Move back to new" })).toBeVisible({
        timeout: 60_000,
      });
      await card.getByRole("button", { name: "Move back to new" }).click();
      await expect
        .poll(
          async () =>
            (
              await adminClient()
                .from("dev_reachouts")
                .select("status, contacted_at, contacted_by")
                .eq("id", id)
                .single()
            ).data,
          { timeout: 60_000 }
        )
        .toEqual({ status: "new", contacted_at: null, contacted_by: null });

      // The audit trail names the change and never the note's text.
      const { data: log } = await adminClient()
        .from("admin_activity_log")
        .select("action, details")
        .eq("target_id", id)
        .in("action", [
          "dev_reachout.update_status",
          "dev_reachout.add_note",
          "dev_reachout.edit_note",
          "dev_reachout.delete_note",
        ]);
      const actions = new Set((log ?? []).map((l) => l.action));
      expect(actions).toEqual(
        new Set([
          "dev_reachout.update_status",
          "dev_reachout.add_note",
          "dev_reachout.edit_note",
          "dev_reachout.delete_note",
        ])
      );
      expect(JSON.stringify(log)).not.toMatch(/Replied by email|Call booked/);
    } finally {
      await deleteFixtures();
    }
  });

  test("DEV-004: the switch asks on both directions, and the credit follows it", async ({
    page,
    context,
    request,
  }) => {
    test.setTimeout(300_000);
    const original = await readDevSettings();
    await writeDevSettings({ enabled: true });
    try {
      await context.addCookies(await browserCookiesFor(QA_EMAILS.admin));
      await page.goto(SCREEN, { waitUntil: "domcontentloaded" });
      await expect(page.locator("h1")).toContainText("Settings", { timeout: 60_000 });

      const toggle = page
        .getByRole("switch", { name: /Show the developer credit/ })
        .filter({ visible: true });
      await expect(toggle).toHaveAttribute("aria-checked", "true", { timeout: 60_000 });

      // --- Disable: cancelling leaves it exactly as it was. ---
      await toggle.click();
      const dialog = page.getByRole("alertdialog");
      await expect(dialog).toContainText("Hide the developer credit?");
      await dialog.getByRole("button", { name: "No" }).click();
      await expect(dialog).toHaveCount(0);
      await expect(toggle).toHaveAttribute("aria-checked", "true");
      expect((await readDevSettings()).enabled).toBe(true);

      // --- Disable: confirming saves it, and the door closes. ---
      await toggle.click();
      await expect(dialog).toContainText("Hide the developer credit?");
      await dialog.getByRole("button", { name: "Yes" }).click();
      await expect.poll(async () => (await readDevSettings()).enabled, { timeout: 60_000 }).toBe(
        false
      );
      await expect(onScreen(page, /Developer credit is now hidden/)).toBeVisible({
        timeout: 60_000,
      });
      expect((await request.get(`${BASE}/developer`)).status()).toBe(404);
      expect((await request.get(`${BASE}/developer/lets-talk`)).status()).toBe(404);
      const closed = await request.post(`${BASE}/api/developer/reachout`, {
        data: { name: `${NAME} Closed`, email: "a@b.co", message: "hi" },
      });
      expect(closed.status()).toBe(404);
      await expect
        .poll(async () => (await (await request.get(`${BASE}/faq`)).text()).includes("Nitheesh M"), {
          timeout: 60_000,
        })
        .toBe(false);

      // --- Enable: the same two steps, and the credit comes back. ---
      await expect(toggle).toHaveAttribute("aria-checked", "false", { timeout: 60_000 });
      await toggle.click();
      await expect(dialog).toContainText("Show the developer credit?");
      await dialog.getByRole("button", { name: "No" }).click();
      await expect(toggle).toHaveAttribute("aria-checked", "false");
      expect((await readDevSettings()).enabled).toBe(false);

      await toggle.click();
      await dialog.getByRole("button", { name: "Yes" }).click();
      await expect.poll(async () => (await readDevSettings()).enabled, { timeout: 60_000 }).toBe(
        true
      );
      expect((await request.get(`${BASE}/developer`)).status()).toBe(200);
      await expect
        .poll(async () => (await (await request.get(`${BASE}/faq`)).text()).includes("Nitheesh M"), {
          timeout: 60_000,
        })
        .toBe(true);

      // --- The address: saved explicitly, blank hides the row again. ---
      const emailBox = page.getByLabel("Email shown on the Let's talk page").filter({ visible: true });
      await emailBox.fill("not an email");
      await page.getByRole("button", { name: "Save", exact: true }).filter({ visible: true }).click();
      await expect(onScreen(page, /valid email address/)).toBeVisible();
      await emailBox.fill("dev@example.com");
      await page.getByRole("button", { name: "Save", exact: true }).filter({ visible: true }).click();
      await expect
        .poll(async () => (await readDevSettings()).email, { timeout: 60_000 })
        .toBe("dev@example.com");
    } finally {
      await writeDevSettings({ enabled: original.enabled, email: original.email });
    }
  });
});
