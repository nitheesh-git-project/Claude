// TS-SPEC: a therapist's specialisation, captured once and shown wherever
// that therapist is.
//
// Driven as screens rather than as routes deliberately, the same reasoning
// pay-later's spec carries: nothing here changes what an API answers. What
// changed is what a person reads -- a chip beside a name, a filter that
// narrows a directory of forty people to the three who take stroke
// patients, and a picker that says who each option is for. Every one of
// those is invisible to an API test.
import { test, expect } from "@playwright/test";
import { BASE, browserCookiesFor, QA_EMAILS, adminClient, profileIdFor } from "./helpers";

test.describe("therapist specialisation", () => {
  test("TS-001: the admin directory shows it and filters by it", async ({ page, context }) => {
    // Two admin-dashboard renders, each ~49 queries. The suite's 30s default
    // is a stopwatch on the dev server rather than on this feature.
    test.setTimeout(180_000);
    const admin = adminClient();
    const aId = await profileIdFor(admin, QA_EMAILS.therapistA);
    const bId = await profileIdFor(admin, QA_EMAILS.therapistB);

    // Put back exactly what was there: this column is a real profile field
    // on a shared fixture, and leaving a spec's value behind would make the
    // next run's "who takes neuro?" answer wrong.
    const { data: before } = await admin
      .from("profiles")
      .select("id, specialization, full_name")
      .in("id", [aId, bId]);
    const nameOf = new Map((before ?? []).map((r) => [r.id, r.full_name as string | null]));

    try {
      await admin.from("profiles").update({ specialization: "Neurological" }).eq("id", aId);
      await admin.from("profiles").update({ specialization: "Orthopaedic" }).eq("id", bId);

      await context.addCookies(await browserCookiesFor(QA_EMAILS.admin));
      await page.goto(`${BASE}/admin/dashboard?section=people&tab=therapists`);
      await page.waitForLoadState("networkidle");

      // Every admin screen stays mounted behind `hidden`, so an unscoped
      // locator matches the same chip on four screens nobody is looking at.
      // `:visible` is the scope that matters here -- the one screen on show.
      const filter = page.getByLabel("Filter by specialisation");
      await expect(filter).toBeVisible();
      await page.screenshot({
        path: "/tmp/specialty-01-directory.png",
        fullPage: false,
      });

      // Both chips are on screen before anything is filtered.
      await expect(
        page.locator("span:visible").filter({ hasText: "Neurological" }).first()
      ).toBeVisible();

      // The option carries its own count, so a filter that would match
      // nobody is never offered.
      await expect(filter.locator("option")).toContainText([/Any specialisation/]);
      await filter.selectOption("neurological");
      await page.waitForTimeout(300);
      await page.screenshot({ path: "/tmp/specialty-02-filtered.png" });

      const aName = nameOf.get(aId) ?? "";
      const bName = nameOf.get(bId) ?? "";
      expect(aName, "fixture therapist A has a name").toBeTruthy();
      await expect(page.locator("p:visible").filter({ hasText: aName }).first()).toBeVisible();
      if (bName && bName !== aName) {
        await expect(page.locator("p:visible").filter({ hasText: bName })).toHaveCount(0);
      }

      // And back: "Any specialisation" is a way out of the filter, not a
      // state you have to reload the dashboard to leave.
      await filter.selectOption("all");
      await page.waitForTimeout(300);
      if (bName && bName !== aName) {
        await expect(page.locator("p:visible").filter({ hasText: bName }).first()).toBeVisible();
      }
    } finally {
      for (const row of before ?? []) {
        await admin
          .from("profiles")
          .update({ specialization: row.specialization })
          .eq("id", row.id);
      }
    }
  });

  test("TS-002: the public team page carries the same chip", async ({ page }) => {
    test.setTimeout(120_000);
    const admin = adminClient();
    const aId = await profileIdFor(admin, QA_EMAILS.therapistA);
    const { data: before } = await admin
      .from("profiles")
      .select("id, specialization")
      .eq("id", aId)
      .single();

    try {
      await admin.from("profiles").update({ specialization: "Paediatric" }).eq("id", aId);
      // Run against `next dev` -- /team is ISR-cached, so a production
      // server would hand back HTML generated before this update.
      await page.goto(`${BASE}/team`);
      await page.waitForLoadState("networkidle");
      // The opening splash paints over the page for its own hold; a
      // screenshot taken under it is a teal sheet that proves nothing.
      await page
        .waitForFunction(() => !document.documentElement.hasAttribute("data-splash"), null, {
          timeout: 15_000,
        })
        .catch(() => {});
      const chip = page.getByText("Paediatric").first();
      await chip.scrollIntoViewIfNeeded();
      await expect(chip).toBeVisible();
      // The cards stagger in once they enter the viewport, and a capture
      // taken mid-fade shows a heading over an empty band.
      await page.waitForTimeout(1200);
      // Not fullPage: these bands fade in as they enter the viewport, so a
      // whole-page capture is mostly blank and proves nothing.
      await page.screenshot({ path: "/tmp/specialty-03-team.png" });
    } finally {
      await admin
        .from("profiles")
        .update({ specialization: before?.specialization ?? null })
        .eq("id", aId);
    }
  });

  test("TS-003: the application form asks for it, from the one list", async ({ page }) => {
    await page.goto(`${BASE}/therapist/login`);
    await page.getByRole("button", { name: "Apply to Join" }).click();
    const picker = page.getByLabel("Specialist In");
    await expect(picker).toBeVisible();
    // The eight the clinic recognises, and a placeholder that cannot be
    // submitted -- the field is required, so an application always carries
    // one rather than arriving blank for an admin to chase.
    await expect(picker.locator("option")).toHaveCount(9);
    await expect(picker).toHaveAttribute("required", "");
    await picker.selectOption("Neurological");
    await page.screenshot({ path: "/tmp/specialty-04-apply.png", fullPage: true });
  });
});
