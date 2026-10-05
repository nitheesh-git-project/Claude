import { test, expect } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  BASE,
  QA_EMAILS,
  SUPABASE_ANON_KEY,
  SUPABASE_URL,
  TEST_PASSWORD,
  adminClient,
  cookieHeaderFor,
  profileIdFor,
} from "./helpers";

/**
 * One patient's record is not another patient's, and a report a patient
 * uploads is theirs alone to delete.
 *
 * Two layers, both asserted, because a session cookie reaches PostgREST
 * without passing any route (docs/rules/clinical.md, "Patient-uploaded
 * reports"): the routes refuse, and the rows themselves are invisible to the
 * other patient's own RLS-scoped client. A test of only the first would pass
 * on a table with no policy at all.
 *
 * It also drives the upload path end to end -- the only writer of
 * patient_medical_documents -- through the real route with a real file, then
 * opens it through the signed-URL route and checks the link is short-lived.
 * The fixture report is deleted through the patient's own delete route in
 * afterAll, so nothing is left in the bucket.
 */

const OWNER = QA_EMAILS.patientA;
const OTHER = QA_EMAILS.patientB;
const MARKER = "E2E isolation report";
// The smallest file the upload route's byte sniffer accepts as a PDF, with
// no scripts, launch actions or embedded files (pdfHasActiveContent).
const PDF = Buffer.from("%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n");

let db: SupabaseClient;
let ownerId = "";
let otherId = "";
let documentId = "";

async function rlsClientFor(email: string): Promise<SupabaseClient> {
  const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error } = await client.auth.signInWithPassword({ email, password: TEST_PASSWORD });
  if (error) throw new Error(`sign-in for ${email} failed: ${error.message}`);
  return client;
}

async function post(path: string, cookie: string, data: Record<string, unknown>) {
  return fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify(data),
  });
}

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  db = adminClient();
  ownerId = await profileIdFor(db, OWNER);
  otherId = await profileIdFor(db, OTHER);
  // Reports an aborted earlier run left behind count towards the 20-file cap.
  const { data: stale } = await db
    .from("patient_medical_documents")
    .select("id")
    .eq("patient_id", ownerId)
    .like("title", `${MARKER}%`);
  const cookie = await cookieHeaderFor(OWNER);
  for (const row of stale ?? []) await post("/api/patient/medical-documents/delete", cookie, { documentId: row.id });
});

test.afterAll(async () => {
  if (!documentId) return;
  const res = await post("/api/patient/medical-documents/delete", await cookieHeaderFor(OWNER), { documentId });
  expect(res.status, "the fixture report is removed by its owner").toBe(200);
});

test("PI-001: a patient uploads a report through the route and it is stored privately", async () => {
  const form = new FormData();
  form.set("file", new Blob([PDF], { type: "application/pdf" }), "scan.pdf");
  form.set("title", `${MARKER} ${Date.now()}`);
  form.set("documentType", "other");
  const res = await fetch(`${BASE}/api/patient/medical-documents/upload`, {
    method: "POST",
    headers: { Cookie: await cookieHeaderFor(OWNER) },
    body: form,
  });
  const body = await res.json();
  expect(res.status, JSON.stringify(body)).toBe(200);
  documentId = body.document?.id;
  expect(documentId).toBeTruthy();

  const { data: row } = await db
    .from("patient_medical_documents")
    .select("patient_id, storage_path, mime_type")
    .eq("id", documentId)
    .single();
  expect(row?.patient_id).toBe(ownerId);
  // Typed by its bytes, not by the label the request carried.
  expect(row?.mime_type).toBe("application/pdf");
  // The bucket is private: the plain object URL is not a way in.
  const anon = await fetch(`${SUPABASE_URL}/storage/v1/object/public/medical-reports/${row?.storage_path}`);
  expect(anon.status).not.toBe(200);
});

test("PI-002: the owner opens it through a link that expires in minutes", async () => {
  expect(documentId, "PI-001 uploaded the report").toBeTruthy();
  const res = await post("/api/medical-documents/view", await cookieHeaderFor(OWNER), { documentId });
  expect(res.status).toBe(200);
  const { url } = await res.json();
  const file = await fetch(url);
  expect(file.status).toBe(200);
  expect(Buffer.from(await file.arrayBuffer()).subarray(0, 5).toString()).toBe("%PDF-");
  // The signed token carries its own expiry; the route mints 120 seconds.
  const token = new URL(url).searchParams.get("token") ?? "";
  const payload = JSON.parse(Buffer.from(token.split(".")[1] ?? "", "base64url").toString() || "{}");
  expect(payload.exp - payload.iat).toBeGreaterThan(0);
  expect(payload.exp - payload.iat).toBeLessThanOrEqual(600);
});

test("PI-003: another patient can neither open nor delete it, at the route or below it", async () => {
  expect(documentId, "PI-001 uploaded the report").toBeTruthy();
  const otherCookie = await cookieHeaderFor(OTHER);

  const view = await post("/api/medical-documents/view", otherCookie, { documentId });
  expect(view.status).toBe(404);
  const del = await post("/api/patient/medical-documents/delete", otherCookie, { documentId });
  expect([403, 404]).toContain(del.status);
  const { count } = await db.from("patient_medical_documents").select("id", { count: "exact", head: true }).eq("id", documentId);
  expect(count, "the refused delete removed nothing").toBe(1);

  const other = await rlsClientFor(OTHER);
  const { data: rows, error } = await other.from("patient_medical_documents").select("id").eq("id", documentId);
  expect(error).toBeNull();
  expect(rows ?? []).toHaveLength(0);
  const { data: path } = await db.from("patient_medical_documents").select("storage_path").eq("id", documentId).single();
  const { data: blob } = await other.storage.from("medical-reports").download(path!.storage_path);
  expect(blob, "storage refuses the other patient's own session").toBeNull();
});

test("PI-004: a patient's own client sees none of another patient's clinical or money rows", async () => {
  const other = await rlsClientFor(OTHER);
  const tables = [
    "appointments",
    "payments",
    "patient_condition_profiles",
    "condition_change_requests",
    "pain_assessments",
    "session_notes",
    "care_plans",
    "patient_medical_documents",
    "patient_addresses",
  ];
  for (const table of tables) {
    const { data, error } = await other.from(table).select("patient_id").eq("patient_id", ownerId).limit(5);
    // A table the client cannot select at all answers with an error; a
    // table it can select must hand back nothing of the owner's.
    if (error) {
      expect(error.code, `${table}: ${error.message}`).toMatch(/^(42501|PGRST)/);
    } else {
      expect(data ?? [], `${table} leaked another patient's rows`).toHaveLength(0);
    }
  }
  // The owner's own client does see their own appointments table at all
  // (a check that every table returns nothing would pass on a broken login).
  const owner = await rlsClientFor(OWNER);
  const { error: ownErr } = await owner.from("appointments").select("id").eq("patient_id", ownerId).limit(1);
  expect(ownErr).toBeNull();
  expect(otherId).not.toBe(ownerId);
});

test("PI-005: a patient cannot export another patient's health profile", async () => {
  const res = await fetch(`${BASE}/api/patient/condition-profile/export?format=json&patientId=${ownerId}`, {
    headers: { Cookie: await cookieHeaderFor(OTHER) },
  });
  // The export is always of the caller's own record; a patientId in the
  // query is not an input. Whatever it answers, it is not the owner's data.
  const text = await res.text();
  expect(text).not.toContain(ownerId);
});
