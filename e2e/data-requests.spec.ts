// Phase 3 of the legal work: a person's own data (download, delete) and
// grievances (src/lib/dataRequests.ts).
//
//  DR-001 "Download my data" returns a PDF and records an `export` request
//  DR-002 "Delete my account" opens one request (a second is refused), can be
//         taken back while open, and is worked on People -> Data requests
//         (declining needs a reason)
//  DR-003 the /grievances form: a complaint gets a reference; a bad one is a
//         400 with words; the admin acknowledges and resolves it (a note is
//         required to resolve)
//  DR-004 the profile page shows "Your data", and the /grievances page's form
//         shows the reference on success
//
// Every row a case writes is removed afterwards; the tables are not
// append-only.
import { test, expect } from "@playwright/test";
import {
  BASE,
  QA_EMAILS,
  adminClient,
  browserCookiesFor,
  cookieHeaderFor,
  createFixtureAccount,
  deleteFixtureAccount,
} from "./helpers";

const admin = adminClient();
let patient: { id: string; email: string; name: string } | undefined;
const grievanceRefs: string[] = [];

test.beforeAll(async () => {
  patient = await createFixtureAccount("data requests");
});

test.afterAll(async () => {
  if (patient) await admin.from("data_requests").delete().eq("user_id", patient.id);
  for (const ref of grievanceRefs) await admin.from("grievances").delete().eq("reference", ref);
  await deleteFixtureAccount(patient?.id);
});

async function asPatient(path: string, init: RequestInit = {}) {
  return fetch(`${BASE}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", Cookie: await cookieHeaderFor(patient!.email), ...(init.headers ?? {}) },
  });
}

async function asAdmin(path: string, body?: unknown) {
  return fetch(`${BASE}${path}`, {
    method: body ? "POST" : "GET",
    headers: { "Content-Type": "application/json", Cookie: await cookieHeaderFor(QA_EMAILS.admin) },
    body: body ? JSON.stringify(body) : undefined,
  });
}

test("DR-001 Download my data returns a PDF and records the download", async () => {
  const res = await asPatient("/api/account/my-data");
  expect(res.status).toBe(200);
  expect(res.headers.get("content-type")).toBe("application/pdf");
  expect(res.headers.get("content-disposition")).toMatch(/attachment; filename="moverestore-your-data-\d{4}-\d{2}-\d{2}\.pdf"/);
  const bytes = new Uint8Array(await res.arrayBuffer());
  expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");

  const { data } = await admin.from("data_requests").select("kind, status, reference").eq("user_id", patient!.id).eq("kind", "export");
  expect(data?.length).toBe(1);
  expect(data![0]).toMatchObject({ kind: "export", status: "completed" });
  expect(data![0].reference).toMatch(/^EXP-/);

  // Nobody signed in gets nothing.
  expect((await fetch(`${BASE}/api/account/my-data`)).status).toBe(401);
});

test("DR-002 a deletion request is one case, can be taken back, and is worked by the People desk", async () => {
  const opened = await asPatient("/api/account/deletion-request", { method: "POST", body: JSON.stringify({ reason: "Moving abroad" }) });
  expect(opened.status).toBe(200);
  const { reference } = await opened.json();
  expect(reference).toMatch(/^DEL-/);

  const again = await asPatient("/api/account/deletion-request", { method: "POST", body: JSON.stringify({}) });
  expect(again.status).toBe(409);

  const withdrawn = await asPatient("/api/account/deletion-request", { method: "POST", body: JSON.stringify({ withdraw: true }) });
  expect(withdrawn.status).toBe(200);
  expect((await withdrawn.json()).withdrawn).toBe(reference);

  // Asked again; this time the desk works it.
  const second = await asPatient("/api/account/deletion-request", { method: "POST", body: JSON.stringify({}) });
  expect(second.status).toBe(200);
  const ref2 = (await second.json()).reference as string;

  const list = await asAdmin("/api/admin/data-requests");
  expect(list.status).toBe(200);
  const body = await list.json();
  const row = body.deletions.find((d: { reference: string }) => d.reference === ref2);
  expect(row).toMatchObject({ status: "open", role: "patient" });
  expect(row.person.email).toBe(patient!.email);

  const noReason = await asAdmin("/api/admin/data-requests/update", { type: "deletion", id: row.id, to: "rejected" });
  expect(noReason.status).toBe(400);
  const skip = await asAdmin("/api/admin/data-requests/update", { type: "deletion", id: row.id, to: "withdrawn" });
  expect(skip.status).toBe(400);
  const started = await asAdmin("/api/admin/data-requests/update", { type: "deletion", id: row.id, to: "in_progress" });
  expect(started.status).toBe(200);
  // Once the desk has started, the person cannot take it back here.
  const late = await asPatient("/api/account/deletion-request", { method: "POST", body: JSON.stringify({ withdraw: true }) });
  expect(late.status).toBe(409);
  const declined = await asAdmin("/api/admin/data-requests/update", { type: "deletion", id: row.id, to: "rejected", note: "Unpaid invoice outstanding" });
  expect(declined.status).toBe(200);
  // A stale screen cannot move it twice.
  const twice = await asAdmin("/api/admin/data-requests/update", { type: "deletion", id: row.id, to: "completed" });
  expect(twice.status).toBe(400);
});

test("DR-003 a grievance gets a reference, and the desk acknowledges then resolves it", async () => {
  const bad = await fetch(`${BASE}/api/grievances`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "E2E", email: "nope", category: "payment", message: "Charged twice for one session" }),
  });
  expect(bad.status).toBe(400);
  expect((await bad.json()).error).toMatch(/email/);

  const ok = await fetch(`${BASE}/api/grievances`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "E2E Grievance", email: "e2e.grievance@example.test", category: "payment", message: "Charged twice for one session." }),
  });
  expect(ok.status).toBe(200);
  const { reference } = await ok.json();
  expect(reference).toMatch(/^GRV-/);
  grievanceRefs.push(reference);

  const { data: row } = await admin.from("grievances").select("id, status, user_id").eq("reference", reference).single();
  expect(row).toMatchObject({ status: "new", user_id: null });

  expect((await asAdmin("/api/admin/data-requests/update", { type: "grievance", id: row!.id, to: "acknowledged" })).status).toBe(200);
  expect((await asAdmin("/api/admin/data-requests/update", { type: "grievance", id: row!.id, to: "resolved" })).status).toBe(400);
  expect((await asAdmin("/api/admin/data-requests/update", { type: "grievance", id: row!.id, to: "resolved", note: "Duplicate charge refunded" })).status).toBe(200);
  const { data: done } = await admin.from("grievances").select("status, acknowledged_at, resolved_at").eq("id", row!.id).single();
  expect(done!.status).toBe("resolved");
  expect(done!.acknowledged_at).not.toBeNull();
  expect(done!.resolved_at).not.toBeNull();
});

test("DR-004 the profile shows Your data, and the grievance form shows its reference", async ({ browser }) => {
  test.setTimeout(120_000);
  const ctx = await browser.newContext();
  await ctx.addCookies(await browserCookiesFor(patient!.email));
  const page = await ctx.newPage();
  await page.goto(`${BASE}/patient/dashboard/profile`, { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "Your data" })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole("button", { name: /Download PDF/ })).toBeVisible();

  await page.goto(`${BASE}/grievances`, { waitUntil: "domcontentloaded" });
  await page.getByLabel("Your name").fill("E2E Form Grievance");
  await page.getByLabel("Email to reply to").fill("e2e.grievance.form@example.test");
  await page.getByLabel("What is it about?").selectOption("service");
  await page.getByLabel(/What happened/).fill("The video link did not open at the session time.");
  await page.getByRole("button", { name: "Send complaint" }).click();
  const sent = page.getByTestId("grievance-sent");
  await expect(sent).toBeVisible({ timeout: 30_000 });
  const ref = (await sent.locator(".font-mono").textContent())?.trim() ?? "";
  expect(ref).toMatch(/^GRV-/);
  grievanceRefs.push(ref);
  await ctx.close();
});
