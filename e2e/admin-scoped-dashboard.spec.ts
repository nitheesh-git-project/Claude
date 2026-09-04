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
import {
  BASE,
  QA_EMAILS,
  adminClient,
  browserCookiesFor,
  cookieHeaderFor,
  profileIdFor,
} from "./helpers";

/** The ?section= a link on the dashboard points at -- the only part of a
 *  dashboard href that scope decides. */
function sectionOf(href: string): string | null {
  return new URL(href, BASE).searchParams.get("section");
}

/**
 * Only what is actually on screen.
 *
 * Two things make a bare getByText useless on this dashboard, and both look
 * like product bugs when they bite. Every screen is mounted at once behind
 * `hidden` (AdminShell keeps a half-typed filter alive across tab changes),
 * so "Owed to therapists" also matches the Money glossary's own term list.
 * And the sidebar is rendered three times -- mobile bar, desktop rail,
 * drawer -- so the *first* match for the dashboard's name is the mobile top
 * bar, which is `lg:hidden` at this viewport.
 */
function onScreen(page: Page, text: string) {
  return page.getByText(text, { exact: true }).filter({ visible: true });
}

async function quickActionSections(page: Page): Promise<string[]> {
  const links = page.locator('section:has(h2:has-text("Quick actions")) a').filter({ visible: true });
  await expect(links.first()).toBeVisible({ timeout: 60_000 });
  const hrefs = await links.evaluateAll((els) =>
    els.map((e) => (e as HTMLAnchorElement).getAttribute("href") ?? "")
  );
  return hrefs.map(sectionOf).filter((s): s is string => s !== null);
}

// What each scope's sidebar offers. Finance carries Sessions at `view`:
// they open it and read it, and every mutating control is absent while the
// routes refuse them regardless -- so it belongs in this list (the sidebar
// does show it) even though S-004 below proves they cannot change anything
// in it.
const SECTIONS_BY_SCOPE: Record<string, string[]> = {
  operations: ["today", "sessions", "people", "catalog"],
  finance: ["today", "sessions", "people", "money"],
  clinical: ["today", "sessions", "people"],
};

// The figure each scope's Today leads with -- its own work, not a full
// admin's. A finance admin used to open on "Sessions today".
const LEAD_FIGURE: Record<string, string> = {
  operations: "Unassigned sessions",
  finance: "Owed to therapists",
  clinical: "Recommendations",
};

// What each dashboard calls itself, in the sidebar brand and the header
// eyebrow (ADMIN_SCOPE_LABELS). Four dashboards that all said "Admin Panel"
// left an admin working out which one they were on from which sidebar
// entries were missing.
const DASHBOARD_NAME: Record<string, string> = {
  full: "Master Admin",
  operations: "Operations",
  finance: "Finance",
  clinical: "Clinical",
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

        // The scope reached the render at all: its own lead figure is on
        // screen. Deliberately not an exact count -- clinical's lead figure
        // and its primary quick action are both called "Recommendations",
        // which is correct and would make an exact count a trap. *Which*
        // figure a scope leads with is asserted without a browser, in
        // src/lib/adminHome.test.ts.
        await expect(onScreen(page, LEAD_FIGURE[scope]).first()).toBeVisible({ timeout: 60_000 });

        // ...and the dashboard says which one it is, in both places: the
        // sidebar brand and the header eyebrow above the section title.
        await expect(onScreen(page, DASHBOARD_NAME[scope])).toHaveCount(2);

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

      await expect(onScreen(page, "Sessions today")).toHaveCount(1, { timeout: 60_000 });
      // A full admin's dashboard names itself too -- "Master Admin", not a
      // generic "Admin Panel" that says nothing about which of the four
      // this is. Two on screen; the copy in Team & Access's scope picker is
      // on a mounted-but-hidden screen and does not count.
      await expect(onScreen(page, DASHBOARD_NAME.full)).toHaveCount(2);
      // Nothing is withheld, so there is nothing to account for -- a card
      // saying "you can open everything" is a line nobody needs to read.
      await expect(page.getByRole("heading", { name: "Your access" })).toHaveCount(0);
      expect(await quickActionSections(page)).toContain("money");
    } finally {
      await context.close();
      await admin.from("profiles").update({ admin_scope: "full" }).eq("id", adminId);
    }
  });

  test("S-005: spamming the sidebar leaves the dashboard saying the same thing", async ({
    browser,
  }) => {
    // Nothing this feature added is a button that writes -- the Today screen
    // is a render. What it can still get wrong is identity under churn: the
    // header eyebrow and the sidebar brand re-render on every tab change
    // (AdminShell keeps every screen mounted and swaps which is hidden), so
    // a name that duplicated or vanished after enough navigations would be
    // a real defect nobody would find by clicking twice.
    test.setTimeout(180_000);
    const admin = adminClient();
    const adminId = await profileIdFor(admin, QA_EMAILS.admin);
    const context = await browser.newContext();

    const consoleErrors: string[] = [];
    try {
      await admin.from("profiles").update({ admin_scope: "operations" }).eq("id", adminId);
      await context.addCookies(await browserCookiesFor(QA_EMAILS.admin));
      const page = await context.newPage();
      // A duplicate React key -- two stat cells sharing a label, two quick
      // actions sharing href+label -- is a console error and nothing else.
      // It renders three figures where four were computed and says so only
      // here.
      //
      // Requests are split by host rather than ignored wholesale. This
      // sandbox blocks the *browser* from reaching Supabase (AGENTS.md's
      // third environment note), so RealtimeRefresh's socket dies with
      // ERR_CONNECTION_RESET on every run and says nothing about the app.
      // A failed request to the app's own origin is a real fault and still
      // fails this test.
      const blockedExternal: string[] = [];
      page.on("requestfailed", (req) => {
        const host = new URL(req.url()).hostname;
        if (host === "localhost" || host === "127.0.0.1") {
          consoleErrors.push(`request failed: ${req.url()} — ${req.failure()?.errorText}`);
        } else {
          blockedExternal.push(req.url());
        }
      });
      page.on("console", (m) => {
        // "Failed to load resource" is the console half of a requestfailed
        // that the listener above has already judged on its host.
        if (m.type() === "error" && !m.text().startsWith("Failed to load resource")) {
          consoleErrors.push(m.text());
        }
      });
      page.on("pageerror", (e) => consoleErrors.push(`pageerror: ${e.message}`));

      await page.goto(`${BASE}/admin/dashboard`);
      await expect(onScreen(page, "Unassigned sessions").first()).toBeVisible({ timeout: 60_000 });

      // The sidebar is in the DOM three times (mobile bar, desktop rail,
      // drawer), so a bare .first() picks one that is hidden at this width
      // and the click waits for it forever. Only the desktop nav is visible.
      const sidebar = page.locator("nav").filter({ visible: true }).first();
      // Anchored regex, not an exact name: a section carrying a queue badge
      // reads "Sessions\n1" to the accessibility tree, so an exact match
      // finds nothing the moment the clinic has work waiting -- which is
      // every real dashboard. `.first()` then takes the section button
      // rather than the same-named sub-tab below it.
      const sectionButton = (label: string) =>
        sidebar.getByRole("button", { name: new RegExp(`^${label}\\b`) }).first();

      const sections = ["Sessions", "People", "Catalog", "Today"];
      for (let round = 0; round < 6; round++) {
        for (const label of sections) {
          // No awaiting settle between clicks on purpose: this is the
          // double- and triple-tap a person actually does on a slow page.
          await sectionButton(label).click({ timeout: 15_000 });
        }
      }

      // Back on a known screen, the dashboard still names itself exactly
      // twice -- not zero (unmounted), not four (duplicated).
      await sectionButton("Today").click({ timeout: 15_000 });
      await expect(onScreen(page, "Operations")).toHaveCount(2);
      await expect(onScreen(page, "Unassigned sessions").first()).toBeVisible();

      // The URL agrees with what is on screen, rather than trailing the
      // clicks -- navigate() writes it with pushState on every change.
      expect(new URL(page.url()).searchParams.get("section")).toBe("today");

      // ...and a spammed section a scope cannot open is still not reachable
      // by typing it, after all that churn.
      await page.goto(`${BASE}/admin/dashboard?section=money&tab=payouts`);
      await expect(onScreen(page, "Unassigned sessions").first()).toBeVisible({ timeout: 60_000 });

      if (blockedExternal.length > 0) {
        console.log(
          `note: ${blockedExternal.length} request(s) to hosts this sandbox blocks (browser -> Supabase), ignored`
        );
      }
      expect(consoleErrors, `console errors:\n${consoleErrors.join("\n")}`).toEqual([]);
    } finally {
      await context.close();
      await admin.from("profiles").update({ admin_scope: "full" }).eq("id", adminId);
    }
  });

  test("S-007: finance reads Sessions and cannot change one", async ({ browser }) => {
    // The one grant that is neither all nor nothing. Two halves have to hold
    // together: the screen opens (or the level is a lie), and every route
    // under it refuses (or the level is decoration that a forgotten button
    // could undo). requireAdminScope asks for `manage`, which is what makes
    // the second half true at every route rather than only the ones a screen
    // remembered to gate.
    test.setTimeout(120_000);
    const admin = adminClient();
    const adminId = await profileIdFor(admin, QA_EMAILS.admin);
    const context = await browser.newContext();

    try {
      await admin.from("profiles").update({ admin_scope: "finance" }).eq("id", adminId);
      await context.addCookies(await browserCookiesFor(QA_EMAILS.admin));
      const page = await context.newPage();
      await page.goto(`${BASE}/admin/dashboard?section=sessions&tab=all`);

      // It opens and stays open: a section this scope could not reach would
      // fall back to Today rather than render.
      await expect(onScreen(page, "All Sessions").first()).toBeVisible({ timeout: 60_000 });

      // The screens that are nothing but actions are not offered at all --
      // hiding every control on those leaves a heading over an empty page.
      const hrefs = await page
        .locator('[href*="section=sessions"]')
        .evaluateAll((els) => els.map((e) => e.getAttribute("href") ?? ""));
      for (const href of hrefs) {
        expect(href, "finance was offered an action-only Sessions screen").not.toContain("tab=new");
        expect(href, "finance was offered an action-only Sessions screen").not.toContain(
          "tab=recommendations"
        );
      }

      // And the routes refuse regardless of what any screen shows.
      const cookie = await cookieHeaderFor(QA_EMAILS.admin);
      for (const route of [
        "/api/admin/assign-appointment",
        "/api/admin/update-appointment",
        "/api/admin/create-booking",
      ]) {
        const res = await fetch(`${BASE}${route}`, {
          method: "POST",
          headers: { Cookie: cookie, "Content-Type": "application/json" },
          body: JSON.stringify({}),
        });
        expect(res.status, `${route} let a view-only finance admin through`).toBe(403);
      }
    } finally {
      await admin.from("profiles").update({ admin_scope: "full" }).eq("id", adminId);
      await context.close();
    }
  });

  test("S-006: concurrent loads of one dashboard all agree", async () => {
    // The admin dashboard re-renders in full on every realtime event, so in
    // a busy clinic several renders overlap. buildAdminHome is pure and the
    // owed-to-therapists total is computed per render, but "pure" is a claim
    // until something runs it concurrently: shared mutable state would show
    // up as two loads disagreeing about the same figures.
    test.setTimeout(180_000);
    const cookie = await cookieHeaderFor(QA_EMAILS.admin);
    const loads = await Promise.all(
      Array.from({ length: 6 }, () =>
        fetch(`${BASE}/admin/dashboard`, { headers: { Cookie: cookie } }).then(async (r) => ({
          status: r.status,
          html: await r.text(),
        }))
      )
    );

    for (const load of loads) expect(load.status).toBe(200);

    // Every one of them names the same dashboard and reports the same
    // "Needs you" total. The figure is read out of the HTML rather than
    // asserted at a value -- what matters is that six overlapping renders
    // do not disagree.
    const needsYou = loads.map((l) => /Needs you<\/span>[\s\S]{0,200}?>(\d+)</.exec(l.html)?.[1]);
    expect(needsYou.every((n) => n !== undefined)).toBe(true);
    expect(new Set(needsYou).size, `disagreeing totals: ${needsYou.join(", ")}`).toBe(1);
    for (const load of loads) expect(load.html).toContain("Master Admin");
  });
});
