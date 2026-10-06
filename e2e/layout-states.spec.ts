// LAYOUT STATES: the layout audit for what only exists after a tap -- menus,
// drawers, dialogs and wizard steps -- at the same 17 viewports as
// e2e/layout-audit.spec.ts, with the same in-page checks
// (e2e/layout/layoutProbe.ts). Each state is opened at phone width, where
// the phone-only controls exist, then resized through the whole matrix.
//
// Seeds one confirmed session for the therapist's finish dialog and deletes
// it afterwards; everything else only looks.
import { test, expect, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { BASE, QA_EMAILS, adminClient, browserCookiesFor, pageUntilVisible, profileIdFor } from "./helpers";
import { probeLayout, type LayoutIssue } from "./layout/layoutProbe";
import { LAYOUT_VIEWPORTS } from "./layout/viewports";

const db = adminClient();
const OUT = process.env.LAYOUT_OUT ?? path.join("test-results", "layout-states");
const MARKER = "E2E layout-states";

type State = {
  name: string;
  email: string | null;
  path: string;
  open: (page: Page) => Promise<void>;
  /** Where the state is opened: phone width by default, where the
   *  phone-only controls exist; desktop for desktop-only ones. */
  openWidth?: number;
  /** Data this state needs, created before the page loads. */
  seed?: () => Promise<void>;
};

async function settle(page: Page) {
  await page
    .waitForFunction(() => !document.documentElement.hasAttribute("data-splash"), null, { timeout: 30_000 })
    .catch(() => {});
  await page.waitForLoadState("networkidle", { timeout: 8_000 }).catch(() => {});
}

const STATES: State[] = [
  {
    name: "public menu open",
    email: null,
    path: "/",
    open: async (page) => page.getByRole("button", { name: "Toggle menu" }).click(),
  },
  {
    name: "patient dashboard More sheet open",
    email: QA_EMAILS.patientB,
    path: "/patient/dashboard",
    open: async (page) => page.getByRole("button", { name: "Open menu" }).click(),
  },
  {
    name: "admin dashboard menu open",
    email: QA_EMAILS.admin,
    path: "/admin/dashboard?section=today&tab=overview",
    open: async (page) => page.getByRole("button", { name: "Open menu" }).click(),
  },
  {
    name: "booking wizard step 2",
    email: null,
    path: "/book",
    open: async (page) => {
      await page.getByRole("button", { name: /Continue to Medical Details/ }).click();
    },
  },
  {
    name: "programme scheduler open",
    email: QA_EMAILS.patientB,
    path: "/patient/dashboard/packages",
    open: async (page) => {
      await page.getByRole("button", { name: "Schedule sessions" }).first().click();
      await expect(page.getByRole("dialog")).toBeVisible();
    },
  },
  {
    name: "therapist finish dialog with recommendation",
    email: QA_EMAILS.therapistA,
    path: "/therapist/dashboard/sessions",
    seed: seedStartedSession,
    open: async (page) => {
      const card = page.locator("div.rounded-xl", { hasText: MARKER }).first();
      expect(await pageUntilVisible(page, "sessions", card)).toBe(true);
      await card.getByRole("button", { name: "Done", exact: true }).click();
      const dialog = page.getByRole("dialog").first();
      await dialog.getByRole("button", { name: "Add a recommendation" }).click();
    },
  },
  {
    name: "admin session drawer open",
    email: QA_EMAILS.admin,
    openWidth: 1280,
    path: "/admin/dashboard?section=sessions&tab=all",
    open: async (page) => {
      await page.locator("tbody tr:visible").first().click();
      await page.waitForTimeout(800);
    },
  },
];

let seededId: string | null = null;

/** A confirmed, started session for the finish dialog, in an hour therapist A
 *  is free (the per-therapist slot index refuses a clash). */
async function seedStartedSession() {
  const patientId = await profileIdFor(db, "qa.patient.c@example.test");
  const therapistId = await profileIdFor(db, QA_EMAILS.therapistA);
  await db.from("appointments").delete().eq("concern", MARKER);
  for (const hoursAgo of [2, 3, 4, 5, 6, 7, 8, 9, 10]) {
    const slot = new Date(Date.now() - hoursAgo * 3_600_000);
    slot.setMinutes(0, 0, 0);
    const { data, error } = await db
      .from("appointments")
      .insert({
        patient_id: patientId,
        therapist_id: therapistId,
        slot_time: slot.toISOString(),
        status: "confirmed",
        payment_status: "paid",
        duration_minutes: 30,
        visit_mode: "online",
        concern: MARKER,
      })
      .select("id")
      .single();
    if (!error && data) {
      seededId = data.id;
      return;
    }
  }
  throw new Error("could not find a free hour to seed the finish-dialog session");
}

test.beforeAll(() => {
  fs.mkdirSync(OUT, { recursive: true });
});

test.afterAll(async () => {
  if (seededId) await db.from("appointments").delete().eq("id", seededId);
});

for (const state of STATES) {
  test(`LAYOUT-STATE: ${state.name}`, async ({ browser }) => {
    test.setTimeout(240_000);
    const context = await browser.newContext({
      reducedMotion: "reduce",
      viewport: { width: state.openWidth ?? 390, height: 844 },
    });
    if (state.seed) await state.seed();
    if (state.email) await context.addCookies(await browserCookiesFor(state.email));
    const page = await context.newPage();
    await page.goto(`${BASE}${state.path}`, { waitUntil: "domcontentloaded" });
    await settle(page);
    await state.open(page);
    await page.waitForTimeout(600);

    const byIssue = new Map<string, { issue: LayoutIssue; viewports: string[] }>();
    for (const vp of LAYOUT_VIEWPORTS) {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.evaluate(
        () => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 120))))
      );
      for (const issue of await page.evaluate(probeLayout)) {
        const key = `${issue.kind}|${issue.where}|${issue.detail.replace(/\d+/g, "#")}`;
        const entry = byIssue.get(key) ?? { issue, viewports: [] };
        entry.viewports.push(vp.name);
        byIssue.set(key, entry);
      }
    }
    const findings = [...byIssue.values()];
    fs.writeFileSync(
      path.join(OUT, `${state.name.replace(/[^a-z0-9]+/gi, "_")}.json`),
      JSON.stringify({ state: state.name, findings }, null, 2)
    );
    await context.close();
    expect(
      findings.map((f) => `${f.issue.kind}: ${f.issue.where} - ${f.issue.detail} [${f.viewports.length} viewports]`),
      `${state.name} has layout problems`
    ).toEqual([]);
  });
}
