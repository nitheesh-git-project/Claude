// Accessibility of the public pages and the sign-in doors: an axe-core scan
// against WCAG 2.2 A/AA (alt text, colour contrast, labels, landmarks,
// ARIA), and a keyboard walk proving Tab moves through the page with a
// visible focus and never gets stuck.
//
// Run before every merge to staging (CLAUDE.md, "Before a push"):
//   npm run test:a11y
// A new public page joins PAGES in the same change. Read-only.
import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { BASE, waitForSplashToClear } from "./helpers";

const PAGES = [
  "/",
  "/conditions",
  "/how-it-works",
  "/home-visit",
  "/team",
  "/mission",
  "/faq",
  "/hospitals",
  "/privacy",
  "/terms",
  "/refunds",
  "/cookies",
  "/medical-disclaimer",
  "/grievances",
  "/book",
  "/book-home-visit",
  "/get-started",
  "/therapist/login",
  "/hospital/login",
  "/reset-password",
];

const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

async function open(page: Page, path: string) {
  // Decline analytics up front so the consent card is not part of every scan
  // (it has its own spec, analytics-consent).
  await page.addInitScript(() => {
    try {
      localStorage.setItem("mr_analytics_consent", "denied");
    } catch {}
  });
  const res = await page.goto(`${BASE}${path}`);
  await waitForSplashToClear(page);
  return res;
}

test.describe("A11Y-001 axe finds no WCAG 2.2 AA violation", () => {
  for (const path of PAGES) {
    test(path, async ({ page }) => {
      const res = await open(page, path);
      // /home-visit and /book-home-visit 404 while home visits are off;
      // a 404 page is still scanned, it just says so.
      expect(res?.status() ?? 0).toBeLessThan(500);
      const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
      const summary = results.violations.map(
        (v) => `${v.id} (${v.impact}): ${v.help}\n    ${v.nodes.map((n) => n.target.join(" ")).join("\n    ")}`
      );
      expect(summary, summary.join("\n")).toEqual([]);
    });
  }
});

test("A11Y-002 the keyboard reaches the page, shows focus and is never trapped", async ({ page }) => {
  for (const path of ["/", "/book", "/privacy"]) {
    await open(page, path);
    const seen = new Set<string>();
    let stuck = 0;
    let last = "";
    for (let i = 0; i < 40; i++) {
      await page.keyboard.press("Tab");
      const info = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        if (!el || el === document.body) return null;
        // The debug bar is a developer tool, off in production.
        if (el.closest("[data-debug-bar]")) return { skip: true as const };
        const r = el.getBoundingClientRect();
        const s = getComputedStyle(el);
        const ring =
          (s.outlineStyle !== "none" && parseFloat(s.outlineWidth) > 0) ||
          (s.boxShadow && s.boxShadow !== "none");
        return {
          key: `${el.tagName}|${el.getAttribute("href") ?? ""}|${el.textContent?.trim().slice(0, 40) ?? ""}|${Math.round(r.top + window.scrollY)}`,
          visible: r.width > 0 && r.height > 0,
          ring: !!ring,
        };
      });
      if (!info || "skip" in info) continue;
      expect(info.visible, `${path}: focus landed on an invisible element ${info.key}`).toBe(true);
      expect(info.ring, `${path}: no visible focus indicator on ${info.key}`).toBe(true);
      stuck = info.key === last ? stuck + 1 : 0;
      expect(stuck, `${path}: focus stuck on ${info.key}`).toBeLessThan(3);
      last = info.key;
      seen.add(info.key);
    }
    expect(seen.size, `${path}: Tab reached too few controls`).toBeGreaterThan(5);
  }
});
