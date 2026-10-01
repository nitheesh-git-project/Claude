// Suite TR-READY -- approved is not ready, and the page says which.
//
// `profiles.approved` means a person vetted the account, and the product read
// it as "ready to be assigned live patients". A therapist could be approved
// with no hours on the roster and no revenue share, and both of those fail
// *silently*: nothing can offer them a session, and a session they do deliver
// leaves them owed nothing with no screen saying why.
//
// `src/lib/therapistReadiness.ts` holds the judgement and is unit-tested,
// including every item that must NOT block an assignment. What needs a
// browser is what a person reads: that the panel names why each thing matters
// rather than that a field is required, that it disappears completely when
// there is nothing to say, and -- the load-bearing half -- that it blocks
// nothing.
import { test, expect } from "@playwright/test";
import { adminClient, browserCookiesFor, profileIdFor, QA_EMAILS, BASE } from "./helpers";

test.describe("Suite TR-READY: therapist readiness", () => {
  let therapistId = "";
  let restore: { share: number | null; specialization: string | null } | null = null;

  test.beforeAll(async () => {
    const admin = adminClient();
    therapistId = await profileIdFor(admin, QA_EMAILS.therapistA);
    const { data } = await admin
      .from("profiles")
      .select("revenue_share_percent, specialization")
      .eq("id", therapistId)
      .single();
    restore = {
      share: (data?.revenue_share_percent as number | null) ?? null,
      specialization: (data?.specialization as string | null) ?? null,
    };
  });

  // Put the fixture back exactly as it was: this is a seeded account other
  // specs read, and leaving it half-configured would make them fail on a
  // working product.
  test.afterAll(async () => {
    // Roster rows first, and unconditionally: a test that fails before its
    // own tidy-up would otherwise leave hours on a seeded therapist and
    // make the next run assert against a different account.
    await adminClient()
      .from("therapist_availability_template")
      .delete()
      .eq("therapist_id", therapistId);
    if (!restore) return;
    await adminClient()
      .from("profiles")
      .update({
        revenue_share_percent: restore.share,
        specialization: restore.specialization,
      })
      .eq("id", therapistId);
  });

  async function setUp(fields: { revenue_share_percent?: number | null; specialization?: string | null }) {
    const { error } = await adminClient().from("profiles").update(fields).eq("id", therapistId);
    expect(error).toBeNull();
  }

  // Rosters are deliberately not seeded -- a fixture that arrived already
  // correct would make the test that creates one pass without running -- so
  // "ready" has to build its own hours and take them away again.
  async function setRoster(hours: number[]) {
    const admin = adminClient();
    await admin.from("therapist_availability_template").delete().eq("therapist_id", therapistId);
    if (hours.length === 0) return;
    await admin.from("therapist_availability_template").insert(
      hours.map((hour) => ({ therapist_id: therapistId, day_of_week: 1, hour }))
    );
  }

  test("TRR-001: a missing revenue share is named, with the reason it matters", async ({
    page,
    context,
  }) => {
    await setUp({ revenue_share_percent: null, specialization: "Orthopaedic" });
    await context.addCookies(await browserCookiesFor(QA_EMAILS.admin));
    await page.goto(`${BASE}/admin/dashboard/therapists/${therapistId}`);

    const panel = page.getByRole("region", { name: "Not ready for patients yet" });
    await expect(panel).toBeVisible();
    await expect(panel).toContainText("Revenue share set");
    // The reason, not the rule. A checklist that only says a field is
    // required is one people tick to make it go away.
    await expect(panel).toContainText("owed");
    await expect(panel).not.toContainText("is required");
  });

  // The rule this shares with an unrefunded session's missing refund chip:
  // a green "all set" card on every profile is a row a reader learns to
  // scroll past, and then misses the one profile that is not.
  test("TRR-002: a ready therapist gets no panel at all", async ({ page, context }) => {
    await setUp({ revenue_share_percent: 60, specialization: "Orthopaedic" });
    await setRoster([9, 10, 11]);
    await context.addCookies(await browserCookiesFor(QA_EMAILS.admin));
    await page.goto(`${BASE}/admin/dashboard/therapists/${therapistId}`);

    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
    await expect(
      page.getByRole("region", { name: "Not ready for patients yet" })
    ).toHaveCount(0);
    await setRoster([]);
  });

  // The load-bearing half. An admin assigning has the therapist in front of
  // them and may have every reason to go ahead; a gate on a field nobody was
  // told about is worse than the state it replaces.
  test("TRR-003: it blocks nothing - every control still works", async ({ page, context }) => {
    await setUp({ revenue_share_percent: null, specialization: null });
    await context.addCookies(await browserCookiesFor(QA_EMAILS.admin));
    await page.goto(`${BASE}/admin/dashboard/therapists/${therapistId}`);

    await expect(page.getByRole("region", { name: "Not ready for patients yet" })).toBeVisible();

    // The panel itself offers nothing to click: it is a sentence, not a
    // gate, so it cannot be the thing that stops somebody.
    const panel = page.getByRole("region", { name: "Not ready for patients yet" });
    await expect(panel.getByRole("button")).toHaveCount(0);

    // And it carries no form control either -- it cannot be the thing
    // somebody has to satisfy before the page will let them act, which is
    // the whole difference between a reminder and a gate.
    await expect(panel.locator("input, select, textarea")).toHaveCount(0);
  });

  test("TRR-004: it names each missing thing separately, not as one lump", async ({
    page,
    context,
  }) => {
    await setUp({ revenue_share_percent: null, specialization: null });
    await context.addCookies(await browserCookiesFor(QA_EMAILS.admin));
    await page.goto(`${BASE}/admin/dashboard/therapists/${therapistId}`);

    // One row per missing thing, each naming itself. The seeded therapist
    // has no roster either -- rosters are deliberately not seeded -- so the
    // count is what it is rather than a number this test asserts blind.
    const panel = page.getByRole("region", { name: "Not ready for patients yet" });
    const rows = panel.getByRole("listitem");
    expect(await rows.count()).toBeGreaterThanOrEqual(2);
    await expect(panel).toContainText("Revenue share set");
    await expect(panel).toContainText("Specialisation recorded");
    await expect(panel).toContainText("Working hours on the roster");
  });
});
