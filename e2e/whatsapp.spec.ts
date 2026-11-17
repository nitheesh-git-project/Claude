// WhatsApp, built and switched off (src/lib/whatsappRules.ts,
// whatsappServer.ts): a patient's consent, the admin's switches, and the
// webhook that turns a STOP reply into a withdrawn consent.
//
// Nothing here can send a message: the quality gate sets the webhook's two
// values (WHATSAPP_APP_SECRET, WHATSAPP_VERIFY_TOKEN, per run) but never
// WHATSAPP_ACCESS_TOKEN, so the app has WhatsApp "not set up", and the
// fixtures are @example.test accounts, which the rules never message.
// The switches are restored to what they were before the spec ran.
import crypto from "node:crypto";
import { test, expect } from "@playwright/test";
import { BASE, QA_EMAILS, adminClient, browserCookiesFor, cookieHeaderFor, createFixtureAccount, deleteFixtureAccount } from "./helpers";

test.describe.configure({ mode: "serial" });

const db = adminClient();
const SEEN = { timeout: 60_000 };
const APP_SECRET = process.env.WHATSAPP_APP_SECRET ?? "";
const VERIFY = process.env.WHATSAPP_VERIFY_TOKEN ?? "";
// A fictional Indian mobile number, different every run, so the STOP lookup
// can only match this spec's own fixture.
const DIGITS = `9${String(Math.floor(Math.random() * 1e9)).padStart(9, "0")}`;
const PHONE = `+91 ${DIGITS.slice(0, 5)} ${DIGITS.slice(5)}`;

let patient: { id: string; email: string } | undefined;
let noPhone: { id: string; email: string } | undefined;
let saved: Record<string, unknown> | null = null;

async function post(path: string, email: string | null, data: unknown, headers: Record<string, string> = {}) {
  return fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(email ? { Cookie: await cookieHeaderFor(email) } : {}), ...headers },
    body: typeof data === "string" ? data : JSON.stringify(data),
  });
}

async function choices(id: string) {
  const { data } = await db.from("whatsapp_consents").select("choice, source").eq("patient_id", id).order("created_at", { ascending: true });
  return data ?? [];
}

test.beforeAll(async () => {
  patient = await createFixtureAccount("whatsapp consent", { phone: PHONE });
  noPhone = await createFixtureAccount("whatsapp no phone", { phone: null });
  const { data } = await db.from("whatsapp_controls").select("sending_enabled, test_number, disabled_kinds").eq("id", 1).single();
  saved = data;
});

test.afterAll(async () => {
  if (saved) await db.from("whatsapp_controls").update(saved).eq("id", 1);
  await deleteFixtureAccount(noPhone?.id);
});

test("WA-001: a patient says yes and no; the choices are kept, append-only, and only a patient with a number can say yes", async () => {
  expect((await post("/api/patient/whatsapp-consent", null, { granted: true })).status).toBe(401);
  expect((await post("/api/patient/whatsapp-consent", QA_EMAILS.therapistA, { granted: true })).status).toBe(403);
  expect((await post("/api/patient/whatsapp-consent", patient!.email, "{not json")).status).toBe(400);

  const none = await post("/api/patient/whatsapp-consent", noPhone!.email, { granted: true });
  expect(none.status).toBe(409);
  expect((await none.json()).code).toBe("no_number");

  const yes = await post("/api/patient/whatsapp-consent", patient!.email, { granted: true });
  expect(yes.status, await yes.clone().text()).toBe(200);
  expect(await yes.json()).toMatchObject({ granted: true, unchanged: false });
  expect((await (await post("/api/patient/whatsapp-consent", patient!.email, { granted: true })).json()).unchanged).toBe(true);
  expect((await post("/api/patient/whatsapp-consent", patient!.email, { granted: false })).status).toBe(200);
  expect(await choices(patient!.id)).toEqual([
    { choice: "granted", source: "profile" },
    { choice: "withdrawn", source: "profile" },
  ]);

  // Append-only: even the service role cannot rewrite or remove a choice.
  const { error: rewrite } = await db.from("whatsapp_consents").update({ choice: "granted" }).eq("patient_id", patient!.id);
  expect(rewrite?.message).toMatch(/append-only/);
  const { error: remove } = await db.from("whatsapp_consents").delete().eq("patient_id", patient!.id);
  expect(remove?.message).toMatch(/append-only/);
});

test("WA-002: the webhook checks Meta's token and signature, and a STOP reply withdraws consent", async () => {
  test.skip(!APP_SECRET || !VERIFY, "WHATSAPP_APP_SECRET / WHATSAPP_VERIFY_TOKEN are set per run by the quality gate");
  // Meta's subscription check.
  const ok = await fetch(`${BASE}/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=${encodeURIComponent(VERIFY)}&hub.challenge=12345`);
  expect(ok.status).toBe(200);
  expect(await ok.text()).toBe("12345");
  expect((await fetch(`${BASE}/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=1`)).status).toBe(403);

  // Say yes again, then reply STOP.
  expect((await post("/api/patient/whatsapp-consent", patient!.email, { granted: true })).status).toBe(200);
  const body = JSON.stringify({
    object: "whatsapp_business_account",
    entry: [{ changes: [{ value: { messages: [{ from: `91${DIGITS}`, type: "text", text: { body: "STOP" } }] } }] }],
  });
  const sign = (b: string) => `sha256=${crypto.createHmac("sha256", APP_SECRET).update(b).digest("hex")}`;

  // A forged or missing signature changes nothing.
  expect((await post("/api/whatsapp/webhook", null, body, { "X-Hub-Signature-256": "sha256=deadbeef" })).status).toBe(403);
  expect((await post("/api/whatsapp/webhook", null, body)).status).toBe(403);
  expect((await choices(patient!.id)).at(-1)).toEqual({ choice: "granted", source: "profile" });

  const real = await post("/api/whatsapp/webhook", null, body, { "X-Hub-Signature-256": sign(body) });
  expect(real.status).toBe(200);
  expect((await choices(patient!.id)).at(-1)).toEqual({ choice: "withdrawn", source: "stop_reply" });
});

test("WA-003: Settings -> WhatsApp starts off, says it is not set up, and saves its switches", async ({ page }) => {
  for (const email of [QA_EMAILS.patientA, QA_EMAILS.therapistA]) {
    expect((await post("/api/admin/whatsapp/settings", email, { sendingEnabled: true })).status).toBe(403);
  }
  expect((await post("/api/admin/whatsapp/settings", QA_EMAILS.admin, { testNumber: "call me" })).status).toBe(400);
  expect((await post("/api/admin/whatsapp/settings", QA_EMAILS.admin, { sendingEnabled: true, testNumber: null })).status).toBe(400);
  await db.from("whatsapp_controls").update({ sending_enabled: false, test_number: null, disabled_kinds: [] }).eq("id", 1);

  await page.context().addCookies(await browserCookiesFor(QA_EMAILS.admin));
  await page.goto(`${BASE}/admin/dashboard?section=settings&tab=whatsapp`, { waitUntil: "domcontentloaded" });
  const screen = page.getByTestId("whatsapp-controls").filter({ visible: true });
  await expect(screen).toBeVisible(SEEN);
  await expect(screen).toContainText("Not set up yet");
  await expect(screen.getByText("Off. Nothing is sent.")).toBeVisible();

  await screen.getByLabel("Test number").fill("+91 98765 43210");
  await expect(async () => {
    await screen.getByRole("button", { name: "Save" }).click();
    await expect.poll(async () => (await db.from("whatsapp_controls").select("test_number").eq("id", 1).single()).data?.test_number, { timeout: 3_000 }).toBe("919876543210");
  }).toPass(SEEN);
  await screen.locator('[data-whatsapp-kind="reminder"]').getByRole("switch").click();
  await expect.poll(async () => (await db.from("whatsapp_controls").select("disabled_kinds").eq("id", 1).single()).data?.disabled_kinds, SEEN).toEqual(["reminder"]);

  // The audit row keeps a test number to its last three digits.
  await expect
    .poll(async () => {
      const { data } = await db.from("admin_activity_log").select("details").eq("action", "whatsapp_controls.set").order("created_at", { ascending: false }).limit(5);
      return (data ?? []).map((r) => JSON.stringify(r.details)).join(" ");
    }, SEEN)
    .toContain("***210");
});

test("WA-004: deleting the account takes its consent rows with it", async () => {
  const id = patient!.id;
  await deleteFixtureAccount(id);
  patient = undefined;
  expect(await choices(id)).toEqual([]);
});
