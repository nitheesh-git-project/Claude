// Suite S -- the scoped admin dashboards.
//
// Four admin scopes have existed since access was split up, but for a long
// time only one dashboard did: operations, finance and clinical all landed
// on a Today screen built for a full admin. The sidebar hid the sections
// they could not open, and everything else on that screen carried on as if
// it were a full admin's -- quick actions linking into sections they cannot
// reach (findTab silently redirects, so the link looks like it worked), a
// "needs a person" figure summing queues the list beneath it had already
// filtered out, and four headline figures asking a full admin's questions.
//
// src/lib/adminHome.ts decides all of that now, once, for all four scopes,
// and src/lib/adminHome.test.ts holds the invariants without a browser.
// What only a browser can check is that the page is actually wired to it --
// that the scope in the database reaches the rendered screen at all.
import { test, expect, type Page } from "@playwright/test";
import { BASE, QA_EMAILS, adminClient, browserCookiesFor, profileIdFor } from "./helpers";

/** The ?section= a link on the dashboard points at -- the only part of a
 *  dashboard href that scope decides. */
function sectionOf(href: string): string | null {
  return new URL(href, BASE).searchParams.get("section");
}

async function quickActionSections(page: Page): Promise<string[]> {
  const links = page.locator('section:has(h2:has-text("Quick actions")) a');
  await expect(links.first()).toBeVisible({ timeout: 60_000 });
  const hrefs = await links.evaluateAll((els) =>
    els.map((e) => (e as HTMLAnchorElement).getAttribute("href") ?? "")
  );
  return hrefs.map(sectionOf).filter((s): s is string => s !== null);
}

const SECTIONS_BY_SCOPE: Record<string, string[]> = {
  operations: ["today", "sessions", "people", "catalog"],
  finance: ["today", "people", "money"],
  clinical: ["today", "sessions", "people"],
};

// The figure each scope's Today leads with -- its own work, not a full
// admin's. A finance admin used to open on "Sessions today".
const LEAD_FIGURE: Record<string, string> = {
  operations: "Unassigned sessions",
  finance: "Owed to therapists",
  clinical: "Recommendations",
};

test.describe("Suite S: scoped admin dashboards", () => {
  for (const scope of ["operations", "finance", "clinical"]) {
    test(`S-00${["operations", "finance", "clinical"].indexOf(scope) + 1}: a ${scope} admin opens on their own work, with nowhere dead to tap`, async ({
      browser,
    }) => {
      test.setTimeout(120_000);
      const admin = adminClient();
      const adminId = await profileIdFor(admin, QA_EMAILS.admin);
      const context = await browser.newContext();

      try {
        await admin.from("profiles").update({ admin_scope: scope }).eq("id", adminId);
        await context.addCookies(await browserCookiesFor(QA_EMAILS.admin));
        const page = await context.newPage();
        await page.goto(`${BASE}/admin/dashboard`);

        // The scope reached the render at all.
        await expect(page.getByText(LEAD_FIGURE[scope], { exact: true })).toBeVisible({
          timeout: 60_000,
        });

        // Every quick action lands somewhere this scope may go. Before, they
        // were hardcoded at Sessions and Money for everybody.
        const targets = await quickActionSections(page);
        expect(targets.length).toBeGreaterThan(0);
        for (const target of targets) {
          expect(SECTIONS_BY_SCOPE[scope], `${scope} was offered ${target}`).toContain(target);
        }

        // ...and the screen says why the sidebar is shorter than a
        // colleague's, rather than leaving a missing section reading as a
        // fault.
        await expect(page.getByRole("heading", { name: "Your access" })).toBeVisible();
      } finally {
        await context.close();
        // Explicitly back to full rather than to whatever was read a moment
        // ago -- an interrupted earlier run must not make a narrowing
        // permanent for every later spec. Same reasoning as F-004.
        await admin.from("profiles").update({ admin_scope: "full" }).eq("id", adminId);
      }
    });
  }

  test("S-004: a full admin is told nothing about access, and keeps every action", async ({
    browser,
  }) => {
    test.setTimeout(120_000);
    const admin = adminClient();
    const adminId = await profileIdFor(admin, QA_EMAILS.admin);
    const context = await browser.newContext();

    try {
      await admin.from("profiles").update({ admin_scope: "full" }).eq("id", adminId);
      await context.addCookies(await browserCookiesFor(QA_EMAILS.admin));
      const page = await context.newPage();
      await page.goto(`${BASE}/admin/dashboard`);

      await expect(page.getByText("Sessions today", { exact: true })).toBeVisible({
        timeout: 60_000,
      });
      // Nothing is withheld, so there is nothing to account for -- a card
      // saying "you can open everything" is a line nobody needs to read.
      await expect(page.getByRole("heading", { name: "Your access" })).toHaveCount(0);
      expect(await quickActionSections(page)).toContain("money");
    } finally {
      await context.close();
      await admin.from("profiles").update({ admin_scope: "full" }).eq("id", adminId);
    }
  });
});
