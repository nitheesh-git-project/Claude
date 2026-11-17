// Settings -> Emails (src/lib/emailControls.ts, src/lib/emailServer.ts): the
// master switch, test mode, the per-kind switches, "Send me a test email"
// and the send log.
//
// Only test addresses are ever used here (the QA accounts are
// @example.test), and the rules never mail a test address, so this spec
// cannot send a real email even against a server where Resend is set up.
// The switches are restored to what they were before the spec ran, so a
// staging project left in test mode stays in test mode.
import { test, expect, type Page } from "@playwright/test";
import { BASE, QA_EMAILS, adminClient, browserCookiesFor, cookieHeaderFor } from "./helpers";

test.describe.configure({ mode: "serial" });

const db = adminClient();
const SEEN = { timeout: 60_000 };
let saved: { sending_enabled: boolean; test_inbox: string | null; disabled_kinds: string[] } | null = null;

async function controls() {
  const { data } = await db.from("email_controls").select("sending_enabled, test_inbox, disabled_kinds").eq("id", 1).single();
  return data as { sending_enabled: boolean; test_inbox: string | null; disabled_kinds: string[] };
}

async function post(path: string, email: string, data: unknown) {
  return fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: await cookieHeaderFor(email) },
    body: typeof data === "string" ? data : JSON.stringify(data),
  });
}

async function openEmails(page: Page) {
  await page.context().addCookies(await browserCookiesFor(QA_EMAILS.admin));
  await page.goto(`${BASE}/admin/dashboard?section=settings&tab=emails`, { waitUntil: "domcontentloaded" });
  const screen = page.getByTestId("email-controls").filter({ visible: true });
  await expect(screen).toBeVisible(SEEN);
  return screen;
}

test.beforeAll(async () => {
  saved = await controls();
  await db.from("email_controls").update({ sending_enabled: true, test_inbox: null, disabled_kinds: [] }).eq("id", 1);
});

test.afterAll(async () => {
  if (saved) await db.from("email_controls").update(saved).eq("id", 1);
});

test("EML-001: the routes refuse other roles, a bad body and a test address as the test inbox", async () => {
  for (const email of [QA_EMAILS.patientA, QA_EMAILS.therapistA]) {
    expect((await post("/api/admin/email/settings", email, { sendingEnabled: false })).status).toBe(403);
    expect((await post("/api/admin/email/test", email, {})).status).toBe(403);
  }
  expect((await post("/api/admin/email/settings", QA_EMAILS.admin, "{not json")).status).toBe(400);
  expect((await post("/api/admin/email/settings", QA_EMAILS.admin, { sendingEnabled: false, testInbox: null })).status).toBe(400);
  const testInbox = await post("/api/admin/email/settings", QA_EMAILS.admin, { testInbox: "qa.inbox@example.test" });
  expect(testInbox.status).toBe(400);
  expect((await testInbox.json()).error).toMatch(/never receives mail/);
  expect((await post("/api/admin/email/settings", QA_EMAILS.admin, { kind: "test", enabled: false })).status).toBe(400);
  expect((await controls()).test_inbox).toBeNull();
});

test("EML-002: the master switch and test mode save from the screen and are logged", async ({ page }) => {
  const startedAt = new Date().toISOString();
  const screen = await openEmails(page);
  await screen.getByRole("switch", { name: "Send emails" }).click();
  await expect.poll(async () => (await controls()).sending_enabled, SEEN).toBe(false);
  await expect(screen.getByText(/Off\. Nothing is sent except/)).toBeVisible(SEEN);

  // A real-looking inbox is accepted (nothing is sent by saving it).
  await screen.getByLabel("Test inbox").fill("owner.inbox@gmail.com");
  await screen.getByRole("button", { name: "Save" }).click();
  await expect.poll(async () => (await controls()).test_inbox, SEEN).toBe("owner.inbox@gmail.com");
  await screen.getByRole("button", { name: "Turn off test mode" }).click();
  await expect.poll(async () => (await controls()).test_inbox, SEEN).toBeNull();

  await screen.getByRole("switch", { name: "Send emails" }).click();
  await expect.poll(async () => (await controls()).sending_enabled, SEEN).toBe(true);

  // Off, test inbox on, test inbox off, on: four audit rows.
  const { data: log } = await db.from("admin_activity_log").select("action").eq("action", "email_controls.set").gte("created_at", startedAt);
  expect((log ?? []).length).toBe(4);
});

test("EML-003: switching off the legal receipts asks first, and Keep sending changes nothing", async ({ page }) => {
  const screen = await openEmails(page);
  await screen.locator('[data-email-kind="legal"]').getByRole("switch").click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("the law expects one", SEEN);
  await dialog.getByRole("button", { name: "Keep sending" }).click();
  expect((await controls()).disabled_kinds).toEqual([]);
});

test("EML-004: Send me a test email never mails a test address, and the log shows why", async ({ page }) => {
  const screen = await openEmails(page);
  await screen.getByRole("button", { name: "Send me a test email" }).click();
  await expect(screen.getByTestId("email-test-result")).toContainText("Test address - never sent", SEEN);
  await page.reload();
  const again = page.getByTestId("email-controls").filter({ visible: true });
  const row = again.getByTestId("email-log").locator("tr", { hasText: "Test email from" }).first();
  await expect(row).toContainText("Not sent", SEEN);
  await expect(row).toContainText("qa***@example.test");
});
