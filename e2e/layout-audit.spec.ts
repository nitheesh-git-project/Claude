// LAYOUT AUDIT: every page, for every role, at every screen shape the owner
// named -- 20:9, 19.5:9, 16:9, 16:10, 5:3, 7:5, 22:9, 22.5:18 (5:4) and the
// 12.9" iPad (2048x2732) -- with no sideways scroll, nothing running off the
// edge, no silently clipped text and no text or control drawn over another.
//
// Each page is loaded once and resized through the whole matrix (a reload
// per size would cost twenty minutes and prove nothing a resize does not).
// The in-page checks live in e2e/layout/layoutProbe.ts. Every finding is
// written to test-results/layout-audit/<page>.json, then the test fails if
// there were any.
//
// Read-only: it signs in with the QA fixtures and looks. `LAYOUT_ONLY=<substr>`
// narrows it to matching pages while fixing.
import { test, expect, type Page, type BrowserContext } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { BASE, QA_EMAILS, adminClient, browserCookiesFor, profileIdFor } from "./helpers";
import { ADMIN_SECTIONS } from "../src/lib/adminNav";
import { probeLayout, type LayoutIssue } from "./layout/layoutProbe";

import { LAYOUT_VIEWPORTS } from "./layout/viewports";

type Role = "public" | "patient" | "therapist" | "hospital" | "admin";
type Target = { role: Role; path: string };

const db = adminClient();

function targets(ids: { patientA: string; therapistA: string; firstCategory: string | null }): Target[] {
  const list: Target[] = [];
  for (const p of [
    "/", "/conditions", "/how-it-works", "/home-visit", "/mission", "/team", "/faq", "/hospitals",
    "/book", "/book-home-visit", "/get-started", "/patient/login", "/patient/register", "/therapist/login",
    "/hospital/login", "/admin/login", "/reset-password", "/developer", "/developer/lets-talk",
  ]) list.push({ role: "public", path: p });
  for (const p of ["", "/book", "/suggested", "/sessions", "/packages", "/payments", "/health-profile", "/profile"])
    list.push({ role: "patient", path: `/patient/dashboard${p}` });
  for (const p of ["", "/availability", "/sessions", "/earnings", "/health-profile", `/health-profile/${ids.patientA}`, "/profile"])
    list.push({ role: "therapist", path: `/therapist/dashboard${p}` });
  for (const p of ["", "/refer", "/referrals", "/revenue", "/profile"])
    list.push({ role: "hospital", path: `/hospital/dashboard${p}` });
  for (const s of ADMIN_SECTIONS)
    for (const t of s.tabs) list.push({ role: "admin", path: `/admin/dashboard?section=${s.key}&tab=${t.key}` });
  list.push({ role: "admin", path: `/admin/dashboard/patients/${ids.patientA}` });
  list.push({ role: "admin", path: `/admin/dashboard/therapists/${ids.therapistA}` });
  if (ids.firstCategory) list.push({ role: "admin", path: `/admin/dashboard/conditions/${ids.firstCategory}` });
  const only = process.env.LAYOUT_ONLY;
  return only ? list.filter((t) => only.split(",").some((o) => `${t.role}:${t.path}`.includes(o))) : list;
}

const EMAIL: Record<Exclude<Role, "public">, string> = {
  patient: QA_EMAILS.patientA,
  therapist: QA_EMAILS.therapistA,
  hospital: QA_EMAILS.hospital,
  admin: QA_EMAILS.admin,
};

async function settle(page: Page) {
  await page
    .waitForFunction(() => !document.documentElement.hasAttribute("data-splash"), null, { timeout: 30_000 })
    .catch(() => {});
  await page.waitForLoadState("networkidle", { timeout: 8_000 }).catch(() => {});
}

async function frames(page: Page) {
  await page.evaluate(
    () => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 120))))
  );
}

const OUT = process.env.LAYOUT_OUT ?? path.join("test-results", "layout-audit");

let ids = { patientA: "", therapistA: "", firstCategory: null as string | null };
const ALL = targets({ patientA: "PATIENT", therapistA: "THERAPIST", firstCategory: "CATEGORY" });

test.describe.configure({ mode: "parallel" });

test.beforeAll(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  ids = {
    patientA: await profileIdFor(db, QA_EMAILS.patientA),
    therapistA: await profileIdFor(db, QA_EMAILS.therapistA),
    firstCategory:
      ((await db.from("treatment_categories").select("id").eq("active", true).order("display_order").limit(1).maybeSingle())
        .data?.id as string | undefined) ?? null,
  };
});

const cookieCache = new Map<Role, Awaited<ReturnType<typeof browserCookiesFor>>>();
async function signIn(context: BrowserContext, role: Role) {
  if (role === "public") return;
  if (!cookieCache.has(role)) cookieCache.set(role, await browserCookiesFor(EMAIL[role]));
  await context.addCookies(cookieCache.get(role)!);
}

for (const t of ALL) {
  const label = `${t.role}:${t.path}`;
  test(`LAYOUT: ${label}`, async ({ browser }) => {
    test.setTimeout(240_000);
    const realPath = t.path
      .replace("PATIENT", ids.patientA)
      .replace("THERAPIST", ids.therapistA)
      .replace("CATEGORY", ids.firstCategory ?? "");
    const context = await browser.newContext({ reducedMotion: "reduce", viewport: { width: 1280, height: 800 } });
    await signIn(context, t.role);
    const page = await context.newPage();
    const res = await page.goto(`${BASE}${realPath}`, { waitUntil: "domcontentloaded" });
    expect(res?.status() ?? 200, `${realPath} loads`).toBeLessThan(500);
    await settle(page);

    const byIssue = new Map<string, { issue: LayoutIssue; viewports: string[] }>();
    for (const vp of LAYOUT_VIEWPORTS) {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await frames(page);
      const found = await page.evaluate(probeLayout);
      for (const issue of found) {
        const key = `${issue.kind}|${issue.where}|${issue.detail.replace(/\d+/g, "#")}`;
        const entry = byIssue.get(key) ?? { issue, viewports: [] };
        entry.viewports.push(vp.name);
        byIssue.set(key, entry);
      }
      if (found.length > 0 && process.env.LAYOUT_SHOTS) {
        await page.screenshot({
          path: path.join(OUT, `${label.replace(/[^a-z0-9]+/gi, "_")}__${vp.width}x${vp.height}.png`),
          fullPage: true,
        });
      }
    }
    const findings = [...byIssue.values()];
    fs.writeFileSync(
      path.join(OUT, `${label.replace(/[^a-z0-9]+/gi, "_")}.json`),
      JSON.stringify({ page: realPath, role: t.role, findings }, null, 2)
    );
    await context.close();
    expect(
      findings.map((f) => `${f.issue.kind}: ${f.issue.where} - ${f.issue.detail} [${f.viewports.length} viewports]`),
      `${label} has layout problems`
    ).toEqual([]);
  });
}
