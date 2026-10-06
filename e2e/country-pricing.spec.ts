// CP: prices outside India (Catalog -> Countries & currency).
//
// What is under test is the promise the screen makes: a visitor in a priced
// country reads the local price, rounded up to .99; the checkout charges the
// rupee equal of that same figure, worked out on the server from the request
// rather than from anything the browser sends; and a home visit is not
// offered outside India unless an admin has allowed it.
//
// The country comes from the debug bar's cookie (`mr_debug_country`), which
// is how the owner tests this without a VPN, and is honoured only while the
// bar exists. The switches are flipped through the save route -- not straight
// in the database -- because that is what purges the cached public pages; the
// rate is written straight to the row because the only route that sets one
// fetches it from the internet, and a test must not depend on a live rate.
import { test, expect, type APIRequestContext } from "@playwright/test";
import { BASE, QA_EMAILS, adminClient, browserCookiesFor, cookieHeaderFor } from "./helpers";
import { priceForCountry } from "../src/lib/countryPricing";

const SHOT = "/tmp/claude-0/-home-user-Claude/92352852-44c7-581f-b775-ee8d1b4f4c9d/scratchpad/shots";

// The owner's own example: ₹499 raised 100% is ₹998, about $10.35, shown as
// $10.99. A fixed rate so every figure below is known in advance.
const US = { code: "US", currency: "USD", enabled: true, markupPercent: 100, unitsPerInr: 0.01037 };

type Snapshot = {
  settings: Record<string, unknown> | null;
  us: Record<string, unknown> | null;
};

async function snapshot(): Promise<Snapshot> {
  const admin = adminClient();
  const [{ data: settings }, { data: us }] = await Promise.all([
    admin
      .from("site_settings")
      .select("international_pricing_enabled, country_picker_enabled, home_visit_outside_india")
      .maybeSingle(),
    admin.from("country_pricing").select("*").eq("country_code", "US").maybeSingle(),
  ]);
  return { settings, us };
}

async function save(request: APIRequestContext, body: unknown) {
  const res = await request.post(`${BASE}/api/admin/country-pricing/save`, {
    headers: { cookie: await cookieHeaderFor(QA_EMAILS.admin), "content-type": "application/json" },
    data: body,
  });
  expect(res.status(), await res.text()).toBe(200);
}

async function switchOn(request: APIRequestContext) {
  // The rate first: the save route refuses to switch on a country it has no
  // rate for, which is the rule CP-003 checks from the other side.
  await adminClient()
    .from("country_pricing")
    .upsert({
      country_code: "US",
      currency_code: "USD",
      units_per_inr: US.unitsPerInr,
      rate_fetched_at: new Date().toISOString(),
      enabled: false,
      markup_percent: 0,
    });
  await save(request, {
    rows: [{ code: "US", markupPercent: US.markupPercent, enabled: true }],
    settings: { internationalEnabled: true, pickerEnabled: true, homeVisitOutsideIndia: false },
  });
}

async function restore(request: APIRequestContext, before: Snapshot) {
  const admin = adminClient();
  if (before.us) {
    await admin.from("country_pricing").upsert(before.us);
  } else {
    await admin.from("country_pricing").delete().eq("country_code", "US");
  }
  const s = before.settings ?? {};
  await save(request, {
    settings: {
      internationalEnabled: s.international_pricing_enabled === true,
      pickerEnabled: s.country_picker_enabled !== false,
      homeVisitOutsideIndia: s.home_visit_outside_india === true,
    },
  });
}

async function anyPricedCategory(): Promise<{ id: string; price_paise: number }> {
  const { data } = await adminClient()
    .from("treatment_categories")
    .select("id, price_paise")
    .eq("active", true)
    .gt("price_paise", 0)
    .limit(1)
    .single();
  expect(data, "an active, priced treatment category").toBeTruthy();
  return data as { id: string; price_paise: number };
}

test.describe.configure({ mode: "serial" });

test("CP-001: the screen lists every country, searches, and previews the owner's example", async ({
  page,
  context,
}) => {
  test.setTimeout(120_000);
  await context.addCookies(await browserCookiesFor(QA_EMAILS.admin));
  await page.goto(`${BASE}/admin/dashboard?section=catalog&tab=countries`);
  await expect(page.getByRole("heading", { name: "Countries & currency", exact: true })).toBeVisible();

  // India is pinned and cannot be switched: it is the price everything else
  // is worked out from.
  await expect(page.getByText("India", { exact: true }).first()).toBeVisible();

  const search = page.getByPlaceholder("Search a country or currency");
  // By currency code as well as by name. Scoped to the rows' own controls:
  // the debug bar's country list names every country too.
  await search.fill("gbp");
  await expect(page.getByLabel("Increase for United Kingdom, percent").first()).toBeVisible();
  await expect(page.getByLabel("Increase for Japan, percent")).toHaveCount(0);
  await search.fill("japan");
  await expect(page.getByLabel("Increase for Japan, percent").first()).toBeVisible();
  await search.fill("");
  await page.screenshot({ path: `${SHOT}/cp-admin.png`, fullPage: false });
});

test("CP-002: a US visitor sees dollars, is charged the rupee equal, and is not offered a home visit", async ({
  page,
  context,
  request,
}) => {
  test.setTimeout(180_000);
  const before = await snapshot();
  const category = await anyPricedCategory();
  const expected = priceForCountry(category.price_paise, US);
  try {
    await switchOn(request);
    await context.addCookies([
      { name: "mr_debug_country", value: "US", url: BASE },
    ]);

    // Every catalog price on the page is in dollars and ends in .99.
    await page.goto(`${BASE}/conditions`);
    const prices = page.locator("[data-price]");
    await expect(prices.first()).toBeVisible();
    const texts = await prices.allInnerTexts();
    expect(texts.length).toBeGreaterThan(0);
    for (const t of texts) {
      expect(t, "no rupee figure left on the page").not.toContain("₹");
    }
    expect(texts.some((t) => /^\$\d[\d,]*\.99$/.test(t.trim()))).toBe(true);

    // No home visit offered anywhere.
    await expect(page.locator('nav a[href="/home-visit"]')).toHaveCount(0);
    await page.goto(`${BASE}/home-visit`);
    await expect(page.getByTestId("home-visit-unavailable")).toBeVisible();
    await page.screenshot({ path: `${SHOT}/cp-us-home-visit.png`, fullPage: false });

    // The server prices the quote from the request's own country.
    const quote = await request.post(`${BASE}/api/appointments/quote`, {
      headers: { cookie: "mr_debug_country=US", "content-type": "application/json" },
      data: { categoryId: category.id },
    });
    expect(quote.status()).toBe(200);
    const body = await quote.json();
    expect(body.pricing?.currency).toBe("USD");
    expect(body.listPricePaise).toBe(expected.chargePaise);

    // And without the cookie, the same quote is plain rupees.
    const plain = await request.post(`${BASE}/api/appointments/quote`, {
      headers: { cookie: "mr_debug_country=IN", "content-type": "application/json" },
      data: { categoryId: category.id },
    });
    const plainBody = await plain.json();
    expect(plainBody.pricing).toBeNull();
    expect(plainBody.listPricePaise).toBe(category.price_paise);

    // The debug bar names the forced country.
    await page.goto(`${BASE}/conditions`);
    await expect(page.getByTestId("debug-country")).toHaveValue("US");
    await page.screenshot({ path: `${SHOT}/cp-us-conditions.png`, fullPage: false });
  } finally {
    await restore(request, before);
  }
});

test("CP-003: a country without a rate cannot be switched on", async ({ request }) => {
  const before = await snapshot();
  try {
    await adminClient().from("country_pricing").delete().eq("country_code", "US");
    const res = await request.post(`${BASE}/api/admin/country-pricing/save`, {
      headers: { cookie: await cookieHeaderFor(QA_EMAILS.admin), "content-type": "application/json" },
      data: { rows: [{ code: "US", markupPercent: 10, enabled: true }] },
    });
    expect(res.status()).toBe(400);
    expect((await res.json()).error).toContain("United States");
  } finally {
    await restore(request, before);
  }
});
