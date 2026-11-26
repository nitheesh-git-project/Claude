// PS: a patient story is published only with the patient's written consent on
// file (owner's rule; testimonialTrust.ts, docs/rules/public-site.md).
//
// Three locks, checked from the outside: the admin routes refuse to switch a
// story on without consent, the anon key (what Home and /mission read with)
// cannot see an unconsented story whatever its Active switch says, and
// withdrawing consent hides the story again. Writes one admin-log row per
// call, like every catalog spec, and deletes its own story.
import { test, expect, type APIRequestContext } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { BASE, QA_EMAILS, SUPABASE_ANON_KEY, SUPABASE_URL, adminClient, cookieHeaderFor } from "./helpers";

test.describe.configure({ mode: "serial" });

const NAME = `E2E Story ${Date.now()}`;
const QUOTE = `The exercises made a real difference in six weeks (${Date.now()}).`;
let storyId = "";

const anon = () => createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

async function post(request: APIRequestContext, path: string, data: unknown) {
  return request.post(`${BASE}${path}`, {
    headers: { cookie: await cookieHeaderFor(QA_EMAILS.admin), "content-type": "application/json" },
    data,
  });
}

async function publiclyVisible(): Promise<boolean> {
  const { data } = await anon().from("testimonials").select("id").eq("id", storyId);
  return (data ?? []).length === 1;
}

test.afterAll(async () => {
  if (storyId) await adminClient().from("testimonials").delete().eq("id", storyId);
});

test("PS-001: a new story without consent is saved hidden, and cannot be switched on", async ({ request }) => {
  const created = await post(request, "/api/admin/create-testimonial", { patientName: NAME, quote: QUOTE, displayOrder: 0 });
  expect(created.status(), await created.text()).toBe(200);
  storyId = (await created.json()).id;
  const { data: row } = await adminClient().from("testimonials").select("active, consent_recorded_at").eq("id", storyId).single();
  expect(row).toMatchObject({ active: false, consent_recorded_at: null });
  expect(await publiclyVisible()).toBe(false);

  const refused = await post(request, "/api/admin/update-testimonial", { id: storyId, patientName: NAME, quote: QUOTE, active: true });
  expect(refused.status()).toBe(400);
  expect((await refused.json()).error).toMatch(/written consent on file/);

  // Even switched on behind the routes' back, the anon key cannot read it.
  await adminClient().from("testimonials").update({ active: true }).eq("id", storyId);
  expect(await publiclyVisible()).toBe(false);
});

test("PS-002: with consent recorded it is shown; consent needs a note, and withdrawing it hides the story", async ({ request }) => {
  const noNote = await post(request, "/api/admin/update-testimonial", {
    id: storyId,
    patientName: NAME,
    quote: QUOTE,
    active: true,
    consentGiven: true,
    consentNote: "ok",
  });
  expect(noNote.status()).toBe(400);

  const consented = await post(request, "/api/admin/update-testimonial", {
    id: storyId,
    patientName: NAME,
    quote: QUOTE,
    active: true,
    consentGiven: true,
    consentNote: "Signed form, 26 Nov, patient file",
  });
  expect(consented.status(), await consented.text()).toBe(200);
  const { data: row } = await adminClient()
    .from("testimonials")
    .select("active, consent_recorded_at, consent_note, consent_recorded_by")
    .eq("id", storyId)
    .single();
  expect(row?.active).toBe(true);
  expect(row?.consent_recorded_at).toBeTruthy();
  expect(row?.consent_note).toBe("Signed form, 26 Nov, patient file");
  expect(row?.consent_recorded_by).toBeTruthy();
  expect(await publiclyVisible()).toBe(true);

  const withdrawn = await post(request, "/api/admin/update-testimonial", {
    id: storyId,
    patientName: NAME,
    quote: QUOTE,
    consentGiven: false,
  });
  expect(withdrawn.status()).toBe(200);
  const { data: after } = await adminClient().from("testimonials").select("active, consent_recorded_at").eq("id", storyId).single();
  expect(after).toMatchObject({ active: false, consent_recorded_at: null });
  expect(await publiclyVisible()).toBe(false);
});
