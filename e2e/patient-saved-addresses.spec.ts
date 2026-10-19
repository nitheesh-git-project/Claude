// A patient's saved addresses: saved through the route (served pincode
// linked to its area, an unserved one still kept), the default moving rather
// than doubling, removed as a soft delete that leaves history intact, and
// another patient refused at the route and at RLS.
//
// The owner is an account of its own (createFixtureAccount), so nothing
// another spec left on the shared QA patients is on the list being read;
// QA Patient B plays the stranger. Route-driven for the rules, with one
// browser pass over My Addresses for what the patient actually sees.
import { test, expect, type APIRequestContext, request as playwrightRequest } from "@playwright/test";
import {
  BASE,
  QA_EMAILS,
  adminClient,
  browserCookiesFor,
  cookieHeaderFor,
  createFixtureAccount,
  deleteFixtureAccount,
  rlsClientFor,
  waitForSplashToClear,
} from "./helpers";

const db = adminClient();
const MARKER = `E2E saved-address ${Date.now()}`;
// Seeded by global setup as a served area (Chennai, T Nagar).
const SERVED_PINCODE = "600017";
// Six digits, the right shape, and served by nothing the suite creates.
const UNSERVED_PINCODE = "110001";

let owner: { id: string; email: string; name: string };
let ownerCtx: APIRequestContext;
let strangerCtx: APIRequestContext;
let anonCtx: APIRequestContext;

async function save(ctx: APIRequestContext, data: Record<string, unknown>) {
  return ctx.post("/api/patient/addresses/save", { data });
}

async function remove(ctx: APIRequestContext, id: string) {
  return ctx.post("/api/patient/addresses/remove", { data: { id } });
}

async function row(id: string) {
  const { data, error } = await db
    .from("patient_addresses")
    .select("id, patient_id, line1, pincode, area_id, is_default, active")
    .eq("id", id)
    .single();
  if (error) throw new Error(`could not read address ${id}: ${error.message}`);
  return data;
}

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  owner = await createFixtureAccount("saved addresses");
  ownerCtx = await playwrightRequest.newContext({
    baseURL: BASE,
    extraHTTPHeaders: { Cookie: await cookieHeaderFor(owner.email) },
  });
  strangerCtx = await playwrightRequest.newContext({
    baseURL: BASE,
    extraHTTPHeaders: { Cookie: await cookieHeaderFor(QA_EMAILS.patientB) },
  });
  anonCtx = await playwrightRequest.newContext({ baseURL: BASE });
});

test.afterAll(async () => {
  await ownerCtx?.dispose();
  await strangerCtx?.dispose();
  await anonCtx?.dispose();
  // Nothing points at these rows (no visit was booked to them), so they go
  // with the account.
  if (owner) await db.from("patient_addresses").delete().eq("patient_id", owner.id);
  await deleteFixtureAccount(owner?.id);
});

let homeId = "";
let officeId = "";

test("SA-001: a patient saves addresses -- a served pincode is linked to its area, an unserved one is still kept, and the default moves", async () => {
  test.setTimeout(90_000);

  // Who is asking comes before what was sent.
  const anonymous = await save(anonCtx, { line1: `${MARKER} anon`, pincode: SERVED_PINCODE });
  expect(anonymous.status()).toBe(401);

  // The route's own sentences, never a 500.
  const noStreet = await save(ownerCtx, { line1: "   ", pincode: SERVED_PINCODE });
  expect(noStreet.status()).toBe(400);
  expect((await noStreet.json()).error).toBe("A street address is required.");
  const badPin = await save(ownerCtx, { line1: `${MARKER} home`, pincode: "6000" });
  expect(badPin.status()).toBe(400);
  expect((await badPin.json()).error).toBe("Enter a valid 6-digit pincode.");
  const malformed = await ownerCtx.post("/api/patient/addresses/save", {
    headers: { "Content-Type": "application/json" },
    data: "{not json",
  });
  expect(malformed.status()).toBe(400);

  const home = await save(ownerCtx, {
    label: "Home",
    line1: `${MARKER} home`,
    city: "Chennai",
    pincode: ` ${SERVED_PINCODE} `,
    accessNotes: "Ring twice",
    isDefault: true,
  });
  expect(home.status(), await home.text()).toBe(200);
  homeId = (await home.json()).id;
  const { data: area } = await db.from("home_visit_areas").select("id").eq("pincode", SERVED_PINCODE).maybeSingle();
  const saved = await row(homeId);
  expect(saved).toMatchObject({
    patient_id: owner.id,
    line1: `${MARKER} home`,
    pincode: SERVED_PINCODE,
    is_default: true,
    active: true,
  });
  expect(saved.area_id, "a served pincode is linked to its service area").toBe(area?.id ?? null);

  // An area we don't reach yet is saved anyway, with no area -- refusing it
  // would only make the patient retype it once we do.
  const office = await save(ownerCtx, { label: "Office", line1: `${MARKER} office`, pincode: UNSERVED_PINCODE });
  expect(office.status(), await office.text()).toBe(200);
  officeId = (await office.json()).id;
  expect(await row(officeId)).toMatchObject({ area_id: null, is_default: false, active: true });

  // Making the second the default moves the flag; there is never two.
  const moved = await save(ownerCtx, {
    id: officeId,
    label: "Office",
    line1: `${MARKER} office`,
    pincode: UNSERVED_PINCODE,
    isDefault: true,
  });
  expect(moved.status(), await moved.text()).toBe(200);
  expect((await row(officeId)).is_default).toBe(true);
  expect((await row(homeId)).is_default).toBe(false);
});

test("SA-002: another patient can neither edit nor remove the address, at the route or through their own RLS", async () => {
  expect(homeId, "SA-001 saved the address").toBeTruthy();
  const before = await row(homeId);

  // An id alone is never enough to edit somebody else's address.
  const edit = await save(strangerCtx, { id: homeId, line1: "Somebody else's street", pincode: SERVED_PINCODE });
  expect(edit.status()).toBe(404);
  // ...or to remove it -- which used to answer 200 having changed nothing.
  const gone = await remove(strangerCtx, homeId);
  expect(gone.status()).toBe(404);
  expect(await row(homeId)).toEqual(before);

  // Below the routes: a session cookie reaches PostgREST directly, and the
  // stranger's own RLS reads none of it and rewrites none of it.
  const stranger = await rlsClientFor(QA_EMAILS.patientB);
  const { data: seen } = await stranger.from("patient_addresses").select("id").eq("patient_id", owner.id);
  expect(seen ?? []).toEqual([]);
  const { data: rewritten } = await stranger
    .from("patient_addresses")
    .update({ line1: "Rewritten by a stranger" })
    .eq("id", homeId)
    .select("id");
  expect(rewritten ?? []).toEqual([]);
  expect(await row(homeId)).toEqual(before);

  // And an anonymous caller is turned away before the body is read.
  expect((await remove(anonCtx, homeId)).status()).toBe(401);
});

test("SA-003: the patient sees both on My Addresses, removes one, and it leaves the list but not the history", async ({ page }) => {
  test.setTimeout(90_000);
  expect(homeId && officeId, "SA-001 saved both addresses").toBeTruthy();
  await page.context().addCookies(await browserCookiesFor(owner.email));
  await page.goto(`${BASE}/patient/dashboard/profile#my-addresses`);
  await waitForSplashToClear(page);

  const list = page.locator("#my-addresses");
  const homeCard = list.locator("li").filter({ hasText: `${MARKER} home` });
  const officeCard = list.locator("li").filter({ hasText: `${MARKER} office` });
  await expect(homeCard).toBeVisible({ timeout: 60_000 });
  await expect(officeCard).toBeVisible();
  // The default reads as the default, on the one the patient chose.
  await expect(officeCard.getByText("Default", { exact: true })).toBeVisible();
  await expect(homeCard.getByText("Default", { exact: true })).toHaveCount(0);
  await expect(homeCard.getByText("Ring twice")).toBeVisible();

  await homeCard.getByRole("button", { name: "Remove" }).click();
  const confirm = page.getByRole("alertdialog");
  await expect(confirm).toContainText("Visits already booked to it are unaffected");
  const removed = page.waitForResponse((r) => r.url().includes("/api/patient/addresses/remove"));
  await confirm.getByRole("button", { name: "Yes" }).click();
  expect((await removed).status()).toBe(200);
  await expect(homeCard).toHaveCount(0, { timeout: 30_000 });
  await expect(officeCard).toBeVisible();

  // A soft delete: the row stays for any visit that pointed at it, out of
  // every picker, and no longer anybody's default.
  expect(await row(homeId)).toMatchObject({ active: false, is_default: false, line1: `${MARKER} home` });

  // Removing it again is the same logical action, not an error.
  expect((await remove(ownerCtx, homeId)).status()).toBe(200);
});
