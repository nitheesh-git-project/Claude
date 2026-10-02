// The footer's social icons (Settings -> Brand & Contact -> Social Media
// Links) and the footer links that leave the site opening in a new tab.
//
// SOC-001 drives the save route, because the rule worth guarding is what it
// refuses: a link on the wrong network, or one that is not https -- the
// value becomes an `href` on every public page. SOC-002 writes the columns
// straight to the database and reads the rendered footer, so it also proves
// a blank column draws nothing and that the footer re-checks what it reads.
//
// Every column this touches is put back in afterAll, whatever the outcome.
import { test, expect, request, type APIRequestContext } from "@playwright/test";
import { BASE, QA_EMAILS, adminClient, cookieHeaderFor } from "./helpers";

const db = adminClient();
const COLUMNS = [
  "social_instagram_url",
  "social_facebook_url",
  "social_linkedin_url",
  "social_youtube_url",
  "social_whatsapp_url",
  "whatsapp_number",
] as const;

let original: Record<string, string | null> = {};
let adminApi: APIRequestContext;

async function writeSettings(values: Record<string, string | null>) {
  const { error } = await db.from("site_settings").update(values).eq("id", true);
  if (error) throw new Error(`could not write site_settings: ${error.message}`);
}

async function readSetting(column: string) {
  const { data } = await db.from("site_settings").select(column).eq("id", true).single();
  return (data as unknown as Record<string, string | null>)[column];
}

async function save(key: string, value: string | null) {
  return adminApi.post(`${BASE}/api/admin/update-setting`, { data: { key, value } });
}

test.beforeAll(async () => {
  const { data, error } = await db.from("site_settings").select(COLUMNS.join(", ")).eq("id", true).single();
  if (error) throw new Error(`site_settings has no social columns yet - apply schema.sql: ${error.message}`);
  original = data as unknown as Record<string, string | null>;
  adminApi = await request.newContext({
    extraHTTPHeaders: { Cookie: await cookieHeaderFor(QA_EMAILS.admin) },
  });
});

test.afterAll(async () => {
  await writeSettings(original);
  await adminApi?.dispose();
});

test("SOC-001: the save route keeps only https links on the right network", async () => {
  await writeSettings({ social_instagram_url: null, social_facebook_url: null, social_youtube_url: null });

  // A bare address is how a profile link gets copied; it is stored cleaned.
  const bare = await save("social_instagram_url", "instagram.com/moverestore");
  expect(bare.status()).toBe(200);
  expect(await readSetting("social_instagram_url")).toBe("https://instagram.com/moverestore");

  // Pasted into the wrong box.
  const wrong = await save("social_facebook_url", "https://www.youtube.com/@moverestore");
  expect(wrong.status()).toBe(400);
  expect((await wrong.json()).error).toMatch(/isn't on Facebook/);
  expect(await readSetting("social_facebook_url")).toBeNull();

  // Would run in a visitor's browser as an href.
  const script = await save("social_youtube_url", "javascript:alert(1)");
  expect(script.status()).toBe(400);
  expect(await readSetting("social_youtube_url")).toBeNull();

  // Blank is the undo: it clears the column, which hides the icon.
  const cleared = await save("social_instagram_url", "");
  expect(cleared.status()).toBe(200);
  expect(await readSetting("social_instagram_url")).toBeNull();

  // And only an admin with the settings scope may write at all.
  const anon = await request.newContext();
  const refused = await anon.post(`${BASE}/api/admin/update-setting`, {
    data: { key: "social_instagram_url", value: "https://instagram.com/x" },
  });
  expect(refused.status()).toBe(403);
  await anon.dispose();
});

test("SOC-002: the footer draws only the filled-in links, and each opens in a new tab", async ({ page }) => {
  await writeSettings({
    social_instagram_url: "https://www.instagram.com/moverestore",
    social_facebook_url: null,
    social_linkedin_url: null,
    social_youtube_url: "https://www.youtube.com/@moverestore",
    social_whatsapp_url: null,
    whatsapp_number: "+91 98765 43210",
  });

  await page.goto(`${BASE}/`);
  const footer = page.locator("footer");
  const row = footer.getByRole("list", { name: /on social media/i });
  await expect(row).toBeVisible();
  const icons = row.getByRole("link");
  await expect(icons).toHaveCount(2);

  const instagram = row.getByRole("link", { name: "Instagram (opens in a new tab)" });
  await expect(instagram).toHaveAttribute("href", "https://www.instagram.com/moverestore");
  await expect(instagram).toHaveAttribute("target", "_blank");
  await expect(instagram).toHaveAttribute("rel", /noopener/);
  await expect(row.getByRole("link", { name: /YouTube/ })).toHaveAttribute("target", "_blank");
  await expect(row.getByRole("link", { name: /Facebook|LinkedIn|WhatsApp/ })).toHaveCount(0);

  // The contact number used to replace the page with wa.me.
  const whatsapp = footer.getByRole("link", { name: "Chat on WhatsApp (opens in a new tab)" });
  await expect(whatsapp).toHaveAttribute("href", "https://wa.me/919876543210");
  await expect(whatsapp).toHaveAttribute("target", "_blank");
  await expect(whatsapp).toHaveAttribute("rel", /noopener/);
  // Email and phone hand off to an app, so they stay in the same tab.
  await expect(footer.locator('a[href^="tel:"]')).not.toHaveAttribute("target", "_blank");

  // A real click leaves the site in a new tab and this one where it was.
  const [popup] = await Promise.all([
    page.context().waitForEvent("page"),
    instagram.click({ modifiers: [] }),
  ]);
  expect(popup).toBeTruthy();
  expect(page.url()).toBe(`${BASE}/`);
  await popup.close();
});

test("SOC-003: no links filled in draws no row at all", async ({ page }) => {
  await writeSettings({
    social_instagram_url: null,
    social_facebook_url: null,
    social_linkedin_url: null,
    social_youtube_url: null,
    social_whatsapp_url: null,
  });
  await page.goto(`${BASE}/`);
  await expect(page.locator("footer")).toBeVisible();
  await expect(page.locator("footer").getByRole("list", { name: /on social media/i })).toHaveCount(0);
});
