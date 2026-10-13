// Suite UP -- a purchase nobody has booked anything against.
//
// The one state where the clinic has taken a decision from a patient and
// delivered nothing at all. Everything that pointed at it pointed at the
// *patient* -- the balance on their Programmes screen, an unbooked-sessions
// item pinned to their own dashboard -- which is exactly the person who has
// already stopped. Nobody at the clinic could see it to ring them.
//
// `src/lib/unscheduledPurchases.ts` holds the judgement and is unit-tested,
// including every row that must NOT be counted. What needs a browser is the
// other half: that tapping the count lands on a screen filtered to the rows
// it counted, with the screen's other filters cleared -- the rule this
// dashboard follows everywhere and the one nothing but a rendered page can
// check.
import { test, expect } from "@playwright/test";
import {
  adminClient,
  browserCookiesFor,
  countAcrossPages,
  pageUntilVisible,
  profileIdFor,
  QA_EMAILS,
  BASE,
} from "./helpers";

const MARKER = "e2e-unscheduled-purchase";
const DAY = 86_400_000;

test.describe("Suite UP: purchases with nothing booked", () => {
  const purchaseIds: string[] = [];
  // The IDs are what the list prints, so they are what the assertions can
  // tell the two fixtures apart by -- the patient's name is the same on
  // both, which is exactly the confusion a code exists to remove.
  const codes: Record<"stale" | "fresh", string> = { stale: "", fresh: "" };

  test.beforeAll(async () => {
    const admin = adminClient();
    const patientId = await profileIdFor(admin, QA_EMAILS.patientA);

    // Any package will do, so an existing one is used; with none (a fresh
    // database) the suite makes its own rather than skipping. A skip that
    // depends on what happens to be lying around is a suite that silently
    // never runs on a clean stack.
    let { data: pkg } = await admin
      .from("treatment_category_packages")
      .select("id, category_id, session_count, price_paise")
      .limit(1)
      .maybeSingle();
    if (!pkg) {
      const { data: category, error: categoryError } = await admin
        .from("treatment_categories")
        .insert({ title: "QA Unscheduled Condition", points: [], price_paise: 120000, duration_minutes: 60, active: true })
        .select("id")
        .single();
      expect(categoryError, `seeding a category: ${categoryError?.message}`).toBeNull();
      const { data: created, error: packageError } = await admin
        .from("treatment_category_packages")
        .insert({ category_id: category!.id, title: "QA Unscheduled Programme", session_count: 4, price_paise: 400000, active: true })
        .select("id, category_id, session_count, price_paise")
        .single();
      expect(packageError, `seeding a package: ${packageError?.message}`).toBeNull();
      pkg = created;
    }

    // Two days old with nothing booked -- the row that must be found -- and
    // one bought an hour ago, which must not be: a purchase on its way to
    // the scheduler is the normal case, and a row that fires every time
    // anybody buys anything is a row nobody reads.
    for (const [label, agoMs] of [
      ["stale", 2 * DAY],
      ["fresh", 3_600_000],
    ] as const) {
      const { data, error } = await admin
        .from("patient_package_purchases")
        .insert({
          patient_id: patientId,
          package_id: pkg!.id,
          category_id: pkg!.category_id,
          session_count: pkg!.session_count,
          amount_paid_paise: pkg!.price_paise,
          payment_status: "paid",
          status: "active",
          notes: `${MARKER}-${label}`,
          created_at: new Date(Date.now() - agoMs).toISOString(),
        })
        .select("id, purchase_code")
        .single();
      if (error) throw new Error(`could not create the ${label} fixture: ${error.message}`);
      purchaseIds.push(data.id);
      // The programme ID (PED_PKG001) is what the list prints; the old code
      // stands in on a database without it.
      const { data: withId } = await admin
        .from("patient_package_purchases")
        .select("programme_code")
        .eq("id", data.id)
        .maybeSingle();
      codes[label] = (withId as { programme_code?: string | null } | null)?.programme_code ?? data.purchase_code ?? "";
    }
  });

  // Deleted rather than left: unlike a refund attempt, nothing here is
  // append-only, and a fixture purchase left behind is a permanent row on a
  // real admin's call list -- the exact failure `npm run clean:e2e` exists
  // to stop this suite producing.
  test.afterAll(async () => {
    const admin = adminClient();
    if (purchaseIds.length > 0) {
      await admin.from("patient_package_purchases").delete().in("id", purchaseIds);
    }
  });

  // Purchases are listed on Programmes -> All Programmes now (Catalog ->
  // Purchases is gone), under the "Paid - nothing booked" stage. The Money
  // alert's preset narrows that stage to the day-old ones it counts.
  test("UP-001: the count opens exactly the rows it counted", async ({ page, context }) => {
    test.setTimeout(90_000);
    await context.addCookies(await browserCookiesFor(QA_EMAILS.admin));

    // Straight to the preset the alert row links to, which is what the tap
    // produces -- the link itself is an `AdminScreenLink`, covered by
    // navigation-feedback.spec.ts.
    await page.goto(`${BASE}/admin/dashboard?section=programmes&tab=all&view=unscheduled`);

    const stage = page.getByRole("button", { name: /Paid - nothing booked/ }).filter({ visible: true }).first();
    await expect(stage).toHaveAttribute("aria-pressed", "true", { timeout: 60_000 });
    // The age half of the preset is said on screen, and removable.
    await expect(page.getByRole("button", { name: /Paid over 24 hours ago/ }).filter({ visible: true })).toBeVisible();
    // The other filters are cleared on arrival, or a remembered condition
    // would hide rows the count included.
    await expect(page.getByRole("searchbox", { name: "Search programmes" }).filter({ visible: true })).toHaveValue("");

    // The two-day-old purchase is listed and the hour-old one is not. The
    // second half is the one worth pinning: a filter that simply showed
    // everything would pass the first assertion on its own.
    test.skip(!codes.stale || !codes.fresh, "this database does not stamp purchase codes");
    // Across every page: the QA patients carry other specs' purchases, so
    // the list runs past one page and the stale row can sit on page two.
    const stale = page.getByText(codes.stale, { exact: false }).filter({ visible: true });
    expect(
      await pageUntilVisible(page, "programmes", stale, { timeout: 20_000 }),
      `${codes.stale} on any page of the list`
    ).toBe(true);
    expect(
      await countAcrossPages(page, "programmes", page.getByText(codes.fresh, { exact: false }).filter({ visible: true }))
    ).toBe(0);
  });

  test("UP-002: the age is a filter, and removing it shows the fresh purchase too", async ({
    page,
    context,
  }) => {
    test.setTimeout(90_000);
    await context.addCookies(await browserCookiesFor(QA_EMAILS.admin));
    await page.goto(`${BASE}/admin/dashboard?section=programmes&tab=all&view=unscheduled`);

    const age = page.getByRole("button", { name: /Paid over 24 hours ago/ }).filter({ visible: true });
    await expect(age).toBeVisible({ timeout: 60_000 });
    await age.click();
    await expect(age).toHaveCount(0);
    // Still on the stage: both fixtures have nothing booked.
    const stage = page.getByRole("button", { name: /Paid - nothing booked/ }).filter({ visible: true }).first();
    await expect(stage).toHaveAttribute("aria-pressed", "true");
    test.skip(!codes.fresh, "this database does not stamp purchase codes");
    expect(
      await pageUntilVisible(page, "programmes", page.getByText(codes.fresh, { exact: false }).filter({ visible: true }), {
        timeout: 20_000,
      })
    ).toBe(true);
  });

  // The stage is a toggle: tapping it again clears it, and the URL follows,
  // so a filtered list is always a link to itself.
  test("UP-003: the stage toggles, and the URL keeps the filter", async ({ page, context }) => {
    test.setTimeout(90_000);
    await context.addCookies(await browserCookiesFor(QA_EMAILS.admin));
    await page.goto(`${BASE}/admin/dashboard?section=programmes&tab=all`);

    const stage = page.getByRole("button", { name: /Paid - nothing booked/ }).filter({ visible: true }).first();
    await expect(stage).toHaveAttribute("aria-pressed", "false", { timeout: 60_000 });
    await stage.click();
    await expect(stage).toHaveAttribute("aria-pressed", "true");
    await expect.poll(() => new URL(page.url()).searchParams.get("pg_stage")).toBe("paid_unbooked");
    await stage.click();
    await expect(stage).toHaveAttribute("aria-pressed", "false");
    await expect.poll(() => new URL(page.url()).searchParams.get("pg_stage")).toBeNull();
  });
});
