// WAIT-AREA: marking an out-of-area request served offers to open the area.
//
// "served" used to set a status and nothing else, so the pincode stayed
// unserved: the next patient from that street met the same refusal, and the
// row saying the clinic had been there sat on a screen nobody would doubt.
// Driven as a screen because that is where the whole change is -- the two
// routes it calls are unchanged.
import { test, expect } from "@playwright/test";
import { BASE, browserCookiesFor, QA_EMAILS, adminClient } from "./helpers";

const PIN = "560099";
const NAME = "ZZ QA Waitlist";

test("WAIT-AREA-001: declining marks served and opens nothing; agreeing opens the area", async ({
  page,
  context,
}) => {
  // Two full loads of the admin dashboard plus two of its refreshes, each a
  // ~49-query server render: the suite's 30s default is a stopwatch on the
  // dev server rather than on this feature.
  test.setTimeout(150_000);
  const admin = adminClient();
  await admin.from("home_visit_areas").delete().eq("pincode", PIN);
  await admin.from("home_visit_waitlist").delete().eq("pincode", PIN);
  const { data: seeded } = await admin
    .from("home_visit_waitlist")
    .insert({ name: NAME, phone: "9876500099", pincode: PIN, city: "Bengaluru", status: "new" })
    .select("id")
    .single();
  expect(seeded?.id, "seeded waitlist request").toBeTruthy();

  try {
    await context.addCookies(await browserCookiesFor(QA_EMAILS.admin));
    await page.goto(`${BASE}/admin/dashboard?section=catalog&tab=areas`);
    await page.waitForLoadState("networkidle");

    // Scoped to the waitlist rather than "any li holding this pincode":
    // this screen carries two lists of the same shape, and once the area
    // exists the same digits appear in both.
    const requests = page.getByRole("list", { name: "Out-of-area requests" });
    const row = requests.getByRole("listitem").filter({ hasText: PIN }).first();
    await row.scrollIntoViewIfNeeded();
    const serve = row.getByRole("button", { name: "served", exact: true });
    // The dashboard is a large server render, so the button can be painted
    // a beat before React has hydrated it -- a click then lands on nothing.
    await expect(serve).toBeEnabled();
    await serve.click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible({ timeout: 15000 });
    // The request's own details, and the fee this clinic already charges in
    // that city -- a prefill nobody explains is a price nobody chose.
    await expect(dialog).toContainText(PIN);
    await expect(dialog).toContainText(NAME);
    await expect(dialog.locator('input[type="number"]')).toHaveValue("150");

    await dialog.getByRole("button", { name: /just mark served/i }).click();
    await expect(dialog).toBeHidden({ timeout: 15000 });
    await page.waitForTimeout(1200);

    const { data: afterDecline } = await admin
      .from("home_visit_areas")
      .select("id")
      .eq("pincode", PIN);
    expect(afterDecline ?? [], "declining opens no area").toHaveLength(0);
    const { data: declinedStatus } = await admin
      .from("home_visit_waitlist")
      .select("status")
      .eq("id", seeded!.id)
      .single();
    // Declining is an answer, not a cancel: the clinic did go this once.
    expect(declinedStatus?.status).toBe("served");

    await admin.from("home_visit_waitlist").update({ status: "new" }).eq("id", seeded!.id);
    await page.reload();
    await page.waitForLoadState("networkidle");
    const row2 = requests.getByRole("listitem").filter({ hasText: PIN }).first();
    await row2.scrollIntoViewIfNeeded();
    const serve2 = row2.getByRole("button", { name: "served", exact: true });
    await expect(serve2).toBeEnabled();
    await serve2.click();
    const dialog2 = page.getByRole("dialog");
    await expect(dialog2).toBeVisible({ timeout: 15000 });
    await dialog2.getByRole("button", { name: /add it and mark served/i }).click();
    await expect(dialog2).toBeHidden({ timeout: 20000 });
    await page.waitForTimeout(1500);

    const { data: area } = await admin
      .from("home_visit_areas")
      .select("city, pincode, travel_fee_paise, active")
      .eq("pincode", PIN)
      .maybeSingle();
    expect(area, "agreeing opens the area").toBeTruthy();
    expect(area?.city).toBe("Bengaluru");
    expect(area?.travel_fee_paise).toBe(15000);
    expect(area?.active).toBe(true);

    const { data: servedStatus } = await admin
      .from("home_visit_waitlist")
      .select("status")
      .eq("id", seeded!.id)
      .single();
    expect(servedStatus?.status).toBe("served");
  } finally {
    await admin.from("home_visit_areas").delete().eq("pincode", PIN);
    await admin.from("home_visit_waitlist").delete().eq("pincode", PIN);
  }
});
