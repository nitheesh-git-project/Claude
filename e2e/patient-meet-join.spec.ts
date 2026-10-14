// The Meet link is reachable only inside the join window.
//
// No Google call anywhere: the gate refuses Google credentials, so the meet
// link is written straight onto the appointment row -- exactly what a
// successful Calendar sync would have stored -- and the spec reads what the
// patient's session tile does with it before, inside and after the window
// (`JoinSessionButton`: open from slot - join_window_minutes to
// slot + duration + join_window_after_minutes, and "Session Completed" from
// slot + session_completed_after_minutes on). The boundaries are read from
// site_settings rather than assumed, so an admin's setting moves the
// fixtures with it. The no-link note is meet-link-note.spec.ts; the
// completed cutoff's own setting is session-completed-cutoff.spec.ts.
import { test, expect, type Page } from "@playwright/test";
import {
  BASE,
  QA_EMAILS,
  adminClient,
  browserCookiesFor,
  createFixtureAccount,
  deleteFixtureAccount,
  profileIdFor,
  waitForSplashToClear,
} from "./helpers";
import { formatClinicTime } from "../src/lib/formatDateTime";

const db = adminClient();
const MIN = 60_000;
const STAMP = Date.now().toString(36);

type Seeded = { id: string; code: string; link: string; slot: string };

let patient: { id: string; email: string; name: string };
let windowBefore = 15;
const sessions: Record<"early" | "live" | "late" | "over", Seeded | null> = {
  early: null,
  live: null,
  late: null,
  over: null,
};

async function seed(name: keyof typeof sessions, slotMs: number, durationMinutes: number, therapistId: string) {
  const slot = new Date(slotMs);
  slot.setSeconds(0, 0);
  const link = `https://meet.google.com/e2e-${name}-${STAMP}`;
  const { data, error } = await db
    .from("appointments")
    .insert({
      patient_id: patient.id,
      therapist_id: therapistId,
      slot_time: slot.toISOString(),
      status: "confirmed",
      payment_status: "paid",
      visit_mode: "online",
      duration_minutes: durationMinutes,
      meet_link: link,
      concern: `E2E meet-join ${name}`,
    })
    .select("id, session_code")
    .single();
  if (error || !data) throw new Error(`could not seed the ${name} session: ${error?.message}`);
  sessions[name] = { id: data.id, code: data.session_code, link, slot: slot.toISOString() };
}

test.beforeAll(async () => {
  const { data: settings } = await db
    .from("site_settings")
    .select("join_window_minutes, join_window_after_minutes, session_completed_after_minutes")
    .maybeSingle();
  windowBefore = settings?.join_window_minutes ?? 15;
  const windowAfter = settings?.join_window_after_minutes ?? 15;
  const completedAfter = settings?.session_completed_after_minutes ?? 60;

  patient = await createFixtureAccount("meet join");
  const therapistId = await profileIdFor(db, QA_EMAILS.therapistA);
  const now = Date.now();
  // The window opens two hours from now: the link exists, the window is shut.
  await seed("early", now + (windowBefore + 120) * MIN, 30, therapistId);
  // Started a minute ago: inside the window on any setting.
  await seed("live", now - 1 * MIN, 30, therapistId);
  // Window closed (slot + 15 + after) but not yet completed (slot + cutoff):
  // the grace an admin can make unreachable, so seeded only when it exists.
  const lateDuration = 15;
  if (completedAfter - (lateDuration + windowAfter) >= 4) {
    const midpoint = lateDuration + windowAfter + (completedAfter - lateDuration - windowAfter) / 2;
    await seed("late", now - midpoint * MIN, lateDuration, therapistId);
  }
  // Long over, and never closed by anybody.
  await seed("over", now - (completedAfter + 120) * MIN, 30, therapistId);
});

test.afterAll(async () => {
  await deleteFixtureAccount(patient?.id);
});

/** The join control on one seeded session's own card, found by its code. */
function joinControl(page: Page, code: string) {
  return page
    .getByText(code, { exact: true })
    .locator("xpath=ancestor::li[1]")
    .getByRole("button", { name: /Tap to Join|Session Completed|Session Cancelled/ });
}

test("MJ-001: the link opens only inside the join window -- shut before, live during, shut after, completed at the cutoff", async ({
  page,
}) => {
  test.setTimeout(90_000);
  // A tap opens the link in a new tab. Record it rather than leave the
  // browser for meet.google.com, which the gate's resolver refuses anyway.
  await page.addInitScript(() => {
    const opened: string[] = [];
    (window as unknown as { __opened: string[] }).__opened = opened;
    window.open = ((url?: string | URL) => {
      opened.push(String(url));
      return null;
    }) as typeof window.open;
  });
  await page.context().addCookies(await browserCookiesFor(patient.email));
  await page.goto(`${BASE}/patient/dashboard/sessions`, { waitUntil: "domcontentloaded" });
  await waitForSplashToClear(page);

  // Every seeded session is on "All"; the live and late ones have started,
  // so Upcoming is not where to look. Click until the filter says pressed --
  // a click before hydration is dropped.
  const all = page.getByRole("button", { name: /^All/ }).first();
  await expect(all).toBeVisible({ timeout: 60_000 });
  await expect(async () => {
    await all.click();
    await expect(all).toHaveAttribute("aria-pressed", "true", { timeout: 2_000 });
  }).toPass({ timeout: 30_000 });

  const early = sessions.early!;
  const live = sessions.live!;
  const over = sessions.over!;

  // Before: the button is there and shut, and says when it opens -- as a
  // clock time in the clinic's zone.
  const earlyButton = joinControl(page, early.code);
  await expect(earlyButton).toHaveText("Tap to Join", { timeout: 60_000 });
  await expect(earlyButton).toBeDisabled();
  const opensAt = formatClinicTime(new Date(new Date(early.slot).getTime() - windowBefore * MIN));
  const earlyCaption =
    windowBefore > 0
      ? `Opens at ${opensAt} - ${windowBefore} minutes before the session.`
      : `Opens at ${opensAt}, the session time.`;
  await expect(earlyButton.locator("xpath=..")).toContainText(earlyCaption);

  // Inside: live, and a tap opens this session's own link.
  const liveButton = joinControl(page, live.code);
  await expect(liveButton).toHaveText("Tap to Join");
  await expect(liveButton).toBeEnabled();
  await expect(liveButton.locator("xpath=..")).toContainText("Opens straight into the call");
  await liveButton.click();
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { __opened: string[] }).__opened))
    .toEqual([live.link]);

  // A tap on a shut button opens nothing.
  await earlyButton.click({ force: true });
  expect(await page.evaluate(() => (window as unknown as { __opened: string[] }).__opened)).toEqual([live.link]);

  // After the window, before the cutoff: shut again, not yet "completed".
  if (sessions.late) {
    const lateButton = joinControl(page, sessions.late.code);
    await expect(lateButton).toHaveText("Tap to Join");
    await expect(lateButton).toBeDisabled();
  }

  // Past the cutoff: completed, shut, and no caption inviting a join.
  const overButton = joinControl(page, over.code);
  await expect(overButton).toHaveText("Session Completed");
  await expect(overButton).toBeDisabled();
  await expect(overButton.locator("xpath=..")).not.toContainText("Opens");

  // No seeded link is ever printed as a link the page hands out by itself:
  // the only way to it is the button, which the window governs.
  for (const s of [early, live, over]) {
    await expect(page.locator(`a[href="${s.link}"]`)).toHaveCount(0);
  }
});
