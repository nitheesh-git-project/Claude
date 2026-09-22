// PKG-FLAG: the catalog forms offer the switches that still decide something.
//
// A session package carried three "show it here" ticks plus a badge, a
// featured ring and fine print -- all of them for a public programme card
// the consultation-first cutover deleted -- while `recommendable`, the one
// switch deciding whether a clinician may put the programme in front of a
// patient, had no control at all. A home visit is still sold directly, so it
// keeps its marketing fields and both of its live placement flags; only its
// home-page tick goes, since the home page carries a link band and has never
// listed visit packages.
import { test, expect } from "@playwright/test";
import { BASE, browserCookiesFor, QA_EMAILS } from "./helpers";

test("PKG-FLAG-001: session and home-visit forms carry the live switches", async ({
  page,
  context,
}) => {
  await context.addCookies(await browserCookiesFor(QA_EMAILS.admin));
  await page.goto(`${BASE}/admin/dashboard?section=catalog&tab=packages`);
  await page.waitForLoadState("networkidle");

  await page.getByRole("button", { name: "+ Add Package" }).click();
  const sessionForm = page.locator("form:visible").first();
  const sessionText = await sessionForm.innerText();
  for (const gone of [
    "Show on Home page",
    "Show on Conditions page",
    "Show in Patient Dashboard",
    "Badge",
    "Feature this package",
    "Terms",
  ]) {
    expect(sessionText, `"${gone}" decides nothing and must not be offered`).not.toContain(gone);
  }
  expect(sessionText).toContain("A therapist may recommend this");
  expect(sessionText).toContain("Active");

  const hvAdd = page.getByRole("button", { name: /Add Home Visit Package|\+ Add Package/i }).last();
  await hvAdd.scrollIntoViewIfNeeded();
  await hvAdd.click();
  const hvText = await page.locator("form:visible").last().innerText();
  expect(hvText).not.toContain("Show on the home page");
  expect(hvText).toContain("Show on the Home Visit page");
  expect(hvText).toContain("Show in the patient dashboard");
  expect(hvText).toContain("A therapist may recommend this");
  // Still advertised, so these still mean something here.
  expect(hvText).toContain("Badge");
});
