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
import { BASE, answerCookieConsent, waitForSplashToClear } from "./helpers";

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
  "/patient/login",
  "/patient/login?tab=register",
  "/therapist/login",
  "/hospital/login",
  "/reset-password",
];

const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

async function open(page: Page, path: string) {
  // Answer the cookie pop-up up front so it is not part of every scan; the
  // pop-up itself is scanned in A11Y-003.
  await answerCookieConsent(page);
  const res = await page.goto(`${BASE}${path}`);
  await waitForSplashToClear(page);
  await settle(page);
  return res;
}

/**
 * Scan the page as a visitor reads it, not mid-entrance. /book holds its
 * times back until the open hours arrive and then fades them in (0.22 s);
 * a scan that landed inside that fade read the half-transparent chips as a
 * contrast failure. Wait for the "Checking available times" state to clear,
 * then for every finite animation on the page to finish -- the infinite
 * ones (the hero's scroll cue) are left running.
 */
async function settle(page: Page) {
  await page
    .getByTestId("booking-hours-checking")
    .waitFor({ state: "hidden", timeout: 15_000 })
    .catch(() => {});
  await page.evaluate(async () => {
    const finite = document
      .getAnimations()
      .filter((a) => Number.isFinite(Number(a.effect?.getComputedTiming().endTime)));
    await Promise.race([
      Promise.all(finite.map((a) => a.finished.catch(() => undefined))),
      new Promise((resolve) => setTimeout(resolve, 3_000)),
    ]);
  });
  // motion may drive the fade on the main thread rather than as a Web
  // Animation, which getAnimations() does not see: wait for the times
  // themselves to be fully opaque too.
  await page
    .waitForFunction(
      () => {
        const label = document.getElementById("booking-time-label");
        for (let el: Element | null = label; el; el = el.parentElement) {
          if (Number(getComputedStyle(el).opacity) < 1) return false;
        }
        return true;
      },
      undefined,
      { timeout: 5_000 }
    )
    .catch(() => {});
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

test("A11Y-003 the cookie card passes axe and every control is reachable by keyboard", async ({ page }) => {
  test.skip(!process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID, "The card shows only when analytics is configured.");
  await page.goto(`${BASE}/faq`);
  const card = page.getByRole("region", { name: "Cookie settings" });
  await expect(card).toBeVisible({ timeout: 15_000 });
  const results = await new AxeBuilder({ page }).include('[data-testid="cookie-consent"]').withTags(WCAG_TAGS).analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
  // Not a modal, so focus is not trapped -- but each of its controls must be
  // a Tab stop with a visible ring.
  for (const name of ["Customise", "Reject", "Accept"]) {
    const button = card.getByRole("button", { name, exact: true });
    await button.focus();
    await expect(button).toBeFocused();
  }
});

test("AUTH-UI-001 the sign-in doors put a sharp photo beside a teal form, framed at every width", async ({ page }) => {
  const doors = [
    { path: "/patient/login", alt: /shoulder stretch/, swap: { tab: "Register Account", alt: /video session/ } },
    { path: "/therapist/login", alt: /headset/, swap: { tab: "Apply to Join", alt: /desk with a laptop/ } },
    { path: "/hospital/login", alt: /X-ray/, swap: null },
  ];
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 860 });
    for (const door of doors) {
      await open(page, door.path);
      const photo = page.getByTestId("auth-photo");
      await expect(photo).toBeVisible();
      await expect(photo).toHaveAttribute("alt", door.alt);
      // Loaded, and at least as many pixels as it is drawn with - never a
      // thumbnail stretched to fit (next/image serves a phone-sized copy on
      // a phone, which is right).
      await expect
        .poll(() =>
          photo.evaluate((img: HTMLImageElement) =>
            img.complete && img.naturalWidth > 0 ? img.naturalWidth - img.getBoundingClientRect().width * devicePixelRatio : -1
          )
        )
        .toBeGreaterThanOrEqual(0);
      const box = await page.getByTestId("auth-split").boundingBox();
      const pic = await photo.boundingBox();
      expect(box && pic).toBeTruthy();
      if (width < 768) {
        // A 4:3 strip above the form, the full width of the card.
        expect(Math.abs(pic!.width / pic!.height - 4 / 3)).toBeLessThan(0.05);
      } else {
        // Beside the form: half the card.
        expect(Math.abs(pic!.width - box!.width / 2)).toBeLessThan(4);
      }
      // The door is teal: the submit button is teal, never purple or blue.
      const cls = await page.getByRole("button", { name: "Sign In", exact: true }).last().getAttribute("class");
      expect(cls).toContain("bg-teal-700");
      expect(cls).not.toMatch(/purple|blue/);
      if (door.swap) {
        await page.getByRole("button", { name: door.swap.tab }).click();
        await expect(page.getByTestId("auth-photo")).toHaveAttribute("alt", door.swap.alt);
      }
    }
  }
});
