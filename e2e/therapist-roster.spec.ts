import { expect, test } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  BASE,
  QA_EMAILS,
  adminClient,
  browserCookiesFor,
  cookieHeaderFor,
  profileIdFor,
} from "./helpers";

// The therapist roster, end to end: the admin's screen, the therapist's own,
// the two APIs behind them, and -- the part that actually matters -- that
// effective availability comes out the same as it went in.
//
// The rule these tests exist to hold: the roster's UI changed completely,
// its data model did not. A weekly template row per enabled hour, a
// date-exception row per pinned hour, one leave flag. Anything that reads
// availability (today, and the booking engine if it ever gains an
// availability gate) must see exactly what it saw before.

const WEEKLY = "/api/admin/save-therapist-availability";
const EXCEPTION = "/api/admin/set-availability-exception";
const LEAVE = "/api/admin/set-therapist-on-leave";
const THERAPIST_WEEKLY = "/api/therapist/save-availability";

type Range = { startHour: number; endHour: number };

function days(entries: Record<number, Range[]>) {
  return [0, 1, 2, 3, 4, 5, 6].map((day) => ({
    day_of_week: day,
    ranges: entries[day] ?? [],
  }));
}

async function templateHours(admin: SupabaseClient, therapistId: string, dayOfWeek: number) {
  const { data } = await admin
    .from("therapist_availability_template")
    .select("hour")
    .eq("therapist_id", therapistId)
    .eq("day_of_week", dayOfWeek);
  return (data ?? []).map((r) => r.hour as number).sort((a, b) => a - b);
}

async function exceptionRows(admin: SupabaseClient, therapistId: string, date: string) {
  const { data } = await admin
    .from("therapist_availability_override")
    .select("hour, available")
    .eq("therapist_id", therapistId)
    .eq("date", date);
  return data ?? [];
}

async function scheduleVersion(admin: SupabaseClient, therapistId: string) {
  const { data } = await admin
    .from("therapist_schedule_state")
    .select("version")
    .eq("therapist_id", therapistId)
    .maybeSingle();
  return (data?.version as number | undefined) ?? 0;
}

/** Effective availability for one date, computed the way the app computes it:
 *  weekly template as the base, that date's exceptions winning, leave
 *  beating both. Deliberately a second implementation here -- a regression
 *  check that agrees with the code by construction checks nothing. */
async function effectiveHours(
  admin: SupabaseClient,
  therapistId: string,
  dateKey: string
): Promise<number[]> {
  const { data: profile } = await admin
    .from("profiles")
    .select("on_leave")
    .eq("id", therapistId)
    .single();
  if (profile?.on_leave) return [];

  const dayOfWeek = new Date(`${dateKey}T00:00:00Z`).getUTCDay();
  const base = new Set(await templateHours(admin, therapistId, dayOfWeek));
  for (const row of await exceptionRows(admin, therapistId, dateKey)) {
    if (row.available) base.add(row.hour as number);
    else base.delete(row.hour as number);
  }
  return [...base].sort((a, b) => a - b);
}

function futureDateKey(offsetDays: number): string {
  const at = new Date();
  at.setUTCDate(at.getUTCDate() + offsetDays);
  return at.toISOString().slice(0, 10);
}

async function post(path: string, cookie: string, body: unknown) {
  return fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify(body),
  });
}

test.describe("Therapist roster — admin", () => {
  test("R-A01: the roster opens on therapists, not on an hourly grid", async ({ browser }) => {
    const context = await browser.newContext();
    await context.addCookies(await browserCookiesFor(QA_EMAILS.admin));
    const page = await context.newPage();
    await page.goto(`${BASE}/admin/dashboard?section=sessions&tab=roster`);

    await expect(page.getByRole("heading", { name: "Therapist roster" })).toBeVisible();
    // The old screen's tell: a date picker first, then a wall of buttons
    // labelled "6 AM – 7 AM" and so on, one per hour per therapist.
    await expect(page.getByRole("button", { name: "6 AM – 7 AM" })).toHaveCount(0);
    // ...and what replaced it: a therapist list with a filter over it.
    await expect(page.getByRole("group", { name: "Filter therapists" })).toBeVisible();
    await expect(page.getByRole("searchbox", { name: "Search therapists" })).toBeVisible();
    await context.close();
  });

  test("R-A02: a therapist's schedule opens with their timezone stated", async ({ browser }) => {
    const admin = adminClient();
    const therapistId = await profileIdFor(admin, QA_EMAILS.therapistA);
    const cookie = await cookieHeaderFor(QA_EMAILS.admin);
    await post(WEEKLY, cookie, {
      therapistId,
      days: days({ 1: [{ startHour: 9, endHour: 18 }] }),
    });

    const context = await browser.newContext();
    await context.addCookies(await browserCookiesFor(QA_EMAILS.admin));
    const page = await context.newPage();
    await page.goto(`${BASE}/admin/dashboard?section=sessions&tab=roster`);
    await expect(page.getByText(/Schedule timezone:/).first()).toBeVisible();
    await context.close();
  });

  test("R-A03/R-A04: hours save as ranges and land as the same hour rows", async () => {
    const admin = adminClient();
    const therapistId = await profileIdFor(admin, QA_EMAILS.therapistA);
    const cookie = await cookieHeaderFor(QA_EMAILS.admin);

    const wide = await post(WEEKLY, cookie, {
      therapistId,
      days: days({ 1: [{ startHour: 9, endHour: 18 }] }),
    });
    expect(wide.status).toBe(200);
    expect(await templateHours(admin, therapistId, 1)).toEqual([
      9, 10, 11, 12, 13, 14, 15, 16, 17,
    ]);

    const narrowed = await post(WEEKLY, cookie, {
      therapistId,
      days: days({ 1: [{ startHour: 10, endHour: 16 }] }),
      expectedVersion: await scheduleVersion(admin, therapistId),
    });
    expect(narrowed.status).toBe(200);
    expect(await templateHours(admin, therapistId, 1)).toEqual([10, 11, 12, 13, 14, 15]);

    // Two working periods with a gap between them.
    const split = await post(WEEKLY, cookie, {
      therapistId,
      days: days({
        1: [
          { startHour: 9, endHour: 13 },
          { startHour: 14, endHour: 18 },
        ],
      }),
      expectedVersion: await scheduleVersion(admin, therapistId),
    });
    expect(split.status).toBe(200);
    expect(await templateHours(admin, therapistId, 1)).toEqual([
      9, 10, 11, 12, 14, 15, 16, 17,
    ]);
  });

  test("R-A05/R-A06: copying a day, and turning one off, leave the others alone", async () => {
    const admin = adminClient();
    const therapistId = await profileIdFor(admin, QA_EMAILS.therapistA);
    const cookie = await cookieHeaderFor(QA_EMAILS.admin);

    const monday: Range[] = [{ startHour: 9, endHour: 13 }];
    await post(WEEKLY, cookie, {
      therapistId,
      days: days({ 1: monday, 2: monday, 3: [{ startHour: 9, endHour: 11 }] }),
    });
    expect(await templateHours(admin, therapistId, 2)).toEqual([9, 10, 11, 12]);

    // Wednesday off; Monday and Tuesday untouched.
    await post(WEEKLY, cookie, {
      therapistId,
      days: days({ 1: monday, 2: monday }),
      expectedVersion: await scheduleVersion(admin, therapistId),
    });
    expect(await templateHours(admin, therapistId, 3)).toEqual([]);
    expect(await templateHours(admin, therapistId, 1)).toEqual([9, 10, 11, 12]);
    expect(await templateHours(admin, therapistId, 2)).toEqual([9, 10, 11, 12]);
  });

  test("R-A07/R-A08/R-A09: an exception owns its date and nothing else", async () => {
    const admin = adminClient();
    const therapistId = await profileIdFor(admin, QA_EMAILS.therapistA);
    const cookie = await cookieHeaderFor(QA_EMAILS.admin);

    // A Monday, and the Monday after it.
    const target = mondayOnOrAfter(futureDateKey(7));
    const nextWeek = new Date(Date.parse(`${target}T00:00:00Z`) + 7 * 86_400_000)
      .toISOString()
      .slice(0, 10);

    await post(WEEKLY, cookie, {
      therapistId,
      days: days({ 1: [{ startHour: 9, endHour: 18 }] }),
    });

    // Custom hours for one date only.
    const custom = await post(EXCEPTION, cookie, {
      therapistId,
      date: target,
      mode: "custom_hours",
      ranges: [{ startHour: 10, endHour: 14 }],
    });
    expect(custom.status).toBe(200);
    expect(await effectiveHours(admin, therapistId, target)).toEqual([10, 11, 12, 13]);
    expect(await effectiveHours(admin, therapistId, nextWeek)).toEqual([
      9, 10, 11, 12, 13, 14, 15, 16, 17,
    ]);
    // The weekly schedule itself is untouched.
    expect(await templateHours(admin, therapistId, 1)).toEqual([
      9, 10, 11, 12, 13, 14, 15, 16, 17,
    ]);

    // Unavailable all day.
    const closed = await post(EXCEPTION, cookie, {
      therapistId,
      date: target,
      mode: "unavailable",
    });
    expect(closed.status).toBe(200);
    expect(await effectiveHours(admin, therapistId, target)).toEqual([]);

    // Removed -- the date goes back to the weekly schedule.
    const cleared = await post(EXCEPTION, cookie, { therapistId, date: target, mode: "clear" });
    expect(cleared.status).toBe(200);
    expect(await exceptionRows(admin, therapistId, target)).toEqual([]);
    expect(await effectiveHours(admin, therapistId, target)).toEqual([
      9, 10, 11, 12, 13, 14, 15, 16, 17,
    ]);
  });

  test("R-A10/R-A11: leave hides everything and gives it all back", async () => {
    const admin = adminClient();
    const therapistId = await profileIdFor(admin, QA_EMAILS.therapistA);
    const cookie = await cookieHeaderFor(QA_EMAILS.admin);

    await post(WEEKLY, cookie, {
      therapistId,
      days: days({ 1: [{ startHour: 9, endHour: 13 }] }),
    });
    const monday = mondayOnOrAfter(futureDateKey(1));
    const before = await effectiveHours(admin, therapistId, monday);
    expect(before.length).toBeGreaterThan(0);

    try {
      const on = await post(LEAVE, cookie, {
        therapistId,
        onLeave: true,
        from: futureDateKey(1),
        to: futureDateKey(8),
        reason: "Annual leave",
      });
      expect(on.status).toBe(200);
      expect(await effectiveHours(admin, therapistId, monday)).toEqual([]);
      // The schedule underneath is untouched -- this is the whole point.
      expect(await templateHours(admin, therapistId, 1)).toEqual([9, 10, 11, 12]);
    } finally {
      const off = await post(LEAVE, cookie, { therapistId, onLeave: false });
      expect(off.status).toBe(200);
    }
    expect(await effectiveHours(admin, therapistId, monday)).toEqual(before);
  });
});

test.describe("Therapist roster — the therapist's own screen", () => {
  test("R-T01/R-T02/R-T03/R-T04: a therapist edits only their own week", async () => {
    const admin = adminClient();
    const therapistId = await profileIdFor(admin, QA_EMAILS.therapistA);
    const cookie = await cookieHeaderFor(QA_EMAILS.therapistA);

    const saved = await post(THERAPIST_WEEKLY, cookie, {
      days: days({
        1: [
          { startHour: 9, endHour: 13 },
          { startHour: 14, endHour: 18 },
        ],
        3: [],
      }),
    });
    expect(saved.status).toBe(200);
    expect(await templateHours(admin, therapistId, 1)).toEqual([
      9, 10, 11, 12, 14, 15, 16, 17,
    ]);
    expect(await templateHours(admin, therapistId, 3)).toEqual([]);
  });

  test("R-T05: the therapist's screen shows their own hours and timezone", async ({ browser }) => {
    const context = await browser.newContext();
    await context.addCookies(await browserCookiesFor(QA_EMAILS.therapistA));
    const page = await context.newPage();
    await page.goto(`${BASE}/therapist/dashboard/availability`);
    await expect(page.getByRole("heading", { name: "Your schedule" })).toBeVisible();
    await expect(page.getByText(/Schedule timezone:/)).toBeVisible();
    await expect(page.getByRole("switch", { name: "Monday working" })).toBeVisible();
    // No eighteen-cell grid anywhere on the therapist's screen either.
    await expect(page.getByRole("button", { name: "6 AM – 7 AM" })).toHaveCount(0);
    await context.close();
  });

  test("R-T06: a therapist cannot touch another therapist's schedule", async () => {
    const admin = adminClient();
    const otherId = await profileIdFor(admin, QA_EMAILS.therapistB);
    const before = await templateHours(admin, otherId, 1);
    const cookie = await cookieHeaderFor(QA_EMAILS.therapistA);

    // The therapist route takes no therapist id at all, so the only way to
    // aim at somebody else is the admin route.
    const viaAdminRoute = await post(WEEKLY, cookie, {
      therapistId: otherId,
      days: days({ 1: [{ startHour: 6, endHour: 23 }] }),
    });
    expect(viaAdminRoute.status).toBe(403);

    const viaOwnRoute = await post(THERAPIST_WEEKLY, cookie, {
      therapistId: otherId,
      days: days({ 1: [{ startHour: 6, endHour: 23 }] }),
    });
    expect(viaOwnRoute.status).toBe(200);
    // ...and it wrote the caller's own schedule, not the id they sent.
    expect(await templateHours(admin, otherId, 1)).toEqual(before);
  });
});

test.describe("Therapist roster — security", () => {
  test("R-S01: every roster route refuses the wrong caller", async () => {
    const admin = adminClient();
    const therapistId = await profileIdFor(admin, QA_EMAILS.therapistA);
    const body = { therapistId, days: days({ 1: [{ startHour: 9, endHour: 10 }] }) };
    const exceptionBody = { therapistId, date: futureDateKey(3), mode: "unavailable" };

    const callers: [string, string | null][] = [
      ["signed out", null],
      ["patient", await cookieHeaderFor(QA_EMAILS.patientA)],
      ["hospital", await cookieHeaderFor(QA_EMAILS.hospital)],
      ["therapist", await cookieHeaderFor(QA_EMAILS.therapistA)],
    ];

    const leaks: string[] = [];
    for (const [who, cookie] of callers) {
      for (const [route, payload] of [
        [WEEKLY, body],
        [EXCEPTION, exceptionBody],
        [LEAVE, { therapistId, onLeave: true }],
      ] as const) {
        const res = await fetch(`${BASE}${route}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(cookie ? { Cookie: cookie } : {}),
          },
          body: JSON.stringify(payload),
        });
        if (res.status !== 403) leaks.push(`${who} got ${res.status} from ${route}`);
      }
    }
    expect(leaks, leaks.join("\n")).toEqual([]);

    // The patient route probe above must not have left leave switched on.
    const { data } = await admin.from("profiles").select("on_leave").eq("id", therapistId).single();
    expect(data?.on_leave).toBe(false);
  });

  test("R-S02: malformed input is refused, not stored", async () => {
    const admin = adminClient();
    const therapistId = await profileIdFor(admin, QA_EMAILS.therapistA);
    const cookie = await cookieHeaderFor(QA_EMAILS.admin);
    await post(WEEKLY, cookie, {
      therapistId,
      days: days({ 1: [{ startHour: 9, endHour: 13 }] }),
    });
    const baseline = await templateHours(admin, therapistId, 1);

    const rejections: [string, unknown, string][] = [
      ["end before start", { therapistId, days: days({ 1: [{ startHour: 13, endHour: 9 }] }) }, WEEKLY],
      [
        "overlapping periods",
        {
          therapistId,
          days: days({
            1: [
              { startHour: 9, endHour: 13 },
              { startHour: 12, endHour: 15 },
            ],
          }),
        },
        WEEKLY,
      ],
      [
        "duplicate periods",
        {
          therapistId,
          days: days({
            1: [
              { startHour: 9, endHour: 13 },
              { startHour: 9, endHour: 13 },
            ],
          }),
        },
        WEEKLY,
      ],
      [
        "hours outside the day",
        { therapistId, days: days({ 1: [{ startHour: 2, endHour: 5 }] }) },
        WEEKLY,
      ],
      [
        "invalid day",
        { therapistId, days: [{ day_of_week: 9, ranges: [] }] },
        WEEKLY,
      ],
      [
        "unknown therapist",
        {
          therapistId: "00000000-0000-0000-0000-000000000000",
          days: days({ 1: [] }),
        },
        WEEKLY,
      ],
      ["malformed date", { therapistId, date: "07-09-2026", mode: "unavailable" }, EXCEPTION],
      ["impossible date", { therapistId, date: "2026-02-31", mode: "unavailable" }, EXCEPTION],
      ["unknown mode", { therapistId, date: futureDateKey(3), mode: "maybe" }, EXCEPTION],
      [
        "custom hours with none given",
        { therapistId, date: futureDateKey(3), mode: "custom_hours", ranges: [] },
        EXCEPTION,
      ],
      [
        "leave ending before it starts",
        { therapistId, onLeave: true, from: futureDateKey(8), to: futureDateKey(1) },
        LEAVE,
      ],
    ];

    const accepted: string[] = [];
    for (const [name, payload, route] of rejections) {
      const res = await post(route, cookie, payload);
      if (res.ok) accepted.push(name);
    }
    expect(accepted, `accepted: ${accepted.join(", ")}`).toEqual([]);
    // Nothing above changed the stored schedule.
    expect(await templateHours(admin, therapistId, 1)).toEqual(baseline);
  });
});

test.describe("Therapist roster — concurrency", () => {
  test("R-C01/R-C03: two identical saves land as one change", async () => {
    const admin = adminClient();
    const therapistId = await profileIdFor(admin, QA_EMAILS.therapistA);
    const cookie = await cookieHeaderFor(QA_EMAILS.admin);

    await post(WEEKLY, cookie, {
      therapistId,
      days: days({ 1: [{ startHour: 9, endHour: 13 }] }),
    });
    const version = await scheduleVersion(admin, therapistId);
    const payload = {
      therapistId,
      days: days({ 1: [{ startHour: 10, endHour: 16 }] }),
      expectedVersion: version,
    };

    // A double-clicked Save: two identical requests carrying the same
    // expected version, in flight together.
    const [first, second] = await Promise.all([
      post(WEEKLY, cookie, payload),
      post(WEEKLY, cookie, payload),
    ]);
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(await templateHours(admin, therapistId, 1)).toEqual([10, 11, 12, 13, 14, 15]);
    // Exactly one logical change: the version moved once, not twice.
    expect(await scheduleVersion(admin, therapistId)).toBe(version + 1);
  });

  test("R-C02: a stale save is refused rather than silently winning", async () => {
    const admin = adminClient();
    const therapistId = await profileIdFor(admin, QA_EMAILS.therapistA);
    const cookie = await cookieHeaderFor(QA_EMAILS.admin);

    await post(WEEKLY, cookie, {
      therapistId,
      days: days({ 1: [{ startHour: 9, endHour: 13 }] }),
    });
    const staleVersion = await scheduleVersion(admin, therapistId);

    // Somebody else saves first.
    const winner = await post(WEEKLY, cookie, {
      therapistId,
      days: days({ 1: [{ startHour: 14, endHour: 18 }] }),
      expectedVersion: staleVersion,
    });
    expect(winner.status).toBe(200);

    // The tab that loaded before that tries to save something different.
    const loser = await post(WEEKLY, cookie, {
      therapistId,
      days: days({ 1: [{ startHour: 6, endHour: 9 }] }),
      expectedVersion: staleVersion,
    });
    expect(loser.status).toBe(409);
    expect(await templateHours(admin, therapistId, 1)).toEqual([14, 15, 16, 17]);
  });

  test("R-C04: two exception writes for one date leave one coherent day", async () => {
    const admin = adminClient();
    const therapistId = await profileIdFor(admin, QA_EMAILS.therapistA);
    const cookie = await cookieHeaderFor(QA_EMAILS.admin);
    const date = futureDateKey(5);

    const [a, b] = await Promise.all([
      post(EXCEPTION, cookie, {
        therapistId,
        date,
        mode: "custom_hours",
        ranges: [{ startHour: 10, endHour: 14 }],
      }),
      post(EXCEPTION, cookie, {
        therapistId,
        date,
        mode: "custom_hours",
        ranges: [{ startHour: 10, endHour: 14 }],
      }),
    ]);
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);

    const rows = await exceptionRows(admin, therapistId, date);
    // One row per hour of the business day, never two for the same hour.
    expect(rows.length).toBe(18);
    expect(new Set(rows.map((r) => r.hour)).size).toBe(18);
    expect(await effectiveHours(admin, therapistId, date)).toEqual([10, 11, 12, 13]);

    await post(EXCEPTION, cookie, { therapistId, date, mode: "clear" });
  });
});

test.describe("Therapist roster — booking is untouched", () => {
  test("R-B01: changing hours never changes an appointment", async () => {
    const admin = adminClient();
    const therapistId = await profileIdFor(admin, QA_EMAILS.therapistA);
    const patientId = await profileIdFor(admin, QA_EMAILS.patientA);
    const cookie = await cookieHeaderFor(QA_EMAILS.admin);

    // A confirmed session inside hours we are about to take away.
    const slot = new Date(Date.now() + 6 * 86_400_000);
    slot.setUTCHours(5, 30, 0, 0); // 11:00 IST
    const { data: created } = await admin
      .from("appointments")
      .insert({
        patient_id: patientId,
        therapist_id: therapistId,
        slot_time: slot.toISOString(),
        status: "confirmed",
        concern: "QA roster regression",
        visit_mode: "online",
      })
      .select("id, slot_time, status, therapist_id")
      .single();

    try {
      await post(WEEKLY, cookie, {
        therapistId,
        days: days({ 1: [{ startHour: 9, endHour: 18 }] }),
      });
      await post(WEEKLY, cookie, {
        therapistId,
        days: days({ 1: [{ startHour: 15, endHour: 18 }] }),
        expectedVersion: await scheduleVersion(admin, therapistId),
      });

      const { data: after } = await admin
        .from("appointments")
        .select("id, slot_time, status, therapist_id")
        .eq("id", created!.id)
        .single();
      expect(after).toEqual(created);

      // Same for an exception closing the date, and for leave.
      const dateKey = slot.toISOString().slice(0, 10);
      await post(EXCEPTION, cookie, { therapistId, date: dateKey, mode: "unavailable" });
      await post(LEAVE, cookie, { therapistId, onLeave: true });
      const { data: afterAll } = await admin
        .from("appointments")
        .select("id, slot_time, status, therapist_id")
        .eq("id", created!.id)
        .single();
      expect(afterAll).toEqual(created);

      await post(LEAVE, cookie, { therapistId, onLeave: false });
      await post(EXCEPTION, cookie, { therapistId, date: dateKey, mode: "clear" });
    } finally {
      await admin.from("appointments").delete().eq("id", created!.id);
    }
  });

  test("R-B02: the booking page offers the same times it always did", async ({ browser }) => {
    // Availability is a planning tool in this app -- the booking picker is
    // driven by the lead-time rule, not by the roster (see
    // src/lib/bookingSlots.ts and the schema comment on
    // therapist_availability_template). This test is the guard on that: the
    // redesign must not have quietly wired the two together in either
    // direction, since doing so would change who is bookable on a deploy
    // rather than on somebody's decision.
    const admin = adminClient();
    const therapistId = await profileIdFor(admin, QA_EMAILS.therapistA);
    const cookie = await cookieHeaderFor(QA_EMAILS.admin);

    const context = await browser.newContext();
    await context.addCookies(await browserCookiesFor(QA_EMAILS.patientA));
    const page = await context.newPage();

    await post(WEEKLY, cookie, {
      therapistId,
      days: days({ 1: [{ startHour: 9, endHour: 18 }] }),
    });
    await page.goto(`${BASE}/book`);
    const times = page.getByRole("radiogroup", { name: "Preferred time" }).getByRole("radio");
    const before = await times.count();
    expect(before).toBeGreaterThan(0);

    // Wipe this therapist's roster entirely and put them on leave, then ask
    // the patient's picker again.
    await post(WEEKLY, cookie, { therapistId, days: days({}) });
    await post(LEAVE, cookie, { therapistId, onLeave: true });
    await page.reload();
    const after = await times.count();
    await post(LEAVE, cookie, { therapistId, onLeave: false });

    expect(after).toBe(before);
    await context.close();
  });
});

function mondayOnOrAfter(dateKey: string): string {
  let at = Date.parse(`${dateKey}T00:00:00Z`);
  while (new Date(at).getUTCDay() !== 1) at += 86_400_000;
  return new Date(at).toISOString().slice(0, 10);
}
