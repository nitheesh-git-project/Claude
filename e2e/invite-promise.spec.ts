// INV: a patient is promised a calendar invite only where this deployment
// will send one (the owner's rule after QA F-13).
//
// Every patient-facing promise -- /book's and /patient/register's
// confirmations, /book-home-visit's, an accepted suggestion, and the
// public pages' "Session confirmed" example chip -- is worded by
// patientInviteLine() (src/lib/calendarInviteOutcome.ts) from a server read
// of whether Google is configured and Meet links are on. The wording is
// unit-tested; this proves the read reaches a rendered page.
//
// The gate's local stack is the one environment whose Google state is known
// for certain: scripts/ci/lib/target.mjs refuses to run with any
// GOOGLE_CALENDAR_* variable set, so the app runs "not configured" and must
// point at the dashboard. Elsewhere the chip must still be one of the two
// sentences the module writes, never the old unconditional promise copied in.
import { test, expect } from "@playwright/test";
import { BASE } from "./helpers";

const INVITE_LINE = "Calendar invite on its way.";
const DASHBOARD_LINE = "Details on your dashboard before it starts.";
const googleKnownOff = process.env.CI_LOCAL_STACK === "1";

test("INV-001: the public example chip promises an invite only where one is sent", async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto(`${BASE}/`);
  const chip = page.getByText("Example of what you get").filter({ visible: true }).first();
  await chip.scrollIntoViewIfNeeded();
  await expect(chip).toBeVisible({ timeout: 30_000 });

  // The chip's own card: the line sits two paragraphs above the label.
  const card = page.locator("div").filter({ has: chip }).filter({ hasText: "Session confirmed" }).last();
  const text = ((await card.textContent()) ?? "").replace(/\s+/g, " ");
  if (googleKnownOff) {
    expect(text, "no Google credentials, so nothing may promise an invite").toContain(DASHBOARD_LINE);
    expect(text).not.toContain(INVITE_LINE);
  } else {
    expect(text.includes(INVITE_LINE) || text.includes(DASHBOARD_LINE), text).toBe(true);
  }
});
