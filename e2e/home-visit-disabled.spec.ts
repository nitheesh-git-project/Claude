// HV-OFF: with the master switch off, nothing offers a home visit.
//
// The switch is flipped **straight in the database** here on purpose. Going
// through /api/admin/update-setting is the easy case: that route calls
// revalidatePath, so the ISR-cached pages are purged for it. Anything else
// that changes the column -- a hand edit, a data reset, a restore -- leaves
// those caches alone, and /book-home-visit is the page where being stale
// means quoting a price for a visit nobody will make. It renders per request
// for exactly that reason.
import { test, expect } from "@playwright/test";
import { BASE, browserCookiesFor, QA_EMAILS, adminClient } from "./helpers";
const SHOT = "/tmp/claude-0/-home-user-Claude/4aa46951-8474-5745-b94b-f692208ce89d/scratchpad/shots";

test("HV-OFF-001: no page, link or offer survives the switch", async ({ page, context, request }) => {
  const admin = adminClient();
  // Flipped straight in the database on purpose: that is the case ISR could
  // not survive, since nothing calls revalidatePath.
  await admin.from("site_settings").update({ home_visit_enabled: false }).not("id", "is", null);
  try {
    await context.addCookies(await browserCookiesFor(QA_EMAILS.patientA));
    for (const p of ["/book-home-visit", "/home-visit"]) {
      const res = await request.get(`${BASE}${p}`);
      console.log(p, res.status());
      expect(res.status()).toBe(404);
    }
    for (const p of [
      "/patient/dashboard",
      "/patient/dashboard/book",
      "/patient/dashboard/suggested",
      "/patient/dashboard/sessions",
    ]) {
      await page.goto(`${BASE}${p}`);
      await page.waitForLoadState("networkidle");
      const links = await page.locator('a[href*="home-visit"]').count();
      const html = await page.content();
      console.log(p, "links:", links, "mentions:", (html.match(/[Hh]ome [Vv]isit/g) ?? []).length);
      expect(links, `${p} links to home visit`).toBe(0);
    }
    await page.goto(`${BASE}/patient/dashboard/book`);
    await page.waitForLoadState("networkidle");
    await page.screenshot({ path: `${SHOT}/hv-off-book.png`, fullPage: false });
  } finally {
    await admin.from("site_settings").update({ home_visit_enabled: true }).not("id", "is", null);
  }
});
